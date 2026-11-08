import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { aiAdmin } from "@/lib/ai/server";
import { VisionError } from "@/lib/ai/gemini";
import type { Json } from "@/types/supabase";
import { actionPayloadSchemas, canonicalJson, changeSchema, confirmationSchema } from "./schema";
import type { ChangeInput, StorageAction, StorageContainer, StorageItem, StorageLocation, StorageLocationSummary, WorkspaceData } from "./types";
import { LOCATION_ITEM_LIMIT, locationContents, summarizeLocations } from "./location-lookup";

// PostgREST puts filters in the URL; 100 UUIDs stay below the gateway's 8 KiB limit.
const MEDIA_ID_BATCH_SIZE = 100;

export async function storageContext() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new VisionError("로그인이 필요합니다", 401);
  return { supabase, user };
}
function databaseError(error: { code?: string; message?: string } | null, fallback = "보관 기록을 불러오지 못했습니다") {
  if (!error) return;
  if (error.code === "PT409" || error.code === "40001" || error.code === "40P01" || error.code === "23505") throw new VisionError("기록이나 변경안이 달라졌습니다. 최신 내용으로 다시 확인해주세요", 409);
  if (error.code === "PT404" || error.code === "P0002" || error.code === "42501") throw new VisionError("접근할 수 없는 보관 기록입니다", 404);
  throw new VisionError(fallback, 503);
}

async function mediaUrls(ids: string[]) {
  const unique = [...new Set(ids)];
  const urls = new Map<string, string | null>();
  if (!unique.length) return urls;
  const { supabase, user } = await storageContext();
  for (let offset = 0; offset < unique.length; offset += MEDIA_ID_BATCH_SIZE) {
    const ids = unique.slice(offset, offset + MEDIA_ID_BATCH_SIZE);
    const { data, error } = await supabase.from("media_assets").select("id,path").eq("user_id", user.id).in("id", ids);
    databaseError(error);
    if (data?.length) {
      const signed = await supabase.storage.from("item-images").createSignedUrls(data.map((m) => m.path), 600);
      databaseError(signed.error);
      data.forEach((m, i) => urls.set(m.id, signed.data?.[i]?.signedUrl ?? null));
    }
  }
  return urls;
}

export async function listContainers(): Promise<StorageContainer[]> {
  const { supabase, user } = await storageContext();
  const [containers, locations, counts] = await Promise.all([
    supabase.from("containers").select("*", { count: "exact" }).eq("user_id", user.id).order("name").limit(1000),
    supabase.from("locations").select("id,name", { count: "exact" }).eq("user_id", user.id).limit(1000),
    supabase.from("containers").select("id,items(count)").eq("user_id", user.id),
  ]);
  databaseError(containers.error); databaseError(locations.error); databaseError(counts.error);
  assertCompleteHierarchy(containers); assertCompleteHierarchy(locations);
  const names = new Map(locations.data?.map((l) => [l.id, l.name]));
  const countMap = new Map((counts.data ?? []).map((c) => [c.id, c.items[0]?.count ?? 0]));
  const urls = await mediaUrls((containers.data ?? []).flatMap((c) => c.cover_media_id ? [c.cover_media_id] : []));
  return (containers.data ?? []).map((c) => ({ ...c, location_name: names.get(c.location_id ?? "") ?? null, item_count: countMap.get(c.id) ?? 0, cover_url: c.cover_media_id ? urls.get(c.cover_media_id) ?? null : c.internal_photo_url }));
}

function assertCompleteHierarchy(result: { data: unknown[] | null; count: number | null }) {
  if (result.count !== (result.data?.length ?? 0)) throw new VisionError("보관 장소와 보관함이 많아 전체 목록을 확인하지 못했습니다", 422);
}

async function locationHierarchy() {
  const { supabase, user } = await storageContext();
  const [locations, containers] = await Promise.all([
    supabase.from("locations").select("*", { count: "exact" }).eq("user_id", user.id).order("name").limit(1000),
    listContainers(),
  ]);
  databaseError(locations.error);
  assertCompleteHierarchy(locations);
  return { locations: summarizeLocations(locations.data ?? [], containers), containers };
}

