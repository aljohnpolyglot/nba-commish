import type { GameState, NBAPlayer } from '../types';
import { getContractLimits } from '../utils/salaryUtils';
import {
  canSignMultiYear,
  compareGameDates,
  daysBetweenGameDates,
  getCurrentOffseasonEffectiveFAStart,
  getCurrentOffseasonFAMoratoriumEnd,
  getGameDateParts,
  isPastTradeDeadline,
  parseGameDate,
  toISODateString,
} from '../utils/dateUtils';
import { isFutureDraftClassPlayer, isUnavailableInternationalTournamentPlayer } from '../utils/prospectUtils';
import {
  generateAIBids,
  getDeclinedTeamOptionInfo,
  getRFAPriorTid,
  type FreeAgentBid,
  type FreeAgentMarket,
} from './freeAgencyBidding';
import {
  isCentralFreeAgencyCampMarket,
  isCentralFreeAgencyQualityEligible,
  type CentralFreeAgencyCadence,
} from './freeAgency/freeAgencyDecisionTiming';
import {
  getK2,
  isCampInviteBid,
  isLoyalMarketBlocked,
  isPostPreseason,
  isPreseasonCampWindow,
  LATE_SEASON_K2_THRESHOLD,
  MARKET_K2_THRESHOLD,
  MAX_MARKETS_RESOLVING_PER_DAY,
  MAX_NEW_MARKETS_BURST,
  MAX_NEW_MARKETS_PER_DAY,
} from './faMarketTickerUtils';

interface OpenMarketsContext {
  state: GameState;
  currentDay: number;
  currentYear: number;
  workingMarkets: FreeAgentMarket[];
  moratoriumEndDay: number;
}

export function collectPendingPlayerIds(workingMarkets: FreeAgentMarket[]): Set<string> {
  return new Set(workingMarkets.filter(m => !m.resolved).map(m => m.playerId));
}

export function prepareInitialFAMarkets(state: GameState): FreeAgentMarket[] {
  const existing = [...(state.faBidding?.markets ?? [])];
  if (!state.date || state.leagueStats?.uiMode === 'euro_isolated' || state.leagueStats?.uiMode === 'pba_isolated') {
    return existing;
  }
  const effectiveStart = toISODateString(
    getCurrentOffseasonEffectiveFAStart(state.date, state.leagueStats, state.schedule),
  );
  if (compareGameDates(state.date, effectiveStart) < 0) return existing;

  const currentDay = Number(state.day ?? 0);
  const currentYear = Number(state.leagueStats?.year ?? getGameDateParts(state.date).year);
  const today = parseGameDate(state.date);
  const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(state.date, state.leagueStats, state.schedule);
  const moratoriumEndDay = Number.isFinite(today.getTime()) && Number.isFinite(moratoriumEnd.getTime())
    ? currentDay + Math.max(0, Math.ceil((moratoriumEnd.getTime() - today.getTime()) / 86_400_000))
    : currentDay;
  openNewMarkets({
    state,
    currentDay,
    currentYear,
    workingMarkets: existing,
    moratoriumEndDay,
  });
  return existing;
}

