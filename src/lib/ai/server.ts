import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { decryptApiKey } from "./crypto";
import { VisionError } from "./gemini";

export function aiAdmin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new VisionError("서버의 AI 설정이 필요합니다", 503);
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
export function encryptionSecret() {
  const secret = process.env.GEMINI_KEY_ENCRYPTION_SECRET;
  if (
    !secret ||
    Buffer.from(secret, "base64").length !== 32 ||
    Buffer.from(secret, "base64").toString("base64") !== secret
  ) {
    throw new VisionError("서버의 키 암호화 설정이 필요합니다", 503);
  }
  return secret;
}
export function localGeminiKey() {
  // Never share the developer's key with deployed users, including preview deployments.
  return process.env.NODE_ENV === "development" && !process.env.VERCEL
    ? process.env.GEMINI_API_KEY
    : undefined;
}
export async function userGeminiKey(userId: string) {
  const { data, error } = await aiAdmin()
    .from("user_gemini_keys")
    .select("encrypted_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new VisionError("Gemini 키 설정을 불러오지 못했습니다", 503);
  if (data) {
    const secret = encryptionSecret();
    try {
      return decryptApiKey(data.encrypted_key, userId, secret);
    } catch {
      throw new VisionError(
        "저장된 Gemini 키를 사용할 수 없습니다. 설정에서 다시 등록해주세요",
        503,
      );
    }
  }
  const local = localGeminiKey();
  if (local) return local;
  throw new VisionError("설정에서 Gemini API 키를 먼저 등록해주세요", 422);
}
export async function consumeQuota(
  userId: string,
  scope: "analysis" | "key-write",
) {
  const { data, error } = await aiAdmin().rpc("consume_ai_quota", {
    p_user_id: userId,
    p_scope: scope,
  });
  if (error)
    throw new VisionError(
      "사용량을 확인하지 못했습니다. 잠시 후 다시 시도해주세요",
      503,
    );
  if (!data)
    throw new VisionError(
      "시간당 30회 한도에 도달했습니다. 다음 시간에 다시 시도해주세요",
      429,
    );
}
