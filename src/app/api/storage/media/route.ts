import { assertSameOrigin, errorResponse, privateJson } from "@/lib/ai/http";
import { cleanupMedia, uploadMedia } from "@/lib/storage/media";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { assertSameOrigin(request); return privateJson({ media: await uploadMedia(request) }); }
  catch(error) { return errorResponse(error); }
}
export async function DELETE(request: Request) {
  try { assertSameOrigin(request); return privateJson(await cleanupMedia()); }
  catch(error) { return errorResponse(error); }
}
