/**
 * AIFreeAgentHandler.ts
 *
 * Autonomous AI free-agent signings + mid-season extensions.
 * Spec: multiseason_todo.md §3
 */

import type { GameState, NBAPlayer, NBATeam } from '../types';
import { getCapThresholds, getTeamCapProfileFromState, computeContractOffer, getMLEAvailability, getContractLimits, contractToUSD } from '../utils/salaryUtils';
import type { MleType } from '../utils/salaryUtils';
import { SettingsManager } from './SettingsManager';
import { computeMoodScore } from '../utils/mood/moodScore';
import type { MoodTrait } from '../utils/mood/moodTypes';
import { calcPot2K } from './trade/tradeValueEngine';
import { getGMAttributes, clampSpendOffer, workEthicSignProb } from './staff/gmAttributes';
import { resolveTeamStrategyProfile, type TeamStrategyProfile } from '../utils/teamStrategy';
import { isRfaMatchingEnabled } from '../utils/ruleFlags';
import { computeTradeEligibleDate } from '../utils/signingMoratorium';
import { getTrainingCampDate, parseGameDate } from '../utils/dateUtils';
import { getOffseasonState, logOffseasonDrift } from './offseason/offseasonState';
import { projectYearEndCash, computeAnnualBudget } from './tycoon/budgetEngine';
import { getDeclinedTeamOptionInfo } from './freeAgencyBidding';
import {
  clampOfferForDate,
  defaultMaxRoster,
  getActiveFAMarketPlayerIds,
  getBestFit,
  getK2Ovr,
  getLoyalPriorTid,
  getMinSalaryUSD,
  isLoyalBlocked,
  isPlayerRFA,
  isRecentWaiverByTeam,
  isTwoWayOriginEligible,
  pickContractLabel,
  playerAge,
  resolveUserTeamId,
  rollPriorTeamMatch,
  sharesPosition,
  withNbaBackgroundEconomy,
} from './freeAgency/aiFreeAgencyHelpers';
import { createCampInviteEvaluator, createRoundSigner, getProjectedApronHardBlock, type FreeAgencyRoundContext } from './freeAgency/roundShared';
import type {
  BirdRightsResignResult,
  ExtensionResult,
  MleSwapResult,
  PromotionResult,
  SigningResult,
  WaiverResult,
} from './freeAgency/passTypes';
import { autoPromoteTwoWayExcessPass, autoTrimOversizedRostersPass } from './freeAgency/rosterTrimPass';
import { runAIMidSeasonExtensionsPass, runAISeasonEndExtensionsPass } from './freeAgency/extensionPasses';
import { runAIBirdRightsResignsPass } from './freeAgency/birdRightsResignPass';
import { runAIMleUpgradeSwapsPass } from './freeAgency/mleSwapPass';
import { runRosterCompletionPasses, runTwoWayAndCampPasses } from './freeAgency/roundRosterFillPasses';

// ── §3c: Main signing round ───────────────────────────────────────────────────
export type {
  BirdRightsResignResult,
  ExtensionResult,
  MleSwapResult,
  PromotionResult,
  SigningResult,
  WaiverResult,
} from './freeAgency/passTypes';

/**
 * Run one round of AI FA signings.
 * Returns mutations to apply to state.players (set tid for each signed player).
 */
