import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { GameState, UserAction } from '../../types';
import { generateAIBids, isPlausibleActiveMarket } from '../../services/freeAgencyBidding';
import {
  getCurrentOffseasonEffectiveFAStart,
  getCurrentOffseasonFAMoratoriumEnd,
  parseGameDate,
} from '../../utils/dateUtils';
import {
  getBiannualExceptionAvailability,
  getCapThresholds,
  getMLEAvailability,
  getTeamHardCapUSD,
  getTeamPayrollUSD,
} from '../../utils/salaryUtils';
import { getTwoWayRosterLimit } from '../../utils/rosterLimits';
import { submitPbaLocalFreeAgencyBid } from '../../services/pba/localFreeAgencyAi';
import { areTwoWayContractsEnabled } from '../../utils/contractTypes';
import {
  areWnbaDevelopmentalContractsEnabled,
  getWnbaDevelopmentalBaseStipendUSD,
  isWnbaDevelopmentalServiceEligible,
} from '../../services/wnba/developmentalContracts';
import { normalizeAspireSideDeal, type AspireSideDeal } from '../../services/aspireSideDeals';
import { isUnavailableInternationalTournamentPlayer } from '../../utils/prospectUtils';
import { applyFAMarketTickPass } from '../logic/turn/simulation/freeAgencyMarketPass';
import { buildFreeAgencyDailySummary, mergeFreeAgencySummaries } from '../../services/freeAgency/freeAgencyDailySummary';

type SetGameState = Dispatch<SetStateAction<GameState>>;

type HandleFaBiddingDispatchActionArgs = {
  action: UserAction;
  setState: SetGameState;
  stateRef: MutableRefObject<GameState>;
};

