'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Archive, ArrowDown, Camera, Loader2, MapPin, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AssistantPanel } from '@/components/agent/assistant-panel'
import type { StorageAction, WorkspaceContainer, WorkspaceData, WorkspaceItem, WorkspaceLocation } from '@/lib/storage/types'
import { ActionCard } from './action-card'
import { ChatMessage } from './chat-message'
import { ContainerEditor, ItemEditor, LocationEditor, MoveEditor } from './editors'
import { ManagementDialog } from './management-dialog'
import { ResultsCard } from './results-card'
import { PhotoRegistration, type PhotoRegistrationHandle } from './photo-registration'
import { photoDraftAcceptsAction } from './photo-state'
import { initialConversation, receiveConversationAction, refreshConversationResults, revealPhotoEntry } from './timeline'
import { storageRequest, type PrepareChange, type PhotoConversationDraft, type PhotoDraftUpdate } from './contracts'

type Editor = { kind: 'item'; item?: WorkspaceItem } | { kind: 'move'; item: WorkspaceItem } | { kind: 'container'; container?: WorkspaceContainer } | { kind: 'location'; location?: WorkspaceLocation } | null

export function StorageWorkspace() {
  const params = useSearchParams()
  const selectedId = params.get('container')
  const searchScope = params.get('scope') || null
  const urlQuery = params.get('q') ?? ''
  const [query, setQuery] = useState(urlQuery)
  const [scopeInput, setScopeInput] = useState(searchScope ?? '')
  const [registrationContainerId, setRegistrationContainerId] = useState<string | null>(selectedId)
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [conversation, setConversation] = useState(initialConversation)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [editor, setEditor] = useState<Editor>(null)
  const [managementOpen, setManagementOpen] = useState(false)
  const [locationsOpen, setLocationsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [photoDrafts, setPhotoDrafts] = useState<PhotoConversationDraft[]>([])
  const [photoDraftUpdate, setPhotoDraftUpdate] = useState<PhotoDraftUpdate | null>(null)
  const [photosActive, setPhotosActive] = useState(false)
  const [prompt, setPrompt] = useState<{ id: number; text: string }>()
  const [nearBottom, setNearBottom] = useState(true)
  const photoDraftsRef = useRef<PhotoConversationDraft[]>([])
  const photoRef = useRef<PhotoRegistrationHandle>(null)
  const photoActiveRef = useRef(false)
  const transcript = useRef<HTMLDivElement>(null)
  const followBottom = useRef(true)
  const confirmLock = useRef(false)
  const prepareLock = useRef(false)
  const handledPanel = useRef<string | null>(null)
  const lastSelectedId = useRef(selectedId)
  const lastInventoryId = useRef<string | null>(null)
  const storageLocked = actionBusy || uncertain || preparing
  const locked = storageLocked || assistantBusy
  const action = conversation.activeActionId ? conversation.actions[conversation.activeActionId] ?? null : null
  const selected = data?.containers.find(container => container.id === selectedId) ?? null
  const containers = data?.containers ?? []
  const locations = data?.locations ?? []

  const updateUrl = useCallback((values: Record<string, string | null>) => {
    const next = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key) }
    window.history.replaceState(null, '', next.size ? `/storage?${next}` : '/storage')
  }, [])
  const scrollToBottom = useCallback(() => {
    followBottom.current = true
    setNearBottom(true)
    const element = transcript.current
    element?.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
  }, [])
  useEffect(() => {
    if (!followBottom.current) return
    const frame = requestAnimationFrame(() => { const element = transcript.current; if (element) element.scrollTop = element.scrollHeight })
    return () => cancelAnimationFrame(frame)
  }, [conversation, photoDrafts, photosActive, searching])
  const appendMessage = useCallback((message: { id: string; role: 'user' | 'assistant'; content: string }) => {
    if (message.role === 'user') followBottom.current = true
    setConversation(previous => ({ ...previous, entries: [...previous.entries, { ...message, kind: 'message' }] }))
  }, [])
  const appendResults = useCallback((items: WorkspaceItem[], title = '찾은 기록', containerId?: string) => {
    setConversation(previous => ({ ...previous, entries: [...previous.entries, { id: crypto.randomUUID(), kind: 'results', items, title, containerId }] }))
  }, [])
  const activatePhotos = useCallback(() => {
    if (!photoActiveRef.current) {
      photoActiveRef.current = true
      setPhotosActive(true)
    }
    setConversation(previous => ({ ...previous, entries: revealPhotoEntry(previous.entries) }))
    followBottom.current = true
  }, [])
  function attachPhoto(camera = false) {
    if (locked) return
    if (camera) photoRef.current?.openCamera()
    else photoRef.current?.openFiles()
  }
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
    void fetch('/api/storage/media', { method: 'DELETE' }).catch(() => {})
  }, [refresh])
  useEffect(() => {
    if (lastSelectedId.current !== selectedId && !locked) {
      lastSelectedId.current = selectedId
      setRegistrationContainerId(selectedId)
    }
  }, [selectedId, locked])
  useEffect(() => {
    if (!selected || lastInventoryId.current === selected.id) return
    lastInventoryId.current = selected.id
    appendResults(data?.items.filter(item => item.container_id === selected.id) ?? [], `${selected.name}의 기록`, selected.id)
  }, [selected, data, appendResults])
  useEffect(() => {
    if (!urlQuery.trim()) return
    const controller = new AbortController()
    setSearching(true)
    setSearchError('')
    const queryParams = new URLSearchParams({ q: urlQuery })
    if (searchScope) queryParams.set('container_id', searchScope)
    storageRequest<{ items: WorkspaceItem[] }>(`/api/storage/search?${queryParams}`, { signal: controller.signal })
      .then(value => appendResults(value.items, `‘${urlQuery}’ 검색 결과`))
      .catch(error => { if (!controller.signal.aborted) setSearchError(error.message || '검색하지 못했습니다') })
      .finally(() => { if (!controller.signal.aborted) setSearching(false) })
    return () => controller.abort()
  }, [urlQuery, searchScope, appendResults])
  useEffect(() => {
    if (!data || locked) return
    const panel = params.get('panel')
    const legacyMode = params.get('mode')
    const token = panel ? `${panel}:${selectedId ?? ''}` : legacyMode === 'manual' ? 'manual' : null
    if (!token) { handledPanel.current = null; return }
    if (token === handledPanel.current) return
    handledPanel.current = token
    if (panel === 'new-container') setEditor({ kind: 'container' })
    else if (panel === 'edit-container' && selected) setEditor({ kind: 'container', container: selected })
    else if (panel === 'locations') setLocationsOpen(true)
    else if (panel === 'register') activatePhotos()
    else if (legacyMode === 'manual') setManagementOpen(true)
    updateUrl({ panel: null, mode: null })
  }, [data, params, selectedId, selected, updateUrl, locked, activatePhotos])

  const receiveAction = useCallback((next: StorageAction) => {
    if (confirmLock.current || uncertain) { toast.error('먼저 진행 중인 저장 결과를 확인해주세요'); return false }
    if (!photoDraftAcceptsAction(photoDraftsRef.current, next)) { toast.error('사진 후보가 바뀌어 이전 변경안을 적용하지 않았습니다. 현재 내용으로 다시 요청해주세요.'); return false }
    setConversation(previous => receiveConversationAction(previous, next))
    setActionError('')
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
      followBottom.current = true
      return result.action
    } finally { prepareLock.current = false; setPreparing(false) }
  }
  async function confirmed(next: StorageAction) {
    setConversation(previous => receiveConversationAction(previous, next))
    if (next.status !== 'prepared') setUncertain(false)
    setActionError('')
    if (next.status === 'completed') {
      const fresh = await refresh()
      const deleted = next.type === 'delete_item' ? [String(next.payload.item_id)] : next.type === 'delete_container' ? next.preview.affected_items.map(item => item.id) : []
      if (fresh) setConversation(previous => ({ ...previous, entries: refreshConversationResults(previous.entries, fresh.items, deleted) }))
      if (next.type === 'create_container' && next.receipt?.result && typeof next.receipt.result === 'object' && 'id' in next.receipt.result && typeof next.receipt.result.id === 'string') {
        updateUrl({ container: next.receipt.result.id })
        setRegistrationContainerId(next.receipt.result.id)
      }
      if (next.type === 'delete_container' && next.payload.container_id === selectedId) updateUrl({ container: null })
      if (next.type === 'delete_container' && next.payload.container_id === registrationContainerId) setRegistrationContainerId(null)
    }
  }
  async function confirmAction(target: StorageAction) {
    if (!action || action.action_id !== target.action_id || action.revision !== target.revision || action.payload_hash !== target.payload_hash || target.status !== 'prepared' || actionBusy || preparing || assistantBusy || confirmLock.current) return
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
  async function refreshAction(target: StorageAction) {
    if (!action || action.action_id !== target.action_id || action.revision !== target.revision || confirmLock.current || actionBusy) return
    setActionBusy(true)
    try {
      const result = await storageRequest<{ action: StorageAction }>(`/api/storage/actions/${action.action_id}`)
      await confirmed(result.action)
      if (result.action.status === 'prepared') setActionError('아직 완료되지 않았습니다. 같은 작업을 다시 시도할 수 있습니다.')
    } catch (error) { setActionError(error instanceof Error ? error.message : '결과를 확인하지 못했습니다') }
    finally { setActionBusy(false) }
  }
  async function cancelAction(target: StorageAction) {
    if (!action || action.action_id !== target.action_id || action.revision !== target.revision || locked) return
    setActionBusy(true)
    try {
      const result = await storageRequest<{ action: StorageAction }>(`/api/storage/actions/${action.action_id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: action.revision }) })
      setConversation(previous => receiveConversationAction(previous, result.action))
      setActionError('')
    } catch (error) { setActionError(error instanceof Error ? error.message : '취소하지 못했습니다') }
    finally { setActionBusy(false) }
  }
  async function reprepareAction() {
    if (!action) return
    try { await prepare(action.type, typeof action.payload.source_photo_id === 'string' ? { ...action.payload, source_photo_revision: photoDraftsRef.current.find(photo => photo.photo_id === action.payload.source_photo_id)?.revision } : action.payload) }
    catch (error) { setActionError(error instanceof Error ? error.message : '변경안을 새로 만들지 못했습니다') }
  }
  const receivePhotoDrafts = useCallback((drafts: PhotoConversationDraft[]) => {
    photoDraftsRef.current = drafts
    setPhotoDrafts(drafts)
  }, [])
  function updatePhotoDraft(update: PhotoDraftUpdate) {
    const current = photoDraftsRef.current.find(photo => photo.photo_id === update.photo_id)
    if (storageLocked || confirmLock.current || !current || current.revision !== update.expected_revision || (action?.status === 'prepared' && action.payload.source_photo_id === update.photo_id)) {
      toast.error('사진 후보가 바뀌어 정정을 적용하지 못했습니다. 현재 내용을 확인해주세요.')
      return false
    }
    photoDraftsRef.current = photoDraftsRef.current.map(photo => photo.photo_id === update.photo_id ? { ...photo, revision: photo.revision + 1, items: update.items } : photo)
    setPhotoDraftUpdate(update)
    activatePhotos()
    return true
  }
  async function requestDelete(type: 'delete_item' | 'delete_container' | 'delete_location', target: WorkspaceItem | WorkspaceContainer | WorkspaceLocation) {
    const field = type === 'delete_item' ? 'item_id' : type === 'delete_container' ? 'container_id' : 'location_id'
    const table = type === 'delete_item' ? 'items' : type === 'delete_container' ? 'containers' : 'locations'
    const versions = { [`${table}:${target.id}`]: target.version, ...(type === 'delete_container' ? { [`contents:${target.id}`]: (target as WorkspaceContainer).contents_version } : {}) }
    try { await prepare(type, { [field]: target.id }, versions); setManagementOpen(false); setLocationsOpen(false) }
    catch (error) { toast.error(error instanceof Error ? error.message : '삭제 내용을 준비하지 못했습니다') }
  }
  function openEditor(next: Editor) {
    if (locked) return
    setManagementOpen(false); setLocationsOpen(false); setEditor(next)
  }
  function openSearch() {
    if (locked) return
    setManagementOpen(false); setQuery(''); setScopeInput(searchScope ?? ''); setSearchOpen(true)
  }
  async function search(event: React.FormEvent) {
    event.preventDefault()
    if (!query.trim()) return
    followBottom.current = true
    appendMessage({ id: crypto.randomUUID(), role: 'user', content: `${scopeInput ? `${containers.find(c => c.id === scopeInput)?.name || '선택한 보관함'}에서 ` : ''}${query.trim()} 찾기` })
    setSearchOpen(false)
    const same = query.trim() === urlQuery && (scopeInput || null) === searchScope
    updateUrl({ q: query.trim(), scope: scopeInput || null })
    if (same) {
      setSearching(true); setSearchError('')
      try { const found = await storageRequest<{ items: WorkspaceItem[] }>(`/api/storage/search?${new URLSearchParams({ q: query.trim(), ...(scopeInput ? { container_id: scopeInput } : {}) })}`); appendResults(found.items, `‘${query.trim()}’ 검색 결과`) }
      catch (error) { setSearchError(error instanceof Error ? error.message : '검색하지 못했습니다') }
      finally { setSearching(false) }
    }
  }
  function selectContainer(container: WorkspaceContainer | null) {
    updateUrl({ container: container?.id ?? null })
    if (!locked) setRegistrationContainerId(container?.id ?? null)
  }
  const hasConversation = photosActive || conversation.entries.some(entry => entry.kind !== 'photos')
  const messages = conversation.entries.flatMap(entry => entry.kind === 'message' ? [{ id: entry.id, role: entry.role, content: entry.content }] : [])
  const editorTitle = editor?.kind === 'container' ? (editor.container ? '보관함 수정' : '새 보관함') : editor?.kind === 'location' ? (editor.location ? '장소 수정' : '새 장소') : editor?.kind === 'move' ? '물품 이동' : editor?.item ? '물품 수정' : '직접 등록'
  const contextLabel = containers.find(container => container.id === registrationContainerId)?.name
  const headerContextLabel = [selected?.name, searchScope ? `찾기: ${containers.find(c => c.id === searchScope)?.name || '선택한 보관함'}` : null].filter(Boolean).join(' · ')

  return <div className="mx-auto flex h-[calc(100dvh-4rem-1px)] min-h-0 w-full max-w-3xl flex-col">
    <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6"><div><h1 className="text-base font-semibold tracking-tight">보관 대화</h1>{headerContextLabel && <p className="mt-0.5 text-xs text-muted-foreground">{headerContextLabel}</p>}</div><Button variant="ghost" disabled={!data || locked} onClick={() => setManagementOpen(true)} className="min-h-11"><Archive className="size-4" />관리</Button></header>
    <div ref={transcript} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-6" onScroll={event => { const element = event.currentTarget; const near = element.scrollHeight - element.scrollTop - element.clientHeight < 100; followBottom.current = near; setNearBottom(near) }} aria-label="보관 대화 기록">
      {!data && !loadError && <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />기록을 불러오는 중...</p>}
      {loadError && <div role="alert" className="space-y-2 py-4"><p className="text-sm text-destructive">{loadError}</p><Button variant="outline" size="sm" disabled={refreshing} onClick={() => void refresh()}><RefreshCw className="size-4" />다시 불러오기</Button></div>}
      {!hasConversation && data && <div className="flex min-h-[45dvh] flex-col items-center justify-center gap-5 text-center"><div className="space-y-2"><h2 className="text-2xl font-semibold tracking-tight">어떤 물건을 찾으세요?</h2><p className="text-sm text-muted-foreground">말로 찾고, 사진으로 기록해보세요.</p></div><div className="flex max-w-md flex-wrap justify-center gap-2"><Button variant="outline" className="rounded-full" disabled={locked} onClick={() => { followBottom.current = true; setPrompt({ id: Date.now(), text: '등록된 보관함을 보여줘' }) }}>보관함 둘러보기</Button><Button variant="outline" className="rounded-full" disabled={locked} onClick={() => { followBottom.current = true; setPrompt({ id: Date.now(), text: '충전기 어디 있어?' }) }}>충전기 어디 있어?</Button><Button variant="outline" className="rounded-full" disabled={locked} onClick={() => attachPhoto()}><Camera className="size-4" />사진으로 등록</Button></div></div>}
      <div className="space-y-6">{conversation.entries.map(entry => {
        if (entry.kind === 'photos') return <div key={entry.id} hidden={!photosActive}><PhotoRegistration ref={photoRef} containers={containers} containerId={registrationContainerId} onContainerChange={setRegistrationContainerId} existingNames={(data?.items ?? []).filter(item => item.container_id === registrationContainerId).map(item => item.name)} prepare={prepare} action={action} locked={storageLocked} interactionLocked={assistantBusy} onDraftsChange={receivePhotoDrafts} draftUpdate={photoDraftUpdate} onPhotosAdded={activatePhotos} /></div>
        if (entry.kind === 'message') return <ChatMessage key={entry.id} role={entry.role} content={entry.content} />
        if (entry.kind === 'results') return <ResultsCard key={entry.id} items={entry.items} title={entry.title} emptyMessage={entry.containerId ? '이 보관함에 등록된 물품이 없어요.' : undefined} locked={locked} onEdit={item => openEditor({ kind: 'item', item })} onMove={item => openEditor({ kind: 'move', item })} onDelete={item => void requestDelete('delete_item', item)} />
        const entryAction = conversation.actions[entry.actionId]
        if (!entryAction) return null
        const active = entry.actionId === conversation.activeActionId
        return <ActionCard key={entry.id} action={entryAction} containers={containers} locations={locations} interactive={active} busy={active && (actionBusy || preparing || assistantBusy)} uncertain={active && uncertain} error={active ? actionError : ''} onConfirm={() => confirmAction(entryAction)} onCancel={() => cancelAction(entryAction)} onRefresh={() => refreshAction(entryAction)} onReprepare={reprepareAction} onDismiss={() => {}} />
      })}</div>
      {searching && <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />기록을 찾는 중...</p>}
      {searchError && <p role="alert" className="mt-5 text-sm text-destructive">{searchError} 조회에 실패했습니다. 다시 검색해주세요.</p>}
    </div>
    <div className="relative shrink-0 bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
      {!nearBottom && <Button variant="outline" size="sm" className="absolute -top-11 left-1/2 -translate-x-1/2 rounded-full bg-background shadow-sm" onClick={scrollToBottom}><ArrowDown className="size-4" />최근 대화</Button>}
      <AssistantPanel messages={messages} onMessage={appendMessage} onBusyChange={setAssistantBusy} onAttachPhoto={() => attachPhoto()} onTakePhoto={() => attachPhoto(true)} onManage={() => { if (!locked) setManagementOpen(true) }} onDirectRegister={() => openEditor({ kind: 'item' })} onSearch={openSearch} prompt={prompt} contextLabel={contextLabel} active={Boolean(data) && !storageLocked && !managementOpen && !locationsOpen && !searchOpen && !editor} selectedContainerId={selected?.id ?? null} searchScope={searchScope} registrationContainerId={registrationContainerId} activeAction={action} photoDrafts={photoDrafts} onPhotoDraft={updatePhotoDraft} onAction={receiveAction} onSearchResults={items => appendResults(items)} />
    </div>
    {data && <ManagementDialog open={managementOpen} onOpenChange={setManagementOpen} data={data} selectedId={selectedId} locked={locked} refreshing={refreshing} onSelect={selectContainer} onNewContainer={() => openEditor({ kind: 'container' })} onEditContainer={container => openEditor({ kind: 'container', container })} onDeleteContainer={container => void requestDelete('delete_container', container)} onLocations={() => { setManagementOpen(false); setLocationsOpen(true) }} onDirectRegister={() => openEditor({ kind: 'item' })} onSearch={openSearch} onRefresh={() => void refresh().then(fresh => { if (fresh) setConversation(previous => ({ ...previous, entries: refreshConversationResults(previous.entries, fresh.items) })) })} onEditItem={item => openEditor({ kind: 'item', item })} onMoveItem={item => openEditor({ kind: 'move', item })} onDeleteItem={item => void requestDelete('delete_item', item)} />}
    <Dialog open={editor !== null} onOpenChange={open => { if (!open && !preparing) setEditor(null) }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editorTitle}</DialogTitle><DialogDescription>입력한 내용을 대화에서 확인한 뒤 저장합니다.</DialogDescription></DialogHeader>{editor?.kind === 'item' && <>{!editor.item && <div className="space-y-1"><Label htmlFor="manual-registration-target">등록할 보관함</Label><select id="manual-registration-target" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={registrationContainerId ?? ''} onChange={event => setRegistrationContainerId(event.target.value || null)} disabled={locked}><option value="">보관함 선택</option>{containers.map(container => <option key={container.id} value={container.id}>{container.location_name || '장소 미지정'} → {container.name}</option>)}</select>{!containers.length && <Button variant="outline" onClick={() => setEditor({ kind: 'container' })}><Plus className="size-4" />먼저 보관함 만들기</Button>}</div>}{(editor.item || registrationContainerId) && <ItemEditor key={editor.item?.id ?? 'new-item'} item={editor.item} containerId={editor.item?.container_id ?? registrationContainerId!} prepare={prepare} onPrepared={() => setEditor(null)} />}</>}{editor?.kind === 'move' && <MoveEditor item={editor.item} containers={containers} prepare={prepare} onPrepared={() => setEditor(null)} />}{editor?.kind === 'container' && <ContainerEditor key={editor.container?.id ?? 'new'} container={editor.container} locations={locations} prepare={prepare} onPrepared={() => setEditor(null)} />}{editor?.kind === 'location' && <LocationEditor key={editor.location?.id ?? 'new'} location={editor.location} prepare={prepare} onPrepared={() => setEditor(null)} />}</DialogContent></Dialog>
    <Dialog open={locationsOpen} onOpenChange={setLocationsOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>장소 관리</DialogTitle><DialogDescription>장소별로 보관함을 묶어 관리하세요.</DialogDescription></DialogHeader><Button disabled={locked} onClick={() => openEditor({ kind: 'location' })}><Plus className="size-4" />새 장소</Button><div className="divide-y">{locations.map(location => <div key={location.id} className="flex items-center gap-3 py-3"><MapPin className="size-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="break-words font-medium">{location.name}</p><p className="text-sm text-muted-foreground">{location.description || `${containers.filter(c => c.location_id === location.id).length}개 보관함`}</p></div><Button variant="ghost" size="icon" aria-label={`${location.name} 수정`} disabled={locked} onClick={() => openEditor({ kind: 'location', location })}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" aria-label={`${location.name} 삭제`} disabled={locked} onClick={() => void requestDelete('delete_location', location)}><Trash2 className="size-4" /></Button></div>)}{!locations.length && <p className="py-6 text-center text-sm text-muted-foreground">등록된 장소가 없습니다.</p>}</div></DialogContent></Dialog>
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent><DialogHeader><DialogTitle>물품 검색</DialogTitle><DialogDescription>이름과 설명으로 저장한 기록을 찾아요.</DialogDescription></DialogHeader><form onSubmit={search} className="space-y-4"><div className="space-y-1"><Label htmlFor="manual-search">검색어</Label><Input id="manual-search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="예: 검은색 충전기" maxLength={200} /></div><div className="space-y-1"><Label htmlFor="search-scope">찾기 범위</Label><select id="search-scope" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={scopeInput} onChange={event => setScopeInput(event.target.value)}><option value="">전체 보관함</option>{containers.map(container => <option key={container.id} value={container.id}>{container.location_name || '장소 미지정'} → {container.name}</option>)}</select><p className="text-xs text-muted-foreground">등록 대상과 별개로 선택합니다.</p></div><Button type="submit" className="w-full" disabled={!query.trim()}><Search className="size-4" />찾기</Button></form></DialogContent></Dialog>
  </div>
}
