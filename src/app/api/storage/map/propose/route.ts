import { assertSameOrigin, errorResponse, privateJson, readJson } from '@/lib/ai/http';
import { proposeStorageMap } from '@/lib/storage/map-proposal-service';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return privateJson({ proposal: await proposeStorageMap(await readJson(request, 512 * 1024)) });
  } catch (error) { return errorResponse(error); }
}
