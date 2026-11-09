import { errorResponse, privateJson } from '@/lib/ai/http';
import { getStorageMap } from '@/lib/storage/map-service';
export async function GET() {
  try { return privateJson(await getStorageMap()); }
  catch (error) { return errorResponse(error); }
}
