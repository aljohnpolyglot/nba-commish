export type RosterCompletionOffer = {
  salaryUSD: number;
  years: number;
  hasPlayerOption: boolean;
};

/** Roster pressure is not market evidence and must never rewrite a player's demand. */
export function preserveRosterCompletionMarketOffer<T extends RosterCompletionOffer>(offer: T): T {
  return offer;
}

/**
 * The emergency roster-floor pass may use a minimum only after the canonical
 * market offer itself has already cleared into the minimum band. Rating alone
 * can neither grant nor prohibit the contract.
 */
export function isEmergencyMinimumRosterOfferEligible(input: {
  playerK2: number;
  marketOfferUSD: number;
  minSalaryUSD: number;
}): boolean {
  if (!Number.isFinite(input.playerK2)) return false;
  if (!Number.isFinite(input.marketOfferUSD) || !Number.isFinite(input.minSalaryUSD)) return false;
  return input.marketOfferUSD >= input.minSalaryUSD
    && input.marketOfferUSD <= input.minSalaryUSD * 1.25;
}
