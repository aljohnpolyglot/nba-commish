import type { GameState, NBAPlayer } from '../types';
import { INITIAL_LEAGUE_STATS } from '../constants';
import { getCapThresholds, getMLEAvailability, getTeamPayrollUSD, hasBirdRights } from '../utils/salaryUtils';
import {
  canSignMultiYear,
  compareGameDates,
  getCurrentOffseasonEffectiveFAStart,
  getCurrentOffseasonFAMoratoriumEnd,
  getGameDateParts,
  isInMoratorium,
  isPastTradeDeadline,
  parseGameDate,
  toISODateString,
} from '../utils/dateUtils';
import { getOffseasonState, logOffseasonDrift } from './offseason/offseasonState';
import {
  generateAIBids,
  getRFAPriorTid,
  isPlausibleActiveMarket,
  type FreeAgentBid,
  type FreeAgentMarket,
} from './freeAgencyBidding';
import { buildEmptyMarketTickResult, isLoyalMarketBlocked, isPostPreseason, isPreseasonCampWindow } from './faMarketTickerUtils';
import { resolveDueMarkets, resolvePendingRfaMatches, withdrawExhaustedTeamBids } from './faMarketTickerResolution';
import { collectPendingPlayerIds, openNewMarkets } from './faMarketTickerOpening';
import type { MarketTickResult } from './faMarketTickerTypes';

export type { MarketTickResult } from './faMarketTickerTypes';

function withBackgroundNbaEconomy(state: GameState): GameState {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return state;
  const current = state.leagueStats as any;
  const nbaDefaults = INITIAL_LEAGUE_STATS as any;
  return {
    ...state,
    leagueStats: {
      ...current,
      uiMode: 'nba',
      currency: 'USD',
      salaryCapEnabled: true,
      salaryCapType: nbaDefaults.salaryCapType ?? 'soft',
      salaryCap: nbaDefaults.salaryCap,
      luxuryPayroll: nbaDefaults.luxuryPayroll,
      luxuryTaxEnabled: nbaDefaults.luxuryTaxEnabled ?? true,
      apronsEnabled: nbaDefaults.apronsEnabled ?? true,
      minimumPayrollEnabled: nbaDefaults.minimumPayrollEnabled ?? true,
      minContractType: nbaDefaults.minContractType,
      minContractStaticAmount: nbaDefaults.minContractStaticAmount,
      maxContractType: nbaDefaults.maxContractType,
      maxContractStaticPercentage: nbaDefaults.maxContractStaticPercentage,
      mleEnabled: nbaDefaults.mleEnabled ?? true,
      biannualEnabled: nbaDefaults.biannualEnabled ?? true,
      playerOptionsEnabled: nbaDefaults.playerOptionsEnabled ?? true,
      rookieScaleType: nbaDefaults.rookieScaleType,
      maxPlayersPerTeam: nbaDefaults.maxPlayersPerTeam ?? 15,
      maxStandardPlayersPerTeam: nbaDefaults.maxStandardPlayersPerTeam ?? 15,
      twoWayContractsEnabled: nbaDefaults.twoWayContractsEnabled ?? true,
      maxTwoWayPlayersPerTeam: nbaDefaults.maxTwoWayPlayersPerTeam ?? 3,
      mleUsage: current.backgroundNbaMleUsage ?? {},
    },
  };
}

