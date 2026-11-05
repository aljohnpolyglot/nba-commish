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

import type { DraftPick, GameState, LeagueSeasonLifecycle, NBATeam } from '../../types';
import { getLsYear } from '../../utils/leagueYear';
import { getDraftSeasonYearForState } from '../offseason/offseasonState';
import { isCanonicalDraftComplete, resolveLeagueSeasonLifecycle } from '../lifecycle/leagueSeasonLifecycle';

/**
 * Ensure every team has R1 + R2 picks present for the tradable window.
 * Pass includeCurrentSeason during initialization/load healing, because the
 * current draft's picks must be real assets until the draft is complete.
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
  includeCurrentSeason: boolean = false,
  roundsPerTeam: number = 2,
): DraftPick[] {
  const nbaTids = teams.filter(t => (t as any).id >= 0 && (t as any).id < 100).map(t => (t as any).id as number);
  return generateFuturePicksForTeamIds(existingPicks, nbaTids, newCurrentYear, windowSize, roundsPerTeam, includeCurrentSeason);
}

export function getDraftRoundsForLeague(
  leagueStats: { uiMode?: string } | null | undefined,
): number {
  return leagueStats?.uiMode === 'wnba_isolated' ? 3 : 2;
}

export function generateFuturePicksForTeamIds(
  existingPicks: DraftPick[],
  teamIds: number[],
  newCurrentYear: number,
  windowSize: number = 4,
  roundsPerTeam: number = 2,
  includeCurrentSeason: boolean = false,
): DraftPick[] {

  const startSeason = includeCurrentSeason ? newCurrentYear : newCurrentYear + 1;
  const seasons = Array.from(
    { length: Math.max(0, newCurrentYear + windowSize - startSeason + 1) },
    (_, index) => startSeason + index,
  );
  return generateDraftPicksForTeamIdsAndSeasons(existingPicks, teamIds, seasons, roundsPerTeam);
}

export function generateDraftPicksForTeamIdsAndSeasons(
  existingPicks: DraftPick[],
  teamIds: number[],
  seasons: number[],
  roundsPerTeam: number = 2,
): DraftPick[] {
  const draftSeasons = [...new Set(seasons.filter(Number.isInteger))].sort((left, right) => left - right);

  // Build a Set of (originalTid, season, round) tuples that already exist.
  // Must key on originalTid — if a pick was traded, p.tid is the new owner but
  // the pick for that original slot is already covered.
  const existingSet = new Set<string>();
  for (const p of existingPicks) {
    existingSet.add(`${p.originalTid}_${p.season}_${p.round}`);
  }

  const newPicks: DraftPick[] = [];
  let nextDpid = Math.max(900_000, ...existingPicks.map(pick => pick.dpid));

  for (const season of draftSeasons) {
    for (const tid of teamIds) {
      for (let round = 1; round <= roundsPerTeam; round++) {
        const key = `${tid}_${season}_${round}`;
        if (!existingSet.has(key)) {
          newPicks.push({
            dpid:        ++nextDpid,
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
      `[DraftPickGenerator] Generated ${newPicks.length} draft picks ` +
      `(seasons ${draftSeasons[0]}–${draftSeasons.at(-1)})`
    );
  }

  return [...existingPicks, ...newPicks];
}

/**
 * Single source of truth for the minimum tradable draft-pick season.
 *
 * The current year's picks are tradable right up until DraftSimulatorView
 * commits the class. At that moment `draftComplete` flips to true and the
 * floor shifts to next year. The saved season transition resets `draftComplete` to
 * undefined so the new upcoming year's picks open up again.
 *
 * Every trade surface (TradeMachineModal, TradeFinderView, TradingBlock,
 * AITradeHandler, inboundProposalGenerator, tradeFinderEngine) must use
 * this helper — never re-implement the rule locally.
 */
type DraftCycleState = {
  date?: string;
  leagueStats?: {
    year?: number;
    uiMode?: string;
    openingRosterMode?: string;
    wnbaSourceSeason?: number;
    pbaDraftComplete?: boolean;
    pbaDraftCompleteSeason?: number;
  };
  draftComplete?: boolean;
  seasonLifecycle?: LeagueSeasonLifecycle;
  teams?: GameState['teams'];
  nonNBATeams?: GameState['nonNBATeams'];
  players?: GameState['players'];
  history?: GameState['history'];
  activeDraftPicks?: GameState['activeDraftPicks'];
  activeDraftPassedPicks?: GameState['activeDraftPassedPicks'];
  activeDraftOrder?: GameState['activeDraftOrder'];
  draftPicks?: Array<DraftPick & { used?: boolean; playerSelected?: unknown }>;
};

export function isCurrentDraftClassComplete(state: DraftCycleState | null | undefined): boolean {
  if (!state) return false;
  return isCanonicalDraftComplete(state as unknown as GameState);
}

