import { createClient } from "@/lib/supabase/server";
import { bulkRequestSchema } from "@/lib/ai/schema";
import { VisionError } from "@/lib/ai/gemini";
import {
  assertSameOrigin,
  errorResponse,
  privateJson,
  readJson,
} from "@/lib/ai/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new VisionError("로그인이 필요합니다", 401);
    const parsed = bulkRequestSchema.safeParse(
      await readJson(request, 512 * 1024),
    );
    if (!parsed.success)
      throw new VisionError(
        "물품명과 수량(1~9999)을 확인해주세요. 한 번에 최대 100개 항목을 등록할 수 있습니다",
        400,
      );
    const { items, container_id, request_id } = parsed.data;
    const { data, error } = await supabase.rpc("register_items_once", {
      p_request_id: request_id ?? crypto.randomUUID(),
      p_container_id: container_id,
      p_items: items,
    });
    if (error) {
      if (error.code === "23505")
        throw new VisionError(
          "이미 처리된 등록 요청입니다. 목록에서 등록 결과를 확인해주세요",
          409,
        );
      if (error.code === "42501")
        throw new VisionError("보관함에 접근할 수 없습니다", 404);
      throw new VisionError(
        "물품을 등록하지 못했습니다. 다시 시도해주세요",
        503,
      );
    }
    const createdItems = Array.isArray(data) ? data : [];
    return privateJson({ items: createdItems, count: createdItems.length });
  } catch (error) {
    return errorResponse(error);
  }
}
