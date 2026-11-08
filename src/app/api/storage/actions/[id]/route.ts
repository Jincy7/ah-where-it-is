import { z } from "zod";
import { errorResponse, privateJson } from "@/lib/ai/http";
import { VisionError } from "@/lib/ai/gemini";
import { getActionStatus } from "@/lib/storage/service";
export async function GET(_request: Request,{ params }: { params: Promise<{id:string}> }) {
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new VisionError("작업을 확인해주세요",400);
    return privateJson({ action: await getActionStatus(id) });
  } catch(error) { return errorResponse(error); }
}
