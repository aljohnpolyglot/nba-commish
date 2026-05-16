/**
 * state.ts — Real-state adapter for the Euro Transfer Market view.
 *
 * Exposes a `useTransferMarketData()` hook + Context provider that wraps
 * the 4 tabs. Selectors translate raw GameState (transferListings, players,
 * teams, tycoon cash, currency) into the same display shapes the mockup UI
 * was originally built against (MockPlayer, MockClub, InboxBid, MyListing,
 * BrowseListing, ReleaseClause). This way the 872-line UI keeps its
 * structure intact — only the data binding swaps.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import { isOnRoster, resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { isInTransferWindow } from '../../utils/transferWindow';
import { convertTo2KRating, computeAge } from '../../utils/helpers';
import { getFlagForLoc } from '../../utils/countryFlags';
import {
  estimatePlayerValueEUR,
  teamCashEUR,
  teamPayrollUSDThousands,
  resolveTeamAnywhere,
  daysBetween,
} from '../../services/transfer/transferMarket';
import type {
  BidStatus,
  BidType,
  BrowseListing,
  ClauseStatus,
  ClauseType,
  InboxBid,
  MockClub,
  MockPlayer,
  MyListing,
  ReleaseClause,
} from './mockData';
import type { GameState, NBAPlayer, NBATeam, NonNBATeam, TransferBid, TransferListing } from '../../types';

// ── Currency conversion ─────────────────────────────────────────────────────

/** Very rough USD → EUR conversion for display. Currency rate lives in
 *  leagueStats but for a transfer-market headline accuracy is not critical. */
const USD_TO_EUR = 0.92;
const usdThousandsToEUR = (usdK: number): number => Math.round(usdK * 1000 * USD_TO_EUR);

// ── Adapters ────────────────────────────────────────────────────────────────

const POSITIONS: MockPlayer['position'][] = ['PG', 'SG', 'SF', 'PF', 'C'];

function pickPos(p: NBAPlayer): MockPlayer['position'] {
  const raw = (p.pos ?? '').toUpperCase();
  if (POSITIONS.includes(raw as MockPlayer['position'])) return raw as MockPlayer['position'];
  if (raw.includes('PG') || raw === 'G') return 'PG';
  if (raw.includes('SG')) return 'SG';
  if (raw.includes('SF') || raw === 'F') return 'SF';
  if (raw.includes('PF')) return 'PF';
  if (raw.includes('C')) return 'C';
  return 'SF';
}

// Flag lookup lifted to src/utils/countryFlags.ts so every UI uses the same map.
const flagFor = getFlagForLoc;

function ratingFromPlayer(p: NBAPlayer): { ovr: number; pot: number } {
  const lastRatings = (p.ratings ?? [])[((p.ratings ?? []).length - 1)] ?? {};
  const ovrBBGM = p.overallRating ?? lastRatings.ovr ?? 60;
  const potBBGM = lastRatings.pot ?? Math.max(ovrBBGM, Math.min(85, ovrBBGM + 4));
  // 2K-scale rounded ints — match the rest of the UI.
  return { ovr: Math.round(convertTo2KRating(ovrBBGM)), pot: Math.round(convertTo2KRating(potBBGM)) };
}

function toMockPlayer(p: NBAPlayer, currentYear: number): MockPlayer {
  const age = computeAge(p, currentYear);
  const { ovr, pot } = ratingFromPlayer(p);
  const contractExp = p.contract?.exp ?? currentYear + 1;
  const annualUSDK = p.contract?.amount ?? 0;
  return {
    id: p.internalId,
    name: p.name,
    age,
    position: pickPos(p),
    ovr,
    pot,
    nationality: p.born?.loc ?? '—',
    flag: flagFor(p.born?.loc),
    contractYearsLeft: Math.max(1, contractExp - currentYear),
    annualWageEUR: usdThousandsToEUR(annualUSDK),
    imgURL: (p as any).imgURL,
    face: (p as any).face,
  };
}

