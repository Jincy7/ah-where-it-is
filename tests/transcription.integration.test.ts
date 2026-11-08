import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { encryptApiKey } from '../src/lib/ai/crypto';
import { MAX_AUDIO_BYTES } from '../src/lib/ai/transcription';

test('dictation HTTP enforces authentication, origin, audio bounds, private keys and its own quota without provider calls', {
  skip: process.env.RUN_TRANSCRIPTION_INTEGRATION !== '1',
}, async () => {
  loadEnvFile('.env.local');
  const url = process.env.SUPABASE_URL!;
  const app = process.env.TEST_APP_URL ?? 'http://localhost:4201';
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(app).hostname));
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const users: string[] = [];
  async function account() {
    const email = `dictation-${randomUUID()}@example.com`, password = randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    const id = data.user!.id;
    users.push(id);
    const cookies: { name: string; value: string }[] = [];
    const client = createServerClient(url, process.env.SUPABASE_ANON_KEY!, { cookies: {
      getAll: () => cookies,
      setAll: values => {
        for (const value of values) {
          const index = cookies.findIndex(cookie => cookie.name === value.name);
          if (index >= 0) cookies[index] = value;
          else cookies.push(value);
        }
      },
    } });
    assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
    return { id, client, request: (init: RequestInit = {}) => fetch(`${app}/api/agent/transcribe`, {
      method: 'POST', ...init,
      headers: { cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '), origin: app, 'Content-Type': 'audio/webm;codecs=opus', ...init.headers },
    }) };
  }
  const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0]);
  try {
    const a = await account(), b = await account();
    assert.equal((await fetch(`${app}/api/agent/transcribe`, { method: 'POST', body: audio, headers: { 'Content-Type': 'audio/webm' } })).status, 401);
    assert.equal((await a.request({ headers: { origin: 'https://evil.example' }, body: audio })).status, 403);
    assert.equal((await a.request({ headers: { 'Content-Type': 'application/json' }, body: '{"confirmed":true}' })).status, 415);
    assert.equal((await a.request({ body: new Uint8Array() })).status, 400);
    assert.equal((await a.request({ body: 'invalid audio contents' })).status, 400);
    assert.equal((await a.request({ body: new Uint8Array(MAX_AUDIO_BYTES + 1) })).status, 413);
    const secret = process.env.AI_KEY_ENCRYPTION_SECRET || process.env.GEMINI_KEY_ENCRYPTION_SECRET!;
    assert.ifError((await admin.from('user_ai_credentials').insert({
      user_id: a.id, provider: 'openai', encrypted_key: encryptApiKey('fixture-never-sent-to-provider', a.id, secret, 'openai'),
    })).error);
    const missingKey = await b.request({ body: audio });
    assert.equal(missingKey.status, 422, 'another owner credential and local environment key are never used');
    assert.match((await missingKey.json()).error, /OpenAI API 키/);
    const bucket = new Date(); bucket.setUTCMinutes(0, 0, 0);
    assert.ifError((await admin.from('ai_usage_limits').upsert({ user_id: a.id, scope: 'transcription', window_start: bucket.toISOString(), calls: 30 })).error);
    const limited = await a.request({ body: audio });
    assert.equal(limited.status, 429, 'the fake key cannot reach the provider after the exhausted quota');
    assert.match(limited.headers.get('cache-control') ?? '', /no-store/);
    const message = await limited.text();
    assert.doesNotMatch(message, /fixture-never|encrypted_key/);
    const { data: quota } = await admin.from('ai_usage_limits').select('calls').eq('user_id', a.id).eq('scope', 'transcription').single();
    assert.equal(quota?.calls, 30);
    const chatQuota = await admin.rpc('consume_ai_quota', { p_user_id: a.id, p_scope: 'chat' });
    assert.ifError(chatQuota.error);
    assert.equal(chatQuota.data, true, 'dictation does not consume chat quota');
    assert.ok((await a.client.rpc('consume_ai_quota', { p_user_id: a.id, p_scope: 'transcription' })).error);
  } finally {
    for (const id of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
});
