import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPhotoDraftUpdate, photoActionStatus, photoDraftAcceptsAction } from '../src/components/storage-workspace/photo-state'
import type { StorageAction } from '../src/lib/storage/types'

const action: StorageAction = {
  action_id: 'action-a', revision: 1, type: 'register_items',
  payload: { source_photo_id: 'photo-one', container_id: 'container', items: [] },
  payload_hash: 'hash', idempotency_key: 'key', expected_versions: {}, status: 'prepared',
  preview: { title: '등록', before: null, after: null, affected_items: [] }, receipt: null,
}
const photo = { id: 'photo-one', actionId: 'action-a', actionRevision: 1 }

test('a second photo replacing a pending action cannot mark the first photo saved', () => {
  const replaced = { ...action, revision: 2, status: 'completed' as const, payload: { source_photo_id: 'photo-two' } }
  assert.equal(photoActionStatus(photo, replaced), null)
  assert.equal(photoActionStatus({ id: 'photo-two', actionId: 'action-a', actionRevision: 2 }, replaced), 'completed')
})

test('an unrelated manual action cannot complete a photo', () => {
  assert.equal(photoActionStatus(photo, { ...action, type: 'move_item', status: 'completed' }), null)
  assert.equal(photoActionStatus({ id: 'unprepared-photo' }, null), null)
})

test('confirmed correction of the same photo completes it, stale revisions do not', () => {
  assert.equal(photoActionStatus(photo, { ...action, revision: 2, status: 'completed' }), 'completed')
  assert.equal(photoActionStatus({ ...photo, actionRevision: 3 }, { ...action, revision: 2, status: 'completed' }), null)
  assert.equal(photoActionStatus(photo, { ...action, status: 'cancelled' }), 'cancelled')
})


test('AI can associate a photo preparation before the local registration button was used', () => {
  assert.equal(photoActionStatus({ id: 'photo-one' }, action), 'prepared')
  assert.equal(photoActionStatus({ id: 'photo-one' }, { ...action, status: 'completed' }), 'completed')
  assert.equal(photoActionStatus({ id: 'photo-two' }, action), null)
})

test('AI draft edits preserve photo assets and cannot overwrite newer user edits', () => {
  const items = [{ name: '충전기', quantity: 1, description: '', uncertainty: '' }]
  const current = { id: 'photo-one', revision: 3, status: 'ready', items, blob: 'original-blob', retain: true }
  const update = { photo_id: 'photo-one', expected_revision: 3, items: [{ ...items[0], quantity: 2 }] }
  const revised = applyPhotoDraftUpdate(current, update)
  assert.equal(revised.revision, 4)
  assert.equal(revised.items[0].quantity, 2)
  assert.equal(revised.blob, 'original-blob')
  assert.equal(revised.retain, true)
  assert.equal(applyPhotoDraftUpdate(revised, update), revised)
  assert.equal(applyPhotoDraftUpdate(current, update, true), current)
  assert.equal(applyPhotoDraftUpdate({ ...current, status: 'saved' }, update).items[0].quantity, 1)
})


test('prepared AI registration cannot replace photo edits made after the request', () => {
  const drafts = [{ photo_id: 'photo-one', revision: 4, items: [], retain: false }]
  const proposed = { ...action, payload: { ...action.payload, source_photo_revision: 3 } }
  assert.equal(photoDraftAcceptsAction(drafts, proposed), false)
  assert.equal(photoDraftAcceptsAction(drafts, { ...proposed, payload: { ...proposed.payload, source_photo_revision: 4 } }), true)
  assert.equal(photoDraftAcceptsAction([], proposed), false)
  assert.equal(photoDraftAcceptsAction([], { ...proposed, status: 'completed' }), true)
})
