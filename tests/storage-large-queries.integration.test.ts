import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { StorageAction, WorkspaceData } from '../src/lib/storage/types';

test('large storage reads and photo operations stay within gateway URL limits', {
  skip: process.env.RUN_STORAGE_INTEGRATION !== '1', timeout: 120_000,
}, async t => {
  loadEnvFile('.env.local');
  const url = process.env.SUPABASE_URL!;
  const app = process.env.TEST_APP_URL ?? 'http://localhost:4201';
  for (const endpoint of [url, app]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname), 'Local fixtures only');
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const users: string[] = [];
  async function account() {
    const email = `large-storage-${randomUUID()}@example.com`, password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    const id = created.data.user!.id;
    users.push(id);
    const cookies: { name: string; value: string }[] = [];
    const client = createServerClient(url, process.env.SUPABASE_ANON_KEY!, { cookies: {
      getAll: () => cookies,
      setAll: values => { for (const value of values) {
        const index = cookies.findIndex(cookie => cookie.name === value.name);
        if (index < 0) cookies.push(value); else cookies[index] = value;
      } },
    } });
    assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
    const cookie = cookies.map(value => `${value.name}=${value.value}`).join('; ');
    const request = (path: string, init: RequestInit = {}) => fetch(app + path, {
      ...init, headers: { cookie, origin: app, ...init.headers }, signal: AbortSignal.timeout(30_000),
    });
    const post = (path: string, body: unknown) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { id, client, request, post };
  }
  async function body(response: Response, status = 200) {
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }
  try {
    const owner = await account(), other = await account();
    const locationId = randomUUID(), outsideLocationId = randomUUID();
    assert.ifError((await owner.client.from('locations').insert([
      { id: locationId, user_id: owner.id, name: '300개 보관함 장소' },
      { id: outsideLocationId, user_id: owner.id, name: '다른 장소' },
    ])).error);
    const containers = Array.from({ length: 300 }, (_, index) => ({ id: randomUUID(), user_id: owner.id, location_id: locationId, name: `보관함 ${index}` }));
    const outside = { id: randomUUID(), user_id: owner.id, location_id: outsideLocationId, name: '범위 밖 보관함' };
    assert.ifError((await owner.client.from('containers').insert([...containers, outside])).error);
    const foreign = { id: randomUUID(), user_id: other.id, name: '다른 사용자의 보관함' };
    assert.ifError((await other.client.from('containers').insert(foreign)).error);
    const items = Array.from({ length: 1001 }, (_, index) => ({
      id: randomUUID(), container_id: containers[0].id, name: `큰 목록 ${index}`, quantity: 1,
      updated_at: new Date(Date.UTC(2025, 0, 1, 0, 0, index)).toISOString(),
    }));
    for (let offset = 0; offset < items.length; offset += 300) assert.ifError((await owner.client.from('items').insert(items.slice(offset, offset + 300))).error);
    assert.ifError((await owner.client.from('items').insert({ container_id: outside.id, name: '범위 밖 물품', quantity: 1, updated_at: '2024-01-01T00:00:00Z' })).error);
    assert.ifError((await other.client.from('items').insert({ container_id: foreign.id, name: '큰 목록 비밀', quantity: 1 })).error);
    const expectedIds = items.slice(1).reverse().map(item => item.id);

    await t.test('workspace and search return the latest 1000 owned items in global order', async () => {
      const workspace: WorkspaceData = await body(await owner.request('/api/storage'));
      assert.deepEqual(workspace.items.map(item => item.id), expectedIds);
      assert.equal(workspace.truncated, true);
      assert.equal(workspace.containers.length, 301);
      const search = await body(await owner.request('/api/storage/search?q=' + encodeURIComponent('큰 목록')));
      assert.deepEqual(search.items.map((item: { id: string }) => item.id), expectedIds);
      assert.ok(search.items.every((item: { media: unknown[] }) => item.media.length === 0));
    });
    await t.test('a location with 300 child containers retains its scope and truncation', async () => {
      const response = await body(await owner.post('/api/agent/tool', { name: 'get_location', arguments: { location_id: locationId } }));
      assert.equal(response.result.location.container_count, 300);
      assert.equal(response.result.location.item_count, 1001);
      assert.equal(response.result.truncated, true);
      assert.deepEqual(response.result.items.map((item: { id: string }) => item.id), expectedIds);
      const otherLocation = await body(await owner.post('/api/agent/tool', { name: 'get_location', arguments: { location_id: outsideLocationId } }));
      assert.deepEqual(otherLocation.result.items.map((item: { name: string }) => item.name), ['범위 밖 물품']);
    });

    const media = Array.from({ length: 300 }, () => { const id = randomUUID(); return { id, user_id: owner.id, path: `${owner.id}/${id}.jpg`, status: 'attached' }; });
    assert.ifError((await admin.from('media_assets').insert(media)).error);
    const picturedItems = items.slice(-300);
    const links = picturedItems.flatMap((item, index) => Array.from({ length: 4 }, (_, photo) => ({ item_id: item.id, media_id: media[(index + photo) % media.length].id })));
    assert.ifError((await admin.from('item_media').insert(links)).error);
    await t.test('300 distinct photos and over 1000 item links are not truncated or lost', async () => {
      const response = await body(await owner.request('/api/storage/search?container_id=' + containers[0].id));
      assert.deepEqual(response.items.map((item: { id: string }) => item.id), expectedIds);
      for (const item of response.items as WorkspaceData['items']) {
        assert.deepEqual(item.media.map(photo => photo.id).sort(), links.filter(link => link.item_id === item.id).map(link => link.media_id).sort());
      }
    });
    assert.ifError((await owner.client.from('containers').upsert(containers.map((container, index) => ({ ...container, cover_media_id: media[index].id })))).error);
    await t.test('300 cover media handles do not prevent workspace loading', async () => {
      const response: WorkspaceData = await body(await owner.request('/api/storage'));
      assert.equal(response.containers.filter(container => container.cover_media_id).length, 300);
      assert.deepEqual(response.items.map(item => item.id), expectedIds);
    });
    await t.test('a prepared registration can validate 300 media handles and rejects a foreign handle in the final batch', async () => {
      const entries = Array.from({ length: 100 }, (_, index) => ({ name: `사진 등록 ${index}`, quantity: 1, media_ids: media.slice(index * 3, index * 3 + 3).map(photo => photo.id) }));
      const response = await body(await owner.post('/api/storage/actions', { type: 'register_items', payload: { container_id: outside.id, items: entries } }));
      const action: StorageAction = response.action;
      assert.equal(action.status, 'prepared');
      assert.equal(action.payload.items && (action.payload.items as unknown[]).length, 100);
      const count = await owner.client.from('items').select('id', { count: 'exact', head: true }).eq('container_id', outside.id);
      assert.ifError(count.error); assert.equal(count.count, 1, 'media validation never commits items');
      const foreignMediaId = randomUUID();
      assert.ifError((await admin.from('media_assets').insert({ id: foreignMediaId, user_id: other.id, path: `${other.id}/${foreignMediaId}.jpg`, status: 'uploaded' })).error);
      entries[99].media_ids[2] = foreignMediaId;
      await body(await owner.post('/api/storage/actions', { type: 'register_items', payload: { container_id: outside.id, items: entries } }), 404);
    });
    await t.test('a full 100-path cleanup queue is drained instead of retrying the same oversized URL', async () => {
      const paths = Array.from({ length: 100 }, () => `${owner.id}/${randomUUID()}.jpg`);
      assert.ifError((await admin.from('media_deletion_queue').insert(paths.map(path => ({ user_id: owner.id, path })))).error);
      const response = await body(await owner.request('/api/storage/media', { method: 'DELETE' }));
      assert.equal(response.removed, 100);
      const remaining = await admin.from('media_deletion_queue').select('path', { count: 'exact', head: true }).eq('user_id', owner.id);
      assert.ifError(remaining.error); assert.equal(remaining.count, 0);
      assert.equal((await body(await owner.request('/api/storage/media', { method: 'DELETE' }))).removed, 0);
    });
  } finally {
    // Fixture handles intentionally have no object bytes; account cascades remove all rows.
    for (const id of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
});
