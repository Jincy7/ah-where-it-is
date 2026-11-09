import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { contextSchema } from '../src/lib/agent/contracts';
import { regionBounds } from '../src/lib/storage/map-geometry';
import { storageMapDraftSchema } from '../src/lib/storage/map-schema';
import type { StorageMapProposal } from '../src/lib/storage/map-proposal-types';
const narrative = '작은방과 신발장 사이에는 화장실이 있어 우측 벽에 붙어있고, 중앙 가운데는 거실, 거실 아래와 신발장 좌측엔 주방, 거실 좌측엔 안방, 주방 좌측엔 옷방과 옷방 베란다가 있어 이거 지도에 반영해줘';
const newNames = ['화장실', '거실', '주방', '안방', '옷방', '옷방 베란다'];
async function account() {
  loadEnvFile('.env.local');
  const url = process.env.SUPABASE_URL!, app = process.env.TEST_APP_URL ?? 'http://localhost:4211';
  for (const endpoint of [url, app]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname));
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const email = `narrative-${randomUUID()}@example.com`, password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); assert.ifError(created.error);
  const id = created.data.user!.id;
  const cookies: { name: string; value: string }[] = [];
  const client = createServerClient(url, process.env.SUPABASE_ANON_KEY!, { cookies: { getAll: () => cookies, setAll: values => { for (const value of values) { const index = cookies.findIndex(cookie => cookie.name === value.name); if (index < 0) cookies.push(value); else cookies[index] = value; } } } });
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  const post = (path: string, body: unknown) => fetch(app + path, { method: 'POST', headers: { cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '), origin: app, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  const seeded = await client.from('locations').insert([{ user_id: id, name: '작은방' }, { user_id: id, name: '신발장' }]).select(); assert.ifError(seeded.error);
  const small = seeded.data!.find(location => location.name === '작은방')!.id, shoes = seeded.data!.find(location => location.name === '신발장')!.id;
  const initialResponse = await post('/api/storage/map/propose', {}), initialBody = await initialResponse.json(); assert.equal(initialResponse.status, 200, JSON.stringify(initialBody));
  const first = initialBody.proposal as StorageMapProposal;
  const context = contextSchema.parse({ mapProposal: { draft: first.draft, previous_relations: first.relations } });
  return { admin, client, id, post, small, shoes, first, context };
}
function validate(proposal: StorageMapProposal, small: string, shoes: string) {
  assert.deepEqual(new Set(proposal.draft.new_locations.map(location => location.name)), new Set(newNames));
  assert.equal(proposal.draft.regions.length, 8); assert.equal(proposal.relations.length, 8);
  assert.equal(storageMapDraftSchema.safeParse(proposal.draft).success, true);
  const ids = new Map(proposal.draft.new_locations.map(location => [location.name, location.client_location_key]));
  const bathroom = ids.get('화장실')!, living = ids.get('거실')!, kitchen = ids.get('주방')!;
  const rect = (id: string) => regionBounds(proposal.draft.regions.find(region => (region.location_id ?? region.client_location_key) === id)!.cells)!;
  const between = proposal.relations.find(relation => relation.relation === 'between'); assert.ok(between && between.relation === 'between');
  assert.equal(between.subject, bathroom); assert.equal(between.axis, 'vertical'); assert.deepEqual(new Set([between.target, between.other_target]), new Set([small, shoes]));
  const a = rect(between.target), b = rect(bathroom), c = rect(between.other_target);
  assert.ok(a.row + a.height <= b.row && b.row + b.height <= c.row); assert.equal(b.col + b.width, proposal.draft.columns);
  const center = rect(living); assert.ok(Math.abs(center.col + center.width / 2 - proposal.draft.columns / 2) <= .5); assert.ok(Math.abs(center.row + center.height / 2 - proposal.draft.rows / 2) <= .5);
  assert.ok(rect(kitchen).row >= center.row + center.height); assert.ok(rect(kitchen).col + rect(kitchen).width <= rect(shoes).col);
  for (const [subject, target] of [[ids.get('안방')!, living], [ids.get('옷방')!, kitchen], [ids.get('옷방 베란다')!, kitchen]]) assert.ok(rect(subject).col + rect(subject).width <= rect(target).col);
}
async function verifyNoWrites(a: Awaited<ReturnType<typeof account>>) {
  assert.equal((await a.client.from('locations').select('id', { count: 'exact' })).count, 2);
  assert.equal((await a.client.from('storage_maps').select('id', { count: 'exact' })).count, 0);
  assert.equal((await a.admin.from('storage_actions').select('action_id', { count: 'exact' }).eq('user_id', a.id)).count, 0);
}
test('authenticated narrative constraints retain all clauses and pending names without writes', { skip: process.env.RUN_AGENT_INTEGRATION !== '1' }, async () => {
  const a = await account();
  try {
    const intent = { new_location_names: newNames, relations: [
      { subject: '화장실', relation: 'between', target: a.small, other_target: a.shoes, axis: 'auto' }, { subject: '화장실', relation: 'at_right_edge', target: 'map' }, { subject: '거실', relation: 'center', target: 'map' },
      { subject: '주방', relation: 'below', target: '거실' }, { subject: '주방', relation: 'left_of', target: a.shoes }, { subject: '안방', relation: 'left_of', target: '거실' }, { subject: '옷방', relation: 'left_of', target: '주방' }, { subject: '옷방 베란다', relation: 'left_of', target: '주방' },
    ] };
    const response = await a.post('/api/agent/tool', { name: 'propose_storage_map', arguments: { request_json: JSON.stringify(intent) }, context: a.context });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body));
    const proposal = body.result.mapProposal as StorageMapProposal; validate(proposal, a.small, a.shoes);
    assert.equal(proposal.draft.map_draft_id, a.first.draft.map_draft_id); assert.equal(proposal.draft.draft_revision, a.first.draft.draft_revision + 1);
    await verifyNoWrites(a);
  } finally { assert.ifError((await a.admin.auth.admin.deleteUser(a.id)).error); }
});
test('configured development model interprets the complete household utterance', { skip: process.env.RUN_AI_MAP_INTEGRATION !== '1', timeout: 180000 }, async () => {
  const a = await account();
  try {
    // Import only the explicitly configured local-development key into this disposable account.
    const imported = await a.post('/api/settings/openai', { useLocalKey: true }); const importedBody = await imported.json(); assert.equal(imported.status, 200, JSON.stringify(importedBody));
    const response = await a.post('/api/agent/chat', { message: narrative, history: [], context: a.context });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body));
    const proposals = body.events.filter((event: { result?: { mapProposal?: unknown } }) => event.result?.mapProposal);
    assert.ok(proposals.length, `No proposal: ${body.message}`);
    validate(proposals.at(-1).result.mapProposal, a.small, a.shoes);
    await verifyNoWrites(a);
  } finally { assert.ifError((await a.admin.auth.admin.deleteUser(a.id)).error); }
});
