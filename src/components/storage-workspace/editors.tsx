'use client'

import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Check, ImagePlus, X, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import type { WorkspaceContainer, WorkspaceItem, WorkspaceLocation } from '@/lib/storage/types'
import { storageRequest, type PrepareChange } from './contracts'

const itemSchema = z.object({
  name: z.string().trim().min(1, '물품명을 입력해주세요').max(100),
  quantity: z.coerce.number<string | number>().int('정수로 입력해주세요').min(1, '수량을 확인해주세요').max(9999),
  description: z.string().max(1000),
})
export const itemFormSchema = z.object({ items: z.array(itemSchema).min(1, '물품을 추가해주세요').max(100) })
type ItemValues = z.infer<typeof itemFormSchema>

export function ItemEditor({ item, containerId, prepare, onPrepared }: {
  item?: WorkspaceItem
  containerId: string
  prepare: PrepareChange
  onPrepared: () => void
}) {
  const form = useForm<z.input<typeof itemFormSchema>, unknown, ItemValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { items: [{ name: item?.name ?? '', quantity: item?.quantity ?? 1, description: item?.description ?? '' }] },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const [busy, setBusy] = useState(false)
  async function submit(values: ItemValues) {
    setBusy(true)
    try {
      await prepare(item ? 'update_item' : 'register_items', item
        ? { item_id: item.id, ...values.items[0] }
        : { container_id: containerId, items: values.items },
      item ? { [`items:${item.id}`]: item.version } : undefined)
      onPrepared()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '변경안을 만들지 못했습니다')
    } finally { setBusy(false) }
  }
  return <Form {...form}><form onSubmit={form.handleSubmit(submit)} className="space-y-4">
    {fields.map((row, index) => <div key={row.id} className="space-y-3 rounded-md border p-3">
      {!item && <div className="flex items-center justify-between"><p className="text-sm font-medium">물품 {index + 1}</p><Button type="button" variant="ghost" size="icon" aria-label={`${index + 1}번째 물품 제외`} disabled={busy || fields.length === 1} onClick={() => remove(index)}><Trash2 className="size-4" /></Button></div>}
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
        <FormField control={form.control} name={`items.${index}.name`} render={({ field }) => <FormItem><FormLabel>물품명 *</FormLabel><FormControl><Input {...field} placeholder="예: 검은색 충전기" disabled={busy} /></FormControl><FormMessage /></FormItem>} />
        <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => <FormItem><FormLabel>수량 *</FormLabel><FormControl><Input {...field} type="number" min={1} max={9999} step={1} disabled={busy} /></FormControl><FormMessage /></FormItem>} />
      </div>
      <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => <FormItem><FormLabel>설명</FormLabel><FormControl><Textarea {...field} placeholder="예: USB-C, 65W" disabled={busy} /></FormControl><FormMessage /></FormItem>} />
    </div>)}
    {!item && <Button type="button" variant="outline" disabled={busy || fields.length >= 100} onClick={() => append({ name: '', quantity: 1, description: '' })}><Plus className="size-4" />물품 추가</Button>}
    <Button type="submit" disabled={busy} className="w-full">{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{item ? '변경 내용 확인' : `${fields.length}종 등록 내용 확인`}</Button>
  </form></Form>
}

