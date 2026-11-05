import type { NBAPlayer } from '../../types';

/**
 * A submitted qualifying offer is the source of restricted free-agent match
 * rights. Explicit modern-save decisions win; the old flags are retained only
 * for saves created before the decision fields existed.
 */
export function isPlayerRestrictedFreeAgent(player: NBAPlayer): boolean {
  const contract = player.contract;
  if (!contract || contract.qualifyingOfferSkipped === true) return false;
  if (contract.qualifyingOfferSubmitted !== undefined) {
    return contract.qualifyingOfferSubmitted === true;
  }
  return contract.isRestrictedFA === true || contract.restrictedFA === true;
}
