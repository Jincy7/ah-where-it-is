'use client'

import Image from 'next/image'
import { Map, MapPin, MoreHorizontal, MoveHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { WorkspaceItem } from '@/lib/storage/types'

export function ResultsCard({ items, title = '찾은 기록', emptyMessage = '등록된 기록을 찾지 못했어요. 검색어나 찾기 범위를 바꿔보세요.', locked, onEdit, onMove, onDelete, onShowMap }: {
  items: WorkspaceItem[]
  title?: string
  emptyMessage?: string
  locked: boolean
  onEdit: (item: WorkspaceItem) => void
  onMove: (item: WorkspaceItem) => void
  onDelete: (item: WorkspaceItem) => void
  onShowMap?: (item: WorkspaceItem) => void
}) {
  return <section className="space-y-2" aria-label={title}>
    <p className="text-sm font-medium">{title} <span className="font-normal text-muted-foreground">{items.length}종</span></p>
    {!items.length ? <p className="py-3 text-sm text-muted-foreground">{emptyMessage}</p> : <div className="divide-y rounded-2xl border bg-card">{items.map(item => <article key={item.id} className="flex gap-3 p-3 sm:p-4">
      {item.media?.[0]?.url && <div className="w-14 shrink-0"><Image src={item.media[0].url} alt={`${item.name} 등록 당시 사진`} width={64} height={64} unoptimized className="aspect-square w-full rounded-lg object-contain" /><p className="mt-1 text-[10px] text-muted-foreground">등록 당시 사진</p></div>}
      <div className="min-w-0 flex-1 space-y-1"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-medium">{item.name}</h3><Badge variant="outline">{item.quantity}개</Badge></div>{item.description && <p className="break-words text-sm text-muted-foreground">{item.description}</p>}<p className="flex items-start gap-1 text-xs"><MapPin className="mt-0.5 size-3 shrink-0 text-muted-foreground" /><span>마지막 기록 위치: {item.location_name || '장소 미지정'} → {item.container_name}</span></p>{onShowMap && <Button variant="ghost" size="sm" className="min-h-11 px-1" onClick={() => onShowMap(item)}><Map className="size-3" />지도에서 보기</Button>}<p className="text-[11px] text-muted-foreground">변경 {new Date(item.updated_at).toLocaleString('ko-KR')}{item.match_reason ? ` · ${item.match_reason}` : ''}</p></div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`${item.name} 작업`} disabled={locked}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onEdit(item)}><Pencil className="size-4" />이름·수량 수정</DropdownMenuItem><DropdownMenuItem onSelect={() => onMove(item)}><MoveHorizontal className="size-4" />이동</DropdownMenuItem><DropdownMenuItem onSelect={() => onDelete(item)} className="text-destructive"><Trash2 className="size-4" />삭제</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </article>)}</div>}
  </section>
}
