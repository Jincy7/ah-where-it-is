import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { loadEnvFile } from "node:process";
import sharp from "sharp";
import { decryptApiKey } from "../src/lib/ai/crypto";

const enabled = process.env.RUN_AI_INTEGRATION === "1";
test(
  "local Supabase and HTTP: encrypted keys, isolation, quota, retries, image validation",
  { skip: !enabled },
  async () => {
    loadEnvFile(".env.local");
    const url = process.env.SUPABASE_URL!;
    assert.ok(
      ["localhost", "127.0.0.1"].includes(new URL(url).hostname),
      "Integration tests must use local Supabase",
    );
    const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const users: string[] = [];
    const app = process.env.TEST_APP_URL ?? "http://localhost:4201";
    async function account() {
      const email = `ai-test-${randomUUID()}@example.com`,
        password = randomUUID();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert.ifError(error);
      users.push(data.user!.id);
      const cookies: { name: string; value: string }[] = [];
      const client = createServerClient(url, process.env.SUPABASE_ANON_KEY!, {
        cookies: {
          getAll: () => cookies,
          setAll: (values) => {
            for (const value of values) {
              const i = cookies.findIndex((c) => c.name === value.name);
              if (i >= 0) cookies[i] = value;
              else cookies.push(value);
            }
          },
        },
      });
      assert.ifError(
        (await client.auth.signInWithPassword({ email, password })).error,
      );
      const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      return {
        id: data.user!.id,
        client,
        request: (path: string, init: RequestInit = {}) =>
          fetch(app + path, {
            ...init,
            headers: { cookie, origin: app, ...init.headers },
          }),
      };
    }
    try {
      const a = await account(),
        b = await account();
      const { data: container, error } = await a.client
        .from("containers")
        .insert({ user_id: a.id, name: "AI integration fixture" })
        .select()
        .single();
      assert.ifError(error);
      const id = container.id;
      const key = "test-secret-value-with-30-characters";
      let response = await a.request("/api/settings/gemini", {
        method: "PUT",
        body: JSON.stringify({ apiKey: key }),
      });
      assert.equal(response.status, 200, await response.text());
      const stored = await admin
        .from("user_gemini_keys")
        .select("*")
        .eq("user_id", a.id)
        .single();
      assert.ifError(stored.error);
      assert.notEqual(stored.data.encrypted_key, key);
      assert.equal(
        decryptApiKey(
          stored.data.encrypted_key,
          a.id,
          process.env.GEMINI_KEY_ENCRYPTION_SECRET!,
        ),
        key,
      );
      assert.ok((await a.client.from("user_gemini_keys").select("*")).error);
      assert.ok((await b.client.from("user_gemini_keys").select("*")).error);
      response = await a.request("/api/settings/gemini");
      const metadata = await response.text();
      assert.ok(!metadata.includes(key));
      assert.ok(!metadata.includes("encrypted_key"));
      assert.equal(response.headers.get("cache-control"), "no-store, private");
      assert.equal(
        (await (await b.request("/api/settings/gemini")).json()).configured,
        false,
      );
      assert.equal(
        (
          await a.request("/api/settings/gemini", {
            method: "PUT",
            headers: { origin: "https://evil.example" },
            body: JSON.stringify({ apiKey: key }),
          })
        ).status,
        403,
      );
      assert.equal((await fetch(app + "/api/settings/gemini")).status, 401);
      assert.equal(
        (
          await b.request(`/api/items/analyze?container_id=${id}`, {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body: "invalid",
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await a.request(`/api/items/analyze?container_id=${id}`, {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body: "invalid",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await a.request(`/api/items/analyze?container_id=${id}`, {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body: Buffer.alloc(2 * 1024 * 1024 + 1),
          })
        ).status,
        413,
      );
      const payload = {
        container_id: id,
        request_id: randomUUID(),
        items: [{ name: "검증 물품", quantity: 2, description: "통합 검증" }],
      };
      const send = () =>
        a.request("/api/items/bulk", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      const responses = await Promise.all([send(), send(), send()]);
      for (const r of responses) assert.equal(r.status, 200);
      const results = await Promise.all(responses.map((r) => r.json()));
      assert.equal(results[0].items[0].id, results[1].items[0].id);
      assert.equal(results[1].items[0].id, results[2].items[0].id);
      assert.equal(
        (await a.client.from("items").select("*").eq("container_id", id)).data!
          .length,
        1,
      );
      assert.equal(
        (
          await b.request("/api/items/bulk", {
            method: "POST",
            body: JSON.stringify(payload),
          })
        ).status,
        404,
      );
      payload.items[0].quantity = 3;
      assert.equal((await send()).status, 409);
      payload.items[0].quantity = 1.5;
      assert.equal((await send()).status, 400);
      assert.ok(
        (
          await a.client.rpc("consume_ai_quota", {
            p_user_id: a.id,
            p_scope: "analysis",
          })
        ).error,
      );
      const counts = await Promise.all(
        Array.from({ length: 35 }, () =>
          admin.rpc("consume_ai_quota", {
            p_user_id: b.id,
            p_scope: "analysis",
          }),
        ),
      );
      counts.forEach((c) => assert.ifError(c.error));
      assert.equal(counts.filter((c) => c.data === true).length, 30);
      console.log(
        "PASS: encryption, account isolation, CSRF, auth, invalid/oversized images, atomic retries, concurrent quota",
      );
      if (process.env.RUN_LIVE_GEMINI === "1") {
        assert.ok(process.env.GEMINI_API_KEY);
        assert.equal(
          (
            await a.request("/api/settings/gemini", {
              method: "PUT",
              body: JSON.stringify({ apiKey: process.env.GEMINI_API_KEY }),
            })
          ).status,
          200,
        );
        const image = await sharp(await readFile("public/agu-container.png"))
          .resize(800)
          .jpeg()
          .toBuffer();
        response = await a.request(`/api/items/analyze?container_id=${id}`, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: new Uint8Array(image),
        });
        const result = await response.json();
        assert.equal(response.status, 200, JSON.stringify(result));
        assert.ok(Array.isArray(result.items));
        console.log(
          `PASS: live gemini-3.5-flash-lite returned ${result.items.length} item drafts`,
        );
      }
      assert.equal(
        (await a.request("/api/settings/gemini", { method: "DELETE" })).status,
        200,
      );
      assert.equal(
        (await admin.from("user_gemini_keys").select("*").eq("user_id", a.id))
          .data!.length,
        0,
      );
    } finally {
      for (const id of users)
        assert.ifError((await admin.auth.admin.deleteUser(id)).error);
    }
  },
);
