import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { GameState, TransferBid, TransferListing, UserAction } from '../../types';
import { tickTransferMarket } from '../../services/transfer/transferMarketTicker';
import { isTransferMarketEligibleTid } from '../../services/transfer/marketEligibility';

type SetGameState = Dispatch<SetStateAction<GameState>>;

type HandleTransferMarketDispatchActionArgs = {
  action: UserAction;
  setState: SetGameState;
  stateRef: MutableRefObject<GameState>;
};

export function handleTransferMarketDispatchAction({
  action,
  setState,
  stateRef,
}: HandleTransferMarketDispatchActionArgs): boolean {
  if (action.type === 'LIST_PLAYER_FOR_TRANSFER') {
    const { playerId, sellerTid, askingEUR, durationDays } = action.payload as any;
    if (stateRef.current.leagueStats?.uiMode === 'euro_isolated') {
      const player = (stateRef.current.players ?? []).find(p => p.internalId === playerId);
      if (!isTransferMarketEligibleTid(Number(sellerTid)) || !player || player.tid !== sellerTid) return true;
    }
    const days = durationDays ?? 7;
    const today = stateRef.current.date ?? new Date().toISOString().slice(0, 10);
    const todayIso = typeof today === 'string' ? today.slice(0, 10) : new Date(today).toISOString().slice(0, 10);
    const todayYear = parseInt(todayIso.slice(0, 4), 10);
    const todayMonth = parseInt(todayIso.slice(5, 7), 10);
    const seasonStartYear = todayMonth >= 7 ? todayYear : todayYear - 1;
    const seasonStart = `${seasonStartYear}-07-01`;
    const seasonEnd = `${seasonStartYear + 1}-06-30`;
    const alreadyTransferred = (stateRef.current.transferActivity ?? []).some((item: any) =>
      item.playerId === playerId && item.date >= seasonStart && item.date <= seasonEnd,
    );
    if (alreadyTransferred) return true;
    const newListing: TransferListing = {
      id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      playerId,
      sellerTid,
      askingEUR,
      bidsCount: 0,
      totalDays: days,
      daysLeft: days,
      createdDate: today,
      status: 'active',
    };
    const stateWithListing = {
      ...stateRef.current,
      transferListings: [...(stateRef.current.transferListings ?? []), newListing],
    };
    const tickResult = tickTransferMarket(stateWithListing);
    setState(prev => ({
      ...prev,
      transferListings: tickResult.transferListings,
      transferBids: tickResult.transferBids,
      transferActivity: tickResult.transferActivity,
      players: tickResult.players,
      teams: tickResult.teams,
      nonNBATeams: tickResult.nonNBATeams,
      ...(tickResult.historyEntries.length > 0 ? {
        history: [...(prev.history ?? []), ...tickResult.historyEntries] as any,
      } : {}),
      ...(tickResult.userBidResolutions.length > 0 ? {
        pendingTransferToasts: [
          ...(prev.pendingTransferToasts ?? []),
          ...tickResult.userBidResolutions,
        ],
      } : {}),
    }));
    return true;
  }

  if (action.type === 'CANCEL_TRANSFER_LISTING') {
    const { listingId } = action.payload as any;
    setState(prev => ({
      ...prev,
      transferListings: (prev.transferListings ?? []).map(listing =>
        listing.id === listingId ? { ...listing, status: 'cancelled' as const } : listing,
      ),
    }));
    return true;
  }

  if (action.type === 'SUBMIT_TRANSFER_BID') {
    const payload = action.payload as any;
    if (stateRef.current.leagueStats?.uiMode === 'euro_isolated') {
      const bidderTid = Number(payload.bidderTid ?? stateRef.current.userTeamId ?? 0);
      const sellerTid = Number(payload.sellerTid);
      const player = (stateRef.current.players ?? []).find(pl => pl.internalId === payload.playerId);
      if (
        !isTransferMarketEligibleTid(bidderTid) ||
        !isTransferMarketEligibleTid(sellerTid) ||
        !player ||
        player.tid !== sellerTid
      ) return true;
    }
    const today = stateRef.current.date ?? new Date().toISOString().slice(0, 10);
    const validDays = payload.validDays ?? 3;
    const expDate = (() => {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + validDays);
      return date.toISOString().slice(0, 10);
    })();
    const newBid: TransferBid = {
      id: `tb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      listingId: payload.listingId,
      playerId: payload.playerId,
      bidderTid: payload.bidderTid ?? stateRef.current.userTeamId ?? 0,
      sellerTid: payload.sellerTid,
      bidType: payload.bidType ?? 'transfer',
      amountEUR: payload.amountEUR,
      userInitiated: true,
      expiresDate: expDate,
      receivedDate: today,
      status: 'active',
    };
    setState(prev => {
      const bidderTid = newBid.bidderTid;
      const bidderTeam = (prev.teams ?? []).find((team: any) => (team.id ?? team.tid) === bidderTid)
        ?? (prev.nonNBATeams ?? []).find((team: any) => (team.id ?? team.tid) === bidderTid);
      const bidderCash = (bidderTeam as any)?.tycoon?.cashOnHand ?? 0;
      if (bidderCash < newBid.amountEUR) {
        const player = (prev.players ?? []).find(pl => pl.internalId === newBid.playerId);
        const sellerTeam = (prev.teams ?? []).find((team: any) => (team.id ?? team.tid) === newBid.sellerTid)
          ?? (prev.nonNBATeams ?? []).find((team: any) => (team.id ?? team.tid) === newBid.sellerTid);
        return {
          ...prev,
          pendingTransferToasts: [
            ...(prev.pendingTransferToasts ?? []),
            {
              playerName: player?.name ?? 'Player',
              accepted: false,
              sellerTeamName: (sellerTeam as any)?.name ?? 'Selling club',
              feeEUR: newBid.amountEUR,
              reason: 'No cash for this transfer.',
              userInitiated: true,
            },
          ],
        };
      }
      const listings = (prev.transferListings ?? []).map(listing => {
        if (listing.id !== payload.listingId) return listing;
        const isHighest = !listing.highestBidEUR || payload.amountEUR > listing.highestBidEUR;
        return {
          ...listing,
          bidsCount: listing.bidsCount + 1,
          ...(isHighest ? { highestBidEUR: payload.amountEUR, topBidderTid: newBid.bidderTid } : {}),
        };
      });
      const withBid = { ...prev, transferListings: listings, transferBids: [...(prev.transferBids ?? []), newBid] };
      const tickResult = tickTransferMarket(withBid);
      return {
        ...withBid,
        transferListings: tickResult.transferListings,
        transferBids: tickResult.transferBids,
        transferActivity: tickResult.transferActivity,
        players: tickResult.players,
        teams: tickResult.teams,
        nonNBATeams: tickResult.nonNBATeams,
        ...(tickResult.historyEntries.length > 0 ? {
          history: [...(prev.history ?? []), ...tickResult.historyEntries] as any,
        } : {}),
        ...(tickResult.userBidResolutions.length > 0 ? {
          pendingTransferToasts: [
            ...(prev.pendingTransferToasts ?? []),
            ...tickResult.userBidResolutions,
          ],
        } : {}),
      };
    });
    return true;
  }

  if (action.type === 'ACCEPT_TRANSFER_BID') {
    const { bidId } = action.payload as any;
    setState(prev => {
      const bid = (prev.transferBids ?? []).find(item => item.id === bidId);
      if (!bid) return prev;
      if (prev.leagueStats?.uiMode === 'euro_isolated') {
        const player = (prev.players ?? []).find(p => p.internalId === bid.playerId);
        if (
          !isTransferMarketEligibleTid(Number(bid.sellerTid)) ||
          !isTransferMarketEligibleTid(Number(bid.bidderTid)) ||
          !player ||
          player.tid !== bid.sellerTid
        ) {
          return {
            ...prev,
            transferBids: (prev.transferBids ?? []).map(item =>
              item.id === bidId ? { ...item, status: 'withdrawn' as const } : item,
            ),
          };
        }
      }
      const bids = (prev.transferBids ?? []).map(item =>
        item.id === bidId ? { ...item, status: 'accepted' as const }
        : item.listingId === bid.listingId && item.status === 'active' ? { ...item, status: 'withdrawn' as const } : item,
      );
      const listings = (prev.transferListings ?? []).map(listing =>
        listing.id === bid.listingId ? { ...listing, status: 'sold' as const } : listing,
      );
      const player = (prev.players ?? []).find(p => p.internalId === bid.playerId);
      const rawDate = prev.date ?? new Date().toISOString().slice(0, 10);
      const today = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
        ? rawDate
        : (() => {
            const date = new Date(rawDate);
            return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
          })();
      const activity = [...(prev.transferActivity ?? []), {
        id: `ta-${Date.now()}`,
        date: today,
        fromTid: bid.sellerTid,
        toTid: bid.bidderTid,
        playerId: bid.playerId,
        playerName: player?.name ?? '?',
        feeEUR: bid.amountEUR,
        bidType: bid.bidType,
      }];
      const buyerRosterStatus =
        bid.bidderTid >= 1000 && bid.bidderTid < 2000 ? 'Euroleague'
        : bid.bidderTid >= 5000 && bid.bidderTid < 6000 ? 'Endesa'
        : bid.bidderTid >= 2000 && bid.bidderTid < 3000 ? 'PBA'
        : bid.bidderTid >= 4000 && bid.bidderTid < 5000 ? 'B-League'
        : bid.bidderTid >= 7000 && bid.bidderTid < 8000 ? 'China CBA'
        : bid.bidderTid >= 8000 && bid.bidderTid < 9000 ? 'NBL Australia'
        : undefined;
      const players = (prev.players ?? []).map(item =>
        item.internalId === bid.playerId ? { ...item, tid: bid.bidderTid, ...(buyerRosterStatus ? { status: buyerRosterStatus as any } : {}) } : item,
      );
      const sellerTeam = (prev.teams ?? []).find(team => team.id === bid.sellerTid)
        ?? (prev.nonNBATeams ?? []).find((team: any) => (team.tid ?? team.id) === bid.sellerTid);
      const buyerTeam = (prev.teams ?? []).find(team => team.id === bid.bidderTid)
        ?? (prev.nonNBATeams ?? []).find((team: any) => (team.tid ?? team.id) === bid.bidderTid);
      const feeM = (bid.amountEUR / 1_000_000).toFixed(bid.amountEUR >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '');
      const sellerTidNum = bid.sellerTid;
      const league =
        sellerTidNum >= 1000 && sellerTidNum < 2000 ? 'Euroleague'
        : sellerTidNum >= 5000 && sellerTidNum < 6000 ? 'Endesa'
        : undefined;
      const history = [...(prev.history ?? []), {
        text: `${player?.name ?? '—'} transferred from ${(sellerTeam as any)?.name ?? '—'} to ${(buyerTeam as any)?.name ?? '—'} for €${feeM}M`,
        date: prev.date,
        type: 'Transfer',
        playerIds: player ? [player.internalId] : [],
        tid: bid.bidderTid,
        ...(league ? { league } : {}),
      }] as any;
      const adjustCash = (teams: any[]) => teams.map((team: any) => {
        const tid = team.id ?? team.tid;
        if (!team.tycoon) return team;
        if (tid === bid.sellerTid) {
          return { ...team, tycoon: { ...team.tycoon, cashOnHand: Math.round((team.tycoon.cashOnHand ?? 0) + bid.amountEUR) } };
        }
        if (tid === bid.bidderTid) {
          return { ...team, tycoon: { ...team.tycoon, cashOnHand: Math.round((team.tycoon.cashOnHand ?? 0) - bid.amountEUR) } };
        }
        return team;
      });
      return {
        ...prev,
        transferBids: bids,
        transferListings: listings,
        transferActivity: activity,
        players,
        history,
        teams: adjustCash(prev.teams ?? []),
        nonNBATeams: adjustCash((prev as any).nonNBATeams ?? []),
      };
    });
    return true;
  }

  if (action.type === 'REJECT_TRANSFER_BID') {
    const { bidId } = action.payload as any;
    setState(prev => ({
      ...prev,
      transferBids: (prev.transferBids ?? []).map(item =>
        item.id === bidId ? { ...item, status: 'rejected' as const } : item,
      ),
    }));
    return true;
  }

  return false;
}
