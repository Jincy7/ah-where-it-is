'use client'

import { useState } from 'react'
import { Check, CheckCircle2, Loader2, RefreshCw, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel } from '@/components/ui/alert-dialog'
import type { StorageAction, WorkspaceContainer, WorkspaceLocation } from '@/lib/storage/types'

const labels: Record<string, string> = { name: '이름', description: '설명', quantity: '수량', container_id: '보관함', container_name: '보관함', location_id: '장소', location_name: '장소', items: '등록 물품', cover_media_id: '대표 사진', item_count: '물품 수', containers: '포함된 보관함' }
function Summary({ value, containers, locations, type }: { value: Record<string, unknown> | null; containers: WorkspaceContainer[]; locations: WorkspaceLocation[]; type: StorageAction['type'] }) {
  if (!value) return <p className="text-sm text-muted-foreground">없음</p>
  return <dl className="space-y-2 text-sm">{Object.entries(value).filter(([key]) => key in labels && !(key === 'container_id' && 'container_name' in value) && !(key === 'container_name' && type.endsWith('_container'))).map(([key, raw]) => {
    let display = String(raw ?? '없음')
    if (key === 'container_id' || key === 'container_name') {
      const target = containers.find(c => c.id === value.container_id)
      display = target ? `${target.location_name || '장소 미지정'} → ${target.name}` : String(raw || '보관함')
    }
    if (key === 'location_id') display = locations.find(l => l.id === raw)?.name ?? '장소 미지정'
    if (key === 'cover_media_id') display = raw ? '사진 함께 보관' : '사진 없음'
    if (key === 'items' && Array.isArray(raw)) display = raw.map(v => `${v.name} ${v.quantity}개`).join(', ')
    if (key === 'containers' && Array.isArray(raw)) display = raw.map(v => typeof v === 'object' && v !== null && 'name' in v ? String(v.name) : String(v)).join(', ') || '없음'
    return <div key={key} className="grid grid-cols-[5rem_1fr] gap-2"><dt className="text-muted-foreground">{labels[key]}</dt><dd className="break-words">{display}</dd></div>
  })}</dl>
}

export function ActionCard({ action, containers, locations, busy, uncertain, error, interactive = true, onConfirm, onCancel, onRefresh, onReprepare, onDismiss }: {
  action: StorageAction
  containers: WorkspaceContainer[]
  locations: WorkspaceLocation[]
  busy: boolean
  uncertain: boolean
  error: string
  interactive?: boolean
  onConfirm: () => Promise<void>
  onCancel: () => Promise<void>
  onRefresh: () => Promise<void>
  onReprepare: () => Promise<void>
  onDismiss: () => void
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const destructive = action.type.startsWith('delete_')
  const completed = action.status === 'completed'
  if (action.status !== 'prepared' || !interactive) return <section className="space-y-2 rounded-2xl border bg-card px-4 py-3" aria-label={completed ? '변경 완료' : action.status === 'cancelled' ? '변경 취소' : '이전 변경안'}>
    <p className="flex items-center gap-2 text-sm font-medium">{completed ? <CheckCircle2 className="size-4 text-primary" /> : <X className="size-4 text-muted-foreground" />}{action.preview.title} · {completed ? '완료' : action.status === 'cancelled' ? '취소됨' : '이전 변경안'}</p>
    <p className="text-xs text-muted-foreground">{completed ? '저장된 기록에 반영했습니다.' : action.status === 'cancelled' ? '기록을 변경하지 않았습니다.' : '현재 변경안에서 이어서 확인해주세요.'}</p>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-1">내용 보기</summary><div className="mt-2 space-y-3"><Summary value={action.preview.before} containers={containers} locations={locations} type={action.type} />{action.preview.after && <Summary value={action.preview.after} containers={containers} locations={locations} type={action.type} />}</div></details>
  </section>
  return <section className="space-y-4 rounded-2xl border bg-card p-4" aria-labelledby={`action-heading-${action.action_id}`}>
    <div className="flex items-start justify-between gap-3"><div className="space-y-1"><h2 id={`action-heading-${action.action_id}`} className="flex items-center gap-2 text-base font-semibold">{completed ? <CheckCircle2 className="size-5 text-primary" /> : destructive ? <AlertTriangle className="size-5 text-destructive" /> : <Check className="size-5" />}{completed ? '변경 완료' : action.preview.title}</h2><p className="text-xs text-muted-foreground">{completed ? '저장 결과를 확인했습니다.' : '아래 내용을 확인한 뒤 버튼을 눌러 확정하세요.'}</p></div><Badge variant="outline">{`확인 대기 · ${action.revision}차`}</Badge></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">현재 기록</p><Summary value={action.preview.before} containers={containers} locations={locations} type={action.type} /></div><div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">{destructive ? '삭제 후' : '변경 후'}</p><Summary value={action.preview.after} containers={containers} locations={locations} type={action.type} /></div></div>
    {action.preview.affected_items.length > 0 && <div className="space-y-2 rounded-md bg-muted p-3"><p className="text-sm font-medium">{destructive ? '함께 삭제될 물품' : '대상 물품'} {action.preview.affected_items.length}종</p><details><summary className="cursor-pointer text-xs text-muted-foreground">물품 목록 보기</summary><ul className="mt-2 space-y-1 text-sm">{action.preview.affected_items.map(item => <li key={item.id}>{item.name} · {item.quantity}개</li>)}</ul></details></div>}
    {destructive && !completed && <p className="text-sm text-destructive">삭제한 기록은 되돌릴 수 없습니다. 위 영향 범위를 확인해주세요.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {error && !uncertain && action.status === 'prepared' && <Button variant="outline" disabled={busy} onClick={() => void onReprepare()}><RefreshCw className="size-4" />최신 기록으로 변경안 다시 만들기</Button>}
    {uncertain && <p role="status" className="text-sm text-muted-foreground">응답을 받지 못했습니다. 내용은 잠겨 있으며 같은 작업으로 결과 확인·재시도합니다.</p>}
    {action.status === 'prepared' ? <div className="flex flex-wrap gap-2">
      <Button disabled={busy} variant={destructive ? 'destructive' : 'default'} onClick={() => { if (destructive && !uncertain) setDeleteOpen(true); else void onConfirm() }}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{uncertain ? '같은 작업 재시도' : destructive ? '삭제 확인' : (action.type === 'move_item' || action.type === 'move_items') ? '이동 확인' : '저장 확인'}</Button>
      {uncertain ? <Button variant="outline" disabled={busy} onClick={() => void onRefresh()}><RefreshCw className="size-4" />결과 확인</Button> : <Button variant="outline" disabled={busy} onClick={() => void onCancel()}><X className="size-4" />취소</Button>}
    </div> : <Button variant="ghost" onClick={onDismiss}><X className="size-4" />닫기</Button>}
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{action.preview.title}</AlertDialogTitle><AlertDialogDescription>확인한 대상{action.preview.affected_items.length ? `과 포함된 물품 ${action.preview.affected_items.length}종` : ''}의 기록을 삭제합니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>취소</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={async () => { await onConfirm(); setDeleteOpen(false) }}>{busy && <Loader2 className="size-4 animate-spin" />}삭제 확정</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
}
