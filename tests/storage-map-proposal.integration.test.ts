import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { StorageMapProposal } from '../src/lib/storage/map-proposal-types';

test('map proposals use authenticated records without keys or writes, and remain subject to normal save confirmation', { skip: process.env.RUN_STORAGE_INTEGRATION !== '1' }, async () => {
  loadEnvFile('.env.local');
  const url = process.env.SUPABASE_URL!, app = process.env.TEST_APP_URL ?? 'http://localhost:4211';
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(app).hostname));
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const users: string[] = [];
  async function account() {
    const email = `map-proposal-${randomUUID()}@example.com`, password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error); const id = created.data.user!.id; users.push(id);
    const cookies: { name: string; value: string }[] = [];
    const client = createServerClient(url, process.env.SUPABASE_ANON_KEY!, { cookies: { getAll: () => cookies, setAll: values => { for (const value of values) { const i = cookies.findIndex(c => c.name === value.name); if (i >= 0) cookies[i] = value; else cookies.push(value); } } } });
    assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
    const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const json = (path: string, body: unknown, origin = app) => fetch(app + path, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    async function propose(body: unknown): Promise<StorageMapProposal> { const response = await json('/api/storage/map/propose', body); const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data.proposal; }
    return { id, client, json, propose };
  }
  try {
    const a = await account(), b = await account();
    assert.equal((await fetch(app + '/api/storage/map/propose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await a.json('/api/storage/map/propose', {}, 'https://other.example')).status, 403);
    const locations = await a.client.from('locations').insert([{ user_id: a.id, name: '서재' }, { user_id: a.id, name: '거실' }]).select();
    assert.ifError(locations.error);
    const study = locations.data!.find(location => location.name === '서재')!, living = locations.data!.find(location => location.name === '거실')!;
    assert.ifError((await a.client.from('containers').insert({ user_id: a.id, name: '책상 서랍', location_id: study.id })).error);
    const first = await a.propose({ relations: [{ subject: '서재', relation: 'next_to', target: '거실' }] });
    assert.equal(first.source.location_count, 2); assert.equal(first.source.container_count, 1);
    assert.equal(first.draft.new_locations.length, 0); assert.equal(first.draft.anchors.length, 1);
    assert.deepEqual(new Set(first.draft.regions.map(region => region.location_id)), new Set([study.id, living.id]));
    assert.equal((await a.client.from('storage_maps').select('*')).data?.length, 0);
    assert.equal((await admin.from('storage_actions').select('*').eq('user_id', a.id)).data?.length, 0, 'proposals never prepare actions');
    const corrected = await a.propose({ draft: first.draft, previous_relations: first.relations, remove_relations: [{ subject: study.id, target: living.id }], relations: [{ subject: study.id, relation: 'above', target: living.id }], new_location_names: ['베란다'] });
    assert.equal(corrected.draft.map_draft_id, first.draft.map_draft_id); assert.equal(corrected.draft.draft_revision, 2);
    assert.equal(corrected.relations.length, 1); assert.equal(corrected.relations[0].relation, 'above');
    assert.equal(corrected.draft.new_locations[0].name, '베란다');
    assert.equal((await a.client.from('locations').select('*')).data?.length, 2, 'pending names are not written');
    assert.equal((await b.json('/api/storage/map/propose', { relations: [{ subject: study.id, relation: 'left_of', target: living.id }] })).status, 404);
    const foreignDraft = structuredClone(first.draft); foreignDraft.regions[0].location_id = randomUUID();
    assert.equal((await a.json('/api/storage/map/propose', { draft: foreignDraft })).status, 404);
    const empty = await b.propose({});
    assert.equal(empty.source.location_count, 0); assert.equal(empty.recommended_location_keys.length, 4);
    assert.equal((await b.client.from('locations').select('*')).data?.length, 0);
    assert.equal((await a.json('/api/storage/map/propose', { regions: [] })).status, 400);
    assert.equal((await a.json('/api/storage/map/propose', { relations: [{ subject: study.id, relation: 'above', target: study.id }] })).status, 400);
    assert.ifError((await a.client.from('locations').insert({ user_id: a.id, name: '서재' })).error);
    assert.equal((await a.json('/api/storage/map/propose', { relations: [{ subject: '서재', relation: 'left_of', target: '거실' }] })).status, 400);
    assert.equal((await a.json('/api/storage/map/propose', { relations: [{ subject: study.id, relation: 'left_of', target: living.id }] })).status, 200);
    // Existing map action remains the only path that creates recommended places and geometry.
    const preparedResponse = await a.json('/api/storage/actions', { type: 'save_storage_map', payload: corrected.draft });
    const prepared = await preparedResponse.json(); assert.equal(preparedResponse.status, 200, JSON.stringify(prepared));
    const action = prepared.action;
    assert.equal((await a.client.from('storage_maps').select('*')).data?.length, 0);
    const confirmed = await a.json(`/api/storage/actions/${action.action_id}/confirm`, { revision: action.revision, payload_hash: action.payload_hash, idempotency_key: action.idempotency_key });
    assert.equal(confirmed.status, 200, await confirmed.text());
    assert.equal((await a.client.from('storage_maps').select('*')).data?.length, 1);
    assert.equal((await a.client.from('locations').select('*').eq('name', '베란다')).data?.length, 1);
    assert.equal((await a.json('/api/storage/map/propose', { draft: corrected.draft })).status, 409, 'saved map changes reject old proposal bases');
  } finally { for (const id of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error); }
});
