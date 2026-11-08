import { z } from "zod";
import { assertSameOrigin, errorResponse, privateJson, readJson } from "@/lib/ai/http";
import { VisionError } from "@/lib/ai/gemini";
import { confirmChange } from "@/lib/storage/service";
export async function POST(request: Request,{ params }: { params: Promise<{id:string}> }) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new VisionError("작업을 확인해주세요",400);
    const action = await confirmChange(id,await readJson(request,2048));
    return privateJson({ action, receipt: action.receipt });
  } catch(error) { return errorResponse(error); }
}
