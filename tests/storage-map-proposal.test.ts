import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildStorageMapProposal } from '../src/lib/storage/map-proposal-layout';
import { storageMapProposalRequestSchema } from '../src/lib/storage/map-proposal-schema';
import { storageMapDraftSchema } from '../src/lib/storage/map-schema';
import { regionBounds, rectangleCells } from '../src/lib/storage/map-geometry';
import type { StorageMapSceneData, StorageMapDraft } from '../src/lib/storage/map-types';
const study = randomUUID(), living = randomUUID(), kitchen = randomUUID(), entry = randomUUID(), box = randomUUID();
function scene(): StorageMapSceneData {
  return { map: null, regions: [], anchors: [], locations: [{ id: study, name: '서재', version: 1, container_count: 1, item_count: 2 }, { id: living, name: '거실', version: 1, container_count: 0, item_count: 0 }, { id: kitchen, name: '주방', version: 1, container_count: 0, item_count: 0 }], containers: [{ id: box, name: '책상 서랍', version: 1, location_id: study, item_count: 2 }], evidence_at: '2026-11-09T00:00:00Z', resolution: null, truncated: false };
}
function empty(): StorageMapSceneData { return { ...scene(), locations: [], containers: [] }; }
function bounds(draft: StorageMapDraft, id: string) { return regionBounds(draft.regions.find(region => (region.location_id ?? region.client_location_key) === id)!.cells)!; }
function assertLeft(draft: StorageMapDraft, a: string, b: string) { const x = bounds(draft, a), y = bounds(draft, b); assert.ok(x.col + x.width <= y.col, `${a} must be left of ${b}`); }
function assertAbove(draft: StorageMapDraft, a: string, b: string) { const x = bounds(draft, a), y = bounds(draft, b); assert.ok(x.row + x.height <= y.row, `${a} must be above ${b}`); }

