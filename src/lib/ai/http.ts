import { NextResponse } from "next/server";
import { VisionError } from "./gemini";

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}
export function errorResponse(error: unknown) {
  // Never log or return provider/database errors: they can contain secrets or photo contents.
  return privateJson(
    {
      error:
        error instanceof VisionError
          ? error.message
          : "요청을 처리하지 못했습니다. 다시 시도해주세요",
    },
    error instanceof VisionError ? error.status : 500,
  );
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new VisionError("허용되지 않은 요청입니다", 403);
}
export async function readLimitedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new VisionError("요청 크기가 너무 큽니다", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new VisionError("요청 내용이 없습니다", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new VisionError("요청 크기가 너무 큽니다", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function readJson(request: Request, limit: number) {
  const body = await readLimitedBody(request, limit);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new VisionError("올바른 요청 내용을 입력해주세요", 400);
  }
}
