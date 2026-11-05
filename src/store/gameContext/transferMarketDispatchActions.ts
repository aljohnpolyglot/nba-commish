import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { GameState, TransferBid, TransferListing, UserAction } from '../../types';
import { tickTransferMarket } from '../../services/transfer/transferMarketTicker';
import { getTransferMarketLeague, isTransferMarketEligibleTeam } from '../../services/transfer/marketEligibility';
import { getClubFinanceSnapshot, getClubSpendableEUR, reserveClubFunds } from '../../services/tycoon/clubFinance';
import { adjustCash, releaseInactiveTransferBidReservations } from '../../services/transfer/transferMarketTickerHelpers';
import {
  buildLoanOffer,
  buildLoanOutOffers,
  getLoanCandidates,
  getLoanOutCandidates,
  loanEndDate,
  tickLoanMarket,
} from '../../services/transfer/loanMarket';
import { getLoanMarketSettings, isInLoanWindow, isInTransferWindow } from '../../utils/transferWindow';
import { getTeamFullName } from '../../utils/teamNames';
import {
  commitSponsorPurchaseQuote,
  consumeSponsorSigningPerkForTeamRows,
  getAvailableSigningSponsorPerks,
  getSponsorCoverageQuote,
  type SponsorCoverageQuote,
} from '../../services/tycoon/sponsorPerkEngine';

type SetGameState = Dispatch<SetStateAction<GameState>>;

type HandleTransferMarketDispatchActionArgs = {
  action: UserAction;
  setState: SetGameState;
  stateRef: MutableRefObject<GameState>;
};

function commitTransferSponsorCoverage<T extends any>(
  rows: T[],
  tid: number,
  year: number,
  quote: SponsorCoverageQuote,
): T[] {
  if (quote.appliedPerks.length === 0) return rows;
  return rows.map((team: any) => {
    if (Number(team?.id ?? team?.tid) !== tid || !team?.tycoon) return team;
    const tycoon = {
      ...team.tycoon,
      sponsorPerkUsage: [...(team.tycoon.sponsorPerkUsage ?? [])].map((usage: any) => ({ ...usage })),
    };
    commitSponsorPurchaseQuote(tycoon, year, quote);
    return { ...team, tycoon };
  });
}

