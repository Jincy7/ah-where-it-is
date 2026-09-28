"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  ScanLine,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BulkItemForm } from "./bulk-item-form";
import { MAX_IMAGE_BYTES, MAX_PHOTOS, type ItemDraft } from "@/lib/ai/schema";

type Photo = {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  status: "queued" | "analyzing" | "ready" | "error" | "saved";
  items?: ItemDraft[];
  error?: string;
};

async function preparePhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "JPG, PNG, WebP 사진을 선택해주세요. HEIC 사진은 JPG로 변환해주세요",
    );
  if (file.size > 20 * 1024 * 1024)
    throw new Error("원본 사진은 20MB 이하로 선택해주세요");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이 브라우저에서 사진을 처리하지 못했습니다");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("사진 변환에 실패했습니다")),
        "image/jpeg",
        0.85,
      ),
    );
    if (blob.size > MAX_IMAGE_BYTES)
      throw new Error("사진 크기가 너무 큽니다. 더 작은 사진을 선택해주세요");
    return blob;
  } finally {
    bitmap.close();
  }
}

export function PhotoItemRegistration({
  containerId,
  existingNames,
}: {
  containerId: string;
  existingNames: string[];
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [keyReady, setKeyReady] = useState<boolean | null>(null);
  const [keyError, setKeyError] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const currentUrls = urls.current;
    const abort = new AbortController();
    fetch("/api/settings/gemini", { cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setKeyReady(data.configured || data.localFallback);
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setKeyError(error.message || "키 설정을 확인하지 못했습니다");
      });
    return () => {
      mounted.current = false;
      abort.abort();
      controller.current?.abort();
      currentUrls.forEach((url) => URL.revokeObjectURL(url));
      currentUrls.clear();
    };
  }, []);
  async function addFiles(list: FileList | null) {
    if (!list?.length || busy) return;
    setBusy(true);
    const selected = Array.from(list).slice(0, MAX_PHOTOS - photos.length);
    if (selected.length < list.length)
      toast.error(`사진은 한 번에 최대 ${MAX_PHOTOS}장까지 추가할 수 있습니다`);
    try {
      for (const file of selected) {
        try {
          const blob = await preparePhoto(file);
          if (!mounted.current) return;
          const url = URL.createObjectURL(blob);
          urls.current.add(url);
          setPhotos((previous) => [
            ...previous,
            {
              id: crypto.randomUUID(),
              name: file.name,
              blob,
              url,
              status: "queued",
            },
          ]);
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "사진을 읽지 못했습니다",
          );
        }
      }
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = "";
      if (files.current) files.current.value = "";
    }
  }
  async function analyze(selected: Photo[]) {
    if (busy) return;
    setBusy(true);
    controller.current = new AbortController();
    const signal = controller.current.signal;
    for (const photo of selected) {
      if (signal.aborted) break;
      setPhotos((previous) =>
        previous.map((p) =>
          p.id === photo.id
            ? { ...p, status: "analyzing", error: undefined }
            : p,
        ),
      );
      try {
        const response = await fetch(
          `/api/items/analyze?container_id=${encodeURIComponent(containerId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body: photo.blob,
            signal,
          },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "사진 분석에 실패했습니다");
        if (signal.aborted) break;
        setPhotos((previous) =>
          previous.map((p) =>
            p.id === photo.id
              ? { ...p, status: "ready", items: data.items }
              : p,
          ),
        );
      } catch (error) {
        if (signal.aborted) break;
        setPhotos((previous) =>
          previous.map((p) =>
            p.id === photo.id
              ? {
                  ...p,
                  status: "error",
                  error:
                    error instanceof Error
                      ? error.message
                      : "사진 분석에 실패했습니다",
                }
              : p,
          ),
        );
      }
    }
    if (mounted.current) setBusy(false);
  }
  const queued = photos.filter((p) => p.status === "queued");
  return (
    <section
      className="space-y-4 rounded-lg border bg-card p-4 sm:p-6"
      aria-labelledby="photo-heading"
    >
      <div className="space-y-2">
        <h2 id="photo-heading" className="text-xl font-semibold tracking-tight">
          사진으로 물품 등록
        </h2>
        <p className="text-sm text-muted-foreground">
          사진을 여러 장 찍거나 선택한 뒤, 사진별로 물품을 확인하고 등록하세요.
          최대 {MAX_PHOTOS}장까지 추가할 수 있습니다.
        </p>
        <p className="text-xs text-muted-foreground">
          분석할 사진은 Google Gemini로 전송됩니다. 사진은 보관하지 않으며,
          확인한 물품 정보만 저장합니다. 같은 물품을 여러 번 촬영했다면 중복
          항목을 제외해주세요.
        </p>
      </div>
      {keyError ? (
        <p role="alert" className="text-sm text-destructive">
          {keyError}{" "}
          <Link className="underline" href="/settings">
            설정 확인
          </Link>
        </p>
      ) : keyReady === false ? (
        <p className="text-sm text-muted-foreground">
          <Link className="font-medium text-primary underline" href="/settings">
            설정에서 Gemini 키 등록하기
          </Link>
        </p>
      ) : keyReady === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          AI 설정을 확인하는 중...
        </p>
      ) : null}
      <input
        ref={camera}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        aria-label="사진 촬영"
        onChange={(e) => void addFiles(e.target.files)}
      />
      <input
        ref={files}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        aria-label="여러 사진 선택"
        onChange={(e) => void addFiles(e.target.files)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => camera.current?.click()}
          disabled={busy || !keyReady || photos.length >= MAX_PHOTOS}
        >
          <Camera className="size-4" />
          사진 촬영
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => files.current?.click()}
          disabled={busy || !keyReady || photos.length >= MAX_PHOTOS}
        >
          <ImagePlus className="size-4" />
          사진 선택
        </Button>
        <Button
          type="button"
          onClick={() => void analyze(queued)}
          disabled={busy || !queued.length || !keyReady}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ScanLine className="size-4" />
          )}
          {busy ? "사진 처리 중..." : `${queued.length}장 분석하기`}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        {photos.length > 0
          ? `${photos.filter((p) => p.status === "ready" || p.status === "saved").length}/${photos.length}장 분석 완료 · ${photos.filter((p) => p.status === "saved").length}장 등록 완료`
          : "촬영한 사진을 모아 한 번에 분석할 수 있습니다."}
      </p>
      {photos.map((photo, index) => (
        <article key={photo.id} className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center gap-3">
            <Image
              src={photo.url}
              alt={`${index + 1}번째 등록 사진`}
              width={80}
              height={80}
              unoptimized
              className="size-20 rounded-md object-contain"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-sm font-medium">
                사진 {index + 1} · {photo.name}
              </p>
              <Badge
                variant={photo.status === "saved" ? "default" : "secondary"}
              >
                {
                  {
                    queued: "분석 대기",
                    analyzing: "분석 중",
                    ready: "확인 후 등록",
                    error: "분석 실패",
                    saved: "등록 완료",
                  }[photo.status]
                }
              </Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`사진 ${index + 1} 제외`}
              disabled={
                busy || pendingIds.has(photo.id) || photo.status === "saved"
              }
              onClick={() => {
                URL.revokeObjectURL(photo.url);
                urls.current.delete(photo.url);
                setPhotos((previous) =>
                  previous.filter((p) => p.id !== photo.id),
                );
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          {photo.status === "analyzing" && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              물품을 찾는 중...
            </p>
          )}
          {photo.status === "error" && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                {photo.error}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void analyze([photo])}
              >
                이 사진 다시 분석
              </Button>
            </div>
          )}
          {photo.status === "ready" &&
            (photo.items?.length ? (
              <BulkItemForm
                containerId={containerId}
                title={`사진 ${index + 1}의 물품`}
                initialItems={photo.items}
                existingNames={existingNames}
                onPendingChange={(pending) =>
                  setPendingIds((previous) => {
                    const next = new Set(previous);
                    if (pending) next.add(photo.id);
                    else next.delete(photo.id);
                    return next;
                  })
                }
                onSuccess={() => {
                  setPhotos((previous) =>
                    previous.map((p) =>
                      p.id === photo.id ? { ...p, status: "saved" } : p,
                    ),
                  );
                  router.refresh();
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                찾은 물품이 없습니다. 더 가까이 촬영하거나 아래에서 직접
                입력해주세요.
              </p>
            ))}
          {photo.status === "saved" && (
            <p className="flex items-center gap-2 text-sm text-primary">
              <Check className="size-4" />이 사진의 물품을 등록했습니다.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
