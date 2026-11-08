import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { ActionPayload, ChangeType, StorageAction } from "../src/lib/storage/types";

test("partial storage updates preserve omitted fields and allow explicit clearing", {
  skip: process.env.RUN_STORAGE_INTEGRATION !== "1",
  timeout: 90_000,
}, async (t) => {
  loadEnvFile(".env.local");
  const url = process.env.SUPABASE_URL!;
  const app = process.env.TEST_APP_URL ?? "http://localhost:4201";
  for (const endpoint of [url, app]) {
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname), "Local fixtures only");
  }
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const users: string[] = [];

  try {
    const email = `partial-update-${randomUUID()}@example.com`;
    const password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    const userId = created.data.user!.id;
    users.push(userId);
    const cookies: { name: string; value: string }[] = [];
    const client = createServerClient(url, process.env.SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => cookies,
        setAll: (values) => {
          for (const value of values) {
            const index = cookies.findIndex((cookie) => cookie.name === value.name);
            if (index < 0) cookies.push(value);
            else cookies[index] = value;
          }
        },
      },
    });
    assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
    const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
    const post = (path: string, body: unknown) => fetch(app + path, {
      method: "POST",
      headers: { cookie, origin: app, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    async function prepare(type: ChangeType, payload: ActionPayload): Promise<StorageAction> {
      const response = await post("/api/storage/actions", { type, payload });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body.action;
    }
    async function confirm(action: StorageAction): Promise<StorageAction> {
      const response = await post(`/api/storage/actions/${action.action_id}/confirm`, {
        revision: action.revision,
        payload_hash: action.payload_hash,
        idempotency_key: action.idempotency_key,
      });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.action.status, "completed");
      assert.deepEqual(body.action.receipt, body.receipt);
      return body.action;
    }
    async function execute<T>(type: ChangeType, payload: ActionPayload): Promise<T> {
      const action = await confirm(await prepare(type, payload));
      return action.receipt!.result as T;
    }
    async function row(table: "containers" | "items" | "locations", id: string): Promise<Record<string, unknown>> {
      const result = await client.from(table).select("*").eq("id", id).single();
      assert.ifError(result.error);
      assert.ok(result.data);
      return result.data;
    }
    async function assertOmitted(action: StorageAction, field: string, previous: unknown) {
      assert.equal(action.preview.before?.[field], previous);
      assert.equal(Object.hasOwn(action.payload, field), false, "prepare must retain the original omission");
      assert.ok(action.preview.after);
      assert.equal(Object.hasOwn(action.preview.after, field), false, "preview must not propose clearing an omitted field");
      const saved = await admin.from("storage_actions").select("payload").eq("action_id", action.action_id).single();
      assert.ifError(saved.error);
      assert.equal(Object.hasOwn(saved.data!.payload, field), false, "persisted actions must exercise omitted-field compatibility");
    }

    await t.test("renaming a container retains its location and photos; explicit null detaches it", async () => {
      const location = await execute<{ id: string }>("create_location", { name: "작업방" });
      const mediaId = randomUUID();
      assert.ifError((await admin.from("media_assets").insert({
        id: mediaId, user_id: userId, path: `${userId}/${mediaId}.jpg`, status: "attached",
      })).error);
      const container = await execute<{ id: string }>("create_container", {
        name: "공구함", location_id: location.id, cover_media_id: mediaId,
      });
      const legacyPhoto = "https://example.com/legacy-container.jpg";
      assert.ifError((await client.from("containers").update({ internal_photo_url: legacyPhoto }).eq("id", container.id)).error);

      const rename = await prepare("update_container", { container_id: container.id, name: "작은 공구함" });
      await assertOmitted(rename, "location_id", location.id);
      assert.equal((await row("containers", container.id)).name, "공구함", "prepare must not rename the container");
      const completed = await confirm(rename);
      const result = completed.receipt!.result as Record<string, unknown>;
      assert.equal(result.name, "작은 공구함");
      assert.equal(result.location_id, location.id, "name-only confirmation must preserve the location");
      assert.equal(result.cover_media_id, mediaId);
      assert.equal(result.internal_photo_url, legacyPhoto);
      const renamed = await row("containers", container.id);
      assert.equal(renamed.location_id, location.id);
      assert.equal(renamed.cover_media_id, mediaId);
      assert.equal(renamed.internal_photo_url, legacyPhoto);
      assert.deepEqual((await confirm(rename)).receipt, completed.receipt, "retry must return the same receipt");

      const clear = await prepare("update_container", { container_id: container.id, name: "작은 공구함", location_id: null });
      assert.equal(clear.preview.before?.location_id, location.id);
      assert.equal(clear.preview.after?.location_id, null);
      const cleared = await confirm(clear);
      assert.equal((cleared.receipt!.result as Record<string, unknown>).location_id, null);
      const detached = await row("containers", container.id);
      assert.equal(detached.location_id, null);
      assert.equal(detached.cover_media_id, mediaId, "clearing the location must preserve an omitted cover");
      assert.equal(detached.internal_photo_url, legacyPhoto);
    });

    await t.test("editing an item retains its description; an explicit empty string clears it", async () => {
      const container = await execute<{ id: string }>("create_container", { name: "책상 서랍" });
      const description = "긴 USB-C 케이블";
      const [item] = await execute<{ id: string }[]>("register_items", {
        container_id: container.id, items: [{ name: "충전기", quantity: 1, description }],
      });
      const update = await prepare("update_item", { item_id: item.id, name: "노트북 충전기", quantity: 2 });
      await assertOmitted(update, "description", description);
      assert.equal((await row("items", item.id)).quantity, 1, "prepare must not change the item");
      const completed = await confirm(update);
      const result = completed.receipt!.result as Record<string, unknown>;
      assert.equal(result.name, "노트북 충전기");
      assert.equal(result.quantity, 2);
      assert.equal(result.description, description, "an omitted item description must survive confirmation");
      assert.equal((await row("items", item.id)).description, description);

      const clear = await prepare("update_item", { item_id: item.id, name: "노트북 충전기", quantity: 2, description: "" });
      assert.equal(clear.preview.before?.description, description);
      assert.equal(clear.preview.after?.description, "");
      const cleared = await confirm(clear);
      assert.equal((cleared.receipt!.result as Record<string, unknown>).description, null);
      assert.equal((await row("items", item.id)).description, null);
    });

    await t.test("renaming a location retains its description; an explicit empty string clears it", async () => {
      const description = "창문 옆 선반";
      const location = await execute<{ id: string }>("create_location", { name: "서재", description });
      const rename = await prepare("update_location", { location_id: location.id, name: "작업실" });
      await assertOmitted(rename, "description", description);
      assert.equal((await row("locations", location.id)).name, "서재", "prepare must not rename the location");
      const completed = await confirm(rename);
      const result = completed.receipt!.result as Record<string, unknown>;
      assert.equal(result.name, "작업실");
      assert.equal(result.description, description, "an omitted location description must survive confirmation");
      assert.equal((await row("locations", location.id)).description, description);

      const clear = await prepare("update_location", { location_id: location.id, name: "작업실", description: "" });
      assert.equal(clear.preview.before?.description, description);
      assert.equal(clear.preview.after?.description, "");
      const cleared = await confirm(clear);
      assert.equal((cleared.receipt!.result as Record<string, unknown>).description, null);
      assert.equal((await row("locations", location.id)).description, null);
    });
  } finally {
    for (const id of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
});
