import { createClient } from "@/lib/supabase/server";
import {
  aiAdmin,
  consumeQuota,
  encryptionSecret,
  localGeminiKey,
} from "@/lib/ai/server";
import { encryptApiKey } from "@/lib/ai/crypto";
import {
  assertSameOrigin,
  errorResponse,
  privateJson,
  readJson,
} from "@/lib/ai/http";
import { VisionError } from "@/lib/ai/gemini";
import { z } from "zod";

export const runtime = "nodejs";
async function currentUser() {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) throw new VisionError("로그인이 필요합니다", 401);
  return user;
}
export async function GET() {
  try {
    const user = await currentUser();
    const { data, error } = await aiAdmin()
      .from("user_gemini_keys")
      .select("updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new VisionError("키 설정을 불러오지 못했습니다", 503);
    return privateJson({
      configured: !!data,
      localFallback: !data && !!localGeminiKey(),
      updatedAt: data?.updated_at ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser();
    const parsed = z
      .object({
        apiKey: z
          .string()
          .trim()
          .min(20)
          .max(512)
          .regex(/^[!-~]+$/),
      })
      .safeParse(await readJson(request, 1024));
    if (!parsed.success)
      throw new VisionError("올바른 Gemini API 키를 입력해주세요", 400);
    const secret = encryptionSecret();
    await consumeQuota(user.id, "key-write");
    const encrypted = encryptApiKey(parsed.data.apiKey, user.id, secret);
    const { error } = await aiAdmin()
      .from("user_gemini_keys")
      .upsert({
        user_id: user.id,
        encrypted_key: encrypted,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new VisionError("키를 저장하지 못했습니다", 503);
    return privateJson({ configured: true });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser();
    const { error } = await aiAdmin()
      .from("user_gemini_keys")
      .delete()
      .eq("user_id", user.id);
    if (error) throw new VisionError("키를 삭제하지 못했습니다", 503);
    return privateJson({
      configured: false,
      localFallback: !!localGeminiKey(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
