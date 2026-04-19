/**
 * DraftPickGenerator.ts
 *
 * Generates future draft picks at season rollover.
 *
 * Called from applySeasonRollover to ensure each team always has
 * `tradableDraftPickSeasons` future pick seasons visible in their
 * tradable assets (§4d of multiseason_todo.md).
 *
 * Example: after 2026 rollover with tradableDraftPickSeasons=4,
 *   → generate Round 1 + Round 2 picks for season 2030 for all 30 teams
 *     (seasons 2027–2029 already exist from prior rollovers / roster file)
 *
 * We only ADD picks that don't exist yet — this is idempotent and safe to
 * call every rollover.
 */

import type { DraftPick, NBATeam } from '../../types';

let _dpidCounter = 900_000; // high base to avoid collisions with BBGM pick IDs

function nextDpid(): number {
  return ++_dpidCounter + Date.now() % 10_000; // collision-proof
}

/**
 * Ensure every team has R1 + R2 picks present for seasons
 *   [newCurrentYear + 1 … newCurrentYear + windowSize].
 *
 * @param existingPicks   state.draftPicks (may include traded picks)
 * @param teams           active NBA teams (tid < 100 assumed)
 * @param newCurrentYear  leagueStats.year AFTER the year increment
 * @param windowSize      leagueStats.tradableDraftPickSeasons (default 4)
 * @returns               merged DraftPick[] (existing + any newly generated)
 */
export function generateFuturePicks(
  existingPicks: DraftPick[],
  teams: NBATeam[],
  newCurrentYear: number,
  windowSize: number = 4,
): DraftPick[] {
  const nbaTids = teams.filter(t => t.tid >= 0 && t.tid < 100).map(t => t.tid);

  // Build a Set of (tid, season, round) tuples that already exist
  const existingSet = new Set<string>();
  for (const p of existingPicks) {
    existingSet.add(`${p.tid}_${p.season}_${p.round}`);
  }

  const newPicks: DraftPick[] = [];

  for (let season = newCurrentYear + 1; season <= newCurrentYear + windowSize; season++) {
    for (const tid of nbaTids) {
      for (const round of [1, 2] as const) {
        const key = `${tid}_${season}_${round}`;
        if (!existingSet.has(key)) {
          newPicks.push({
            dpid:        nextDpid(),
            tid,          // current owner = original team (untouched)
            originalTid:  tid,
            round,
            season,
          });
          existingSet.add(key); // prevent duplicates within this run
        }
      }
    }
  }

  if (newPicks.length > 0) {
    console.log(
      `[DraftPickGenerator] Generated ${newPicks.length} future picks ` +
      `(seasons ${newCurrentYear + 1}–${newCurrentYear + windowSize})`
    );
  }

  return [...existingPicks, ...newPicks];
}

/**
 * Single source of truth for the minimum tradable draft-pick season.
 *
 * The current year's picks are tradable right up until DraftSimulatorView
 * commits the class. At that moment `draftComplete` flips to true and the
 * floor shifts to next year. Rollover (Jun 30) resets `draftComplete` to
 * undefined so the new upcoming year's picks open up again.
 *
 * Every trade surface (TradeMachineModal, TradeFinderView, TradingBlock,
 * AITradeHandler, inboundProposalGenerator, tradeFinderEngine) must use
 * this helper — never re-implement the rule locally.
 */
export function getMinTradableSeason(
  state: { leagueStats?: { year?: number }; draftComplete?: boolean } | null | undefined,
): number {
  const year = state?.leagueStats?.year ?? new Date().getFullYear();
  return state?.draftComplete ? year + 1 : year;
}

/** NBA-matching default window (commissioner UI slider caps at 7). Shared so
 *  inventory generation and trade surfaces never disagree on the max. */
export const DEFAULT_TRADABLE_PICK_SEASONS = 7;

/**
 * Single source of truth for the maximum tradable draft-pick season.
 *
 * Honors the commissioner's `tradableDraftPickSeasons` setting from
 * EconomyTab (1-7 slider). Inventory generation (seasonRollover,
 * initialization) uses the same cap, so the two stay in lockstep.
 */
export function getMaxTradableSeason(
  state: { leagueStats?: { year?: number; tradableDraftPickSeasons?: number } } | null | undefined,
): number {
  const year   = state?.leagueStats?.year ?? new Date().getFullYear();
  const window = state?.leagueStats?.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
  return year + window;
}

/** True if `season` is currently tradable under the commissioner's rules. */
export function isTradablePickSeason(
  state: { leagueStats?: { year?: number; tradableDraftPickSeasons?: number }; draftComplete?: boolean } | null | undefined,
  season: number,
): boolean {
  return season >= getMinTradableSeason(state) && season <= getMaxTradableSeason(state);
}

/**
 * All picks currently tradable under commissioner rules, irrespective of owner.
 * Prefer this over raw `state.draftPicks` in every trade surface — it guarantees
 * the min floor (draft-complete gate) and max cutoff (tradableDraftPickSeasons)
 * are both respected.
 */
export function getTradablePicks(
  state: {
    draftPicks?: DraftPick[];
    leagueStats?: { year?: number; tradableDraftPickSeasons?: number };
    draftComplete?: boolean;
  } | null | undefined,
): DraftPick[] {
  if (!state?.draftPicks) return [];
  const min = getMinTradableSeason(state);
  const max = getMaxTradableSeason(state);
  return state.draftPicks.filter(p => p.season >= min && p.season <= max);
}

/**
 * Prune picks for the finished season (and any earlier stragglers).
 * Rollover fires AFTER the draft, so season === currentYear picks are already
 * consumed — drop them here as defense-in-depth in case DraftSimulatorView
 * didn't clear them (partial sim state, legacy saves, etc.).
 * Keeps only picks strictly in the future.
 */
export function pruneExpiredPicks(
  picks: DraftPick[],
  currentYear: number,
): DraftPick[] {
  return picks.filter(p => p.season > currentYear);
}
