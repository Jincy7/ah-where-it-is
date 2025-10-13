'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Location } from '@/lib/db'

const locationSchema = z.object({
  name: z
    .string()
    .min(1, '위치 이름을 입력해주세요')
    .max(50, '위치 이름은 50자 이하여야 합니다'),
})

type LocationFormValues = z.infer<typeof locationSchema>

interface AddLocationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLocationAdded: (location: Location) => void
}

export function AddLocationDialog({
  open,
  onOpenChange,
  onLocationAdded,
}: AddLocationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: '',
    },
  })

  async function onSubmit(values: LocationFormValues) {
    try {
      setIsSubmitting(true)

      const response = await fetch('/api/locations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '위치 생성에 실패했습니다')
      }

      const newLocation: Location = await response.json()

      toast.success('위치가 추가되었습니다')
      onLocationAdded(newLocation)
      form.reset()
      onOpenChange(false)
    } catch (error) {
      console.error('Error creating location:', error)
      toast.error(
        error instanceof Error ? error.message : '위치 생성에 실패했습니다'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open && !isSubmitting) {
      form.reset()
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>새 위치 추가</DialogTitle>
          <DialogDescription>
            보관함을 배치할 새로운 위치를 추가하세요
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>위치 이름 *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="예: 거실, 안방, 주방"
                      {...field}
                      disabled={isSubmitting}
                      autoFocus
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
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                취소
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                추가
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
