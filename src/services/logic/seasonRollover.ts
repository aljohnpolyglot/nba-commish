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
import { runRetirementChecks, RetireeRecord } from '../playerDevelopment/retirementChecker';
import { generateFuturePicks, pruneExpiredPicks } from '../draft/DraftPickGenerator';
import { computeContractOffer } from '../../utils/salaryUtils';

/** Fired when the sim has just crossed into a new offseason (Oct 1, new year).
 *  Returns the rolled-over GameState patch. Does NOT mutate input. */
export function applySeasonRollover(state: GameState): Partial<GameState> {
  const currentYear = state.leagueStats.year;
  const nextYear    = currentYear + 1;

  // ── 0. Player options ───────────────────────────────────────────────────
  // Players with a player option on their expiring contract decide before rollover:
  //  - Opt IN  (market value < current contract × 0.9) → keep contract, exp advances +1
  //  - Opt OUT (market value ≥ current contract × 0.9) → become FA at rollover
  // Note: current BBGM roster data has no player options; this fires for future AI-generated contracts.
  const playerOptOutIds = new Set<string>();
  const playerOptInIds  = new Set<string>();
  const playerOptionNews: string[] = [];

  for (const p of state.players) {
    if (!(p as any).contract?.hasPlayerOption) continue;
    if (!p.contract || (p.contract.exp ?? 0) !== currentYear) continue;
    if (p.tid < 0 || p.tid >= 100) continue; // only active NBA players

    const offer = computeContractOffer(p, state.leagueStats as any);
    const currentAmountUSD = (p.contract.amount ?? 0) * 1_000; // BBGM thousands → USD
    // Opt in if current contract pays more than 90% of what market would offer
    if (currentAmountUSD >= offer.salaryUSD * 0.9) {
      playerOptInIds.add(p.internalId);
      // Player opts in — contract effectively extends one year; we leave exp as-is
      // (the player is still under contract, won't become FA at expiry check below)
    } else {
      playerOptOutIds.add(p.internalId);
      const team = state.teams.find(t => t.id === p.tid);
      playerOptionNews.push(
        `${p.name} has exercised his player option and will test the free agent market${team ? `, declining his ${(currentAmountUSD / 1_000_000).toFixed(1)}M option with the ${team.name}` : ''}.`,
      );
    }
  }

  // ── 1. Contract expiry ──────────────────────────────────────────────────
  // Players whose contract ends at or before the just-completed season become FAs.
  // We track yearsWithTeam by inspecting the existing field or incrementing by 1.
  const expiredIds = new Set<string>();
  const updatedPlayers: NBAPlayer[] = state.players.map(p => {
    // Everyone ages (retired, external, FA, contracted) except deceased players and unborn prospects
    if ((p as any).diedYear) return p;                   // deceased — do not age
    if (p.tid === -2) return p;                          // future draft prospect — birth year is source of truth

    const EXTERNAL_LEAGUES = ['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa'];
    // tid >= 100: non-NBA team roster slot (WNBA ≥3000, Euroleague ≥1000, etc.) — never convert to NBA FA
    if ((p as any).status === 'Retired' || EXTERNAL_LEAGUES.includes((p as any).status ?? '') || p.tid >= 100 || !p.contract || p.tid < 0) {
      // Retired / external league / unsigned — age but freeze roster (no contract changes, no FA conversion)
      return typeof p.age === 'number' ? { ...p, age: p.age + 1 } as NBAPlayer : p;
    }

    const contractExp: number = p.contract.exp ?? 0;
    const newAge = typeof p.age === 'number' ? p.age + 1 : p.age;

    // Contract expired OR player opted out of their player option
    if (contractExp <= currentYear || playerOptOutIds.has(p.internalId)) {
      expiredIds.add(p.internalId);
      return {
        ...p,
        age: newAge,
        tid: -1,
        status: 'Free Agent' as const,
        yearsWithTeam: 0,
        midSeasonExtensionDeclined: undefined, // reset for next season
        contract: { ...p.contract, hasPlayerOption: false }, // option consumed
      } as any;
    }

    // Still under contract — increment yearsWithTeam
    const yrsWithTeam = ((p as any).yearsWithTeam ?? 0) + 1;
    const hasBirdRights =
      (state.leagueStats.birdRightsEnabled ?? true) && yrsWithTeam >= 3
        ? true
        : (p as any).hasBirdRights ?? false;

    return { ...p, age: newAge, yearsWithTeam: yrsWithTeam, hasBirdRights, midSeasonExtensionDeclined: undefined } as any;
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

  // ── 3. Retirement checks ─────────────────────────────────────────────────
  // Run AFTER age increments (updatedPlayers already has age+1).
  // We pass `currentYear` (the season that just ended) as the retirement year stamp.
  const { players: playersAfterRetire, newRetirees } = runRetirementChecks(updatedPlayers, currentYear);

  // ── 3b. Draft pick bookkeeping ───────────────────────────────────────────
  const windowSize = state.leagueStats.tradableDraftPickSeasons ?? 4;
  const nbaNBATeams = (state.teams ?? []).filter((t: any) => t.tid >= 0 && t.tid < 100);
  // Prune stale picks THEN generate new window for the new season
  const prunedPicks = pruneExpiredPicks(state.draftPicks ?? [], currentYear);
  const updatedPicks = generateFuturePicks(prunedPicks, nbaNBATeams as any, nextYear, windowSize);

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

  // ── Player option news items ─────────────────────────────────────────────
  const playerOptionNewsItems = playerOptionNews.map((text, i) => ({
    id: `player-option-${currentYear}-${i}-${Date.now()}`,
    headline: text.split(',')[0] ?? text,
    content: text,
    date: state.date,
    type: 'roster' as const,
    isNew: true,
    read: false,
  }));

  // ── Retirement news items ────────────────────────────────────────────────
  const retirementNewsItems = newRetirees.map((r: RetireeRecord) => {
    const pgStr = r.careerGP > 0
      ? `${(r.careerPts / r.careerGP).toFixed(1)} PPG / ${(r.careerReb / r.careerGP).toFixed(1)} RPG / ${(r.careerAst / r.careerGP).toFixed(1)} APG over ${r.careerGP} games`
      : 'career stats unavailable';
    const accolades: string[] = [];
    if (r.allStarAppearances > 0) accolades.push(`${r.allStarAppearances}× All-Star`);
    if (r.championships > 0) accolades.push(`${r.championships}× Champion`);
    const accoladeStr = accolades.length > 0 ? ` His career included ${accolades.join(', ')}.` : '';
    const headline = r.isLegend
      ? `Legend Retires: ${r.name} Ends Storied Career After ${r.careerGP} Games`
      : `${r.name} Announces Retirement`;
    return {
      id: `retire-${r.playerId}-${Date.now()}`,
      headline,
      content: `${r.name} (age ${r.age}) has officially announced his retirement.${accoladeStr} He averaged ${pgStr}.`,
      date: state.date,
      type: (r.isLegend ? 'player' : 'roster') as any,
      isNew: true,
      read: false,
    };
  });

  console.log(
    `[SeasonRollover] ${currentYear} → ${nextYear} | ` +
    `Cap: $${(state.leagueStats.salaryCap ?? 0) / 1_000_000 | 0}M → $${capM}M (${pctStr}) | ` +
    `${expiredIds.size} contracts expired | ` +
    `${newRetirees.length} retirements | ` +
    `${updatedPicks.length} total draft picks`
  );

  // ── Bets pruning — drop resolved bets (won/lost) older than 2 seasons ────
  const cutoffDate = `${currentYear - 1}-10-01`; // beginning of the season 2 years ago
  const prunedBets = (state.bets ?? []).filter(b => b.status === 'pending' || b.date >= cutoffDate);

  return {
    players: playersAfterRetire,
    draftPicks: updatedPicks,
    bets: prunedBets,
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
    retirementAnnouncements: newRetirees,
    seasonPreviewDismissed: true,  // stays hidden through FA; shown when preseason starts (Oct 1)
    draftComplete: undefined,      // reset so draft can run for new year
    news: [...playerOptionNewsItems, ...retirementNewsItems, rolloverNews, ...(state.news ?? [])].slice(0, 200),
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
