/**
 * transferCaps.ts — per-club season caps + floors for the Euro transfer market.
 *
 * Numbers anchored on real-world data:
 *   Euroleague — 3-5 transfers/club off-season, ~50-70 league-wide. Mid-season
 *     window (Dec-Feb) is tightly regulated: 1-2 emergency moves per club.
 *   Liga Endesa (ACB) — heavier overhaul, 4-6 transfers/club off-season,
 *     100+ league-wide. Late-spring local signings push mid-season higher.
 *
 * Both buys (player acquired) and sells (player listed/sold) are capped
 * separately so a roster-shuffle club doesn't blow past both directions.
 * A floor (minBuysSummer / minSellsSummer) is also tracked so quiet clubs
 * still hit at least 1-2 moves per off-season instead of going dormant.
 *
 * Architecturally this file is the single source of truth — the ticker reads
 * from it for refill, bid, and accept decisions. Tune one place, behavior
 * follows everywhere.
 */

import { getTransferMarketLeague } from './marketEligibility';

export interface TransferCaps {
  league: string;
  /** Max times this club can BUY in a single summer window. */
  maxBuysSummer: number;
  /** Max times this club can BUY in a single winter window. */
  maxBuysWinter: number;
  /** Max times this club can SELL in a single summer window. */
  maxSellsSummer: number;
  /** Max times this club can SELL in a single winter window. */
  maxSellsWinter: number;
  /** Soft floor — clubs below this in summer get refill preference. */
  minBuysSummer: number;
  /** Soft floor — clubs below this in summer get listing preference. */
  minSellsSummer: number;
}

const EUROLEAGUE_CAPS: TransferCaps = {
  league: 'Euroleague',
  maxBuysSummer: 5,
  maxBuysWinter: 2,
  maxSellsSummer: 5,
  maxSellsWinter: 2,
  minBuysSummer: 2,
  minSellsSummer: 2,
};

const ENDESA_CAPS: TransferCaps = {
  league: 'Liga Endesa',
  maxBuysSummer: 6,
  maxBuysWinter: 2,
  maxSellsSummer: 6,
  maxSellsWinter: 2,
  minBuysSummer: 3,
  minSellsSummer: 3,
};

const DEFAULT_CAPS: TransferCaps = {
  league: 'Other',
  maxBuysSummer: 4,
  maxBuysWinter: 1,
  maxSellsSummer: 4,
  maxSellsWinter: 1,
  minBuysSummer: 1,
  minSellsSummer: 1,
};

/** Caps for the league this tid belongs to. */
export function getTransferCaps(tid: number): TransferCaps {
  const lg = getTransferMarketLeague(tid);
  if (!lg) return DEFAULT_CAPS;
  if (lg.name === 'Euroleague') return EUROLEAGUE_CAPS;
  if (lg.name === 'Liga Endesa') return ENDESA_CAPS;
  return DEFAULT_CAPS;
}

/**
 * Counts a club's completed transfers within the current window from
 * transferActivity. Window = current calendar season (Jul → Jun) for summer,
 * or Jan → Feb for winter, scoped by date strings (ISO).
 */
export function countTeamTransfers(
  activity: Array<{ fromTid: number; toTid: number; date: string }> | undefined,
  tid: number,
  windowKind: 'summer' | 'winter' | 'closed',
  windowOpenIso: string | null,
  windowCloseIso: string | null,
): { bought: number; sold: number } {
  if (!activity || activity.length === 0 || !windowOpenIso || !windowCloseIso) {
    return { bought: 0, sold: 0 };
  }
  let bought = 0;
  let sold = 0;
  for (const a of activity) {
    if (a.date < windowOpenIso || a.date > windowCloseIso) continue;
    if (a.toTid === tid) bought++;
    if (a.fromTid === tid) sold++;
  }
  return { bought, sold };
}

export interface CapStatus {
  bought: number;
  sold: number;
  buyCap: number;
  sellCap: number;
  canBuy: boolean;
  canSell: boolean;
  /** True when the club is below the summer floor — used to nudge refill toward them. */
  underBuyFloor: boolean;
  underSellFloor: boolean;
}

export function getCapStatus(
  activity: Array<{ fromTid: number; toTid: number; date: string }> | undefined,
  tid: number,
  windowKind: 'summer' | 'winter' | 'closed',
  windowOpenIso: string | null,
  windowCloseIso: string | null,
): CapStatus {
  const caps = getTransferCaps(tid);
  const { bought, sold } = countTeamTransfers(activity, tid, windowKind, windowOpenIso, windowCloseIso);
  const buyCap = windowKind === 'summer' ? caps.maxBuysSummer
    : windowKind === 'winter' ? caps.maxBuysWinter
    : 0;
  const sellCap = windowKind === 'summer' ? caps.maxSellsSummer
    : windowKind === 'winter' ? caps.maxSellsWinter
    : 0;
  return {
    bought,
    sold,
    buyCap,
    sellCap,
    canBuy: bought < buyCap,
    canSell: sold < sellCap,
    underBuyFloor: windowKind === 'summer' && bought < caps.minBuysSummer,
    underSellFloor: windowKind === 'summer' && sold < caps.minSellsSummer,
  };
}
