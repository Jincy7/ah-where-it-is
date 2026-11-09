import { VisionError } from '@/lib/ai/gemini';
import { openAIChatModel } from '@/lib/ai/models';
import { advanceAgentContext, modelToolResult, agentInstructions, agentTools, toolCallSchema, type AgentReply, type ChatRequest, type ToolName } from './contracts';
import { displayToolEvents } from './container-lookup';

type ModelResponse = {status?:string;output?:Array<Record<string,unknown>>};
type Dependencies = {
  request:(body:Record<string,unknown>)=>Promise<ModelResponse>;
  execute:(name:ToolName,args:Record<string,unknown>)=>Promise<unknown>;
};

export async function runConversation(input:ChatRequest, deps:Dependencies):Promise<AgentReply> {
  const history:unknown[] = [...input.history.map(m=>({role:m.role,content:m.content})),{role:'user',content:input.message}];
  const events:AgentReply['events']=[];
  for(let round=0;round<5;round++) {
    let response:ModelResponse;
    try {response=await deps.request({
      model:openAIChatModel(),
      store:false,instructions:agentInstructions(input.context),input:[...history],
      tools:agentTools,parallel_tool_calls:false,max_output_tokens:2500,
    });} catch(error) {
      if(events.length)return {message:'답변을 마치지 못했지만 확인한 결과와 변경안은 아래에 남겼습니다. 내용을 확인해주세요.',events:displayToolEvents(events)};
      throw error;
    }
    if((response.status!=='completed'||!Array.isArray(response.output))&&events.length)return {message:'답변을 마치지 못했지만 아래 결과와 변경안을 확인할 수 있습니다.',events:displayToolEvents(events)};
    if(response.status!=='completed'||!Array.isArray(response.output)) throw new Error('AI 응답을 완료하지 못했습니다. 다시 요청해주세요');
    const calls=response.output.filter(o=>o.type==='function_call');
    if(calls.length>4) throw new Error('AI 요청이 너무 복잡합니다. 작업을 나눠주세요');
    history.push(...response.output);
    if(!calls.length) {
      const text=response.output.filter(o=>o.type==='message').flatMap(o=>Array.isArray(o.content)?o.content:[])
        .filter((part:Record<string,unknown>)=>part.type==='output_text'&&typeof part.text==='string').map((part:Record<string,unknown>)=>part.text).join('\n');
      return {message:text||'아래 결과와 변경 내용을 확인해주세요.',events:displayToolEvents(events)};
    }
    for(const call of calls) {
      try {
        if(typeof call.arguments!=='string'||call.arguments.length>20000||typeof call.call_id!=='string') throw new Error('invalid call');
        const parsed=toolCallSchema.parse({name:call.name,arguments:JSON.parse(call.arguments)});
        const result=await deps.execute(parsed.name,parsed.arguments);
        events.push({name:parsed.name,result});
        Object.assign(input.context, advanceAgentContext(input.context, result));
        history.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(modelToolResult(result))});
      } catch(error) {
        // Never let a model reinterpret a failed read as absence, or claim a failed write succeeded.
        return {message:error instanceof VisionError?error.message:'요청한 기록을 조회하거나 변경안을 준비하지 못했습니다. 현재 내용을 확인하고 다시 시도해주세요.',events:displayToolEvents(events)};
      }
    }
  }
  return {message:'여기까지 확인한 결과를 표시했습니다. 다음 작업을 구체적으로 요청해주세요.',events:displayToolEvents(events)};
}
