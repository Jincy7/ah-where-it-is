import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeLocations, locationContents } from '../src/lib/storage/location-lookup';
import { matchStorageNames, displayToolEvents } from '../src/lib/agent/container-lookup';
import type { StorageContainer, StorageItem, StorageLocation } from '../src/lib/storage/types';
import { VisionError } from '../src/lib/ai/gemini';

const locations = [
  { id: 'shoe', name: '신발장' }, { id: 'room', name: '작은방' }, { id: 'empty', name: '빈방' },
] as StorageLocation[];
const containers = [
  { id: 'tools', name: '공구함', location_id: 'shoe', item_count: 0 },
  { id: 'desk', name: '책상 보관함', location_id: 'room', item_count: 1 },
] as StorageContainer[];

test('moving the last item leaves the source location and empty child container visible', () => {
  const summaries = summarizeLocations(locations, containers);
  assert.deepEqual(summaries.map(l => [l.name, l.container_count, l.item_count]), [
    ['신발장', 1, 0], ['작은방', 1, 1], ['빈방', 0, 0],
  ]);
  const source = locationContents(summaries[0], containers, []);
  assert.equal(source.state, 'empty_containers');
  assert.equal(source.location.container_count, 1);
  assert.deepEqual(source.containers.map(c => c.name), ['공구함']);
  assert.equal(source.truncated, false);
  const empty = locationContents(summaries[2], containers, []);
  assert.equal(empty.state, 'no_containers');
  assert.deepEqual(empty.containers, []);
});

test('concurrent moves that change summary/item counts require a fresh lookup instead of an absence claim', () => {
  const location = summarizeLocations(locations, containers)[1];
  const conflict = (error: unknown) => error instanceof VisionError && error.status === 409 && /다시 조회/.test(error.message);
  assert.throws(() => locationContents(location, containers, []), conflict, 'an outgoing move cannot become a false empty result');
  assert.throws(() => locationContents({ ...location, item_count: 0 }, containers, [{ id: 'arrived' }] as StorageItem[]), conflict, 'an incoming move cannot accompany an empty summary');
  const complete = locationContents(location, containers, [{ id: 'flower' }] as StorageItem[]);
  assert.equal(complete.truncated, false);
});

test('a legitimate 1001-item location returns 1000 rows with explicit truncation', () => {
  const location = { ...summarizeLocations(locations, containers)[1], item_count: 1001 };
  const items = Array.from({ length: 1000 }, (_, index) => ({ id: `item-${index}` })) as StorageItem[];
  const result = locationContents(location, containers, items);
  assert.equal(result.state, 'has_items');
  assert.equal(result.location.item_count, 1001);
  assert.equal(result.items.length, 1000);
  assert.equal(result.truncated, true);
  assert.throws(() => locationContents(location, containers, items.slice(1)), error => error instanceof VisionError && error.status === 409);
});

test('location and container name matches remain distinct and intermediate misses stay hidden', () => {
  const location_matches = matchStorageNames('신발장', summarizeLocations(locations, containers));
  assert.equal(location_matches[0].container_count, 1);
  assert.deepEqual(matchStorageNames('신발장', containers), []);
  const events = displayToolEvents([
    { name: 'search_items', result: { items: [], location_matches } },
    { name: 'get_location', result: locationContents(location_matches[0], containers, []) },
  ]);
  assert.deepEqual(events.map(e => e.name), ['get_location']);
});
