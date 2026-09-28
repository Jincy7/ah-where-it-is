"use client";

import { useState, useRef } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Package } from "lucide-react";
import type { ItemDraft } from "@/lib/ai/schema";
import { Separator } from "../ui/separator";

const itemRowSchema = z.object({
  name: z.string().trim().min(1, "물품명을 입력해주세요").max(100),
  quantity: z.coerce
    .number()
    .int("수량은 정수로 입력해주세요")
    .min(1, "수량을 확인하고 1 이상 입력해주세요")
    .max(9999),
  description: z.string().max(1000).optional(),
});

const bulkItemSchema = z.object({
  items: z
    .array(itemRowSchema)
    .min(1, "최소 1개 이상의 물품을 입력해주세요")
    .max(100),
});

type BulkItemFormValues = z.infer<typeof bulkItemSchema>;

interface BulkItemFormProps {
  containerId: string;
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
  initialItems?: ItemDraft[];
  existingNames?: string[];
  title?: string;
}

export function BulkItemForm({
  containerId,
  onSuccess,
  onPendingChange,
  initialItems,
  existingNames = [],
  title,
}: BulkItemFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestId = useRef<string | null>(null);
  const [pendingPayload, setPendingPayload] =
    useState<BulkItemFormValues | null>(null);
  const locked = isSubmitting || pendingPayload !== null;

  const form = useForm<BulkItemFormValues>({
    resolver: zodResolver(bulkItemSchema),
    defaultValues: {
      items: initialItems?.map((item) => ({
        name: item.name,
        quantity: item.quantity ?? 0,
        description: [item.description, item.uncertainty]
          .filter(Boolean)
          .join(" · "),
      })) ?? [{ name: "", quantity: 1, description: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  function handleAddRow() {
    append({ name: "", quantity: 1, description: "" });
  }

  async function onSubmit(values: BulkItemFormValues) {
    try {
      setIsSubmitting(true);
      requestId.current ??= crypto.randomUUID();
      const payload = pendingPayload ?? values;
      setPendingPayload(payload);
      onPendingChange?.(true);

      const response = await fetch("/api/items/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          container_id: containerId,
          items: payload.items,
          request_id: requestId.current,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 409
        ) {
          setPendingPayload(null);
          onPendingChange?.(false);
        }
        throw new Error(error.error || "물품 등록에 실패했습니다");
      }

      const data = await response.json();

      toast.success(`${data.count}개의 물품이 등록되었습니다`);
      setPendingPayload(null);
      onPendingChange?.(false);
      requestId.current = null;
      form.reset();

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Error submitting bulk items:", error);
      toast.error(
        error instanceof Error ? error.message : "물품 등록에 실패했습니다",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const watchedItems = useWatch({ control: form.control, name: "items" });
  const totalQuantity = watchedItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title ?? "물품 일괄 등록"}</CardTitle>
        <CardDescription>
          {initialItems
            ? "사진 속 물품명과 수량을 확인하고, 중복된 항목은 제외해주세요"
            : "여러 물품을 한번에 입력하고 등록하세요"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
            className="space-y-6"
          >
            {initialItems?.some(
              (item) => item.quantity === null || item.uncertainty,
            ) && (
              <p className="text-sm text-muted-foreground">
                확인이 필요한 항목이 있습니다. 수량이 0으로 표시된 항목은 실제
                수량을 입력해주세요.
              </p>
            )}
            {pendingPayload && !isSubmitting && (
              <p role="alert" className="text-sm text-destructive">
                등록 결과를 확인하지 못했습니다. 아래 등록 버튼을 다시 누르면
                같은 요청을 안전하게 재시도합니다. 입력 내용은 결과 확인까지
                유지됩니다.
              </p>
            )}
            {/* Multi-row input */}
            <div className="space-y-3">
              {/* Header Row - Desktop Only */}
              <div className="hidden grid-cols-12 gap-2 font-medium text-sm text-muted-foreground md:grid">
                <div className="col-span-4">물품명 *</div>
                <div className="col-span-2">수량 *</div>
                <div className="col-span-5">설명</div>
                <div className="col-span-1"></div>
              </div>

              {/* Input Rows */}
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-12 md:items-start md:gap-2 md:border-0 md:p-0"
                >
                  {/* Mobile: 물품명과 수량 한 줄에 */}
                  <div className="grid grid-cols-3 gap-2 md:col-span-6 md:grid-cols-2 md:gap-2">
                    <div className="col-span-2 md:col-span-1">
                      <FormField
                        control={form.control}
                        name={`items.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="md:hidden">
                              물품명 *
                            </FormLabel>
                            <FormControl>
                              <Input
                                aria-label={`${index + 1}번째 물품명`}
                                placeholder="예: 겨울 코트"
                                {...field}
                                disabled={locked}
                              />
                            </FormControl>
                            <FormMessage />
                            {existingNames.some(
                              (name) =>
                                name.trim().toLocaleLowerCase() ===
                                field.value.trim().toLocaleLowerCase(),
                            ) && (
                              <p className="text-xs text-muted-foreground">
                                같은 이름의 물품이 이미 있습니다. 중복 여부를
                                확인해주세요.
                              </p>
                            )}
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="col-span-1 md:col-span-1">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="md:hidden">수량 *</FormLabel>
                            <FormControl>
                              <Input
                                aria-label={`${index + 1}번째 수량`}
                                type="number"
                                max={9999}
                                step={1}
                                min={1}
                                placeholder="1"
                                {...field}
                                disabled={locked}
                                className="text-center"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="md:col-span-5">
                    <FormField
                      control={form.control}
                      name={`items.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="md:hidden">설명</FormLabel>
                          <FormControl>
                            <Input
                              aria-label={`${index + 1}번째 설명`}
                              placeholder="예: 검정색, M사이즈"
                              {...field}
                              disabled={locked}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end md:col-span-1 md:justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      disabled={locked || fields.length === 1}
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Row Button */}
            <div className="flex justify-center pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleAddRow}
                disabled={locked || fields.length >= 100}
              >
                <Plus className="mr-2 h-4 w-4" />
                물품 추가하기
              </Button>
            </div>

            <Separator className="my-1" />
            <div className="text-sm text-right text-muted-foreground">
              (총 {fields.length}개 항목, {totalQuantity}개 물품)
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset()}
                disabled={locked}
              >
                초기화
              </Button>
              <Button type="submit" disabled={isSubmitting} size="lg">
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <Package className="mr-2 h-4 w-4" />
                {fields.length}개 물품 등록
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
