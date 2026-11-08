import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import sharp from "sharp";
import { decryptApiKey, encryptApiKey } from "../src/lib/ai/crypto";

test("local provider credentials: isolation, ciphertext, API secrecy and optional analysis target", {
  skip: process.env.RUN_AI_INTEGRATION !== "1",
}, async () => {
  loadEnvFile(".env.local");
  const url = process.env.SUPABASE_URL!;
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname));
  const app = process.env.TEST_APP_URL ?? "http://localhost:4201";
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(app).hostname));
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const users: string[] = [];
  async function account() {
    const email = `provider-${randomUUID()}@example.com`, password = randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    const id = data.user!.id;
    users.push(id);
    const cookies: { name: string; value: string }[] = [];
    const client = createServerClient(url, process.env.SUPABASE_ANON_KEY!, { cookies: {
      getAll: () => cookies,
      setAll: values => {
        for (const value of values) {
          const index = cookies.findIndex(c => c.name === value.name);
          if (index >= 0) cookies[index] = value;
          else cookies.push(value);
        }
      },
    } });
    assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
    return { id, client, request: (path: string, init: RequestInit = {}) => fetch(app + path, {
      ...init, headers: { cookie: cookies.map(c => `${c.name}=${c.value}`).join("; "), origin: app, ...init.headers },
    }) };
  }
  try {
    const a = await account(), b = await account();
    const secret = process.env.AI_KEY_ENCRYPTION_SECRET || process.env.GEMINI_KEY_ENCRYPTION_SECRET!;
    const key = "fixture-key-never-sent-to-provider";
    // The compatibility endpoint and unified resolver must never diverge.
    for (const geminiKey of ["gemini-key-original-1234567890", "gemini-key-replacement-1234567890"]) {
      const saved = await a.request("/api/settings/gemini", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: geminiKey }) });
      assert.equal(saved.status, 200);
      const { data: mirrored, error } = await admin.from("user_ai_credentials").select("encrypted_key").eq("user_id", a.id).eq("provider", "gemini").single();
      assert.ifError(error);
      assert.equal(decryptApiKey(mirrored!.encrypted_key, a.id, secret, "gemini"), geminiKey);
    }
    assert.equal((await a.request("/api/settings/gemini", { method: "DELETE" })).status, 200);
    const { data: removedGemini } = await admin.from("user_ai_credentials").select("user_id").eq("user_id", a.id).eq("provider", "gemini");
    assert.equal(removedGemini?.length, 0);
    const encrypted = encryptApiKey(key, a.id, secret, "openai");
    assert.ifError((await admin.from("user_ai_credentials").insert({ user_id: a.id, provider: "openai", encrypted_key: encrypted })).error);
    assert.equal(decryptApiKey(encrypted, a.id, secret, "openai"), key);
    assert.throws(() => decryptApiKey(encrypted, b.id, secret, "openai"));
    assert.ok((await a.client.from("user_ai_credentials").select("*")).error);
    assert.ok((await b.client.from("user_ai_credentials").select("*")).error);
    assert.ok((await b.client.from("user_ai_credentials").insert({ user_id: b.id, provider: "openai", encrypted_key: encrypted })).error);
    const status = await a.request("/api/settings/openai");
    assert.equal(status.status, 200);
    assert.match(status.headers.get("cache-control") ?? "", /no-store/);
    const statusBody = await status.text();
    assert.equal(JSON.parse(statusBody).configured, true);
    assert.ok(!statusBody.includes(key));
    assert.ok(!statusBody.includes(encrypted));
    assert.equal((await (await b.request("/api/settings/openai")).json()).configured, false);
    assert.equal((await b.request("/api/settings/openai", { method: "DELETE" })).status, 200);
    assert.equal((await (await a.request("/api/settings/openai")).json()).configured, true);
    assert.equal((await a.request("/api/settings/openai", { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"apiKey":"short"}' })).status, 400);
    assert.equal((await a.request("/api/settings/openai", { method: "DELETE", headers: { origin: "https://evil.example" } })).status, 403);
    assert.equal((await fetch(app + "/api/settings/openai")).status, 401);
    // OpenAI analyzes before selecting a destination; image validation runs next.
    assert.equal((await b.request("/api/items/analyze?provider=openai", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "not image" })).status, 415);
    assert.equal((await b.request("/api/items/analyze?provider=gemini", { method: "POST", body: "not image" })).status, 400);
    assert.equal((await b.request("/api/items/analyze?provider=unknown", { method: "POST", body: "not image" })).status, 400);
    const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).jpeg().toBuffer();
    const missingKey = await b.request("/api/items/analyze?provider=openai", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array(image) });
    assert.equal(missingKey.status, 422);
    assert.match((await missingKey.json()).error, /OpenAI API 키/);
    assert.equal((await a.request("/api/settings/openai", { method: "DELETE" })).status, 200);
    assert.equal((await (await a.request("/api/settings/openai")).json()).configured, false);
  } finally {
    for (const id of users) await admin.auth.admin.deleteUser(id);
  }
});
