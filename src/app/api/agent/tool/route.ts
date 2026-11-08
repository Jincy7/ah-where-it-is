import { contextSchema, toolCallSchema } from '@/lib/agent/contracts';
import { agentAccess } from '@/lib/agent/server';
import { executeStorageTool } from '@/lib/agent/tools';
import { assertSameOrigin, errorResponse, privateJson, readJson } from '@/lib/ai/http';
import { VisionError } from '@/lib/ai/gemini';

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    await agentAccess('tool');
    const parsed=toolCallSchema.safeParse(await readJson(request,512_000));
    if(!parsed.success) throw new VisionError('허용되지 않은 도구 요청입니다',400);
    const result=await executeStorageTool(parsed.data.name,parsed.data.arguments,parsed.data.context??contextSchema.parse({}));
    return privateJson({name:parsed.data.name,result});
  } catch(error) {return errorResponse(error);}
}
