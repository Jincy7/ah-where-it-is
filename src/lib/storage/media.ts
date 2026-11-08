import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { aiAdmin } from "@/lib/ai/server";
import { VisionError } from "@/lib/ai/gemini";
import { MAX_IMAGE_BYTES } from "@/lib/ai/schema";
import { readLimitedBody } from "@/lib/ai/http";
import { storageContext } from "./service";

export async function uploadMedia(request: Request) {
  const { user } = await storageContext();
  if (!["image/jpeg", "image/png", "image/webp"].includes(request.headers.get("content-type") ?? "")) throw new VisionError("JPG, PNG, WebP 사진을 선택해주세요", 415);
  const bytes = await readLimitedBody(request, MAX_IMAGE_BYTES);
  let jpeg: Buffer;
  try {
    const input = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const metadata = await input.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Invalid image");
    jpeg = await input.rotate().resize(1600,1600,{fit:"inside",withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
  } catch { throw new VisionError("사진을 읽을 수 없습니다. 다른 사진으로 다시 시도해주세요", 400); }
  const admin = aiAdmin();
  const id = randomUUID();
  const path = `${user.id}/${id}.jpg`;
  const inserted = await admin.from("media_assets").insert({ id, user_id: user.id, path, status: "pending" });
  if (inserted.error) throw new VisionError("사진을 준비하지 못했습니다", 503);
  const uploaded = await admin.storage.from("item-images").upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (uploaded.error) throw new VisionError("사진을 저장하지 못했습니다. 다시 시도해주세요", 503);
  const updated = await admin.from("media_assets").update({ status: "uploaded", updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (updated.error) throw new VisionError("사진 저장 결과를 확인하지 못했습니다", 503);
  const signed = await admin.storage.from("item-images").createSignedUrl(path,600);
  if (signed.error) throw new VisionError("사진을 표시하지 못했습니다", 503);
  return { id, url: signed.data.signedUrl };
}
/** Media handle lookup always rechecks the authenticated owner; no arbitrary URLs. */
export async function readOwnedMedia(mediaId: string): Promise<Buffer> {
  const { supabase, user } = await storageContext();
  const { data, error } = await supabase.from("media_assets").select("path").eq("id",mediaId).eq("user_id",user.id).in("status",["uploaded","attached"]).maybeSingle();
  if (error) throw new VisionError("사진을 불러오지 못했습니다",503);
  if (!data) throw new VisionError("사진을 찾을 수 없습니다",404);
  const download = await supabase.storage.from("item-images").download(data.path);
  if (download.error) throw new VisionError("사진을 불러오지 못했습니다",503);
  return Buffer.from(await download.data.arrayBuffer());
}
export async function cleanupMedia() {
  const { user } = await storageContext();
  const admin = aiAdmin();
  const claimed = await admin.rpc("claim_orphaned_media",{p_user_id:user.id});
  if (claimed.error) throw new VisionError("사진 정리를 시작하지 못했습니다",503);
  const queued = await admin.from("media_deletion_queue").select("path").eq("user_id",user.id).limit(100);
  if (queued.error) throw new VisionError("사진 정리 목록을 불러오지 못했습니다",503);
  const paths = (queued.data ?? []).map((p) => p.path);
  if (!paths.length) return { removed: 0 };
  const removed = await admin.storage.from("item-images").remove(paths);
  if (removed.error) throw new VisionError("사진 정리를 마치지 못했습니다. 다시 시도해주세요",503);
  // Paths contain two UUIDs, so a 100-path filter exceeds the gateway URL limit.
  for (let offset = 0; offset < paths.length; offset += 50) {
    const cleared = await admin.from("media_deletion_queue").delete().eq("user_id",user.id).in("path",paths.slice(offset, offset + 50));
    if (cleared.error) throw new VisionError("사진 정리 결과를 확인하지 못했습니다",503);
  }
  return { removed: paths.length };
}
