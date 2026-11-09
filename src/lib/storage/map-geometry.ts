import type { MapCell, StorageMapDraft } from './map-types';
export function rectangleCells(start: MapCell, end: MapCell): MapCell[] {
  const cells: MapCell[] = [];
  for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++)
    for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col++) cells.push({ col, row });
  return cells;
}
export function regionBounds(cells: MapCell[]) {
  if (!cells.length) return null;
  const left = Math.min(...cells.map(cell => cell.col)), top = Math.min(...cells.map(cell => cell.row));
  const right = Math.max(...cells.map(cell => cell.col)), bottom = Math.max(...cells.map(cell => cell.row));
  return { col: left, row: top, width: right - left + 1, height: bottom - top + 1 };
}
export function moveRegion(draft: StorageMapDraft, regionId: string, deltaCol: number, deltaRow: number): StorageMapDraft {
  return { ...draft, draft_revision: draft.draft_revision + 1, regions: draft.regions.map(region => region.id === regionId ? { ...region, cells: region.cells.map(cell => ({ col: cell.col + deltaCol, row: cell.row + deltaRow })) } : region), anchors: draft.anchors.map(anchor => anchor.region_id === regionId ? { ...anchor, col: anchor.col + deltaCol, row: anchor.row + deltaRow } : anchor) };
}
export function resizeRegion(draft: StorageMapDraft, regionId: string, cells: MapCell[]): { draft: StorageMapDraft; removedAnchors: StorageMapDraft['anchors'] } {
  const occupied = new Set(cells.map(cell => `${cell.col},${cell.row}`));
  const removedAnchors = draft.anchors.filter(anchor => anchor.region_id === regionId && !occupied.has(`${anchor.col},${anchor.row}`));
  return { draft: { ...draft, draft_revision: draft.draft_revision + 1, regions: draft.regions.map(region => region.id === regionId ? { ...region, cells } : region), anchors: draft.anchors.filter(anchor => !removedAnchors.includes(anchor)) }, removedAnchors };
}
