import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import sharp from 'sharp';
import type { StorageItemDetail } from '../src/lib/storage/item-detail-types';

test('item detail returns current owned path and private photo metadata, then reflects moves and deletions', { skip: process.env.RUN_STORAGE_INTEGRATION !== '1', timeout: 90_000 }, async () => {
  loadEnvFile('.env.local');
  const url = process.env.SUPABASE_URL!;
  const app = process.env.TEST_APP_URL ?? 'http://localhost:4201';
  for (const endpoint of [url, app]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname), 'Local fixtures only');
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const users: string[] = [], paths: string[] = [];
  async function account() {
    const email = `item-detail-${randomUUID()}@example.com`, password = randomUUID();
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(result.error);
    const id = result.data.user!.id; users.push(id);
    const cookies: Array<{ name: string; value: string }> = [];
    const client = createServerClient(url, process.env.SUPABASE_ANON_KEY!, { cookies: { getAll: () => cookies, setAll: values => { values.forEach(value => { const i = cookies.findIndex(c => c.name === value.name); if (i < 0) cookies.push(value); else cookies[i] = value; }); } } });
    assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
    const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    return { id, get: (itemId: string) => fetch(`${app}/api/storage/items/${itemId}`, { headers: { cookie }, signal: AbortSignal.timeout(30_000) }) };
  }
  try {
    const [owner, other] = await Promise.all([account(), account()]);
    const locationId = randomUUID(), containerId = randomUUID(), secondId = randomUUID(), itemId = randomUUID(), mediaId = randomUUID();
    assert.ifError((await admin.from('locations').insert({ id: locationId, user_id: owner.id, name: '서재' })).error);
    assert.ifError((await admin.from('containers').insert([{ id: containerId, user_id: owner.id, location_id: locationId, name: '책상 서랍' }, { id: secondId, user_id: owner.id, name: '현관 수납함' }])).error);
    assert.ifError((await admin.from('items').insert({ id: itemId, container_id: containerId, name: '여권', quantity: 2, description: '파란 케이스' })).error);
    const path = `${owner.id}/${mediaId}.jpg`; paths.push(path);
    const jpeg = await sharp({ create: { width: 4, height: 3, channels: 3, background: 'white' } }).jpeg().toBuffer();
    assert.ifError((await admin.storage.from('item-images').upload(path, jpeg, { contentType: 'image/jpeg' })).error);
    assert.ifError((await admin.from('media_assets').insert({ id: mediaId, user_id: owner.id, path, status: 'attached', created_at: '2026-11-01T01:23:00Z' })).error);
    assert.ifError((await admin.from('item_media').insert({ item_id: itemId, media_id: mediaId })).error);
    assert.equal((await fetch(`${app}/api/storage/items/${itemId}`)).status, 401);
    assert.equal((await other.get(itemId)).status, 404, 'foreign items disclose no record');
    assert.equal((await owner.get(randomUUID())).status, 404);
    assert.equal((await owner.get('not-an-id')).status, 400);
    const response = await owner.get(itemId);
    const body = await response.json() as StorageItemDetail;
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.match(response.headers.get('cache-control') ?? '', /no-store.*private/);
    assert.equal(body.item.name, '여권'); assert.equal(body.item.quantity, 2); assert.equal(body.item.description, '파란 케이스');
    assert.equal(body.item.container_name, '책상 서랍'); assert.equal(body.item.location_name, '서재'); assert.equal(body.item.location_id, locationId);
    assert.equal(body.item.media[0].id, mediaId);
    assert.equal(new Date(body.item.media[0].created_at).toISOString(), '2026-11-01T01:23:00.000Z');
    assert.equal((await fetch(body.item.media[0].url!)).status, 200);
    assert.equal('path' in body.item.media[0], false);
    assert.equal('user_id' in body.item, false);
    assert.ok(!Number.isNaN(Date.parse(body.checked_at)));
    const itemBefore = (await admin.from('items').select('*').eq('id', itemId).single()).data;
    await owner.get(itemId);
    assert.deepEqual((await admin.from('items').select('*').eq('id', itemId).single()).data, itemBefore, 'detail reads never mutate item records');
    assert.ifError((await admin.from('items').update({ container_id: secondId }).eq('id', itemId)).error);
    const moved = await (await owner.get(itemId)).json() as StorageItemDetail;
    assert.equal(moved.item.container_id, secondId); assert.equal(moved.item.container_name, '현관 수납함'); assert.equal(moved.item.location_name, null); assert.equal(moved.item.location_id, null);
    assert.ok(moved.item.version > body.item.version);
    assert.ifError((await admin.from('items').delete().eq('id', itemId)).error);
    assert.equal((await owner.get(itemId)).status, 404);
  } finally {
    if (paths.length) await admin.storage.from('item-images').remove(paths);
    for (const id of users) await admin.auth.admin.deleteUser(id);
  }
});
