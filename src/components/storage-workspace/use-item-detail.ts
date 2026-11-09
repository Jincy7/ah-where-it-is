'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StorageItemDetail } from '@/lib/storage/item-detail-types'
import { storageRequest, StorageRequestError } from './contracts'

type DetailState = { itemId: string; detail: StorageItemDetail | null; error: string; deleted: boolean; loading: boolean }

export function useItemDetail(itemId: string, refreshKey: number) {
  const [state, setState] = useState<DetailState>({ itemId, detail: null, error: '', deleted: false, loading: true })
  const request = useRef<AbortController | null>(null)
  const reload = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setState({ itemId, detail: null, error: '', deleted: false, loading: true })
    try {
      const detail = await storageRequest<StorageItemDetail>(`/api/storage/items/${encodeURIComponent(itemId)}`, { signal: controller.signal })
      if (!controller.signal.aborted) setState({ itemId, detail, error: '', deleted: false, loading: false })
    } catch (reason) {
      if (!controller.signal.aborted) setState({ itemId, detail: null, error: reason instanceof Error ? reason.message : '물품 상세를 불러오지 못했습니다.', deleted: reason instanceof StorageRequestError && reason.status === 404, loading: false })
    }
  }, [itemId])
  useEffect(() => {
    void reload()
    const refreshVisible = () => { if (!document.hidden) void reload() }
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      request.current?.abort()
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [reload, refreshKey])
  // Switching IDs must never render the previous item's values for one frame.
  return { ...(state.itemId === itemId ? state : { itemId, detail: null, error: '', deleted: false, loading: true }), reload }
}
