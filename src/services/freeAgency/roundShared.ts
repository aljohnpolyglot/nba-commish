import type { GameState, NBAPlayer, NBATeam } from '../../types';
import { getCapThresholds, getTeamHardCapUSD, getTeamPayrollUSD, type MleType } from '../../utils/salaryUtils';
import { getTwoWayRosterLimit } from '../../utils/rosterLimits';
import { areTwoWayContractsEnabled, isTwoWayContract } from '../../utils/contractTypes';
import { buildBudgetContext, computeAnnualBudget, projectYearEndCash } from '../tycoon/budgetEngine';
import { isRfaMatchingEnabled } from '../../utils/ruleFlags';
import { computeTradeEligibleDate } from '../../utils/signingMoratorium';
import { getDeclinedTeamOptionInfo } from '../freeAgencyBidding';
import { isOnRoster } from '../../utils/teamLookup';
import {
  getK2Ovr,
  getLoyalPriorTid,
  getMinSalaryUSD,
  isPlayerRFA,
  rollPriorTeamMatch,
} from './aiFreeAgencyHelpers';
import type { SigningResult } from './passTypes';
import { simDebug } from '../../utils/simDebug';
import { isUnavailableInternationalTournamentPlayer } from '../../utils/prospectUtils';

export interface FreeAgencyRoundContext {
  state: GameState;
  currentYear: number;
  thresholds: { salaryCap: number; firstApron: number; secondApron: number };
  maxStandard: number;
  maxTotalRoster: number;
  sortedAITeams: NBATeam[];
  results: SigningResult[];
  pool: NBAPlayer[];
  localMleUsed: Map<number, { type: MleType; usedUSD: number }>;
  localBaeUsed: Map<number, number>;
  marketPendingIds: Set<string>;
  isUserTeam: (teamId: number) => boolean;
  signPlayer: (
    player: NBAPlayer,
    team: NBATeam,
    offer: { salaryUSD: number; years: number; hasPlayerOption: boolean },
    mleTypeUsed?: MleType,
    mleAmountUSD?: number,
    twoWay?: boolean,
    nonGuaranteed?: boolean,
    baeAmountUSD?: number,
  ) => boolean;
  isCampInvite: (
    player: NBAPlayer,
    offer: { salaryUSD: number; years: number },
  ) => boolean;
}

export function getStandardRosterTargetAfterMarketReservations(
  state: GameState,
  teamId: number,
  maxStandard: number,
): number {
  const freeAgentIds = new Set(
    state.players
      .filter(player => player.tid < 0
        && player.status === 'Free Agent'
        && !isUnavailableInternationalTournamentPlayer(player))
      .map(player => player.internalId),
  );
  const reservedPlayerIds = new Set(
    (state.faBidding?.markets ?? [])
      .filter(market => !market.resolved && freeAgentIds.has(market.playerId))
      .filter(market => market.bids.some(bid =>
        bid.teamId === teamId
        && bid.status === 'active'
        && !(bid as typeof bid & { twoWay?: boolean }).twoWay,
      ))
      .map(market => market.playerId),
  );
  const configuredMinimum = Number(state.leagueStats?.minPlayersPerTeam ?? 0);
  const minimumStandard = Number.isFinite(configuredMinimum)
    ? Math.min(maxStandard, Math.max(0, Math.floor(configuredMinimum)))
    : 0;
  return Math.max(
    minimumStandard,
    maxStandard - Math.min(maxStandard, reservedPlayerIds.size),
  );
}

export function hasFreeAgencyTotalRosterCapacity(
  players: NBAPlayer[],
  pendingSignings: Array<{ teamId: number }>,
  teamId: number,
  maxTotalRoster: number,
): boolean {
  const currentRoster = players.filter(player => player.tid === teamId && isOnRoster(player)).length;
  const pendingRoster = pendingSignings.filter(signing => signing.teamId === teamId).length;
  return currentRoster + pendingRoster < maxTotalRoster;
}

export function createCampInviteEvaluator(
  state: GameState,
  thresholds: { salaryCap: number },
  isPreseasonWindow: boolean,
  ngEnabled: boolean,
) {
  return (
    player: NBAPlayer,
    offer: { salaryUSD: number; years: number },
  ): boolean => {
    if (!ngEnabled || !isPreseasonWindow) return false;
    if (offer.years > 1) return false;
    const seasonCap = Number.isFinite(thresholds.salaryCap)
      ? thresholds.salaryCap
      : Number((state.leagueStats as any)?.historicalContractScaleCap ?? 140_000_000);
    const offerPct = offer.salaryUSD / seasonCap;
    const ovr = player.overallRating ?? 0;
    if (offerPct <= 0.050 && ovr < 78) return true;
    if (offerPct <= 0.070 && ovr < 72) return true;
    if (offerPct <= 0.090 && ovr < 65) return true;
    return false;
  };
}

