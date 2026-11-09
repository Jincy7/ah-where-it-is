import type { StorageAction, WorkspaceItem } from '@/lib/storage/types'
import type { StorageMapView } from '@/lib/storage/map-types'
import type { StorageMapProposal } from '@/lib/storage/map-proposal-types'

export type ChatEntry =
  | { id: string; kind: 'message'; role: 'user' | 'assistant'; content: string }
  | { id: string; kind: 'results'; items: WorkspaceItem[]; title?: string; containerId?: string }
  | { id: string; kind: 'action'; actionId: string }
  | { id: string; kind: 'photos' }
  | { id: string; kind: 'map'; view: StorageMapView }
  | { id: string; kind: 'map_proposal'; proposal: StorageMapProposal }

export type ConversationState = {
  entries: ChatEntry[]
  actions: Record<string, StorageAction>
  activeActionId: string | null
}

export const PHOTO_ENTRY_ID = 'conversation-photos'
export function initialConversation(): ConversationState {
  return { entries: [{ id: PHOTO_ENTRY_ID, kind: 'photos' }], actions: {}, activeActionId: null }
}

export function receiveConversationAction(state: ConversationState, action: StorageAction): ConversationState {
  const current = state.actions[action.action_id]
  if (current && (current.revision > action.revision || (current.status !== 'prepared' && action.status === 'prepared'))) return state
  const exists = state.entries.some(entry => entry.kind === 'action' && entry.actionId === action.action_id)
  return {
    entries: exists ? state.entries : [...state.entries, { id: `action:${action.action_id}`, kind: 'action', actionId: action.action_id }],
    actions: { ...state.actions, [action.action_id]: action },
    activeActionId: !state.activeActionId || (!exists && action.status === 'prepared') ? action.action_id : state.activeActionId,
  }
}

export function revealPhotoEntry(entries: ChatEntry[]): ChatEntry[] {
  return [...entries.filter(entry => entry.kind !== 'photos'), { id: PHOTO_ENTRY_ID, kind: 'photos' }]
}

/** Keep each search in its original turn; only refresh records already in that snapshot. */
export function refreshConversationResults(entries: ChatEntry[], items: WorkspaceItem[], deletedIds: string[] = []): ChatEntry[] {
  const current = new Map(items.map(item => [item.id, item]))
  const deleted = new Set(deletedIds)
  return entries.map(entry => entry.kind === 'results'
    ? { ...entry, items: entry.containerId ? items.filter(item => item.container_id === entry.containerId && !deleted.has(item.id)) : entry.items.filter(item => !deleted.has(item.id)).map(item => current.get(item.id) ?? item) }
    : entry)
}
