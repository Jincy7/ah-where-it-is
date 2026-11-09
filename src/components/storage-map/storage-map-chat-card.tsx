'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Expand, Loader2, Map, MapPin, MessageCircle, Pencil, Plus, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { StorageMapSceneData, StorageMapView } from '@/lib/storage/map-types'
import { storageRequest } from '@/components/storage-workspace/contracts'
import { StorageMapScene } from './storage-map-scene'
import { StorageMapMiniature } from './storage-map-miniature'

export function mapEvidenceChanged(view: StorageMapView, scene: StorageMapSceneData) {
  const before = view.evidence_versions, after = scene.resolution?.versions ?? {}
  const domainSnapshot = (value: StorageMapSceneData) => JSON.stringify({
    locations: value.locations.map(({ id, name, version, container_count, item_count }) => ({ id, name, version, container_count, item_count })).sort((a, b) => a.id.localeCompare(b.id)),
    containers: value.containers.map(({ id, name, version, location_id, item_count }) => ({ id, name, version, location_id, item_count })).sort((a, b) => a.id.localeCompare(b.id)),
  })
  const fullMapChanged = !view.target && view.scene && domainSnapshot(view.scene) !== domainSnapshot(scene)
  return !!fullMapChanged || view.created_map_revision !== (scene.map?.revision ?? null) || Object.keys({ ...before, ...after }).some(key => before[key] !== after[key])
}
const placementLabels = { placed: '사용자가 배치한 표식', no_location: '장소 미지정', unmapped_location: '지도에 없는 장소', unplaced: '구획 내 위치 미지정', deleted: '삭제된 기록' }
export interface StorageMapChatCardProps {
  view: StorageMapView
  refreshKey?: number
  onEdit?: () => void
  onPropose?: () => void
  proposing?: boolean
  proposalDisabled?: boolean
  onRegister?: (containerId: string) => void
  onSearch?: (containerId: string) => void
  onDiscuss?: (containerId: string) => void
}
export function StorageMapChatCard({ view, refreshKey = 0, onEdit, onPropose, proposing = false, proposalDisabled = false, onRegister, onSearch, onDiscuss }: StorageMapChatCardProps) {
  const [scene, setScene] = useState<StorageMapSceneData | null>(view.scene ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [focusIds, setFocusIds] = useState<string[]>([])
  const [focusRegion, setFocusRegion] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const targetKind = view.target?.kind, targetId = view.target?.id
  const reload = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController(); request.current = controller
    setLoading(true); setError('')
    const query = targetKind && targetId ? `/resolve?kind=${targetKind}&id=${encodeURIComponent(targetId)}` : ''
    try {
      const next = await storageRequest<StorageMapSceneData>(`/api/storage/map${query}`, { signal: controller.signal })
      if (!controller.signal.aborted) setScene(next)
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '지도를 갱신하지 못했습니다.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }, [targetKind, targetId])
  useEffect(() => {
    void reload()
    const focus = () => { if (!document.hidden) void reload() }
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus)
    return () => { request.current?.abort(); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus) }
  }, [reload, refreshKey])
  const resolution = scene?.resolution
  const regionIds = resolution?.region_id ? [resolution.region_id] : []
  const containerIds = resolution?.container ? [resolution.container.id] : []
  const changed = !!scene && mapEvidenceChanged(view, scene)
  const path = resolution?.status === 'deleted' ? '이 대상의 기록이 삭제되었습니다.' : resolution ? [resolution.location?.name ?? (resolution.container ? '장소 미지정' : null), resolution.container?.name].filter(Boolean).join(' → ') : null
  const focused = scene?.containers.filter(container => focusIds.includes(container.id) || (!focusIds.length && focusRegion && scene.regions.find(region => region.id === focusRegion)?.location_id === container.location_id)) ?? []
  const displayedContainers = focusIds.length || focusRegion ? focused : scene?.containers ?? []
  function openExpanded() { setExpanded(true); void reload() }
  const locationSummary = path && <div className="min-w-0 space-y-1"><p className="text-xs text-muted-foreground">{error ? '이전 조회 위치' : changed ? '현재 마지막 기록 위치' : '마지막 기록 위치'}</p><p className="break-words text-sm font-medium">{path}</p>{resolution?.item && <p className="break-words text-sm">{resolution.item.name} · {resolution.item.quantity}개</p>}{resolution && <Badge variant="outline" className="whitespace-normal">{placementLabels[resolution.placement]}</Badge>}</div>
  return <section className="space-y-3 rounded-2xl border bg-card p-4" aria-label="채팅 보관 지도">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><Map className="size-4 text-primary" />{scene?.map?.name ?? '우리 집 지도'}</h3><Button size="sm" className="min-h-11" variant="ghost" disabled={loading} onClick={() => void reload()}>{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}새로고침</Button></div>
    {changed && <Badge variant="secondary">답변 이후 기록이 변경됨</Badge>}
    {error && <div role="alert" className="space-y-1 text-sm text-destructive"><p>갱신 실패: {error}</p>{scene && <p className="text-xs">{new Date(scene.evidence_at).toLocaleString('ko-KR')} 조회 당시의 지도를 표시합니다.</p>}</div>}
    {scene?.map ? <div className="flex flex-wrap items-start gap-3"><StorageMapMiniature title="보관 지도" columns={scene.map.columns} rows={scene.map.rows} regions={scene.regions} anchors={scene.anchors} containers={scene.containers} highlightRegionIds={regionIds} highlightContainerIds={containerIds} small onExpand={openExpanded} /><div className="min-w-0 flex-1 basis-32">{locationSummary || <div className="space-y-1"><p className="text-sm">{scene.regions.length}개 장소 구획 · {scene.anchors.length}개 표식</p><p className="break-words text-xs text-muted-foreground">{scene.regions.slice(0, 3).map(region => region.location_name).join(', ')}{scene.regions.length > 3 ? ` 외 ${scene.regions.length - 3}곳` : ''}</p><p className="text-xs text-muted-foreground">미니맵을 눌러 크게 확인하세요.</p></div>}</div></div> : !loading && !error ? <div className="space-y-2 rounded-lg border border-dashed px-4 py-6 text-center"><MapPin className="mx-auto size-7 text-muted-foreground" /><p className="text-sm font-medium">아직 저장한 지도가 없습니다</p><p className="text-xs text-muted-foreground">장소와 보관함은 아래 목록으로 확인할 수 있습니다.</p>{onEdit && <Button variant="outline" className="min-h-11" onClick={onEdit}><Plus className="size-4" />지도 만들기</Button>}</div> : !scene && <p role="status" className="text-sm text-muted-foreground">{loading ? '지도 불러오는 중…' : '지도를 불러오지 못했습니다.'}</p>}
    {!scene?.map && locationSummary}
    {scene?.truncated && <p className="text-xs text-muted-foreground">일부 목록만 표시하고 있습니다. 표시된 수는 서버 집계입니다.</p>}
    <div className="flex flex-wrap gap-2">{onPropose && <Button variant="outline" className="min-h-11" disabled={proposing || proposalDisabled || !scene} onClick={onPropose}>{proposing ? <Loader2 className="size-4 animate-spin" /> : <Map className="size-4" />}기본 배치 제안</Button>}<Button variant="outline" className="min-h-11" disabled={!scene} onClick={openExpanded}><Expand className="size-4" />크게 보기·목록</Button>{onEdit && scene?.map && <Button variant="ghost" className="min-h-11" onClick={onEdit}><Pencil className="size-4" />지도 편집</Button>}</div>
    {scene && <p className="text-xs text-muted-foreground">조회 {new Date(scene.evidence_at).toLocaleTimeString('ko-KR')} · 표식은 사용자가 배치한 기록입니다.</p>}
    <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="max-h-[92dvh] overflow-y-auto p-4 sm:max-w-4xl sm:p-6"><DialogHeader><DialogTitle>{scene?.map?.name ?? '장소와 보관함'}</DialogTitle><DialogDescription>지도 선택은 등록 대상과 검색 범위를 바꾸지 않습니다. 아래 동작으로 각각 지정하세요.</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">갱신 실패 · {scene ? `${new Date(scene.evidence_at).toLocaleString('ko-KR')} 조회 장면` : error}</p>}
      {scene?.map && <div className="overflow-auto rounded-lg border"><div className="min-w-[480px]"><StorageMapScene columns={scene.map.columns} rows={scene.map.rows} regions={scene.regions} anchors={scene.anchors} containers={scene.containers} highlightRegionIds={focusRegion ? [focusRegion] : regionIds} highlightContainerIds={focusIds.length ? focusIds : containerIds} onRegionSelect={id => { setFocusRegion(id); setFocusIds([]) }} onAnchorSelect={ids => { setFocusIds(ids); setFocusRegion(null) }} /></div></div>}
      <div className="flex flex-wrap gap-2"><Button variant={!focusIds.length && !focusRegion ? 'secondary' : 'outline'} className="min-h-11" onClick={() => { setFocusIds([]); setFocusRegion(null) }}>전체 목록</Button>{scene?.regions.map((region, index) => <Button key={region.id} className="min-h-11 max-w-full" variant={focusRegion === region.id ? 'secondary' : 'outline'} onClick={() => { setFocusRegion(region.id); setFocusIds([]) }}><span className="truncate">{index + 1}. {region.location_name}</span></Button>)}</div>
      {resolution?.status === 'deleted' && <p className="text-sm text-muted-foreground">조회 대상은 삭제되었습니다. 이전 좌표를 현재 위치로 표시하지 않습니다.</p>}
      <ul className="divide-y" aria-label="보관함 목록">{displayedContainers.map(container => {
        const location = scene?.locations.find(item => item.id === container.location_id)
        const region = scene?.regions.find(item => item.location_id === container.location_id)
        const anchor = scene?.anchors.find(item => item.container_id === container.id)
        const status = !container.location_id ? '장소 미지정' : !region ? '지도에 없는 장소' : !anchor ? '구획 내 위치 미지정' : `사용자 표식 (${anchor.col}, ${anchor.row})`
        return <li key={container.id} className="space-y-2 py-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-medium">{location?.name ?? '장소 미지정'} → {container.name}</p><p className="text-xs text-muted-foreground">{status}</p></div><Badge variant="outline" className="shrink-0">{container.item_count}종</Badge></div><div className="flex flex-wrap gap-2">{onDiscuss && <Button variant="outline" className="min-h-11" onClick={() => { onDiscuss(container.id); setExpanded(false) }}><MessageCircle className="size-4" />대화에서 보기</Button>}{onRegister && <Button variant="outline" className="min-h-11" onClick={() => { onRegister(container.id); setExpanded(false) }}><Plus className="size-4" />여기에 등록</Button>}{onSearch && <Button variant="outline" className="min-h-11" onClick={() => { onSearch(container.id); setExpanded(false) }}><Search className="size-4" />여기서 찾기</Button>}</div></li>
      })}</ul>{!displayedContainers.length && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{focusRegion ? '이 장소에 등록된 보관함이 없습니다.' : '등록된 보관함이 없습니다.'}</p>}
      {!!scene?.locations.filter(location => !scene.containers.some(container => container.location_id === location.id)).length && <div className="space-y-1 border-t pt-3"><p className="text-xs font-medium text-muted-foreground">보관함이 없는 장소</p><p className="break-words text-sm">{scene.locations.filter(location => !scene.containers.some(container => container.location_id === location.id)).map(location => location.name).join(', ')}</p></div>}
    </DialogContent></Dialog>
  </section>
}
