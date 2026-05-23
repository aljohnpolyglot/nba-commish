import type { GameState, NBAPlayer } from '../types';
import { getContractLimits } from '../utils/salaryUtils';
import { canSignMultiYear, getGameDateParts, isPastTradeDeadline } from '../utils/dateUtils';
import {
  generateAIBids,
  getDeclinedTeamOptionInfo,
  type FreeAgentBid,
  type FreeAgentMarket,
} from './freeAgencyBidding';
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

export function openNewMarkets(ctx: OpenMarketsContext): void {
  const postPreseason = isPostPreseason(ctx.state.date);
  const k2Floor = postPreseason ? LATE_SEASON_K2_THRESHOLD : MARKET_K2_THRESHOLD;
  const allowMultiYear = canSignMultiYear(ctx.state.date, ctx.currentYear, ctx.state.leagueStats as any);
  const postDeadline = isPastTradeDeadline(ctx.state.date, ctx.currentYear, ctx.state.leagueStats as any);
  const maxYearsThisTick = postDeadline && !allowMultiYear ? 1 : postPreseason ? 2 : Infinity;

  const resolvingTodayCount = ctx.workingMarkets
    .filter(m => !m.resolved && (m.decidesOnDay ?? 0) <= ctx.currentDay + 3)
    .length;
  const dt = ctx.state.date ? getGameDateParts(ctx.state.date) : null;
  const isBurstWindow = !!dt && dt.month === 7 && dt.day <= 3;
  const newMarketsCap = isBurstWindow ? MAX_NEW_MARKETS_BURST : MAX_NEW_MARKETS_PER_DAY;
  const activeMarketIds = collectPendingPlayerIds(ctx.workingMarkets);
  const REOPEN_COOLDOWN_DAYS = 3;

  const unsignedTopFAs = ctx.state.players
    .filter(p => p.tid < 0 && p.status === 'Free Agent' && !((p as any).draft?.year >= ctx.currentYear))
    .filter(p => !activeMarketIds.has(p.internalId))
    .filter(p => {
      const priorMarkets = ctx.workingMarkets.filter(m => m.playerId === p.internalId && m.resolved);
      if (priorMarkets.length === 0) return true;
      const latest = priorMarkets[priorMarkets.length - 1];
      if (latest.bids.some(b => b.status === 'accepted')) return false;
      const daysSinceResolved = ctx.currentDay - (latest.decidesOnDay ?? ctx.currentDay);
      return daysSinceResolved >= REOPEN_COOLDOWN_DAYS;
    })
    .map(player => ({ player, k2: getK2(player) }))
    .filter(x => x.k2 >= k2Floor)
    .sort((a, b) => b.k2 - a.k2)
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
      const years = isPreseasonCampWindow(ctx.state.date, ctx.state.leagueStats as any) && k2 < 75
        ? 1
        : Math.min(bid.years, maxYearsThisTick);
      const nextBid = { ...bid, salaryUSD, years };
      if (isDecliningTeamBid) return nextBid;
      return isCampInviteBid(k2, nextBid, ctx.state)
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
