import type { StorageAction } from '@/lib/storage/types'
import type { StorageMapDraft } from '@/lib/storage/map-types'
import type { StorageMapProposal } from '@/lib/storage/map-proposal-types'

export function sameMapDraft(a: StorageMapDraft | null, b: StorageMapDraft): boolean {
  return !!a && a.map_draft_id === b.map_draft_id && a.draft_revision === b.draft_revision && a.base_map_revision === b.base_map_revision
}

/** A proposal can only advance the exact draft it read. Saved approvals have priority. */
export function mapProposalProblem(current: StorageMapDraft | null, proposal: StorageMapProposal, action: StorageAction | null, locked: boolean): string | null {
  if (locked) return '진행 중인 작업 결과를 먼저 확인해주세요'
  if (action?.type === 'save_storage_map' && action.status === 'prepared') return '지도 변경안을 확정하거나 취소한 뒤 배치를 제안해주세요'
  const base = proposal.base
  if ((current?.map_draft_id ?? null) !== base.draft_id || (current?.draft_revision ?? null) !== base.draft_revision) return '지도 초안이 바뀌어 이전 배치 제안을 적용하지 않았습니다. 현재 초안으로 다시 요청해주세요'
  if (proposal.draft.base_map_revision !== base.map_revision || (current && current.base_map_revision !== base.map_revision)) return '지도의 기준 기록이 바뀌었습니다. 최신 지도와 초안을 비교해주세요'
  if (proposal.draft.draft_revision !== (current?.draft_revision ?? 0) + 1 || (current && proposal.draft.map_draft_id !== current.map_draft_id)) return '지도 초안의 버전이 맞지 않아 제안을 적용하지 않았습니다'
  return null
}
