import { agentInstructions, agentTools, type AgentContext } from './contracts';

export function realtimeSession(context:AgentContext) {
  return {
    type:'realtime',model:process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
    instructions:agentInstructions(context),
    tools:agentTools.map(({type,name,description,parameters})=>({type,name,description,parameters})),tool_choice:'auto',max_output_tokens:1000,
    audio:{input:{transcription:{model:'gpt-4o-mini-transcribe',language:'ko'},turn_detection:{type:'server_vad',create_response:true,interrupt_response:true}},output:{voice:'marin'}},
  };
}
