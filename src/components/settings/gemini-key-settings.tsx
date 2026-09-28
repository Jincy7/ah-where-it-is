"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const schema = z.object({
  apiKey: z.string().trim().min(20, "Gemini API 키를 입력해주세요").max(512),
});
export function GeminiKeySettings() {
  const [status, setStatus] = useState<{
    configured: boolean;
    localFallback?: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { apiKey: "" },
  });
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/settings/gemini", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setStatus(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "키 설정을 불러오지 못했습니다",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(values: z.infer<typeof schema>) {
    setBusy(true);
    try {
      const response = await fetch("/api/settings/gemini", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      form.reset();
      setStatus(data);
      toast.success("Gemini 키가 저장되었습니다");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "키 저장에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      const response = await fetch("/api/settings/gemini", {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setStatus(data);
      form.reset();
      toast.success("Gemini 키가 삭제되었습니다");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "키 삭제에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-4 rounded-lg border bg-card p-6"
      aria-labelledby="gemini-heading"
    >
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="size-5" />
        <h2
          id="gemini-heading"
          className="text-xl font-semibold tracking-tight"
        >
          사진 인식 AI
        </h2>
        {status && (
          <Badge variant={status.configured ? "default" : "secondary"}>
            {status.configured
              ? "키 등록됨"
              : status.localFallback
                ? "로컬 테스트 키 사용 중"
                : "키 미등록"}
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Gemini 3.5 Flash-Lite로 사진 속 물품을 찾아줍니다. 내 API 키로 분석하며,
        사용량은 내 Google 계정에 청구됩니다.
      </p>
      {error ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={load}>
            다시 불러오기
          </Button>
        </div>
      ) : !status ? (
        <p role="status" className="text-sm text-muted-foreground">
          설정을 불러오는 중...
        </p>
      ) : null}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(save)} className="max-w-xl space-y-3">
          <FormField
            control={form.control}
            name="apiKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {status?.configured
                    ? "새 Gemini API 키 *"
                    : "Gemini API 키 *"}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Google AI Studio에서 발급한 키"
                    disabled={busy || !status}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <p className="text-xs text-muted-foreground">
            키는 암호화해 저장하며 저장 후 다시 표시하지 않습니다. 사진 분석 시
            선택한 사진이 Google로 전송됩니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !status}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {status?.configured ? "키 변경" : "키 저장"}
            </Button>
            {status?.configured && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" disabled={busy}>
                    <Trash2 className="size-4" />키 삭제
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Gemini 키를 삭제할까요?</AlertDialogTitle>
                    <AlertDialogDescription>
                      저장된 Gemini API 키가 삭제됩니다. 되돌릴 수 없으며, 사진
                      인식을 다시 사용하려면 키를 등록해야 합니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={remove}>삭제</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button variant="ghost" asChild>
              <Link
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
              >
                키 발급하기
              </Link>
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}
