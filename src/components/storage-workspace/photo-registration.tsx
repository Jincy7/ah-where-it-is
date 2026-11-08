'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Camera, ImagePlus, Loader2, ScanLine, Trash2, Plus, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_IMAGE_BYTES, MAX_PHOTOS, type ItemDraft } from '@/lib/ai/schema'
import type { AIProvider } from '@/lib/ai/providers'
import type { StorageAction } from '@/lib/storage/types'
import { storageRequest, type PrepareChange, type PhotoConversationDraft, type PhotoDraftUpdate } from './contracts'
import { applyPhotoDraftUpdate, photoActionStatus } from './photo-state'

type DraftPhoto = {
  id: string
  name: string
  revision: number
  blob: Blob
  url: string
  status: 'queued' | 'analyzing' | 'ready' | 'error' | 'saved'
  items: ItemDraft[]
  error?: string
  retain: boolean
  mediaId?: string
  actionId?: string
  actionRevision?: number
}

async function preparePhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 사진을 선택해주세요')
  if (file.size > 20 * 1024 * 1024) throw new Error('원본 사진은 20MB 이하로 선택해주세요')
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('사진을 처리하지 못했습니다')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('사진 변환에 실패했습니다')), 'image/jpeg', 0.85))
    if (blob.size > MAX_IMAGE_BYTES) throw new Error('더 작은 사진을 선택해주세요')
    return blob
  } finally { bitmap.close() }
}

