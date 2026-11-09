import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { StorageMapProposal } from '../src/lib/storage/map-proposal-types'
import { StorageMapProposalCard, proposalCardControls } from '../src/components/storage-map/storage-map-proposal-card'

const draft = {
  base_map_revision: null, map_draft_id: 'draft', draft_revision: 1, name: '우리 집 지도', columns: 12, rows: 8,
  regions: [
    { id: 'study-region', location_id: 'study', client_location_key: null, color_key: 'green' as const, cells: [{ col: 1, row: 1 }] },
    { id: 'kitchen-region', location_id: null, client_location_key: 'kitchen', color_key: 'yellow' as const, cells: [{ col: 3, row: 1 }] },
  ],
  anchors: [{ container_id: 'desk', region_id: 'study-region', col: 1, row: 1 }],
  new_locations: [{ client_location_key: 'kitchen', name: '주방' }],
}
const proposal: StorageMapProposal = {
  proposal_id: 'proposal', base: { map_revision: null, draft_id: null, draft_revision: null }, draft,
  relations: [{ subject: 'study', relation: 'left_of', target: 'kitchen' }],
  relation_descriptions: ['서재는 주방의 왼쪽'], assumptions: ['말씀하지 않은 위치는 임시로 배치했습니다.'],
  recommended_location_keys: ['kitchen'], suggested_anchor_ids: ['desk'],
  source: { location_count: 1, container_count: 1, unassigned_container_count: 0 },
  preview: {
    map: { id: 'draft', name: '우리 집 지도', columns: 12, rows: 8, revision: 0, schema_version: 1, updated_at: '2026-11-09T00:00:00Z' },
    regions: draft.regions.map((region, index) => ({ ...region, location_name: index ? '주방' : '서재' })),
    anchors: draft.anchors,
    locations: [{ id: 'study', name: '서재', version: 1, container_count: 1, item_count: 1 }],
    containers: [{ id: 'desk', name: '책상 서랍', location_id: 'study', version: 1, item_count: 1 }],
    evidence_at: '2026-11-09T00:00:00Z', truncated: false, resolution: null,
  },
}
const callbacks = { onPrepare: async () => {}, onEdit: () => {}, onCancel: () => {} }

test('proposal renders a real unsaved preview and distinguishes observed inventory from recommended places and markers', () => {
  const html = renderToStaticMarkup(createElement(StorageMapProposalCard, { proposal, ...callbacks }))
  assert.match(html, /배치 제안/)
  assert.match(html, /아직 저장되지 않음/)
  assert.match(html, /viewBox="0 0 480 320"/)
  assert.match(html, /data-region-id="study-region"/)
  assert.match(html, /서재는 주방의 왼쪽/)
  assert.match(html, /기존 장소/)
  assert.match(html, /추천 새 장소/)
  assert.match(html, /추천 표식/)
  assert.match(html, /말씀하지 않은 위치는 임시로 배치했습니다/)
  assert.match(html, /변경 내용 확인/)
  assert.doesNotMatch(html, /저장 확인<\/button>|저장 완료|표식은 마지막 기록 위치/)
})

test('superseded and cancelled proposals have no buttons that can apply their stale draft', () => {
  for (const status of ['superseded', 'cancelled', 'completed'] as const) {
    const html = renderToStaticMarkup(createElement(StorageMapProposalCard, { proposal, status, ...callbacks }))
    assert.doesNotMatch(html, /<button/)
    assert.equal(proposalCardControls({ status }).prepare, false)
  }
  assert.equal(proposalCardControls({ interactive: false }).prepare, false)
})

test('pending item action blocks proposal preparation but preserves direct local editing', () => {
  const state = proposalCardControls({ blockedReason: '진행 중인 변경안을 먼저 확인해주세요.' })
  assert.equal(state.prepare, false)
  assert.equal(state.edit, true)
  assert.equal(state.cancel, true)
  const html = renderToStaticMarkup(createElement(StorageMapProposalCard, { proposal, blockedReason: '진행 중인 변경안을 먼저 확인해주세요.', ...callbacks }))
  assert.match(html, /진행 중인 변경안을 먼저 확인해주세요/)
  assert.match(html, /disabled=""[^>]*>[\s\S]*?변경 내용 확인/)
})

test('prepared or uncertain map proposals cannot be changed without successful cancellation', () => {
  assert.deepEqual(proposalCardControls({ status: 'prepared' }), { prepare: false, edit: false, cancel: false, editPrepared: false })
  assert.equal(proposalCardControls({ status: 'prepared', canEditPrepared: true }).editPrepared, true)
  for (const flag of [{ busy: true }, { locked: true }]) {
    const state = proposalCardControls({ status: 'prepared', canEditPrepared: true, ...flag })
    assert.equal(state.editPrepared, false)
    assert.equal(proposalCardControls(flag).prepare, false)
    assert.equal(proposalCardControls(flag).edit, false)
  }
})

test('empty inventory recommendations are labeled as new suggestions rather than existing places', () => {
  const empty = structuredClone(proposal)
  empty.source = { location_count: 0, container_count: 0, unassigned_container_count: 0 }
  empty.draft.regions[0].location_id = null
  empty.draft.regions[0].client_location_key = 'new-study'
  empty.draft.new_locations.push({ client_location_key: 'new-study', name: '서재' })
  empty.draft.anchors = []
  empty.preview.regions[0] = { ...empty.draft.regions[0], location_name: '서재' }
  empty.preview.anchors = []
  empty.preview.locations = []
  empty.preview.containers = []
  empty.recommended_location_keys.push('new-study')
  empty.suggested_anchor_ids = []
  const html = renderToStaticMarkup(createElement(StorageMapProposalCard, { proposal: empty, ...callbacks }))
  assert.match(html, /등록된 장소가 없어 시작할 장소를 추천했습니다/)
  assert.match(html, /등록된 장소 0개 · 보관함 0개/)
  assert.doesNotMatch(html, />기존 장소</)
  assert.equal((html.match(/>추천 새 장소</g) ?? []).length, 2)
})
