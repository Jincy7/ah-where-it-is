"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import { Separator } from "../ui/separator";

const itemRowSchema = z.object({
  name: z.string().min(1, "물품명을 입력해주세요"),
  quantity: z.coerce.number().min(1, "수량은 1개 이상이어야 합니다"),
  description: z.string().optional(),
});

const bulkItemSchema = z.object({
  items: z.array(itemRowSchema).min(1, "최소 1개 이상의 물품을 입력해주세요"),
});

type BulkItemFormValues = z.infer<typeof bulkItemSchema>;

interface BulkItemFormProps {
  containerId: string;
  onSuccess?: () => void;
}

export function BulkItemForm({ containerId, onSuccess }: BulkItemFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<BulkItemFormValues>({
    resolver: zodResolver(bulkItemSchema),
    defaultValues: {
      items: [{ name: "", quantity: 1, description: "" }],
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

      const response = await fetch("/api/items/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          container_id: containerId,
          items: values.items,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "물품 등록에 실패했습니다");
      }

      const data = await response.json();

      toast.success(`${data.count}개의 물품이 등록되었습니다`);
      form.reset();

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Error submitting bulk items:", error);
      toast.error(
        error instanceof Error ? error.message : "물품 등록에 실패했습니다"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalQuantity = fields.reduce((sum, _, index) => {
    const quantity = form.watch(`items.${index}.quantity`);
    return sum + (Number(quantity) || 0);
  }, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>물품 일괄 등록</CardTitle>
        <CardDescription>
          여러 물품을 한번에 입력하고 등록하세요
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                                placeholder="예: 겨울 코트"
                                {...field}
                                disabled={isSubmitting}
                              />
                            </FormControl>
                            <FormMessage />
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
                                type="number"
                                min={1}
                                placeholder="1"
                                {...field}
                                disabled={isSubmitting}
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
                              placeholder="예: 검정색, M사이즈"
                              {...field}
                              disabled={isSubmitting}
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
                      disabled={isSubmitting || fields.length === 1}
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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
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
