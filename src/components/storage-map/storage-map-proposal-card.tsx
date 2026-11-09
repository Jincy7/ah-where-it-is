'use client'

import { useId, useRef, useState } from 'react'
import { Check, Loader2, Map, Pencil, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { StorageMapDraft } from '@/lib/storage/map-types'
import type { StorageMapProposal } from '@/lib/storage/map-proposal-types'
import { StorageMapMiniature } from './storage-map-miniature'

export type MapProposalCardStatus = 'active' | 'superseded' | 'cancelled' | 'prepared' | 'completed'
type ProposalControlInput = {
  status?: MapProposalCardStatus
  interactive?: boolean
  busy?: boolean
  locked?: boolean
  blockedReason?: string
  canEditPrepared?: boolean
}
/** A proposal can only prepare an approval; it never confirms a storage action. */
export function proposalCardControls({ status = 'active', interactive = true, busy = false, locked = false, blockedReason, canEditPrepared = false }: ProposalControlInput) {
  const available = interactive && !busy && !locked
  const active = available && status === 'active'
  return { prepare: active && !blockedReason, edit: active, cancel: active, editPrepared: available && status === 'prepared' && canEditPrepared }
}
export interface StorageMapProposalCardProps {
  proposal: StorageMapProposal
  status?: MapProposalCardStatus
  interactive?: boolean
  busy?: boolean
  locked?: boolean
  blockedReason?: string
  onPrepare: (draft: StorageMapDraft) => Promise<void>
  onEdit: (draft: StorageMapDraft) => void | Promise<void>
  onCancel: () => void
  onEditPrepared?: () => Promise<void>
}
const statusLabels: Record<MapProposalCardStatus, string> = {
  active: '아직 저장되지 않음', superseded: '이전 배치 제안', cancelled: '제안 취소됨', prepared: '변경안 확인 중', completed: '저장 완료',
}

export function StorageMapProposalCard({ proposal, status = 'active', interactive = true, busy = false, locked = false, blockedReason, onPrepare, onEdit, onCancel, onEditPrepared }: StorageMapProposalCardProps) {
  const titleId = useId()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const clickLock = useRef(false)
  const effectiveStatus = !interactive && status === 'active' ? 'superseded' : status
  const controls = proposalCardControls({ status: effectiveStatus, interactive, busy: busy || pending, locked, blockedReason, canEditPrepared: !!onEditPrepared })
  const { draft, preview } = proposal
  const recommendedKeys = new Set(proposal.recommended_location_keys)
  const suggestedIds = new Set(proposal.suggested_anchor_ids)
  const suggestedAnchors = draft.anchors.filter(anchor => suggestedIds.has(anchor.container_id))
  const historical = ['superseded', 'cancelled', 'completed'].includes(effectiveStatus)
  const showControls = interactive && (effectiveStatus === 'active' || effectiveStatus === 'prepared')
  async function run(action: () => void | Promise<void>) {
    if (clickLock.current) return
    clickLock.current = true
    setPending(true)
    setError('')
    try { await action() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '요청을 처리하지 못했습니다. 배치 초안은 유지됩니다.') }
    finally { clickLock.current = false; setPending(false) }
  }
  const proposalPreview = <>
    <div className="space-y-2">
      <p className="break-words text-sm font-medium">{draft.name} <span className="font-normal text-muted-foreground">· {draft.columns}×{draft.rows}칸</span></p>
      <StorageMapMiniature title="배치 제안" interactive={!historical} columns={draft.columns} rows={draft.rows} regions={preview.regions} anchors={draft.anchors} containers={preview.containers} sceneLabel={effectiveStatus === 'completed' ? '저장한 배치 제안의 미리보기' : '아직 저장하지 않은 배치 제안'} sceneDescription={effectiveStatus === 'completed' ? '저장할 때 확인한 배치입니다. 이후 변경한 위치는 최신 지도에서 확인해주세요.' : '구획과 추천 표식은 확인 전 임시 배치입니다. 현재 실물 위치를 확인한 좌표가 아닙니다.'} />
      <p className="text-xs text-muted-foreground">실제 위치를 확인한 그림이 아닙니다. 구획과 표식을 검토해주세요.</p>
      <details><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">장소 {preview.regions.length}개 확인</summary><ul className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto text-sm sm:grid-cols-2" aria-label="제안한 장소" tabIndex={0}>
        {preview.regions.map((region, index) => <li key={region.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="break-words">{index + 1}. {region.location_name}</span>
          <Badge variant="outline" className="text-[11px]">{region.location_id ? '기존 장소' : region.client_location_key && recommendedKeys.has(region.client_location_key) ? '추천 새 장소' : '새 장소'}</Badge>
        </li>)}
      </ul></details>
      {draft.new_locations.length > 0 && <p className="text-xs text-muted-foreground">새 장소 {draft.new_locations.length}개도 최종 저장 확인 전에는 생성되지 않습니다.</p>}
    </div>
    <details className="space-y-3 rounded-lg bg-muted/60 px-3"><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">위치 조건 {proposal.relations.length}개와 추천 정보 확인</summary><div className="space-y-3 pb-3">
      <div className="space-y-1"><p className="text-xs font-medium">제안에 사용한 기록</p><p className="text-xs text-muted-foreground">등록된 장소 {proposal.source.location_count}개 · 보관함 {proposal.source.container_count}개{proposal.source.unassigned_container_count > 0 ? ` · 장소 미지정 ${proposal.source.unassigned_container_count}개` : ''}</p>{proposal.source.location_count === 0 && <p className="text-xs text-muted-foreground">등록된 장소가 없어 시작할 장소를 추천했습니다.</p>}</div>
      <div className="space-y-1"><p className="text-xs font-medium">상대 위치 조건</p>{proposal.relation_descriptions.length ? <ul className="max-h-40 space-y-1 overflow-y-auto text-sm" aria-label="상대 위치 조건 목록" tabIndex={0}>{proposal.relation_descriptions.map((description, index) => <li key={index} className="break-words">{description}</li>)}</ul> : <p className="text-xs text-muted-foreground">지정한 상대 위치 조건이 없습니다. 장소의 왼쪽·오른쪽·위·아래 관계를 대화로 알려주세요.</p>}</div>
      {proposal.assumptions.length > 0 && <details className="space-y-1"><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">배치 가정 {proposal.assumptions.length}개 보기</summary><ul className="max-h-48 space-y-2 overflow-y-auto pb-2 text-xs text-muted-foreground" aria-label="배치 가정 목록" tabIndex={0}>{proposal.assumptions.map((assumption, index) => <li key={index} className="break-words">{assumption}</li>)}</ul></details>}
      {suggestedAnchors.length > 0 && <details className="space-y-1"><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">추천 표식 {suggestedAnchors.length}개 · 확인 전 임시 배치</summary><ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground" aria-label="추천 표식 목록" tabIndex={0}>{suggestedAnchors.map(anchor => <li key={anchor.container_id}>{preview.containers.find(container => container.id === anchor.container_id)?.name ?? '보관함'} · ({anchor.col}, {anchor.row})</li>)}</ul><p className="pb-2 text-xs text-muted-foreground">보관함의 현재 실물 위치를 확인한 좌표가 아닙니다.</p></details>}
    </div></details>
  </>
  return <section data-proposal-id={proposal.proposal_id} className="space-y-4 rounded-2xl border bg-card p-4" aria-labelledby={titleId}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id={titleId} className="flex items-center gap-2 text-sm font-semibold"><Map className="size-4 text-primary" />배치 제안</h3>
      <Badge variant={effectiveStatus === 'active' ? 'secondary' : 'outline'}>{statusLabels[effectiveStatus]}</Badge>
    </div>
    {historical ? <details><summary className="min-h-11 cursor-pointer py-3 text-xs text-muted-foreground">{draft.name} · 이전 배치 펼치기</summary><div className="space-y-3">{proposalPreview}</div></details> : <div className="space-y-3">{proposalPreview}</div>}
    {effectiveStatus === 'superseded' && <p className="text-xs text-muted-foreground">이후 제안 또는 직접 편집으로 바뀐 이전 초안입니다. 현재 배치를 확인해주세요.</p>}
    {effectiveStatus === 'cancelled' && <p className="text-xs text-muted-foreground">제안을 닫았습니다. 지도와 장소 기록은 변경하지 않았습니다.</p>}
    {effectiveStatus === 'prepared' && <p role="status" className="text-sm text-muted-foreground">아래 변경안에서 저장 내용을 확인해주세요. 배치를 다시 수정하려면 먼저 준비한 변경안을 취소해야 합니다.</p>}
    {effectiveStatus === 'active' && blockedReason && <p role="status" className="text-sm text-muted-foreground">{blockedReason} 배치 초안은 유지됩니다.</p>}
    {showControls && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {showControls && <div className="flex flex-wrap gap-2">
      {effectiveStatus === 'active' && <>
        <Button className="min-h-11" disabled={!controls.prepare} onClick={() => { if (controls.prepare) void run(() => onPrepare(draft)) }}>{busy || pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}변경 내용 확인</Button>
        <Button variant="outline" className="min-h-11" disabled={!controls.edit} onClick={() => { if (controls.edit) void run(() => onEdit(draft)) }}><Pencil className="size-4" />직접 편집</Button>
        <Button variant="ghost" className="min-h-11" disabled={!controls.cancel} onClick={() => { if (controls.cancel) onCancel() }}><X className="size-4" />제안 닫기</Button>
      </>}
      {effectiveStatus === 'prepared' && onEditPrepared && <Button variant="outline" className="min-h-11" disabled={!controls.editPrepared} onClick={() => { if (controls.editPrepared) void run(onEditPrepared) }}>{busy || pending ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}변경안 수정</Button>}
    </div>}
  </section>
}
