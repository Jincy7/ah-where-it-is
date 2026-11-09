import 'server-only'

import { VisionError } from '@/lib/ai/gemini'
import { storageContext } from './service'
import type { StorageItemDetail } from './item-detail-types'

export async function getStorageItemDetail(itemId: string): Promise<StorageItemDetail> {
  const { supabase, user } = await storageContext()
  // Read the item and its recorded path in one snapshot, without list-size caps.
  const { data, error } = await supabase.from('items')
    .select('*,containers!inner(name,user_id,location_id,locations(name)),item_media(media_assets(id,user_id,path,created_at))')
    .eq('id', itemId).eq('containers.user_id', user.id).maybeSingle()
  if (error) throw new VisionError('물품 상세를 불러오지 못했습니다. 다시 시도해주세요', 503)
  if (!data) throw new VisionError('물품 기록이 삭제되었거나 접근할 수 없습니다.', 404)
  const checked_at = new Date().toISOString()
  const { containers: container, item_media: links, ...item } = data
  const assets = links.flatMap(link => link.media_assets?.user_id === user.id ? [link.media_assets] : [])
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  const urls = assets.length ? await supabase.storage.from('item-images').createSignedUrls(assets.map(asset => asset.path), 600) : null
  if (urls?.error) throw new VisionError('등록 사진을 불러오지 못했습니다. 다시 시도해주세요', 503)
  return {
    item: {
      ...item,
      container_name: container.name,
      location_id: container.location_id,
      location_name: container.locations?.name ?? null,
      match_reason: '등록된 기록',
      media: assets.map((asset, index) => ({ id: asset.id, created_at: asset.created_at, url: urls?.data?.[index]?.signedUrl ?? null })),
    },
    checked_at,
  }
}
