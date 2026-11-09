'use client'

import Image from 'next/image'
import { ChevronRight, Map, MapPin, MoreHorizontal, MoveHorizontal, Package, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { WorkspaceItem } from '@/lib/storage/types'

export function ResultsCard({ items, title = '찾은 기록', emptyMessage = '등록된 기록을 찾지 못했어요. 검색어나 찾기 범위를 바꿔보세요.', locked, onOpenDetail, onEdit, onMove, onDelete, onShowMap }: {
  items: WorkspaceItem[]
  title?: string
  emptyMessage?: string
  locked: boolean
  onOpenDetail: (item: WorkspaceItem) => void
  onEdit: (item: WorkspaceItem) => void
  onMove: (item: WorkspaceItem) => void
  onDelete: (item: WorkspaceItem) => void
  onShowMap?: (item: WorkspaceItem) => void
}) {
  return <section className="space-y-2" aria-label={title}>
    <p className="text-sm font-medium">{title} <span className="font-normal text-muted-foreground">{items.length}종</span></p>
    {!items.length ? <p className="py-3 text-sm text-muted-foreground">{emptyMessage}</p> : <div className="divide-y overflow-hidden rounded-2xl border bg-card">{items.map(item => <article key={item.id} className="flex items-start">
      <button type="button" onClick={() => onOpenDetail(item)} aria-label={`${item.name} 상세 보기`} className="flex min-h-24 min-w-0 flex-1 items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary sm:p-4">
        <span className="flex w-14 shrink-0 flex-col items-center">{item.media?.[0]?.url ? <><Image src={item.media[0].url} alt="" width={64} height={64} unoptimized className="aspect-square w-full rounded-lg bg-muted/40 object-contain" /><span className="mt-1 text-[10px] text-muted-foreground">등록 당시 사진</span></> : <span className="flex size-14 items-center justify-center rounded-lg bg-muted/60"><Package className="size-5 text-muted-foreground" /></span>}</span>
        <span className="min-w-0 flex-1 space-y-1.5"><span className="flex flex-wrap items-center gap-2"><span className="break-words text-sm font-semibold">{item.name}</span><Badge variant="outline">{item.quantity}개</Badge></span>{item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}<span className="flex items-start gap-1 text-xs"><MapPin className="mt-0.5 size-3 shrink-0 text-muted-foreground" /><span className="break-words"><span className="text-muted-foreground">마지막 기록: </span>{item.location_name || '장소 미지정'} → {item.container_name}</span></span><span className="flex items-center gap-1 text-[11px] text-muted-foreground">상세 보기<ChevronRight className="size-3" /></span></span>
      </button>
      <div className="flex shrink-0 flex-col items-center py-2 pr-1"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-11" aria-label={`${item.name} 작업`} disabled={locked}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onEdit(item)}><Pencil className="size-4" />이름·수량 수정</DropdownMenuItem><DropdownMenuItem onSelect={() => onMove(item)}><MoveHorizontal className="size-4" />이동</DropdownMenuItem><DropdownMenuItem onSelect={() => onDelete(item)} className="text-destructive"><Trash2 className="size-4" />삭제</DropdownMenuItem></DropdownMenuContent></DropdownMenu>{onShowMap && <Button variant="ghost" size="icon" className="size-11" aria-label={`${item.name} 지도에서 보기`} title="지도에서 보기" onClick={() => onShowMap(item)}><Map className="size-4" /></Button>}</div>
    </article>)}</div>}
  </section>
}
