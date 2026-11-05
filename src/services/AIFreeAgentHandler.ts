/**
 * AIFreeAgentHandler.ts
 *
 * Autonomous AI free-agent signings + mid-season extensions.
 * Spec: multiseason_todo.md §3
 */

import type { GameState, NBAPlayer, NBATeam } from '../types';
import {
  computeContractOffer,
  contractToUSD,
  getBiannualExceptionAvailability,
  getCapThresholds,
  getContractLimits,
  getMLEAvailability,
  getTeamCapProfileFromState,
} from '../utils/salaryUtils';
import type { MleType } from '../utils/salaryUtils';
import { SettingsManager } from './SettingsManager';
import { computeMoodScore } from '../utils/mood/moodScore';
import type { MoodTrait } from '../utils/mood/moodTypes';
import { calcPot2K } from './trade/tradeValueEngine';
import { getGMAttributes, clampSpendOffer, workEthicSignProb } from './staff/gmAttributes';
import { resolveTeamStrategyProfile, type TeamStrategyProfile } from '../utils/teamStrategy';
import { isRfaMatchingEnabled } from '../utils/ruleFlags';
import { computeTradeEligibleDate } from '../utils/signingMoratorium';
import { getGameDateParts, getTrainingCampDate, parseGameDate } from '../utils/dateUtils';
import { getOffseasonState, logOffseasonDrift } from './offseason/offseasonState';
import { projectYearEndCash, computeAnnualBudget } from './tycoon/budgetEngine';
import { getDeclinedTeamOptionInfo } from './freeAgencyBidding';
import { getStandardRosterLimit, getTrainingCampRosterLimit, getTwoWayRosterLimit } from '../utils/rosterLimits';
import { isTwoWayContract } from '../utils/contractTypes';
import { isFutureDraftClassPlayer, isUnavailableInternationalTournamentPlayer } from '../utils/prospectUtils';
import {
  clampOfferForDate,
  getActiveFAMarketPlayerIds,
  getBestFit,
  getK2Ovr,
  getLoyalPriorTid,
  getMinSalaryUSD,
  isLoyalBlocked,
  isFreshWaiver,
  isPlayerRFA,
  isRecentWaiverByTeam,
  pickContractLabel,
  playerAge,
  resolveUserTeamId,
  rollPriorTeamMatch,
  sharesPosition,
  withNbaBackgroundEconomy,
} from './freeAgency/aiFreeAgencyHelpers';
import { createCampInviteEvaluator, createRoundSigner, getProjectedApronHardBlock, getStandardRosterTargetAfterMarketReservations, type FreeAgencyRoundContext } from './freeAgency/roundShared';
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
import { getLeagueCalendarDates } from './leagueCalendar';
import {
  getCentralDailyTeamSigningLimit,
  getCentralFreeAgencyEligiblePlayerIds,
  isCentralFreeAgencyCampMarket,
  isCentralFreeAgencyQualityEligible,
  shouldRunCentralRosterCompletion,
  type CentralFreeAgencyCadence,
} from './freeAgency/freeAgencyDecisionTiming';
import { simDebug } from '../utils/simDebug';
export { runEuroAIFreeAgencyRound } from './freeAgency/euroAiFreeAgency';

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
export function runAIFreeAgencyRound(
  state: GameState,
  centralCadence?: CentralFreeAgencyCadence,
): SigningResult[] {
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
    simDebug('free-agency', () => '[AI-FA] GM mode userTeamId missing; AI free agency did not run.');
    return [];
  }
  const isUserTeam = (teamId: number) =>
    state.gameMode === 'gm' && teamId === userTeamId;

  // Players with an active FA bidding market are reserved by `faMarketTicker` —
  // the round must not poach them on a non-resolution day.
  const marketPendingIds = getActiveFAMarketPlayerIds(state);
  const marketEligibilityYear = state.date ? getGameDateParts(state.date).year : state.leagueStats.year;
  let pool = state.players
    .filter(p => p.tid < 0 && p.status === 'Free Agent' && !isUnavailableInternationalTournamentPlayer(p) && !isFutureDraftClassPlayer(p, marketEligibilityYear))
    .filter(p => !isFreshWaiver(p, state.date))
    .filter(p => !marketPendingIds.has(p.internalId));
  if (centralCadence) {
    const priorityPool = [...pool].sort((left, right) =>
      getK2Ovr(right) - getK2Ovr(left)
      || (right.potential ?? 0) - (left.potential ?? 0)
      || left.internalId.localeCompare(right.internalId)
    );
    pool = pool.filter(player => isCentralFreeAgencyQualityEligible(getK2Ovr(player), centralCadence));
    const eligibleIds = getCentralFreeAgencyEligiblePlayerIds(
      priorityPool
        .filter(player => isCentralFreeAgencyQualityEligible(getK2Ovr(player), centralCadence))
        .map(player => player.internalId),
      state.leagueStats.year,
      centralCadence.day,
      centralCadence.totalDays,
    );
    pool = pool.filter(player => eligibleIds.has(player.internalId));
  }
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
      simDebug('free-agency', () => '[AI-FA] Skipping user-team roster fill.', { teamId: t.id });
      return false;
    })
    .sort((a, b) =>
      getStrategy(b).freeAgentAggression - getStrategy(a).freeAgentAggression ||
      (((b as any).wins ?? 0) - ((a as any).wins ?? 0))
    );

  const maxStandard = getStandardRosterLimit(state.leagueStats as any);
  const twoWayRosterActive = getTwoWayRosterLimit(state.leagueStats as any) > 0;
  const isActiveTwoWay = (playerOrSigning: any): boolean => twoWayRosterActive && isTwoWayContract(playerOrSigning, state.leagueStats);

  // Track MLE spend within this round so a team can't double-spend before state updates
  const localMleUsed = new Map<number, { type: MleType; usedUSD: number }>();
  const localBaeUsed = new Map<number, number>();

  const thresholds = getCapThresholds(state.leagueStats as any);

  const currentYear = state.leagueStats.year;
  const standardSigningLimit = getCentralDailyTeamSigningLimit(centralCadence);

  // ── Preseason window check (used by Two-way + NG passes + camp-invite) ──
  const ngEnabled = (state.leagueStats as any).nonGuaranteedContractsEnabled ?? true;
  const maxCampRoster = getTrainingCampRosterLimit(state.leagueStats as any);
  const simDate = state.date ? parseGameDate(state.date) : null;
  const trainingCampStart = getTrainingCampDate(state.leagueStats.year, state.leagueStats as any);
  const trainingCampEnd = new Date(trainingCampStart.getTime() + 21 * 86_400_000);
  const isPreseasonWindow = ngEnabled && !!simDate && simDate >= trainingCampStart && simDate < trainingCampEnd;
  const isLateCentralCampMarket = ngEnabled && isCentralFreeAgencyCampMarket(centralCadence);
  const calendarDates = getLeagueCalendarDates(currentYear, state.leagueStats);
  const isRegularSeasonRosterWindow = !!simDate
    && simDate >= calendarDates.regularSeasonStart
    && simDate <= calendarDates.regularSeasonEnd;
  const maxTotalRoster = isRegularSeasonRosterWindow && !centralCadence
    ? maxStandard + getTwoWayRosterLimit(state.leagueStats as any)
    : maxCampRoster;
  const roundContext = {
    state,
    currentYear,
    thresholds,
    maxStandard,
    maxTotalRoster,
    sortedAITeams,
    results,
    pool,
    localMleUsed,
    localBaeUsed,
    marketPendingIds,
    isUserTeam,
    signPlayer: (() => false) as FreeAgencyRoundContext['signPlayer'],
    isCampInvite: (() => false) as FreeAgencyRoundContext['isCampInvite'],
  } satisfies FreeAgencyRoundContext;
  roundContext.isCampInvite = createCampInviteEvaluator(
    state,
    thresholds,
    isPreseasonWindow || isLateCentralCampMarket,
    ngEnabled,
  );
  roundContext.signPlayer = createRoundSigner(roundContext);

  // ── Pass 1: Best-fit signings via cap space + MLE; loops until roster full or cap exhausted.
  for (const team of sortedAITeams) {
    const standardTarget = getStandardRosterTargetAfterMarketReservations(state, team.id, maxStandard);
    const rosterSizeStart = state.players.filter(p => p.tid === team.id && !isActiveTwoWay(p)).length;
    if (rosterSizeStart >= standardTarget) continue;

    // work_ethic: lazy GMs sometimes skip a round of non-mandatory signings.
    // Fires ONCE per team per round (gates the whole fill loop, not each signing).
    const teamAttrs = getGMAttributes(state, team.id);
    if (Math.random() > workEthicSignProb(teamAttrs.work_ethic)) continue;
    const strategy = getStrategy(team);

    let signedThisIteration = true;
    while (signedThisIteration) {
      signedThisIteration = false;

      const signedForTeamThisRound = results.filter(result =>
        result.teamId === team.id && !isActiveTwoWay(result)
      ).length;
      if (signedForTeamThisRound >= standardSigningLimit) break;

      // Recompute roster + roundSpent each iteration
      const rosterSize = state.players.filter(p => p.tid === team.id && !isActiveTwoWay(p)).length
                       + results.filter(r => r.teamId === team.id && !isActiveTwoWay(r)).length;
      if (rosterSize >= standardTarget) break;

      const roundSpentUSD = results
        .filter(r => r.teamId === team.id)
        .reduce((s, r) => s + r.salaryUSD, 0);

      const best = getBestFit(team, roundContext.pool, state, strategy, localMleUsed, localBaeUsed, roundSpentUSD);
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
        const stdRosterCount = state.players.filter(p => p.tid === team.id && !isActiveTwoWay(p)).length
          + results.filter(r => r.teamId === team.id && !isActiveTwoWay(r)).length;
        const k2 = getK2Ovr(best);
        const seasonCap = Number.isFinite((thresholds as any).salaryCap)
          ? (thresholds as any).salaryCap
          : Number((state.leagueStats as any).historicalContractScaleCap ?? 140_000_000);
        const offerPctOfCap = offer.salaryUSD / seasonCap;

        if (stdRosterCount >= 13 && offer.years > 1 && offerPctOfCap > 0.025 && k2 < 75) break;

        const samePosRotation = state.players
          .filter(p => p.tid === team.id && !isActiveTwoWay(p)
            && sharesPosition(p.pos, best.pos)
            && (p.overallRating ?? 0) >= 65).length
          + results.filter(r => {
            if (r.teamId !== team.id || isActiveTwoWay(r)) return false;
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
      let baeAmountUSD = 0;
      const priorBaeUsed = localBaeUsed.get(team.id) ?? 0;
      const priorMleEntry = localMleUsed.get(team.id);

      if (!isViaCap) {
        const localEntry = localMleUsed.get(team.id);
        const localBaeUsage = priorBaeUsed > 0
          ? {
              ...(state.leagueStats.capExceptionUsage?.[team.id] ?? { season: currentYear }),
              season: currentYear,
              hardCapLevel: 'first' as const,
            }
          : undefined;
        const effectiveLS = {
          ...state.leagueStats,
          ...(localEntry ? {
            mleUsage: { ...(state.leagueStats as any).mleUsage, [team.id]: localEntry },
          } : {}),
          ...(localBaeUsage ? {
            capExceptionUsage: {
              ...(state.leagueStats.capExceptionUsage ?? {}),
              [team.id]: localBaeUsage,
            },
          } : {}),
        };
        const mleAvail = getMLEAvailability(team.id, effectivePayroll, offer.salaryUSD, thresholds, effectiveLS as any);
        const baeAvail = getBiannualExceptionAvailability({
          teamId: team.id,
          payrollUSD: effectivePayroll,
          signingUSD: offer.salaryUSD,
          contractSeasons: offer.years,
          acquisitionType: 'signing',
          season: currentYear,
          currentDate: state.date,
          schedule: state.schedule,
          thresholds,
          leagueStats: effectiveLS,
        });
        const canUseBae = !isPlayerRFA(best)
          && offer.years <= 2
          && !baeAvail.blocked
          && offer.salaryUSD <= Math.max(0, baeAvail.available - priorBaeUsed);
        const shouldUseBae = canUseBae
          && (mleAvail.blocked || mleAvail.type === 'non_taxpayer')
          && getK2Ovr(best) < 80;
        if (shouldUseBae) {
          baeAmountUSD = offer.salaryUSD;
          localBaeUsed.set(team.id, priorBaeUsed + offer.salaryUSD);
        } else if (!mleAvail.blocked && mleAvail.type) {
          mleTypeUsed = mleAvail.type;
          mleAmountUSD = offer.salaryUSD;
          const prevUsed = localEntry?.usedUSD ?? 0;
          localMleUsed.set(team.id, { type: mleAvail.type, usedUSD: prevUsed + offer.salaryUSD });
        } else if (canUseBae) {
          baeAmountUSD = offer.salaryUSD;
          localBaeUsed.set(team.id, priorBaeUsed + offer.salaryUSD);
        } else {
          break;
        }
      }

      signedThisIteration = roundContext.signPlayer(
        best,
        team,
        offer,
        mleTypeUsed,
        mleAmountUSD,
        false,
        roundContext.isCampInvite(best, offer),
        baeAmountUSD,
      );
      if (!signedThisIteration) {
        if (priorMleEntry) localMleUsed.set(team.id, priorMleEntry);
        else localMleUsed.delete(team.id);
        if (priorBaeUsed > 0) localBaeUsed.set(team.id, priorBaeUsed);
        else localBaeUsed.delete(team.id);
      }
    }
  }
  runTwoWayAndCampPasses(
    roundContext,
    isPreseasonWindow || isLateCentralCampMarket,
    maxCampRoster,
    isLateCentralCampMarket ? 1 : Number.POSITIVE_INFINITY,
  );
  if (shouldRunCentralRosterCompletion(centralCadence)) {
    runRosterCompletionPasses(roundContext);
  }

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
