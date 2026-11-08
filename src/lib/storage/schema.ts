import { z } from "zod";
import { itemSchema } from "@/lib/ai/schema";
export type { StorageAction, StorageItem, StorageContainer, StorageLocation, ChangeInput } from "./types";

const id = z.string().uuid();
const name = z.string().trim().min(1).max(100);
const description = z.string().max(1000).optional();
const containerFields = { name, location_id: id.nullable().optional(), cover_media_id: id.nullable().optional() };
const locationFields = { name, description };
export const actionPayloadSchemas = {
  register_items: z.object({ container_id: id, source_photo_id: id.optional(), items: z.array(itemSchema.extend({ media_ids: z.array(id).max(10).optional() })).min(1).max(100) }).strict(),
  update_item: z.object({ item_id: id, name, quantity: z.number().int().min(1).max(9999), description }).strict(),
  move_item: z.object({ item_id: id, container_id: id }).strict(),
  delete_item: z.object({ item_id: id }).strict(),
  create_container: z.object(containerFields).strict(),
  update_container: z.object({ container_id: id, ...containerFields }).strict(),
  delete_container: z.object({ container_id: id }).strict(),
  create_location: z.object(locationFields).strict(),
  update_location: z.object({ location_id: id, ...locationFields }).strict(),
  delete_location: z.object({ location_id: id }).strict(),
};
export const changeSchema = z.object({
  type: z.enum(["register_items", "update_item", "move_item", "delete_item", "create_container", "update_container", "delete_container", "create_location", "update_location", "delete_location"]),
  payload: z.record(z.unknown()),
  action_id: id.optional(),
  revision: z.number().int().positive().optional(),
  expected_versions: z.record(z.number().int().positive()).optional(),
}).strict().refine((x) => !!x.action_id === !!x.revision, "수정할 작업과 버전을 함께 입력해주세요");
export const confirmationSchema = z.object({ revision: z.number().int().positive(), payload_hash: z.string().regex(/^[a-f0-9]{64}$/), idempotency_key: id }).strict();
export const cancellationSchema = z.object({ revision: z.number().int().positive() }).strict();

/** Stable serialization makes retries and reordered object keys identify the same intent. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
