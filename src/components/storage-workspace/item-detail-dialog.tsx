'use client'

import Image from 'next/image'
import { ExternalLink, Loader2, Map, MapPin, MoveHorizontal, Package, Pencil, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { WorkspaceItem } from '@/lib/storage/types'
import { useItemDetail } from './use-item-detail'

export function ItemDetailDialog({ itemId, refreshKey, locked, onClose, onShowMap, onEdit, onMove }: {
  itemId: string
  refreshKey: number
  locked: boolean
  onClose: () => void
  onShowMap: (item: WorkspaceItem) => void
  onEdit: (item: WorkspaceItem) => void
  onMove: (item: WorkspaceItem) => void
}) {
  const { detail, loading, error, deleted, reload } = useItemDetail(itemId, refreshKey)
  const item = detail?.item
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>물품 상세</DialogTitle><DialogDescription>마지막으로 저장한 물품과 보관 위치를 확인합니다.</DialogDescription></DialogHeader>
    {loading && <p role="status" className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />최신 기록 불러오는 중…</p>}
    {error && <div role="alert" className="space-y-3 rounded-lg border border-dashed p-4"><p className="text-sm">{deleted ? '물품 기록이 삭제되었거나 접근할 수 없습니다.' : error}</p><Button variant="outline" className="min-h-11" onClick={() => void reload()}><RefreshCw className="size-4" />다시 조회</Button></div>}
    {item && <>
      <div className="space-y-2"><div className="flex flex-wrap items-start gap-2"><h2 className="min-w-0 break-words text-xl font-semibold">{item.name}</h2><Badge variant="outline" className="mt-1 shrink-0">{item.quantity}개</Badge></div><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.description || '등록한 설명이 없습니다.'}</p></div>
      <div className="space-y-2 rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">마지막 기록 위치</p><p className="flex items-start gap-2 break-words text-sm font-medium"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" /><span>{item.location_name || '장소 미지정'} → {item.container_name}</span></p><Button variant="outline" className="min-h-11" onClick={() => onShowMap(item)}><Map className="size-4" />지도에서 보기</Button></div>
      <section className="space-y-3" aria-label="등록 당시 사진"><div><h3 className="text-sm font-medium">등록 당시 사진</h3><p className="mt-1 text-xs text-muted-foreground">사진 등록 시점의 모습이며, 현재 보관 위치와 다를 수 있어요.</p></div>{item.media.length ? item.media.map((media, index) => <figure key={media.id} className="space-y-2">{media.url ? <a href={media.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label={`${item.name} 사진 ${index + 1} 원본 보기`}><Image src={media.url} alt={`${item.name} 등록 당시 사진 ${index + 1}`} width={960} height={720} unoptimized className="max-h-80 w-full rounded-lg object-contain" /></a> : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">사진을 불러올 수 없습니다.</p>}<figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>사진 등록 {new Date(media.created_at).toLocaleString('ko-KR')}</span>{media.url && <a href={media.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 underline underline-offset-4">원본 보기<ExternalLink className="size-3" /></a>}</figcaption></figure>) : <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Package className="size-4" />등록한 사진이 없습니다.</p>}</section>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground"><dt>물품 등록</dt><dd>{new Date(item.created_at).toLocaleString('ko-KR')}</dd><dt>마지막 변경</dt><dd>{new Date(item.updated_at).toLocaleString('ko-KR')}</dd><dt>기록 조회</dt><dd>{new Date(detail.checked_at).toLocaleString('ko-KR')}</dd></dl>
      <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" disabled={locked} onClick={() => onEdit(item)}><Pencil className="size-4" />이름·수량 수정</Button><Button variant="outline" className="min-h-11" disabled={locked} onClick={() => onMove(item)}><MoveHorizontal className="size-4" />이동</Button><Button variant="ghost" className="min-h-11" onClick={() => void reload()}><RefreshCw className="size-4" />새로고침</Button></div>
    </>}
  </DialogContent></Dialog>
}