export async function listLocations(): Promise<StorageLocationSummary[]> {
  return (await locationHierarchy()).locations;
}

export async function getLocation(locationId: string) {
  const { locations, containers } = await locationHierarchy();
  const location = locations.find(entry => entry.id === locationId);
  if (!location) throw new VisionError("장소를 찾을 수 없습니다", 404);
  const items = location.container_count ? await searchItems("", undefined, locationId) : [];
  return locationContents(location, containers, items);
}

// A quoted PostgREST literal preserves punctuation without letting it create filters.
export function searchLiteral(query: string) {
  return `"%${query.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/"/g, '\\"')}%"`;
}
export async function searchItems(query = "", containerId?: string, locationId?: string): Promise<StorageItem[]> {
  const { supabase } = await storageContext();
  if (query.length > 200) throw new VisionError("검색어는 200자 이내로 입력해주세요", 400);
  const containers = await listContainers();
  if (containerId && !containers.some((c) => c.id === containerId)) throw new VisionError("보관함을 찾을 수 없습니다", 404);
  // Embed links per item so neither a long ID filter nor a separate 1000-row
  // link query can drop photos. The empty parent embed only filters location.
  let request = supabase.from("items").select("*,item_media(media_id),containers!inner()").order("updated_at", { ascending: false }).limit(LOCATION_ITEM_LIMIT);
  if (containerId) request = request.eq("container_id", containerId);
  if (locationId) {
    const children = containers.filter(container => container.location_id === locationId);
    if (!children.length) return [];
    request = request.eq("containers.location_id", locationId);
  }
  const trimmed = query.trim();
  const tokens = [...new Set(trimmed.split(/\s+/).filter(Boolean))].slice(0,20);
  if (tokens.length) {
    const conditions = tokens.map((token) => { const pattern = searchLiteral(token); return `or(name.ilike.${pattern},description.ilike.${pattern})`; });
    request = request.or(`and(${conditions.join(",")})`);
  }
  const { data, error } = await request;
  databaseError(error, "검색에 실패했습니다. 다시 시도해주세요");
  const rows = data ?? [];
  const urls = await mediaUrls(rows.flatMap((item) => item.item_media.map((link) => link.media_id)));
  const containerMap = new Map(containers.map((c) => [c.id, c]));
  return rows.map(({ item_media: links, ...item }) => {
    const container = containerMap.get(item.container_id);
    return { ...item, container_name: container?.name ?? "보관함", location_name: container?.location_name ?? null, match_reason: trimmed ? (tokens.every((token) => item.name.toLocaleLowerCase().includes(token.toLocaleLowerCase())) ? `물품명에 ‘${tokens.join(" · ")}’ 포함` : `물품명·설명에 ‘${tokens.join(" · ")}’ 포함`) : "등록된 기록", media: links.map((link) => ({ id: link.media_id, url: urls.get(link.media_id) ?? null })) };
  });
}
export async function getContainer(containerId: string) {
  const container = (await listContainers()).find((c) => c.id === containerId);
  if (!container) throw new VisionError("보관함을 찾을 수 없습니다", 404);
  return { container, items: await searchItems("", containerId) };
}
export async function getWorkspace(): Promise<WorkspaceData> {
  const { supabase, user } = await storageContext();
  const [containers, items, locations] = await Promise.all([listContainers(), searchItems(), supabase.from("locations").select("*").eq("user_id", user.id).order("name")]);
  databaseError(locations.error);
  return { containers, items, locations: (locations.data ?? []) as StorageLocation[], truncated: containers.reduce((n,c) => n+c.item_count,0) > items.length };
}

