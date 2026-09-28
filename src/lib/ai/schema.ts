import { z } from "zod";

export const MAX_PHOTOS = 10;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
export const itemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "물품명을 입력해주세요")
    .max(100, "물품명은 100자 이내로 입력해주세요"),
  quantity: z
    .number()
    .int("수량은 정수로 입력해주세요")
    .min(1, "수량을 확인하고 1 이상 입력해주세요")
    .max(9999),
  description: z.string().max(1000).optional(),
});
export const bulkRequestSchema = z.object({
  container_id: z.string().uuid(),
  request_id: z.string().uuid().optional(),
  items: z.array(itemSchema).min(1).max(100),
});
export const analysisSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        quantity: z.number().int().min(1).max(9999).nullable(),
        description: z.string().max(1000),
        uncertainty: z.string().max(300),
      }),
    )
    .max(30),
});
export type ItemDraft = z.infer<typeof analysisSchema>["items"][number];
