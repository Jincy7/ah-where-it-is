import { z } from 'zod';
import { regionBounds } from './map-geometry';
const id = z.string().uuid();
const cell = z.object({ col: z.number().int().min(0).max(63), row: z.number().int().min(0).max(63) }).strict();
export const storageMapTargetSchema = z.object({ kind: z.enum(['item', 'container', 'location']), id }).strict();
export const storageMapDraftSchema = z.object({
  base_map_revision: z.number().int().positive().nullable(), map_draft_id: id, draft_revision: z.number().int().positive(),
  name: z.string().trim().min(1).max(100), columns: z.number().int().min(1).max(64), rows: z.number().int().min(1).max(64),
  regions: z.array(z.object({ id, location_id: id.nullable(), client_location_key: id.nullable(), color_key: z.enum(['green', 'yellow', 'blue', 'purple', 'pink', 'neutral']), cells: z.array(cell).min(1).max(4096) }).strict()).max(64),
  new_locations: z.array(z.object({ client_location_key: id, name: z.string().trim().min(1).max(100), description: z.string().max(1000).optional() }).strict()).max(64),
  anchors: z.array(z.object({ container_id: id, region_id: id, col: cell.shape.col, row: cell.shape.row }).strict()).max(1000),
}).strict().superRefine((draft, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  const keys = new Set(draft.new_locations.map(location => location.client_location_key));
  if (keys.size !== draft.new_locations.length) issue('새 장소 키가 중복되었습니다');
  const occupied = new Set<string>(), regionIds = new Set<string>(), locations = new Set<string>(), usedKeys = new Set<string>();
  for (const region of draft.regions) {
    if (regionIds.has(region.id)) issue('구획 ID가 중복되었습니다');
    regionIds.add(region.id);
    if (!!region.location_id === !!region.client_location_key) issue('구획마다 장소를 하나 지정해주세요');
    const location = region.location_id ?? region.client_location_key!;
    if (locations.has(location)) issue('한 장소는 한 구획에만 연결할 수 있습니다');
    locations.add(location);
    if (region.client_location_key) { usedKeys.add(region.client_location_key); if (!keys.has(region.client_location_key)) issue('새 장소를 찾을 수 없습니다'); }
    const bounds = regionBounds(region.cells);
    if (!bounds || bounds.width * bounds.height !== region.cells.length) issue('구획은 빈틈없는 사각형이어야 합니다');
    for (const cell of region.cells) {
      if (cell.col >= draft.columns || cell.row >= draft.rows) issue('구획이 지도 범위를 벗어났습니다');
      const key = `${cell.col},${cell.row}`;
      if (occupied.has(key)) issue('구획이 겹치거나 셀이 중복되었습니다');
      occupied.add(key);
    }
  }
  if ([...keys].some(key => !usedKeys.has(key))) issue('지도에 연결되지 않은 새 장소가 있습니다');
  const containers = new Set<string>();
  for (const anchor of draft.anchors) {
    if (containers.has(anchor.container_id)) issue('보관함 표식이 중복되었습니다');
    containers.add(anchor.container_id);
    const region = draft.regions.find(region => region.id === anchor.region_id);
    if (!region?.cells.some(cell => cell.col === anchor.col && cell.row === anchor.row)) issue('표식은 해당 구획 안에 있어야 합니다');
  }
});
