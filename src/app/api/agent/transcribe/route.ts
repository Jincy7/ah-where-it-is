import { createClient } from '@/lib/supabase/server';
import { consumeQuota, userOpenAIKey } from '@/lib/ai/server';
import { VisionError } from '@/lib/ai/gemini';
import { assertSameOrigin, errorResponse, privateJson, readLimitedBody } from '@/lib/ai/http';
import { MAX_AUDIO_BYTES, transcribeAudio, transcriptionFormat, validateRecording } from '@/lib/ai/transcription';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new VisionError('로그인이 필요합니다', 401);
    const contentType = request.headers.get('content-type');
    transcriptionFormat(contentType);
    const audio = await readLimitedBody(request, MAX_AUDIO_BYTES);
    validateRecording(audio, contentType);
    const key = await userOpenAIKey(user.id);
    await consumeQuota(user.id, 'transcription');
    const result = await transcribeAudio(key, audio, contentType, fetch, request.signal);
    return privateJson(result);
  } catch (error) {
    return errorResponse(error);
  }
}
