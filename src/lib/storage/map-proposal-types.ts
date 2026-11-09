import type { StorageMapDraft, StorageMapSceneData } from './map-types';
export type MapRelation = { subject: string; relation: 'left_of' | 'right_of' | 'above' | 'below' | 'next_to'; target: string };
export type StorageMapProposalIntent = { relations?: MapRelation[]; new_location_names?: string[]; remove_relations?: { subject: string; target: string }[] };
export type StorageMapProposalRequest = StorageMapProposalIntent & { draft?: StorageMapDraft; previous_relations?: MapRelation[] };
export type StorageMapProposal = {
  proposal_id: string;
  base: { map_revision: number | null; draft_id: string | null; draft_revision: number | null };
  draft: StorageMapDraft;
  relations: MapRelation[];
  relation_descriptions: string[];
  assumptions: string[];
  recommended_location_keys: string[];
  suggested_anchor_ids: string[];
  source: { location_count: number; container_count: number; unassigned_container_count: number };
  preview: StorageMapSceneData;
};
