import type { MapAnchor, StorageMapDraft } from '@/lib/storage/map-types'
import { rectangleProblem, regionBounds, transformRegion, type Cell, type Rectangle } from './editor-state'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type RegionTransformGesture = {
  kind: 'move' | 'resize'
  regionId: string
  handle: ResizeHandle
  start: Cell
  original: Rectangle
  draftId: string
  draftRevision: number
}
export type RegionTransformPreview = {
  rectangle: Rectangle
  draft: StorageMapDraft
  problem: string | null
  removedAnchors: MapAnchor[]
  changed: boolean
}
export function resizeRectangle(original: Rectangle, handle: ResizeHandle, deltaCol: number, deltaRow: number): Rectangle {
  let left = original.col, top = original.row, right = left + original.width, bottom = top + original.height
  if (handle.includes('w')) left = Math.min(left + deltaCol, right - 1)
  if (handle.includes('e')) right = Math.max(right + deltaCol, left + 1)
  if (handle.includes('n')) top = Math.min(top + deltaRow, bottom - 1)
  if (handle.includes('s')) bottom = Math.max(bottom + deltaRow, top + 1)
  return { col: left, row: top, width: right - left, height: bottom - top }
}
export function beginRegionTransform(draft: StorageMapDraft, regionId: string, kind: 'move' | 'resize', start: Cell, handle: ResizeHandle = 'se'): RegionTransformGesture | null {
  const region = draft.regions.find(value => value.id === regionId)
  if (!region) return null
  return { kind, regionId, handle, start, original: regionBounds(region.cells), draftId: draft.map_draft_id, draftRevision: draft.draft_revision }
}
export function previewRegionTransform(draft: StorageMapDraft, gesture: RegionTransformGesture, point: Cell): RegionTransformPreview {
  const deltaCol = Math.round(point.col - gesture.start.col), deltaRow = Math.round(point.row - gesture.start.row)
  const rectangle = gesture.kind === 'resize' ? resizeRectangle(gesture.original, gesture.handle, deltaCol, deltaRow) : { ...gesture.original, col: gesture.original.col + deltaCol, row: gesture.original.row + deltaRow }
  const region = draft.regions.find(value => value.id === gesture.regionId)
  if (!region || draft.map_draft_id !== gesture.draftId || draft.draft_revision !== gesture.draftRevision) return { rectangle, draft, changed: false, problem: '편집 중 초안이 바뀌었습니다. 다시 선택해주세요.', removedAnchors: [] }
  const problem = rectangleProblem(rectangle, draft.columns, draft.rows, draft.regions, region.id)
  if (problem) return { rectangle, draft, problem, changed: false, removedAnchors: [] }
  const changed = (['col', 'row', 'width', 'height'] as const).some(key => rectangle[key] !== gesture.original[key])
  if (!changed) return { rectangle, draft, changed, problem: null, removedAnchors: [] }
  const transformed = transformRegion(region, rectangle, draft.anchors, gesture.kind === 'resize' ? 'preserve' : 'translate')
  return { rectangle, changed, problem: null, removedAnchors: transformed.removed, draft: { ...draft, regions: draft.regions.map(value => value.id === region.id ? { ...value, cells: transformed.cells } : value), anchors: transformed.anchors } }
}
export function commitRegionTransform(draft: StorageMapDraft, gesture: RegionTransformGesture, point: Cell, options: { cancelled?: boolean; disabled?: boolean } = {}): RegionTransformPreview {
  if (options.cancelled || options.disabled) return { rectangle: gesture.original, draft, changed: false, problem: null, removedAnchors: [] }
  const preview = previewRegionTransform(draft, gesture, point)
  return preview.changed ? { ...preview, draft: { ...preview.draft, draft_revision: draft.draft_revision + 1 } } : preview
}
