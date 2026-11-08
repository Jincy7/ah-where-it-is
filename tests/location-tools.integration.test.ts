import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { contextSchema } from '../src/lib/agent/contracts';
import { runConversation } from '../src/lib/agent/conversation';

test('failed location lookup never becomes an empty place after a verified move', async () => {
  let round = 0;
  const receipt = { action: { status: 'completed', receipt: { type: 'move_items' } } };
  const reply = await runConversation({ message: '잘 옮겨졌어? 이제 신발장에 뭐 있어?', history: [], context: contextSchema.parse({}) }, {
    request: async () => ({ status: 'completed', output: [{ type: 'function_call', name: ++round === 1 ? 'get_action_status' : 'get_location', call_id: String(round), arguments: '{}' }] }),
    execute: async name => { if (name === 'get_action_status') return receipt; throw new Error('private database detail'); },
  });
  assert.equal(round, 2, 'failed reads are not handed back to the model for absence inference');
  assert.match(reply.message, /못했/);
  assert.doesNotMatch(reply.message, /보관함.*없|private/);
  assert.deepEqual(reply.events, [{ name: 'get_action_status', result: receipt }]);
});

test('location tools preserve empty containers after moving items and distinguish empty/missing/foreign places', {
  skip: process.env.RUN_AGENT_INTEGRATION !== '1', timeout: 90_000,
}, async () => {
  loadEnvFile('.env.local');
  const url = process.env.SUPABASE_URL!;
  const app = process.env.TEST_APP_URL ?? 'http://localhost:4201';
  for (const endpoint of [url, app]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname), 'Local fixtures only');
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const users: string[] = [];
  async function account() {
    const email = `hierarchy-${randomUUID()}@example.com`, password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    const id = created.data.user!.id;
    users.push(id);
    const cookies: { name: string; value: string }[] = [];
    const client = createServerClient(url, process.env.SUPABASE_ANON_KEY!, { cookies: {
      getAll: () => cookies,
      setAll: values => { for (const value of values) { const i = cookies.findIndex(cookie => cookie.name === value.name); if (i < 0) cookies.push(value); else cookies[i] = value; } },
    } });
    assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
    const post = (path: string, body: unknown) => fetch(app + path, {
      method: 'POST', headers: { cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '), origin: app, 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    const tool = (name: string, args: Record<string, unknown> = {}) => post('/api/agent/tool', { name, arguments: args, context: contextSchema.parse({}) });
    async function location(name: string) {
      const result = await client.from('locations').insert({ user_id: id, name }).select().single();
      assert.ifError(result.error); return result.data!;
    }
    async function container(name: string, location_id: string) {
      const result = await client.from('containers').insert({ user_id: id, name, location_id }).select().single();
      assert.ifError(result.error); return result.data!;
    }
    return { id, client, post, tool, location, container };
  }
  async function result(response: Response, status = 200) {
    const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body;
  }
  try {
    const a = await account(), b = await account();
    assert.deepEqual((await result(await b.tool('list_locations'))).result.locations, [], 'an account without places has a successful empty list');
    const shoe = await a.location('신발장'), room = await a.location('작은방'), empty = await a.location('빈방');
    const source = await a.container('공구함', shoe.id), target = await a.container('책상 보관함', room.id);
    const foreign = await b.location('신발장');
    assert.ifError((await a.client.from('items').insert({ container_id: source.id, name: '흰색 작은 꽃 묶음', quantity: 3 })).error);
    const before = (await result(await a.tool('get_location', { location_id: shoe.id }))).result;
    assert.equal(before.location.container_count, 1); assert.equal(before.location.item_count, 1);
    assert.equal(before.state, 'has_items'); assert.equal(before.items[0].quantity, 3, 'item_count counts records, not physical quantity');
    const prepared = await result(await a.post('/api/storage/actions', { type: 'move_items', payload: { source_container_id: source.id, container_id: target.id } }));
    const action = prepared.action;
    await result(await a.post(`/api/storage/actions/${action.action_id}/confirm`, { revision: action.revision, payload_hash: action.payload_hash, idempotency_key: action.idempotency_key }));
    const status = (await result(await a.tool('get_action_status', { action_id: action.action_id }))).result;
    assert.equal(status.action.status, 'completed');
    const after = (await result(await a.tool('get_location', { location_id: shoe.id }))).result;
    assert.equal(after.location.name, '신발장'); assert.equal(after.location.container_count, 1); assert.equal(after.location.item_count, 0);
    assert.equal(after.state, 'empty_containers'); assert.equal(after.truncated, false);
    assert.deepEqual(after.containers.map((c: { id: string; name: string; item_count: number }) => [c.id, c.name, c.item_count]), [[source.id, '공구함', 0]]);
    assert.deepEqual(after.items, []);
    const destination = (await result(await a.tool('get_location', { location_id: room.id }))).result;
    assert.equal(destination.location.item_count, 1); assert.equal(destination.items[0].container_id, target.id);
    const noContainers = (await result(await a.tool('get_location', { location_id: empty.id }))).result;
    assert.equal(noContainers.location.name, '빈방'); assert.equal(noContainers.state, 'no_containers');
    assert.equal(noContainers.location.container_count, 0); assert.deepEqual(noContainers.containers, []);
    const all = (await result(await a.tool('list_locations'))).result.locations;
    assert.equal(all.length, 3); assert.ok(!JSON.stringify(all).includes(foreign.id));
    assert.deepEqual(all.find((l: { id: string }) => l.id === shoe.id).container_count, 1);
    await result(await a.tool('get_location', { location_id: randomUUID() }), 404);
    await result(await a.tool('get_location', { location_id: foreign.id }), 404);
    const fallback = (await result(await a.tool('search_items', { query: '신발장', container_id: null }))).result;
    assert.deepEqual(fallback.items, []); assert.deepEqual(fallback.container_matches, []);
    assert.equal(fallback.location_matches.length, 1); assert.equal(fallback.location_matches[0].container_count, 1);
    await a.container('신발장', room.id);
    const ambiguous = (await result(await a.tool('search_items', { query: '신발장', container_id: null }))).result;
    assert.equal(ambiguous.location_matches.length, 1); assert.equal(ambiguous.container_matches.length, 1, 'same names in different hierarchy levels stay separate candidates');
    const absent = (await result(await a.tool('search_items', { query: '존재하지않는장소', container_id: null }))).result;
    assert.deepEqual(absent, { items: [] });
    console.log('PASS hierarchy: completed move preserves source container, empty place differs, locations are owned, name fallback keeps levels separate');
  } finally {
    for (const id of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
});
