'use client'

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'
import type { MapAnchor, StorageMapDraft } from '@/lib/storage/map-types'
import { StorageMapScene, type SceneContainer, type SceneRegion } from './storage-map-scene'
import { containsCell, rectangleProblem, regionBounds, selectionRectangle, type Cell, type Rectangle } from './editor-state'
import { beginRegionTransform, commitRegionTransform, previewRegionTransform, type RegionTransformGesture, type ResizeHandle } from './region-interaction'

type PointerInteraction =
  | { kind: 'draw'; pointerId: number; start: Cell; current: Cell }
  | { kind: 'transform'; pointerId: number; gesture: RegionTransformGesture; point: Cell }
  | { kind: 'pan'; pointerId: number; x: number; y: number; left: number; top: number }
export type StorageMapCanvasHandle = { cancelInteraction: () => boolean }
interface StorageMapCanvasProps {
  draft: StorageMapDraft
  viewportPosition: RefObject<{ left: number; top: number }>
  regions: SceneRegion[]
  containers: SceneContainer[]
  selectedRegionId: string | null
  selection: Rectangle | null
  mode: 'draw' | 'pan'
  disabled: boolean
  zoom: number
  onSelectRegion: (id: string) => void
  onSelectAnchors: (ids: string[]) => void
  onSelectRange: (rectangle: Rectangle | null) => void
  onCommit: (draft: StorageMapDraft, removed: MapAnchor[], kind: 'move' | 'resize') => void
  onError: (message: string) => void
}
const handleLabels: Record<ResizeHandle, string> = { nw: '왼쪽 위', n: '위', ne: '오른쪽 위', e: '오른쪽', se: '오른쪽 아래', s: '아래', sw: '왼쪽 아래', w: '왼쪽' }
const handleCursors: Record<ResizeHandle, string> = { nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize' }

/** Pointer targets scale with zoom. Tiny regions keep corner handles and the full numeric alternative. */
function ResizeHandles({ rectangle, regionId, scale, columns, rows }: { rectangle: Rectangle; regionId: string; scale: number; columns: number; rows: number }) {
  const { col, row, width, height } = rectangle
  const left = col * 40 + 3, top = row * 40 + 3, right = (col + width) * 40 - 3, bottom = (row + height) * 40 - 3
  const target = Math.min(44 / scale, width * 20, height * 20)
  const handles: { handle: ResizeHandle; x: number; y: number }[] = [
    { handle: 'nw', x: left, y: top }, { handle: 'ne', x: right, y: top },
    { handle: 'se', x: right, y: bottom }, { handle: 'sw', x: left, y: bottom },
    ...(width * 40 * scale >= 100 ? [{ handle: 'n' as const, x: (left + right) / 2, y: top }, { handle: 's' as const, x: (left + right) / 2, y: bottom }] : []),
    ...(height * 40 * scale >= 100 ? [{ handle: 'e' as const, x: right, y: (top + bottom) / 2 }, { handle: 'w' as const, x: left, y: (top + bottom) / 2 }] : []),
  ]
  return <g aria-hidden="true">{handles.map(({ handle, x, y }) => <g key={handle} data-resize-handle={handle} data-resize-region={regionId} style={{ cursor: handleCursors[handle] }}>
    <title>{`${handleLabels[handle]} 크기 조절 · 드래그하거나 아래 너비·높이 입력을 사용하세요`}</title>
    <rect x={Math.max(0, Math.min(columns * 40 - target, x - target / 2))} y={Math.max(0, Math.min(rows * 40 - target, y - target / 2))} width={target} height={target} fill="transparent" />
    <rect data-handle-dot="true" x={x - 5 / scale} y={y - 5 / scale} width={10 / scale} height={10 / scale} rx={2 / scale} className="fill-background stroke-primary" strokeWidth={2 / scale} />
  </g>)}</g>
}

/** The parent keys this canvas by draft identity/revision, zoom, mode, and locks. A remount discards only the gesture preview. */
export const StorageMapCanvas = forwardRef<StorageMapCanvasHandle, StorageMapCanvasProps>(function StorageMapCanvas({ draft, viewportPosition, regions, containers, selectedRegionId, selection, mode, disabled, zoom, onSelectRegion, onSelectAnchors, onSelectRange, onCommit, onError }, ref) {
  const [interaction, setInteraction] = useState<PointerInteraction | null>(null)
  const current = useRef<PointerInteraction | null>(null)
  const captured = useRef<{ element: SVGSVGElement; pointerId: number } | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    element.scrollLeft = viewportPosition.current.left
    element.scrollTop = viewportPosition.current.top
    // Snapshot before the keyed gesture surface is removed, including scroll events not yet delivered.
    return () => { viewportPosition.current = { left: element.scrollLeft, top: element.scrollTop } }
  }, [viewportPosition])
  function updateInteraction(value: PointerInteraction | null) { current.current = value; setInteraction(value) }
  function releaseCapture() {
    const value = captured.current
    captured.current = null
    if (value?.element.hasPointerCapture(value.pointerId)) value.element.releasePointerCapture(value.pointerId)
  }
  function cancelInteraction() {
    const active = current.current !== null
    current.current = null
    setInteraction(null)
    releaseCapture()
    return active
  }
  useImperativeHandle(ref, () => ({ cancelInteraction }))
  useEffect(() => () => {
    current.current = null
    const value = captured.current
    captured.current = null
    if (value?.element.hasPointerCapture(value.pointerId)) value.element.releasePointerCapture(value.pointerId)
  }, [])
  function pointAt(event: PointerEvent<SVGSVGElement>): Cell {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { col: (event.clientX - bounds.left) / bounds.width * draft.columns, row: (event.clientY - bounds.top) / bounds.height * draft.rows }
  }
  function cellAt(point: Cell): Cell { return { col: Math.max(0, Math.min(draft.columns - 1, Math.floor(point.col))), row: Math.max(0, Math.min(draft.rows - 1, Math.floor(point.row))) } }
  function capture(event: PointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    captured.current = { element: event.currentTarget, pointerId: event.pointerId }
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || !event.isPrimary || current.current) return
    if (mode === 'pan') {
      if (event.pointerType === 'mouse' && viewport.current) {
        event.preventDefault(); capture(event)
        updateInteraction({ kind: 'pan', pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.current.scrollLeft, top: viewport.current.scrollTop })
      }
      return
    }
    if (disabled) return
    const point = pointAt(event), cell = cellAt(point)
    const element = event.target instanceof Element ? event.target : null
    const handleNode = element?.closest('[data-resize-handle]')
    const handle = handleNode?.getAttribute('data-resize-handle') as ResizeHandle | undefined
    const region = handle ? draft.regions.find(value => value.id === handleNode?.getAttribute('data-resize-region')) : draft.regions.find(value => containsCell(value.cells, cell))
    event.preventDefault(); capture(event)
    if (region) {
      onSelectRegion(region.id)
      const ids = element?.closest('[data-container-ids]')?.getAttribute('data-container-ids')?.split(',')
      if (ids?.length) onSelectAnchors(ids)
      const gesture = beginRegionTransform(draft, region.id, handle ? 'resize' : 'move', point, handle)!
      updateInteraction({ kind: 'transform', pointerId: event.pointerId, gesture, point })
    } else {
      onSelectRange(null)
      updateInteraction({ kind: 'draw', pointerId: event.pointerId, start: cell, current: cell })
    }
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const active = current.current
    if (!active || active.pointerId !== event.pointerId) return
    if (active.kind === 'pan') {
      if (viewport.current) { viewport.current.scrollLeft = active.left + active.x - event.clientX; viewport.current.scrollTop = active.top + active.y - event.clientY }
      return
    }
    if (disabled) { cancelInteraction(); return }
    const point = pointAt(event)
    updateInteraction(active.kind === 'draw' ? { ...active, current: cellAt(point) } : { ...active, point })
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    const active = current.current
    if (!active || active.pointerId !== event.pointerId) return
    const point = pointAt(event)
    cancelInteraction()
    if (disabled || active.kind === 'pan') return
    if (active.kind === 'draw') onSelectRange(selectionRectangle(active.start, cellAt(point)))
    else {
      const result = commitRegionTransform(draft, active.gesture, point)
      if (result.problem) onError(result.problem)
      else if (result.changed) onCommit(result.draft, result.removedAnchors, active.gesture.kind)
    }
  }
  const preview = interaction?.kind === 'transform' ? previewRegionTransform(draft, interaction.gesture, interaction.point) : null
  const displayedDraft = preview?.draft ?? draft
  const displayedRegions = regions.map(region => ({ ...region, cells: displayedDraft.regions.find(value => value.id === region.id)?.cells ?? region.cells }))
  const selectionRectangleValue = interaction?.kind === 'draw' ? selectionRectangle(interaction.start, interaction.current) : preview?.rectangle ?? selection
  const problem = preview?.problem ?? (selectionRectangleValue && !preview ? rectangleProblem(selectionRectangleValue, draft.columns, draft.rows, draft.regions) : null)
  const selected = displayedDraft.regions.find(region => region.id === selectedRegionId)
  const scale = Math.max(280, draft.columns * 36) * zoom / (draft.columns * 40)
  return <div className="space-y-2">
    <div ref={viewport} onScroll={event => { viewportPosition.current = { left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop } }} className="max-h-[50dvh] overflow-auto rounded-lg border" tabIndex={0} aria-label="지도 편집 영역">
      <div style={{ width: Math.max(280, draft.columns * 36) * zoom }}>
        <StorageMapScene columns={draft.columns} rows={draft.rows} regions={displayedRegions} anchors={displayedDraft.anchors} containers={containers} selectedRegionId={selectedRegionId} selection={selectionRectangleValue} invalidSelection={!!problem} showGrid
          sceneLabel="편집 중인 지도 초안" sceneDescription="아직 저장하지 않은 배치입니다. 빈 칸을 드래그해 구획을 만들고 기존 구획을 드래그해 이동합니다. 선택한 구획의 손잡이 또는 아래 입력으로 크기를 바꿀 수 있습니다."
          className={mode === 'draw' && !disabled ? `touch-none select-none ${interaction?.kind === 'transform' ? '[&_[data-region-id]]:cursor-grabbing' : '[&_[data-region-id]]:cursor-grab'}` : mode === 'pan' ? 'touch-auto cursor-grab' : 'touch-auto'}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelInteraction} onLostPointerCapture={cancelInteraction}>
          {selected && mode === 'draw' && !disabled && <ResizeHandles rectangle={preview?.rectangle ?? regionBounds(selected.cells)} regionId={selected.id} scale={scale} columns={draft.columns} rows={draft.rows} />}
        </StorageMapScene>
      </div>
    </div>
    {interaction && interaction.kind !== 'pan' && <p role="status" className={`text-xs ${problem ? 'text-destructive' : 'text-muted-foreground'}`}>{problem ?? (interaction.kind === 'draw' ? `새 구획 ${selectionRectangleValue!.width}×${selectionRectangleValue!.height}칸` : `${interaction.gesture.kind === 'move' ? '이동' : '크기 조절'} 미리보기 · ${preview!.rectangle.width}×${preview!.rectangle.height}칸 · 놓으면 적용, Esc로 취소`)}{preview?.removedAnchors.length ? ` · 표식 ${preview.removedAnchors.length}개가 미배치로 바뀝니다` : ''}</p>}
  </div>
})
