import { z } from 'zod';
import { createHash } from 'node:crypto';
import { contextSchema } from '@/lib/agent/contracts';
import { realtimeSession } from '@/lib/agent/realtime';
import { agentAccess } from '@/lib/agent/server';
import { assertSameOrigin, errorResponse, readJson } from '@/lib/ai/http';
import { VisionError } from '@/lib/ai/gemini';

const offerSchema=z.object({sdp:z.string().min(10).max(60_000),context:contextSchema}).strict();
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const {user,key}=await agentAccess('realtime');
    const parsed=offerSchema.safeParse(await readJson(request,512_000));
    if(!parsed.success||!parsed.data.sdp.startsWith('v=0')) throw new VisionError('음성 연결 정보를 확인해주세요',400);
    const form=new FormData();
    form.set('sdp',parsed.data.sdp);
    form.set('session',JSON.stringify(realtimeSession(parsed.data.context)));
    let response:Response;
    try {
      response=await fetch('https://api.openai.com/v1/realtime/calls',{
        method:'POST',headers:{Authorization:`Bearer ${key}`,'OpenAI-Safety-Identifier':createHash('sha256').update(user.id).digest('hex')},
        body:form,signal:AbortSignal.timeout(30_000),cache:'no-store',
      });
    } catch {throw new VisionError('음성 연결 시간이 초과되었습니다. 다시 시도해주세요',504);}
    if(!response.ok) throw new VisionError(response.status===429?'OpenAI 음성 사용 한도를 초과했습니다':'음성을 연결하지 못했습니다. OpenAI 키와 음성 모델 접근 권한을 확인해주세요',response.status===429?429:502);
    return new Response(await response.text(),{headers:{'Content-Type':'application/sdp','Cache-Control':'no-store, private'}});
  } catch(error) {return errorResponse(error);}
}
