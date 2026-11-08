import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { userOpenAIKey, consumeQuota } from '@/lib/ai/server';
import { VisionError } from '@/lib/ai/gemini';

export async function agentAccess(scope:'chat'|'realtime'|'tool') {
  const supabase=await createClient();
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user) throw new VisionError('로그인이 필요합니다',401);
  await consumeQuota(user.id,scope);
  return {user,key:scope==='tool'?null:await userOpenAIKey(user.id)};
}
export async function requestResponse(key:string, body:Record<string,unknown>) {
  let response:Response;
  try {
    response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(20000),cache:'no-store',
    });
  } catch {throw new VisionError('OpenAI 응답 시간이 초과되었거나 연결하지 못했습니다',504);}
  if(!response.ok) throw new VisionError(response.status===429?'OpenAI 사용 한도를 초과했습니다':
    [401,403,404].includes(response.status)?'설정에서 OpenAI 키와 모델 접근 권한을 확인해주세요':'OpenAI 요청을 처리하지 못했습니다',response.status===429?429:502);
  return response.json();
}