export function createRoundSigner(ctx: FreeAgencyRoundContext) {
  const { state, currentYear, maxStandard } = ctx;
  const rfaEnabled = isRfaMatchingEnabled(state.leagueStats);
  const maxTwoWay = getTwoWayRosterLimit(state.leagueStats as any);
  const isActiveTwoWay = (playerOrSigning: any): boolean => maxTwoWay > 0 && isTwoWayContract(playerOrSigning, state.leagueStats);

  const aiSigningWouldBankrupt = (
    team: NBATeam,
    offer: { salaryUSD: number },
  ): boolean => {
    if ((state.leagueStats as any)?.uiMode !== 'euro_isolated' || !(team as any).tycoon) return false;
    const roundSpendEUR = ctx.results
      .filter(r => r.teamId === team.id)
      .reduce((sum, r) => sum + r.salaryUSD, 0);
    const projected = projectYearEndCash(
      team,
      buildBudgetContext(state, team.id),
      roundSpendEUR + offer.salaryUSD,
      state.players,
    );
    return projected < 0;
  };

  const aiSigningExceedsWageCap = (
    team: NBATeam,
    offer: { salaryUSD: number },
  ): boolean => {
    if ((state.leagueStats as any)?.uiMode !== 'euro_isolated' || !(team as any).tycoon) return false;
    const tycoon = (team as any).tycoon;
    const ledger = computeAnnualBudget(team, buildBudgetContext(state, team.id), state.players);
    const projectedRevenue = (ledger.revenue.matchday ?? 0)
      + (ledger.revenue.commercial ?? 0)
      + (ledger.revenue.sponsorship ?? 0)
      + (ledger.revenue.tv ?? 0)
      + (ledger.revenue.prize ?? 0);
    if (projectedRevenue <= 0) return false;
    const roundSpendEUR = ctx.results
      .filter(r => r.teamId === team.id)
      .reduce((sum, r) => sum + r.salaryUSD, 0);
    const currentWages = (ledger.expenses.wages ?? 0);
    const projectedWages = currentWages + roundSpendEUR + offer.salaryUSD;
    const recent = (tycoon.ledgerHistory ?? []).slice(-2);
    const lossStreak = recent.length >= 2 && recent.every((l: any) => (l?.profit ?? 0) < 0);
    const wageRatioCap = lossStreak ? 0.60 : 0.75;
    return projectedWages / projectedRevenue > wageRatioCap;
  };

  return (
    player: NBAPlayer,
    team: NBATeam,
    offer: { salaryUSD: number; years: number; hasPlayerOption: boolean },
    mleTypeUsed: MleType = null,
    mleAmountUSD = 0,
    twoWay = false,
    nonGuaranteed = false,
    baeAmountUSD = 0,
  ) => {
    if (ctx.isUserTeam(team.id)) {
      simDebug('free-agency', () => '[AI-FA] Skipping user-team roster fill.', { teamId: team.id });
      return false;
    }
    if (twoWay) {
      if (!areTwoWayContractsEnabled(state.leagueStats) || maxTwoWay <= 0) return false;
      const twoWayCount = state.players.filter(p => p.tid === team.id && isActiveTwoWay(p)).length
        + ctx.results.filter(r => r.teamId === team.id && isActiveTwoWay(r)).length;
      if (twoWayCount >= maxTwoWay) return false;
    }
    if (nonGuaranteed && state.leagueStats?.nonGuaranteedContractsEnabled === false) return false;
    if (ctx.marketPendingIds.has(player.internalId)) {
      console.error(
        `[AI-FA] BLOCKED: ${team.name} tried to sign ${player.name} but a user bid market is open. ` +
        `Pool filter missed this — investigate runAIFreeAgencyRound pool computation vs faBidding.markets snapshot timing.`,
      );
      return false;
    }

    let finalTeam = team;
    let matchedOfferSheet = false;
    let offerSheetSigningTid: number | undefined;
    let offerSheetSigningTeamName: string | undefined;
    const joinedNewTeam = player.tid !== team.id;
    const totalYears = offer.years;
    const declinedTeamOption = getDeclinedTeamOptionInfo(player, currentYear);
    if (declinedTeamOption?.teamId === team.id && nonGuaranteed) return false;
    const offerAmountUSD = declinedTeamOption?.teamId === team.id
      ? Math.max(offer.salaryUSD, declinedTeamOption.salaryUSD)
      : offer.salaryUSD;
    const optionAllowed = state.leagueStats?.playerOptionsEnabled !== false;
    const optionSafeOffer = optionAllowed ? offer : { ...offer, hasPlayerOption: false };
    const finalOffer = offerAmountUSD === optionSafeOffer.salaryUSD ? optionSafeOffer : { ...optionSafeOffer, salaryUSD: offerAmountUSD };
    const minContractUSD = getMinSalaryUSD(state.leagueStats);
    const signedAsTwoWay = twoWay;

    if (rfaEnabled && !twoWay && isPlayerRFA(player)) {
      const priorTid = getLoyalPriorTid(player);
      if (priorTid >= 0 && priorTid !== team.id) {
        const priorTeam = state.teams.find(t => t.id === priorTid);
        if (priorTeam) {
          const priorRoster =
            state.players.filter(p => p.tid === priorTid && !isActiveTwoWay(p)).length +
            ctx.results.filter(r => r.teamId === priorTid && !isActiveTwoWay(r)).length;
          if (priorRoster < maxStandard && rollPriorTeamMatch(player, currentYear)) {
            finalTeam = priorTeam;
            matchedOfferSheet = true;
            offerSheetSigningTid = team.id;
            offerSheetSigningTeamName = team.name;
          }
        }
      }
    }

    if (ctx.isUserTeam(finalTeam.id)) {
      simDebug('free-agency', () => '[AI-FA] Skipping user-team roster fill.', { teamId: finalTeam.id });
      return false;
    }
    if (!hasFreeAgencyTotalRosterCapacity(state.players, ctx.results, finalTeam.id, ctx.maxTotalRoster)) return false;
    if (aiSigningWouldBankrupt(finalTeam, finalOffer)) return false;
    if (aiSigningExceedsWageCap(finalTeam, finalOffer)) return false;
    const finalTeamPayroll = getTeamPayrollUSD(
      state.players,
      finalTeam.id,
      finalTeam,
      currentYear,
      state.leagueStats,
    ) + ctx.results
      .filter(result => result.teamId === finalTeam.id && !isActiveTwoWay(result))
      .reduce((sum, result) => sum + result.salaryUSD, 0);
    const storedHardCap = getTeamHardCapUSD(
      state.leagueStats,
      getCapThresholds(state.leagueStats),
      finalTeam.id,
      currentYear,
    );
    const hardCap = (ctx.localBaeUsed.get(finalTeam.id) ?? 0) > 0
      && state.leagueStats.biannualFirstApronHardCapEnabled === true
      ? ctx.thresholds.firstApron
      : storedHardCap;
    if (!signedAsTwoWay && finalTeamPayroll + finalOffer.salaryUSD > hardCap) return false;
    const appliedBaeAmountUSD = matchedOfferSheet ? 0 : baeAmountUSD;
    if (appliedBaeAmountUSD > 0 && finalOffer.years > 2) return false;

    ctx.results.push({
      playerId: player.internalId,
      teamId: finalTeam.id,
      playerName: player.name,
      teamName: finalTeam.name,
      salaryUSD: finalOffer.salaryUSD,
      contractYears: finalOffer.years,
      contractExp: currentYear + finalOffer.years - 1,
      hasPlayerOption: finalOffer.hasPlayerOption,
      signedDate: state.date,
      tradeEligibleDate: computeTradeEligibleDate({
        signingDate: state.date,
        contractYears: totalYears,
        salaryUSDFirstYear: offerAmountUSD,
        prevSalaryUSDFirstYear: (player.contract?.amount ?? 0) * 1_000,
        usedBirdRights: !joinedNewTeam,
        isReSign: !joinedNewTeam,
        isMinimum: offerAmountUSD <= minContractUSD * 1.01,
        isTwoWay: !!signedAsTwoWay,
        leagueStats: state.leagueStats as any,
      }),
      ...(mleTypeUsed ? { mleTypeUsed, mleAmountUSD } : {}),
      ...(appliedBaeAmountUSD > 0 ? { baeAmountUSD: appliedBaeAmountUSD } : {}),
      ...(twoWay ? { twoWay: true } as any : {}),
      ...(nonGuaranteed ? { nonGuaranteed: true } : {}),
      ...(matchedOfferSheet ? { matchedOfferSheet, offerSheetSigningTid, offerSheetSigningTeamName } : {}),
    });
    ctx.pool = ctx.pool.filter(p => p.internalId !== player.internalId);
    return true;
  };
}

export function getProjectedApronHardBlock(
  ctx: FreeAgencyRoundContext,
  teamId: number,
  offerSalaryUSD: number,
  k2HardGate: number,
  currentPayrollUSD: number,
): boolean {
  const projRoundSpend = ctx.results
    .filter(result => result.teamId === teamId && result.twoWay !== true)
    .reduce((sum, result) => sum + result.salaryUSD, 0);
  const projectedPayroll = currentPayrollUSD + projRoundSpend + offerSalaryUSD;
  if (ctx.thresholds.secondApron <= 0) return false;
  if (projectedPayroll > ctx.thresholds.secondApron * 1.5) return true;
  if (projectedPayroll > ctx.thresholds.secondApron * 1.25 && k2HardGate < 88) return true;
  return false;
}
