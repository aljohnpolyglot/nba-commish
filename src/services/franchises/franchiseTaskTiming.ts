import type { GameState, OffseasonRowStatus } from '../../types';

export type FranchiseDealsTaskAccess = {
  available: boolean;
  canSkip: boolean;
  blockedLabel: string | null;
};

export function getFranchiseDealsTaskAccess(
  state: GameState,
  status: OffseasonRowStatus = state.offseasonChecklist?.sponsorRenewals ?? 'pending',
): FranchiseDealsTaskAccess {
  return {
    available: true,
    canSkip: status === 'pending' || status === 'in-progress',
    blockedLabel: null,
  };
}