export function handleFaBiddingDispatchAction({
  action,
  setState,
  stateRef,
}: HandleFaBiddingDispatchActionArgs): boolean {
  if (action.type === 'SUBMIT_FA_BID') {
    const {
      playerId,
      playerName,
      teamId,
      teamName,
      teamLogoUrl,
      salaryUSD,
      years,
      option,
      twoWay,
      nonGuaranteed,
      fundingSource = 'standard',
      mleType,
      aspireSideDeal,
    } = action.payload as {
      playerId: string;
      playerName: string;
      teamId: number;
      teamName: string;
      teamLogoUrl?: string;
      salaryUSD: number;
      years: number;
      option: 'NONE' | 'PLAYER' | 'TEAM';
      twoWay?: boolean;
      nonGuaranteed?: boolean;
      fundingSource?: 'standard' | 'mle' | 'biannual';
      mleType?: 'room' | 'non_taxpayer' | 'taxpayer' | null;
      aspireSideDeal?: AspireSideDeal;
    };
    setState(prev => {
      if (prev.leagueStats?.uiMode === 'euro_isolated') return prev;
      if (prev.leagueStats?.uiMode === 'pba_isolated') {
        return submitPbaLocalFreeAgencyBid(prev, {
          playerId,
          playerName,
          teamId,
          teamName,
          teamLogoUrl,
          salaryUSD,
          years,
        });
      }
      const playerOptionsActive = prev.leagueStats?.playerOptionsEnabled !== false;
      const developmentalBid = !!twoWay && areWnbaDevelopmentalContractsEnabled(prev.leagueStats);
      const finalOption = developmentalBid ? 'NONE' : option === 'PLAYER' && !playerOptionsActive ? 'NONE' : option;
      const twoWayLegal = !!twoWay && areTwoWayContractsEnabled(prev.leagueStats) && getTwoWayRosterLimit(prev.leagueStats as any) > 0;
      const nonGuaranteedLegal = !!nonGuaranteed && prev.leagueStats?.nonGuaranteedContractsEnabled !== false;
      const currentDay = prev.day ?? 0;
      const currentPlayer = prev.players.find(p => p.internalId === playerId);
      if (!currentPlayer || isUnavailableInternationalTournamentPlayer(currentPlayer)) return prev;
      const finalAspireSideDeal = normalizeAspireSideDeal(prev, teamId, playerId, salaryUSD, aspireSideDeal);
      if (aspireSideDeal && !finalAspireSideDeal) return prev;
      if (finalAspireSideDeal) {
        const reservedAspireUSD = (prev.faBidding?.markets ?? [])
          .filter(market => !market.resolved && market.playerId !== playerId)
          .flatMap(market => market.bids ?? [])
          .filter(bid => bid.isUserBid && bid.status === 'active')
          .reduce((sum, bid) => sum + Number(bid.aspireSideDeal?.amountUSD ?? 0), 0);
        if (reservedAspireUSD + finalAspireSideDeal.amountUSD > Number(prev.stats?.personalWealth ?? 0) * 1_000_000) return prev;
      }
      if (twoWay && !twoWayLegal) return prev;
      if (developmentalBid && currentPlayer && !isWnbaDevelopmentalServiceEligible(currentPlayer, prev.leagueStats.year, prev.leagueStats)) return prev;
      const bidSalaryUSD = developmentalBid ? getWnbaDevelopmentalBaseStipendUSD(prev.leagueStats) : salaryUSD;
      const bidYears = developmentalBid ? 1 : years;
      const currentTeam = prev.teams.find(team => team.id === teamId);
      if (!currentTeam) return prev;
      const thresholds = getCapThresholds(prev.leagueStats);
      const teamPayroll = getTeamPayrollUSD(
        prev.players,
        teamId,
        currentTeam,
        prev.leagueStats.year,
        prev.leagueStats,
      );
      if (
        !twoWayLegal && teamPayroll + bidSalaryUSD >
        getTeamHardCapUSD(prev.leagueStats, thresholds, teamId, prev.leagueStats.year)
      ) return prev;
      const totalSeasons = Math.max(1, Math.floor(bidYears));
      if (!twoWayLegal && fundingSource === 'biannual') {
        const bae = getBiannualExceptionAvailability({
          teamId,
          payrollUSD: teamPayroll,
          signingUSD: bidSalaryUSD,
          contractSeasons: totalSeasons,
          acquisitionType: 'signing',
          season: prev.leagueStats.year,
          currentDate: prev.date,
          schedule: prev.schedule,
          thresholds,
          leagueStats: prev.leagueStats,
        });
        if (bae.blocked) return prev;
      }
      if (!twoWayLegal && fundingSource === 'mle') {
        const mle = getMLEAvailability(teamId, teamPayroll, bidSalaryUSD, thresholds, prev.leagueStats);
        if (mle.blocked || mle.type !== mleType || bidSalaryUSD > mle.available) return prev;
      }
      if (prev.gameMode === 'gm' && currentPlayer && (currentPlayer.tid === -1 || currentPlayer.status === 'Free Agent') && prev.date) {
        const currentDate = parseGameDate(prev.date);
        const faStart = getCurrentOffseasonEffectiveFAStart(currentDate, prev.leagueStats as any, prev.schedule as any);
        if (currentDate < faStart) return prev;
      }
      const moratoriumEndDay = (() => {
        if (!prev.date) return currentDay + 4;
        const currentDate = parseGameDate(prev.date);
        const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(currentDate, prev.leagueStats as any, prev.schedule as any);
        if (isNaN(currentDate.getTime()) || isNaN(moratoriumEnd.getTime())) return currentDay + 4;
        return currentDay + Math.max(0, Math.ceil((moratoriumEnd.getTime() - currentDate.getTime()) / 86_400_000));
      })();
      const decisionDay = Math.max(currentDay + 4, moratoriumEndDay + 4);
      const playerById = new Map(prev.players.map(p => [p.internalId, p]));
      const markets = (prev.faBidding?.markets ?? [])
        .filter((market: any) => market.resolved || isPlausibleActiveMarket(market, prev, playerById.get(market.playerId) ?? currentPlayer))
        .filter((market: any) => !(market.resolved && market.playerId === playerId))
        .map((market: any) => ({ ...market, bids: [...(market.bids ?? [])] }));
      const newUserBid = {
        id: `user-bid-${playerId}-${teamId}-${Date.now()}`,
        playerId,
        teamId,
        teamName,
        teamLogoUrl,
        salaryUSD: bidSalaryUSD,
        years: bidYears,
        option: finalOption,
        ...(twoWayLegal ? { twoWay: true } : {}),
        ...(nonGuaranteedLegal ? { nonGuaranteed: true } : {}),
        fundingSource: twoWayLegal ? 'standard' : fundingSource,
        ...(!twoWayLegal && fundingSource === 'mle' ? { mleType: mleType ?? null } : {}),
        ...(finalAspireSideDeal ? { aspireSideDeal: finalAspireSideDeal } : {}),
        isUserBid: true,
        submittedDay: currentDay,
        expiresDay: decisionDay,
        status: 'active' as const,
      };
      const aiCounterBids = currentPlayer ? generateAIBids(currentPlayer, prev, 5) : [];
      const existingIdx = markets.findIndex(market => market.playerId === playerId && !market.resolved);
      if (existingIdx >= 0) {
        const existing = markets[existingIdx];
        const existingDecisionDay = Math.max(
          existing.decidesOnDay ?? decisionDay,
          decisionDay,
          ...aiCounterBids.map(bid => bid.expiresDay ?? decisionDay),
        );
        const withoutPrior = existing.bids.filter(bid => !bid.isUserBid);
        const existingAiTeamIds = new Set(withoutPrior.map(bid => bid.teamId));
        const newCounterBids = aiCounterBids
          .filter(bid => !existingAiTeamIds.has(bid.teamId))
          .map(bid => ({ ...bid, expiresDay: Math.max(bid.expiresDay ?? existingDecisionDay, existingDecisionDay) }));
        markets[existingIdx] = {
          ...existing,
          bids: [...withoutPrior, ...newCounterBids, { ...newUserBid, expiresDay: existingDecisionDay }],
          decidesOnDay: existingDecisionDay,
          season: existing.season ?? (prev.leagueStats?.year ?? new Date().getFullYear()),
          openedDay: existing.openedDay ?? currentDay,
          openedDate: existing.openedDate ?? prev.date,
        };
      } else {
        const marketDecisionDay = Math.max(decisionDay, ...aiCounterBids.map(bid => bid.expiresDay ?? decisionDay));
        markets.push({
          playerId,
          playerName,
          bids: [
            ...aiCounterBids.map(bid => ({ ...bid, expiresDay: Math.max(bid.expiresDay ?? marketDecisionDay, marketDecisionDay) })),
            { ...newUserBid, expiresDay: marketDecisionDay },
          ],
          decidesOnDay: marketDecisionDay,
          resolved: false,
          season: prev.leagueStats?.year ?? new Date().getFullYear(),
          openedDay: currentDay,
          openedDate: prev.date,
        });
      }
      const stored = markets.find(market => market.playerId === playerId && !market.resolved);
      console.log(`[SUBMIT_FA_BID] Stored user bid for ${playerName} → ${teamName}: $${(salaryUSD / 1_000_000).toFixed(1)}M/${years}yr. Market entry: resolved=${stored?.resolved}, decidesOnDay=${stored?.decidesOnDay}, totalBids=${stored?.bids?.length ?? 0}`);
      return { ...prev, faBidding: { markets } };
    });
    return true;
  }

  if (action.type === 'MATCH_RFA_OFFER' || action.type === 'DECLINE_RFA_OFFER') {
    const { playerId } = (action as any).payload as { playerId: string };
    const decision = action.type === 'MATCH_RFA_OFFER' ? 'match' : 'decline';
    setState(prev => {
      const markets = prev.faBidding?.markets ?? [];
      const idx = markets.findIndex(market => market.playerId === playerId && market.pendingMatch);
      if (idx < 0) return prev;
      const market = markets[idx];
      if (prev.gameMode !== 'gm' || market.pendingMatchPriorTid !== prev.userTeamId) return prev;
      const markedMarket = { ...market, manualRfaDecision: decision };
      const resolved = applyFAMarketTickPass({
        ...prev,
        faResolveAllToday: true,
        faBidding: { markets: [markedMarket] },
      }).stateWithSim;
      const resolvedMarket = resolved.faBidding?.markets?.find(candidate => candidate.playerId === playerId);
      const resolvedPlayer = resolved.players.find(player => player.internalId === playerId);
      if (!resolvedMarket?.resolved || resolvedPlayer?.tid == null || resolvedPlayer.tid < 0) {
        return { ...prev, lastOutcome: `The offer-sheet ${decision} could not be completed. Review roster and cap space, then try again.` };
      }
      const summary = buildFreeAgencyDailySummary(
        prev,
        resolved,
        prev.pendingFreeAgencySummary?.day ?? 1,
        prev.pendingFreeAgencySummary?.totalDays ?? 15,
      );
      summary.decisions.forEach(item => {
        if (item.playerId === playerId) item.isUserTarget = true;
      });
      const mergedSummary = mergeFreeAgencySummaries(prev.pendingFreeAgencySummary, summary, true);
      return {
        ...resolved,
        faResolveAllToday: prev.faResolveAllToday,
        faBidding: {
          markets: markets.map((candidate, index) => index === idx ? resolvedMarket : candidate),
        },
        pendingRFAOfferSheets: ((prev as any).pendingRFAOfferSheets ?? []).filter((sheet: any) => sheet.playerId !== playerId),
        pendingFreeAgencySummary: {
          ...mergedSummary,
          combined: prev.pendingFreeAgencySummary?.combined,
          commissionerReview: prev.pendingFreeAgencySummary?.commissionerReview,
          signingConfirmation: prev.pendingFreeAgencySummary?.signingConfirmation,
        },
        lastOutcome: null,
      };
    });
    return true;
  }

  return false;
}
