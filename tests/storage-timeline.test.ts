import assert from 'node:assert/strict'
import test from 'node:test'
import type { StorageAction, WorkspaceItem } from '../src/lib/storage/types'
import { initialConversation, PHOTO_ENTRY_ID, receiveConversationAction, refreshConversationResults, revealPhotoEntry } from '../src/components/storage-workspace/timeline'

function action(id: string, revision = 1, status: StorageAction['status'] = 'prepared'): StorageAction {
  return { action_id: id, revision, status, type: 'move_item', payload: {}, payload_hash: `hash-${revision}`, idempotency_key: `key-${revision}`, expected_versions: {}, preview: { title: '이동', before: null, after: null, affected_items: [] }, receipt: null }
}
function item(id: string, container_name = '첫 보관함'): WorkspaceItem {
  return { id, name: '충전기', quantity: 1, description: null, version: 1, container_id: 'container-id', container_name, location_name: '작업방', match_reason: '물품명 일치', media: [], created_at: '2026-11-08T00:00:00Z', updated_at: '2026-11-08T00:00:00Z' }
}

test('an action revision and its receipt stay at the original timeline entry', () => {
  let state = receiveConversationAction(initialConversation(), action('a'))
  state = { ...state, entries: [...state.entries, { id: 'later-message', kind: 'message', role: 'user', content: '다른 서랍으로 바꿔줘' }] }
  state = receiveConversationAction(state, action('a', 2))
  state = receiveConversationAction(state, action('a', 2, 'completed'))
  assert.deepEqual(state.entries.map(entry => entry.id), [PHOTO_ENTRY_ID, 'action:a', 'later-message'])
  assert.equal(state.actions.a.status, 'completed')
  assert.equal(receiveConversationAction(state, action('a', 1)), state)
  assert.equal(receiveConversationAction(state, action('a', 2)), state)
})

test('an old receipt cannot replace the active prepared action', () => {
  let state = receiveConversationAction(initialConversation(), action('a'))
  state = receiveConversationAction(state, action('b'))
  state = receiveConversationAction(state, action('a', 1, 'completed'))
  assert.equal(state.activeActionId, 'b')
  assert.equal(state.actions.a.status, 'completed')
  assert.equal(state.actions.b.status, 'prepared')
})

test('photo activation moves one stable placeholder without duplicating it', () => {
  const entries = [...initialConversation().entries, { id: 'message', kind: 'message' as const, role: 'user' as const, content: '사진으로 정리할게' }]
  const revealed = revealPhotoEntry(entries)
  assert.deepEqual(revealed.map(entry => entry.id), ['message', PHOTO_ENTRY_ID])
  assert.equal(revealPhotoEntry(revealed).filter(entry => entry.kind === 'photos').length, 1)
})

test('refresh updates earlier result snapshots without moving or adding unrelated records', () => {
  const entries = [{ id: 'first-search', kind: 'results' as const, items: [item('a'), item('b')] }, { id: 'second-search', kind: 'results' as const, items: [item('c')] }]
  const updated = refreshConversationResults(entries, [item('a', '책상 서랍'), item('new')], ['b'])
  assert.deepEqual(updated.map(entry => entry.id), ['first-search', 'second-search'])
  assert.equal(updated[0].kind, 'results')
  if (updated[0].kind === 'results') {
    assert.deepEqual(updated[0].items.map(value => value.id), ['a'])
    assert.equal(updated[0].items[0].container_name, '책상 서랍')
  }
  if (updated[1].kind === 'results') assert.deepEqual(updated[1].items.map(value => value.id), ['c'])
})


test('late status of a superseded prepared action never steals the current action', () => {
  let state = receiveConversationAction(initialConversation(), action('a'))
  state = receiveConversationAction(state, action('b'))
  state = receiveConversationAction(state, action('a'))
  assert.equal(state.activeActionId, 'b')
  state = receiveConversationAction(state, action('a', 2))
  assert.equal(state.activeActionId, 'b')
  assert.equal(state.actions.a.revision, 2)
  state = receiveConversationAction(state, action('a', 2, 'cancelled'))
  assert.equal(receiveConversationAction(state, action('a', 3)), state)
})
