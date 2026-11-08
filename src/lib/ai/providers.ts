import { z } from "zod";

export const providerSchema = z.enum(["openai", "gemini"]);
export type AIProvider = z.infer<typeof providerSchema>;
export const AI_PROVIDERS = {
  openai: { label: "OpenAI", recipient: "OpenAI", keyUrl: "https://platform.openai.com/api-keys" },
  gemini: { label: "Gemini", recipient: "Google", keyUrl: "https://aistudio.google.com/apikey" },
} as const;

export const apiKeySchema = z.object({
  apiKey: z.string().trim().min(20, "API 키를 입력해주세요").max(512).regex(/^[!-~]+$/, "올바른 API 키를 입력해주세요"),
}).strict();
