'use client'

import { Archive, MapPin, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { QrCodeButton } from '@/components/containers/qr-code-button'
import { BulkQrCodeButton } from '@/components/containers/bulk-qr-code-button'
import type { WorkspaceContainer, WorkspaceData, WorkspaceItem } from '@/lib/storage/types'
import { ResultsCard } from './results-card'

export function ManagementDialog({ open, onOpenChange, data, selectedId, locked, refreshing, onSelect, onNewContainer, onEditContainer, onDeleteContainer, onLocations, onDirectRegister, onSearch, onRefresh, onEditItem, onMoveItem, onDeleteItem }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: WorkspaceData
  selectedId: string | null
  locked: boolean
  refreshing: boolean
  onSelect: (container: WorkspaceContainer | null) => void
  onNewContainer: () => void
  onEditContainer: (container: WorkspaceContainer) => void
  onDeleteContainer: (container: WorkspaceContainer) => void
  onLocations: () => void
  onDirectRegister: () => void
  onSearch: () => void
  onRefresh: () => void
  onEditItem: (item: WorkspaceItem) => void
  onMoveItem: (item: WorkspaceItem) => void
  onDeleteItem: (item: WorkspaceItem) => void
}) {
  const selected = data.containers.find(container => container.id === selectedId)
  const items = data.items.filter(item => !selected || item.container_id === selected.id)
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>보관함 관리</DialogTitle><DialogDescription>보관함과 물품을 직접 관리할 수 있어요.</DialogDescription></DialogHeader>
    <div className="flex flex-wrap gap-2"><Button disabled={locked} onClick={onNewContainer}><Plus className="size-4" />새 보관함</Button><Button variant="outline" disabled={locked} onClick={onDirectRegister}><Plus className="size-4" />직접 등록</Button><Button variant="outline" onClick={onSearch}><Search className="size-4" />검색</Button><Button variant="ghost" size="icon" aria-label="기록 새로고침" disabled={refreshing} onClick={onRefresh}><RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} /></Button></div>
    <div className="space-y-1"><Button variant={!selected ? 'secondary' : 'ghost'} className="h-11 w-full justify-between" onClick={() => onSelect(null)}><span>전체 보관함</span><Badge variant="outline">{data.containers.length}개</Badge></Button>{data.containers.map(container => <div key={container.id} className="flex items-center gap-1"><Button variant={selectedId === container.id ? 'secondary' : 'ghost'} className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-2" onClick={() => onSelect(container)}><Archive className="size-4 shrink-0" /><span className="truncate">{container.name}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{container.location_name || '장소 미지정'} · {container.item_count}종</span></Button><Button variant="ghost" size="icon" aria-label={`${container.name} 수정`} disabled={locked} onClick={() => onEditContainer(container)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" aria-label={`${container.name} 삭제`} disabled={locked} onClick={() => onDeleteContainer(container)}><Trash2 className="size-4" /></Button></div>)}{!data.containers.length && <p className="py-4 text-center text-sm text-muted-foreground">아직 보관함이 없어요. 첫 보관함을 만들어보세요.</p>}</div>
    <div className="flex flex-wrap gap-2 border-t pt-3"><Button variant="outline" onClick={onLocations}><MapPin className="size-4" />장소 관리</Button>{selected && <QrCodeButton containerId={selected.id} containerName={selected.name} />}<BulkQrCodeButton /></div>
    <ResultsCard title={selected ? `${selected.name}의 물품` : '전체 물품'} items={items} locked={locked} onEdit={onEditItem} onMove={onMoveItem} onDelete={onDeleteItem} />{data.truncated && <p className="text-xs text-muted-foreground">일부 기록만 표시합니다. 검색으로 원하는 물품을 찾아주세요.</p>}
  </DialogContent></Dialog>
}