export function ContainerEditor({ container, locations, prepare, onPrepared }: {
  container?: WorkspaceContainer
  locations: WorkspaceLocation[]
  prepare: PrepareChange
  onPrepared: () => void
}) {
  const [name, setName] = useState(container?.name ?? '')
  const [location, setLocation] = useState(container?.location_id ?? '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mediaId, setMediaId] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => { request.current?.abort(); request.current = null }, [])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    try {
      let cover = mediaId
      if (photo && !cover) {
        const result = await storageRequest<{ media: { id: string } }>('/api/storage/media', { method: 'POST', headers: { 'Content-Type': photo.type }, body: photo, signal: controller.signal })
        if (controller.signal.aborted) return
        cover = result.media.id
        setMediaId(cover)
      }
      const payload: Record<string, unknown> = { name: name.trim(), location_id: location || null }
      if (container) payload.container_id = container.id
      if (cover || removePhoto) payload.cover_media_id = removePhoto ? null : cover
      await prepare(container ? 'update_container' : 'create_container', payload, container ? { [`containers:${container.id}`]: container.version } : undefined)
      if (!controller.signal.aborted) onPrepared()
    } catch (error) {
      if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : '변경안을 만들지 못했습니다')
    } finally { if (request.current === controller) { request.current = null; setBusy(false) } }
  }
  return <form onSubmit={submit} className="space-y-4">
    <div className="space-y-2"><Label htmlFor="container-name">보관함 이름 *</Label><Input id="container-name" value={name} onChange={e => setName(e.target.value)} placeholder="예: 책상 서랍" maxLength={100} required disabled={busy} /></div>
    <div className="space-y-2"><Label htmlFor="container-location">장소</Label><select id="container-location" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={location} onChange={e => setLocation(e.target.value)} disabled={busy}><option value="">장소 미지정</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="container-photo" className="flex items-center gap-2"><ImagePlus className="size-4" />대표 사진</Label><Input id="container-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { setPhoto(e.target.files?.[0] ?? null); setMediaId(null); setRemovePhoto(false) }} /><p className="text-xs text-muted-foreground">나만 볼 수 있는 사진으로 보관합니다. 2MB 이하의 JPG, PNG, WebP를 선택해주세요.</p>{(container?.internal_photo_url || container?.cover_media_id || photo) && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setPhoto(null); setMediaId(null); setRemovePhoto(true) }}><X className="size-4" />{removePhoto ? '사진 제외됨' : '대표 사진 제외'}</Button>}</div>
    <Button type="submit" disabled={busy || !name.trim()} className="w-full">{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}변경 내용 확인</Button>
  </form>
}

export function LocationEditor({ location, prepare, onPrepared }: { location?: WorkspaceLocation; prepare: PrepareChange; onPrepared: () => void }) {
  const [name, setName] = useState(location?.name ?? '')
  const [description, setDescription] = useState(location?.description ?? '')
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await prepare(location ? 'update_location' : 'create_location', { ...(location ? { location_id: location.id } : {}), name: name.trim(), description }, location ? { [`locations:${location.id}`]: location.version } : undefined)
      onPrepared()
    } catch (error) { toast.error(error instanceof Error ? error.message : '변경안을 만들지 못했습니다') }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="space-y-4">
    <div className="space-y-2"><Label htmlFor="location-name">장소 이름 *</Label><Input id="location-name" value={name} onChange={e => setName(e.target.value)} placeholder="예: 작업방" maxLength={100} required disabled={busy} /></div>
    <div className="space-y-2"><Label htmlFor="location-description">설명</Label><Textarea id="location-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="예: 2층 오른쪽 방" maxLength={1000} disabled={busy} /></div>
    <Button type="submit" disabled={busy || !name.trim()} className="w-full">{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}변경 내용 확인</Button>
  </form>
}

export function MoveEditor({ item, containers, prepare, onPrepared }: { item: WorkspaceItem; containers: WorkspaceContainer[]; prepare: PrepareChange; onPrepared: () => void }) {
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await prepare('move_item', { item_id: item.id, container_id: target }, { [`items:${item.id}`]: item.version })
      onPrepared()
    } catch (error) { toast.error(error instanceof Error ? error.message : '변경안을 만들지 못했습니다') }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm">{item.name} · {item.quantity}개</p><p className="text-sm text-muted-foreground">현재 기록: {item.location_name || '장소 미지정'} → {item.container_name}</p>
    <div className="space-y-2"><Label htmlFor="move-target">이동할 보관함 *</Label><select id="move-target" className="h-11 w-full rounded-md border bg-background px-3 text-sm" required disabled={busy} value={target} onChange={e => setTarget(e.target.value)}><option value="">보관함 선택</option>{containers.filter(c => c.id !== item.container_id).map(c => <option key={c.id} value={c.id}>{c.location_name || '장소 미지정'} → {c.name}</option>)}</select></div>
    <p className="text-xs text-muted-foreground">전체 수량을 함께 이동합니다.</p>
    <Button type="submit" disabled={busy || !target} className="w-full">{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}이동 내용 확인</Button>
  </form>
}
