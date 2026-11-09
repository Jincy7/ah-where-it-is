import { z } from 'zod';
import { storageMapDraftSchema } from './map-schema';
const reference = z.string().trim().min(1).max(100);
export const mapRelationSchema = z.discriminatedUnion('relation', [
  z.object({ subject: reference, relation: z.enum(['left_of', 'right_of', 'above', 'below', 'next_to']), target: reference }).strict(),
  z.object({ subject: reference, relation: z.literal('between'), target: reference, other_target: reference, axis: z.enum(['horizontal', 'vertical', 'auto']).optional() }).strict(),
  z.object({ subject: reference, relation: z.enum(['at_left_edge', 'at_right_edge', 'at_top_edge', 'at_bottom_edge', 'center']), target: z.literal('map') }).strict(),
]);
export const storageMapProposalIntentSchema = z.object({ relations: z.array(mapRelationSchema).max(64).optional(), new_location_names: z.array(z.string().trim().min(1).max(100)).max(64).optional(), remove_relations: z.array(z.object({ subject: z.string().trim().min(1).max(100), target: z.string().trim().min(1).max(100) }).strict()).max(64).optional() }).strict();
export const storageMapProposalRequestSchema = storageMapProposalIntentSchema.extend({ draft: storageMapDraftSchema.optional(), previous_relations: z.array(mapRelationSchema).max(128).optional() }).strict();