export function tickFAMarkets(state: GameState): MarketTickResult {
  const pbaBackgroundMode = state.leagueStats?.uiMode === 'pba_isolated';
  const marketState = withBackgroundNbaEconomy(state);
  const currentDay = marketState.day;
  const currentYear = marketState.leagueStats?.year ?? new Date().getFullYear();
  const playerById = new Map(marketState.players.map(p => [p.internalId, p]));

  if (marketState.leagueStats?.uiMode === 'euro_isolated') {
    return buildEmptyMarketTickResult();
  }

  if (marketState.date) {
    const os = getOffseasonState(marketState.date, marketState.leagueStats as any, marketState.schedule as any);
    logOffseasonDrift(
      'faMarketTicker.tickFAMarkets',
      ['moratorium', 'birdRights', 'openFA', 'preCamp'],
      os.phase,
      `date=${os.dateStr}`,
    );
  }

  const signedPlayerIds = new Set<string>();
  const playerMutations = new Map<string, Partial<NBAPlayer>>();
  const historyEntries: MarketTickResult['historyEntries'] = [];
  const newsItems: MarketTickResult['newsItems'] = [];
  const socialPosts: MarketTickResult['socialPosts'] = [];
  const userBidResolutions: MarketTickResult['userBidResolutions'] = [];

  const emitUserBidRejection = (market: FreeAgentMarket, playerName: string, opts: { winnerTeamName?: string; reason?: string }) => {
    for (const bid of market.bids) {
      if (!bid.isUserBid || bid.status !== 'active') continue;
      userBidResolutions.push({
        playerName,
        accepted: false,
        winnerTeamName: opts.winnerTeamName,
        annualM: Math.round(bid.salaryUSD / 100_000) / 10,
        salaryUSD: bid.salaryUSD,
        years: bid.years,
        rejectionReason: opts.reason,
      });
    }
  };

  const allMarkets = marketState.faBidding?.markets ?? [];
  const existing: FreeAgentMarket[] = [];
  for (const market of allMarkets) {
    const player = playerById.get(market.playerId);
    if (!market.resolved && player && player.tid !== -1) {
      console.warn(`[FA-MARKET] closed stale market — player already rostered: ${player.name}`);
      emitUserBidRejection(market, player.name, { reason: 'player is already rostered' });
      existing.push({
        ...market,
        resolved: true,
        bids: market.bids.map(b => b.status === 'active'
          ? { ...b, status: b.isUserBid ? 'rejected' as const : 'withdrawn' as const }
          : b),
      });
      continue;
    }
    if (market.resolved || isPlausibleActiveMarket(market, state, player)) {
      existing.push(market);
      continue;
    }
    if (market.bids.some(b => b.isUserBid)) {
      const reason = !player
        ? 'player vanished from state'
        : player.tid >= 0
          ? `player.tid=${player.tid} (signed by ${marketState.teams.find(t => t.id === player.tid)?.name ?? 'unknown team'})`
          : `player.status=${player.status}, decidesOnDay=${market.decidesOnDay}, openedDay=${(market as any).openedDay}, currentDay=${currentDay}`;
      console.warn(`[FA-MARKET] Dropping user-bid market for ${market.playerName ?? player?.name ?? market.playerId}: ${reason}`);
    }
    if (!player) emitUserBidRejection(market, market.playerName ?? 'Unknown', { reason: 'is no longer available' });
    else if (player.tid >= 0) emitUserBidRejection(market, player.name, { winnerTeamName: marketState.teams.find(t => t.id === player.tid)?.name ?? 'another team' });
    else emitUserBidRejection(market, player.name, { reason: 'market closed before resolution' });
  }

  const workingMarkets: FreeAgentMarket[] = existing.map(m => ({ ...m, bids: [...m.bids] }));
  const rfaOfferSheets: MarketTickResult['rfaOfferSheets'] = [];
  const rfaMatchResolutions: MarketTickResult['rfaMatchResolutions'] = [];
  const userBidRejectedForCap = new Set<string>();
  const localMleUsage: NonNullable<GameState['leagueStats']>['mleUsage'] = {
    ...(((marketState.leagueStats as any)?.mleUsage ?? {}) as any),
  };
  let mleUsageChanged = false;

  const newlyCommittedForTeam = (teamId: number): number =>
    Array.from(playerMutations.values())
      .filter(mut => mut.tid === teamId && mut.contract?.amount != null)
      .reduce((sum, mut) => sum + ((mut.contract?.amount ?? 0) * 1_000), 0);

  const maxStandardRoster = ((marketState.leagueStats as any)?.maxStandardPlayersPerTeam
    ?? (marketState.leagueStats as any)?.maxPlayersPerTeam
    ?? 15) as number;
  const maxTrainingCampRoster = ((marketState.leagueStats as any)?.maxTrainingCampRoster ?? 21) as number;
  const effectiveMaxRoster = isPreseasonCampWindow(marketState.date, marketState.leagueStats as any)
    ? maxTrainingCampRoster
    : maxStandardRoster;

  const getProjectedStandardRosterCount = (teamId: number): number => {
    let count = 0;
    for (const player of marketState.players) {
      if (player.tid === teamId && !(player as any).twoWay) count++;
    }
    for (const mutation of playerMutations.values()) {
      if (mutation.tid === teamId && !(mutation as any).twoWay) count++;
    }
    return count;
  };

  const getMleTypeForBid = (bid: FreeAgentBid, player: NBAPlayer, payrollUSD: number): 'room' | 'non_taxpayer' | 'taxpayer' | null => {
    const priorTid = getRFAPriorTid(player);
    if (bid.teamId === priorTid && hasBirdRights(player)) return null;
    const thresholds = getCapThresholds(marketState.leagueStats as any);
    const capSpace = thresholds.salaryCap - payrollUSD;
    if (capSpace >= bid.salaryUSD) return null;
    const mle = getMLEAvailability(bid.teamId, payrollUSD, bid.salaryUSD, thresholds, {
      ...(marketState.leagueStats as any),
      mleUsage: localMleUsage,
    });
    return !mle.blocked && bid.salaryUSD <= mle.available ? mle.type : null;
  };

  const consumeMleForBid = (teamId: number, type: 'room' | 'non_taxpayer' | 'taxpayer' | null, salaryUSD: number) => {
    if (!type) return;
    const prior = localMleUsage?.[teamId];
    localMleUsage[teamId] = {
      type,
      usedUSD: (prior?.type === type ? (prior.usedUSD ?? 0) : 0) + salaryUSD,
    };
    mleUsageChanged = true;
  };

  const runUserCounterBidPass = (): boolean => {
    let userMarketCountered = false;
    for (let i = 0; i < workingMarkets.length; i++) {
      const market = workingMarkets[i];
      if (market.resolved || market.pendingMatch) continue;
      const hasActiveUserBid = market.bids.some(b => b.isUserBid && b.status === 'active');
      const hasActiveAiBid = market.bids.some(b => !b.isUserBid && b.status === 'active');
      if (!hasActiveUserBid || hasActiveAiBid) continue;
      const player = marketState.players.find(p => p.internalId === market.playerId);
      if (!player || player.tid >= 0 || player.status !== 'Free Agent') continue;

      const aiBids = generateAIBids(player, marketState, 5);
      if (aiBids.length === 0) continue;
      const decisionDay = Math.max(
        market.decidesOnDay ?? currentDay,
        currentDay + 2,
        moratoriumEndDay,
        ...aiBids.map(b => b.expiresDay ?? currentDay),
      );
      const existingTeamIds = new Set(market.bids.map(b => b.teamId));
      const freshAiBids = aiBids
        .filter(b => !existingTeamIds.has(b.teamId))
        .map(b => ({ ...b, expiresDay: Math.max(b.expiresDay ?? decisionDay, decisionDay) }));
      if (freshAiBids.length === 0) continue;

      workingMarkets[i] = {
        ...market,
        bids: [
          ...market.bids.map(b => b.status === 'active'
            ? { ...b, expiresDay: Math.max(b.expiresDay ?? decisionDay, decisionDay) }
            : b),
          ...freshAiBids,
        ],
        decidesOnDay: decisionDay,
        season: market.season ?? currentYear,
        openedDay: market.openedDay ?? currentDay,
        openedDate: market.openedDate ?? marketState.date,
      };
      userMarketCountered = true;
      console.log(`[FA-MARKET] Added ${freshAiBids.length} AI counter-bids to user market for ${player.name}.`);
    }
    return userMarketCountered;
  };

  const closeBlockedLoyalMarkets = (): void => {
    for (let i = 0; i < workingMarkets.length; i++) {
      const market = workingMarkets[i];
      if (market.resolved) continue;
      const player = marketState.players.find(p => p.internalId === market.playerId);
      if (!player) continue;
      const activeBids = market.bids.filter(b => b.status === 'active');
      if (activeBids.length === 0 || activeBids.some(b => b.isUserBid)) continue;
      if (isLoyalMarketBlocked(player, activeBids.map(b => b.teamId), currentYear)) {
        workingMarkets[i] = {
          ...market,
          resolved: true,
          bids: market.bids.map(b => b.status === 'active' ? { ...b, status: 'rejected' as const } : b),
        };
      }
    }
  };

  const dateParts = marketState.date ? getGameDateParts(marketState.date) : null;
  const inSummerFAWindow = !!dateParts && dateParts.month >= 7 && dateParts.month <= 9;
  if (inSummerFAWindow) {
    const effectiveFAStart = toISODateString(getCurrentOffseasonEffectiveFAStart(marketState.date, marketState.leagueStats as any, marketState.schedule as any));
    if (compareGameDates(marketState.date, effectiveFAStart) < 0) {
      return {
        updatedMarkets: workingMarkets,
        signedPlayerIds,
        playerMutations,
        historyEntries,
        newsItems,
        socialPosts,
        pendingPlayerIds: collectPendingPlayerIds(workingMarkets),
        userBidResolutions,
        rfaOfferSheets,
        rfaMatchResolutions,
        shouldStopSim: false,
      };
    }
  }

  const postPreseasonResolve = isPostPreseason(marketState.date);
  const allowMultiYearResolve = canSignMultiYear(marketState.date, currentYear, marketState.leagueStats as any);
  const postDeadlineResolve = isPastTradeDeadline(marketState.date, currentYear, marketState.leagueStats as any);
  const resolutionMaxYears = postDeadlineResolve && !allowMultiYearResolve ? 1 : postPreseasonResolve ? 2 : Infinity;
  const moratoriumActive = isInMoratorium(marketState.date, currentYear, marketState.leagueStats as any, marketState.schedule as any);
  const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(marketState.date, marketState.leagueStats as any, marketState.schedule as any);
  const moratoriumEndDay = (() => {
    if (!marketState.date) return currentDay;
    const today = parseGameDate(marketState.date);
    if (isNaN(today.getTime()) || isNaN(moratoriumEnd.getTime())) return currentDay;
    return currentDay + Math.max(0, Math.ceil((moratoriumEnd.getTime() - today.getTime()) / 86_400_000));
  })();

  if (moratoriumActive) {
    for (let i = 0; i < workingMarkets.length; i++) {
      const market = workingMarkets[i];
      if (market.resolved || (market.decidesOnDay ?? 0) >= moratoriumEndDay) continue;
      workingMarkets[i] = {
        ...market,
        decidesOnDay: moratoriumEndDay,
        bids: market.bids.map(b => b.status === 'active'
          ? { ...b, expiresDay: Math.max(b.expiresDay ?? moratoriumEndDay, moratoriumEndDay) }
          : b),
      };
    }
  }

  const resolutionContext = {
    state: marketState,
    currentDay,
    currentYear,
    workingMarkets,
    signedPlayerIds,
    playerMutations,
    historyEntries,
    newsItems,
    socialPosts,
    userBidResolutions,
    rfaOfferSheets,
    rfaMatchResolutions,
    userBidRejectedForCap,
    effectiveMaxRoster,
    resolutionMaxYears,
    moratoriumActive,
    moratoriumEndDay,
    emitUserBidRejection,
    newlyCommittedForTeam,
    getProjectedStandardRosterCount,
    getMleTypeForBid,
    consumeMleForBid,
    localMleUsage,
  };

  const userMarketCountered = runUserCounterBidPass();
  resolveDueMarkets(resolutionContext);
  resolvePendingRfaMatches(resolutionContext);
  withdrawExhaustedTeamBids(resolutionContext);
  closeBlockedLoyalMarkets();
  openNewMarkets({ state: marketState, currentDay, currentYear, workingMarkets, moratoriumEndDay });

  const pendingPlayerIds = collectPendingPlayerIds(workingMarkets);
  const shouldStopSim = userMarketCountered || userBidResolutions.length > 0 || rfaOfferSheets.length > 0;

  return {
    updatedMarkets: workingMarkets,
    ...(mleUsageChanged ? {
      leagueStats: pbaBackgroundMode
        ? { ...(state.leagueStats as any), backgroundNbaMleUsage: localMleUsage }
        : { ...(marketState.leagueStats as any), mleUsage: localMleUsage },
    } : {}),
    signedPlayerIds,
    playerMutations,
    historyEntries,
    newsItems,
    socialPosts,
    pendingPlayerIds,
    rfaOfferSheets,
    rfaMatchResolutions,
    userBidResolutions,
    shouldStopSim,
  };
}
