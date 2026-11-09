'use client'

import { useId } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { MapAnchor, MapRegion } from '@/lib/storage/map-types'
import { regionBounds, type Rectangle } from './editor-state'

export type SceneRegion = MapRegion & { location_name?: string }
export type SceneContainer = { id: string; name: string }
export const regionColors: Record<string, string> = {
  green: 'fill-primary/15 stroke-primary/60', yellow: 'fill-secondary/65 stroke-foreground/30',
  blue: 'fill-accent stroke-primary/50', purple: 'fill-muted stroke-foreground/50',
  pink: 'fill-secondary/35 stroke-foreground/40', neutral: 'fill-muted stroke-muted-foreground/50',
}
export interface StorageMapSceneProps {
  columns: number
  rows: number
  regions: SceneRegion[]
  anchors: MapAnchor[]
  containers?: SceneContainer[]
  highlightRegionIds?: string[]
  highlightContainerIds?: string[]
  selectedRegionId?: string | null
  selection?: Rectangle | null
  invalidSelection?: boolean
  showGrid?: boolean
  compact?: boolean
  className?: string
  onRegionSelect?: (id: string) => void
  onAnchorSelect?: (ids: string[]) => void
  onPointerDown?: (event: PointerEvent<SVGSVGElement>) => void
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void
  onPointerUp?: (event: PointerEvent<SVGSVGElement>) => void
  onPointerCancel?: (event: PointerEvent<SVGSVGElement>) => void
  children?: ReactNode
}
/** Both the editor and chat use this renderer: viewBox scales pixels, never stored coordinates. */
export function StorageMapScene({ columns, rows, regions, anchors, containers = [], highlightRegionIds = [], highlightContainerIds = [], selectedRegionId, selection, invalidSelection, showGrid = false, compact = false, className, onRegionSelect, onAnchorSelect, children, ...pointerEvents }: StorageMapSceneProps) {
  const gridId = useId().replaceAll(':', '')
  const hasHighlight = highlightRegionIds.length > 0 || highlightContainerIds.length > 0
  const grouped = new Map<string, MapAnchor[]>()
  for (const anchor of anchors) {
    const key = `${anchor.col},${anchor.row}`
    grouped.set(key, [...(grouped.get(key) ?? []), anchor])
  }
  return <svg {...pointerEvents} viewBox={`0 0 ${columns * 40} ${rows * 40}`} className={cn('block w-full rounded-lg border bg-background', className)} role="img" aria-label={`보관 지도 ${columns}열 ${rows}행, ${regions.length}개 구획`}>
    <title>사용자가 배치한 보관 지도</title>
    <desc>빈 칸은 미지정 공간입니다. 표식은 마지막 기록 위치이며 실제 현재 위치를 자동으로 확인하지 않습니다.</desc>
    {showGrid && <><defs><pattern id={gridId} width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" className="stroke-border" strokeWidth="1" /></pattern></defs><rect width="100%" height="100%" fill={`url(#${gridId})`} /></>}
    {regions.map((region, index) => {
      const rect = regionBounds(region.cells)
      const selected = selectedRegionId === region.id || highlightRegionIds.includes(region.id)
      const label = region.location_name || '장소 미지정'
      const short = compact || rect.width < 3 || rect.height < 2
      return <g key={region.id} data-region-id={region.id} className={cn(onRegionSelect && 'cursor-pointer', hasHighlight && !selected && 'opacity-40')} onClick={onRegionSelect ? () => onRegionSelect(region.id) : undefined}>
        <rect x={rect.col * 40 + 2} y={rect.row * 40 + 2} width={Math.max(0, rect.width * 40 - 4)} height={Math.max(0, rect.height * 40 - 4)} rx="6" strokeWidth={selected ? 4 : 1.5} className={cn(regionColors[region.color_key] ?? regionColors.neutral, selected && 'stroke-primary')} />
        <text x={rect.col * 40 + 10} y={rect.row * 40 + 23} fontSize={short ? 15 : 13} className="fill-foreground" fontWeight="600">{short ? index + 1 : label.length > Math.floor(rect.width * 3) ? `${label.slice(0, Math.max(1, Math.floor(rect.width * 3) - 1))}…` : label}</text>
        <title>{`${index + 1}. ${label} · ${rect.width}×${rect.height}칸`}</title>
      </g>
    })}
    {[...grouped].map(([key, group]) => {
      const anchor = group[0]
      const selected = group.some(item => highlightContainerIds.includes(item.container_id))
      return <g key={key} data-container-ids={group.map(item => item.container_id).join(',')} transform={`translate(${anchor.col * 40 + 20} ${anchor.row * 40 + 29})`} onClick={onAnchorSelect ? event => { event.stopPropagation(); onAnchorSelect(group.map(item => item.container_id)) } : undefined} className={cn(onAnchorSelect && 'cursor-pointer', hasHighlight && !selected && !highlightRegionIds.includes(anchor.region_id) && 'opacity-40')}>
        <circle r={selected ? 10 : 8} className={selected ? 'fill-primary stroke-background' : 'fill-foreground stroke-background'} strokeWidth="2" />
        {group.length > 1 && <text textAnchor="middle" dominantBaseline="central" fontSize="10" className="fill-background">{group.length}</text>}
        <title>{`${group.length > 1 ? `보관함 ${group.length}개: ` : ''}${group.map(item => containers.find(container => container.id === item.container_id)?.name ?? '보관함').join(', ')}`}</title>
      </g>
    })}
    {selection && <rect x={selection.col * 40 + 1} y={selection.row * 40 + 1} width={selection.width * 40 - 2} height={selection.height * 40 - 2} className={invalidSelection ? 'fill-destructive/20 stroke-destructive' : 'fill-primary/20 stroke-primary'} strokeWidth="3" strokeDasharray="6 3" pointerEvents="none" />}
    {children}
  </svg>
}
