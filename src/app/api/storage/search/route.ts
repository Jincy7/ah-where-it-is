import { z } from "zod";
import { errorResponse, privateJson } from "@/lib/ai/http";
import { VisionError } from "@/lib/ai/gemini";
import { searchItems } from "@/lib/storage/service";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const containerId = params.get("container_id") ?? undefined;
    if (containerId && !z.string().uuid().safeParse(containerId).success) throw new VisionError("보관함을 확인해주세요",400);
    return privateJson({ items: await searchItems(params.get("q") ?? "",containerId) });
  } catch(error) { return errorResponse(error); }
}
