import assert from 'node:assert/strict';
import test from 'node:test';
import { matchContainerNames, displayToolEvents } from '../src/lib/agent/container-lookup';

const containers = [
  { id: 'tools', name: '공구함', location_name: null },
  { id: 'desk', name: '책상 보관함', location_name: '작업방' },
  { id: 'drawer', name: '책상 서랍', location_name: '작업방' },
];

test('container names resolve independently of item search and preserve ambiguous destinations', () => {
  assert.deepEqual(matchContainerNames('공구함', containers).map(c => c.id), ['tools']);
  assert.deepEqual(matchContainerNames('책상보관함', containers).map(c => c.id), ['desk']);
  assert.deepEqual(matchContainerNames('책상', containers).map(c => c.id), ['desk', 'drawer']);
  assert.deepEqual(matchContainerNames('없는 보관함', containers), []);
  assert.deepEqual(matchContainerNames('', containers), []);
});

test('container lookup fallback does not produce empty item cards or discard a prepared move', () => {
  const action = { action_id: 'move', status: 'prepared' };
  const visible = displayToolEvents([
    { name: 'search_items', result: { items: [], container_matches: [containers[0]] } },
    { name: 'search_items', result: { items: [], container_matches: [containers[1]] } },
    { name: 'prepare_change', result: { action } },
  ]);
  assert.deepEqual(visible, [{ name: 'prepare_change', result: { action } }]);
});

test('one request shows a single empty search state but preserves actual results', () => {
  const found = { items: [{ id: 'item' }] };
  const visible = displayToolEvents([
    { name: 'search_items', result: { items: [] } },
    { name: 'search_items', result: { items: [] } },
    { name: 'search_items', result: found },
  ]);
  assert.equal(visible.length, 1);
  assert.deepEqual(visible[0].result, found);
  assert.equal(displayToolEvents([{ name: 'search_items', result: { items: [] } }, { name: 'search_items', result: { items: [] } }]).length, 1);
});
