import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { zodResolver } from '@hookform/resolvers/zod';
import { analysisSchema } from '../src/lib/ai/schema';
import { contextSchema, toolCallSchema } from '../src/lib/agent/contracts';
import { actionPayloadSchemas, changeSchema } from '../src/lib/storage/schema';
import { itemSchema } from '../src/components/items/item-form';
import { bulkItemSchema } from '../src/components/items/bulk-item-form';
import { itemFormSchema } from '../src/components/storage-workspace/editors';

test('action and tool records keep string keys and validated version values after migration', () => {
  const id = randomUUID();
  const payload = { item_id: id, container_id: randomUUID() };
  const expected_versions = { [`items:${id}`]: 3, [`containers:${payload.container_id}`]: 1 };
  const input = { type: 'move_item', payload, expected_versions };
  assert.deepEqual(changeSchema.parse(input), input);
  assert.equal(changeSchema.safeParse({ ...input, expected_versions: { [`items:${id}`]: '3' } }).success, false);
  assert.equal(changeSchema.safeParse({ ...input, expected_versions: { [`items:${id}`]: 0 } }).success, false);
  assert.equal(changeSchema.safeParse({ ...input, confirmed: true }).success, false);
  const call = { name: 'get_location', arguments: { location_id: id } };
  assert.deepEqual(toolCallSchema.parse(call), call);
  assert.deepEqual(toolCallSchema.parse({ name: 'list_locations', arguments: {} }).arguments, {});
  assert.equal(toolCallSchema.safeParse({ ...call, user_id: id }).success, false);
  assert.equal(actionPayloadSchemas.move_items.safeParse({ source_container_id: id, container_id: id }).success, false);
});

test('context defaults and uncertain photo quantities preserve the existing contract', () => {
  assert.deepEqual(contextSchema.parse({}), {
    selectedContainerId: null, searchScope: null, registrationContainerId: null,
    activeActionId: null, activeActionRevision: null, photoDrafts: [],
  });
  const photo = { items: [{ name: '꽃', quantity: null, description: '', uncertainty: '확인 필요' }] };
  assert.deepEqual(analysisSchema.parse(photo), photo);
  assert.equal(actionPayloadSchemas.register_items.safeParse({ container_id: randomUUID(), items: photo.items }).success, false);
});

test('oversized analysis collections fail on size before visiting invalid children', () => {
  const result = analysisSchema.safeParse({ items: Array.from({ length: 31 }, () => ({})) });
  assert.equal(result.success, false);
  if (result.success) return;
  assert.deepEqual(result.error.issues.map(issue => ({ code: issue.code, path: issue.path })), [{ code: 'too_big', path: ['items'] }]);
});

test('actual form resolvers convert typed quantity strings and preserve validation messages', async () => {
  const options = { fields: {}, shouldUseNativeValidation: false };
  const single = zodResolver(itemSchema);
  const singleResult = await single({ name: '케이블', quantity: '3', description: '' }, undefined, options);
  assert.deepEqual(singleResult, { values: { name: '케이블', quantity: 3, description: '' }, errors: {} });
  const singleInvalid = await single({ name: '케이블', quantity: '', description: '' }, undefined, options);
  assert.equal(singleInvalid.errors.quantity?.message, '수량은 1개 이상이어야 합니다');
  for (const schema of [bulkItemSchema, itemFormSchema]) {
    const resolve = zodResolver(schema);
    const valid = await resolve({ items: [{ name: '  꽃  ', quantity: '2', description: '' }] }, undefined, options);
    assert.deepEqual(valid, { values: { items: [{ name: '꽃', quantity: 2, description: '' }] }, errors: {} });
    const invalid = await resolve({ items: [{ name: '꽃', quantity: '1.5', description: '' }] }, undefined, options);
    assert.ok(invalid.errors.items?.[0]?.quantity?.message?.includes('정수'));
    assert.deepEqual(invalid.values, {});
  }
});