export function runAIFreeAgencyRound(state: GameState): SigningResult[] {
  if (!SettingsManager.getSettings().allowAIFreeAgency) return [];
  state = withNbaBackgroundEconomy(state);

  // Offseason orchestrator drift check (Session 1 — instrumentation only).
  // AI FA passes 1-5 should not run during the moratorium (verbal-only window).
  // 'inSeason' is allowed because mid-season fill / 10-day signings legitimately
  // call this; 'preDraft'/'draftDay'/'postDraft' should not.
  if (state.date) {
    const os = getOffseasonState(state.date, state.leagueStats as any, state.schedule as any);
    logOffseasonDrift(
      'AIFreeAgentHandler.runAIFreeAgencyRound',
      ['birdRights', 'openFA', 'preCamp', 'inSeason'],
      os.phase,
      `date=${os.dateStr}`,
    );
  }

  const results: SigningResult[] = [];
  const userTeamId = resolveUserTeamId(state);
  if (state.gameMode === 'gm' && userTeamId === -999) {
    console.warn('[AI-FA] GM mode userTeamId missing; cannot exclude user team from AI free agency.');
    return [];
  }
  const isUserTeam = (teamId: number) =>
    state.gameMode === 'gm' && teamId === userTeamId;

  // Players with an active FA bidding market are reserved by `faMarketTicker` —
  // the round must not poach them on a non-resolution day.
  const marketPendingIds = getActiveFAMarketPlayerIds(state);
  let pool = state.players
    .filter(p => p.tid < 0 && p.status === 'Free Agent' && !((p as any).draft?.year >= state.leagueStats.year))
    .filter(p => !marketPendingIds.has(p.internalId));
  if (pool.length === 0) return [];

  const strategyByTeam = new Map<number, TeamStrategyProfile>();
  const getStrategy = (team: NBATeam) => {
    const cached = strategyByTeam.get(team.id);
    if (cached) return cached;
    const next = resolveTeamStrategyProfile({
      team,
      players: state.players,
      teams: state.teams,
      leagueStats: state.leagueStats,
      currentYear: state.leagueStats.year,
      gameMode: state.gameMode,
      userTeamId: (state as any).userTeamId,
    });
    strategyByTeam.set(team.id, next);
    return next;
  };

  const sortedAITeams = [...state.teams]
    .filter(t => {
      if (!isUserTeam(t.id)) return true;
      console.warn('[AI-FA] SKIPPING user team fill');
      return false;
    })
    .sort((a, b) =>
      getStrategy(b).freeAgentAggression - getStrategy(a).freeAgentAggression ||
      (((b as any).wins ?? 0) - ((a as any).wins ?? 0))
    );

  // Pass 1/4 always cap at 15; slots 16–21 belong to Pass 2 (2W) and Pass 3 (NG).
  const maxStandard = state.leagueStats.maxStandardPlayersPerTeam ?? state.leagueStats.maxPlayersPerTeam ?? defaultMaxRoster(state.leagueStats);

  // Track MLE spend within this round so a team can't double-spend before state updates
  const localMleUsed = new Map<number, { type: MleType; usedUSD: number }>();

  const thresholds = getCapThresholds(state.leagueStats as any);

  const currentYear = state.leagueStats.year;

  // ── Preseason window check (used by Two-way + NG passes + camp-invite) ──
  const ngEnabled = (state.leagueStats as any).nonGuaranteedContractsEnabled ?? true;
  const maxCampRoster = state.leagueStats.maxTrainingCampRoster ?? 21;
  const simDate = state.date ? parseGameDate(state.date) : null;
  const trainingCampStart = getTrainingCampDate(state.leagueStats.year, state.leagueStats as any);
  const trainingCampEnd = new Date(trainingCampStart.getTime() + 21 * 86_400_000);
  const isPreseasonWindow = ngEnabled && !!simDate && simDate >= trainingCampStart && simDate < trainingCampEnd;
  const roundContext = {
    state,
    currentYear,
    thresholds,
    maxStandard,
    sortedAITeams,
    results,
    pool,
    localMleUsed,
    marketPendingIds,
    isUserTeam,
    signPlayer: (() => {}) as FreeAgencyRoundContext['signPlayer'],
    isCampInvite: (() => false) as FreeAgencyRoundContext['isCampInvite'],
  } satisfies FreeAgencyRoundContext;
  roundContext.isCampInvite = createCampInviteEvaluator(state, thresholds, isPreseasonWindow, ngEnabled);
  roundContext.signPlayer = createRoundSigner(roundContext);

  // ── Pass 1: Best-fit signings via cap space + MLE; loops until roster full or cap exhausted.
  for (const team of sortedAITeams) {
    const rosterSizeStart = state.players.filter(p => p.tid === team.id && !(p as any).twoWay).length;
    if (rosterSizeStart >= maxStandard) continue;

    // work_ethic: lazy GMs sometimes skip a round of non-mandatory signings.
    // Fires ONCE per team per round (gates the whole fill loop, not each signing).
    const teamAttrs = getGMAttributes(state, team.id);
    if (Math.random() > workEthicSignProb(teamAttrs.work_ethic)) continue;
    const strategy = getStrategy(team);

    let signedThisIteration = true;
    while (signedThisIteration) {
      signedThisIteration = false;

      // Recompute roster + roundSpent each iteration
      const rosterSize = state.players.filter(p => p.tid === team.id && !(p as any).twoWay).length
                       + results.filter(r => r.teamId === team.id && !(r as any).twoWay).length;
      if (rosterSize >= maxStandard) break;

      const roundSpentUSD = results
        .filter(r => r.teamId === team.id)
        .reduce((s, r) => s + r.salaryUSD, 0);

      const best = getBestFit(team, roundContext.pool, state, strategy, localMleUsed, roundSpentUSD);
      if (!best) break;

      // Date-clamp before the spending overlay so post-Oct-21 length/salary cuts apply first.
      const baseOfferRaw = computeContractOffer(best, state.leagueStats as any);
      const baseOffer = clampOfferForDate(baseOfferRaw, state.date, currentYear, state.leagueStats, getK2Ovr(best));
      const bestLimits = getContractLimits(best, state.leagueStats as any);
      const offer = { ...baseOffer, salaryUSD: clampSpendOffer(baseOffer.salaryUSD, teamAttrs.spending, bestLimits.maxSalaryUSD) };

      // ── Aggregate apron ceiling — guard against LAC-2026 superteam runaway.
      // Per-signing gates pass individually but the cumulative burn balloons
      // 30+ M past 2nd apron with no aggregate brake. Compute projected payroll
      // (existing roster + everything signed this round + this offer) and gate
      // by 2nd apron multiplier. Hard ceiling at +50% refuses ALL signings;
      // tightening band at +25% refuses non-stars (K2 < 88).
      {
        const projProfile = getTeamCapProfileFromState(state, team.id, thresholds);
        if (getProjectedApronHardBlock(roundContext, team.id, offer.salaryUSD, getK2Ovr(best), projProfile.payrollUSD)) break;
      }

      // Strategy-aware spending governor: cap_clearing / rebuilding / development
      // teams must not be signing $50M stars in FA. Mirrors the gates already
      // applied to extensions (~line 1500) and Bird-Rights re-signs (~line 1819).
      // Without this Pass 1 happily ignores the team's own labeled strategy and
      // dumps payroll on non-young-core, exactly the LAC-2026 'Cap Clearing'
      // pathology where the strategy label was pure cosmetic.
      {
        const playerAgeNow = playerAge(best, currentYear);
        const k2Now = getK2Ovr(best);
        const minSalaryUSDStrategy = getMinSalaryUSD(state.leagueStats);
        const isCheapEnough = offer.salaryUSD <= minSalaryUSDStrategy * 2;
        if (!isCheapEnough && (strategy.key === 'rebuilding' || strategy.key === 'development' || strategy.key === 'cap_clearing')
            && (playerAgeNow > 25 || k2Now < 78)) break;
      }

      // Financial discipline: at 13+/15, multi-year mid-money to fringe K2 → stop and let Pass 3 fill.
      {
        const stdRosterCount = state.players.filter(p => p.tid === team.id && !(p as any).twoWay).length
          + results.filter(r => r.teamId === team.id && !(r as any).twoWay).length;
        const k2 = getK2Ovr(best);
        const seasonCap = (thresholds as any).salaryCap ?? 140_000_000;
        const offerPctOfCap = offer.salaryUSD / seasonCap;

        if (stdRosterCount >= 13 && offer.years > 1 && offerPctOfCap > 0.025 && k2 < 75) break;

        const samePosRotation = state.players
          .filter(p => p.tid === team.id && !(p as any).twoWay
            && sharesPosition(p.pos, best.pos)
            && (p.overallRating ?? 0) >= 65).length
          + results.filter(r => {
            if (r.teamId !== team.id || (r as any).twoWay) return false;
            const sp = state.players.find(p => p.internalId === r.playerId);
            return sp ? sharesPosition(sp.pos, best.pos) : false;
          }).length;
        if (samePosRotation >= 3 && offerPctOfCap > 0.025 && k2 < 78) break;

        if (stdRosterCount >= 14 && offer.years >= 3 && k2 < 78) break;
      }

      // Determine if this signing fits via cap (after subtracting in-flight spend) or MLE
      const profile = getTeamCapProfileFromState(state, team.id, thresholds);
      const effectiveCapSpace = profile.capSpaceUSD - roundSpentUSD;
      const effectivePayroll  = profile.payrollUSD  + roundSpentUSD;
      const isViaCap = offer.salaryUSD <= effectiveCapSpace;
      let mleTypeUsed: MleType = null;
      let mleAmountUSD = 0;

      if (!isViaCap) {
        // Signing is via MLE — figure out which type and record it locally
        const localEntry = localMleUsed.get(team.id);
        const effectiveLS = localEntry
          ? { ...state.leagueStats, mleUsage: { ...(state.leagueStats as any).mleUsage, [team.id]: localEntry } }
          : state.leagueStats;
        const mleAvail = getMLEAvailability(team.id, effectivePayroll, offer.salaryUSD, thresholds, effectiveLS as any);
        if (!mleAvail.blocked && mleAvail.type) {
          mleTypeUsed = mleAvail.type;
          mleAmountUSD = offer.salaryUSD;
          const prevUsed = localEntry?.usedUSD ?? 0;
          localMleUsed.set(team.id, { type: mleAvail.type, usedUSD: prevUsed + offer.salaryUSD });
        }
      }

      roundContext.signPlayer(best, team, offer, mleTypeUsed, mleAmountUSD, false, roundContext.isCampInvite(best, offer));
      signedThisIteration = true;
    }
  }
  runTwoWayAndCampPasses(roundContext, isPreseasonWindow, maxCampRoster);
  runRosterCompletionPasses(roundContext);

  return results;
}

export function autoTrimOversizedRosters(state: GameState, month?: number, day?: number): WaiverResult[] {
  return autoTrimOversizedRostersPass(withNbaBackgroundEconomy(state), month, day);
}

export function autoPromoteTwoWayExcess(state: GameState, month?: number): PromotionResult[] {
  return autoPromoteTwoWayExcessPass(withNbaBackgroundEconomy(state), month);
}

export function runAIMidSeasonExtensions(state: GameState): ExtensionResult[] {
  return runAIMidSeasonExtensionsPass(withNbaBackgroundEconomy(state));
}

export function runAISeasonEndExtensions(state: GameState): ExtensionResult[] {
  return runAISeasonEndExtensionsPass(withNbaBackgroundEconomy(state));
}

export function runAIBirdRightsResigns(state: GameState): BirdRightsResignResult[] {
  return runAIBirdRightsResignsPass(withNbaBackgroundEconomy(state));
}

export function runAIMleUpgradeSwaps(
  state: GameState,
  simMonth: number,
  simDay: number,
): MleSwapResult[] {
  return runAIMleUpgradeSwapsPass(withNbaBackgroundEconomy(state), simMonth, simDay);
}
