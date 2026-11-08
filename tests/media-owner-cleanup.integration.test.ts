import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";

// Requires only local Supabase; no app server or live AI provider calls.
test("deleting an owner cascades retained item photos and container covers without weakening live references", { skip: process.env.RUN_STORAGE_INTEGRATION !== "1" }, async () => {
  loadEnvFile(".env.local");
  const url = process.env.SUPABASE_URL!;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "This test only mutates local Supabase");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const users: string[] = [];
  async function fixture() {
    const created = await admin.auth.admin.createUser({ email: `media-owner-${randomUUID()}@example.com`, password: randomUUID(), email_confirm: true });
    assert.ifError(created.error);
    const userId = created.data.user!.id;
    users.push(userId);
    const mediaId = randomUUID();
    assert.ifError((await admin.from("media_assets").insert({ id: mediaId, user_id: userId, path: `${userId}/${mediaId}.jpg`, status: "uploaded" })).error);
    const container = await admin.from("containers").insert({ user_id: userId, name: "사진을 보관한 보관함", cover_media_id: mediaId }).select().single();
    assert.ifError(container.error);
    const itemRows = await admin.from("items").insert([
      { container_id: container.data.id, name: "사진 물품 1", quantity: 1 },
      { container_id: container.data.id, name: "사진 물품 2", quantity: 1 },
    ]).select();
    assert.ifError(itemRows.error);
    const itemIds = itemRows.data!.map((item) => item.id);
    assert.ifError((await admin.from("item_media").insert(itemIds.map((id) => ({ item_id: id, media_id: mediaId })))).error);
    return { userId, mediaId, containerId: container.data.id, itemIds };
  }
  try {
    const retained = await fixture();
    const untouched = await fixture();
    const deleteReferenced = await admin.from("media_assets").delete().eq("id", retained.mediaId);
    assert.equal(deleteReferenced.error?.code, "23503", "Deleting a still-referenced photo must fail at transaction commit");
    assert.equal((await admin.from("media_assets").select("id").eq("id",retained.mediaId)).data?.length,1);
    const deleted = await admin.auth.admin.deleteUser(retained.userId);
    assert.ifError(deleted.error);
    assert.equal((await admin.from("containers").select("id").eq("id",retained.containerId)).data?.length,0);
    assert.equal((await admin.from("items").select("id").in("id",retained.itemIds)).data?.length,0);
    assert.equal((await admin.from("media_assets").select("id").eq("id",retained.mediaId)).data?.length,0);
    assert.equal((await admin.from("item_media").select("item_id").eq("media_id",retained.mediaId)).data?.length,0);
    assert.equal((await admin.from("containers").select("id").eq("id",untouched.containerId)).data?.length,1);
    assert.equal((await admin.from("media_assets").select("id").eq("id",untouched.mediaId)).data?.length,1);
    assert.equal((await admin.from("item_media").select("item_id").eq("media_id",untouched.mediaId)).data?.length,2);
    assert.ifError((await admin.auth.admin.deleteUser(untouched.userId)).error);
  } finally {
    // Cleanup after an assertion failure does not replace the cascade assertion above.
    for (const id of users) {
      await admin.from("containers").delete().eq("user_id",id);
      await admin.from("media_assets").delete().eq("user_id",id);
      await admin.auth.admin.deleteUser(id);
    }
  }
});
