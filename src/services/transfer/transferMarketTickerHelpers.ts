import type { GameState, NBAPlayer, TransferBid, TransferListing } from '../../types';
import type { TycoonState } from '../../types/tycoon';
import { postClubTransaction, releaseClubReservation } from '../tycoon/clubFinance';

export const GLOBAL_WINDOW_CAP = {
  summer: 70,
  winter: 18,
  closed: 0,
} as const;

export const AI_ACCEPTS_PER_DAY_CAP = {
  summer: 3,
  winter: 1,
  closed: 0,
} as const;

export function seedRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function parseAnyDateToISO(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function historyLooksLikeTransfer(entry: any): boolean {
  return entry?.type === 'Transfer' || String(entry?.text ?? '').includes(' transferred from ');
}

export function collectMovedPlayerIdsThisSeason(
  state: GameState,
  activity: NonNullable<GameState['transferActivity']>,
  seasonStart: string,
  seasonEnd: string
): Set<string> {
  const moved = new Set<string>();
  for (const a of activity) {
    if (a.date >= seasonStart && a.date <= seasonEnd) moved.add(a.playerId);
  }
  for (const h of state.history ?? []) {
    if (!historyLooksLikeTransfer(h)) continue;
    const iso = parseAnyDateToISO((h as any).date);
    if (!iso || iso < seasonStart || iso > seasonEnd) continue;
    for (const id of (h as any).playerIds ?? []) {
      if (typeof id === 'string' && id.length > 0) moved.add(id);
    }
  }
  return moved;
}

export function countCompletedTransfersInWindow(
  state: GameState,
  activity: NonNullable<GameState['transferActivity']>,
  windowOpenIso: string | null,
  windowCloseIso: string | null
): number {
  if (!windowOpenIso || !windowCloseIso) return 0;
  const seen = new Set<string>();
  for (const a of activity) {
    if (a.date < windowOpenIso || a.date > windowCloseIso) continue;
    seen.add(`${a.date}|${a.playerId}`);
  }
  for (const h of state.history ?? []) {
    if (!historyLooksLikeTransfer(h)) continue;
    const iso = parseAnyDateToISO((h as any).date);
    if (!iso || iso < windowOpenIso || iso > windowCloseIso) continue;
    const ids = (h as any).playerIds;
    if (Array.isArray(ids) && ids.length > 0) {
      for (const id of ids) seen.add(`${iso}|${id}`);
    } else {
      seen.add(`${iso}|${String((h as any).text ?? '')}`);
    }
  }
  return seen.size;
}

export interface TickResult {
  transferListings: TransferListing[];
  transferBids: TransferBid[];
  transferActivity: NonNullable<GameState['transferActivity']>;
  players: NBAPlayer[];
  teams: any[];
  nonNBATeams: any[];
  inboxNotices: Array<{ playerName: string; bidderName: string; amount: number }>;
  userBidResolutions: Array<{ playerId?: string; playerName: string; accepted: boolean; sellerTid?: number; sellerTeamName: string; feeEUR: number; reason?: string; userInitiated?: boolean }>;
  historyEntries: Array<{
    text: string;
    date: string;
    type: string;
    playerIds: string[];
    eventType?: 'transaction';
    personId?: string;
    sourceIds?: Record<string, string | string[]>;
    tid?: number;
    teamIds?: number[];
    fromTid?: number;
    toTid?: number;
    league?: string;
    season?: number;
    transactionId?: string;
  }>;
}

export function buildTransferHistoryEntry(input: {
  activityId: string;
  date: string;
  season: number;
  player?: NBAPlayer;
  sellerTid: number;
  sellerName: string;
  buyerTid: number;
  buyerName: string;
  feeText: string;
  signingBonusText: string;
  league?: string;
}): TickResult['historyEntries'][number] {
  return {
    text: `${input.player?.name ?? '—'} transferred from ${input.sellerName} to ${input.buyerName} for €${input.feeText}M${input.signingBonusText}`,
    date: input.date,
    type: 'Transfer',
    playerIds: input.player ? [input.player.internalId] : [],
    eventType: 'transaction',
    personId: input.player?.personId,
    sourceIds: input.player?.sourceIds,
    tid: input.buyerTid,
    teamIds: [input.sellerTid, input.buyerTid],
    fromTid: input.sellerTid,
    toTid: input.buyerTid,
    league: input.league,
    season: input.season,
    transactionId: input.activityId,
  };
}

export interface TransferCashPosting {
  bidId: string;
  date: string;
  season: number;
  label: string;
  side: 'purchase' | 'sale';
  playerId: string;
  sellerTid: number;
  sellerName: string;
  buyerTid: number;
  buyerName: string;
}

function cloneFinanceState(tycoon: TycoonState): TycoonState {
  return {
    ...tycoon,
    transactions: [...(tycoon.transactions ?? [])],
    commitments: [...(tycoon.commitments ?? [])],
    activeReservations: [...(tycoon.activeReservations ?? [])],
  };
}

export function adjustCash(
  teamsArr: any[],
  tid: number,
  deltaEUR: number,
  posting: TransferCashPosting,
): any[] {
  return teamsArr.map(t => {
    const id = t.id ?? t.tid;
    if (id !== tid || !t.tycoon) return t;
    const tycoon = cloneFinanceState(t.tycoon);
    releaseClubReservation(tycoon, `transfer-bid:${posting.bidId}`);
    postClubTransaction(tycoon, {
      sourceId: `transfer-${posting.side}:${posting.bidId}`,
      date: posting.date,
      season: posting.season,
      category: 'transfer',
      label: posting.label,
      amountEUR: deltaEUR,
      playerId: posting.playerId,
      counterpartyTid: posting.side === 'sale' ? posting.buyerTid : posting.sellerTid,
      counterpartyName: posting.side === 'sale' ? posting.buyerName : posting.sellerName,
      transactionType: 'Permanent transfer',
    });
    return { ...t, tycoon };
  });
}

export function releaseInactiveTransferBidReservations(teamsArr: any[], bids: TransferBid[]): any[] {
  const activeBidIds = new Set(
    bids.filter(bid => bid.status === 'active' || bid.status === 'highest').map(bid => bid.id),
  );
  return teamsArr.map(team => {
    if (!team.tycoon?.activeReservations?.some((reservation: { sourceId: string }) => (
      reservation.sourceId.startsWith('transfer-bid:')
      && !activeBidIds.has(reservation.sourceId.slice('transfer-bid:'.length))
    ))) return team;
    const tycoon = cloneFinanceState(team.tycoon);
    tycoon.activeReservations = tycoon.activeReservations?.filter(reservation => (
      !reservation.sourceId.startsWith('transfer-bid:')
      || activeBidIds.has(reservation.sourceId.slice('transfer-bid:'.length))
    ));
    return { ...team, tycoon };
  });
}
