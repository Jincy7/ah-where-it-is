'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { Tables } from '@/types/supabase'

type Location = Tables<'locations'>

const locationSchema = z.object({
  name: z.string().min(1, '이름을 입력해주세요'),
  description: z.string().optional(),
})

type LocationFormValues = z.infer<typeof locationSchema>

interface LocationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  location: Location | null
  onSuccess: (location: Location) => void
}

export function LocationDialog({
  open,
  onOpenChange,
  location,
  onSuccess,
}: LocationDialogProps) {
  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  })

  // Pre-populate form in edit mode
  useEffect(() => {
    if (location) {
      form.reset({
        name: location.name,
        description: location.description || '',
      })
    } else {
      form.reset({
        name: '',
        description: '',
      })
    }
  }, [location, form])

  const onSubmit = async (values: LocationFormValues) => {
    try {
      const url = location
        ? `/api/locations/${location.id}`
        : '/api/locations'
      const method = location ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      })

      if (!response.ok) {
        throw new Error('Failed to save location')
      }

      const savedLocation = await response.json()

      toast.success(
        location ? '위치가 수정되었습니다' : '위치가 추가되었습니다'
      )

      onSuccess(savedLocation)
      form.reset()
    } catch (error) {
      console.error('Error saving location:', error)
      toast.error(
        location ? '위치 수정에 실패했습니다' : '위치 추가에 실패했습니다'
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {location ? '위치 수정' : '새 위치 추가'}
          </DialogTitle>
          <DialogDescription>
            {location
              ? '위치 정보를 수정합니다'
              : '새로운 위치를 추가합니다'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이름 *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="예: 거실 선반"
                      {...field}
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
                    <Textarea
                      placeholder="위치에 대한 추가 설명 (선택사항)"
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? '저장 중...'
                  : location
                    ? '수정'
                    : '추가'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
