import { errorResponse, privateJson } from "@/lib/ai/http";
import { getWorkspace } from "@/lib/storage/service";
export async function GET() {
  try { return privateJson(await getWorkspace()); }
  catch(error) { return errorResponse(error); }
}
