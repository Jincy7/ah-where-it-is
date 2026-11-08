import { chatRequestSchema } from '@/lib/agent/contracts';
import { runConversation } from '@/lib/agent/conversation';
import { agentAccess, requestResponse } from '@/lib/agent/server';
import { executeStorageTool } from '@/lib/agent/tools';
import { assertSameOrigin, errorResponse, privateJson, readJson } from '@/lib/ai/http';
import { VisionError } from '@/lib/ai/gemini';

export const maxDuration=120;
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const {key}=await agentAccess('chat');
    const parsed=chatRequestSchema.safeParse(await readJson(request,512_000));
    if(!parsed.success) throw new VisionError('대화 내용을 확인해주세요',400);
    const reply=await runConversation(parsed.data,{
      request:body=>requestResponse(key!,body),
      execute:(name,args)=>executeStorageTool(name,args,parsed.data.context),
    });
    return privateJson(reply);
  } catch(error) {return errorResponse(error);}
}
