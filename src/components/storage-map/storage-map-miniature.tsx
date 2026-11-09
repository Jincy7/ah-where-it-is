'use client'

import { useState } from 'react'
import { Expand } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StorageMapScene, type StorageMapSceneProps } from './storage-map-scene'

export function mapMiniatureSize(columns: number, rows: number, small = false) {
  const scale = Math.min((small ? 144 : 240) / columns, (small ? 96 : 160) / rows)
  return { width: columns * scale, height: rows * scale }
}

type Props = Pick<StorageMapSceneProps, 'columns' | 'rows' | 'regions' | 'anchors' | 'containers' | 'highlightRegionIds' | 'highlightContainerIds' | 'sceneLabel' | 'sceneDescription'> & {
  title?: string
  interactive?: boolean
  onExpand?: () => void
  small?: boolean
}

/** Chat thumbnails only scale the shared scene; expanded approvals retain the same frozen data. */
export function StorageMapMiniature({ title = '보관 지도', interactive = true, onExpand, small = false, ...scene }: Props) {
  const [expanded, setExpanded] = useState(false)
  const size = mapMiniatureSize(scene.columns, scene.rows, small)
  const miniature = <div style={{ width: size.width, maxWidth: '100%' }}><StorageMapScene {...scene} compact className="max-h-40" /></div>
  if (!interactive) return <div data-map-miniature="static" className="max-w-full">{miniature}</div>
  return <>
    <button type="button" data-map-miniature="expandable" className="group relative flex min-h-11 min-w-11 max-w-full cursor-zoom-in items-center justify-center rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" aria-label={`${title} 크게 보기`} onClick={() => onExpand ? onExpand() : setExpanded(true)}>
      {miniature}<span aria-hidden="true" className="absolute bottom-1 right-1 rounded bg-background/90 p-1 text-muted-foreground group-hover:text-foreground"><Expand className="size-3" /></span>
    </button>
    {!onExpand && <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{scene.sceneDescription ?? '구획과 보관함 표식을 크게 확인하세요. 지도 선택으로 보관 기록은 변경되지 않습니다.'}</DialogDescription></DialogHeader>
      <div className="overflow-auto"><div className="min-w-[400px]"><StorageMapScene {...scene} /></div></div>
      <ul className="grid gap-2 text-sm sm:grid-cols-2" aria-label="확대한 지도 장소 목록">{scene.regions.map((region, index) => <li key={region.id}>{index + 1}. {region.location_name ?? '장소 미지정'}</li>)}</ul>
    </DialogContent></Dialog>}
  </>
}
