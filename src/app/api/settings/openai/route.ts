import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { aiAdmin, consumeQuota, encryptionSecret } from "@/lib/ai/server";
import { encryptApiKey } from "@/lib/ai/crypto";
import { canImportLocalOpenAIKey } from "@/lib/ai/local-credential";
import { apiKeySchema } from "@/lib/ai/providers";
import { validateOpenAIKey } from "@/lib/ai/openai";
import { VisionError } from "@/lib/ai/gemini";
import { assertSameOrigin, errorResponse, privateJson, readJson } from "@/lib/ai/http";

export const runtime = "nodejs";

async function currentUser() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) throw new VisionError("로그인이 필요합니다", 401);
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const { data, error } = await aiAdmin().from("user_ai_credentials")
      .select("updated_at").eq("user_id", user.id).eq("provider", "openai").maybeSingle();
    if (error) throw new VisionError("키 설정을 불러오지 못했습니다", 503);
    return privateJson({ configured: !!data, updatedAt: data?.updated_at ?? null,
      localImportAvailable: canImportLocalOpenAIKey(process.env, request.url) });
  } catch (error) { return errorResponse(error); }
}

async function save(userId: string, apiKey: string) {
  const secret = encryptionSecret();
  await consumeQuota(userId, "key-write");
  await validateOpenAIKey(apiKey);
  const updatedAt = new Date().toISOString();
  const { error } = await aiAdmin().from("user_ai_credentials").upsert({
    user_id: userId, provider: "openai", encrypted_key: encryptApiKey(apiKey, userId, secret, "openai"),
    updated_at: updatedAt,
  });
  if (error) throw new VisionError("키를 저장하지 못했습니다", 503);
  return { configured: true, updatedAt };
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser();
    const parsed = apiKeySchema.safeParse(await readJson(request, 1024));
    if (!parsed.success) throw new VisionError("올바른 OpenAI API 키를 입력해주세요", 400);
    return privateJson(await save(user.id, parsed.data.apiKey));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!canImportLocalOpenAIKey(process.env, request.url))
      throw new VisionError("개발용 키 가져오기는 로컬 개발 환경에서만 가능합니다", 403);
    const parsed = z.object({ useLocalKey: z.literal(true) }).strict().safeParse(await readJson(request, 128));
    if (!parsed.success) throw new VisionError("개발용 키 가져오기를 확인해주세요", 400);
    return privateJson(await save(user.id, process.env.OPENAI_API_KEY!));
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser();
    const { error } = await aiAdmin().from("user_ai_credentials").delete()
      .eq("user_id", user.id).eq("provider", "openai");
    if (error) throw new VisionError("키를 삭제하지 못했습니다", 503);
    return privateJson({ configured: false, updatedAt: null,
      localImportAvailable: canImportLocalOpenAIKey(process.env, request.url) });
  } catch (error) { return errorResponse(error); }
}