function teamColorHex(team: any): string {
  // BBGM-style team colors: array [primary, secondary, accent]
  const c = team?.colors?.[0] ?? team?.color1 ?? '#3F3F46';
  return typeof c === 'string' ? c : '#3F3F46';
}

function teamLeagueLabel(team: any, state: GameState): string {
  // Read league from the TID offset registry first so cross-league teams
  // (WNBA, PBA, CBA, etc.) get the right label instead of falling back to
  // the active uiMode and rendering "Liga Endesa" for a Minnesota Lynx team.
  const tid = (team?.tid ?? team?.id ?? -1) as number;
  if (tid >= 1000 && tid < 2000) return 'Euroleague';
  if (tid >= 2000 && tid < 3000) return 'PBA';
  if (tid >= 3000 && tid < 4000) return 'WNBA';
  if (tid >= 4000 && tid < 5000) return 'B-League';
  if (tid >= 5000 && tid < 6000) return 'Liga Endesa';
  if (tid >= 6000 && tid < 7000) return 'G-League';
  if (tid >= 7000 && tid < 8000) return 'CBA';
  if (tid >= 8000 && tid < 9000) return 'NBL';
  if (tid >= 0 && tid < 100) return 'NBA';
  return state.leagueStats?.uiMode === 'euro_isolated' ? 'Liga Endesa' : 'NBA';
}

function toMockClub(team: any, state: GameState): MockClub {
  const fullName = team ? getTeamFullName(team) : '—';
  const abbrev = team?.abbrev ?? team?.shortName ?? (fullName ? fullName.slice(0, 3).toUpperCase() : 'CLB');
  return {
    name: fullName,
    shortName: abbrev,
    league: teamLeagueLabel(team, state),
    flag: flagFor(team?.region),
    colorHex: teamColorHex(team),
    logoUrl: team?.imgURL ?? team?.logoUrl ?? team?.imgURLSmall ?? undefined,
  };
}

// ── Top-level data shape ────────────────────────────────────────────────────

export interface TransferMarketData {
  club: MockClub;
  budget: {
    cashEUR: number;
    availableCashEUR: number;
    payrollSpaceEUR: number;
  };
  window: {
    currentWindow: 'summer' | 'winter' | 'closed';
    windowLabel: string;
    spanLabel: string;
    daysLeft: number;
    totalDays: number;
    open: boolean;
  };
  listings: MyListing[];
  inboxBids: InboxBid[];
  browseListings: BrowseListing[];
  clauses: ReleaseClause[];
  marketActivity: Array<{ date: string; from: string; to: string; player: string; amount: string }>;
  cashChannels: Array<{ id: string; label: string; subtitle: string; inEUR: number; outEUR: number }>;
  userTid: number;
  currentDate: string;
  // Action dispatchers
  actions: {
    listPlayer: (playerId: string, askingEUR: number, durationDays?: number) => void;
    cancelListing: (listingId: string) => void;
    submitBid: (input: { listingId?: string; playerId: string; sellerTid: number; bidType: BidType; amountEUR: number; validDays?: number }) => void;
    acceptBid: (bidId: string) => void;
    rejectBid: (bidId: string) => void;
  };
}

// ── Mappings ────────────────────────────────────────────────────────────────

function bidTypeFromDb(t: TransferBid['bidType']): BidType {
  switch (t) {
    case 'transfer': return 'Transfer';
    case 'buyout': return 'Buyout';
    case 'loan': return 'Loan';
    case 'release-clause': return 'Release Clause';
  }
}

function bidStatusFromDb(s: TransferBid['status']): BidStatus {
  switch (s) {
    case 'active': return 'Active';
    case 'highest': return 'Highest Bid';
    case 'outbid': return 'Outbid';
    case 'accepted': return 'Accepted';
    case 'rejected': return 'Rejected';
    case 'withdrawn': return 'Withdrawn';
    case 'expired': return 'Withdrawn';
  }
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch { return iso; }
}

