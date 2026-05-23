/**
 * transferMarket.ts — Euro Transfer Market service layer.
 *
 * Pure helpers + selectors over GameState.transferListings / transferBids.
 * Reducer-side mutations live in GameContext.tsx; this module is the
 * single source of truth for "given state X, what does the market look
 * like for team Y".
 */

import type { GameState, NBAPlayer, NBATeam, TransferBid, TransferBidType, TransferListing } from '../../types';
import { getDisplayOverall, getDisplayPotential } from '../../utils/playerRatings';

const DEFAULT_AUCTION_DAYS = 7;

// ── Date helpers ────────────────────────────────────────────────────────────

export function toISO(date: string | Date): string {
  if (typeof date === 'string') {
    // Accept already-ISO strings; otherwise parse via Date which handles
    // "Aug 1, 2026" etc. produced by initialState.
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${toISO(iso)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${toISO(fromIso)}T00:00:00Z`).getTime();
  const b = new Date(`${toISO(toIso)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// ── ID helpers ──────────────────────────────────────────────────────────────

let _counter = 0;
export function newId(prefix: string): string {
  _counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_counter.toString(36)}`;
}

// ── Pricing ─────────────────────────────────────────────────────────────────

/** Fair-value baseline in EUR — used as default asking price and as the AI's
 *  willingness-to-pay anchor. Works off K2-scale OVR + POT so Euro rosters
 *  (BBGM 30-55) get sensible gradation instead of all flooring to €50K.
 *  Calibration anchors: K2 60→€450K, 70→€2M, 75→€4.3M, 80→€9M, 85→€19M, 90→€40M, 95→€85M. */
export function estimatePlayerValueEUR(player: NBAPlayer, currentYear: number): number {
  const ovrK2 = getDisplayOverall(player);
  const potK2 = getDisplayPotential(player, currentYear);
  const age = player.born?.year ? currentYear - player.born.year : (player.age ?? 25);

  // Exponential base on K2 — superstars scale beyond linear.
  let value = Math.exp((ovrK2 - 50) * 0.15) * 100_000;

  // Potential premium for young prospects who haven't hit their ceiling yet.
  const potGap = Math.max(0, potK2 - ovrK2);
  const youthFactor = Math.max(0, Math.min(1, (28 - age) / 6));
  value += Math.pow(potGap, 1.7) * 25_000 * youthFactor;

  // Age curve on top of K2/POT base.
  if (age < 22) value *= 1.15;
  else if (age >= 33) value *= 0.55;
  else if (age >= 30) value *= 0.75;

  // Snap to €50K listing step; never below the listing minimum.
  return Math.max(50_000, Math.round(value / 50_000) * 50_000);
}

// ── Selectors ───────────────────────────────────────────────────────────────

export function getActiveListingsForTeam(state: GameState, tid: number): TransferListing[] {
  return (state.transferListings ?? []).filter(l => l.sellerTid === tid && l.status === 'active');
}

export function getInboxBidsForTeam(state: GameState, tid: number): TransferBid[] {
  // Bids on the team's own players (i.e. team is seller).
  return (state.transferBids ?? []).filter(b => b.sellerTid === tid);
}

export function getOutgoingBidsForTeam(state: GameState, tid: number): TransferBid[] {
  return (state.transferBids ?? []).filter(b => b.bidderTid === tid);
}

export function getBrowseListings(state: GameState, excludeTid?: number): TransferListing[] {
  return (state.transferListings ?? []).filter(l => l.status === 'active' && l.sellerTid !== excludeTid);
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface ListPlayerInput {
  playerId: string;
  sellerTid: number;
  askingEUR: number;
  durationDays?: number;
  currentDate: string;
}

export function buildListing(input: ListPlayerInput): TransferListing {
  const days = Math.max(3, Math.min(21, input.durationDays ?? DEFAULT_AUCTION_DAYS));
  return {
    id: newId('list'),
    playerId: input.playerId,
    sellerTid: input.sellerTid,
    askingEUR: Math.max(50_000, Math.round(input.askingEUR / 50_000) * 50_000),
    bidsCount: 0,
    totalDays: days,
    daysLeft: days,
    createdDate: toISO(input.currentDate),
    status: 'active',
  };
}

export interface SubmitBidInput {
  listingId?: string;
  playerId: string;
  bidderTid: number;
  sellerTid: number;
  bidType: TransferBidType;
  amountEUR: number;
  userInitiated?: boolean;
  currentDate: string;
  validDays?: number;
}

export function buildBid(input: SubmitBidInput): TransferBid {
  const days = Math.max(1, Math.min(14, input.validDays ?? 5));
  return {
    id: newId('bid'),
    listingId: input.listingId,
    playerId: input.playerId,
    bidderTid: input.bidderTid,
    sellerTid: input.sellerTid,
    bidType: input.bidType,
    amountEUR: Math.max(50_000, Math.round(input.amountEUR / 50_000) * 50_000),
    userInitiated: input.userInitiated === true ? true : undefined,
    receivedDate: toISO(input.currentDate),
    expiresDate: addDays(input.currentDate, days),
    status: 'active',
  };
}

// ── Pure mutations (return new arrays so callers can wire to setState) ──────

/** Tick every listing down by one day. Listings that hit 0 days flip to 'expired'. */
export function tickListings(listings: TransferListing[]): TransferListing[] {
  return listings.map(l => {
    if (l.status !== 'active') return l;
    const next = l.daysLeft - 1;
    if (next <= 0) return { ...l, daysLeft: 0, status: 'expired' as const };
    return { ...l, daysLeft: next };
  });
}

export function expireOldBids(bids: TransferBid[], currentDate: string): TransferBid[] {
  const todayIso = toISO(currentDate);
  return bids.map(b => {
    if (b.status !== 'active' && b.status !== 'highest') return b;
    if (b.expiresDate <= todayIso) return { ...b, status: 'expired' as const };
    return b;
  });
}

/** Recompute bidsCount / highestBidEUR / topBidderTid for each listing after the
 *  bids array changes. Returns a new listings array. */
export function syncListingRollups(listings: TransferListing[], bids: TransferBid[]): TransferListing[] {
  return listings.map(l => {
    if (l.status !== 'active') return l;
    // Card counter includes every received bid that's still in the modal —
    // active, highest, outbid. Excludes accepted/rejected/withdrawn/expired
    // (those leave the in-play set). This keeps the card's "(N)" badge in
    // sync with what the View Bids modal actually renders.
    const received = bids.filter(b =>
      b.listingId === l.id &&
      (b.status === 'active' || b.status === 'highest' || b.status === 'outbid')
    );
    const inPlay = received.filter(b => b.status === 'active' || b.status === 'highest');
    if (received.length === 0) return { ...l, bidsCount: 0, highestBidEUR: undefined, topBidderTid: undefined };
    let top = inPlay[0];
    for (const b of inPlay) if (b.amountEUR > top.amountEUR) top = b;
    return {
      ...l,
      bidsCount: received.length,
      highestBidEUR: top?.amountEUR,
      topBidderTid: top?.bidderTid,
    };
  });
}

/** Mark the winning bid as 'highest', others on the same listing as 'outbid'. */
export function markHighest(bids: TransferBid[], listingId: string): TransferBid[] {
  const eligible = bids.filter(b => b.listingId === listingId && (b.status === 'active' || b.status === 'highest'));
  if (eligible.length === 0) return bids;
  let top = eligible[0];
  for (const b of eligible) if (b.amountEUR > top.amountEUR) top = b;
  return bids.map(b => {
    if (b.listingId !== listingId) return b;
    if (b.id === top.id) return { ...b, status: 'highest' as const };
    if (b.status === 'highest' || b.status === 'active') return { ...b, status: 'outbid' as const };
    return b;
  });
}

// ── Team / payroll helpers ──────────────────────────────────────────────────

/** Sum of guaranteed contract amounts (USD thousands → EUR display via leagueStats currency rate
 *  is left to the UI; we return USD-thousands here and the caller converts). */
export function teamPayrollUSDThousands(state: GameState, tid: number): number {
  let total = 0;
  for (const p of state.players ?? []) {
    if (p.tid !== tid) continue;
    total += p.contract?.amount ?? 0;
  }
  return total;
}

export function resolveTeamAnywhere(state: GameState, tid: number): NBATeam | undefined {
  const nba = state.teams?.find((t: any) => (t.id ?? t.tid) === tid);
  if (nba) return nba;
  return (state.nonNBATeams ?? []).find((t: any) => (t.id ?? t.tid) === tid) as any;
}

/** Available cash for transfers, in EUR. For Euro tycoon teams that's tycoon.cashOnHand;
 *  fallback to 0 when the team has no tycoon block. */
export function teamCashEUR(state: GameState, tid: number): number {
  const team = resolveTeamAnywhere(state, tid);
  return (team as any)?.tycoon?.cashOnHand ?? 0;
}
