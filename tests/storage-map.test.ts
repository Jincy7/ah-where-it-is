import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rectangleCells, moveRegion, resizeRegion } from '../src/lib/storage/map-geometry';
import { storageMapDraftSchema } from '../src/lib/storage/map-schema';
import { createStorageMapView, type StorageMapDraft } from '../src/lib/storage/map-types';
const location = randomUUID(), region = randomUUID(), container = randomUUID();
function draft(): StorageMapDraft {
  return { base_map_revision: null, map_draft_id: randomUUID(), draft_revision: 1, name: '우리 집', columns: 12, rows: 8, new_locations: [], regions: [{ id: region, location_id: location, client_location_key: null, color_key: 'green', cells: rectangleCells({ col: 2, row: 1 }, { col: 5, row: 3 }) }], anchors: [{ region_id: region, container_id: container, col: 5, row: 3 }] };
}
test('inclusive rectangle drag normalizes both directions and accepts single cells', () => {
  const forward = rectangleCells({ col: 2, row: 1 }, { col: 5, row: 3 });
  assert.equal(forward.length, 12);
  assert.deepEqual(forward, rectangleCells({ col: 5, row: 3 }, { col: 2, row: 1 }));
  assert.deepEqual(rectangleCells({ col: 0, row: 0 }, { col: 0, row: 0 }), [{ col: 0, row: 0 }]);
});
test('server schema rejects overlap, holes, out-of-bounds, ambiguous place links and invalid anchors', () => {
  assert.equal(storageMapDraftSchema.safeParse(draft()).success, true);
  const invalid: StorageMapDraft[] = [];
  let d = draft(); d.regions[0].cells.pop(); invalid.push(d);
  d = draft(); d.columns = 5; invalid.push(d);
  d = draft(); d.regions[0].cells[0].col = 1.5; invalid.push(d);
  d = draft(); d.regions.push({ ...d.regions[0], id: randomUUID(), location_id: randomUUID() }); invalid.push(d);
  d = draft(); d.regions[0].location_id = null; invalid.push(d);
  d = draft(); d.anchors[0].col = 8; invalid.push(d);
  d = draft(); d.anchors.push({ ...d.anchors[0] }); invalid.push(d);
  d = draft(); d.regions[0].cells = [{ col: 0, row: 0 }, { col: 1, row: 1 }]; invalid.push(d);
  d = draft(); d.regions.push({ ...d.regions[0], id: randomUUID(), cells: [{ col: 8, row: 7 }] }); invalid.push(d);
  for (const value of invalid) assert.equal(storageMapDraftSchema.safeParse(value).success, false);
});
test('region movement carries markers; shrinking reports removed markers without changing domain records', () => {
  const original = draft();
  const moved = moveRegion(original, region, 3, 2);
  assert.deepEqual(moved.anchors[0], { region_id: region, container_id: container, col: 8, row: 5 });
  assert.equal(moved.regions[0].location_id, location);
  assert.equal(original.anchors[0].col, 5);
  const resized = resizeRegion(original, region, [{ col: 2, row: 1 }]);
  assert.deepEqual(resized.removedAnchors, original.anchors);
  assert.deepEqual(resized.draft.anchors, []);
});
test('temporary places must be referenced exactly once and view retains evidence versions', () => {
  const d = draft(), key = randomUUID();
  d.regions[0].location_id = null; d.regions[0].client_location_key = key; d.new_locations = [{ client_location_key: key, name: '서재' }]; d.anchors = [];
  assert.equal(storageMapDraftSchema.safeParse(d).success, true);
  d.new_locations.push({ client_location_key: randomUUID(), name: '미연결' });
  assert.equal(storageMapDraftSchema.safeParse(d).success, false);
  const target = { kind: 'item' as const, id: randomUUID() };
  const scene = { map: null, regions: [], anchors: [], containers: [], locations: [], evidence_at: new Date().toISOString(), truncated: false, resolution: { target, status: 'deleted' as const, region_id: null, anchor: null, placement: 'deleted' as const, versions: {} } };
  assert.deepEqual(createStorageMapView(scene, target).highlight_item_ids, [target.id]);
  assert.equal(createStorageMapView(scene).created_map_revision, null);
});
