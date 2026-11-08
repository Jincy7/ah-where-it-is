import type { ToolEvent } from './contracts';

function normalized(value: string) { return value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko-KR'); }

/** Return every matching owned container; ambiguity must be resolved by the user. */
export function matchStorageNames<T extends { name: string }>(query: string, containers: T[]): T[] {
  const needle = normalized(query);
  if (!needle) return [];
  const exact = containers.filter(container => normalized(container.name) === needle);
  return exact.length ? exact : containers.filter(container => normalized(container.name).includes(needle));
}
export const matchContainerNames = matchStorageNames;

/** Intermediate lookup misses are model context, not separate empty screens. */
export function displayToolEvents(events: ToolEvent[]): ToolEvent[] {
  const foundItems = events.some(event => {
    const result = event.result as { items?: unknown[] };
    return Array.isArray(result?.items) && result.items.length > 0;
  });
  let displayedEmpty = false;
  return events.filter(event => {
    if (event.name !== 'search_items') return true;
    const result = event.result as { items?: unknown[]; container_matches?: unknown[]; location_matches?: unknown[] };
    if (!Array.isArray(result?.items) || result.items.length) return true;
    if (result.container_matches?.length || result.location_matches?.length || foundItems || displayedEmpty) return false;
    displayedEmpty = true;
    return true;
  });
}
