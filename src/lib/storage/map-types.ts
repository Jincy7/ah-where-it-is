export type MapCell = { col: number; row: number };
export type MapColorKey = 'green' | 'yellow' | 'blue' | 'purple' | 'pink' | 'neutral';
export type MapRegion = { id: string; location_id: string | null; client_location_key: string | null; color_key: MapColorKey; cells: MapCell[] };
export type MapAnchor = MapCell & { container_id: string; region_id: string };
export type MapNewLocation = { client_location_key: string; name: string; description?: string };
export type StorageMapDraft = {
  base_map_revision: number | null; map_draft_id: string; draft_revision: number;
  name: string; columns: number; rows: number; regions: MapRegion[];
  new_locations: MapNewLocation[]; anchors: MapAnchor[];
};
export type MapMetadata = { id: string; name: string; columns: number; rows: number; revision: number; schema_version: number; updated_at: string };
export type MapContainer = { id: string; name: string; location_id: string | null; version: number; item_count: number };
export type MapLocation = { id: string; name: string; version: number; container_count: number; item_count: number };
export type StorageMapTarget = { kind: 'item' | 'container' | 'location'; id: string };
export type MapResolution = {
  target: StorageMapTarget; status: 'found' | 'deleted';
  item?: { id: string; name: string; quantity: number; version: number; container_id: string };
  container?: MapContainer; location?: { id: string; name: string; version: number };
  region_id: string | null; anchor: MapAnchor | null;
  placement: 'placed' | 'no_location' | 'unmapped_location' | 'unplaced' | 'deleted';
  versions: Record<string, number>;
};
export type StorageMapSceneData = {
  map: MapMetadata | null;
  regions: (MapRegion & { location_name: string })[];
  anchors: MapAnchor[]; locations: MapLocation[]; containers: MapContainer[];
  evidence_at: string; truncated: boolean; resolution: MapResolution | null;
};
export type StorageMapView = {
  kind: 'storage_map'; map_id: string | null; target?: StorageMapTarget;
  highlight_item_ids: string[]; created_map_revision: number | null;
  evidence_at: string; evidence_versions: Record<string, number>;
  scene?: StorageMapSceneData;
};
export function createStorageMapView(scene: StorageMapSceneData, target?: StorageMapTarget): StorageMapView {
  return { kind: 'storage_map', map_id: scene.map?.id ?? null, ...(target ? { target } : {}), highlight_item_ids: target?.kind === 'item' ? [target.id] : [], created_map_revision: scene.map?.revision ?? null, evidence_at: scene.evidence_at, evidence_versions: scene.resolution?.versions ?? {}, scene };
}
