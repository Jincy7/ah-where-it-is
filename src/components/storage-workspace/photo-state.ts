import type { ItemDraft } from '@/lib/ai/schema'
import type { PhotoConversationDraft, PhotoDraftUpdate } from './contracts'
import type { StorageAction } from '@/lib/storage/types'

export type PhotoActionReference = { id: string; actionId?: string; actionRevision?: number }

/** A new intent can reuse an action ID. Only the photo carried by its payload owns it. */
export function photoActionStatus(photo: PhotoActionReference, action: StorageAction | null) {
  if (!action || action.type !== 'register_items') return null
  if (action.payload.source_photo_id !== photo.id) return null
  if (photo.actionId === action.action_id && photo.actionRevision !== undefined && action.revision < photo.actionRevision) return null
  return action.status
}


export function applyPhotoDraftUpdate<T extends { id: string; revision: number; status: string; items: ItemDraft[] }>(photo: T, update: PhotoDraftUpdate, locked = false): T {
  if (locked || photo.status !== 'ready' || photo.id !== update.photo_id || photo.revision !== update.expected_revision) return photo
  return { ...photo, items: update.items, revision: photo.revision + 1 }
}


/** A prepared response must refer to the exact editable draft seen by the request. */
export function photoDraftAcceptsAction(drafts: PhotoConversationDraft[], action: StorageAction): boolean {
  if (action.status !== 'prepared' || action.type !== 'register_items' || typeof action.payload.source_photo_id !== 'string') return true
  const draft = drafts.find(photo => photo.photo_id === action.payload.source_photo_id)
  return Boolean(draft && draft.revision === action.payload.source_photo_revision)
}
