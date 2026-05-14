/**
 * transferMarketTicker.ts — Daily AI tick for the Euro Transfer Market.
 *
 * Called once per simulated day from `simulationHandler`. Responsibilities:
 *  - Decrement listing.daysLeft, expire listings that hit 0
 *  - Expire bids that have passed their expiresDate
 *  - AI bidders submit bids on attractive user + AI listings (during window)
 *  - AI sellers accept highest bid on their own listings under conditions
 *  - AI-to-AI: rare new listings to keep the market alive
 *  - On accepted AI-to-AI bid, execute the move + cash exchange
 *
 * All randomness is seeded by the calendar date so a re-sim of the same day
 * is deterministic.
 */

import type { GameState, NBAPlayer, TransferBid, TransferListing } from '../../types';
import { isInTransferWindow } from '../../utils/transferWindow';
import {
  addDays,
  buildBid,
  buildListing,
  estimatePlayerValueEUR,
  markHighest,
  newId,
  resolveTeamAnywhere,
  syncListingRollups,
  teamCashEUR,
  toISO,
} from './transferMarket';
import { convertTo2KRating } from '../../utils/helpers';

// Lightweight deterministic PRNG seeded from a string.
function seedRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const SYSTEM_TID = -999;

interface TickResult {
  transferListings: TransferListing[];
  transferBids: TransferBid[];
  transferActivity: NonNullable<GameState['transferActivity']>;
  players: NBAPlayer[];
  teams: any[];
  nonNBATeams: any[];
  /** Per-team cash deltas, in EUR. Only Euro tycoon teams should be adjusted upstream. */
  inboxNotices: Array<{ playerName: string; bidderName: string; amount: number }>;
}

function adjustCash(teamsArr: any[], tid: number, deltaEUR: number): any[] {
  return teamsArr.map(t => {
    const id = t.id ?? t.tid;
    if (id !== tid || !t.tycoon) return t;
    return { ...t, tycoon: { ...t.tycoon, cashOnHand: (t.tycoon.cashOnHand ?? 0) + deltaEUR } };
  });
}

