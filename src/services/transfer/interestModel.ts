/**
 * interestModel.ts — Shared Club + Player interest calc for the Euro transfer
 * market. Single source of truth for both the BidOnListingModal UI and the
 * transferMarketTicker AI decisions, so what the user sees IS what fires.
 */

/** 0–100. Curve anchored on the 80% lowball reject threshold. */
export function computeClubInterest(amountEUR: number, askingEUR: number): number {
  const ratio = amountEUR / Math.max(1, askingEUR);
  const raw =
    ratio < 0.8 ? 5
    : ratio < 0.95 ? 25 + ((ratio - 0.8) / 0.15) * 25
    : ratio < 1.1 ? 50 + ((ratio - 0.95) / 0.15) * 25
    : ratio < 1.3 ? 80 + ((ratio - 1.1) / 0.2) * 15
    : 98;
  return Math.min(98, Math.max(2, Math.round(raw)));
}

/**
 * Deterministic and destination-aware. Recent continental performance makes a
 * club more attractive without guaranteeing that a reluctant player accepts.
 */
export function computeSigningBonusInterestBoost(signingBonusEUR = 0, annualSalaryEUR = 0): number {
  const normalizedBonus = Math.max(0, signingBonusEUR);
  const scale = annualSalaryEUR > 0 ? Math.max(50_000, annualSalaryEUR * 0.4) : 400_000;
  return Math.round(20 * (1 - Math.exp(-normalizedBonus / scale)));
}

export function getSigningBonusStepEUR(annualSalaryEUR: number): number {
  return Math.max(5_000, Math.round(Math.max(0, annualSalaryEUR) * 0.05 / 5_000) * 5_000);
}

export function recommendSigningBonusEUR(annualSalaryEUR: number, contractYears = 1): number {
  const salary = Math.max(0, annualSalaryEUR);
  if (salary <= 0) return 0;
  const step = getSigningBonusStepEUR(salary);
  const target = salary * (contractYears >= 3 ? 0.25 : contractYears === 2 ? 0.2 : 0.15);
  return Math.max(step, Math.round(target / step) * step);
}

export function computePlayerInterest(
  playerId: string,
  destinationPrestige = 35,
  signingBonusEUR = 0,
): number {
  let h = 0;
  for (let i = 0; i < playerId.length; i++) h = ((h << 5) - h + playerId.charCodeAt(i)) | 0;
  const baseline = 45 + (Math.abs(h) % 36);
  const bonusBoost = computeSigningBonusInterestBoost(signingBonusEUR);
  return Math.max(25, Math.min(96, Math.round(baseline + (destinationPrestige - 35) * 0.25 + bonusBoost)));
}

export function playerInterestLabel(pct: number): string {
  if (pct >= 80) return 'Eager to join your team';
  if (pct >= 65) return 'Open to joining your team';
  if (pct >= 50) return 'Neutral about the move';
  return 'Reluctant — would prefer to stay';
}

export function clubInterestLabel(pct: number): string {
  if (pct >= 70) return 'High chance of accepting this offer';
  if (pct >= 40) return 'Borderline — competing offers could swing this';
  return 'Will reject — bid needs to climb closer to asking';
}

/**
 * Combined verdict used by tickTransferMarket. The transfer fee determines
 * club interest while the signing bonus can change player interest.
 */
export interface OfferVerdict {
  clubInterest: number;
  playerInterest: number;
  /** Player will reject regardless of fee — drives the toast reason. */
  playerVeto: boolean;
  /** Bid is below club's lowball floor — instant rejection. */
  clubLowball: boolean;
  /** Reason string for the rejection toast. */
  rejectReason?: string;
}

export function evaluateOffer(
  amountEUR: number,
  askingEUR: number,
  playerId: string,
  destinationPrestige = 35,
  signingBonusEUR = 0,
): OfferVerdict {
  const clubInterest = computeClubInterest(amountEUR, askingEUR);
  const playerInterest = computePlayerInterest(playerId, destinationPrestige, signingBonusEUR);
  const clubLowball = amountEUR < askingEUR * 0.8;
  const playerVeto = playerInterest < 50;
  let rejectReason: string | undefined;
  if (clubLowball) rejectReason = 'Lowball — below 80% of asking.';
  else if (playerVeto) rejectReason = 'Player turned down the move.';
  return { clubInterest, playerInterest, playerVeto, clubLowball, rejectReason };
}
