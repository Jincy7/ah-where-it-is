import test from 'node:test'
import assert from 'node:assert/strict'
import type { StorageAction } from '../src/lib/storage/types'
import type { StorageMapDraft } from '../src/lib/storage/map-types'
import type { StorageMapProposal } from '../src/lib/storage/map-proposal-types'
import { mapProposalProblem, sameMapDraft } from '../src/components/storage-workspace/map-proposal-state'

const draft: StorageMapDraft = { base_map_revision: 2, map_draft_id: 'draft-a', draft_revision: 3, name: '집', columns: 12, rows: 8, regions: [], anchors: [], new_locations: [] }
const proposal = { base: { map_revision: 2, draft_id: 'draft-a', draft_revision: 3 }, draft: { ...draft, draft_revision: 4 } } as StorageMapProposal
const action = (type: StorageAction['type']) => ({ type, status: 'prepared' }) as StorageAction

test('accepts current proposals but rejects results after editing, discarding or replacing the draft', () => {
  assert.equal(mapProposalProblem(draft, proposal, null, false), null)
  assert.match(mapProposalProblem({ ...draft, draft_revision: 4 }, proposal, null, false)!, /초안/)
  assert.match(mapProposalProblem(null, proposal, null, false)!, /초안/)
  assert.match(mapProposalProblem({ ...draft, map_draft_id: 'draft-b' }, proposal, null, false)!, /초안/)
})
test('initial proposal accepts an empty workspace but not a draft opened while generation ran', () => {
  const initial = { ...proposal, base: { map_revision: null, draft_id: null, draft_revision: null }, draft: { ...draft, base_map_revision: null, draft_revision: 1 } }
  assert.equal(mapProposalProblem(null, initial, null, false), null)
  assert.match(mapProposalProblem(draft, initial, null, false)!, /초안/)
})
test('item approvals permit local proposals, but prepared map and uncertain operations are protected', () => {
  assert.equal(mapProposalProblem(draft, proposal, action('register_items'), false), null)
  assert.match(mapProposalProblem(draft, proposal, action('save_storage_map'), false)!, /지도 변경안/)
  assert.match(mapProposalProblem(draft, proposal, null, true)!, /결과/)
})
test('proposal identity advances exactly once and cannot silently change the saved revision', () => {
  assert.match(mapProposalProblem(draft, { ...proposal, draft: { ...proposal.draft, draft_revision: 3 } }, null, false)!, /초안/)
  assert.match(mapProposalProblem(draft, { ...proposal, draft: { ...proposal.draft, base_map_revision: 7 } }, null, false)!, /기준/)
  assert.equal(sameMapDraft(draft, { ...draft }), true)
  assert.equal(sameMapDraft(draft, { ...draft, draft_revision: 4 }), false)
  assert.equal(sameMapDraft(null, draft), false)
})
