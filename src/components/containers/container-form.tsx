'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, X, Image as ImageIcon } from 'lucide-react'
import Image from 'next/image'
import type { Container, Location } from '@/lib/db'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const containerSchema = z.object({
  name: z.string().min(1, '보관함 이름을 입력해주세요'),
  location_id: z.string().optional(),
  photo: z
    .instanceof(File)
    .refine((file) => file.size <= MAX_FILE_SIZE, '파일 크기는 10MB 이하여야 합니다')
    .refine(
      (file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
      '지원되는 이미지 형식: JPEG, PNG, WebP'
    )
    .optional(),
})

type ContainerFormValues = z.infer<typeof containerSchema>

interface ContainerFormProps {
  mode: 'create' | 'edit'
  defaultValues?: Container
  containerId?: string
  locations: Location[]
}

export function ContainerForm({
  mode,
  defaultValues,
  containerId,
  locations,
}: ContainerFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    defaultValues?.internal_photo_url || null
  )
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false)

  const form = useForm<ContainerFormValues>({
    resolver: zodResolver(containerSchema),
    defaultValues: {
      name: defaultValues?.name || '',
      location_id: defaultValues?.location_id || undefined,
    },
  })

  const photoFile = form.watch('photo')

  // Update preview when file changes
  useEffect(() => {
    if (photoFile) {
      const url = URL.createObjectURL(photoFile)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [photoFile])

  async function onSubmit(values: ContainerFormValues) {
    try {
      setIsSubmitting(true)

      const formData = new FormData()
      formData.append('name', values.name)
      if (values.location_id) {
        formData.append('location_id', values.location_id)
      }
      if (values.photo) {
        formData.append('photo', values.photo)
      }
      if (mode === 'edit' && removeExistingPhoto) {
        formData.append('remove_photo', 'true')
      }

      const url =
        mode === 'create'
          ? '/api/containers'
          : `/api/containers/${containerId}`

      const response = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '보관함 저장에 실패했습니다')
      }

      await response.json()

      toast.success(
        mode === 'create'
          ? '보관함이 생성되었습니다'
          : '보관함이 수정되었습니다'
      )

      if (mode === 'create') {
        router.push('/')
      } else {
        router.push(`/container/${containerId}`)
      }
      router.refresh()
    } catch (error) {
      console.error('Error saving container:', error)
      toast.error(
        error instanceof Error ? error.message : '보관함 저장에 실패했습니다'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleRemovePreview() {
    form.setValue('photo', undefined)
    if (defaultValues?.internal_photo_url) {
      setRemoveExistingPhoto(true)
    }
    setPreviewUrl(null)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Name Field */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>보관함 이름 *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="예: 거실 서랍장"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Location Field */}
            <FormField
              control={form.control}
              name="location_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>위치</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="위치를 선택하세요 (선택사항)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    보관함이 위치한 장소를 선택하세요
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Photo Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle>내부 사진</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="photo"
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              render={({ field: { value, onChange, ...field } }) => (
                <FormItem>
                  <FormLabel>사진 업로드</FormLabel>
                  <FormControl>
                    <div className="space-y-4">
                      {previewUrl ? (
                        <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted">
                          <Image
                            src={previewUrl}
                            alt="Preview"
                            fill
                            className="object-cover"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute right-2 top-2"
                            onClick={handleRemovePreview}
                            disabled={isSubmitting}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label
                          htmlFor="photo-upload"
                          className="flex aspect-video w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-muted-foreground/50"
                        >
                          <div className="flex flex-col items-center justify-center pb-6 pt-5">
                            <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground" />
                            <p className="mb-2 text-sm text-muted-foreground">
                              <span className="font-semibold">클릭해서 업로드</span> 또는 드래그 앤 드롭
                            </p>
                            <p className="text-xs text-muted-foreground">
                              PNG, JPG, WebP (최대 10MB)
                            </p>
                          </div>
                          <Input
                            id="photo-upload"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                onChange(file)
                                setRemoveExistingPhoto(false)
                              }
                            }}
                            disabled={isSubmitting}
                            {...field}
                          />
                        </label>
                      )}
                    </div>
                  </FormControl>
                  <FormDescription>
                    보관함 내부 사진을 업로드하면 물건을 찾기 쉽습니다
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            취소
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? '생성' : '저장'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
