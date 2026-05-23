import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { GameState, UserAction } from '../../types';
import { generateAIBids, isPlausibleActiveMarket } from '../../services/freeAgencyBidding';
import {
  getCurrentOffseasonEffectiveFAStart,
  getCurrentOffseasonFAMoratoriumEnd,
  parseGameDate,
} from '../../utils/dateUtils';
import { clearWaiverMarkers } from '../../utils/contractCleanup';

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
    const { playerId, playerName, teamId, teamName, teamLogoUrl, salaryUSD, years, option } = action.payload as {
      playerId: string;
      playerName: string;
      teamId: number;
      teamName: string;
      teamLogoUrl?: string;
      salaryUSD: number;
      years: number;
      option: 'NONE' | 'PLAYER' | 'TEAM';
    };
    setState(prev => {
      if (prev.leagueStats?.uiMode === 'euro_isolated') return prev;
      const currentDay = prev.day ?? 0;
      const currentPlayer = prev.players.find(p => p.internalId === playerId);
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
        salaryUSD,
        years,
        option,
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
      const markets = (prev.faBidding?.markets ?? []).slice();
      const idx = markets.findIndex(market => market.playerId === playerId && market.pendingMatch);
      if (idx < 0) return prev;
      const market = markets[idx];
      const userTid = (prev as any).userTeamId ?? -999;
      if (decision === 'match') {
        const offerBid = market.bids.find(bid => bid.id === market.pendingMatchOfferBidId);
        if (!offerBid) return prev;
        const player = prev.players.find(p => p.internalId === playerId);
        const team = prev.teams.find(t => t.id === userTid);
        if (!player || !team) return prev;
        const finalYears = offerBid.years;
        const currentYear = prev.leagueStats?.year ?? new Date().getFullYear();
        const newContract = {
          amount: Math.round(offerBid.salaryUSD / 1_000),
          exp: currentYear + finalYears - 1,
          hasPlayerOption: offerBid.option === 'PLAYER',
        };
        const newContractYears = Array.from({ length: finalYears }, (_, index) => {
          const year = currentYear + index;
          return {
            season: `${year - 1}-${String(year).slice(-2)}`,
            guaranteed: Math.round(offerBid.salaryUSD * Math.pow(1.05, index)),
            option: index === finalYears - 1 && offerBid.option === 'PLAYER' ? 'Player'
              : index === finalYears - 1 && offerBid.option === 'TEAM' ? 'Team' : '',
          };
        });
        const histYears = ((player as any).contractYears ?? []).filter((contractYear: any) => {
          const year = parseInt(contractYear.season.split('-')[0], 10) + 1;
          return year < currentYear;
        });
        const updatedPlayers = prev.players.map(item =>
          item.internalId === playerId
            ? clearWaiverMarkers({
                ...item,
                tid: userTid,
                status: 'Active' as const,
                contract: newContract,
                contractYears: [...histYears, ...newContractYears],
              } as any)
            : item,
        );
        markets[idx] = { ...market, resolved: true, pendingMatch: false, matchedByPriorTeam: true };
        const annualM = Math.round(offerBid.salaryUSD / 100_000) / 10;
        const totalM = Math.round(annualM * finalYears);
        const signingTeam = prev.teams.find(t => t.id === offerBid.teamId);
        const histEntry = {
          text: `${team.name} matched ${signingTeam?.name ?? 'opposing'} offer sheet on ${player.name}: $${totalM}M/${finalYears}yr.`,
          date: prev.date,
          type: 'Signing',
          playerIds: [player.internalId],
        };
        return {
          ...prev,
          players: updatedPlayers,
          faBidding: { markets },
          history: [...((prev as any).history ?? []), histEntry] as any,
        } as any;
      }

      markets[idx] = {
        ...market,
        pendingMatchExpiresDay: (prev.day ?? 0) - 1,
        pendingMatchPriorTid: -1,
      };
      return { ...prev, faBidding: { markets } };
    });
    return true;
  }

  return false;
}