export function openNewMarkets(ctx: OpenMarketsContext): void {
  const postPreseason = isPostPreseason(ctx.state.date, ctx.state.leagueStats);
  const faCounter = Number(ctx.state.faTagCounter);
  const faTotal = Number(ctx.state.faTagsTotal);
  const centralCadence: CentralFreeAgencyCadence | undefined =
    ctx.state.offseasonChecklist?.freeAgency === 'in-progress'
    && Number.isFinite(faCounter)
    && Number.isFinite(faTotal)
      ? { day: Math.max(1, faCounter), totalDays: Math.max(1, faTotal) }
      : undefined;
  const campOfferWindow = isPreseasonCampWindow(ctx.state.date, ctx.state.leagueStats as any)
    || isCentralFreeAgencyCampMarket(centralCadence);
  const k2Floor = postPreseason ? LATE_SEASON_K2_THRESHOLD : centralCadence ? Number.NEGATIVE_INFINITY : MARKET_K2_THRESHOLD;
  const allowMultiYear = canSignMultiYear(ctx.state.date, ctx.currentYear, ctx.state.leagueStats as any);
  const postDeadline = isPastTradeDeadline(ctx.state.date, ctx.currentYear, ctx.state.leagueStats as any);
  const maxYearsThisTick = postDeadline && !allowMultiYear ? 1 : postPreseason ? 2 : Infinity;

  const resolvingTodayCount = ctx.workingMarkets
    .filter(m => !m.resolved && (m.decidesOnDay ?? 0) <= ctx.currentDay + 3)
    .length;
  const faElapsedDays = ctx.state.date
    ? daysBetweenGameDates(
        getCurrentOffseasonEffectiveFAStart(ctx.state.date, ctx.state.leagueStats, ctx.state.schedule),
        ctx.state.date,
      )
    : Number.POSITIVE_INFINITY;
  const isBurstWindow = faElapsedDays >= 0 && faElapsedDays < 3;
  const newMarketsCap = isBurstWindow ? MAX_NEW_MARKETS_BURST : MAX_NEW_MARKETS_PER_DAY;
  const activeMarketIds = collectPendingPlayerIds(ctx.workingMarkets);
  const REOPEN_COOLDOWN_DAYS = 3;
  const marketEligibilityYear = ctx.state.date
    ? getGameDateParts(ctx.state.date).year
    : ctx.currentYear;
  const managedTeamId = ctx.state.gameMode === 'gm' ? Number(ctx.state.userTeamId ?? -999) : -999;

  const unsignedTopFAs = ctx.state.players
    .filter(p => p.tid < 0
      && p.status === 'Free Agent'
      && !isUnavailableInternationalTournamentPlayer(p)
      && !isFutureDraftClassPlayer(p, marketEligibilityYear))
    .filter(p => !activeMarketIds.has(p.internalId))
    .filter(p => {
      const priorMarkets = ctx.workingMarkets.filter(m => m.playerId === p.internalId && m.resolved);
      if (priorMarkets.length === 0) return true;
      const latest = priorMarkets[priorMarkets.length - 1];
      if (latest.bids.some(b => b.status === 'accepted')) return false;
      const daysSinceResolved = ctx.currentDay - (latest.decidesOnDay ?? ctx.currentDay);
      return daysSinceResolved >= REOPEN_COOLDOWN_DAYS;
    })
    .map(player => ({
      player,
      k2: getK2(player),
      releasedByManagedTeam: managedTeamId >= 0 && getRFAPriorTid(player) === managedTeamId,
    }))
    .filter(x => x.k2 >= k2Floor && isCentralFreeAgencyQualityEligible(x.k2, centralCadence))
    .sort((a, b) => Number(b.releasedByManagedTeam) - Number(a.releasedByManagedTeam) || b.k2 - a.k2)
    .slice(0, newMarketsCap);

  let openedThisTick = 0;
  for (const { player, k2 } of unsignedTopFAs) {
    const maxBids = k2 >= 88 ? 5 : k2 >= 80 ? 4 : 3;
    const bids = generateAIBids(player, ctx.state, maxBids);
    if (bids.length === 0) continue;

    const limits = getContractLimits(player, ctx.state.leagueStats as any);
    const declinedTeamOption = getDeclinedTeamOptionInfo(player, ctx.currentYear);
    const clamped: FreeAgentBid[] = bids.map(bid => {
      const isDecliningTeamBid = declinedTeamOption?.teamId === bid.teamId;
      const salaryFloor = isDecliningTeamBid ? declinedTeamOption.salaryUSD : 0;
      const salaryUSD = Math.min(Math.max(bid.salaryUSD, salaryFloor), Math.round(limits.maxSalaryUSD));
      const years = campOfferWindow && k2 < 75
        ? 1
        : Math.min(bid.years, maxYearsThisTick);
      const option = bid.option === 'PLAYER' && ctx.state.leagueStats?.playerOptionsEnabled === false ? 'NONE' : bid.option;
      const nextBid = { ...bid, salaryUSD, years, option };
      if (isDecliningTeamBid) return nextBid;
      return ctx.state.leagueStats?.nonGuaranteedContractsEnabled !== false && isCampInviteBid(k2, nextBid, ctx.state)
        ? { ...nextBid, nonGuaranteed: true }
        : nextBid;
    });

    if (isLoyalMarketBlocked(player, clamped.map(b => b.teamId), ctx.currentYear)) continue;

    let decidesOnDay = Math.max(...clamped.map(b => b.expiresDay));
    decidesOnDay = Math.max(decidesOnDay, ctx.moratoriumEndDay);
    if (resolvingTodayCount + openedThisTick >= MAX_MARKETS_RESOLVING_PER_DAY) {
      const overflow = (resolvingTodayCount + openedThisTick) - MAX_MARKETS_RESOLVING_PER_DAY;
      decidesOnDay += 1 + Math.floor(overflow / MAX_MARKETS_RESOLVING_PER_DAY);
    }

    ctx.workingMarkets.push({
      playerId: player.internalId,
      playerName: player.name,
      bids: clamped,
      decidesOnDay,
      resolved: false,
      season: ctx.currentYear,
      openedDay: ctx.currentDay,
      openedDate: ctx.state.date,
    } as FreeAgentMarket);
    openedThisTick++;
  }
}
