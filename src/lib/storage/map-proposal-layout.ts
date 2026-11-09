import { randomUUID } from 'node:crypto';
import { VisionError } from '@/lib/ai/gemini';
import { rectangleCells, regionBounds } from './map-geometry';
import { normalizeMapLocationName, storageMapDraftSchema } from './map-schema';
import { storageMapProposalRequestSchema } from './map-proposal-schema';
import type { MapColorKey, MapRegion, StorageMapDraft, StorageMapSceneData } from './map-types';
import type { MapRelation, StorageMapProposal, StorageMapProposalRequest } from './map-proposal-types';

type Rect = { col: number; row: number; width: number; height: number };
type Place = { key: string; name: string; locationId: string | null };
type Node = { key: string; region: MapRegion; rect: Rect; existing: boolean };
type Edge = { from: number; to: number; distance: number };
const COLORS: MapColorKey[] = ['green', 'yellow', 'blue', 'purple', 'pink', 'neutral'];
const DEFAULT_PLACES = ['거실', '주방', '침실', '현관'];
function fail(message: string, status = 400): never { throw new VisionError(message, status); }
function axis(relation: MapRelation) { return relation.relation === 'above' || relation.relation === 'below' ? 'y' : 'x'; }
function pair(relation: MapRelation) { return `${axis(relation)}:${[relation.subject, relation.target].sort().join(':')}`; }
function direction(relation: MapRelation) {
  return relation.relation === 'right_of' || relation.relation === 'below' ? [relation.target, relation.subject] : [relation.subject, relation.target];
}
function mergeRelations(previous: MapRelation[], incoming: MapRelation[]): MapRelation[] {
  const latestPairs = new Set(incoming.map(pair)), directions = new Map<string, string>(), seen = new Set<string>();
  const unique: MapRelation[] = [];
  for (const relation of incoming) {
    const key = pair(relation);
    const orientation = direction(relation).join(':');
    if (relation.relation !== 'next_to') {
      if (directions.has(key) && directions.get(key) !== orientation) fail('같은 장소에 반대 방향 조건이 함께 있습니다. 충돌하는 조건을 정리해주세요');
      directions.set(key, orientation);
    }
    const identity = relation.relation === 'next_to' ? `${key}:next` : `${key}:${orientation}`;
    if (!seen.has(identity)) { seen.add(identity); unique.push(relation); }
  }
  const result = [...previous.filter(relation => !latestPairs.has(pair(relation))), ...unique];
  if (result.length > 128) fail('공간 관계는 128개까지 제안할 수 있습니다. 조건을 줄여주세요', 422);
  return result;
}
function overlaps(a: Rect, b: Rect) { return a.col < b.col + b.width && b.col < a.col + a.width && a.row < b.row + b.height && b.row < a.row + a.height; }
/** Longest-path difference constraints also handle exact offsets via reverse edges. */
function coordinates(count: number, edges: Edge[]): number[] | null {
  const values = Array<number>(count).fill(0);
  for (let pass = 0; pass < count; pass++) {
    let changed = false;
    for (const edge of edges) {
      const next = values[edge.from] + edge.distance;
      if (values[edge.to] < next) { values[edge.to] = next; changed = true; }
    }
    if (!changed) return values;
  }
  return null;
}
function solve(nodes: Node[], horizontal: Edge[], vertical: Edge[]): Rect[] | null {
  const x = coordinates(nodes.length, horizontal), y = coordinates(nodes.length, vertical);
  if (!x || !y) return null;
  const result = nodes.map((node, i) => ({ ...node.rect, col: x[i], row: y[i] }));
  return result.some(rect => rect.col + rect.width > 64 || rect.row + rect.height > 64) ? null : result;
}
function groupLayout(nodes: Node[], relations: MapRelation[], assumptions: string[]): Rect[] {
  const indices = new Map(nodes.map((node, i) => [node.key, i]));
  let horizontal: Edge[] = [], vertical: Edge[] = [];
  for (const relation of relations) {
    let [fromKey, toKey] = direction(relation);
    if (relation.relation === 'next_to') {
      const explicit = relations.find(other => other.relation !== 'next_to' && axis(other) === 'x' && pair(other) === pair(relation));
      if (explicit) [fromKey, toKey] = direction(explicit);
      else {
        const a = nodes[indices.get(fromKey)!], b = nodes[indices.get(toKey)!];
        if (a.existing && b.existing && b.rect.col + b.rect.width <= a.rect.col) [fromKey, toKey] = [toKey, fromKey];
      }
      assumptions.push('‘옆’은 같은 행에서 경계를 맞댄 좌우 배치로 제안했습니다. 왼쪽·오른쪽 방향과 실제 거리를 확인해주세요');
    }
    const from = indices.get(fromKey)!, to = indices.get(toKey)!;
    if (axis(relation) === 'x') {
      const distance = nodes[from].rect.width;
      horizontal.push({ from, to, distance });
      if (relation.relation === 'next_to') {
        horizontal.push({ from: to, to: from, distance: -distance });
        vertical.push({ from, to, distance: 0 }, { from: to, to: from, distance: 0 });
      }
    } else vertical.push({ from, to, distance: nodes[from].rect.height });
  }
  if (!coordinates(nodes.length, horizontal) || !coordinates(nodes.length, vertical)) fail('공간 관계가 순환하거나 서로 충돌합니다. 방향 조건을 다시 확인해주세요');
  const left = Math.min(...nodes.map(node => node.rect.col)), top = Math.min(...nodes.map(node => node.rect.row));
  const retained = nodes.map(node => ({ ...node.rect, col: node.rect.col - left, row: node.rect.row - top }));
  const satisfies = (rects: Rect[], edges: Edge[], dimension: 'col' | 'row') => edges.every(edge => rects[edge.to][dimension] >= rects[edge.from][dimension] + edge.distance);
  if (nodes.every(node => node.existing) && satisfies(retained, horizontal, 'col') && satisfies(retained, vertical, 'row') && !retained.some((rect, i) => retained.slice(i + 1).some(other => overlaps(rect, other)))) return retained;
  let result = solve(nodes, horizontal, vertical);
  if (!result) fail('공간 관계를 64×64칸 안에 배치할 수 없습니다. 방향 조건이나 구획 크기를 줄여주세요', 422);
  // Add deterministic separation constraints only where a pair still overlaps.
  for (let iteration = 0; iteration < nodes.length * nodes.length; iteration++) {
    let collision: [number, number] | null = null;
    for (let i = 0; i < result.length && !collision; i++) for (let j = i + 1; j < result.length; j++) if (overlaps(result[i], result[j])) { collision = [i, j]; break; }
    if (!collision) return result;
    const [a, b] = collision;
    const candidates: { h: Edge[]; v: Edge[]; rects: Rect[]; score: number }[] = [];
    for (const dimension of ['x', 'y'] as const) for (const [from, to] of [[a, b], [b, a]]) {
      const edge = { from, to, distance: (dimension === 'x' ? nodes[from].rect.width : nodes[from].rect.height) };
      const h = dimension === 'x' ? [...horizontal, edge] : horizontal, v = dimension === 'y' ? [...vertical, edge] : vertical;
      const rects = solve(nodes, h, v);
      if (rects) {
        const width = Math.max(...rects.map(rect => rect.col + rect.width)), height = Math.max(...rects.map(rect => rect.row + rect.height));
        candidates.push({ h, v, rects, score: width * height + Math.abs(width - height) });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    const choice = candidates[0];
    if (!choice) fail('구획 겹침 없이 공간 관계를 64×64칸에 배치할 수 없습니다. 조건을 줄여주세요', 422);
    horizontal = choice.h; vertical = choice.v; result = choice.rects;
  }
  return fail('겹치지 않는 배치를 찾지 못했습니다. 공간 관계를 줄여주세요', 422);
}
function placeGroup(nodes: Node[], local: Rect[], occupied: Rect[], columns: number, rows: number): Rect[] {
  const width = Math.max(...local.map(rect => rect.col + rect.width)), height = Math.max(...local.map(rect => rect.row + rect.height));
  const existing = nodes.filter(node => node.existing);
  const preferred = existing.length ? { col: Math.min(...existing.map(node => node.rect.col)), row: Math.min(...existing.map(node => node.rect.row)) } : { col: 0, row: 0 };
  let best: { rects: Rect[]; score: number } | null = null;
  for (let row = 0; row <= 64 - height; row++) for (let col = 0; col <= 64 - width; col++) {
    const rects = local.map(rect => ({ ...rect, col: rect.col + col, row: rect.row + row }));
    if (rects.some(rect => occupied.some(other => overlaps(rect, other)))) continue;
    const expansion = Math.max(columns, col + width) * Math.max(rows, row + height) - columns * rows;
    const distance = Math.abs(col - preferred.col) + Math.abs(row - preferred.row);
    const score = existing.length ? distance * 100000 + expansion * 100 + row * 64 + col : expansion * 100000 + row * 64 + col;
    if (!best || score < best.score) best = { rects, score };
  }
  if (!best) fail('기존 구획을 유지하면서 배치할 공간이 부족합니다. 최대 64×64칸 안에서 구획 크기나 관계를 조정해주세요', 422);
  return best.rects;
}

export function buildStorageMapProposal(scene: StorageMapSceneData, request: StorageMapProposalRequest): StorageMapProposal {
  const parsed = storageMapProposalRequestSchema.safeParse(request);
  if (!parsed.success) fail('지도 제안 요청을 확인해주세요. 미완성 구획이 있다면 장소 연결을 마친 뒤 다시 요청해주세요');
  const input = parsed.data;
  if (scene.truncated) fail('전체 장소와 보관함을 확인하지 못했습니다. 목록을 다시 불러와주세요', 422);
  if (input.draft && input.draft.base_map_revision !== (scene.map?.revision ?? null)) fail('저장된 지도가 변경되었습니다. 최신 지도와 초안을 비교한 뒤 다시 제안해주세요', 409);
  const draft: StorageMapDraft = input.draft ? structuredClone(input.draft) : {
    base_map_revision: scene.map?.revision ?? null, map_draft_id: randomUUID(), draft_revision: 0, name: scene.map?.name ?? '우리 집', columns: scene.map?.columns ?? 12, rows: scene.map?.rows ?? 8,
    regions: scene.regions.map(region => ({ id: region.id, location_id: region.location_id, client_location_key: null, color_key: region.color_key, cells: structuredClone(region.cells) })), anchors: structuredClone(scene.anchors), new_locations: [],
  };
  const assumptions = ['구획 크기와 제안한 표식은 실제 실내 구조를 측정한 값이 아닙니다. 저장 전에 위치를 확인해주세요'];
  const places: Place[] = scene.locations.map(location => ({ key: location.id, name: location.name, locationId: location.id }));
  const knownIds = new Set(places.map(place => place.key));
  for (const pending of draft.new_locations) {
    if (knownIds.has(pending.client_location_key)) fail('새 장소 초안의 식별자가 기존 장소와 겹칩니다. 초안을 다시 만들어주세요');
    if (places.some(place => normalizeMapLocationName(place.name) === normalizeMapLocationName(pending.name))) fail(`‘${pending.name}’ 이름이 중복되었습니다. 기존 장소와 새 장소를 구분해주세요`);
    places.push({ key: pending.client_location_key, name: pending.name, locationId: null });
  }
  for (const region of draft.regions) if (region.location_id && !knownIds.has(region.location_id)) fail('초안에 접근할 수 없는 장소가 있습니다. 최신 장소 목록을 확인해주세요', 404);
  for (const anchor of draft.anchors) {
    const container = scene.containers.find(container => container.id === anchor.container_id), region = draft.regions.find(region => region.id === anchor.region_id);
    if (!container || !region?.location_id || container.location_id !== region.location_id) fail('보관함의 장소가 변경되었거나 접근할 수 없습니다. 최신 위치를 확인해주세요', 409);
  }
  const requestedNames = input.new_location_names ?? [];
  const newNames = !places.length && !requestedNames.length ? DEFAULT_PLACES : requestedNames;
  for (const rawName of newNames) {
    const name = rawName.trim();
    const matches = places.filter(place => normalizeMapLocationName(place.name) === normalizeMapLocationName(name));
    if (matches.length) fail(`‘${name}’ 장소가 이미 있거나 이름이 중복되었습니다. 실제 장소 ID로 선택해주세요`);
    const key = randomUUID();
    draft.new_locations.push({ client_location_key: key, name }); places.push({ key, name, locationId: null });
  }
  if (draft.new_locations.length) assumptions.push('새 장소 이름은 미저장 추천·초안입니다. 지도 저장을 확인해야 실제 장소가 함께 만들어집니다');
  const resolve = (reference: string): Place => {
    const byId = places.find(place => place.key === reference);
    if (byId) return byId;
    const matching = places.filter(place => place.name.trim() === reference.trim());
    if (matching.length > 1) fail(`‘${reference}’ 장소가 여러 개입니다. ID로 구분해주세요: ${matching.map(place => `${place.name} (${place.key})`).join(', ')}`);
    if (matching.length === 1) return matching[0];
    if (scene.containers.some(container => container.id === reference || container.name.trim() === reference.trim())) fail(`‘${reference}’는 보관함입니다. 구획 배치를 바꾸려면 해당 보관함이 속한 장소를 지정해주세요`);
    return fail(`‘${reference}’ 장소를 찾을 수 없습니다. 기존 장소를 선택하거나 새 장소 이름을 먼저 지정해주세요`, 404);
  };
  const resolveRelation = (relation: MapRelation): MapRelation => {
    const subject = resolve(relation.subject), target = resolve(relation.target);
    if (subject.key === target.key) fail('같은 장소끼리의 공간 관계는 지정할 수 없습니다');
    return { ...relation, subject: subject.key, target: target.key };
  };
  const removedPairs = new Set((input.remove_relations ?? []).map(removal => {
    const subject = resolve(removal.subject), target = resolve(removal.target);
    if (subject.key === target.key) fail('같은 장소끼리의 관계는 해제할 수 없습니다');
    return [subject.key, target.key].sort().join(':');
  }));
  const previous = (input.previous_relations ?? []).map(resolveRelation).filter(relation => !removedPairs.has([relation.subject, relation.target].sort().join(':')));
  const relations = mergeRelations(previous, (input.relations ?? []).map(resolveRelation));
  const wanted = new Set<string>();
  if (!input.draft || !draft.regions.length) for (const place of places) wanted.add(place.key);
  for (const pending of draft.new_locations) wanted.add(pending.client_location_key);
  for (const relation of relations) { wanted.add(relation.subject); wanted.add(relation.target); }
  const originalBounds = new Map(draft.regions.map(region => [region.id, regionBounds(region.cells)!]));
  for (const key of wanted) if (!draft.regions.some(region => (region.location_id ?? region.client_location_key) === key)) {
    const place = places.find(place => place.key === key)!;
    draft.regions.push({ id: randomUUID(), location_id: place.locationId, client_location_key: place.locationId ? null : place.key, color_key: COLORS[draft.regions.length % COLORS.length], cells: rectangleCells({ col: 0, row: 0 }, { col: 2, row: 2 }) });
  }
  if (draft.regions.length > 64) fail('지도는 최대 64개 구획까지 지원합니다. 먼저 포함할 장소를 직접 선택해주세요', 422);
  const nodes: Node[] = draft.regions.map(region => ({ key: (region.location_id ?? region.client_location_key)!, region, rect: regionBounds(region.cells)!, existing: originalBounds.has(region.id) }));
  const involved = new Set(relations.flatMap(relation => [relation.subject, relation.target]));
  const fixed = nodes.filter(node => node.existing && !involved.has(node.key));
  const occupied = fixed.map(node => node.rect);
  const pending = nodes.filter(node => !fixed.includes(node));
  const seen = new Set<string>();
  for (const node of pending) {
    if (seen.has(node.key)) continue;
    const keys = new Set([node.key]);
    for (let changed = true; changed;) {
      changed = false;
      for (const relation of relations) if (keys.has(relation.subject) || keys.has(relation.target)) for (const key of [relation.subject, relation.target]) if (!keys.has(key)) { keys.add(key); changed = true; }
    }
    const group = pending.filter(candidate => keys.has(candidate.key));
    group.forEach(candidate => seen.add(candidate.key));
    const local = groupLayout(group, relations.filter(relation => keys.has(relation.subject)), assumptions);
    const placed = placeGroup(group, local, occupied, draft.columns, draft.rows);
    placed.forEach((rect, i) => {
      const region = group[i].region, old = originalBounds.get(region.id);
      region.cells = rectangleCells({ col: rect.col, row: rect.row }, { col: rect.col + rect.width - 1, row: rect.row + rect.height - 1 });
      if (old) draft.anchors = draft.anchors.map(anchor => anchor.region_id === region.id ? { ...anchor, col: anchor.col + rect.col - old.col, row: anchor.row + rect.row - old.row } : anchor);
      draft.columns = Math.max(draft.columns, rect.col + rect.width); draft.rows = Math.max(draft.rows, rect.row + rect.height);
      occupied.push(rect);
    });
  }
  for (const container of scene.containers) {
    if (!container.location_id || draft.anchors.some(anchor => anchor.container_id === container.id)) continue;
    const region = draft.regions.find(region => region.location_id === container.location_id);
    if (!region || draft.anchors.length >= 1000) continue;
    const rect = regionBounds(region.cells)!;
    draft.anchors.push({ container_id: container.id, region_id: region.id, col: rect.col + Math.floor((rect.width - 1) / 2), row: rect.row + Math.floor((rect.height - 1) / 2) });
  }
  const suggested = draft.anchors.filter(anchor => !scene.anchors.some(saved => saved.container_id === anchor.container_id && saved.region_id === anchor.region_id && saved.col === anchor.col && saved.row === anchor.row)).map(anchor => anchor.container_id);
  if (suggested.length) assumptions.push('보관함 표식은 현재 소속 장소 안에 제안한 위치입니다. 실제 위치를 확인한 뒤 저장해주세요');
  const unassigned = scene.containers.filter(container => !container.location_id).length;
  if (unassigned) assumptions.push(`장소가 없는 보관함 ${unassigned}개는 임의로 배치하지 않았습니다. 먼저 장소를 지정해주세요`);
  draft.draft_revision = (input.draft?.draft_revision ?? 0) + 1;
  const valid = storageMapDraftSchema.safeParse(draft);
  if (!valid.success) fail('유효한 지도 제안을 만들지 못했습니다. 구획이나 장소 연결을 확인해주세요', 422);
  const names = new Map(places.map(place => [place.key, place.name]));
  const labels = { left_of: '왼쪽', right_of: '오른쪽', above: '위쪽', below: '아래쪽', next_to: '옆' };
  return {
    proposal_id: randomUUID(), base: { map_revision: scene.map?.revision ?? null, draft_id: input.draft?.map_draft_id ?? null, draft_revision: input.draft?.draft_revision ?? null }, draft,
    relations, relation_descriptions: relations.map(relation => `${names.get(relation.subject)}: ${names.get(relation.target)} ${labels[relation.relation]}`), assumptions: [...new Set(assumptions)],
    recommended_location_keys: draft.new_locations.map(location => location.client_location_key), suggested_anchor_ids: suggested,
    source: { location_count: scene.locations.length, container_count: scene.containers.length, unassigned_container_count: unassigned },
    preview: { ...scene, map: { id: scene.map?.id ?? draft.map_draft_id, name: draft.name, columns: draft.columns, rows: draft.rows, revision: scene.map?.revision ?? 0, schema_version: 1, updated_at: scene.evidence_at }, regions: draft.regions.map(region => ({ ...region, location_name: names.get((region.location_id ?? region.client_location_key)!)! })), anchors: draft.anchors, resolution: null },
  };
}
