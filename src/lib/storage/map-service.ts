import 'server-only';
import { VisionError } from '@/lib/ai/gemini';
import { storageContext } from './service';
import { normalizeMapLocationName, storageMapDraftSchema, storageMapTargetSchema } from './map-schema';
import type { StorageMapDraft, StorageMapSceneData, StorageMapTarget } from './map-types';

export async function getStorageMap(): Promise<StorageMapSceneData> {
  const { supabase } = await storageContext();
  const { data, error } = await supabase.rpc('read_storage_map', {});
  if (error || !data) throw new VisionError('지도를 불러오지 못했습니다. 다시 시도해주세요', 503);
  return data as unknown as StorageMapSceneData;
}
export async function resolveStorageMap(target: StorageMapTarget): Promise<StorageMapSceneData> {
  const parsed = storageMapTargetSchema.safeParse(target);
  if (!parsed.success) throw new VisionError('지도에서 찾을 대상을 확인해주세요', 400);
  const { supabase } = await storageContext();
  const { data, error } = await supabase.rpc('read_storage_map', { p_kind: parsed.data.kind, p_id: parsed.data.id });
  if (error || !data) throw new VisionError('현재 위치를 확인하지 못했습니다. 다시 시도해주세요', 503);
  return data as unknown as StorageMapSceneData;
}
export async function prepareStorageMap(payload: unknown) {
  const parsed = storageMapDraftSchema.safeParse(payload);
  if (!parsed.success) throw new VisionError(parsed.error.issues[0]?.message ?? '지도 내용을 확인해주세요', 400);
  const draft: StorageMapDraft = parsed.data;
  const scene = await getStorageMap();
  if ((scene.map?.revision ?? null) !== draft.base_map_revision) throw new VisionError('저장된 지도가 변경되었습니다. 최신 배치와 비교한 뒤 다시 확인해주세요', 409);
  const expected: Record<string, number> = {};
  if (scene.map) expected[`storage_maps:${scene.map.id}`] = scene.map.revision;
  const locations = new Map(scene.locations.map(location => [location.id, location]));
  const containers = new Map(scene.containers.map(container => [container.id, container]));
  // Freeze names/versions used by the removal impact as well as kept references.
  for (const region of scene.regions) {
    const location = region.location_id ? locations.get(region.location_id) : null;
    if (location) expected[`locations:${location.id}`] = location.version;
  }
  for (const anchor of scene.anchors) {
    const container = containers.get(anchor.container_id);
    if (container) expected[`containers:${container.id}`] = container.version;
  }
  const pending = new Map(draft.new_locations.map(location => [location.client_location_key, location]));
  const names = new Set<string>();
  for (const location of draft.new_locations) {
    const normalized = normalizeMapLocationName(location.name);
    if (scene.locations.some(existing => normalizeMapLocationName(existing.name) === normalized)) throw new VisionError(`‘${location.name}’ 장소가 이미 있습니다. 기존 장소를 직접 선택해주세요`, 409);
    if (names.has(normalized)) throw new VisionError('새 장소 이름이 중복되었습니다. 서로 다른 이름을 입력해주세요', 400);
    names.add(normalized);
  }
  const regions = draft.regions.map(region => {
    if (region.location_id) {
      const location = locations.get(region.location_id);
      if (!location) throw new VisionError('연결할 장소를 찾을 수 없습니다', 404);
      expected[`locations:${location.id}`] = location.version;
      return { ...region, location_name: location.name };
    }
    return { ...region, location_name: pending.get(region.client_location_key!)!.name };
  });
  for (const anchor of draft.anchors) {
    const container = containers.get(anchor.container_id), region = draft.regions.find(region => region.id === anchor.region_id)!;
    if (!container) throw new VisionError('배치할 보관함을 찾을 수 없습니다', 404);
    if (!region.location_id || container.location_id !== region.location_id) throw new VisionError('다른 장소에는 표식을 놓을 수 없습니다. 보관함의 장소를 먼저 변경해주세요', 400);
    expected[`containers:${container.id}`] = container.version;
  }
  const removed = scene.anchors.filter(anchor => !draft.anchors.some(next => next.container_id === anchor.container_id));
  const after: StorageMapSceneData = { ...scene, map: { id: scene.map?.id ?? draft.map_draft_id, name: draft.name, columns: draft.columns, rows: draft.rows, revision: (scene.map?.revision ?? 0) + 1, schema_version: 1, updated_at: scene.evidence_at }, regions, anchors: draft.anchors, resolution: null };
  const addedLocations = new Set(draft.regions.filter(region => region.location_id && !scene.regions.some(previous => previous.location_id === region.location_id)).map(region => region.location_id));
  const newlyUnplaced = scene.containers.filter(container => container.location_id && addedLocations.has(container.location_id) && !draft.anchors.some(anchor => anchor.container_id === container.id));
  return { expected, before: scene, after: { ...after, new_locations: draft.new_locations, newly_unplaced_containers: newlyUnplaced, removed_anchors: removed.map(anchor => ({ ...anchor, container_name: containers.get(anchor.container_id)?.name ?? '보관함' })) } };
}
