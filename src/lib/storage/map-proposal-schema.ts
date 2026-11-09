import { z } from 'zod';
import { storageMapDraftSchema } from './map-schema';
export const mapRelationSchema = z.object({ subject: z.string().trim().min(1).max(100), relation: z.enum(['left_of', 'right_of', 'above', 'below', 'next_to']), target: z.string().trim().min(1).max(100) }).strict();
export const storageMapProposalIntentSchema = z.object({ relations: z.array(mapRelationSchema).max(64).optional(), new_location_names: z.array(z.string().trim().min(1).max(100)).max(64).optional(), remove_relations: z.array(z.object({ subject: z.string().trim().min(1).max(100), target: z.string().trim().min(1).max(100) }).strict()).max(64).optional() }).strict();
export const storageMapProposalRequestSchema = storageMapProposalIntentSchema.extend({ draft: storageMapDraftSchema.optional(), previous_relations: z.array(mapRelationSchema).max(128).optional() }).strict();
