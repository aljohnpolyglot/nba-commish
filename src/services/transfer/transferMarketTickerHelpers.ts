import type { GameState, NBAPlayer, TransferBid, TransferListing } from '../../types';

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
  userBidResolutions: Array<{ playerName: string; accepted: boolean; sellerTeamName: string; feeEUR: number; reason?: string; userInitiated?: boolean }>;
  historyEntries: Array<{ text: string; date: string; type: string; playerIds: string[]; tid?: number; league?: string }>;
}

export function adjustCash(teamsArr: any[], tid: number, deltaEUR: number): any[] {
  return teamsArr.map(t => {
    const id = t.id ?? t.tid;
    if (id !== tid || !t.tycoon) return t;
    return { ...t, tycoon: { ...t.tycoon, cashOnHand: (t.tycoon.cashOnHand ?? 0) + deltaEUR } };
  });
}
