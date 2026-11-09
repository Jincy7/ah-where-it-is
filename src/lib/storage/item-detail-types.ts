import type { StorageItem } from './types'

export type StorageItemDetail = {
  item: Omit<StorageItem, 'media'> & {
    location_id: string | null
    media: Array<{ id: string; url: string | null; created_at: string }>
  }
  checked_at: string
}