/** Daily tick. Pure with respect to inputs; returns patches for the caller to merge. */
export function tickTransferMarket(state: GameState): TickResult {
  const today = toISO(state.date);
  const rng = seedRng(`tm:${today}`);
  const windowStatus = isInTransferWindow(state.date, state.leagueStats);

  let listings: TransferListing[] = [...(state.transferListings ?? [])];
  let bids: TransferBid[] = [...(state.transferBids ?? [])];
  let activity = [...(state.transferActivity ?? [])];
  let players = [...(state.players ?? [])];
  let teams = [...(state.teams ?? [])];
  let nonNBA = [...((state as any).nonNBATeams ?? [])];
  const inboxNotices: TickResult['inboxNotices'] = [];

  const userTid = state.userTeamId ?? -1;

  // ── 1. Tick listings: -1 day, expire at 0 ────────────────────────────────
  listings = listings.map(l => {
    if (l.status !== 'active') return l;
    const next = l.daysLeft - 1;
    if (next <= 0) return { ...l, daysLeft: 0, status: 'expired' as const };
    return { ...l, daysLeft: next };
  });

  // ── 2. Expire stale bids ────────────────────────────────────────────────
  bids = bids.map(b => {
    if ((b.status === 'active' || b.status === 'highest') && b.expiresDate <= today) {
      return { ...b, status: 'expired' as const };
    }
    return b;
  });

  // Skip the AI loop entirely when window is closed.
  if (!windowStatus.open) {
    return { transferListings: listings, transferBids: bids, transferActivity: activity, players, teams, nonNBATeams: nonNBA, inboxNotices };
  }

  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();

  // Build a quick lookup
  const playerById = new Map<string, NBAPlayer>();
  for (const p of players) playerById.set(p.internalId, p);

  // Bidder pool: Euro-mode = all Euro teams; NBA-mode = NBA teams.
  const euroMode = state.leagueStats?.uiMode === 'euro_isolated';
  const eligibleTeams: any[] = euroMode
    ? [...(teams ?? []), ...(nonNBA ?? [])]
    : [...(teams ?? [])];
  const eligibleTids: number[] = eligibleTeams
    .map(t => (t.id ?? t.tid))
    .filter((tid: number) => typeof tid === 'number' && tid >= 0);

  // ── 3. AI bidders consider every active listing they don't already bid on ─
  for (const l of listings) {
    if (l.status !== 'active') continue;
    const player = playerById.get(l.playerId);
    if (!player) continue;
    const fairEUR = estimatePlayerValueEUR(player, currentYear);

    for (const bidderTid of eligibleTids) {
      if (bidderTid === l.sellerTid) continue;
      // 1 chance in N per day per (team, listing). Higher for hot listings.
      const ownBid = bids.find(b => b.listingId === l.id && b.bidderTid === bidderTid && (b.status === 'active' || b.status === 'highest'));
      if (ownBid) continue;
      const wantThreshold = player.tid === userTid ? 0.18 : 0.06; // AI more interested in user's listings
      if (rng() > wantThreshold) continue;
      // Cash gate
      const cash = teamCashEUR(state, bidderTid);
      const willingness = Math.min(cash * 0.4, fairEUR * (0.85 + rng() * 0.4));
      const amount = Math.max(50_000, Math.round(willingness / 50_000) * 50_000);
      if (amount < l.askingEUR * 0.4) continue; // skip lowballs
      // Build + push
      const bid = buildBid({
        listingId: l.id,
        playerId: l.playerId,
        bidderTid,
        sellerTid: l.sellerTid,
        bidType: 'transfer',
        amountEUR: amount,
        currentDate: today,
        validDays: 5,
      });
      bids = [...bids, bid];

      // Notify user if it's on their listing
      if (l.sellerTid === userTid) {
        const bidderTeam = resolveTeamAnywhere(state, bidderTid);
        inboxNotices.push({
          playerName: player.name,
          bidderName: (bidderTeam as any)?.name ?? '—',
          amount,
        });
      }
    }
    bids = markHighest(bids, l.id);
  }
  listings = syncListingRollups(listings, bids);

  // ── 4. AI sellers accept highest bid when listing nears end & meets asking ─
  for (const l of listings) {
    if (l.status !== 'active') continue;
    if (l.sellerTid === userTid) continue; // never auto-accept for the user
    const highest = bids.find(b => b.listingId === l.id && b.status === 'highest');
    if (!highest) continue;
    const meetsAsk = highest.amountEUR >= l.askingEUR;
    const lastDay = l.daysLeft <= 1;
    const eagerSell = rng() < 0.15;
    if (meetsAsk || (lastDay && rng() < 0.5) || eagerSell) {
      // Execute move
      const player = playerById.get(highest.playerId);
      players = players.map(p => p.internalId === highest.playerId ? { ...p, tid: highest.bidderTid } : p);
      teams = adjustCash(teams, highest.sellerTid, +highest.amountEUR);
      teams = adjustCash(teams, highest.bidderTid, -highest.amountEUR);
      nonNBA = adjustCash(nonNBA, highest.sellerTid, +highest.amountEUR);
      nonNBA = adjustCash(nonNBA, highest.bidderTid, -highest.amountEUR);
      activity = [
        ...activity,
        {
          id: newId('act'),
          date: today,
          fromTid: highest.sellerTid,
          toTid: highest.bidderTid,
          playerId: highest.playerId,
          playerName: player?.name ?? '—',
          feeEUR: highest.amountEUR,
          bidType: highest.bidType,
        },
      ];
      // Close listing + losing bids
      listings = listings.map(x => x.id === l.id ? { ...x, status: 'sold' as const, daysLeft: 0 } : x);
      bids = bids.map(b => {
        if (b.id === highest.id) return { ...b, status: 'accepted' as const };
        if (b.listingId === l.id && (b.status === 'active' || b.status === 'highest')) return { ...b, status: 'rejected' as const };
        return b;
      });
    }
  }

  // ── 5. AI-to-AI: rare new listings ──────────────────────────────────────
  //   Per AI team per day: ~2% chance to put one of its surplus players on the market.
  for (const sellerTid of eligibleTids) {
    if (sellerTid === userTid) continue;
    if (rng() > 0.02) continue;
    const roster = players.filter(p => p.tid === sellerTid);
    if (roster.length < 13) continue; // must have surplus
    // pick a mid-tier guy
    const candidates = roster.filter(p => {
      const ovr2k = Math.round(convertTo2KRating(p.overallRating ?? 60));
      return ovr2k >= 60 && ovr2k <= 78;
    });
    if (candidates.length === 0) continue;
    // skip players already listed
    const alreadyListed = new Set(listings.filter(l => l.status === 'active').map(l => l.playerId));
    const free = candidates.filter(p => !alreadyListed.has(p.internalId));
    if (free.length === 0) continue;
    const pick = free[Math.floor(rng() * free.length)];
    const ask = estimatePlayerValueEUR(pick, currentYear);
    const days = 5 + Math.floor(rng() * 6);
    listings = [...listings, buildListing({
      playerId: pick.internalId,
      sellerTid,
      askingEUR: Math.round(ask * (0.9 + rng() * 0.3) / 50_000) * 50_000,
      durationDays: days,
      currentDate: today,
    })];
  }

  // Cap activity log
  if (activity.length > 50) activity = activity.slice(-50);

  return {
    transferListings: listings,
    transferBids: bids,
    transferActivity: activity,
    players,
    teams,
    nonNBATeams: nonNBA,
    inboxNotices,
  };
}
