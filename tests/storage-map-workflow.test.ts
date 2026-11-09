import assert from 'node:assert/strict'
import test from 'node:test'
import { mapActionConflict, mapDraftAcceptsAction } from '../src/components/storage-workspace/map-workflow'
import { initialConversation, receiveConversationAction, refreshConversationResults } from '../src/components/storage-workspace/timeline'
import { createStorageMapView } from '../src/lib/storage/map-types'
import type { StorageMapDraft, StorageMapSceneData } from '../src/lib/storage/map-types'
import type { StorageAction } from '../src/lib/storage/types'

const draft: StorageMapDraft = { map_draft_id: 'draft', draft_revision: 2, base_map_revision: null, name: '집', columns: 12, rows: 8, regions: [], anchors: [], new_locations: [] }
function action(type: StorageAction['type'], status: StorageAction['status'] = 'prepared'): StorageAction {
  return { action_id: 'action', type, status, revision: 1, payload: { ...draft }, payload_hash: 'hash', idempotency_key: 'key', expected_versions: {}, preview: { title: '확인', before: null, after: null, affected_items: [] }, receipt: null }
}

test('map approval cannot replace a prepared item action, or be replaced by one', () => {
  assert.ok(mapActionConflict(action('register_items'), 'save_storage_map'))
  assert.ok(mapActionConflict(action('save_storage_map'), 'register_items'))
  assert.ok(mapActionConflict(action('save_storage_map'), 'save_storage_map'), 'edit requires successful cancellation first')
  assert.equal(mapActionConflict(action('register_items'), 'move_item'), null)
  assert.equal(mapActionConflict(action('save_storage_map', 'cancelled'), 'save_storage_map'), null)
  assert.equal(mapActionConflict(action('save_storage_map', 'completed'), 'create_location'), null)
})

test('late map responses cannot replace a newer draft or a discarded draft', () => {
  const proposal = action('save_storage_map')
  assert.equal(mapDraftAcceptsAction(draft, proposal), true)
  assert.equal(mapDraftAcceptsAction(null, proposal), false)
  assert.equal(mapDraftAcceptsAction({ ...draft, draft_revision: 3 }, proposal), false)
  assert.equal(mapDraftAcceptsAction({ ...draft, map_draft_id: 'other' }, proposal), false)
  assert.equal(mapDraftAcceptsAction(null, action('create_location')), true)
})

test('live map cards keep evidence while action receipts and inventory refresh separately', () => {
  const scene: StorageMapSceneData = { map: null, regions: [], anchors: [], locations: [], containers: [], evidence_at: '2026-11-09T00:00:00Z', resolution: null, truncated: false }
  const view = createStorageMapView(scene)
  const entry = { id: 'map', kind: 'map' as const, view }
  let state = initialConversation()
  state.entries.push(entry)
  state = receiveConversationAction(state, action('save_storage_map'))
  state = receiveConversationAction(state, action('save_storage_map', 'completed'))
  const refreshed = refreshConversationResults(state.entries, [])
  assert.equal(refreshed.find(value => value.id === 'map'), entry)
  assert.equal(view.created_map_revision, null)
  assert.equal(view.evidence_at, scene.evidence_at)
})