function publicAction(row: unknown): StorageAction {
  const { action_id, revision, type, payload, payload_hash, expected_versions, idempotency_key, status, preview, receipt } = row as StorageAction;
  return { action_id, revision, type, payload, payload_hash, expected_versions, idempotency_key, status, preview, receipt };
}
export async function getActionStatus(actionId: string): Promise<StorageAction> {
  const { user } = await storageContext();
  const { data, error } = await aiAdmin().from("storage_actions").select("*").eq("action_id", actionId).eq("user_id", user.id).maybeSingle();
  databaseError(error);
  if (!data) throw new VisionError("변경안을 찾을 수 없습니다", 404);
  return publicAction(data);
}
export async function prepareChange(input: ChangeInput): Promise<StorageAction> {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) throw new VisionError("변경 요청을 확인해주세요", 400);
  const payloadResult = actionPayloadSchemas[parsed.data.type].safeParse(parsed.data.payload);
  if (!payloadResult.success) throw new VisionError("물품명, 수량과 변경 대상을 확인해주세요", 400);
  const { supabase, user } = await storageContext();
  const { type } = parsed.data;
  const payload = payloadResult.data as Record<string, unknown>;
  const expected: Record<string, number> = {};
  let before: Record<string, unknown> | null = null;
  const after: Record<string, unknown> | null = type.startsWith("delete_") ? null : { ...payload };
  let affected: { id: string; name: string; quantity: number }[] = [];
  async function container(id: string) {
    const { data, error } = await supabase.from("containers").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
    databaseError(error);
    if (!data) throw new VisionError("보관함을 찾을 수 없습니다", 404);
    expected[`containers:${id}`] = data.version;
    return data;
  }
  async function location(id: string) {
    const { data, error } = await supabase.from("locations").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
    databaseError(error);
    if (!data) throw new VisionError("장소를 찾을 수 없습니다", 404);
    expected[`locations:${id}`] = data.version;
    return data;
  }
  async function completeContents(containerId: string) {
    const first = await supabase.from("items").select("id,name,quantity,version", { count: "exact" }).eq("container_id",containerId).order("id").range(0,999);
    databaseError(first.error);
    const rows = first.data ?? [];
    const total = first.count ?? rows.length;
    if (total > 10000) throw new VisionError("한 번에 10000종까지 확인할 수 있습니다. 물품을 나누어 정리해주세요",422);
    for (let offset=1000; offset<total; offset+=1000) {
      const page = await supabase.from("items").select("id,name,quantity,version").eq("container_id",containerId).order("id").range(offset,offset+999);
      databaseError(page.error); rows.push(...(page.data ?? []));
    }
    if (rows.length !== total || new Set(rows.map(row => row.id)).size !== total) throw new VisionError("내용물이 변경되었습니다. 최신 내용으로 다시 확인해주세요",409);
    return rows;
  }
  if (type === "move_items") {
    const source = await container(String(payload.source_container_id));
    expected[`contents:${source.id}`] = source.contents_version;
    const rows = await completeContents(source.id);
    if (!rows.length) throw new VisionError("출발 보관함에 이동할 물품이 없습니다",422);
    for (const item of rows) expected[`items:${item.id}`] = item.version;
    affected = rows.map(({id,name,quantity}) => ({id,name,quantity}));
    before = { container_id: source.id, container_name: source.name, item_count: rows.length };
    if (after) after.item_count = rows.length;
  }
  if (payload.item_id) {
    const { data, error } = await supabase.from("items").select("*").eq("id", String(payload.item_id)).maybeSingle();
    databaseError(error);
    if (!data) throw new VisionError("물품을 찾을 수 없습니다", 404);
    expected[`items:${data.id}`] = data.version;
    const current = await container(data.container_id);
    before = { ...data, container_name: current.name };
    affected = [{ id: data.id, name: data.name, quantity: data.quantity }];
  }
  if (payload.container_id) {
    const target = await container(String(payload.container_id));
    if (type === "update_container" || type === "delete_container") before = { ...target };
    if (after) after.container_name = target.name;
    if (type === "delete_container") {
      expected[`contents:${target.id}`] = target.contents_version;
      affected = (await completeContents(target.id)).map(({id,name,quantity}) => ({id,name,quantity}));
      before = { ...before, item_count: affected.length };
    }
  }
  if (payload.location_id) {
    const target = await location(String(payload.location_id));
    if (type === "update_location" || type === "delete_location") before = { ...target };
    if (after) after.location_name = target.name;
    if (type === "delete_location") {
      const { data, error } = await supabase.from("containers").select("id,name,version").eq("location_id", target.id).eq("user_id", user.id).order("id");
      databaseError(error);
      for (const c of data ?? []) expected[`containers:${c.id}`] = c.version;
      before = { ...before, containers: data ?? [], container_ids: (data ?? []).map((c) => c.id) };
    }
  }
  const mediaIds = [...new Set([
    ...(payload.cover_media_id ? [String(payload.cover_media_id)] : []),
    ...(type === "register_items" ? (payload.items as { media_ids?: string[] }[]).flatMap((i) => i.media_ids ?? []) : []),
  ])];
  for (let offset = 0; offset < mediaIds.length; offset += MEDIA_ID_BATCH_SIZE) {
    const ids = mediaIds.slice(offset, offset + MEDIA_ID_BATCH_SIZE);
    const { data, error } = await supabase.from("media_assets").select("id").eq("user_id", user.id).in("status", ["uploaded", "attached"]).in("id", ids);
    databaseError(error);
    if (data?.length !== ids.length) throw new VisionError("등록 사진을 찾을 수 없습니다. 다시 선택해주세요", 404);
  }
  for (const [key, version] of Object.entries(parsed.data.expected_versions ?? {})) {
    if (expected[key] !== version) throw new VisionError("기록이 변경되었습니다. 최신 내용을 불러온 후 다시 수정해주세요", 409);
  }
  const titles: Record<string, string> = { register_items: "물품 등록", update_item: "물품 수정", move_item: "물품 이동", move_items: "보관함 물품 모두 이동", delete_item: "물품 삭제", create_container: "보관함 만들기", update_container: "보관함 수정", delete_container: "보관함과 포함 물품 삭제", create_location: "장소 만들기", update_location: "장소 수정", delete_location: "장소 삭제 (보관함은 유지)" };
  const preview = { title: titles[type], before, after, affected_items: affected };
  const revision = (parsed.data.revision ?? 0) + 1;
  const actionId = parsed.data.action_id ?? randomUUID();
  const idempotencyKey = randomUUID();
  const hash = createHash("sha256").update(canonicalJson({ type, payload, expected_versions: expected, revision })).digest("hex");
  const values = { type, payload: payload as Json, expected_versions: expected as Json, payload_hash: hash, revision, idempotency_key: idempotencyKey, preview: preview as Json, updated_at: new Date().toISOString() };
  const admin = aiAdmin();
  const result = parsed.data.action_id
    ? await admin.from("storage_actions").update(values).eq("action_id", actionId).eq("user_id", user.id).eq("revision", parsed.data.revision!).eq("status", "prepared").select().maybeSingle()
    : await admin.from("storage_actions").insert({ ...values, action_id: actionId, user_id: user.id }).select().single();
  databaseError(result.error, "변경안을 저장하지 못했습니다");
  if (!result.data) throw new VisionError("변경안이 이미 처리되었거나 달라졌습니다", 409);
  return publicAction(result.data);
}
export async function confirmChange(actionId: string, input: { revision: number; payload_hash: string; idempotency_key: string }): Promise<StorageAction> {
  const parsed = confirmationSchema.safeParse(input);
  if (!parsed.success) throw new VisionError("확인할 변경안을 다시 불러와주세요", 400);
  const { supabase } = await storageContext();
  const { data, error } = await supabase.rpc("confirm_storage_action", { p_action_id: actionId, p_revision: input.revision, p_payload_hash: input.payload_hash, p_idempotency_key: input.idempotency_key });
  databaseError(error, "변경 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해주세요");
  return publicAction(data);
}
export async function cancelChange(actionId: string, revision: number): Promise<StorageAction> {
  const { user } = await storageContext();
  const { data, error } = await aiAdmin().from("storage_actions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("action_id", actionId).eq("user_id", user.id).eq("revision", revision).eq("status", "prepared").select().maybeSingle();
  databaseError(error);
  if (!data) {
    const current = await getActionStatus(actionId);
    if (current.status === "cancelled" && current.revision === revision) return current;
    throw new VisionError("이미 처리되었거나 변경된 작업입니다", 409);
  }
  return publicAction(data);
}
