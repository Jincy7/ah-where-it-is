import { assertSameOrigin, errorResponse, privateJson, readJson } from "@/lib/ai/http";
import { prepareChange } from "@/lib/storage/service";
export async function POST(request: Request) {
  try { assertSameOrigin(request); return privateJson({ action: await prepareChange(await readJson(request,512*1024)) }); }
  catch(error) { return errorResponse(error); }
}
