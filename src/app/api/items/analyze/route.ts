import sharp from "sharp";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { consumeQuota, userProviderKey } from "@/lib/ai/server";
import { analyzeImage, VisionError } from "@/lib/ai/gemini";
import { analyzeOpenAIImage } from "@/lib/ai/openai";
import { providerSchema } from "@/lib/ai/providers";
import { MAX_IMAGE_BYTES } from "@/lib/ai/schema";
import {
  assertSameOrigin,
  errorResponse,
  privateJson,
  readLimitedBody,
} from "@/lib/ai/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new VisionError("로그인이 필요합니다", 401);
    const params = new URL(request.url).searchParams;
    const parsedProvider = providerSchema.safeParse(params.get("provider") ?? "gemini");
    if (!parsedProvider.success) throw new VisionError("분석 제공자를 선택해주세요", 400);
    const provider = parsedProvider.data;
    const containerId = params.get("container_id");
    if ((!containerId && provider === "gemini") || (containerId !== null && !z.string().uuid().safeParse(containerId).success))
      throw new VisionError("보관함을 선택해주세요", 400);
    if (containerId) {
      const { data: container, error } = await supabase
        .from("containers")
        .select("id")
        .eq("id", containerId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw new VisionError("보관함 정보를 불러오지 못했습니다", 503);
      if (!container) throw new VisionError("보관함을 찾을 수 없습니다", 404);
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        request.headers.get("content-type") ?? "",
      )
    )
      throw new VisionError("JPG, PNG, WebP 사진을 선택해주세요", 415);
    const bytes = await readLimitedBody(request, MAX_IMAGE_BYTES);
    let jpeg: Buffer;
    try {
      const image = sharp(bytes, {
        limitInputPixels: 20_000_000,
        failOn: "warning",
      });
      const metadata = await image.metadata();
      if (
        !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
        (metadata.pages ?? 1) !== 1
      )
        throw new Error("Unsupported image");
      jpeg = await image
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new VisionError(
        "사진을 읽지 못했습니다. JPG, PNG, WebP 사진으로 다시 선택해주세요",
        400,
      );
    }
    const key = await userProviderKey(user.id, provider);
    await consumeQuota(user.id, "analysis");
    const result = await (provider === "openai" ? analyzeOpenAIImage : analyzeImage)(key, jpeg);
    return privateJson(result);
  } catch (error) {
    return errorResponse(error);
  }
}