test('existing places and container membership produce a valid unsaved proposal with genuine IDs', () => {
  const source = scene(), original = structuredClone(source);
  const proposal = buildStorageMapProposal(source, {});
  assert.equal(proposal.draft.regions.length, 3);
  assert.deepEqual(new Set(proposal.draft.regions.map(region => region.location_id)), new Set([study, living, kitchen]));
  assert.equal(proposal.draft.new_locations.length, 0);
  assert.equal(proposal.draft.anchors[0].container_id, box);
  assert.equal(proposal.draft.regions.find(region => region.id === proposal.draft.anchors[0].region_id)?.location_id, study);
  assert.ok(proposal.suggested_anchor_ids.includes(box));
  assert.equal(storageMapDraftSchema.safeParse(proposal.draft).success, true);
  assert.deepEqual(proposal.base, { map_revision: null, draft_id: null, draft_revision: null });
  assert.equal(proposal.draft.draft_revision, 1);
  assert.deepEqual(source, original);
});
test('empty data suggests named pending places only, with explicit recommendation labels', () => {
  const proposal = buildStorageMapProposal(empty(), {});
  assert.ok(proposal.draft.new_locations.length >= 3);
  assert.ok(proposal.draft.new_locations.some(location => location.name === '거실'));
  assert.equal(proposal.recommended_location_keys.length, proposal.draft.new_locations.length);
  assert.equal(proposal.draft.anchors.length, 0);
  assert.equal(proposal.source.location_count, 0);
  assert.ok(proposal.assumptions.some(text => /추천|예시/.test(text)));
  assert.equal(storageMapDraftSchema.safeParse(proposal.draft).success, true);
});
test('semantic directions resolve exact names and apply both axes', () => {
  const proposal = buildStorageMapProposal(scene(), { relations: [{ subject: '서재', relation: 'left_of', target: '거실' }, { subject: living, relation: 'above', target: '주방' }] });
  assertLeft(proposal.draft, study, living); assertAbove(proposal.draft, living, kitchen);
  assert.deepEqual(proposal.relations.map(relation => relation.subject), [study, living]);
  assert.ok(proposal.relation_descriptions.some(text => text.includes('서재') && text.includes('왼쪽')));
});
test('latest correction replaces only that pair and axis, retaining other spatial relations and draft identity', () => {
  const first = buildStorageMapProposal(scene(), { relations: [{ subject: study, relation: 'left_of', target: living }, { subject: living, relation: 'above', target: kitchen }] });
  const second = buildStorageMapProposal(scene(), { draft: first.draft, previous_relations: first.relations, relations: [{ subject: study, relation: 'right_of', target: living }] });
  assertLeft(second.draft, living, study); assertAbove(second.draft, living, kitchen);
  assert.equal(second.draft.map_draft_id, first.draft.map_draft_id);
  assert.equal(second.draft.draft_revision, first.draft.draft_revision + 1);
  assert.deepEqual(second.base, { map_revision: null, draft_id: first.draft.map_draft_id, draft_revision: first.draft.draft_revision });
  assert.ok(second.suggested_anchor_ids.includes(box), 'prior unsaved anchors remain suggestions');
});
test('unrelated saved regions and anchors remain exactly in place while changed region anchors translate', () => {
  const source = scene(); source.locations.push({ id: entry, name: '현관', version: 1, container_count: 0, item_count: 0 });
  source.map = { id: randomUUID(), name: '우리 집', columns: 20, rows: 12, revision: 3, schema_version: 1, updated_at: source.evidence_at };
  const regionA = randomUUID(), regionB = randomUUID(), regionC = randomUUID();
  source.regions = [{ id: regionA, location_id: study, client_location_key: null, location_name: '서재', color_key: 'green', cells: rectangleCells({ col: 6, row: 0 }, { col: 8, row: 2 }) }, { id: regionB, location_id: living, client_location_key: null, location_name: '거실', color_key: 'blue', cells: rectangleCells({ col: 0, row: 0 }, { col: 2, row: 2 }) }, { id: regionC, location_id: entry, client_location_key: null, location_name: '현관', color_key: 'yellow', cells: rectangleCells({ col: 15, row: 9 }, { col: 17, row: 11 }) }];
  source.anchors = [{ container_id: box, region_id: regionA, col: 7, row: 1 }];
  const proposal = buildStorageMapProposal(source, { relations: [{ subject: study, relation: 'left_of', target: living }] });
  assert.deepEqual(proposal.draft.regions.find(region => region.id === regionC)?.cells, source.regions[2].cells);
  assert.equal(proposal.draft.regions.find(region => region.id === regionC)?.color_key, 'yellow');
  const moved = bounds(proposal.draft, study), anchor = proposal.draft.anchors.find(anchor => anchor.container_id === box)!;
  assert.equal(anchor.col - moved.col, 1); assert.equal(anchor.row - moved.row, 1);
  assertLeft(proposal.draft, study, living);
  assert.equal(proposal.draft.base_map_revision, 3);
});
test('ambiguous, unknown, foreign and unlinked-container references fail without guessing', () => {
  const duplicate = scene(); duplicate.locations.push({ ...duplicate.locations[0], id: randomUUID() });
  assert.throws(() => buildStorageMapProposal(duplicate, { relations: [{ subject: '서재', relation: 'left_of', target: '거실' }] }), /여러|중복|구분/);
  assert.throws(() => buildStorageMapProposal(scene(), { relations: [{ subject: randomUUID(), relation: 'left_of', target: living }] }), /찾을|없는/);
  assert.throws(() => buildStorageMapProposal(scene(), { relations: [{ subject: '책상 서랍', relation: 'left_of', target: '거실' }] }), /보관함|장소/);
  const first = buildStorageMapProposal(scene(), {}); first.draft.regions[0].location_id = randomUUID();
  assert.throws(() => buildStorageMapProposal(scene(), { draft: first.draft }), /장소|권한/);
});
test('contradictions, directional cycles and impossible bounds are reported', () => {
  assert.throws(() => buildStorageMapProposal(scene(), { relations: [{ subject: study, relation: 'left_of', target: living }, { subject: study, relation: 'right_of', target: living }] }), /충돌|모순|반대/);
  assert.throws(() => buildStorageMapProposal(scene(), { relations: [{ subject: study, relation: 'left_of', target: living }, { subject: living, relation: 'left_of', target: kitchen }, { subject: kitchen, relation: 'left_of', target: study }] }), /순환|충돌|모순/);
  const many = empty(); many.locations = Array.from({ length: 22 }, (_, i) => ({ id: randomUUID(), name: `장소 ${i}`, version: 1, container_count: 0, item_count: 0 }));
  assert.throws(() => buildStorageMapProposal(many, { relations: many.locations.slice(1).map((location, i) => ({ subject: many.locations[i].id, relation: 'left_of', target: location.id })) }), /64|범위|공간/);
});
test('next-to uses explicitly labelled adjacent proposal and preserves same-row relation', () => {
  const proposal = buildStorageMapProposal(scene(), { relations: [{ subject: study, relation: 'next_to', target: living }] });
  const a = bounds(proposal.draft, study), b = bounds(proposal.draft, living);
  assert.equal(a.row, b.row); assert.equal(Math.abs((a.col < b.col ? b.col - a.col - a.width : a.col - b.col - b.width)), 0);
  assert.ok(proposal.assumptions.some(text => /옆|좌우/.test(text)));
});
test('new place proposals remain pending across corrections, with no duplicate recommended keys', () => {
  const first = buildStorageMapProposal(empty(), { new_location_names: ['작업실', '베란다'], relations: [{ subject: '작업실', relation: 'above', target: '베란다' }] });
  const second = buildStorageMapProposal(empty(), { draft: first.draft, previous_relations: first.relations, relations: [] });
  assert.deepEqual(second.draft.new_locations, first.draft.new_locations);
  assert.deepEqual(new Set(second.recommended_location_keys), new Set(first.recommended_location_keys));
  assert.equal(second.draft.regions.length, 2);
  assert.equal(storageMapDraftSchema.safeParse(second.draft).success, true);
});
test('stale saved revisions and geometry in semantic intent are rejected', () => {
  const first = buildStorageMapProposal(scene(), {}), changed = scene();
  changed.map = { id: randomUUID(), name: '다른 지도', columns: 12, rows: 8, revision: 1, schema_version: 1, updated_at: changed.evidence_at };
  assert.throws(() => buildStorageMapProposal(changed, { draft: first.draft }), /변경|최신/);
  assert.equal(storageMapProposalRequestSchema.safeParse({ cells: [{ col: 0, row: 0 }] }).success, false);
  assert.equal(storageMapProposalRequestSchema.safeParse({ relations: [{ subject: study, relation: 'left_of', target: living, col: 3 }] }).success, false);
});

