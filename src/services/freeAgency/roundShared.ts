import type { GameState, NBAPlayer, NBATeam } from '../../types';
import type { MleType } from '../../utils/salaryUtils';
import { computeAnnualBudget, projectYearEndCash } from '../tycoon/budgetEngine';
import { isRfaMatchingEnabled } from '../../utils/ruleFlags';
import { computeTradeEligibleDate } from '../../utils/signingMoratorium';
import { getDeclinedTeamOptionInfo } from '../freeAgencyBidding';
import {
  getK2Ovr,
  getLoyalPriorTid,
  getMinSalaryUSD,
  isPlayerRFA,
  rollPriorTeamMatch,
} from './aiFreeAgencyHelpers';
import type { SigningResult } from './passTypes';

export interface FreeAgencyRoundContext {
  state: GameState;
  currentYear: number;
  thresholds: { salaryCap: number; secondApron: number };
  maxStandard: number;
  sortedAITeams: NBATeam[];
  results: SigningResult[];
  pool: NBAPlayer[];
  localMleUsed: Map<number, { type: MleType; usedUSD: number }>;
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
  ) => void;
  isCampInvite: (
    player: NBAPlayer,
    offer: { salaryUSD: number; years: number },
  ) => boolean;
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
    const seasonCap = thresholds.salaryCap ?? 140_000_000;
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

  const aiSigningWouldBankrupt = (
    team: NBATeam,
    offer: { salaryUSD: number },
  ): boolean => {
    if ((state.leagueStats as any)?.uiMode !== 'euro_isolated' || !(team as any).tycoon) return false;
    const roundSpendEUR = ctx.results
      .filter(r => r.teamId === team.id)
      .reduce((sum, r) => sum + r.salaryUSD, 0);
    const projected = projectYearEndCash(team, {
      year: state.leagueStats.year,
      endesaFinishPosition: (team as any).lastEndesaFinish ?? 9,
      euroleagueStage: (team as any).lastEuroleagueStage ?? 'none',
      euroleagueAwayGames: (team as any).lastEuroAwayGames ?? 0,
      endesaPrizeEUR: 0,
      euroleaguePrizeEUR: 0,
    }, roundSpendEUR + offer.salaryUSD, state.players);
    return projected < 0;
  };

  const aiSigningExceedsWageCap = (
    team: NBATeam,
    offer: { salaryUSD: number },
  ): boolean => {
    if ((state.leagueStats as any)?.uiMode !== 'euro_isolated' || !(team as any).tycoon) return false;
    const tycoon = (team as any).tycoon;
    const ledger = computeAnnualBudget(team, {
      year: state.leagueStats.year,
      endesaFinishPosition: (team as any).lastEndesaFinish ?? 9,
      euroleagueStage: (team as any).lastEuroleagueStage ?? 'none',
      euroleagueAwayGames: (team as any).lastEuroAwayGames ?? 0,
      endesaPrizeEUR: 0,
      euroleaguePrizeEUR: 0,
    }, state.players);
    const projectedRevenue = (ledger.revenue.matchday ?? 0)
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
  ) => {
    if (ctx.isUserTeam(team.id)) {
      console.warn('[AI-FA] SKIPPING user team fill');
      return;
    }
    if (ctx.marketPendingIds.has(player.internalId)) {
      console.error(
        `[AI-FA] BLOCKED: ${team.name} tried to sign ${player.name} but a user bid market is open. ` +
        `Pool filter missed this — investigate runAIFreeAgencyRound pool computation vs faBidding.markets snapshot timing.`,
      );
      return;
    }

    let finalTeam = team;
    let matchedOfferSheet = false;
    let offerSheetSigningTid: number | undefined;
    let offerSheetSigningTeamName: string | undefined;
    const joinedNewTeam = player.tid !== team.id;
    const totalYears = offer.years;
    const declinedTeamOption = getDeclinedTeamOptionInfo(player, currentYear);
    if (declinedTeamOption?.teamId === team.id && nonGuaranteed) return;
    const offerAmountUSD = declinedTeamOption?.teamId === team.id
      ? Math.max(offer.salaryUSD, declinedTeamOption.salaryUSD)
      : offer.salaryUSD;
    const finalOffer = offerAmountUSD === offer.salaryUSD ? offer : { ...offer, salaryUSD: offerAmountUSD };
    const minContractUSD = getMinSalaryUSD(state.leagueStats);
    const signedAsTwoWay = twoWay;

    if (rfaEnabled && !twoWay && isPlayerRFA(player)) {
      const priorTid = getLoyalPriorTid(player);
      if (priorTid >= 0 && priorTid !== team.id) {
        const priorTeam = state.teams.find(t => t.id === priorTid);
        if (priorTeam) {
          const priorRoster =
            state.players.filter(p => p.tid === priorTid && !(p as any).twoWay).length +
            ctx.results.filter(r => r.teamId === priorTid && !(r as any).twoWay).length;
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
      console.warn('[AI-FA] SKIPPING user team fill');
      return;
    }
    if (aiSigningWouldBankrupt(finalTeam, finalOffer)) return;
    if (aiSigningExceedsWageCap(finalTeam, finalOffer)) return;

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
      ...(twoWay ? { twoWay: true } as any : {}),
      ...(nonGuaranteed ? { nonGuaranteed: true } : {}),
      ...(matchedOfferSheet ? { matchedOfferSheet, offerSheetSigningTid, offerSheetSigningTeamName } : {}),
    });
    ctx.pool = ctx.pool.filter(p => p.internalId !== player.internalId);
  };
}

export function getProjectedApronHardBlock(
  ctx: FreeAgencyRoundContext,
  teamId: number,
  offerSalaryUSD: number,
  k2HardGate: number,
  currentPayrollUSD: number,
): boolean {
  const projRoundSpend = ctx.results.filter(r => r.teamId === teamId).reduce((s, r) => s + r.salaryUSD, 0);
  const projectedPayroll = currentPayrollUSD + projRoundSpend + offerSalaryUSD;
  if (ctx.thresholds.secondApron <= 0) return false;
  if (projectedPayroll > ctx.thresholds.secondApron * 1.5) return true;
  if (projectedPayroll > ctx.thresholds.secondApron * 1.25 && k2HardGate < 88) return true;
  return false;
}