function formatEURShort(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `€${Math.round(n / 1_000)}K`;
  return `€${n}`;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useTransferMarketData(): TransferMarketData {
  const { state, dispatchAction } = useGame() as any;
  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();

  return useMemo(() => {
    const userTid: number = state.userTeamId ?? 0;
    const userTeam = resolveAnyTeam(userTid, state.teams ?? [], state.nonNBATeams ?? []);

    // Window
    const safeIso = (d: Date | null | undefined): string => {
      if (!d) return '';
      const t = d.getTime();
      if (Number.isNaN(t)) return '';
      try { return d.toISOString().slice(0, 10); } catch { return ''; }
    };
    const windowStatus = isInTransferWindow(state.date, state.leagueStats);
    const tmSettings = state.leagueStats?.transferMarket ?? { summerStart: '07-01', summerEnd: '09-30', winterStart: '01-01', winterEnd: '01-31' };
    const windowKind: 'summer' | 'winter' | 'closed' = windowStatus.window ?? 'closed';
    const windowLabel = windowKind === 'summer' ? 'Summer' : windowKind === 'winter' ? 'Winter' : 'Closed';
    const closeIso = safeIso(windowStatus.currentClose);
    const openIso = safeIso(windowStatus.nextOpen);
    let today: string;
    if (typeof state.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.date)) {
      today = state.date;
    } else if (typeof state.date === 'string') {
      const parsed = new Date(state.date);
      today = Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
    } else {
      today = new Date().toISOString().slice(0, 10);
    }
    const totalDays = windowKind === 'summer' ? 92 : windowKind === 'winter' ? 31 : 0;
    const daysLeftCalc = closeIso ? Math.max(0, daysBetween(today, closeIso)) : openIso ? Math.max(0, daysBetween(today, openIso)) : 0;
    const spanLabel = windowKind === 'closed' && openIso
      ? `Next opens ${formatShortDate(openIso)}`
      : `${tmSettings.summerStart ?? '07-01'} – ${tmSettings.summerEnd ?? '09-30'}`;

    // Budget
    const cashEUR = teamCashEUR(state, userTid);
    const payrollEUR = usdThousandsToEUR(teamPayrollUSDThousands(state, userTid));
    const euroMin = state.leagueStats?.euroMinSalaryUSD ?? 200_000;
    const euroMax = state.leagueStats?.euroMaxSalaryUSD ?? 6_000_000;
    const ROSTER_MAX = state.leagueStats?.maxStandardPlayersPerTeam ?? 16;
    const projectedCapEUR = usdThousandsToEUR((euroMax * ROSTER_MAX) / 1000); // crude soft cap
    const payrollSpaceEUR = Math.max(0, projectedCapEUR - payrollEUR);

    // Listings
    const allListings: TransferListing[] = (state.transferListings ?? []) as TransferListing[];
    const allBids: TransferBid[] = (state.transferBids ?? []) as TransferBid[];
    const playerById = new Map<string, NBAPlayer>();
    for (const p of state.players ?? []) playerById.set(p.internalId, p);

    const findTeam = (tid: number): any => resolveTeamAnywhere(state, tid);
    const isRosteredListing = (l: TransferListing): boolean => {
      const player = playerById.get(l.playerId);
      return !!player && l.sellerTid >= 0 && player.tid === l.sellerTid && isOnRoster(player);
    };

    const myListings: MyListing[] = allListings
      .filter(l => l.sellerTid === userTid && l.status === 'active' && isRosteredListing(l))
      .map(l => {
        const player = playerById.get(l.playerId);
        return {
          id: l.id,
          player: player ? toMockPlayer(player, currentYear) : {
            id: l.playerId, name: '—', age: 25, position: 'SF', ovr: 60, pot: 65,
            nationality: '—', flag: '🌐', contractYearsLeft: 1, annualWageEUR: 0,
          },
          askingEUR: l.askingEUR,
          highestBidEUR: l.highestBidEUR ?? 0,
          bidsCount: l.bidsCount,
          daysLeft: l.daysLeft,
          totalDays: l.totalDays,
          topBidder: l.topBidderTid != null ? toMockClub(findTeam(l.topBidderTid), state) : undefined,
        };
      });

    const inboxBids: InboxBid[] = allBids
      .filter(b => {
        if (b.sellerTid !== userTid) return false;
        if (!(b.status === 'active' || b.status === 'highest' || b.status === 'rejected' || b.status === 'accepted' || b.status === 'outbid')) return false;
        const listing = allListings.find(l => l.id === b.listingId);
        return listing ? isRosteredListing(listing) : false;
      })
      .map(b => {
        const player = playerById.get(b.playerId);
        const bidder = findTeam(b.bidderTid);
        const listing = allListings.find(l => l.id === b.listingId);
        const ask = listing?.askingEUR ?? 0;
        const pct = ask > 0 ? Math.round(((b.amountEUR - ask) / ask) * 100) : 0;
        return {
          id: b.id,
          listingId: b.listingId,
          player: player ? toMockPlayer(player, currentYear) : {
            id: b.playerId, name: '—', age: 25, position: 'SF', ovr: 60, pot: 65,
            nationality: '—', flag: '🌐', contractYearsLeft: 1, annualWageEUR: 0,
          },
          bidder: toMockClub(bidder, state),
          bidType: bidTypeFromDb(b.bidType),
          amountEUR: b.amountEUR,
          pctVsAsking: pct,
          expiresInDays: Math.max(0, daysBetween(today, b.expiresDate)),
          status: bidStatusFromDb(b.status),
          receivedDate: formatShortDate(b.receivedDate),
        };
      });

    const browseListings: BrowseListing[] = allListings
      .filter(l => l.sellerTid !== userTid && l.status === 'active' && isRosteredListing(l))
      .map(l => {
        const player = playerById.get(l.playerId);
        const club = findTeam(l.sellerTid);
        return {
          id: l.id,
          player: player ? toMockPlayer(player, currentYear) : {
            id: l.playerId, name: '—', age: 25, position: 'SF', ovr: 60, pot: 65,
            nationality: '—', flag: '🌐', contractYearsLeft: 1, annualWageEUR: 0,
          },
          club: toMockClub(club, state),
          askingEUR: l.askingEUR,
          highestBidEUR: l.highestBidEUR ?? 0,
          daysLeft: l.daysLeft,
          scoutingReport: '—', // No scouting fuzz wired yet
        };
      });

    // Clauses — derived from rostered players that have a release clause stored.
    const clauses: ReleaseClause[] = (state.players ?? [])
      .filter((p: NBAPlayer) => p.tid === userTid && isOnRoster(p) && (p as any).releaseClauseEUR)
      .map((p: NBAPlayer) => ({
        id: `c-${p.internalId}`,
        player: toMockPlayer(p, currentYear),
        type: 'Transfer Clause' as ClauseType,
        amountEUR: (p as any).releaseClauseEUR ?? 0,
        status: 'Active' as ClauseStatus,
        expiresDate: `${(p.contract?.exp ?? currentYear + 1)}`,
        termNoticeDays: 14,
        paymentStructure: 'Single Payment',
        recentActivity: [],
      }));

    // Cash channels — aggregate over transferActivity for current year
    const yearActivity = (state.transferActivity ?? []).filter((a: any) => a.date.startsWith(`${currentYear}`));
    let feeIn = 0, feeOut = 0, clauseIn = 0, loanOut = 0;
    for (const a of yearActivity) {
      if (a.toTid === userTid) feeOut += a.feeEUR;
      if (a.fromTid === userTid) {
        if (a.bidType === 'release-clause') clauseIn += a.feeEUR;
        else feeIn += a.feeEUR;
      }
      if (a.bidType === 'loan') loanOut += a.feeEUR;
    }
    const cashChannels = [
      { id: 'fee',    label: 'Transfer Fees',  subtitle: 'Direct sales',                    inEUR: feeIn,    outEUR: feeOut },
      { id: 'clause', label: 'Clause Buyouts', subtitle: 'Locked release-clause triggers',  inEUR: clauseIn, outEUR: 0 },
      { id: 'loan',   label: 'Loan Income',    subtitle: 'Short-term placements',           inEUR: 0,        outEUR: loanOut },
    ];

    // Market activity — last 5 transfers across the league
    const marketActivity = (state.transferActivity ?? [])
      .slice(-5)
      .reverse()
      .map((a: any) => ({
        date: formatShortDate(a.date),
        from: getTeamFullName(findTeam(a.fromTid) ?? { region: '', name: '—' }),
        to: getTeamFullName(findTeam(a.toTid) ?? { region: '', name: '—' }),
        player: a.playerName,
        amount: formatEURShort(a.feeEUR),
      }));

    return {
      club: toMockClub(userTeam, state),
      budget: {
        cashEUR,
        availableCashEUR: Math.max(0, cashEUR - 500_000), // crude reserve
        payrollSpaceEUR,
      },
      window: {
        currentWindow: windowKind,
        windowLabel,
        spanLabel,
        daysLeft: daysLeftCalc,
        totalDays: totalDays || Math.max(1, daysLeftCalc),
        open: windowStatus.open,
      },
      listings: myListings,
      inboxBids,
      browseListings,
      clauses,
      marketActivity,
      cashChannels,
      userTid,
      currentDate: today,
      actions: {
        listPlayer: (playerId, askingEUR, durationDays) => {
          dispatchAction({ type: 'LIST_PLAYER_FOR_TRANSFER', payload: { playerId, sellerTid: userTid, askingEUR, durationDays } } as any);
        },
        cancelListing: (listingId) => {
          dispatchAction({ type: 'CANCEL_TRANSFER_LISTING', payload: { listingId } } as any);
        },
        submitBid: (input) => {
          // If sellerTid wasn't passed, resolve it from the referenced listing.
          let sellerTid = input.sellerTid;
          if ((sellerTid == null || sellerTid < 0) && input.listingId) {
            const l = (state.transferListings ?? []).find((x: TransferListing) => x.id === input.listingId);
            if (l) sellerTid = l.sellerTid;
          }
          if (sellerTid == null || sellerTid < 0) return;
          dispatchAction({
            type: 'SUBMIT_TRANSFER_BID',
            payload: { ...input, sellerTid, bidderTid: userTid, bidType: bidTypeToDb(input.bidType) },
          } as any);
        },
        acceptBid: (bidId) => {
          dispatchAction({ type: 'ACCEPT_TRANSFER_BID', payload: { bidId } } as any);
        },
        rejectBid: (bidId) => {
          dispatchAction({ type: 'REJECT_TRANSFER_BID', payload: { bidId } } as any);
        },
      },
    };
  }, [state, currentYear, dispatchAction]);
}

function bidTypeToDb(t: BidType): TransferBid['bidType'] {
  switch (t) {
    case 'Transfer': return 'transfer';
    case 'Buyout': return 'buyout';
    case 'Loan': return 'loan';
    case 'Release Clause': return 'release-clause';
  }
}

// ── Context provider ────────────────────────────────────────────────────────

const Ctx = createContext<TransferMarketData | null>(null);

export const TransferMarketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const data = useTransferMarketData();
  return React.createElement(Ctx.Provider, { value: data }, children);
};

export function useTransferMarketContext(): TransferMarketData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTransferMarketContext must be used inside <TransferMarketProvider>');
  return v;
}