test('adjacency and a consistent explicit direction compose without a contradiction', () => {
  const proposal = buildStorageMapProposal(scene(), { relations: [{ subject: study, relation: 'left_of', target: living }, { subject: study, relation: 'next_to', target: living }] });
  const a = bounds(proposal.draft, study), b = bounds(proposal.draft, living);
  assert.equal(a.col + a.width, b.col); assert.equal(a.row, b.row);
});
test('all 64 unrelated places fit, and unchanged complete saved geometry is retained', () => {
  const source = empty(); source.locations = Array.from({ length: 64 }, (_, i) => ({ id: randomUUID(), name: `장소 ${i}`, version: 1, container_count: 0, item_count: 0 }));
  const first = buildStorageMapProposal(source, {});
  assert.equal(first.draft.regions.length, 64);
  assert.equal(storageMapDraftSchema.safeParse(first.draft).success, true);
  const saved: StorageMapSceneData = { ...first.preview, map: { ...first.preview.map!, revision: 5 } };
  const second = buildStorageMapProposal(saved, {});
  assert.deepEqual(second.draft.regions.map(region => region.cells), first.draft.regions.map(region => region.cells));
  assert.equal(second.draft.base_map_revision, 5);
});
test('only same-location containers receive suggested anchors, and absent membership remains unassigned', () => {
  const source = scene(); source.containers.push({ id: randomUUID(), name: '이동식 상자', location_id: null, version: 1, item_count: 0 });
  const proposal = buildStorageMapProposal(source, {});
  assert.equal(proposal.draft.anchors.length, 1);
  assert.equal(proposal.source.unassigned_container_count, 1);
  assert.ok(proposal.assumptions.some(text => /장소가 없는/.test(text)));
});
test('explicit pair removal lets adjacency become vertical without dropping other relations', () => {
  const first = buildStorageMapProposal(scene(), { relations: [{ subject: study, relation: 'next_to', target: living }, { subject: living, relation: 'above', target: kitchen }] });
  const second = buildStorageMapProposal(scene(), { draft: first.draft, previous_relations: first.relations, remove_relations: [{ subject: '서재', target: '거실' }], relations: [{ subject: study, relation: 'above', target: living }] });
  assertAbove(second.draft, study, living); assertAbove(second.draft, living, kitchen);
  assert.equal(second.relations.some(relation => relation.relation === 'next_to'), false);
});
test('removing a pair retains current geometry and unrelated relation constraints', () => {
  const first = buildStorageMapProposal(scene(), { relations: [{ subject: study, relation: 'left_of', target: living }, { subject: living, relation: 'above', target: kitchen }] });
  const second = buildStorageMapProposal(scene(), { draft: first.draft, previous_relations: first.relations, remove_relations: [{ subject: living, target: study }] });
  assert.equal(second.relations.length, 1); assert.equal(second.relations[0].relation, 'above');
  assert.deepEqual(second.draft.regions.map(region => region.cells), first.draft.regions.map(region => region.cells));
  assert.throws(() => buildStorageMapProposal(scene(), { draft: first.draft, remove_relations: [{ subject: randomUUID(), target: living }] }), /찾을|없는/);
  assert.throws(() => buildStorageMapProposal(scene(), { remove_relations: [{ subject: study, target: study }] }), /같은/);
});
test('direction chains use only necessary separation so a 63-cell chain fits the grid limit', () => {
  const source = empty(); source.locations = Array.from({ length: 21 }, (_, i) => ({ id: randomUUID(), name: `긴 배치 ${i}`, version: 1, container_count: 0, item_count: 0 }));
  const proposal = buildStorageMapProposal(source, { relations: source.locations.slice(1).map((location, i) => ({ subject: source.locations[i].id, relation: 'left_of', target: location.id })) });
  assert.ok(proposal.draft.columns <= 64);
  for (let i = 1; i < source.locations.length; i++) assertLeft(proposal.draft, source.locations[i - 1].id, source.locations[i].id);
});
test('new place names use the same case-insensitive duplicate normalization as map saving', () => {
  const source = scene(); source.locations[0].name = '  Study  ';
  assert.throws(() => buildStorageMapProposal(source, { new_location_names: ['study'] }), /이미|중복/);
  assert.throws(() => buildStorageMapProposal(empty(), { new_location_names: ['Study', ' study '] }), /이미|중복/);
  const first = buildStorageMapProposal(empty(), { new_location_names: ['Study'] });
  assert.throws(() => buildStorageMapProposal(empty(), { draft: first.draft, new_location_names: ['study'] }), /이미|중복/);
  assert.throws(() => buildStorageMapProposal(source, { draft: first.draft }), /이미|중복/);
  const pending = buildStorageMapProposal(empty(), { new_location_names: ['Study', 'Living'] });
  pending.draft.new_locations[1].name = ' study ';
  assert.throws(() => buildStorageMapProposal(empty(), { draft: pending.draft }), /이미|중복/);
});
test('duplicate normalization does not change exact-name resolution or actual location IDs', () => {
  const source = scene(); source.locations[0].name = 'Study'; source.locations[1].name = 'study';
  const proposal = buildStorageMapProposal(source, { relations: [{ subject: 'Study', relation: 'left_of', target: 'study' }] });
  assert.equal(proposal.relations[0].subject, study); assert.equal(proposal.relations[0].target, living);
  assertLeft(proposal.draft, study, living);
});
