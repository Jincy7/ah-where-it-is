import 'server-only';
import { getStorageMap } from './map-service';
import { buildStorageMapProposal } from './map-proposal-layout';
import type { StorageMapProposalRequest } from './map-proposal-types';
/** Proposal generation only reads current records. Save still requires the existing confirmation action. */
export async function proposeStorageMap(request: StorageMapProposalRequest) {
  return buildStorageMapProposal(await getStorageMap(), request);
}