export function PhotoRegistration({ containerId, existingNames, prepare, action, locked, onDraftsChange, draftUpdate }: {
  containerId: string | null
  existingNames: string[]
  prepare: PrepareChange
  action: StorageAction | null
  locked: boolean
  onDraftsChange: (drafts: PhotoConversationDraft[]) => void
  draftUpdate: PhotoDraftUpdate | null
}) {
  const [provider, setProvider] = useState<AIProvider>('openai')
  const [photos, setPhotos] = useState<DraftPhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [keyReady, setKeyReady] = useState<boolean | null>(null)
  const [keyError, setKeyError] = useState('')
  const camera = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)
  const urls = useRef(new Set<string>())
  const mounted = useRef(true)
  const abort = useRef<AbortController | null>(null)
  const appliedUpdate = useRef<PhotoDraftUpdate | null>(null)
  useEffect(() => {
    mounted.current = true
    const currentUrls = urls.current
    return () => { mounted.current = false; abort.current?.abort(); currentUrls.forEach(url => URL.revokeObjectURL(url)); currentUrls.clear() }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setKeyReady(null)
    setKeyError('')
    storageRequest<{ configured: boolean; localFallback?: boolean }>(`/api/settings/${provider}`, { signal: controller.signal })
      .then(data => setKeyReady(data.configured || Boolean(data.localFallback)))
      .catch(error => { if (!controller.signal.aborted) setKeyError(error.message || 'AI 설정을 확인하지 못했습니다') })
    return () => controller.abort()
  }, [provider])
  useEffect(() => {
    if (!action || action.type !== 'register_items') return
    setPhotos(previous => previous.map(photo => {
      const status = photoActionStatus(photo, action)
      if (status === 'completed') return { ...photo, status: 'saved' }
      if (status !== 'prepared' || photo.status !== 'ready' || !Array.isArray(action.payload.items)) return photo
      const items: ItemDraft[] = action.payload.items.map((raw, index) => ({
        name: String(raw.name), quantity: Number(raw.quantity), description: String(raw.description ?? ''),
        uncertainty: photo.items[index]?.uncertainty ?? '',
      }))
      const changed = JSON.stringify(items) !== JSON.stringify(photo.items)
      return { ...photo, items, revision: photo.revision + (changed ? 1 : 0), actionId: action.action_id, actionRevision: action.revision }
    }))
  }, [action])
  useEffect(() => {
    onDraftsChange(photos.filter(photo => photo.status === 'ready').map(photo => ({
      photo_id: photo.id, revision: photo.revision, items: photo.items, retain: photo.retain,
      ...(photo.mediaId ? { media_id: photo.mediaId } : {}),
    })))
  }, [photos, onDraftsChange])
  useEffect(() => {
    if (!draftUpdate || appliedUpdate.current === draftUpdate) return
    appliedUpdate.current = draftUpdate
    setPhotos(previous => previous.map(photo => applyPhotoDraftUpdate(photo, draftUpdate, locked || photoActionStatus(photo, action) === 'prepared')))
  }, [draftUpdate, locked, action])
  const disabled = busy || locked
  const awaiting = (photo: DraftPhoto) => photoActionStatus(photo, action) === 'prepared'
  function update(id: string, patch: Partial<DraftPhoto>) { setPhotos(previous => previous.map(photo => photo.id === id ? { ...photo, ...patch, revision: photo.revision + (('items' in patch || 'retain' in patch) ? 1 : 0) } : photo)) }
  async function addFiles(list: FileList | null) {
    if (!list?.length || disabled) return
    setBusy(true)
    const selected = Array.from(list).slice(0, MAX_PHOTOS - photos.length)
    if (selected.length < list.length) toast.error(`한 번에 ${MAX_PHOTOS}장까지 추가할 수 있습니다`)
    try {
      for (const file of selected) {
        try {
          const blob = await preparePhoto(file)
          if (!mounted.current) return
          const url = URL.createObjectURL(blob)
          urls.current.add(url)
          setPhotos(previous => [...previous, { id: crypto.randomUUID(), name: file.name, revision: 0, blob, url, status: 'queued', items: [], retain: false }])
        } catch (error) { toast.error(error instanceof Error ? error.message : '사진을 읽지 못했습니다') }
      }
    } finally { if (mounted.current) setBusy(false); if (camera.current) camera.current.value = ''; if (files.current) files.current.value = '' }
  }
  async function analyze(selected: DraftPhoto[]) {
    if (disabled || !keyReady) return
    setBusy(true)
    abort.current = new AbortController()
    const signal = abort.current.signal
    for (const photo of selected) {
      if (signal.aborted) break
      update(photo.id, { status: 'analyzing', error: undefined })
      try {
        const query = new URLSearchParams({ provider })
        if (containerId) query.set('container_id', containerId)
        const result = await storageRequest<{ items: ItemDraft[] }>(`/api/items/analyze?${query}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: photo.blob, signal })
        if (!signal.aborted) update(photo.id, { status: 'ready', items: result.items })
      } catch (error) {
        if (!signal.aborted) update(photo.id, { status: 'error', error: error instanceof Error ? error.message : '사진 분석에 실패했습니다' })
      }
    }
    if (mounted.current) setBusy(false)
  }
  async function register(photo: DraftPhoto) {
    if (!containerId || disabled || awaiting(photo)) return
    if (!photo.items.length || photo.items.some(item => !item.name.trim() || !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 9999)) {
      toast.error('모든 물품의 이름과 실제 수량을 확인해주세요')
      return
    }
    setBusy(true)
    try {
      let mediaId = photo.mediaId
      if (photo.retain && !mediaId) {
        const result = await storageRequest<{ media: { id: string } }>('/api/storage/media', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: photo.blob })
        mediaId = result.media.id
        update(photo.id, { mediaId })
      }
      const prepared = await prepare('register_items', {
        container_id: containerId,
        source_photo_id: photo.id,
        source_photo_revision: photo.revision,
        items: photo.items.map(item => ({ name: item.name.trim(), quantity: item.quantity, description: item.description, media_ids: photo.retain && mediaId ? [mediaId] : [] })),
      })
      update(photo.id, { actionId: prepared.action_id, actionRevision: prepared.revision })
    } catch (error) { toast.error(error instanceof Error ? error.message : '등록 내용을 준비하지 못했습니다') }
    finally { setBusy(false) }
  }
  function editItem(photo: DraftPhoto, index: number, patch: Partial<ItemDraft>) {
    update(photo.id, { items: photo.items.map((item, i) => i === index ? { ...item, ...patch } : item) })
  }
  function removePhoto(photo: DraftPhoto) { URL.revokeObjectURL(photo.url); urls.current.delete(photo.url); setPhotos(previous => previous.filter(p => p.id !== photo.id)) }
  const queued = photos.filter(photo => photo.status === 'queued')
  const statusLabels = { queued: '분석 대기', analyzing: '분석 중', ready: '확인 후 등록', error: '분석 실패', saved: '등록 완료' }
  return <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6" aria-labelledby="workspace-photo-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-1"><h2 id="workspace-photo-heading" className="text-xl font-semibold">사진으로 등록</h2><p className="text-sm text-muted-foreground">사진별 물품명과 수량을 확인한 뒤 등록하세요. AI에게 이름·수량 정정을 말해도 됩니다.</p></div><div className="space-y-1"><Label htmlFor="photo-provider" className="text-xs">사진 분석 AI</Label><select id="photo-provider" value={provider} onChange={e => setProvider(e.target.value as AIProvider)} disabled={disabled} className="block h-11 rounded-md border bg-background px-3 text-sm"><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option></select></div></div>
    <p className="text-xs text-muted-foreground">분석할 사진은 {provider === 'openai' ? 'OpenAI' : 'Google Gemini'}로 전송됩니다. 사진 보관을 선택한 경우에만 앱에 사진을 저장합니다.</p>
    {keyError ? <p role="alert" className="text-sm text-destructive">{keyError} <Link className="underline" href="/settings">설정 확인</Link></p> : keyReady === false ? <p className="text-sm text-muted-foreground"><Link className="text-primary underline" href="/settings">설정에서 {provider === 'openai' ? 'OpenAI' : 'Gemini'} 키를 등록해주세요</Link></p> : keyReady === null ? <p role="status" className="text-sm text-muted-foreground">AI 설정 확인 중...</p> : null}
    {provider === 'gemini' && !containerId && <p className="text-sm text-muted-foreground">Gemini 분석은 위에서 등록 대상을 먼저 선택해주세요.</p>}
    <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" aria-label="사진 촬영" onChange={e => void addFiles(e.target.files)} />
    <input ref={files} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" aria-label="여러 사진 선택" onChange={e => void addFiles(e.target.files)} />
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={disabled || photos.length >= MAX_PHOTOS} onClick={() => camera.current?.click()}><Camera className="size-4" />사진 촬영</Button><Button variant="outline" disabled={disabled || photos.length >= MAX_PHOTOS} onClick={() => files.current?.click()}><ImagePlus className="size-4" />사진 선택</Button><Button disabled={disabled || !keyReady || !queued.length || (provider === 'gemini' && !containerId)} onClick={() => void analyze(queued)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}{busy ? '사진 처리 중...' : `${queued.length}장 분석하기`}</Button></div>
    <p className="text-xs text-muted-foreground" role="status" aria-live="polite">{photos.length ? `${photos.length}/${MAX_PHOTOS}장 · ${photos.filter(p => p.status === 'saved').length}장 등록 완료` : 'OpenAI는 보관함을 선택하기 전에도 사진을 분석할 수 있어요.'}</p>
    {photos.map((photo, photoIndex) => {
      const photoLocked = disabled || awaiting(photo) || photo.status === 'saved'
      return <article key={photo.id} className="space-y-4 rounded-lg border p-3">
        <div className="flex items-center gap-3"><Image src={photo.url} alt={`${photoIndex + 1}번째 등록 사진`} width={80} height={80} unoptimized className="size-20 rounded-md object-contain" /><div className="min-w-0 flex-1 space-y-1"><p className="truncate text-sm font-medium">{photo.name}</p><Badge variant={photo.status === 'error' ? 'destructive' : 'outline'}>{awaiting(photo) ? '저장 확인 대기' : statusLabels[photo.status]}</Badge></div><Button variant="ghost" size="icon" aria-label={`${photoIndex + 1}번째 사진 제외`} disabled={photoLocked && photo.status !== 'saved'} onClick={() => removePhoto(photo)}><Trash2 className="size-4" /></Button></div>
        {photo.status === 'error' && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{photo.error}</p><Button variant="outline" disabled={disabled || !keyReady || (provider === 'gemini' && !containerId)} onClick={() => void analyze([photo])}>이 사진 다시 분석</Button></div>}
        {photo.status === 'ready' && <div className="space-y-3">
          {photo.items.map((item, index) => <div key={index} className="space-y-2 rounded-md bg-muted/40 p-3"><div className="grid gap-2 sm:grid-cols-[1fr_6rem_auto]"><div className="space-y-1"><Label htmlFor={`${photo.id}-${index}-name`}>물품명 *</Label><Input id={`${photo.id}-${index}-name`} value={item.name} maxLength={100} disabled={photoLocked} onChange={e => editItem(photo, index, { name: e.target.value })} /></div><div className="space-y-1"><Label htmlFor={`${photo.id}-${index}-qty`}>수량 *</Label><Input id={`${photo.id}-${index}-qty`} type="number" min={1} max={9999} step={1} placeholder="확인 필요" value={item.quantity ?? ''} disabled={photoLocked} onChange={e => editItem(photo, index, { quantity: e.target.value ? Number(e.target.value) : null })} /></div><Button className="self-end" variant="ghost" size="icon" aria-label={`${item.name || index + 1} 후보 제외`} disabled={photoLocked} onClick={() => update(photo.id, { items: photo.items.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button></div><Label htmlFor={`${photo.id}-${index}-description`} className="sr-only">설명</Label><Input id={`${photo.id}-${index}-description`} placeholder="색상, 형태 등 식별 정보" value={item.description} maxLength={1000} disabled={photoLocked} onChange={e => editItem(photo, index, { description: e.target.value })} />{(item.quantity === null || item.uncertainty) && <p className="text-xs text-muted-foreground">확인 필요: {item.uncertainty || '실제 수량을 입력해주세요'}</p>}{existingNames.some(name => name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase()) && <p className="text-xs text-muted-foreground">등록 대상에 같은 이름의 물품이 있습니다. 중복인지 확인해주세요.</p>}</div>)}
          {!photo.items.length && <p className="text-sm text-muted-foreground">등록 후보가 없습니다. 직접 추가할 수 있어요.</p>}
          <Button variant="outline" size="sm" disabled={photoLocked || photo.items.length >= 30} onClick={() => update(photo.id, { items: [...photo.items, { name: '', quantity: 1, description: '', uncertainty: '' }] })}><Plus className="size-4" />후보 추가</Button>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={photo.retain} disabled={photoLocked} onChange={e => update(photo.id, { retain: e.target.checked })} />이 사진을 함께 보관</label><p className="text-xs text-muted-foreground">보관한 사진은 ‘등록 당시 사진’으로 표시됩니다. 현재 위치는 물품 기록을 따릅니다.</p>
          {!containerId && <p className="text-sm text-muted-foreground">저장 전에 위에서 등록할 보관함을 선택해주세요.</p>}
          <Button disabled={photoLocked || !containerId || !photo.items.length || photo.items.some(item => !item.name.trim() || !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 9999)} onClick={() => void register(photo)}><Check className="size-4" />{awaiting(photo) ? '위 변경 카드에서 저장을 확인해주세요' : '등록 내용 확인'}</Button>
        </div>}
      </article>
    })}
  </section>
}
