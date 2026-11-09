import assert from 'node:assert/strict'
import test from 'node:test'
import type { StorageMapDraft } from '../src/lib/storage/map-types'
import { rectangleCells, regionBounds } from '../src/components/storage-map/editor-state'
import { beginRegionTransform, commitRegionTransform, previewRegionTransform, resizeRectangle } from '../src/components/storage-map/region-interaction'

const draft: StorageMapDraft = {
  base_map_revision: 1, map_draft_id: 'draft', draft_revision: 3, name: '지도', columns: 12, rows: 8, new_locations: [],
  regions: [
    { id: 'a', location_id: 'study', client_location_key: null, color_key: 'green', cells: rectangleCells({ col: 1, row: 1, width: 3, height: 3 }) },
    { id: 'b', location_id: 'living', client_location_key: null, color_key: 'yellow', cells: rectangleCells({ col: 7, row: 1, width: 3, height: 3 }) },
  ],
  anchors: [{ region_id: 'a', container_id: 'one', col: 1, row: 1 }, { region_id: 'a', container_id: 'two', col: 3, row: 3 }],
}

test('move preview snaps by pointer delta, carries anchors, and does not mutate the draft before release', () => {
  const before = structuredClone(draft)
  const gesture = beginRegionTransform(draft, 'a', 'move', { col: 1.9, row: 1.3 })!
  const preview = previewRegionTransform(draft, gesture, { col: 3.8, row: 2.4 })
  assert.deepEqual(preview.rectangle, { col: 3, row: 2, width: 3, height: 3 })
  assert.deepEqual(preview.draft.anchors.map(({ col, row }) => ({ col, row })), [{ col: 3, row: 2 }, { col: 5, row: 4 }])
  assert.deepEqual(draft, before)
  assert.equal(preview.draft.draft_revision, 3)
  const result = commitRegionTransform(draft, gesture, { col: 3.8, row: 2.4 })
  assert.equal(result.changed, true)
  assert.equal(result.draft.draft_revision, 4)
  assert.deepEqual(regionBounds(result.draft.regions[0].cells), preview.rectangle)
})

test('overlap and out-of-map release are rejected, leaving every region and anchor untouched', () => {
  const gesture = beginRegionTransform(draft, 'a', 'move', { col: 1, row: 1 })!
  for (const point of [{ col: 7, row: 1 }, { col: -1, row: 1 }, { col: 11, row: 7 }]) {
    const result = commitRegionTransform(draft, gesture, point)
    assert.ok(result.problem)
    assert.equal(result.changed, false)
    assert.equal(result.draft, draft)
  }
})

test('Escape, pointer cancellation, locks, and a changed draft cannot commit a preview', () => {
  const gesture = beginRegionTransform(draft, 'a', 'move', { col: 1, row: 1 })!
  for (const options of [{ cancelled: true }, { disabled: true }]) {
    const result = commitRegionTransform(draft, gesture, { col: 3, row: 2 }, options)
    assert.equal(result.draft, draft)
    assert.equal(result.changed, false)
  }
  const revised = { ...draft, draft_revision: 4 }
  const result = commitRegionTransform(revised, gesture, { col: 3, row: 2 })
  assert.equal(result.draft, revised)
  assert.match(result.problem!, /초안/)
  assert.equal(commitRegionTransform(draft, gesture, gesture.start).draft, draft, 'selecting without moving must not create a draft revision')
})

test('edge and corner handles keep the opposite boundary fixed and never invert a region', () => {
  const original = { col: 2, row: 2, width: 3, height: 3 }
  assert.deepEqual(resizeRectangle(original, 'nw', -1, -1), { col: 1, row: 1, width: 4, height: 4 })
  assert.deepEqual(resizeRectangle(original, 'se', 1, 2), { col: 2, row: 2, width: 4, height: 5 })
  assert.deepEqual(resizeRectangle(original, 'n', 5, 1), { col: 2, row: 3, width: 3, height: 2 })
  assert.deepEqual(resizeRectangle(original, 'w', 20, 8), { col: 4, row: 2, width: 1, height: 3 })
  assert.deepEqual(resizeRectangle(original, 'e', -20, 8), { col: 2, row: 2, width: 1, height: 3 })
})

test('left/top resizing preserves marker coordinates and reports only markers outside the new cells', () => {
  const gesture = beginRegionTransform(draft, 'a', 'resize', { col: 1, row: 1 }, 'nw')!
  const expanded = commitRegionTransform(draft, gesture, { col: 0, row: 0 })
  assert.deepEqual(expanded.draft.anchors, draft.anchors)
  const shrunk = previewRegionTransform(draft, gesture, { col: 2, row: 2 })
  assert.deepEqual(shrunk.removedAnchors.map(anchor => anchor.container_id), ['one'])
  assert.deepEqual(shrunk.draft.anchors, [draft.anchors[1]])
  assert.deepEqual(draft.anchors.length, 2, 'resize preview does not drop persisted draft anchors')
})

test('placing a marker from selected region bounds produces a valid strict save payload without width or height', async () => {
  const { mapAnchorAt } = await import('../src/components/storage-map/editor-state')
  const { storageMapDraftSchema } = await import('../src/lib/storage/map-schema')
  const regionId = crypto.randomUUID(), containerId = crypto.randomUUID()
  const bounds = regionBounds(draft.regions[0].cells)
  const payload = {
    ...draft, map_draft_id: crypto.randomUUID(),
    regions: [{ ...draft.regions[0], id: regionId, location_id: crypto.randomUUID() }],
    anchors: [mapAnchorAt(containerId, regionId, bounds)],
  }
  assert.equal(storageMapDraftSchema.safeParse(payload).success, true)
  assert.deepEqual(payload.anchors[0], { container_id: containerId, region_id: regionId, col: 1, row: 1 })
})
