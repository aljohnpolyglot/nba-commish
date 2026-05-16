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
 * 55–95. Deterministic hash from player.internalId — stable across rerenders,
 * sessions, and ticker invocations. Keeps the UI gauge and the ticker reject
 * decision pointing at the same number.
 */
export function computePlayerInterest(playerId: string): number {
  let h = 0;
  for (let i = 0; i < playerId.length; i++) h = ((h << 5) - h + playerId.charCodeAt(i)) | 0;
  return 55 + (Math.abs(h) % 41);
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
 * Combined verdict used by tickTransferMarket. A bid only auto-rejects if BOTH
 * the club and the player are below the floor — a strong overpay can drag a
 * reluctant player along, and an eager player can talk a club into a marginal
 * fee. Keeps the model interesting instead of a hard AND-gate.
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

export function evaluateOffer(amountEUR: number, askingEUR: number, playerId: string): OfferVerdict {
  const clubInterest = computeClubInterest(amountEUR, askingEUR);
  const playerInterest = computePlayerInterest(playerId);
  const clubLowball = amountEUR < askingEUR * 0.8;
  // Player veto: <50% interest AND fee isn't an overpay (<1.2× asking)
  const playerVeto = playerInterest < 50 && amountEUR < askingEUR * 1.2;
  let rejectReason: string | undefined;
  if (clubLowball) rejectReason = 'Lowball — below 80% of asking.';
  else if (playerVeto) rejectReason = 'Player turned down the move.';
  return { clubInterest, playerInterest, playerVeto, clubLowball, rejectReason };
}
