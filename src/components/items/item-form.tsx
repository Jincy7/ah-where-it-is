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
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import type { Item } from '@/lib/db'
import { OptimisticItem } from './item-list'

const itemSchema = z.object({
  name: z.string().min(1, '물품명을 입력해주세요'),
  description: z.string().optional(),
})

type ItemFormValues = z.infer<typeof itemSchema>

interface ItemFormProps {
  containerId: string
  defaultValues?: Item
  itemId?: string
  mode?: 'create' | 'edit'
  onSuccess?: (item: OptimisticItem) => void
  onCancel?: () => void
}

export function ItemForm({
  containerId,
  defaultValues,
  itemId,
  mode = 'create',
  onSuccess,
  onCancel,
}: ItemFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: defaultValues?.name || '',
      description: defaultValues?.description || '',
    },
  })

  async function onSubmit(values: ItemFormValues) {
    try {
      setIsSubmitting(true)

      const url =
        mode === 'create'
          ? '/api/items'
          : `/api/items/${itemId}`

      const response = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...values,
          container_id: containerId,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '물품 저장에 실패했습니다')
      }

      const data = await response.json()

      toast.success(
        mode === 'create' ? '물품이 추가되었습니다' : '물품이 수정되었습니다'
      )

      if (mode === 'create') {
        form.reset()
        if (onSuccess) {
          onSuccess({
            ...data,
            optimistic: true,
          })
        }
      } else {
        if (onSuccess) {
          onSuccess(data)
        }
      }
    } catch (error) {
      console.error('Error saving item:', error)
      toast.error(
        error instanceof Error ? error.message : '물품 저장에 실패했습니다'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="flex justify-end gap-2">
          {mode === 'edit' && onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              취소
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? (
              <>
                <Plus className="mr-2 h-4 w-4" />
                추가
              </>
            ) : (
              '저장'
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}
