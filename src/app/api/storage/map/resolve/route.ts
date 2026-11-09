import { errorResponse, privateJson } from '@/lib/ai/http';
import { VisionError } from '@/lib/ai/gemini';
import { resolveStorageMap } from '@/lib/storage/map-service';
import { storageMapTargetSchema } from '@/lib/storage/map-schema';
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const target = storageMapTargetSchema.safeParse({ kind: params.get('kind'), id: params.get('id') });
    if (!target.success) throw new VisionError('지도에서 찾을 대상을 확인해주세요', 400);
    return privateJson(await resolveStorageMap(target.data));
  } catch (error) { return errorResponse(error); }
}
