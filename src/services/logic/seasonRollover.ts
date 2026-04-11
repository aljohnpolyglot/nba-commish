/**
 * seasonRollover.ts
 *
 * Called automatically from simulationHandler.ts when the sim date crosses
 * June 30 of the current season year (day before free agency opens July 1).
 *
 * Timeline:
 *  ~June 20  — NBA Finals end, bracket marked complete
 *  June 30   — THIS FIRES: contract expiry, year increment, cap inflation, clear transient state
 *  July 1    — Free agency opens (AI FA signings via AIFreeAgentHandler)
 *  Late June — NBA Draft (handled separately by DraftSimulatorView)
 *  Aug 14    — Schedule regen fires via autoResolvers.ts (existing logic)
 *
 * Note: Schedule generation is NOT done here — autoResolvers.ts already handles
 * that on Aug 14 when it detects no regular-season games exist.
 */

import { GameState, NBAPlayer } from '../../types';
import { applyCapInflation } from '../../utils/finance/inflationUtils';

/** Fired when the sim has just crossed into a new offseason (Oct 1, new year).
 *  Returns the rolled-over GameState patch. Does NOT mutate input. */
export function applySeasonRollover(state: GameState): Partial<GameState> {
  const currentYear = state.leagueStats.year;
  const nextYear    = currentYear + 1;

  // ── 1. Contract expiry ──────────────────────────────────────────────────
  // Players whose contract ends at or before the just-completed season become FAs.
  // We track yearsWithTeam by inspecting the existing field or incrementing by 1.
  const expiredIds = new Set<string>();
  const updatedPlayers: NBAPlayer[] = state.players.map(p => {
    if (!p.contract) return p;
    if (p.tid < 0) return p;           // already FA / draft prospect
    if ((p as any).status === 'Retired') return p;

    const contractExp: number = p.contract.exp ?? 0;

    // Contract expired at end of the season that just finished
    if (contractExp <= currentYear) {
      expiredIds.add(p.internalId);
      return {
        ...p,
        tid: -1,
        status: 'Free Agent' as const,
        yearsWithTeam: 0,
        midSeasonExtensionDeclined: undefined, // reset for next season
      } as any;
    }

    // Still under contract — increment yearsWithTeam
    const yrsWithTeam = ((p as any).yearsWithTeam ?? 0) + 1;
    const hasBirdRights =
      (state.leagueStats.birdRightsEnabled ?? true) && yrsWithTeam >= 3
        ? true
        : (p as any).hasBirdRights ?? false;

    return { ...p, yearsWithTeam: yrsWithTeam, hasBirdRights, midSeasonExtensionDeclined: undefined } as any;
  });

  // ── 2. Cap inflation ────────────────────────────────────────────────────
  const ls = state.leagueStats;
  let newSalaryCap    = ls.salaryCap ?? 154_647_000;
  let newLuxuryPayroll = ls.luxuryPayroll ?? Math.round(newSalaryCap * (ls.luxuryTaxThresholdPercentage ?? 121.5) / 100);
  let newFirstApron   = ls.firstApronPercentage  != null ? Math.round(newSalaryCap * ls.firstApronPercentage  / 100) : undefined;
  let newSecondApron  = ls.secondApronPercentage != null ? Math.round(newSalaryCap * ls.secondApronPercentage / 100) : undefined;
  let newMinContract  = ls.minContractStaticAmount ?? 1_272_870;
  let inflationPctApplied = 0;

  if (ls.inflationEnabled ?? true) {
    const { thresholds, pct } = applyCapInflation(
      {
        salaryCap:     newSalaryCap,
        luxuryPayroll: newLuxuryPayroll,
        firstApron:    newFirstApron,
        secondApron:   newSecondApron,
        minContract:   Math.round(newMinContract * 1_000_000), // applyCapInflation expects USD
      },
      {
        inflationMin:     ls.inflationMin     ?? 0,
        inflationMax:     ls.inflationMax     ?? 8,
        inflationAverage: ls.inflationAverage ?? 3.5,
        inflationStdDev:  ls.inflationStdDev  ?? 1.5,
      },
    );
    inflationPctApplied = pct;
    newSalaryCap      = thresholds.salaryCap;
    newLuxuryPayroll  = thresholds.luxuryPayroll;
    newFirstApron     = thresholds.firstApron;
    newSecondApron    = thresholds.secondApron;
    newMinContract    = (thresholds.minContract ?? Math.round(newMinContract * 1_000_000)) / 1_000_000;
  }

  // Schedule regen is NOT done here — autoResolvers.ts handles it on Aug 14
  // when it detects no regular-season games exist for the new year.

  // ── 4. Rollover news item ────────────────────────────────────────────────
  const capM  = (newSalaryCap / 1_000_000).toFixed(1);
  const pctStr = inflationPctApplied >= 0
    ? `+${inflationPctApplied.toFixed(1)}%`
    : `${inflationPctApplied.toFixed(1)}%`;
  const rolloverNews = {
    id: `rollover-${nextYear}-${Date.now()}`,
    headline: `${nextYear} NBA Season Underway — Salary Cap Set at $${capM}M`,
    content: `The ${nextYear} NBA season is officially underway. The salary cap has been set at $${capM}M (${pctStr} from last season). ${expiredIds.size} players became free agents as their contracts expired.`,
    date: state.date,
    type: 'league' as const,
    isNew: true,
    read: false,
  };

  console.log(
    `[SeasonRollover] ${currentYear} → ${nextYear} | ` +
    `Cap: $${(state.leagueStats.salaryCap ?? 0) / 1_000_000 | 0}M → $${capM}M (${pctStr}) | ` +
    `${expiredIds.size} contracts expired`
  );

  return {
    players: updatedPlayers,
    christmasGames: [],
    globalGames: state.globalGames ?? [],
    playoffs: undefined,
    allStar: undefined,
    draftLotteryResult: undefined,
    leagueStats: {
      ...state.leagueStats,
      year: nextYear,
      salaryCap:            newSalaryCap,
      luxuryPayroll:        newLuxuryPayroll,
      ...(newFirstApron  != null ? { firstApronAmount:  newFirstApron  } : {}),
      ...(newSecondApron != null ? { secondApronAmount: newSecondApron } : {}),
      minContractStaticAmount: newMinContract,
    },
    news: [rolloverNews, ...(state.news ?? [])].slice(0, 200),
  };
}

/** Returns true if the sim should fire a season rollover on this date.
 *  Triggers on June 30 of the current season year (day before FA opens July 1).
 *  e.g. season year 2026 → fires when date >= 2026-06-30.
 *  The year increment inside applySeasonRollover acts as the guard —
 *  after firing, leagueStats.year becomes nextYear so this won't re-fire. */
export function shouldFireRollover(state: GameState, dateNorm: string): boolean {
  const year = state.leagueStats.year;
  // The season runs Oct (year-1) → June (year). Rollover on June 30 of `year`.
  const rolloverDate = `${year}-06-30`;
  return dateNorm >= rolloverDate;
}
