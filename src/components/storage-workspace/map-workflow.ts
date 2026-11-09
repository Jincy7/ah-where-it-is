import type { StorageAction } from '@/lib/storage/types'
import type { StorageMapDraft } from '@/lib/storage/map-types'

/** Geometry has its own draft. Never revise another domain's approval in place. */
export function mapActionConflict(active: StorageAction | null, nextType: StorageAction['type']): string | null {
  if (active?.status !== 'prepared') return null
  if (active.type === 'save_storage_map') return '지도 변경안을 확정하거나 취소한 뒤 다른 작업을 진행해주세요'
  if (nextType === 'save_storage_map') return '진행 중인 변경안을 확정하거나 취소한 뒤 지도를 저장해주세요'
  return null
}

export function mapDraftAcceptsAction(draft: StorageMapDraft | null, action: StorageAction): boolean {
  if (action.type !== 'save_storage_map') return true
  return Boolean(draft && action.payload.map_draft_id === draft.map_draft_id && action.payload.draft_revision === draft.draft_revision)
}
