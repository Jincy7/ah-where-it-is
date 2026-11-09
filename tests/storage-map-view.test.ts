import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createStorageMapView, type StorageMapSceneData } from '../src/lib/storage/map-types'
import { mapEvidenceChanged } from '../src/components/storage-map/storage-map-chat-card'
import { StorageMapScene } from '../src/components/storage-map/storage-map-scene'
import { StorageMapPreview } from '../src/components/storage-map/storage-map-preview'

const scene: StorageMapSceneData = {
  map: { id: 'map', name: '우리 집', columns: 12, rows: 8, revision: 1, schema_version: 1, updated_at: '2026-11-09T00:00:00Z' },
  regions: [{ id: 'region', location_id: 'location', client_location_key: null, color_key: 'green', location_name: '서재', cells: [{ col: 2, row: 1 }, { col: 3, row: 1 }] }],
  anchors: [{ region_id: 'region', container_id: 'container', col: 2, row: 1 }],
  locations: [{ id: 'location', name: '서재', version: 1, container_count: 1, item_count: 1 }],
  containers: [{ id: 'container', name: '서랍', location_id: 'location', version: 1, item_count: 1 }],
  evidence_at: '2026-11-09T00:00:00Z', truncated: false, resolution: null,
}
test('full-map history marks domain renames/count changes even without a map revision change', () => {
  const view = createStorageMapView(scene)
  assert.equal(mapEvidenceChanged(view, structuredClone(scene)), false)
  assert.equal(mapEvidenceChanged(view, { ...scene, locations: [{ ...scene.locations[0], name: '작은방', version: 2 }] }), true)
  assert.equal(mapEvidenceChanged(view, { ...scene, containers: [{ ...scene.containers[0], item_count: 2 }] }), true)
  assert.equal(mapEvidenceChanged(view, { ...scene, map: { ...scene.map!, revision: 2 } }), true)
})
test('target history marks item movement without a geometry revision and detects deleted evidence', () => {
  const target = { kind: 'item' as const, id: 'item' }
  const resolved = { ...scene, resolution: { target, status: 'found' as const, region_id: 'region', anchor: scene.anchors[0], placement: 'placed' as const, versions: { item: 1, container: 1 } } }
  const view = createStorageMapView(resolved, target)
  assert.equal(mapEvidenceChanged(view, { ...resolved, resolution: { ...resolved.resolution, versions: { item: 2, container: 1 } } }), true)
  assert.equal(mapEvidenceChanged(view, { ...resolved, resolution: { ...resolved.resolution, status: 'deleted', versions: {} } }), true)
})
test('shared renderer preserves coordinates and stacks same-cell anchors in both sizes', () => {
  const props = { columns: 12, rows: 8, regions: scene.regions, containers: scene.containers, anchors: [...scene.anchors, { ...scene.anchors[0], container_id: 'second' }] }
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(createElement(StorageMapScene, { ...props, compact }))
    assert.match(html, /viewBox="0 0 480 320"/)
    assert.match(html, /data-region-id="region"/)
    assert.match(html, /x="82" y="42" width="76" height="36"/)
    assert.match(html, /data-container-ids="container,second"/)
    assert.match(html, /translate\(100 69\)/)
    assert.match(html, /보관함 2개/)
  }
})
test('approval preview exposes new places and removed markers from its frozen payload', () => {
  const value = { ...scene, new_locations: [{ name: '주방' }], removed_anchors: [{ container_id: 'container', container_name: '서랍' }], newly_unplaced_containers: [{ id: 'pantry', name: '식재료 수납함' }] }
  const html = renderToStaticMarkup(createElement(StorageMapPreview, { value }))
  assert.match(html, /함께 생성할 장소/)
  assert.match(html, /주방/)
  assert.match(html, /미배치로 바뀌는 보관함/)
  assert.match(html, /서랍/)
  assert.match(html, /장소·보관함·물품 기록은 유지/)
  assert.match(html, /새 구획에서 위치를 지정할 보관함/)
  assert.match(html, /식재료 수납함/)
})
