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
import { runRetirementChecks, runFarewellTourChecks, RetireeRecord, FarewellRecord } from '../playerDevelopment/retirementChecker';
import { generateFuturePicks, pruneExpiredPicks } from '../draft/DraftPickGenerator';
import { computeContractOffer } from '../../utils/salaryUtils';
import { SettingsManager } from '../SettingsManager';
import { ensureDraftClasses } from '../draftClassFiller';

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
  const playerOptionHistory: Array<{ text: string; date: string; type: string }> = [];

  // Player options: gist labels option on the season it APPLIES TO.
  // "2025-26 Player Option" → parsed exp = 2026.
  // Decision happens at SUMMER BEFORE that season = Jun 30 of currentYear (2025).
  // So at Jun 30 2025 rollover (currentYear=2025), check exp === nextYear (2026).
  // This way the player decides NOW whether to play the upcoming option year.
  for (const p of state.players) {
    if (!(p as any).contract?.hasPlayerOption) continue;
    if (!p.contract || (p.contract.exp ?? 0) !== nextYear) continue;
    if (p.tid < 0 || p.tid >= 100) continue; // only active NBA players

    const offer = computeContractOffer(p, state.leagueStats as any);
    const currentAmountUSD = (p.contract.amount ?? 0) * 1_000; // BBGM thousands → USD
    const team = state.teams.find(t => t.id === p.tid);
    // Opt in if current contract pays more than 90% of what market would offer
    if (currentAmountUSD >= offer.salaryUSD * 0.9) {
      playerOptInIds.add(p.internalId);
      // Player opts in — contract stays (handled above; we leave exp as-is)
      const text = `${p.name} has accepted his player option with the ${team?.name ?? 'team'}: $${(currentAmountUSD / 1_000_000).toFixed(1)}M`;
      playerOptionNews.push(text);
      // Jun 29 — options happen BEFORE free agency (Jul 1+). getSeasonYear boundary at Jun 28+
      // ensures these still appear in the new season's transaction view.
      const optionDateStr = `Jun 29, ${currentYear}`;
      playerOptionHistory.push({ text, date: optionDateStr, type: 'Signing' });
    } else {
      playerOptOutIds.add(p.internalId);
      const text = `${p.name} has declined his player option${team ? ` with the ${team.name}` : ''}, becoming a free agent.`;
      playerOptionNews.push(text);
      const optionDateStr = `Jun 29, ${currentYear}`;
      playerOptionHistory.push({ text, date: optionDateStr, type: 'Signing' });
    }
  }

  // ── 0b. Rookie team option exercise ─────────────────────────────────────
  // AI teams automatically exercise team options on good players (OVR ≥ 50 BBGM).
  // Gist labels option on the season it applies to: "2023-24 Team" → parsed teamOptionExp = 2024.
  // Decision at summer BEFORE = Jun 30 2023 (currentYear=2023) → check teamOptionExp === nextYear (2024).
  const teamOptionExercisedIds  = new Set<string>();
  const teamOptionDeclinedIds   = new Set<string>();
  const teamOptionNews: string[] = [];

  for (const p of state.players) {
    if (!(p as any).contract?.hasTeamOption) continue;
    const teamOptExp: number = (p as any).contract?.teamOptionExp ?? -1;
    if (teamOptExp !== nextYear) continue;          // not decision time yet
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;

    const team = state.teams.find(t => t.id === p.tid);
    const ovr = p.overallRating ?? 60;
    // Exercise if OVR ≥ 50 BBGM (rotation-level or better, per BBGM scale: 45+ = role player, 55+ = starter)
    const exercise = ovr >= 50;
    if (exercise) {
      teamOptionExercisedIds.add(p.internalId);
      teamOptionNews.push(
        `${team?.name ?? 'A team'} has exercised their team option on ${p.name}.`,
      );
    } else {
      teamOptionDeclinedIds.add(p.internalId);
      teamOptionNews.push(
        `${team?.name ?? 'A team'} has declined their team option on ${p.name}, making him a restricted free agent.`,
      );
    }
  }

  // ── 1. Contract expiry ──────────────────────────────────────────────────
  // Players whose contract ends at or before the just-completed season become FAs.
  // We track yearsWithTeam by inspecting the existing field or incrementing by 1.
  // Helper: sync contract.amount to the upcoming season from contractYears[] if available.
  // contractYears[] stores real per-season salaries from the gist; contract.amount is in BBGM
  // thousands. Without this sync, trade/cap logic uses the salary from the initial load year.
  const nextSeasonStr = `${nextYear - 1}-${String(nextYear).slice(-2)}`;
  // Upper bound: no real NBA salary exceeds $250M/year — guard against a corrupt
  // contractYears entry (e.g. guaranteed stored in the wrong unit) cascading
  // into contract.amount during rollover. Mirrors the LOAD_GAME repair.
  const SANE_GUARANTEED_USD = 250_000_000;
  const SANE_AMOUNT_THOUSANDS = 250_000;
  const syncedContractAmount = (p: NBAPlayer): number | undefined => {
    const cy = (p as any).contractYears as Array<{ season: string; guaranteed: number }> | undefined;
    if (!cy) return undefined;
    const entry = cy.find(e => e.season === nextSeasonStr);
    if (!entry || entry.guaranteed <= 0 || entry.guaranteed > SANE_GUARANTEED_USD) return undefined;
    const synced = Math.round(entry.guaranteed / 1000);
    if (synced <= 0 || synced > SANE_AMOUNT_THOUSANDS) return undefined;
    return synced;
  };

  const expiredIds = new Set<string>();
  const updatedPlayers: NBAPlayer[] = state.players.map(p => {
    // Snapshot OVR at end of season for career progression chart
    // Stored as ovrHistory: Array<{ season, ovr }> — one entry per completed season
    if (p.overallRating && p.tid !== -2 && !(p as any).diedYear) {
      const existing: any[] = (p as any).ovrHistory ?? [];
      if (!existing.some((h: any) => h.season === currentYear)) {
        p = { ...p, ovrHistory: [...existing, { season: currentYear, ovr: p.overallRating }] } as any;
      }
    }

    // Everyone ages (retired, external, FA, contracted) except deceased players and unborn prospects
    if ((p as any).diedYear) return p;                   // deceased — do not age
    if (p.tid === -2) return p;                          // future draft prospect — birth year is source of truth

    const EXTERNAL_LEAGUES = ['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'];
    // tid >= 100: non-NBA team roster slot (WNBA ≥3000, Euroleague ≥1000, etc.) — never convert to NBA FA
    if ((p as any).status === 'Retired' || EXTERNAL_LEAGUES.includes((p as any).status ?? '') || p.tid >= 100 || !p.contract || p.tid < 0) {
      // Retired / external league / unsigned — age but freeze roster (no contract changes, no FA conversion)
      return typeof p.age === 'number' ? { ...p, age: p.age + 1 } as NBAPlayer : p;
    }

    const contractExp: number = p.contract.exp ?? 0;
    const newAge = typeof p.age === 'number' ? p.age + 1 : p.age;

    // Team option declined → player becomes FA (restricted if rookie + restrictedFA flag)
    if (teamOptionDeclinedIds.has(p.internalId)) {
      expiredIds.add(p.internalId);
      const isRFA = !!(p as any).contract?.restrictedFA;
      return {
        ...p,
        age: newAge,
        tid: -1,
        status: 'Free Agent' as const,
        yearsWithTeam: 0,
        midSeasonExtensionDeclined: undefined,
        contract: { ...p.contract, hasTeamOption: false, restrictedFA: isRFA, isRestrictedFA: isRFA },
      } as any;
    }

    // Team option exercised → strip hasTeamOption flag, contract stays until contract.exp
    if (teamOptionExercisedIds.has(p.internalId)) {
      const nextAmt = syncedContractAmount(p);
      return {
        ...p,
        age: newAge,
        yearsWithTeam: ((p as any).yearsWithTeam ?? 0) + 1,
        midSeasonExtensionDeclined: undefined,
        contract: { ...p.contract, hasTeamOption: false, teamOptionExp: undefined, ...(nextAmt ? { amount: nextAmt } : {}) },
      } as any;
    }

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
        twoWay: undefined,                     // two-way status cleared — becomes standard FA
        playoffEligible: undefined,            // reset — new season, everyone starts eligible
        contract: { ...p.contract, hasPlayerOption: false }, // option consumed
      } as any;
    }

    // Still under contract — increment yearsWithTeam, compute superMaxEligible
    const yrsWithTeam = ((p as any).yearsWithTeam ?? 0) + 1;
    const hasBirdRights =
      (state.leagueStats.birdRightsEnabled ?? true) && yrsWithTeam >= 3
        ? true
        : (p as any).hasBirdRights ?? false;

    // Super-max eligibility: Bird Rights + (8+ years service OR recent All-NBA/MVP/DPOY)
    const supermaxEnabled = state.leagueStats.supermaxEnabled ?? true;
    const yearsOfService = ((p as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
    const awards: Array<{ season: number; type: string }> = (p as any).awards ?? [];
    const hasSupermaxAward = awards.some(a =>
      a.season >= currentYear - 2 && /all.nba|mvp|defensive player|dpoy/i.test(a.type),
    );
    const superMaxEligible = supermaxEnabled && hasBirdRights && (yearsOfService >= 8 || hasSupermaxAward);

    const nextAmt = syncedContractAmount(p);
    return {
      ...p, age: newAge, yearsWithTeam: yrsWithTeam, hasBirdRights, superMaxEligible, midSeasonExtensionDeclined: undefined,
      ...(nextAmt ? { contract: { ...p.contract, amount: nextAmt } } : {}),
    } as any;
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
        inflationMax:     ls.inflationMax     ?? 10,
        inflationAverage: ls.inflationAverage ?? 5.5,
        inflationStdDev:  ls.inflationStdDev  ?? 2.0,
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

  // ── 3c. Farewell tour flags for the UPCOMING season ──────────────────────
  // After retirees are removed, identify players who will likely retire at the
  // end of the NEXT season and mark them as farewell tour.
  const { players: playersWithFarewells, newFarewells } = runFarewellTourChecks(playersAfterRetire, currentYear);

  // ── 3d. Top up future draft classes ──────────────────────────────────────
  // Each rollover pushes the horizon one year further. Top up so the player
  // always has 4 populated classes ahead (currentYear+1 through +4 at this point,
  // since nextYear is now the "current" season).
  const fillResult = ensureDraftClasses(playersWithFarewells, nextYear);
  const playersWithDraftClasses = fillResult.additions.length > 0
    ? [...playersWithFarewells, ...fillResult.additions]
    : playersWithFarewells;

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

  // ── Team option news items ───────────────────────────────────────────────
  const teamOptionNewsItems = teamOptionNews.map((text, i) => ({
    id: `team-option-${currentYear}-${i}-${Date.now()}`,
    headline: text.split(',')[0] ?? text,
    content: text,
    date: state.date,
    type: 'roster' as const,
    isNew: true,
    read: false,
  }));

  // ── Team option history entries ──────────────────────────────────────────
  const teamOptionHistoryEntries = teamOptionNews.map(text => ({
    text,
    date: `Jun 29, ${currentYear}`,
    type: 'Signing' as const,
  }));

  // ── Retirement history entries ────────────────────────────────────────────
  const retirementHistoryEntries = newRetirees.map((r: RetireeRecord) => {
    const pgStr = r.careerGP > 0
      ? ` ${(r.careerPts / r.careerGP).toFixed(1)} PPG / ${(r.careerReb / r.careerGP).toFixed(1)} RPG / ${(r.careerAst / r.careerGP).toFixed(1)} APG`
      : '';
    const accolades: string[] = [];
    if (r.allStarAppearances > 0) accolades.push(`${r.allStarAppearances}× All-Star`);
    if (r.championships > 0) accolades.push(`${r.championships}× Champion`);
    const accoladeStr = accolades.length > 0 ? ` (${accolades.join(', ')})` : '';
    return {
      text: `${r.name} has retired at age ${r.age}.${accoladeStr}${pgStr} over ${r.careerGP} career games.`,
      date: state.date,
      type: 'Retirement' as const,
    };
  });

  // ── Farewell tour news items ──────────────────────────────────────────────
  const farewellNewsItems = newFarewells.map((r: FarewellRecord, i: number) => {
    const accolades: string[] = [];
    if (r.allStarAppearances > 0) accolades.push(`${r.allStarAppearances}× All-Star`);
    if (r.championships > 0) accolades.push(`${r.championships}× Champion`);
    const accoladeStr = accolades.length > 0 ? ` (${accolades.join(', ')})` : '';
    const headline = r.isLegend
      ? `${r.name} Set for Farewell Tour Season`
      : `${r.name} May Be Playing Final Season`;
    return {
      id: `farewell-${r.playerId}-${Date.now()}-${i}`,
      headline,
      content: `${r.name} (age ${r.age})${accoladeStr} is expected to retire at the end of the upcoming season. Sources close to the player say this will likely be his final year.`,
      date: state.date,
      type: (r.isLegend ? 'player' : 'roster') as any,
      isNew: true,
      read: false,
    };
  });

  // ── Farewell tour history entries ─────────────────────────────────────────
  const farewellHistoryEntries = newFarewells.map((r: FarewellRecord) => ({
    text: `${r.name} (age ${r.age}) is entering what is expected to be his final season.`,
    date: state.date,
    type: 'Retirement' as const,
  }));

  console.log(
    `[SeasonRollover] ${currentYear} → ${nextYear} | ` +
    `Cap: $${(state.leagueStats.salaryCap ?? 0) / 1_000_000 | 0}M → $${capM}M (${pctStr}) | ` +
    `${expiredIds.size} contracts expired | ` +
    `${teamOptionExercisedIds.size} team opts exercised | ` +
    `${teamOptionDeclinedIds.size} team opts declined | ` +
    `${newRetirees.length} retirements | ${newFarewells.length} farewell tours | ` +
    `${updatedPicks.length} total draft picks`
  );

  // ── Bets pruning — drop resolved bets (won/lost) older than 2 seasons ────
  const cutoffDate = `${currentYear - 1}-10-01`; // beginning of the season 2 years ago
  const prunedBets = (state.bets ?? []).filter(b => b.status === 'pending' || b.date >= cutoffDate);

  // ── Box score pruning ─────────────────────────────────────────────────────
  // Keep only the last maxBoxScoreYears seasons of game results.
  // GameResult.date is a locale string like "Oct 24, 2025"; extract year from tail.
  const maxBoxScoreYears = SettingsManager.getSettings().maxBoxScoreYears ?? 2;
  const boxScoreCutoffYear = currentYear - maxBoxScoreYears; // keep games from this year onward
  const prunedBoxScores = (state.boxScores ?? []).filter(g => {
    // Drop exhibition game box scores (negative team IDs: All-Star, Rising Stars, Celebrity)
    // so next season's All-Star Weekend starts with a clean slate
    if (g.homeTeamId < 0 || g.awayTeamId < 0) return false;
    const parts = g.date?.split(',');
    const yr = parts ? parseInt(parts[parts.length - 1]?.trim() ?? '0', 10) : 0;
    return yr > boxScoreCutoffYear;
  });

  // ── Reset team W-L for new season ───────────────────────────────────────────
  // Archive completed season record to team.seasons[], then zero out wins/losses.
  // Emits both {wins, losses} AND {won, lost} so BBGM-style consumers and sim-style
  // consumers all read correctly without per-site fallback logic.
  const teamsReset = state.teams.map(t => {
    const existingSeasons: any[] = (t as any).seasons ?? [];
    const existingRecord = existingSeasons.find((s: any) => Number(s.season) === currentYear);
    // Preserve any playoffRoundsWon already stamped by lazySimRunner's bracket-complete hook.
    const existingPlayoffRoundsWon = existingRecord?.playoffRoundsWon;
    const seasonRecord = {
      // Carry forward any other fields BBGM may have seeded (imgURLSmall, etc.)
      ...(existingRecord ?? {}),
      season: currentYear,
      wins: t.wins,
      losses: t.losses,
      won: t.wins,
      lost: t.losses,
      playoffRoundsWon: existingPlayoffRoundsWon ?? 0,
    };
    // Replace the stale pre-seeded entry if one exists; otherwise append.
    // BBGM imports pre-seed a current-year entry with 0-0 that would shadow the
    // real record if we kept it; always overwrite on rollover.
    const nextSeasons = existingRecord
      ? existingSeasons.map((s: any) => Number(s.season) === currentYear ? seasonRecord : s)
      : [...existingSeasons, seasonRecord];
    return {
      ...t,
      wins: 0,
      losses: 0,
      streak: { type: 'W' as const, count: 0 },  // reset streak so "rock bottom" news doesn't fire
      seasons: nextSeasons,
    };
  });

  return {
    players: playersWithDraftClasses,
    teams: teamsReset,
    draftPicks: updatedPicks,
    bets: prunedBets,
    boxScores: prunedBoxScores,
    schedule: [],          // clear old season schedule so autoGenerateSchedule runs fresh
    christmasGames: [],
    globalGames: state.globalGames ?? [],
    ...({
      // Archive completed playoff bracket so HistoricalPlayoffBracket can show sim-generated seasons
      historicalPlayoffs: {
        ...((state as any).historicalPlayoffs ?? {}),
        ...(state.playoffs ? { [currentYear]: state.playoffs } : {}),
      },
    } as any),
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
      mleUsage: {},  // reset MLE usage each season
      // Inflate league revenue floor alongside the cap so sponsorship/merch/tickets
      // scale with the economy rather than sitting flat forever.
      revenue: Math.round((state.leagueStats.revenue ?? 0) * (newSalaryCap / (state.leagueStats.salaryCap || newSalaryCap))),
      // Inflate mediaRights revenue inputs so BroadcastingView formula stays
      // consistent with the inflated leagueStats.salaryCap, and unlock so the
      // commissioner can re-finalize a new deal each season.
      ...(state.leagueStats.mediaRights ? {
        mediaRights: {
          ...state.leagueStats.mediaRights,
          salaryCap: newSalaryCap / 1_000_000,
          totalRev:  (state.leagueStats.mediaRights.totalRev  ?? 0) * (newSalaryCap / (state.leagueStats.salaryCap || newSalaryCap)),
          mediaRev:  (state.leagueStats.mediaRights.mediaRev  ?? 0) * (newSalaryCap / (state.leagueStats.salaryCap || newSalaryCap)),
          lpRev:     (state.leagueStats.mediaRights.lpRev     ?? 0) * (newSalaryCap / (state.leagueStats.salaryCap || newSalaryCap)),
          isLocked:  false,
        },
      } : {}),
    },
    retirementAnnouncements: newRetirees,
    seasonPreviewDismissed: true,  // stays hidden through FA; shown when preseason starts (Oct 1)
    draftComplete: undefined,      // reset so draft can run for new year
    news: [...farewellNewsItems, ...teamOptionNewsItems, ...playerOptionNewsItems, ...retirementNewsItems, rolloverNews, ...(state.news ?? [])].slice(0, 200),
    history: [...(state.history ?? []), ...playerOptionHistory, ...teamOptionHistoryEntries, ...retirementHistoryEntries, ...farewellHistoryEntries],
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
