import type { ItemDraft } from '@/lib/ai/schema'
import type { StorageAction, WorkspaceItem } from '@/lib/storage/types'
import type { StorageMapDraft, StorageMapView } from '@/lib/storage/map-types'
import type { MapRelation, StorageMapProposal } from '@/lib/storage/map-proposal-types'

export type PhotoConversationDraft = {
  photo_id: string
  revision: number
  items: ItemDraft[]
  retain: boolean
  media_id?: string
}
export type PhotoDraftUpdate = { photo_id: string; expected_revision: number; items: ItemDraft[] }

export interface AssistantPanelProps {
  active?: boolean
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
  onMessage: (message: { id: string; role: 'user' | 'assistant'; content: string }) => void
  onBusyChange?: (busy: boolean) => void
  onAttachPhoto?: () => void
  onTakePhoto?: () => void
  onManage?: () => void
  onDirectRegister?: () => void
  onSearch?: () => void
  prompt?: { id: number; text: string }
  contextLabel?: string
  selectedContainerId: string | null
  searchScope: string | null
  registrationContainerId: string | null
  activeAction: StorageAction | null
  activeActionLocked?: boolean
  photoDrafts: PhotoConversationDraft[]
  onPhotoDraft: (draft: PhotoDraftUpdate) => boolean
  onSearchResults: (items: WorkspaceItem[]) => void
  onMapView: (view: StorageMapView) => void
  mapProposalContext?: { draft: StorageMapDraft; previous_relations: MapRelation[] }
  mapDraftGeneration: number
  onMapProposal: (proposal: StorageMapProposal, generation: number) => boolean
  onAction: (action: StorageAction) => void
}

export type PrepareChange = (
  type: StorageAction['type'],
  payload: Record<string, unknown>,
  expectedVersions?: Record<string, number>,
) => Promise<StorageAction>

export async function storageRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const data = await response.json()
  if (!response.ok) {
    throw new StorageRequestError(data.error || '요청을 처리하지 못했습니다. 다시 시도해주세요', response.status)
  }
  return data as T
}

export class StorageRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}