export function handleTransferMarketDispatchAction({
  action,
  setState,
  stateRef,
}: HandleTransferMarketDispatchActionArgs): boolean {
  const findTeam = (state: GameState, tid: number) => (
    state.teams.find(team => Number(team.id) === tid)
    ?? state.nonNBATeams.find(team => Number(team.tid) === tid)
  );
  if (action.type === 'LIST_PLAYER_FOR_LOAN') {
    const payload = action.payload as any;
    setState(prev => {
      const parentTid = Number(payload.parentTid ?? prev.userTeamId ?? -1);
      const today = prev.date ?? new Date().toISOString().slice(0, 10);
      const available = getLoanOutCandidates(prev, parentTid)
        .find(candidate => candidate.player.internalId === payload.playerId);
      if (!available || !isInLoanWindow(today, prev.leagueStats).open) return prev;
      const endDate = loanEndDate(today, payload.length ?? 'season');
      const offers = buildLoanOutOffers(prev, {
        playerId: available.player.internalId,
        parentTid,
        requestedFeeEUR: Math.max(25_000, Number(payload.requestedFeeEUR ?? available.suggestedFeeEUR)),
        wageSharePercent: Number(payload.wageSharePercent ?? 50),
        duration: payload.length ?? 'season',
        endDate,
      });
      return {
        ...prev,
        loanListedPlayerIds: [...new Set([...(prev.loanListedPlayerIds ?? []), available.player.internalId])],
        loanOffers: [...(prev.loanOffers ?? []), ...offers],
      };
    });
    return true;
  }
  if (action.type === 'CANCEL_LOAN_LISTING') {
    const playerId = String((action.payload as any)?.playerId ?? '');
    setState(prev => ({
      ...prev,
      loanListedPlayerIds: (prev.loanListedPlayerIds ?? []).filter(id => id !== playerId),
      loanOffers: (prev.loanOffers ?? []).map(offer =>
        offer.playerId === playerId && offer.status === 'active' && offer.requiresParentDecision
          ? { ...offer, status: 'rejected' as const, responseReason: 'The parent club withdrew the loan listing.' }
          : offer,
      ),
    }));
    return true;
  }
  if (action.type === 'REJECT_LOAN_OFFER') {
    const offerId = String((action.payload as any)?.offerId ?? '');
    setState(prev => ({
      ...prev,
      loanOffers: (prev.loanOffers ?? []).map(offer =>
        offer.id === offerId ? { ...offer, status: 'rejected' as const, responseReason: 'The parent club declined the offer.' } : offer,
      ),
    }));
    return true;
  }
  if (action.type === 'ACCEPT_LOAN_OFFER') {
    const offerId = String((action.payload as any)?.offerId ?? '');
    setState(prev => {
      const selected = (prev.loanOffers ?? []).find(offer => offer.id === offerId);
      if (!selected || selected.status !== 'active' || !selected.requiresParentDecision) return prev;
      if (Number(prev.userTeamId) !== selected.parentTid) return prev;
      const today = prev.date ?? new Date().toISOString().slice(0, 10);
      if (!isInLoanWindow(today, prev.leagueStats).open) {
        return {
          ...prev,
          loanOffers: (prev.loanOffers ?? []).map(offer =>
            offer.id === offerId
              ? { ...offer, status: 'expired' as const, responseReason: 'The loan window is closed.' }
              : offer,
          ),
        };
      }
      const offers = (prev.loanOffers ?? []).map(offer =>
        offer.id === offerId
          ? { ...offer, parentAccepted: true, decisionDate: today }
          : offer.playerId === selected.playerId && offer.status === 'active' && offer.requiresParentDecision
            ? { ...offer, status: 'rejected' as const, responseReason: 'The parent club accepted another loan offer.' }
            : offer,
      );
      const prepared = { ...prev, loanOffers: offers };
      const resolved = tickLoanMarket(prepared);
      return {
        ...prepared,
        players: resolved.players,
        teams: resolved.teams,
        nonNBATeams: resolved.nonNBATeams,
        loanOffers: resolved.loanOffers,
        loanAgreements: resolved.loanAgreements,
        loanListedPlayerIds: (prev.loanListedPlayerIds ?? []).filter(id => id !== selected.playerId),
        history: resolved.history,
        pendingLoanToasts: resolved.pendingLoanToasts,
      };
    });
    return true;
  }
  if (action.type === 'SUBMIT_LOAN_OFFER') {
    const payload = action.payload as any;
    const current = stateRef.current;
    const today = current.date ?? new Date().toISOString().slice(0, 10);
    const borrowerTid = Number(payload.borrowerTid ?? current.userTeamId ?? -1);
    const parentTid = Number(payload.parentTid);
    const player = (current.players ?? []).find(item => item.internalId === payload.playerId);
    const parentTeam = findTeam(current, parentTid);
    const borrowerTeam = findTeam(current, borrowerTid);
    const settings = getLoanMarketSettings(current.leagueStats);
    const activeBorrowerLoans = (current.loanAgreements ?? []).filter(agreement => (
      agreement.status === 'active' && agreement.borrowerTid === borrowerTid
    )).length;
    const availableCandidate = getLoanCandidates(current, borrowerTid).some(candidate => (
      candidate.player.internalId === payload.playerId && candidate.parentTid === parentTid
    ));
    const invalid = current.leagueStats?.uiMode !== 'euro_isolated'
      || !isInLoanWindow(today, current.leagueStats).open
      || !player
      || player.tid !== parentTid
      || !availableCandidate
      || !isTransferMarketEligibleTeam(parentTeam)
      || !isTransferMarketEligibleTeam(borrowerTeam)
      || activeBorrowerLoans >= settings.maxActiveLoansPerClub;
    if (invalid) {
      setState(prev => ({
        ...prev,
        pendingLoanToasts: [
          ...(prev.pendingLoanToasts ?? []),
          {
            playerId: player?.internalId ?? payload.playerId,
            playerName: player?.name ?? 'Player',
            accepted: false,
            parentTid,
            parentTeamName: getTeamFullName(parentTeam as any) || 'Parent club',
            borrowerTid,
            borrowerTeamName: getTeamFullName(borrowerTeam as any) || 'Borrowing club',
            feeEUR: Number(payload.feeEUR ?? 0),
            reason: isInLoanWindow(today, current.leagueStats).open
              ? 'This player is no longer available for a loan.'
              : 'The loan window is closed.',
            userInitiated: true,
          },
        ],
      }));
      return true;
    }
    const offer = buildLoanOffer({
      playerId: player.internalId,
      parentTid,
      borrowerTid,
      feeEUR: Number(payload.feeEUR ?? 0),
      wageSharePercent: Number(payload.wageSharePercent ?? 50),
      reason: payload.reason ?? 'development',
      duration: payload.duration,
      endDate: typeof payload.endDate === 'string' ? payload.endDate : undefined,
      currentDate: today,
      userInitiated: true,
    });
    setState(prev => {
      let reserved = false;
      const reserveOffer = (teams: any[]) => teams.map(team => {
        const tid = Number(team.id ?? team.tid);
        if (tid !== borrowerTid || !team.tycoon) return team;
        const tycoon = {
          ...team.tycoon,
          transactions: [...(team.tycoon.transactions ?? [])],
          commitments: [...(team.tycoon.commitments ?? [])],
          activeReservations: [...(team.tycoon.activeReservations ?? [])],
        };
        if (getClubSpendableEUR(tycoon, today) < offer.feeEUR) return team;
        reserveClubFunds(tycoon, {
          sourceId: `loan-offer:${offer.id}`,
          createdDate: today,
          expiresDate: offer.decisionDate,
          amountEUR: offer.feeEUR,
          purpose: 'loan',
          label: `${player.name} loan offer`,
        });
        reserved = true;
        return { ...team, tycoon };
      });
      const teams = reserveOffer(prev.teams ?? []);
      const nonNBATeams = reserveOffer(prev.nonNBATeams ?? []);
      if (!reserved) {
        return {
          ...prev,
          pendingLoanToasts: [
            ...(prev.pendingLoanToasts ?? []),
            {
              playerId: player.internalId,
              playerName: player.name,
              accepted: false,
              parentTid,
              parentTeamName: getTeamFullName(parentTeam as any) || 'Parent club',
              borrowerTid,
              borrowerTeamName: getTeamFullName(borrowerTeam as any) || 'Borrowing club',
              feeEUR: offer.feeEUR,
              reason: 'There is not enough available club cash for this loan fee.',
              userInitiated: true,
            },
          ],
        };
      }
      const prepared = {
        ...prev,
        teams,
        nonNBATeams,
        loanOffers: [...(prev.loanOffers ?? []), offer],
      };
      const resolved = tickLoanMarket({ ...prepared, date: today });
      return {
        ...prepared,
        players: resolved.players,
        teams: resolved.teams,
        nonNBATeams: resolved.nonNBATeams,
        loanOffers: resolved.loanOffers,
        loanAgreements: resolved.loanAgreements,
        history: resolved.history,
        pendingLoanToasts: resolved.pendingLoanToasts,
      };
    });
    return true;
  }
  if (action.type === 'LIST_PLAYER_FOR_TRANSFER') {
    const { playerId, sellerTid, askingEUR, durationDays } = action.payload as any;
    if (stateRef.current.leagueStats?.uiMode === 'euro_isolated') {
      const player = (stateRef.current.players ?? []).find(p => p.internalId === playerId);
      const loaned = (stateRef.current.loanAgreements ?? []).some(agreement => agreement.status === 'active' && agreement.playerId === playerId);
      if (
        !isInTransferWindow(stateRef.current.date, stateRef.current.leagueStats).open
        || !isTransferMarketEligibleTeam(findTeam(stateRef.current, Number(sellerTid)))
        || !player
        || player.tid !== sellerTid
        || loaned
      ) return true;
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
    setState(prev => {
      const transferBids = (prev.transferBids ?? []).map(bid => (
        bid.listingId === listingId && (bid.status === 'active' || bid.status === 'highest' || bid.status === 'outbid')
          ? { ...bid, status: 'withdrawn' as const }
          : bid
      ));
      return {
        ...prev,
        transferListings: (prev.transferListings ?? []).map(listing =>
        listing.id === listingId ? { ...listing, status: 'cancelled' as const } : listing,
        ),
        transferBids,
        teams: releaseInactiveTransferBidReservations(prev.teams, transferBids),
        nonNBATeams: releaseInactiveTransferBidReservations(prev.nonNBATeams, transferBids),
      };
    });
    return true;
  }

  if (action.type === 'SUBMIT_TRANSFER_BID') {
    const payload = action.payload as any;
    if (stateRef.current.leagueStats?.uiMode === 'euro_isolated') {
      const bidderTid = Number(payload.bidderTid ?? stateRef.current.userTeamId ?? 0);
      const sellerTid = Number(payload.sellerTid);
      const player = (stateRef.current.players ?? []).find(pl => pl.internalId === payload.playerId);
      const loaned = (stateRef.current.loanAgreements ?? []).some(agreement => agreement.status === 'active' && agreement.playerId === payload.playerId);
      const windowOpen = isInTransferWindow(stateRef.current.date, stateRef.current.leagueStats).open;
      if (
        !windowOpen ||
        !isTransferMarketEligibleTeam(findTeam(stateRef.current, bidderTid)) ||
        !isTransferMarketEligibleTeam(findTeam(stateRef.current, sellerTid)) ||
        !player ||
        player.tid !== sellerTid ||
        loaned
      ) {
        const sellerTeam = (stateRef.current.teams ?? []).find((team: any) => (team.id ?? team.tid) === sellerTid)
          ?? (stateRef.current.nonNBATeams ?? []).find((team: any) => (team.id ?? team.tid) === sellerTid);
        setState(prev => ({
          ...prev,
          transferListings: payload.listingId
            ? (prev.transferListings ?? []).map(listing =>
              listing.id === payload.listingId ? { ...listing, status: 'expired' as const, daysLeft: 0 } : listing,
            )
            : prev.transferListings,
          pendingTransferToasts: [
            ...(prev.pendingTransferToasts ?? []),
            {
              playerId: player?.internalId ?? payload.playerId,
              playerName: player?.name ?? 'Player',
              accepted: false,
              sellerTid,
              sellerTeamName: (sellerTeam as any)?.name ?? 'Selling club',
              feeEUR: Number(payload.amountEUR ?? 0),
              reason: windowOpen ? 'This listing is no longer available.' : 'The transfer window is closed.',
              userInitiated: true,
            },
          ],
        }));
        return true;
      }
    }
    const today = stateRef.current.date ?? new Date().toISOString().slice(0, 10);
    const validDays = payload.validDays ?? 3;
    const expDate = (() => {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + validDays);
      return date.toISOString().slice(0, 10);
    })();
    const requestedSponsorSigningPerk = payload.sponsorSigningPerk;
    const bidderTid = Number(payload.bidderTid ?? stateRef.current.userTeamId ?? 0);
    const bidderTeam = findTeam(stateRef.current, bidderTid);
    const bidPlayer = (stateRef.current.players ?? []).find(player => player.internalId === payload.playerId);
    const annualSalaryEUR = Math.max(0, Number(bidPlayer?.contract?.amount ?? 0) * 1_000);
    const validatedSponsorSigningPerk = requestedSponsorSigningPerk && bidderTeam?.tycoon
      ? getAvailableSigningSponsorPerks(
        bidderTeam.tycoon,
        stateRef.current.leagueStats.year,
        'player',
        annualSalaryEUR,
      ).find(choice => (
        choice.sponsor === requestedSponsorSigningPerk.sponsor
        && choice.perk.id === requestedSponsorSigningPerk.perkId
      ))
      : undefined;
    const newBid: TransferBid = {
      id: `tb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      listingId: payload.listingId,
      playerId: payload.playerId,
      bidderTid: payload.bidderTid ?? stateRef.current.userTeamId ?? 0,
      sellerTid: payload.sellerTid,
      bidType: payload.bidType ?? 'transfer',
      amountEUR: payload.amountEUR,
      signingBonusEUR: Math.max(0, Math.round(Number(payload.signingBonusEUR ?? 0) / 50_000) * 50_000),
      sponsorSigningPerk: validatedSponsorSigningPerk ? {
        sponsor: validatedSponsorSigningPerk.sponsor,
        perkId: validatedSponsorSigningPerk.perk.id,
        label: validatedSponsorSigningPerk.perk.label,
        season: stateRef.current.leagueStats.year,
        equivalentAnnualValueEUR: validatedSponsorSigningPerk.equivalentAnnualValueEUR,
      } : undefined,
      userInitiated: true,
      expiresDate: expDate,
      receivedDate: today,
      status: 'active',
    };
    setState(prev => {
      const bidderTid = newBid.bidderTid;
      const immediateCostEUR = newBid.amountEUR + (newBid.signingBonusEUR ?? 0);
      let reservationMade = false;
      const reserveBid = (teams: Array<any>) => teams.map(team => {
        const tid = Number(team.id ?? team.tid);
        if (tid !== bidderTid || !team.tycoon) return team;
        const tycoon = {
          ...team.tycoon,
          transactions: [...(team.tycoon.transactions ?? [])],
          commitments: [...(team.tycoon.commitments ?? [])],
          activeReservations: [...(team.tycoon.activeReservations ?? [])],
        };
        if (getClubFinanceSnapshot(tycoon, today).availableEUR < immediateCostEUR) return team;
        reserveClubFunds(tycoon, {
          sourceId: `transfer-bid:${newBid.id}`,
          createdDate: today,
          expiresDate: newBid.expiresDate,
          amountEUR: immediateCostEUR,
          purpose: 'transfer',
          label: 'Active transfer bid',
        });
        reservationMade = true;
        return { ...team, tycoon };
      });
      const teamsWithReservation = reserveBid(prev.teams ?? []);
      const nonNBATeamsWithReservation = reserveBid(prev.nonNBATeams ?? []);
      if (!reservationMade) {
        const player = (prev.players ?? []).find(pl => pl.internalId === newBid.playerId);
        const sellerTeam = (prev.teams ?? []).find((team: any) => (team.id ?? team.tid) === newBid.sellerTid)
          ?? (prev.nonNBATeams ?? []).find((team: any) => (team.id ?? team.tid) === newBid.sellerTid);
        return {
          ...prev,
          pendingTransferToasts: [
            ...(prev.pendingTransferToasts ?? []),
            {
              playerId: player?.internalId ?? newBid.playerId,
              playerName: player?.name ?? 'Player',
              accepted: false,
              sellerTid: newBid.sellerTid,
              sellerTeamName: (sellerTeam as any)?.name ?? 'Selling club',
              feeEUR: newBid.amountEUR,
              reason: 'No cash for this transfer.',
              userInitiated: true,
            },
          ],
        };
      }
      const privateInquiry = payload.privateInquiry === true;
      const existingListing = (prev.transferListings ?? []).find(listing => listing.id === payload.listingId);
      const storedAsking = Number(prev.euroTransferAvailability?.[newBid.playerId]?.askingEUR);
      const inquiryAsking = Number.isFinite(storedAsking) && storedAsking > 0
        ? storedAsking
        : Math.max(50_000, Number(payload.askingEUR ?? newBid.amountEUR));
      const baseListings: TransferListing[] = privateInquiry && !existingListing
        ? [
            ...(prev.transferListings ?? []),
            {
              id: payload.listingId,
              playerId: newBid.playerId,
              sellerTid: newBid.sellerTid,
              askingEUR: inquiryAsking,
              privateInquiry: true,
              bidsCount: 0,
              totalDays: Math.max(1, Number(payload.validDays ?? 5)),
              daysLeft: Math.max(1, Number(payload.validDays ?? 5)),
              createdDate: today,
              status: 'active',
            },
          ]
        : (prev.transferListings ?? []);
      const listings = baseListings.map(listing => {
        if (listing.id !== payload.listingId) return listing;
        const isHighest = !listing.highestBidEUR || payload.amountEUR > listing.highestBidEUR;
        return {
          ...listing,
          bidsCount: listing.bidsCount + 1,
          ...(isHighest ? { highestBidEUR: payload.amountEUR, topBidderTid: newBid.bidderTid } : {}),
        };
      });
      const withBid = {
        ...prev,
        teams: teamsWithReservation,
        nonNBATeams: nonNBATeamsWithReservation,
        transferListings: listings,
        transferBids: [...(prev.transferBids ?? []), newBid],
      };
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
      if (bid.bidType === 'loan') {
        return {
          ...prev,
          transferBids: (prev.transferBids ?? []).map(item => item.id === bidId ? { ...item, status: 'withdrawn' as const } : item),
          lastOutcome: 'Loan offers must be completed through Loan Finder.',
        };
      }
      if (prev.leagueStats?.uiMode === 'euro_isolated') {
        const player = (prev.players ?? []).find(p => p.internalId === bid.playerId);
        const loaned = (prev.loanAgreements ?? []).some(agreement => agreement.status === 'active' && agreement.playerId === bid.playerId);
        if (
          !isTransferMarketEligibleTeam(findTeam(prev, Number(bid.sellerTid))) ||
          !isTransferMarketEligibleTeam(findTeam(prev, Number(bid.bidderTid))) ||
          !player ||
          player.tid !== bid.sellerTid ||
          loaned
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
      const buyerTeam = findTeam(prev, bid.bidderTid);
      const transferCoverage = buyerTeam?.tycoon
        ? getSponsorCoverageQuote(buyerTeam.tycoon, prev.leagueStats.year, 'transferFee', bid.amountEUR)
        : { costEUR: bid.amountEUR, coveredEUR: 0, appliedPerks: [] };
      const immediateCostEUR = transferCoverage.costEUR + Math.max(0, bid.signingBonusEUR ?? 0);
      const spendableEUR = buyerTeam?.tycoon
        ? getClubSpendableEUR(buyerTeam.tycoon, today, `transfer-bid:${bid.id}`)
        : 0;
      if (!buyerTeam?.tycoon || spendableEUR < immediateCostEUR) {
        const transferBids = (prev.transferBids ?? []).map(item => (
          item.id === bidId ? { ...item, status: 'withdrawn' as const } : item
        ));
        return {
          ...prev,
          transferBids,
          teams: releaseInactiveTransferBidReservations(prev.teams, transferBids),
          nonNBATeams: releaseInactiveTransferBidReservations(prev.nonNBATeams, transferBids),
          lastOutcome: 'The buying club no longer has enough cash to complete this transfer.',
        };
      }
      const annualSalaryEUR = Math.max(0, Number(player?.contract?.amount ?? 0) * 1_000);
      const teamPerkResult = consumeSponsorSigningPerkForTeamRows(
        prev.teams ?? [],
        bid.bidderTid,
        prev.leagueStats.year,
        bid.sponsorSigningPerk,
        'player',
        annualSalaryEUR,
      );
      const nonNbaPerkResult = teamPerkResult.grant
        ? { rows: prev.nonNBATeams ?? [], grant: undefined }
        : consumeSponsorSigningPerkForTeamRows(
          prev.nonNBATeams ?? [],
          bid.bidderTid,
          prev.leagueStats.year,
          bid.sponsorSigningPerk,
          'player',
          annualSalaryEUR,
        );
      const sponsorSigningPerk = teamPerkResult.grant ?? nonNbaPerkResult.grant;
      const buyerRosterStatus = (buyerTeam as any)?.league;
      const players = (prev.players ?? []).map(item =>
        item.internalId === bid.playerId ? {
          ...item,
          tid: bid.bidderTid,
          ...(buyerRosterStatus ? { status: buyerRosterStatus as any } : {}),
          ...(item.contract ? {
            contract: {
              ...item.contract,
              ...(bid.signingBonusEUR ? { signingBonusEUR: bid.signingBonusEUR } : {}),
              ...(sponsorSigningPerk ? { sponsorSigningPerk } : {}),
            },
          } : {}),
          ...(sponsorSigningPerk && item.contractYears ? {
            contractYears: item.contractYears.map((row, index) => (
              index === 0 ? { ...row, sponsorSigningPerk } : row
            )),
          } : {}),
        } : item,
      );
      const sellerTeam = (prev.teams ?? []).find(team => team.id === bid.sellerTid)
        ?? (prev.nonNBATeams ?? []).find((team: any) => (team.tid ?? team.id) === bid.sellerTid);
      const feeM = (bid.amountEUR / 1_000_000).toFixed(bid.amountEUR >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '');
      const league = getTransferMarketLeague(bid.sellerTid, sellerTeam as any)?.name;
      const history = [...(prev.history ?? []), {
        text: `${player?.name ?? '—'} transferred from ${(sellerTeam as any)?.name ?? '—'} to ${(buyerTeam as any)?.name ?? '—'} for €${feeM}M`,
        date: prev.date,
        type: 'Transfer',
        playerIds: player ? [player.internalId] : [],
        tid: bid.bidderTid,
        ...(league ? { league } : {}),
      }] as any;
      const cashPosting = {
        bidId: bid.id,
        date: today,
        season: prev.leagueStats.year,
        label: `${player?.name ?? 'Player'} transfer`,
        playerId: bid.playerId,
        sellerTid: bid.sellerTid,
        sellerName: getTeamFullName(sellerTeam as any),
        buyerTid: bid.bidderTid,
        buyerName: getTeamFullName(buyerTeam as any),
      };
      let teams = adjustCash(teamPerkResult.rows, bid.sellerTid, bid.amountEUR, { ...cashPosting, side: 'sale' });
      teams = adjustCash(teams, bid.bidderTid, -immediateCostEUR, { ...cashPosting, side: 'purchase' });
      let nonNBATeams = adjustCash(nonNbaPerkResult.rows, bid.sellerTid, bid.amountEUR, { ...cashPosting, side: 'sale' });
      nonNBATeams = adjustCash(nonNBATeams, bid.bidderTid, -immediateCostEUR, { ...cashPosting, side: 'purchase' });
      teams = commitTransferSponsorCoverage(teams, bid.bidderTid, prev.leagueStats.year, transferCoverage);
      nonNBATeams = commitTransferSponsorCoverage(nonNBATeams, bid.bidderTid, prev.leagueStats.year, transferCoverage);
      teams = releaseInactiveTransferBidReservations(teams, bids);
      nonNBATeams = releaseInactiveTransferBidReservations(nonNBATeams, bids);
      return {
        ...prev,
        transferBids: bids,
        transferListings: listings,
        transferActivity: activity,
        players,
        history,
        teams,
        nonNBATeams,
      };
    });
    return true;
  }

  if (action.type === 'REJECT_TRANSFER_BID') {
    const { bidId } = action.payload as any;
    setState(prev => {
      const transferBids = (prev.transferBids ?? []).map(item =>
        item.id === bidId ? { ...item, status: 'rejected' as const } : item,
      );
      return {
        ...prev,
        transferBids,
        teams: releaseInactiveTransferBidReservations(prev.teams, transferBids),
        nonNBATeams: releaseInactiveTransferBidReservations(prev.nonNBATeams, transferBids),
      };
    });
    return true;
  }

  return false;
}
