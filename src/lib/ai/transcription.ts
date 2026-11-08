import { z } from 'zod';
import { VisionError } from './gemini';
import { openAIError } from './openai';

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_TRANSCRIPT_LENGTH = 2000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const transcriptionSchema = z.object({ text: z.string() });

type AudioFormat = { mime: string; extension: 'webm' | 'ogg' | 'mp4' };

export function transcriptionFormat(contentType: string | null): AudioFormat {
  const mime = contentType?.split(';', 1)[0].trim().toLowerCase();
  if (mime === 'audio/webm' || mime === 'video/webm') return { mime: 'audio/webm', extension: 'webm' };
  if (mime === 'audio/ogg' || mime === 'application/ogg') return { mime: 'audio/ogg', extension: 'ogg' };
  if (mime === 'audio/mp4' || mime === 'video/mp4') return { mime: 'audio/mp4', extension: 'mp4' };
  throw new VisionError('WebM, Ogg, MP4 형식으로 녹음해주세요', 415);
}

export function validateRecording(audio: Uint8Array, contentType: string | null) {
  const format = transcriptionFormat(contentType);
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new VisionError('녹음은 10MB 이하로 보내주세요', 413);
  if (!audio.byteLength) throw new VisionError('녹음된 내용이 없습니다. 다시 녹음해주세요', 400);
  const bytes = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);
  const valid = format.extension === 'webm' ? bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    : format.extension === 'ogg' ? bytes.subarray(0, 4).toString('ascii') === 'OggS'
      : bytes.byteLength >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
  if (!valid) throw new VisionError('녹음 파일을 읽지 못했습니다. 다시 녹음해주세요', 400);
  return format;
}

export function transcriptionModel() {
  return process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-transcribe';
}

async function readTranscriptionResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Response too large');
      }
      chunks.push(value);
    }
    return transcriptionSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } finally {
    reader.releaseLock();
  }
}

export async function transcribeAudio(
  apiKey: string,
  audio: Uint8Array,
  contentType: string | null,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  const format = validateRecording(audio, contentType);
  const form = new FormData();
  form.set('file', new Blob([Uint8Array.from(audio)], { type: format.mime }), `recording.${format.extension}`);
  form.set('model', transcriptionModel());
  form.set('response_format', 'json');
  let response: Response;
  try {
    response = await fetcher('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
    });
  } catch {
    throw new VisionError('음성을 글자로 바꾸지 못했습니다. 연결을 확인하고 다시 시도해주세요', 504);
  }
  if (!response.ok) throw openAIError(response.status);
  let result: z.infer<typeof transcriptionSchema>;
  try {
    result = await readTranscriptionResponse(response);
  } catch {
    throw new VisionError('음성 인식 결과를 읽지 못했습니다. 다시 녹음해주세요', 502);
  }
  const text = result.text.trim();
  if (!text) throw new VisionError('말소리를 인식하지 못했습니다. 다시 녹음해주세요', 422);
  if (text.length > MAX_TRANSCRIPT_LENGTH) throw new VisionError('인식한 내용이 2000자를 넘었습니다. 짧게 나누어 녹음해주세요', 422);
  return { text };
}
