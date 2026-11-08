import { z } from "zod";
import { assertSameOrigin, errorResponse, privateJson, readJson } from "@/lib/ai/http";
import { VisionError } from "@/lib/ai/gemini";
import { cancelChange } from "@/lib/storage/service";
import { cancellationSchema } from "@/lib/storage/schema";
export async function POST(request: Request,{ params }: { params: Promise<{id:string}> }) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const input = cancellationSchema.safeParse(await readJson(request,2048));
    if (!z.string().uuid().safeParse(id).success || !input.success) throw new VisionError("작업을 확인해주세요",400);
    return privateJson({ action: await cancelChange(id,input.data.revision) });
  } catch(error) { return errorResponse(error); }
}