export function getCurrentDraftClassYear(state: DraftCycleState | null | undefined): number {
  if (!state) return getDraftSeasonYearForState({});
  const lifecycle = resolveLeagueSeasonLifecycle(state as unknown as GameState);
  const year = lifecycle.draft.year ?? lifecycle.activeSeason;
  return lifecycle.draft.draft === 'complete' ? year + 1 : year;
}

export function getMinTradableSeason(
  state: DraftCycleState | null | undefined,
): number {
  return getCurrentDraftClassYear(state);
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
  const year   = state ? getLsYear(state) : new Date().getFullYear();
  const window = state?.leagueStats?.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
  return year + window;
}

/** True if `season` is currently tradable under the commissioner's rules. */
export function isTradablePickSeason(
  state: DraftCycleState | null | undefined,
  season: number,
): boolean {
  return season >= getMinTradableSeason(state) && season <= getMaxTradableSeason(state);
}

type DraftPickInventoryState = {
  draftPicks?: DraftPick[];
  seasonLifecycle?: GameState['seasonLifecycle'];
  date?: string;
  leagueStats?: { year?: number; tradableDraftPickSeasons?: number };
  draftComplete?: boolean;
  activeDraftPicks?: GameState['activeDraftPicks'];
  activeDraftPassedPicks?: GameState['activeDraftPassedPicks'];
  activeDraftOrder?: GameState['activeDraftOrder'];
};

export function getUnconsumedDraftPicks(state: DraftPickInventoryState | null | undefined): DraftPick[] {
  if (!state?.draftPicks) return [];
  const currentYear = getLsYear(state);
  const currentClassComplete = getCurrentDraftClassYear(state) > currentYear;
  const completedSlots = new Set([
    ...Object.keys(state.activeDraftPicks ?? {}),
    ...Object.keys(state.activeDraftPassedPicks ?? {}),
  ].map(Number));
  const consumedCurrentPickKeys = new Set<string>();
  for (const slot of completedSlots) {
    const orderRow = state.activeDraftOrder?.[slot - 1];
    if (!orderRow) continue;
    const originalTid = Number(orderRow._originalTid ?? orderRow.id);
    const round = orderRow._round ?? (orderRow._r2 ? 2 : 1);
    consumedCurrentPickKeys.add(`${originalTid}|${round}`);
  }
  if (state.seasonLifecycle?.draft.year === currentYear) {
    for (const slot of state.seasonLifecycle.draft.orderLedger ?? []) {
      if (slot.disposition !== 'open' || state.seasonLifecycle.draft.selectedPlayerIdsBySlot?.[slot.overallPick]) {
        consumedCurrentPickKeys.add(`${slot.originalTeamId}|${slot.round}`);
      }
    }
  }

  return state.draftPicks.filter(pick =>
    !pick.forfeiture &&
    !(pick as any).used &&
    !(pick as any).playerSelected &&
    !(currentClassComplete && pick.season <= currentYear) &&
    !(pick.season === currentYear && consumedCurrentPickKeys.has(`${pick.originalTid}|${pick.round}`))
  );
}

/**
 * All picks currently tradable under commissioner rules, irrespective of owner.
 * Prefer this over raw `state.draftPicks` in every trade surface — it guarantees
 * the min floor (draft-complete gate) and max cutoff (tradableDraftPickSeasons)
 * are both respected.
 */
export function getTradablePicks(
  state: DraftPickInventoryState | null | undefined,
): DraftPick[] {
  if (!state?.draftPicks) return [];
  const min = getMinTradableSeason(state);
  const max = getMaxTradableSeason(state);
  return getUnconsumedDraftPicks(state).filter(pick =>
    pick.season >= min && pick.season <= max
  );
}

export function healMissingCurrentDraftPickRows(
  state: {
    draftPicks?: DraftPick[];
    teams?: NBATeam[];
    date?: string;
    leagueStats?: { year?: number; tradableDraftPickSeasons?: number; uiMode?: string };
    draftComplete?: boolean;
    activeDraftPicks?: GameState['activeDraftPicks'];
    activeDraftPassedPicks?: GameState['activeDraftPassedPicks'];
  } | null | undefined,
): DraftPick[] {
  const draftPicks = state?.draftPicks ?? [];
  if (!state || getCurrentDraftClassYear(state) > getLsYear(state)) return draftPicks;
  if (Object.keys(state.activeDraftPicks ?? {}).length > 0) return draftPicks;
  if (Object.keys(state.activeDraftPassedPicks ?? {}).length > 0) return draftPicks;

  const teamIds = (state.teams ?? [])
    .filter(team => team.id >= 0 && team.id < 100)
    .map(team => team.id);
  if (teamIds.length === 0) return draftPicks;

  const year = getLsYear(state);
  const windowSize = state.leagueStats?.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
  return generateFuturePicksForTeamIds(
    draftPicks,
    teamIds,
    year,
    windowSize,
    getDraftRoundsForLeague(state.leagueStats),
    true,
  );
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
  return picks.filter(p => p.forfeiture || p.season > currentYear);
}
