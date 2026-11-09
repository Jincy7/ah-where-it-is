export type Cell = { col: number; row: number }
export type Rectangle = { col: number; row: number; width: number; height: number }
export type CellRegion = { id: string; cells: Cell[] }

/** Both pointer directions include the start and end cells. */
export function selectionRectangle(start: Cell, end: Cell): Rectangle {
  return { col: Math.min(start.col, end.col), row: Math.min(start.row, end.row), width: Math.abs(end.col - start.col) + 1, height: Math.abs(end.row - start.row) + 1 }
}
export function rectangleCells(rect: Rectangle): Cell[] {
  return Array.from({ length: rect.width * rect.height }, (_, index) => ({ col: rect.col + index % rect.width, row: rect.row + Math.floor(index / rect.width) }))
}
export function regionBounds(cells: Cell[]): Rectangle {
  if (!cells.length) return { col: 0, row: 0, width: 0, height: 0 }
  const cols = cells.map(cell => cell.col), rows = cells.map(cell => cell.row)
  return { col: Math.min(...cols), row: Math.min(...rows), width: Math.max(...cols) - Math.min(...cols) + 1, height: Math.max(...rows) - Math.min(...rows) + 1 }
}
export function containsCell(cells: Cell[], target: Cell) {
  return cells.some(cell => cell.col === target.col && cell.row === target.row)
}
export function rectangleProblem(rect: Rectangle, columns: number, rows: number, regions: CellRegion[], excludeId?: string): string | null {
  if (![rect.col, rect.row, rect.width, rect.height].every(Number.isInteger) || rect.width < 1 || rect.height < 1 || rect.col < 0 || rect.row < 0 || rect.col + rect.width > columns || rect.row + rect.height > rows) return '구획은 지도 안의 정수 칸으로 지정해주세요.'
  const occupied = new Set(regions.filter(region => region.id !== excludeId).flatMap(region => region.cells.map(cell => `${cell.col},${cell.row}`)))
  const overlap = rectangleCells(rect).find(cell => occupied.has(`${cell.col},${cell.row}`))
  return overlap ? `(${overlap.col}, ${overlap.row})칸이 기존 구획과 겹칩니다.` : null
}
export function gridResizeProblem(columns: number, rows: number, regions: CellRegion[], anchors: Cell[]): string | null {
  if (![columns, rows].every(value => Number.isInteger(value) && value >= 1 && value <= 64)) return '가로·세로는 1~64칸으로 입력해주세요.'
  if ([...regions.flatMap(region => region.cells), ...anchors].some(cell => cell.col >= columns || cell.row >= rows)) return '구획 또는 표식이 잘리는 크기로 줄일 수 없습니다.'
  return null
}
/** A translated region carries its markers; resizing returns outside markers for explicit impact review. */
export function transformRegion<T extends Cell & { region_id: string }>(region: CellRegion, next: Rectangle, anchors: T[]) {
  const before = regionBounds(region.cells)
  const cells = rectangleCells(next)
  const translated = anchors.map(anchor => anchor.region_id === region.id ? { ...anchor, col: anchor.col + next.col - before.col, row: anchor.row + next.row - before.row } : anchor)
  const removed = translated.filter(anchor => anchor.region_id === region.id && !containsCell(cells, anchor))
  return { cells, anchors: translated.filter(anchor => !removed.includes(anchor)), removed }
}
