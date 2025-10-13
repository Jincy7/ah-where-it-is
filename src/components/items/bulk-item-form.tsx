'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Plus, X, Package } from 'lucide-react'

const itemSchema = z.object({
  name: z.string().min(1, '물품명을 입력해주세요'),
  quantity: z.coerce.number().min(1, '수량은 1개 이상이어야 합니다'),
  description: z.string().optional(),
})

type ItemFormValues = z.infer<typeof itemSchema>

interface TemporaryItem extends ItemFormValues {
  id: string
}

interface BulkItemFormProps {
  containerId: string
  onSuccess?: () => void
}

export function BulkItemForm({ containerId, onSuccess }: BulkItemFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [temporaryItems, setTemporaryItems] = useState<TemporaryItem[]>([])

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: '',
      quantity: 1,
      description: '',
    },
  })

  function handleAddToList(values: ItemFormValues) {
    const newItem: TemporaryItem = {
      ...values,
      id: crypto.randomUUID(),
    }
    setTemporaryItems((prev) => [...prev, newItem])
    form.reset()
    toast.success('목록에 추가되었습니다')
  }

  function handleRemoveItem(id: string) {
    setTemporaryItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function handleSubmitAll() {
    if (temporaryItems.length === 0) {
      toast.error('추가할 물품이 없습니다')
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch('/api/items/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          container_id: containerId,
          items: temporaryItems.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            description: item.description || undefined,
          })),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '물품 등록에 실패했습니다')
      }

      const data = await response.json()

      toast.success(`${data.count}개의 물품이 등록되었습니다`)
      setTemporaryItems([])
      form.reset()

      if (onSuccess) {
        onSuccess()
      }
    } catch (error) {
      console.error('Error submitting bulk items:', error)
      toast.error(
        error instanceof Error ? error.message : '물품 등록에 실패했습니다'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const totalQuantity = temporaryItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  )

  return (
    <div className="space-y-6">
      {/* Add Item Form */}
      <Card>
        <CardHeader>
          <CardTitle>물품 정보 입력</CardTitle>
          <CardDescription>
            물품 정보를 입력하고 목록에 추가하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleAddToList)}
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>물품명 *</FormLabel>
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

                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>수량 *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="1"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>설명</FormLabel>
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

              <div className="flex justify-end">
                <Button type="submit" variant="outline" disabled={isSubmitting}>
                  <Plus className="mr-2 h-4 w-4" />
                  목록에 추가
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Temporary Items List */}
      {temporaryItems.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>등록 대기 목록</CardTitle>
                <CardDescription>
                  {temporaryItems.length}개 항목, 총 {totalQuantity}개 물품
                </CardDescription>
              </div>
              <Button
                onClick={handleSubmitAll}
                disabled={isSubmitting}
                size="lg"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <Package className="mr-2 h-4 w-4" />
                모두 등록
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {temporaryItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-4"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{item.name}</p>
                      <Badge variant="secondary">{item.quantity}개</Badge>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={isSubmitting}
                    title="제거"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {temporaryItems.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">목록이 비어있습니다</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            위의 폼을 사용해서 물품을 목록에 추가하세요
          </p>
        </div>
      )}
    </div>
  )
}
