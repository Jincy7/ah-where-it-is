import type { StorageMapSceneData } from '@/lib/storage/map-types'
import { StorageMapScene } from './storage-map-scene'

/** Approval previews only render the frozen scene inside the hash-bound action. No live lookup. */
export function StorageMapPreview({ value }: { value: Record<string, unknown> | null }) {
  if (!value) return <p className="text-sm text-muted-foreground">저장된 지도 없음</p>
  const scene = value as unknown as Partial<StorageMapSceneData>
  if (!scene.map || !Array.isArray(scene.regions) || !Array.isArray(scene.anchors)) return <p className="text-sm text-muted-foreground">지도 변경 내용 없음</p>
  const newLocations = Array.isArray(value.new_locations) ? value.new_locations as { name: string }[] : []
  const removedAnchors = Array.isArray(value.removed_anchors) ? value.removed_anchors as { container_id: string; container_name?: string }[] : []
  const newlyUnplaced = Array.isArray(value.newly_unplaced_containers) ? value.newly_unplaced_containers as { id: string; name: string }[] : []
  return <div className="space-y-2">
    <p className="text-sm font-medium">{scene.map.name} · {scene.map.columns}×{scene.map.rows}칸</p>
    <StorageMapScene columns={scene.map.columns} rows={scene.map.rows} regions={scene.regions} anchors={scene.anchors} containers={scene.containers} compact sceneLabel="승인용 지도 미리보기" sceneDescription="변경안에 고정된 배치입니다. 추천 표식이 포함될 수 있으며 저장 완료나 실제 현재 위치를 뜻하지 않습니다." />
    <ul className="space-y-1 text-xs">{scene.regions.map((region, index) => <li key={region.id}>{index + 1}. {region.location_name || '장소 미지정'} · {region.cells.length}칸</li>)}</ul>
    <p className="text-xs text-muted-foreground">{scene.regions.length}개 구획 · {scene.anchors.length}개 표식</p>
    {newLocations.length > 0 && <div className="rounded-md bg-muted p-2 text-xs"><p className="font-medium">함께 생성할 장소 {newLocations.length}개</p><ul>{newLocations.map((location, index) => <li key={index}>{location.name}</li>)}</ul></div>}
    {removedAnchors.length > 0 && <div className="space-y-1 rounded-md bg-muted p-2 text-xs"><p className="font-medium">미배치로 바뀌는 보관함 {removedAnchors.length}개</p><ul>{removedAnchors.map(anchor => <li key={anchor.container_id}>{anchor.container_name ?? scene.containers?.find(container => container.id === anchor.container_id)?.name ?? '보관함'}</li>)}</ul><p>지도 표식만 해제하며 장소·보관함·물품 기록은 유지합니다.</p></div>}
    {newlyUnplaced.length > 0 && <div className="space-y-1 rounded-md bg-muted p-2 text-xs"><p className="font-medium">새 구획에서 위치를 지정할 보관함 {newlyUnplaced.length}개</p><ul>{newlyUnplaced.map(container => <li key={container.id}>{container.name}</li>)}</ul><p>보관함 소속은 유지하며 구획 내 표식은 아직 없습니다.</p></div>}
  </div>
}
