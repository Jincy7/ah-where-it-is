'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Archive, ChevronDown, Loader2, MapPin, MoreHorizontal, MoveHorizontal, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, X, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { QrCodeButton } from '@/components/containers/qr-code-button'
import { BulkQrCodeButton } from '@/components/containers/bulk-qr-code-button'
import { AssistantPanel } from '@/components/agent/assistant-panel'
import type { StorageAction, WorkspaceContainer, WorkspaceData, WorkspaceItem, WorkspaceLocation } from '@/lib/storage/types'
import { ActionCard } from './action-card'
import { ContainerEditor, ItemEditor, LocationEditor, MoveEditor } from './editors'
import { PhotoRegistration } from './photo-registration'
import { photoDraftAcceptsAction } from './photo-state'
import { storageRequest, type PrepareChange, type PhotoConversationDraft, type PhotoDraftUpdate } from './contracts'

type Editor = { kind: 'item'; item?: WorkspaceItem } | { kind: 'move'; item: WorkspaceItem } | { kind: 'container'; container?: WorkspaceContainer } | { kind: 'location'; location?: WorkspaceLocation } | null

function itemPath(item: WorkspaceItem) { return `${item.location_name || '장소 미지정'} → ${item.container_name}` }

export function StorageWorkspace() {
  const params = useSearchParams()
  const selectedId = params.get('container')
  const mode = params.get('mode') === 'manual' ? 'manual' : 'ai'
  const searchScope = params.get('scope') || null
  const urlQuery = params.get('q') ?? ''
  const [query, setQuery] = useState(urlQuery)
  const [registrationContainerId, setRegistrationContainerId] = useState<string | null>(selectedId)
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [results, setResults] = useState<WorkspaceItem[] | null>(null)
  const [resultSource, setResultSource] = useState<'search' | 'assistant' | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [action, setAction] = useState<StorageAction | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [editor, setEditor] = useState<Editor>(null)
  const [locationsOpen, setLocationsOpen] = useState(false)
  const [photoDrafts, setPhotoDrafts] = useState<PhotoConversationDraft[]>([])
  const [photoDraftUpdate, setPhotoDraftUpdate] = useState<PhotoDraftUpdate | null>(null)
  const photoDraftsRef = useRef<PhotoConversationDraft[]>([])
  const [showPhotos, setShowPhotos] = useState(params.get('panel') === 'register')
  const [mobileContainersOpen, setMobileContainersOpen] = useState(false)
  const lastSelectedId = useRef(selectedId)
  const confirmLock = useRef(false)
  const prepareLock = useRef(false)
  const handledPanel = useRef<string | null>(null)
  const actionAnchor = useRef<HTMLDivElement>(null)
  const locked = actionBusy || uncertain || preparing
  const selected = data?.containers.find(container => container.id === selectedId) ?? null
  const containers = data?.containers ?? []
  const locations = data?.locations ?? []

  const updateUrl = useCallback((values: Record<string, string | null>) => {
    const next = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key) }
    const suffix = next.toString()
    window.history.replaceState(null, '', suffix ? `/storage?${suffix}` : '/storage')
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setLoadError('')
    try {
      const next = await storageRequest<WorkspaceData>('/api/storage')
      setData(next)
      return next
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '보관함을 불러오지 못했습니다')
      return null
    } finally { setRefreshing(false) }
  }, [])
  useEffect(() => {
    void refresh()
    // Orphans are reclaimed after the server's grace period; failures retry next visit.
    void fetch('/api/storage/media', { method: 'DELETE' }).catch(() => {})
  }, [refresh])
  useEffect(() => {
    const explicit = params.get('mode')
    try {
      if (explicit === 'manual' || explicit === 'ai') localStorage.setItem('storage-manager:storage-mode', explicit)
      else updateUrl({ mode: localStorage.getItem('storage-manager:storage-mode') === 'manual' ? 'manual' : 'ai' })
    } catch { /* Browser storage is optional. */ }
  }, [params, updateUrl])
  useEffect(() => { setQuery(urlQuery) }, [urlQuery])
  useEffect(() => {
    if (lastSelectedId.current !== selectedId && !locked) {
      lastSelectedId.current = selectedId
      setRegistrationContainerId(selectedId)
    }
  }, [selectedId, locked])
  useEffect(() => {
    const timeout = setTimeout(() => { if (query !== urlQuery) updateUrl({ q: query.trim() || null }) }, 300)
    return () => clearTimeout(timeout)
  }, [query, urlQuery, updateUrl])
  useEffect(() => {
    if (!urlQuery.trim()) { setSearching(false); setResults(previous => resultSource === 'search' ? null : previous); setSearchError(''); return }
    const controller = new AbortController()
    setSearching(true)
    setSearchError('')
    const queryParams = new URLSearchParams({ q: urlQuery })
    if (searchScope) queryParams.set('container_id', searchScope)
    storageRequest<{ items: WorkspaceItem[] }>(`/api/storage/search?${queryParams}`, { signal: controller.signal })
      .then(value => { setResults(value.items); setResultSource('search') })
      .catch(error => { if (!controller.signal.aborted) setSearchError(error.message || '검색하지 못했습니다') })
      .finally(() => { if (!controller.signal.aborted) setSearching(false) })
    return () => controller.abort()
  // Search source only determines what to clear; it must not trigger another network search.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery, searchScope])
  useEffect(() => {
    if (!data) return
    const panel = params.get('panel')
    const token = panel ? `${panel}:${selectedId ?? ''}` : null
    if (!panel) { handledPanel.current = null; return }
    if (token === handledPanel.current) return
    handledPanel.current = token
    if (panel === 'new-container') setEditor({ kind: 'container' })
    if (panel === 'edit-container' && selected) setEditor({ kind: 'container', container: selected })
    if (panel === 'locations') setLocationsOpen(true)
    if (panel === 'register') setShowPhotos(true)
    updateUrl({ panel: null })
  }, [data, params, selectedId, selected, updateUrl])

  const receiveAction = useCallback((next: StorageAction) => {
    if (confirmLock.current || uncertain) { toast.error('먼저 진행 중인 저장 결과를 확인해주세요'); return false }
    if (!photoDraftAcceptsAction(photoDraftsRef.current, next)) { toast.error('사진 후보가 바뀌어 이전 변경안을 적용하지 않았습니다. 현재 내용으로 다시 요청해주세요.'); return false }
    setAction(next)
    setActionError('')
    setTimeout(() => actionAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0)
    return true
  }, [uncertain])
  const prepare: PrepareChange = async (type, payload, expectedVersions) => {
    if (locked || confirmLock.current || prepareLock.current) throw new Error('진행 중인 작업 결과를 먼저 확인해주세요')
    prepareLock.current = true
    setPreparing(true)
    try {
      const result = await storageRequest<{ action: StorageAction }>('/api/storage/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload, expected_versions: expectedVersions, ...(action?.status === 'prepared' ? { action_id: action.action_id, revision: action.revision } : {}) }),
      })
      if (!receiveAction(result.action)) throw new Error('현재 사진 후보로 변경 내용을 다시 확인해주세요')
      return result.action
    } finally { prepareLock.current = false; setPreparing(false) }
  }
  async function refreshResults(nextData: WorkspaceData | null) {
    if (urlQuery.trim()) {
      const queryParams = new URLSearchParams({ q: urlQuery })
      if (searchScope) queryParams.set('container_id', searchScope)
      try {
        const next = await storageRequest<{ items: WorkspaceItem[] }>(`/api/storage/search?${queryParams}`)
        setResults(next.items)
      } catch (error) { setSearchError(error instanceof Error ? error.message : '검색 결과를 갱신하지 못했습니다') }
    } else if (nextData) {
      setResults(previous => previous?.flatMap(item => { const fresh = nextData.items.find(candidate => candidate.id === item.id); return fresh ? [fresh] : [] }) ?? null)
    }
  }
  async function confirmed(next: StorageAction) {
    setAction(next)
    if (next.status !== 'prepared') setUncertain(false)
    setActionError('')
    if (next.status === 'completed') {
      toast.success('변경 내용이 저장되었습니다')
      const fresh = await refresh()
      await refreshResults(fresh)
      if (next.type === 'create_container' && next.receipt?.result && typeof next.receipt.result === 'object' && 'id' in next.receipt.result && typeof next.receipt.result.id === 'string') {
        updateUrl({ container: next.receipt.result.id })
        setRegistrationContainerId(next.receipt.result.id)
      }
      if (next.type === 'delete_container' && next.payload.container_id === selectedId) updateUrl({ container: null })
      if (next.type === 'delete_container' && next.payload.container_id === registrationContainerId) setRegistrationContainerId(null)
    }
  }
  async function confirmAction() {
    if (!action || confirmLock.current) return
    confirmLock.current = true
    setActionBusy(true)
    setActionError('')
    try {
      const response = await fetch(`/api/storage/actions/${action.action_id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: action.revision, payload_hash: action.payload_hash, idempotency_key: action.idempotency_key }) })
      const result = await response.json()
      if (!response.ok) {
        if (response.status >= 500) setUncertain(true)
        else { setUncertain(false); await refresh() }
        throw new Error(result.error || '변경을 확정하지 못했습니다')
      }
      await confirmed(result.action)
    } catch (error) {
      if (error instanceof TypeError || error instanceof SyntaxError) setUncertain(true)
      setActionError(error instanceof Error ? error.message : '저장 결과를 확인하지 못했습니다')
    } finally { confirmLock.current = false; setActionBusy(false) }
  }
  async function refreshAction() {
    if (!action || confirmLock.current) return
    setActionBusy(true)
    try {
      const result = await storageRequest<{ action: StorageAction }>(`/api/storage/actions/${action.action_id}`)
      await confirmed(result.action)
      if (result.action.status === 'prepared') setActionError('아직 완료되지 않았습니다. 같은 작업을 다시 시도할 수 있습니다.')
    } catch (error) { setActionError(error instanceof Error ? error.message : '결과를 확인하지 못했습니다') }
    finally { setActionBusy(false) }
  }
  async function cancelAction() {
    if (!action || locked) return
    setActionBusy(true)
    try {
      const result = await storageRequest<{ action: StorageAction }>(`/api/storage/actions/${action.action_id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: action.revision }) })
      setAction(result.action)
      setActionError('')
    } catch (error) { setActionError(error instanceof Error ? error.message : '취소하지 못했습니다') }
    finally { setActionBusy(false) }
  }
  const receivePhotoDrafts = useCallback((drafts: PhotoConversationDraft[]) => {
    photoDraftsRef.current = drafts
    setPhotoDrafts(drafts)
  }, [])
  function updatePhotoDraft(update: PhotoDraftUpdate) {
    const current = photoDraftsRef.current.find(photo => photo.photo_id === update.photo_id)
    if (locked || confirmLock.current || !current || current.revision !== update.expected_revision || (action?.status === 'prepared' && action.payload.source_photo_id === update.photo_id)) {
      toast.error('사진 후보가 바뀌어 정정을 적용하지 못했습니다. 현재 내용을 확인해주세요.')
      return false
    }
    // Reserve the next revision immediately, so duplicate events cannot apply twice.
    photoDraftsRef.current = photoDraftsRef.current.map(photo => photo.photo_id === update.photo_id ? { ...photo, revision: photo.revision + 1, items: update.items } : photo)
    setPhotoDraftUpdate(update)
    setShowPhotos(true)
    return true
  }
  async function deleteItem(item: WorkspaceItem) {
    try { await prepare('delete_item', { item_id: item.id }, { [`items:${item.id}`]: item.version }) }
    catch (error) { toast.error(error instanceof Error ? error.message : '삭제 내용을 준비하지 못했습니다') }
  }
  async function deleteContainer(container: WorkspaceContainer) {
    try { await prepare('delete_container', { container_id: container.id }, { [`containers:${container.id}`]: container.version, [`contents:${container.id}`]: container.contents_version }) }
    catch (error) { toast.error(error instanceof Error ? error.message : '삭제 내용을 준비하지 못했습니다') }
  }
  async function deleteLocation(location: WorkspaceLocation) {
    try { await prepare('delete_location', { location_id: location.id }, { [`locations:${location.id}`]: location.version }); setLocationsOpen(false) }
    catch (error) { toast.error(error instanceof Error ? error.message : '삭제 내용을 준비하지 못했습니다') }
  }
  function selectContainer(id: string | null) {
    updateUrl({ container: id })
    if (!locked) setRegistrationContainerId(id)
    setMobileContainersOpen(false)
  }
  function clearResults() { setQuery(''); updateUrl({ q: null }); setResults(null); setResultSource(null); setSearchError('') }

  if (!data) return <div className="space-y-4"><h1 className="text-3xl font-bold tracking-tight">보관함</h1>{loadError ? <div role="alert" className="space-y-3 rounded-lg border p-6"><p className="text-destructive">{loadError}</p><Button variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4" />다시 불러오기</Button></div> : <p role="status" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />보관함을 불러오는 중...</p>}</div>

  const displayedItems = results ?? data.items.filter(item => !selected || item.container_id === selected.id)
  const editorTitle = editor?.kind === 'container' ? (editor.container ? '보관함 수정' : '새 보관함') : editor?.kind === 'location' ? (editor.location ? '장소 수정' : '새 장소') : editor?.kind === 'move' ? '물품 이동' : editor?.item ? '물품 수정' : '직접 등록'
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><h1 className="text-3xl font-bold tracking-tight">보관함</h1><p className="text-sm text-muted-foreground">물건을 찾고, 기록을 함께 정리하세요.</p></div><div className="flex gap-2"><Button variant="outline" disabled={refreshing} size="icon" aria-label="보관함 새로고침" onClick={() => void refresh().then(refreshResults)}><RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} /></Button><Button disabled={locked} onClick={() => setEditor({ kind: 'container' })}><Plus className="size-4" />새 보관함</Button></div></header>
    {loadError && <p role="alert" className="text-sm text-destructive">{loadError} 현재 표시된 기록은 마지막 조회 결과입니다.</p>}
    <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-3 rounded-lg border bg-card p-3">
        <Button variant="ghost" className="w-full justify-between lg:hidden" onClick={() => setMobileContainersOpen(!mobileContainersOpen)} aria-expanded={mobileContainersOpen}><span className="flex items-center gap-2"><Archive className="size-4" />{selected?.name || '전체 보관함'}</span><ChevronDown className="size-4" /></Button>
        <div className={`${mobileContainersOpen ? 'block' : 'hidden'} space-y-4 lg:block`}>
          <Button variant={!selectedId ? 'secondary' : 'ghost'} className="h-auto min-h-11 w-full justify-between" onClick={() => selectContainer(null)}><span>전체 보관함</span><Badge variant="outline">{containers.reduce((total, c) => total + c.item_count, 0)}</Badge></Button>
          {[...locations.map(location => ({ id: location.id, name: location.name })), { id: '', name: '장소 미지정' }].map(location => {
            const group = containers.filter(container => (container.location_id ?? '') === location.id)
            if (!group.length) return null
            return <div key={location.id} className="space-y-1"><p className="flex items-center gap-1 px-2 text-xs font-medium text-muted-foreground"><MapPin className="size-3" />{location.name}</p>{group.map(container => <Button key={container.id} variant={selectedId === container.id ? 'secondary' : 'ghost'} className="h-auto min-h-11 w-full justify-between gap-2" onClick={() => selectContainer(container.id)}><span className="truncate">{container.name}</span><span className="text-xs text-muted-foreground">{container.item_count}</span></Button>)}</div>
          })}
          {!containers.length && <p className="p-2 text-sm text-muted-foreground">첫 보관함을 만들어보세요.</p>}
          <div className="space-y-2 border-t pt-3"><Button variant="outline" className="w-full" onClick={() => setLocationsOpen(true)}><MapPin className="size-4" />장소 관리</Button><BulkQrCodeButton /></div>
        </div>
      </aside>
      <div className="min-w-0 space-y-5">
        {selectedId && !selected && <p role="alert" className="text-sm text-destructive">선택한 보관함을 찾을 수 없습니다. 다른 보관함을 선택해주세요.</p>}
        <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="search-scope">찾기 범위</Label><select id="search-scope" value={searchScope ?? ''} onChange={e => updateUrl({ scope: e.target.value || null })} className="h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="">전체 보관함</option>{containers.map(container => <option key={container.id} value={container.id}>{container.location_name || '장소 미지정'} → {container.name}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="registration-target">등록 대상</Label><select id="registration-target" value={registrationContainerId ?? ''} disabled={locked} onChange={e => setRegistrationContainerId(e.target.value || null)} className="h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="">저장 전에 선택</option>{containers.map(container => <option key={container.id} value={container.id}>{container.location_name || '장소 미지정'} → {container.name}</option>)}</select></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">보관함을 선택해도 찾기는 전체 범위를 유지합니다.</p>
        </div>
        <Tabs value={mode} onValueChange={value => updateUrl({ mode: value })}><TabsList className="grid h-12 w-full grid-cols-2"><TabsTrigger value="ai" className="h-10 gap-2"><Sparkles className="size-4" />AI 도움</TabsTrigger><TabsTrigger value="manual" className="h-10 gap-2"><Archive className="size-4" />직접 관리</TabsTrigger></TabsList></Tabs>
        <div hidden={mode !== 'ai'}><AssistantPanel active={mode === 'ai' && !locked} selectedContainerId={selected?.id ?? null} searchScope={searchScope} registrationContainerId={registrationContainerId} activeAction={action} photoDrafts={photoDrafts} onPhotoDraft={updatePhotoDraft} onAction={receiveAction} onSearchResults={items => { setQuery(''); updateUrl({ q: null }); setResults(items); setResultSource('assistant'); setSearchError('') }} /></div>
        <div hidden={mode !== 'manual'} className="space-y-3">
          {selected && <div className="space-y-3 rounded-lg border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-1"><h2 className="text-xl font-semibold">{selected.name}</h2><p className="text-sm text-muted-foreground">{selected.location_name || '장소 미지정'} · {selected.item_count}종</p></div><div className="flex flex-wrap gap-2"><QrCodeButton containerId={selected.id} containerName={selected.name} /><Button variant="outline" disabled={locked} onClick={() => setEditor({ kind: 'container', container: selected })}><Pencil className="size-4" />수정</Button><Button variant="ghost" size="icon" aria-label={`${selected.name} 삭제`} disabled={locked} onClick={() => void deleteContainer(selected)}><Trash2 className="size-4" /></Button></div></div>{(selected.cover_url || selected.internal_photo_url) && <Image src={selected.cover_url || selected.internal_photo_url!} alt={`${selected.name} 대표 사진`} width={720} height={400} unoptimized className="max-h-60 w-full rounded-md object-contain" />}</div>}
          <div className="relative"><Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input aria-label="물품 이름 또는 설명 검색" placeholder="물품명이나 설명으로 찾기" value={query} onChange={e => setQuery(e.target.value)} className="h-12 pl-10" /></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant={showPhotos ? 'secondary' : 'outline'} onClick={() => setShowPhotos(!showPhotos)} aria-expanded={showPhotos}><Camera className="size-4" />사진으로 등록</Button><Button variant="outline" disabled={locked || !registrationContainerId} onClick={() => setEditor({ kind: 'item' })}><Plus className="size-4" />직접 등록</Button>{!registrationContainerId && <span className="self-center text-xs text-muted-foreground">직접 등록할 보관함을 선택해주세요.</span>}</div>
        <div ref={actionAnchor}>{action && <ActionCard action={action} containers={containers} locations={locations} busy={actionBusy} uncertain={uncertain} error={actionError} onConfirm={confirmAction} onCancel={cancelAction} onRefresh={refreshAction} onReprepare={async () => { try { await prepare(action.type, typeof action.payload.source_photo_id === 'string' ? { ...action.payload, source_photo_revision: photoDraftsRef.current.find(photo => photo.photo_id === action.payload.source_photo_id)?.revision } : action.payload) } catch (error) { setActionError(error instanceof Error ? error.message : '변경안을 새로 만들지 못했습니다') } }} onDismiss={() => setAction(null)} />}</div>
        <div hidden={!showPhotos}><PhotoRegistration containerId={registrationContainerId} existingNames={data.items.filter(item => item.container_id === registrationContainerId).map(item => item.name)} prepare={prepare} action={action} locked={locked} onDraftsChange={receivePhotoDrafts} draftUpdate={photoDraftUpdate} /></div>
        <section className="space-y-3" aria-labelledby="workspace-results-heading"><div className="flex items-center justify-between gap-2"><h2 id="workspace-results-heading" className="text-xl font-semibold">{results ? resultSource === 'assistant' ? 'AI가 찾은 기록' : '검색 결과' : selected ? `${selected.name}의 물품` : '전체 물품'} <span className="text-sm font-normal text-muted-foreground">{displayedItems.length}종</span></h2>{results && <Button variant="ghost" size="sm" onClick={clearResults}><X className="size-4" />검색 닫기</Button>}</div>
          {(searching || query !== urlQuery) && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />검색 중...</p>}
          {searchError ? <p role="alert" className="rounded-lg border p-4 text-sm text-destructive">{searchError} 기록이 없는 것과 조회 실패는 다릅니다. 잠시 후 다시 검색해주세요.</p> : displayedItems.length === 0 ? <div className="flex flex-col items-center rounded-lg border border-dashed p-8 text-center"><Image src={results ? '/agu-search.png' : '/agu-container.png'} alt="" width={160} height={160} className="size-40" /><h3 className="mt-3 font-semibold">{results ? '등록된 기록을 찾지 못했어요' : '아직 등록된 물품이 없어요'}</h3><p className="mt-1 text-sm text-muted-foreground">{results ? '검색어와 찾기 범위를 바꿔보세요.' : '보관함을 선택하고 사진이나 직접 입력으로 등록해보세요.'}</p></div> : <div className="divide-y rounded-lg border bg-card">{displayedItems.map(item => <article key={item.id} className="flex gap-3 p-4">
            {item.media?.[0]?.url && <div className="w-16 shrink-0 sm:w-20"><Image src={item.media[0].url} alt={`${item.name} 등록 당시 사진`} width={80} height={80} unoptimized className="aspect-square w-full rounded-md object-contain" /><p className="mt-1 text-[10px] text-muted-foreground">등록 당시 사진</p></div>}
            <div className="min-w-0 flex-1 space-y-1"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-medium">{item.name}</h3><Badge variant="outline">{item.quantity}개</Badge></div>{item.description && <p className="break-words text-sm text-muted-foreground">{item.description}</p>}<p className="flex items-center gap-1 text-sm"><MapPin className="size-3 shrink-0 text-muted-foreground" /><span className="break-words">마지막 기록 위치: {itemPath(item)}</span></p><p className="text-xs text-muted-foreground">변경 {new Date(item.updated_at).toLocaleString('ko-KR')}{results && item.match_reason ? ` · ${item.match_reason}` : ''}</p></div>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`${item.name} 작업`} disabled={locked}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setEditor({ kind: 'item', item })}><Pencil className="size-4" />이름·수량 수정</DropdownMenuItem><DropdownMenuItem onSelect={() => setEditor({ kind: 'move', item })}><MoveHorizontal className="size-4" />이동</DropdownMenuItem><DropdownMenuItem onSelect={() => void deleteItem(item)} className="text-destructive"><Trash2 className="size-4" />삭제</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          </article>)}</div>}
          {data.truncated && !results && <p className="text-sm text-muted-foreground">일부 기록만 표시하고 있습니다. 검색으로 원하는 물품을 찾아주세요.</p>}
        </section>
      </div>
    </div>
    <Dialog open={editor !== null} onOpenChange={open => { if (!open && !preparing) setEditor(null) }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editorTitle}</DialogTitle><DialogDescription>내용을 입력하면 확인할 변경안이 만들어집니다.</DialogDescription></DialogHeader>{editor?.kind === 'item' && <ItemEditor key={editor.item?.id ?? registrationContainerId} item={editor.item} containerId={editor.item?.container_id ?? registrationContainerId ?? ''} prepare={prepare} onPrepared={() => setEditor(null)} />}{editor?.kind === 'move' && <MoveEditor item={editor.item} containers={containers} prepare={prepare} onPrepared={() => setEditor(null)} />}{editor?.kind === 'container' && <ContainerEditor key={editor.container?.id ?? 'new'} container={editor.container} locations={locations} prepare={prepare} onPrepared={() => setEditor(null)} />}{editor?.kind === 'location' && <LocationEditor key={editor.location?.id ?? 'new'} location={editor.location} prepare={prepare} onPrepared={() => setEditor(null)} />}</DialogContent></Dialog>
    <Dialog open={locationsOpen} onOpenChange={setLocationsOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>장소 관리</DialogTitle><DialogDescription>장소별로 보관함을 묶어 관리하세요.</DialogDescription></DialogHeader><Button disabled={locked} onClick={() => { setLocationsOpen(false); setEditor({ kind: 'location' }) }}><Plus className="size-4" />새 장소</Button><div className="divide-y">{locations.map(location => <div key={location.id} className="flex items-center gap-3 py-3"><MapPin className="size-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="break-words font-medium">{location.name}</p><p className="text-sm text-muted-foreground">{location.description || `${containers.filter(c => c.location_id === location.id).length}개 보관함`}</p></div><Button variant="ghost" size="icon" aria-label={`${location.name} 수정`} disabled={locked} onClick={() => { setLocationsOpen(false); setEditor({ kind: 'location', location }) }}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" aria-label={`${location.name} 삭제`} disabled={locked} onClick={() => void deleteLocation(location)}><Trash2 className="size-4" /></Button></div>)}{!locations.length && <p className="py-6 text-center text-sm text-muted-foreground">등록된 장소가 없습니다.</p>}</div></DialogContent></Dialog>
  </div>
}
