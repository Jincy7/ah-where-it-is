'use client'

import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Hand, Loader2, MapPin, Pencil, Plus, Save, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import type { MapContainer, MapLocation, MapRegion, StorageMapDraft, StorageMapSceneData } from '@/lib/storage/map-types'
import { StorageMapScene } from './storage-map-scene'
import { containsCell, gridResizeProblem, rectangleCells, rectangleProblem, regionBounds, selectionRectangle, transformRegion, type Cell, type Rectangle } from './editor-state'

export function createMapDraft(scene: StorageMapSceneData | null): StorageMapDraft {
  return { base_map_revision: scene?.map?.revision ?? null, map_draft_id: crypto.randomUUID(), draft_revision: 1, name: scene?.map?.name ?? '우리 집 지도', columns: scene?.map?.columns ?? 12, rows: scene?.map?.rows ?? 8, regions: scene?.regions.map(({ id, location_id, client_location_key, color_key, cells }) => ({ id, location_id, client_location_key, color_key, cells: cells.map(cell => ({ ...cell })) })) ?? [], new_locations: [], anchors: scene?.anchors.map(anchor => ({ ...anchor })) ?? [] }
}
export function draftSceneRegions(draft: StorageMapDraft, locations: Pick<MapLocation, 'id' | 'name'>[]) {
  return draft.regions.map(region => ({ ...region, location_name: region.location_id ? locations.find(location => location.id === region.location_id)?.name ?? '삭제된 장소' : draft.new_locations.find(location => location.client_location_key === region.client_location_key)?.name ?? '장소 미지정' }))
}
export interface StorageMapEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scene: StorageMapSceneData | null
  draft: StorageMapDraft | null
  onDraftChange: (draft: StorageMapDraft | null) => void
  locations: Pick<MapLocation, 'id' | 'name'>[]
  containers: Pick<MapContainer, 'id' | 'name' | 'location_id'>[]
  locked?: boolean
  blockedReason?: string
  busy?: boolean
  onPrepare: (draft: StorageMapDraft) => Promise<void>
  onEditPrepared?: () => Promise<void>
  onChangeContainer?: (containerId: string) => void
  onPropose?: () => void
  proposing?: boolean
  proposalDisabled?: boolean
}
const selectClass = 'h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm'
function NumberField({ label, value, max, onChange }: { label: string; value: number; max?: number; onChange: (value: number) => void }) {
  return <label className="space-y-1 text-xs"><span>{label}</span><Input aria-label={label} className="h-11" type="number" min={0} max={max} step={1} value={Number.isNaN(value) ? '' : value} onChange={event => onChange(event.target.value === '' ? NaN : Number(event.target.value))} /></label>
}
export function StorageMapEditor({ open, onOpenChange, scene, draft, onDraftChange, locations, containers, locked = false, blockedReason, busy = false, onPrepare, onEditPrepared, onChangeContainer, onPropose, proposing = false, proposalDisabled = false }: StorageMapEditorProps) {
  const [mode, setMode] = useState<'draw' | 'pan'>('draw')
  const [zoom, setZoom] = useState(1)
  const [selection, setSelection] = useState<Rectangle | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [coordinates, setCoordinates] = useState({ startCol: 0, startRow: 0, endCol: 1, endRow: 1 })
  const [bounds, setBounds] = useState<Rectangle>({ col: 0, row: 0, width: 1, height: 1 })
  const [dimensions, setDimensions] = useState<{ columns: number; rows: number } | null>(null)
  const [locationChoice, setLocationChoice] = useState('')
  const [newName, setNewName] = useState('')
  const [anchorChoice, setAnchorChoice] = useState('')
  const [anchorCell, setAnchorCell] = useState<Cell>({ col: 0, row: 0 })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [closeWarning, setCloseWarning] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const drag = useRef<{ pointerId: number; start: Cell } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  if (!draft) return null
  const disabled = locked || busy || proposing || proposalDisabled
  const regions = draftSceneRegions(draft, locations)
  const selected = draft.regions.find(region => region.id === selectedId)
  const selectedName = regions.find(region => region.id === selectedId)?.location_name ?? '구획'
  const selectionError = selection ? rectangleProblem(selection, draft.columns, draft.rows, draft.regions) : null
  const sameNames = locations.filter(location => location.name.trim() === newName.trim())
  const orphaned = draft.regions.filter(region => !region.location_id && !region.client_location_key)
  function update(next: StorageMapDraft) {
    const used = new Set(next.regions.map(region => region.client_location_key))
    onDraftChange({ ...next, draft_revision: draft!.draft_revision + 1, new_locations: next.new_locations.filter(location => used.has(location.client_location_key)) })
    setError('')
  }
  function selectRegion(id: string) {
    const region = draft!.regions.find(candidate => candidate.id === id)
    if (!region) return
    setSelectedId(id); setSelection(null); setBounds(regionBounds(region.cells)); setLocationChoice(region.location_id ?? (region.client_location_key ? `draft:${region.client_location_key}` : '')); setAnchorCell(regionBounds(region.cells)); setError(''); setNotice('')
  }
  function cellAt(event: PointerEvent<SVGSVGElement>): Cell {
    const rect = event.currentTarget.getBoundingClientRect()
    return { col: Math.max(0, Math.min(draft!.columns - 1, Math.floor((event.clientX - rect.left) / rect.width * draft!.columns))), row: Math.max(0, Math.min(draft!.rows - 1, Math.floor((event.clientY - rect.top) / rect.height * draft!.rows))) }
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || !event.isPrimary) return
    if (mode === 'pan') {
      if (event.pointerType === 'mouse' && scrollRef.current) { pan.current = { x: event.clientX, y: event.clientY, left: scrollRef.current.scrollLeft, top: scrollRef.current.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId) }
      return
    }
    if (disabled) return
    const cell = cellAt(event)
    const occupied = draft!.regions.find(region => containsCell(region.cells, cell))
    if (occupied) { selectRegion(occupied.id); return }
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, start: cell }; setSelectedId(null); setSelection(selectionRectangle(cell, cell)); setLocationChoice(''); setError('')
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    if (pan.current && scrollRef.current) { scrollRef.current.scrollLeft = pan.current.left - event.clientX + pan.current.x; scrollRef.current.scrollTop = pan.current.top - event.clientY + pan.current.y; return }
    if (!drag.current || event.pointerId !== drag.current.pointerId || disabled) return
    setSelection(selectionRectangle(drag.current.start, cellAt(event)))
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    if (drag.current && event.pointerId === drag.current.pointerId) setSelection(selectionRectangle(drag.current.start, cellAt(event)))
    drag.current = null; pan.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function clearSelection() { drag.current = null; pan.current = null; setSelection(null) }
  function assignLocation() {
    if (disabled || (!selected && !selection)) return
    if (selectionError) { setError(selectionError); return }
    if (!selected && draft!.regions.length >= 64) { setError('구획은 최대 64개까지 만들 수 있습니다.'); return }
    let location_id: string | null = null, client_location_key: string | null = null
    let newLocations = draft!.new_locations
    if (locationChoice === 'new') {
      const name = newName.trim()
      if (!name || name.length > 100) { setError('새 장소 이름을 1~100자로 입력해주세요.'); return }
      if (sameNames.length) { setError('같은 이름의 기존 장소가 있습니다. 연결할 장소를 목록에서 명시적으로 선택해주세요.'); return }
      client_location_key = crypto.randomUUID(); newLocations = [...newLocations, { client_location_key, name }]
    } else if (locationChoice.startsWith('draft:')) client_location_key = locationChoice.slice(6)
    else if (locations.some(location => location.id === locationChoice)) location_id = locationChoice
    else { setError('연결할 장소를 선택해주세요.'); return }
    const duplicate = draft!.regions.find(region => region.id !== selected?.id && (location_id ? region.location_id === location_id : region.client_location_key === client_location_key))
    if (duplicate) { selectRegion(duplicate.id); setError('이 장소는 이미 구획에 연결되어 있습니다. 해당 구획을 선택했습니다.'); return }
    const region: MapRegion = selected ? { ...selected, location_id, client_location_key } : { id: crypto.randomUUID(), location_id, client_location_key, color_key: (['green', 'yellow', 'blue', 'purple', 'pink', 'neutral'] as const)[draft!.regions.length % 6], cells: rectangleCells(selection!) }
    const changedLink = selected && (selected.location_id !== location_id || selected.client_location_key !== client_location_key)
    const anchors = changedLink ? draft!.anchors.filter(anchor => anchor.region_id !== region.id) : draft!.anchors
    if (changedLink) setNotice('장소 연결만 변경합니다. 이전 장소의 표식은 해제되고 보관함 소속은 유지됩니다.')
    update({ ...draft!, regions: selected ? draft!.regions.map(item => item.id === selected.id ? region : item) : [...draft!.regions, region], anchors, new_locations: newLocations })
    setSelection(null); setSelectedId(region.id); setBounds(regionBounds(region.cells)); setLocationChoice(location_id ?? `draft:${client_location_key}`)
  }
  function applyBounds(next: Rectangle) {
    if (!selected || disabled) return
    const problem = rectangleProblem(next, draft!.columns, draft!.rows, draft!.regions, selected.id)
    if (problem) { setError(problem); return }
    const transformed = transformRegion(selected, next, draft!.anchors)
    update({ ...draft!, regions: draft!.regions.map(region => region.id === selected.id ? { ...region, cells: transformed.cells } : region), anchors: transformed.anchors })
    setBounds(next)
    if (transformed.removed.length) setNotice(`구획 밖으로 나가는 표식 ${transformed.removed.length}개를 미배치로 돌립니다: ${transformed.removed.map(anchor => containers.find(container => container.id === anchor.container_id)?.name ?? '보관함').join(', ')}. 저장 전 변경안에서도 확인하세요.`)
    else setNotice('구획과 내부 표식을 함께 이동·조정했습니다. 아직 저장되지 않았습니다.')
  }
  function placeAnchor() {
    if (!selected || disabled) return
    const container = containers.find(item => item.id === anchorChoice)
    if (!container) { setError('보관함을 선택해주세요.'); return }
    if (container.location_id !== selected.location_id || !selected.location_id) { setError('다른 장소의 보관함입니다. 먼저 보관함 관리에서 장소 변경안을 확인해주세요.'); return }
    if (![anchorCell.col, anchorCell.row].every(Number.isInteger) || !containsCell(selected.cells, anchorCell)) { setError('선택한 구획 안의 칸을 지정해주세요.'); return }
    update({ ...draft!, anchors: [...draft!.anchors.filter(anchor => anchor.container_id !== container.id), { container_id: container.id, region_id: selected.id, ...anchorCell }] })
    setNotice('표식을 배치했습니다. 같은 칸의 보관함은 묶어서 표시합니다.')
  }
  function requestClose(next: boolean) {
    if (next) { onOpenChange(true); return }
    clearSelection()
    if (draft!.draft_revision > 1 && !locked) setCloseWarning(true)
    else onOpenChange(false)
  }
  const unplacedGroups = [
    { label: '장소 미지정', items: containers.filter(container => !container.location_id) },
    { label: '지도에 없는 장소', items: containers.filter(container => container.location_id && !draft.regions.some(region => region.location_id === container.location_id)) },
    { label: '구획 내 위치 미지정', items: containers.filter(container => container.location_id && draft.regions.some(region => region.location_id === container.location_id) && !draft.anchors.some(anchor => anchor.container_id === container.id)) },
  ]
  return <>
    <Dialog open={open} onOpenChange={requestClose}><DialogContent className="max-h-[92dvh] overflow-y-auto p-4 sm:max-w-5xl sm:p-6" onEscapeKeyDown={event => { if (selection || drag.current) { event.preventDefault(); clearSelection() } }}>
      <DialogHeader><DialogTitle>보관 지도 편집</DialogTitle><DialogDescription>빈 칸을 드래그해 구획을 만들고 장소에 연결하세요. 1칸은 실제 길이가 아닌 배치 단위입니다.</DialogDescription></DialogHeader>
      {onPropose && <div className="space-y-1"><Button variant="outline" className="min-h-11" disabled={disabled} onClick={onPropose}>{proposing ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}기본 배치 제안</Button><p className="text-xs text-muted-foreground">현재 기록과 초안을 바탕으로 대화에서 배치를 제안합니다. AI 키 없이도 사용할 수 있습니다.</p></div>}
      {locked && <div className="space-y-2 rounded-md border bg-muted p-3 text-sm"><p>확인 중인 지도 변경안이 있어 편집이 잠겨 있습니다.</p>{onEditPrepared && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void onEditPrepared().catch(reason => setError(reason instanceof Error ? reason.message : '변경안 취소 결과를 확인해주세요.'))}><Pencil className="size-4" />변경안 수정</Button>}</div>}
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2"><Button variant={mode === 'draw' ? 'default' : 'outline'} className="min-h-11" disabled={disabled} onClick={() => { setMode('draw'); clearSelection() }} aria-pressed={mode === 'draw'}><Pencil className="size-4" />그리기</Button><Button variant={mode === 'pan' ? 'default' : 'outline'} className="min-h-11" onClick={() => { setMode('pan'); clearSelection() }} aria-pressed={mode === 'pan'}><Hand className="size-4" />화면 이동</Button><div className="ml-auto flex gap-1"><Button size="icon" className="size-11" variant="outline" aria-label="지도 축소" disabled={zoom <= 0.5} onClick={() => setZoom(value => Math.max(.5, value - .25))}><ZoomOut /></Button><Button size="icon" className="size-11" variant="outline" aria-label="지도 확대" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + .25))}><ZoomIn /></Button></div></div>
          <div ref={scrollRef} className="max-h-[50dvh] overflow-auto rounded-lg border" tabIndex={0} aria-label="지도 편집 영역"><div style={{ width: Math.max(280, draft.columns * 36) * zoom }}><StorageMapScene columns={draft.columns} rows={draft.rows} regions={regions} anchors={draft.anchors} containers={containers} sceneLabel="편집 중인 지도 초안" sceneDescription="아직 저장하지 않은 배치입니다. 추천 표식이 포함될 수 있으며 실제 현재 위치를 자동으로 확인하지 않습니다." selectedRegionId={selectedId} selection={selection} invalidSelection={!!selectionError} showGrid className={mode === 'draw' && !disabled ? 'touch-none select-none' : 'touch-auto'} onRegionSelect={selectRegion} onAnchorSelect={ids => { const anchor = draft.anchors.find(item => item.container_id === ids[0]); if (anchor) selectRegion(anchor.region_id); setAnchorChoice(ids[0]); setNotice(ids.length > 1 ? `이 칸의 보관함 ${ids.length}개: ${ids.map(id => containers.find(container => container.id === id)?.name ?? '보관함').join(', ')}` : '') }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={clearSelection} /></div></div>
          <p className="text-xs text-muted-foreground">{draft.columns}×{draft.rows}칸 · 좌측 위 (0, 0) · {Math.round(zoom * 100)}% · {mode === 'draw' ? 'Esc로 선택 취소' : '드래그하거나 스크롤해 화면 이동'}</p>
          <fieldset disabled={disabled} className="space-y-3 rounded-md border p-3"><legend className="px-1 text-sm font-medium">키보드로 구획 지정</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><NumberField label="시작 열" value={coordinates.startCol} max={draft.columns - 1} onChange={startCol => setCoordinates(value => ({ ...value, startCol }))} /><NumberField label="시작 행" value={coordinates.startRow} max={draft.rows - 1} onChange={startRow => setCoordinates(value => ({ ...value, startRow }))} /><NumberField label="끝 열" value={coordinates.endCol} max={draft.columns - 1} onChange={endCol => setCoordinates(value => ({ ...value, endCol }))} /><NumberField label="끝 행" value={coordinates.endRow} max={draft.rows - 1} onChange={endRow => setCoordinates(value => ({ ...value, endRow }))} /></div><Button variant="outline" className="min-h-11" onClick={() => { if (!Object.values(coordinates).every(Number.isInteger)) { setError('시작·끝 셀을 정수로 입력해주세요.'); return } setSelectedId(null); setLocationChoice(''); setSelection(selectionRectangle({ col: coordinates.startCol, row: coordinates.startRow }, { col: coordinates.endCol, row: coordinates.endRow })) }}><Plus className="size-4" />범위 선택</Button></fieldset>
          {regions.length > 0 && <div className="flex flex-wrap gap-2" aria-label="구획 목록">{regions.map((region, index) => <Button key={region.id} variant={selectedId === region.id ? 'secondary' : 'outline'} className="min-h-11 max-w-full" onClick={() => selectRegion(region.id)}><MapPin className="size-4" /><span className="truncate">{index + 1}. {region.location_name}</span></Button>)}</div>}
          <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer py-1 font-medium">미배치 보관함 {unplacedGroups.reduce((sum, group) => sum + group.items.length, 0)}개</summary><div className="mt-3 space-y-3">{unplacedGroups.map(group => <div key={group.label}><p className="text-xs font-medium text-muted-foreground">{group.label} · {group.items.length}개</p><p className="mt-1 break-words">{group.items.map(container => container.name).join(', ') || '없음'}</p></div>)}</div></details>
        </div>
        <div className="min-w-0 space-y-4">
          <fieldset disabled={disabled} className="space-y-3"><div className="space-y-1"><Label htmlFor="map-name">지도 이름 *</Label><Input id="map-name" className="h-11" value={draft.name} maxLength={100} onChange={event => update({ ...draft, name: event.target.value })} /></div><div className="grid grid-cols-2 gap-2"><NumberField label="가로 칸 수" value={dimensions?.columns ?? draft.columns} max={64} onChange={columns => setDimensions({ columns, rows: dimensions?.rows ?? draft.rows })} /><NumberField label="세로 칸 수" value={dimensions?.rows ?? draft.rows} max={64} onChange={rows => setDimensions({ rows, columns: dimensions?.columns ?? draft.columns })} /></div><Button variant="outline" className="min-h-11" onClick={() => { const next = dimensions ?? { columns: draft.columns, rows: draft.rows }; const problem = gridResizeProblem(next.columns, next.rows, draft.regions, draft.anchors); if (problem) setError(problem); else { update({ ...draft, ...next }); setDimensions(null); clearSelection() } }}><Check className="size-4" />격자 크기 적용</Button></fieldset>
          {(selection || selected) && <fieldset disabled={disabled} className="space-y-3 rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">{selected ? selectedName : `새 구획 ${selection!.width}×${selection!.height}칸`}</legend>{selectionError && <p role="alert" className="text-sm text-destructive">{selectionError}</p>}<Label htmlFor="map-location">연결할 장소 *</Label><select id="map-location" className={selectClass} value={locationChoice} onChange={event => setLocationChoice(event.target.value)}><option value="">장소 선택</option>{locations.map((location, index) => <option key={location.id} value={location.id}>{location.name}{locations.filter(item => item.name === location.name).length > 1 ? ` (${index + 1} · ${location.id.slice(0, 6)})` : ''}</option>)}{draft.new_locations.map(location => <option key={location.client_location_key} value={`draft:${location.client_location_key}`}>{location.name} (새 장소 초안)</option>)}<option value="new">+ 새 장소 만들기</option></select>{locationChoice === 'new' && <div className="space-y-2"><Input aria-label="새 장소 이름" className="h-11" placeholder="예: 서재" value={newName} maxLength={100} onChange={event => setNewName(event.target.value)} />{sameNames.length > 0 && <div className="space-y-2 text-sm"><p>같은 이름의 기존 장소가 {sameNames.length}개 있습니다. 연결할 장소를 직접 선택해주세요.</p>{sameNames.map(location => <Button key={location.id} variant="outline" className="min-h-11 w-full" onClick={() => setLocationChoice(location.id)}><MapPin className="size-4" />{location.name} · {location.id.slice(0, 6)}</Button>)}</div>}<p className="text-xs text-muted-foreground">지도 저장 확인 전에는 장소가 생성되지 않습니다.</p></div>}<Button className="min-h-11 w-full" disabled={!!selectionError || (locationChoice === 'new' && sameNames.length > 0)} onClick={assignLocation}><MapPin className="size-4" />{selected ? '장소 연결 변경' : '장소로 지정'}</Button>{selection && <Button className="min-h-11" variant="ghost" onClick={clearSelection}><X className="size-4" />선택 취소</Button>}</fieldset>}
          {selected && <fieldset disabled={disabled} className="space-y-3 rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">구획 이동·크기</legend><div className="grid grid-cols-2 gap-2">{(['col', 'row', 'width', 'height'] as const).map((key, index) => <NumberField key={key} label={['왼쪽 열', '위쪽 행', '너비', '높이'][index]} value={bounds[key]} max={64} onChange={value => setBounds(current => ({ ...current, [key]: value }))} />)}</div><div className="flex gap-1">{([{ icon: ArrowLeft, dx: -1, dy: 0, label: '구획 왼쪽으로 한 칸' }, { icon: ArrowUp, dx: 0, dy: -1, label: '구획 위로 한 칸' }, { icon: ArrowDown, dx: 0, dy: 1, label: '구획 아래로 한 칸' }, { icon: ArrowRight, dx: 1, dy: 0, label: '구획 오른쪽으로 한 칸' }]).map(({ icon: Icon, dx, dy, label }) => <Button key={label} size="icon" className="size-11" variant="outline" aria-label={label} onClick={() => { const current = regionBounds(selected.cells); applyBounds({ ...current, col: current.col + dx, row: current.row + dy }) }}><Icon /></Button>)}</div><Button variant="outline" className="min-h-11" onClick={() => applyBounds(bounds)}><Check className="size-4" />이동·크기 적용</Button><Button variant="ghost" className="min-h-11 text-destructive" onClick={() => setRemoveId(selected.id)}><Trash2 className="size-4" />구획 삭제</Button></fieldset>}
          {selected && <fieldset disabled={disabled} className="space-y-3 rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">보관함 표식</legend><select aria-label="배치할 보관함" className={selectClass} value={anchorChoice} onChange={event => setAnchorChoice(event.target.value)}><option value="">보관함 선택</option>{containers.map(container => <option key={container.id} value={container.id}>{container.name}{container.location_id === selected.location_id && selected.location_id ? '' : ' (다른 장소)'}</option>)}</select><div className="grid grid-cols-2 gap-2"><NumberField label="표식 열" value={anchorCell.col} max={draft.columns - 1} onChange={col => setAnchorCell(value => ({ ...value, col }))} /><NumberField label="표식 행" value={anchorCell.row} max={draft.rows - 1} onChange={row => setAnchorCell(value => ({ ...value, row }))} /></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={placeAnchor}><MapPin className="size-4" />표식 배치</Button>{draft.anchors.some(anchor => anchor.container_id === anchorChoice) && <Button variant="ghost" className="min-h-11" onClick={() => update({ ...draft, anchors: draft.anchors.filter(anchor => anchor.container_id !== anchorChoice) })}><X className="size-4" />표식 해제</Button>}{anchorChoice && onChangeContainer && containers.find(container => container.id === anchorChoice)?.location_id !== selected.location_id && <Button variant="outline" className="min-h-11" onClick={() => onChangeContainer(anchorChoice)}><Pencil className="size-4" />보관함 장소 변경</Button>}</div><p className="text-xs text-muted-foreground">사용자가 배치한 표식이며 실제 위치의 자동 확인이 아닙니다.</p></fieldset>}
        </div>
      </div>
      {notice && <p role="status" className="rounded-md bg-muted p-3 text-sm">{notice}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{orphaned.length > 0 && <p className="text-sm text-destructive">장소가 없는 구획 {orphaned.length}개를 연결하거나 삭제해주세요.</p>}{blockedReason && <p role="status" className="text-sm text-muted-foreground">{blockedReason}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><Badge variant="outline">{draft.regions.length}개 구획 · {draft.anchors.length}개 표식</Badge><Button className="min-h-11" disabled={disabled || !!blockedReason || !!orphaned.length || !draft.name.trim()} onClick={async () => { setError(''); try { await onPrepare(draft) } catch (reason) { setError(reason instanceof Error ? reason.message : '변경안을 준비하지 못했습니다. 초안은 유지됩니다.') } }}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}변경 내용 확인</Button></div>
      {scene && (scene.map?.revision ?? null) !== draft.base_map_revision && <section className="space-y-3 rounded-lg border p-3" aria-label="지도 충돌 비교"><p role="status" className="text-sm font-medium text-destructive">저장된 지도가 바뀌었습니다. 아래 배치를 비교해주세요.</p><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><p className="text-xs font-medium">현재 저장된 배치</p>{scene.map ? <StorageMapScene columns={scene.map.columns} rows={scene.map.rows} regions={scene.regions} anchors={scene.anchors} containers={scene.containers} compact /> : <p className="text-xs">저장된 지도 없음</p>}</div><div className="space-y-2"><p className="text-xs font-medium">보존한 편집 초안</p><StorageMapScene columns={draft.columns} rows={draft.rows} regions={regions} anchors={draft.anchors} containers={containers} compact sceneLabel="보존한 미저장 지도 초안" sceneDescription="저장 전 비교할 편집 초안입니다. 이 초안은 현재 저장된 지도와 다를 수 있습니다." /></div></div><p className="text-xs text-muted-foreground">초안 배치를 유지해 다시 준비하면 위 최신 저장본을 대체하는 변경안을 새로 확인합니다. 다른 사용 중인 창의 배치와 자동으로 합치지 않습니다.</p><Button variant="outline" className="min-h-11" disabled={disabled} onClick={() => { update({ ...draft, base_map_revision: scene.map?.revision ?? null }); setNotice('최신 저장본을 기준으로 초안을 유지했습니다. 변경 내용 확인에서 다시 검토해주세요.') }}><Check className="size-4" />비교 완료 · 초안으로 다시 준비</Button></section>}
    </DialogContent></Dialog>
    <AlertDialog open={closeWarning} onOpenChange={setCloseWarning}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>저장하지 않은 지도 변경이 있습니다</AlertDialogTitle><AlertDialogDescription>계속 편집하거나 변경을 버리고 닫을 수 있습니다. 닫기만으로 지도나 새 장소가 저장되지 않습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>계속 편집</AlertDialogCancel><Button variant="destructive" onClick={() => { onDraftChange(null); setCloseWarning(false); onOpenChange(false); setSelectedId(null) }}>변경 버리고 닫기</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!removeId} onOpenChange={value => { if (!value) setRemoveId(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>“{regions.find(region => region.id === removeId)?.location_name}” 구획을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>그림의 구획과 이 구획의 표식 {draft.anchors.filter(anchor => anchor.region_id === removeId).length}개를 제거합니다. 장소·보관함·물품 기록은 유지됩니다. 저장한 뒤에는 이 배치를 되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><Button variant="destructive" disabled={disabled} onClick={() => { update({ ...draft, regions: draft.regions.filter(region => region.id !== removeId), anchors: draft.anchors.filter(anchor => anchor.region_id !== removeId) }); setRemoveId(null); setSelectedId(null); setNotice('구획을 초안에서 삭제했습니다. 장소와 보관 기록은 유지됩니다.') }}>구획 삭제</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>
}
