import type { StorageContainer, StorageItem, StorageLocation, StorageLocationSummary } from './types';
import { VisionError } from '@/lib/ai/gemini';

export const LOCATION_ITEM_LIMIT = 1000;

/** Empty parents remain records: item counts must never determine their existence. */
export function summarizeLocations(locations: StorageLocation[], containers: StorageContainer[]): StorageLocationSummary[] {
  return locations.map(location => {
    const children = containers.filter(container => container.location_id === location.id);
    return { ...location, container_count: children.length, item_count: children.reduce((total, container) => total + container.item_count, 0) };
  });
}

export function locationContents(location: StorageLocationSummary, containers: StorageContainer[], items: StorageItem[]) {
  if (items.length !== Math.min(location.item_count, LOCATION_ITEM_LIMIT)) {
    throw new VisionError('조회 중 장소의 물품이 변경되었습니다. 최신 내용으로 다시 조회해주세요', 409);
  }
  return {
    location,
    containers: containers.filter(container => container.location_id === location.id),
    items,
    truncated: location.item_count > items.length,
    state: location.container_count === 0 ? 'no_containers' as const : location.item_count === 0 ? 'empty_containers' as const : 'has_items' as const,
  };
}
