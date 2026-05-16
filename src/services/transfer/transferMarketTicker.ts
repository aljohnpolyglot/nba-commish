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
import { evaluateOffer } from './interestModel';
import { filterTransferMarketTeams, isTransferMarketEligibleTid, getTransferMarketLeague } from './marketEligibility';
import { getCapStatus } from './transferCaps';

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
  /** Resolutions for user-submitted bids — surfaced as toasts in GameContext. */
  userBidResolutions: Array<{ playerName: string; accepted: boolean; sellerTeamName: string; feeEUR: number; reason?: string }>;
  /** History entries for the TransactionsView "Transfer" type. Merged into state.history. */
  historyEntries: Array<{ text: string; date: string; type: string; playerIds: string[]; tid?: number; league?: string }>;
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
  const userBidResolutions: TickResult['userBidResolutions'] = [];
  const historyEntries: TickResult['historyEntries'] = [];
  // Game-date format ("Mon DD, YYYY") for history; ISO for activity.
  const gameDate = typeof state.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(state.date)
    ? state.date
    : new Date(`${today}T00:00:00Z`).toLocaleDateString('en-US', {
        timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
      });

  const userTid = state.userTeamId ?? -1;

  // ── 0. Purge listings + bids from ineligible leagues (Euro mode only) ───
  // Stale data from before the marketEligibility filter shipped — PBA, WNBA,
  // etc. listings that snuck into the pool. Mark as expired so the UI drops
  // them; the architectural filter above prevents future leaks at write-side.
  if (state.leagueStats?.uiMode === 'euro_isolated') {
    listings = listings.map(l =>
      l.status === 'active' && !isTransferMarketEligibleTid(l.sellerTid)
        ? { ...l, status: 'expired' as const, daysLeft: 0 }
        : l
    );
    bids = bids.map(b =>
      (b.status === 'active' || b.status === 'highest') && !isTransferMarketEligibleTid(b.sellerTid)
        ? { ...b, status: 'expired' as const }
        : b
    );
  }

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
    return { transferListings: listings, transferBids: bids, transferActivity: activity, players, teams, nonNBATeams: nonNBA, inboxNotices, userBidResolutions, historyEntries };
  }

  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();

  // ── Pre-compute lookup maps once per tick (perf hotspot) ─────────────────
  // Without these every inner loop iteration repeats O(players) and O(teams)
  // scans. With 10 listings × 18 eligible bidders × 100s of players, the
  // naive version made Sim Day take seconds. Maps drop the cost to O(1).
  const playerById = new Map<string, NBAPlayer>();
  for (const p of players) playerById.set(p.internalId, p);

  const rosterByTid = new Map<number, NBAPlayer[]>();
  for (const p of players) {
    const tid = p.tid;
    if (typeof tid !== 'number' || tid < 0) continue;
    let arr = rosterByTid.get(tid);
    if (!arr) { arr = []; rosterByTid.set(tid, arr); }
    arr.push(p);
  }

  // Bidder/seller pool: Euro-mode uses the league registry in
  // marketEligibility.ts — Euroleague + Liga Endesa only. Excludes PBA, WNBA,
  // CBA, B-League, G-League, NBL etc. that share the nonNBATeams array but
  // don't participate in the transfer-fee market. Adding a league = one line
  // in TRANSFER_MARKET_LEAGUES, no ticker change.
  const euroMode = state.leagueStats?.uiMode === 'euro_isolated';
  const eligibleTeams: any[] = euroMode
    ? filterTransferMarketTeams([...(nonNBA ?? [])])
    : [...(teams ?? [])];
  const eligibleTids: number[] = eligibleTeams
    .map(t => (t.id ?? t.tid))
    .filter((tid: number) => typeof tid === 'number' && tid >= 0);

  // Cash lookup: pre-build once. Mutated below when a transfer fires so the
  // refill loop sees the current bankroll.
  const cashByTid = new Map<number, number>();
  for (const tid of eligibleTids) cashByTid.set(tid, teamCashEUR(state, tid));

  // Per-club transfer caps + floors. Read from the shared transferCaps
  // registry → Euroleague 5/club summer + 2 winter, Endesa 6/club + 2.
  // canBuy/canSell guards block over-capped clubs; underBuyFloor/underSellFloor
  // flags drive refill preference toward quiet clubs.
  //
  // Window-open ISO is reconstructed from settings MM-DD + the current
  // calendar year — `windowStatus` only exposes currentClose. Counts within
  // this window decide the per-club caps.
  const settings = state.leagueStats?.transferMarket ?? { summerStart: '07-01', summerEnd: '09-30', winterStart: '01-01', winterEnd: '01-31' };
  const todayY = parseInt(today.slice(0, 4), 10);
  const todayMonth = parseInt(today.slice(5, 7), 10);
  const seasonStartYear = todayMonth >= 7 ? todayY : todayY - 1;
  const transferSeasonStartIso = `${seasonStartYear}-07-01`;
  const transferSeasonEndIso = `${seasonStartYear + 1}-06-30`;
  const transferredPlayerIdsThisSeason = new Set(
    activity
      .filter(a => a.date >= transferSeasonStartIso && a.date <= transferSeasonEndIso)
      .map(a => a.playerId),
  );
  listings = listings.map(l =>
    l.status === 'active' && transferredPlayerIdsThisSeason.has(l.playerId)
      ? { ...l, status: 'expired' as const, daysLeft: 0 }
      : l,
  );
  const windowOpenIsoCap = windowStatus.window === 'summer'
    ? `${todayY}-${settings.summerStart}`
    : windowStatus.window === 'winter'
      ? `${todayY}-${settings.winterStart}`
      : null;
  const windowCloseIsoCap = windowStatus.currentClose ? toISO(windowStatus.currentClose) : null;
  const capByTid = new Map<number, ReturnType<typeof getCapStatus>>();
  for (const tid of eligibleTids) {
    capByTid.set(tid, getCapStatus(activity, tid, windowStatus.window ?? 'closed', windowOpenIsoCap, windowCloseIsoCap));
  }
  // Helper: re-stamp a tid's cap status after a buy/sell mutation so the
  // refill loop respects the new count without rebuilding everything.
  const bumpCap = (tid: number, delta: { bought?: number; sold?: number }) => {
    const prev = capByTid.get(tid);
    if (!prev) return;
    const next = { ...prev };
    if (delta.bought) {
      next.bought += delta.bought;
      next.canBuy = next.bought < next.buyCap;
    }
    if (delta.sold) {
      next.sold += delta.sold;
      next.canSell = next.sold < next.sellCap;
    }
    capByTid.set(tid, next);
  };

  // Team lookup for toast/inbox names — same scan logic resolveTeamAnywhere
  // does but done once.
  const teamByTid = new Map<number, any>();
  for (const t of teams ?? []) teamByTid.set(((t as any).id ?? (t as any).tid) as number, t);
  for (const t of nonNBA ?? []) teamByTid.set(((t as any).tid ?? (t as any).id) as number, t);

  // Active-bid lookup: pair (listingId|bidderTid) → bid, avoids the per-pair
  // bids.find() scan that was running L × B × Bidders times.
  const activeBidKey = (listingId: string, bidderTid: number) => `${listingId}|${bidderTid}`;
  const activeBidByPair = new Map<string, any>();
  for (const b of bids) {
    if (b.status === 'active' || b.status === 'highest') {
      activeBidByPair.set(activeBidKey(b.listingId, b.bidderTid), b);
    }
  }

  // ── 3. AI bidders consider every active listing they don't already bid on ─
  //   Single-pass append into newBids[], merged at end. Avoids the
  //   `bids = [...bids, bid]` allocation per inner iteration.
  const newBids: typeof bids = [];
  for (const l of listings) {
    if (l.status !== 'active') continue;
    if (transferredPlayerIdsThisSeason.has(l.playerId)) continue;
    const player = playerById.get(l.playerId);
    if (!player) continue;
    const fairEUR = estimatePlayerValueEUR(player, currentYear);

    for (const bidderTid of eligibleTids) {
      if (bidderTid === l.sellerTid) continue;
      if (activeBidByPair.has(activeBidKey(l.id, bidderTid))) continue;
      // Hard cap: stop a club from buying beyond its window allotment.
      // Soft floor: clubs under their minBuysSummer get a 2× want boost so
      // quiet clubs eventually hit at least 1–2 moves per off-season.
      const cap = capByTid.get(bidderTid);
      if (cap && !cap.canBuy) continue;
      const floorBoost = cap?.underBuyFloor ? 2.0 : 1.0;
      const wantThreshold = (player.tid === userTid ? 0.22 : 0.08) * floorBoost;
      if (rng() > wantThreshold) continue;
      const cash = cashByTid.get(bidderTid) ?? 0;
      const willingness = Math.min(cash * 0.4, fairEUR * (0.85 + rng() * 0.45));
      const amount = Math.max(50_000, Math.round(willingness / 50_000) * 50_000);
      if (amount < l.askingEUR * 0.4) continue;
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
      newBids.push(bid);
      activeBidByPair.set(activeBidKey(l.id, bidderTid), bid);

      if (l.sellerTid === userTid) {
        const bidderTeam = teamByTid.get(bidderTid);
        inboxNotices.push({
          playerName: player.name,
          bidderName: (bidderTeam as any)?.name ?? '—',
          amount,
        });
      }
    }
  }
  if (newBids.length > 0) bids = [...bids, ...newBids];
  // Single markHighest pass per listing — far cheaper than the per-listing
  // pass inside the inner loop, and produces the same result.
  for (const l of listings) {
    if (l.status === 'active') bids = markHighest(bids, l.id);
  }
  listings = syncListingRollups(listings, bids);

  // ── 3a. Evaluate user bids on AI listings via the shared interestModel ──
  //   Both UI gauges (Club Interest %, Player Interest %) and these reject
  //   paths consume the same evaluateOffer() helper, so what the user sees
  //   in BidOnListingModal IS what fires here.
  //   Two reject paths:
  //     - clubLowball: amount < 80% asking → "Lowball" toast
  //     - playerVeto:  player interest <50% AND amount <1.2× asking → "Player
  //                    wants a contender" toast (club may even have said yes,
  //                    but the player refuses the move)
  for (const l of listings) {
    if (l.status !== 'active') continue;
    if (l.sellerTid === userTid) continue;
    const userBids = bids.filter(b =>
      b.listingId === l.id &&
      b.bidderTid === userTid &&
      (b.status === 'active' || b.status === 'highest' || b.status === 'outbid')
    );
    for (const ub of userBids) {
      const verdict = evaluateOffer(ub.amountEUR, l.askingEUR, l.playerId);
      if (!verdict.clubLowball && !verdict.playerVeto) continue;
      bids = bids.map(b => b.id === ub.id ? { ...b, status: 'rejected' as const } : b);
      const sellerTeam = resolveTeamAnywhere(state, l.sellerTid);
      const player = playerById.get(l.playerId);
      // Flavor for player-veto: surface that the team would have accepted
      // but the player wants a different destination. Mirrors the modal warning.
      const reason = verdict.clubLowball
        ? verdict.rejectReason
        : `${sellerTeam ? (sellerTeam as any).name : 'The club'} accepted, but the player wants to join a contender.`;
      userBidResolutions.push({
        playerName: player?.name ?? '—',
        accepted: false,
        sellerTeamName: (sellerTeam as any)?.name ?? '—',
        feeEUR: ub.amountEUR,
        reason,
      });
    }
  }
  listings = syncListingRollups(listings, bids);

  // ── 4. AI sellers accept highest bid when listing nears end & meets asking ─
  for (const l of listings) {
    if (l.status !== 'active') continue;
    if (l.sellerTid === userTid) continue; // never auto-accept for the user
    if (transferredPlayerIdsThisSeason.has(l.playerId)) {
      listings = listings.map(x => x.id === l.id ? { ...x, status: 'expired' as const, daysLeft: 0 } : x);
      continue;
    }
    const highest = bids.find(b => b.listingId === l.id && b.status === 'highest');
    if (!highest) continue;
    const meetsAsk = highest.amountEUR >= l.askingEUR;
    const lastDay = l.daysLeft <= 1;
    const eagerSell = rng() < 0.15;
    // Player veto applies to the highest bid too — even if the club would say
    // yes, the player can refuse a non-overpay move when his interest is low.
    const v = evaluateOffer(highest.amountEUR, l.askingEUR, l.playerId);
    if (v.playerVeto && (meetsAsk || eagerSell || lastDay)) {
      bids = bids.map(b => b.id === highest.id ? { ...b, status: 'rejected' as const } : b);
      if (highest.bidderTid === userTid) {
        const sellerTeam = resolveTeamAnywhere(state, l.sellerTid);
        const player = playerById.get(highest.playerId);
        userBidResolutions.push({
          playerName: player?.name ?? '—',
          accepted: false,
          sellerTeamName: (sellerTeam as any)?.name ?? '—',
          feeEUR: highest.amountEUR,
          reason: `${sellerTeam ? (sellerTeam as any).name : 'The club'} accepted, but the player wants to join a contender.`,
        });
      }
      continue;
    }
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
      transferredPlayerIdsThisSeason.add(highest.playerId);
      // Close listing + losing bids
      listings = listings.map(x => x.id === l.id ? { ...x, status: 'sold' as const, daysLeft: 0 } : x);
      bids = bids.map(b => {
        if (b.id === highest.id) return { ...b, status: 'accepted' as const };
        if (b.listingId === l.id && (b.status === 'active' || b.status === 'highest')) return { ...b, status: 'rejected' as const };
        return b;
      });
      // Bump caps so the refill loop respects the new buy/sell tallies.
      bumpCap(highest.sellerTid, { sold: 1 });
      bumpCap(highest.bidderTid, { bought: 1 });
      // Push to TransactionsView history feed
      const sellerTeam = teamByTid.get(highest.sellerTid);
      const buyerTeam = teamByTid.get(highest.bidderTid);
      const feeM = (highest.amountEUR / 1_000_000).toFixed(highest.amountEUR >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '');
      // Map marketEligibility league names to the TransactionsView
      // EXTERNAL_LEAGUES filter strings ("Liga Endesa" → "Endesa") so the
      // filter dropdown surfaces these entries when the user picks Endesa.
      const lgName = getTransferMarketLeague(highest.sellerTid)?.name;
      const historyLeague = lgName === 'Liga Endesa' ? 'Endesa' : lgName;
      historyEntries.push({
        text: `${player?.name ?? '—'} transferred from ${(sellerTeam as any)?.name ?? '—'} to ${(buyerTeam as any)?.name ?? '—'} for €${feeM}M`,
        date: gameDate,
        type: 'Transfer',
        playerIds: player ? [player.internalId] : [],
        tid: highest.bidderTid,
        league: historyLeague,
      });
      // Surface a celebration toast when the user is the winning bidder.
      if (highest.bidderTid === userTid) {
        const sellerTeam = resolveTeamAnywhere(state, highest.sellerTid);
        userBidResolutions.push({
          playerName: player?.name ?? '—',
          accepted: true,
          sellerTeamName: (sellerTeam as any)?.name ?? '—',
          feeEUR: highest.amountEUR,
        });
      }
    }
  }

  // ── 5. Browse Market floor: always keep ≥10 AI listings on the board ────
  //   Whenever a listing expires/sells, the next tick refills the pool from
  //   AI rosters so the user always has options. Caps at MIN_AI_LISTINGS to
  //   avoid the market drying up mid-window or feeling empty after a flurry
  //   of accepts. Above the floor, the rare 2% drip still runs to keep
  //   the market fresh with new names.
  const MIN_AI_LISTINGS = 10;
  // Running counter — way cheaper than re-filtering after every refill.
  let activeAICount = 0;
  for (const l of listings) {
    if (l.status === 'active' && l.sellerTid !== userTid) activeAICount++;
  }

  // Single mutable `alreadyListed` set for the whole refill phase — building
  // it from listings.filter on every call was O(L) per attempt.
  const alreadyListed = new Set(listings.filter(l => l.status === 'active').map(l => l.playerId));

  const pickRandomAISellerListing = (): boolean => {
    // Bias the shuffle: clubs below their sell floor go first → quiet clubs
    // hit their minimum off-season activity. Capped clubs are filtered out
    // entirely so an over-active club doesn't keep being asked.
    const eligibleSellers = eligibleTids
      .filter(t => t !== userTid)
      .filter(t => {
        const cap = capByTid.get(t);
        return !cap || cap.canSell;
      })
      .sort((a, b) => {
        const ca = capByTid.get(a);
        const cb = capByTid.get(b);
        const aFloor = ca?.underSellFloor ? 0 : 1;
        const bFloor = cb?.underSellFloor ? 0 : 1;
        if (aFloor !== bFloor) return aFloor - bFloor;
        return rng() - 0.5;
      });
    for (const sellerTid of eligibleSellers) {
      const roster = rosterByTid.get(sellerTid) ?? [];
      if (roster.length < 13) continue;
      const candidates = roster.filter(p => {
        const ovr2k = Math.round(convertTo2KRating(p.overallRating ?? 60));
        return ovr2k >= 60 && ovr2k <= 82 && !alreadyListed.has(p.internalId) && !transferredPlayerIdsThisSeason.has(p.internalId);
      });
      if (candidates.length === 0) continue;
      const pick = candidates[Math.floor(rng() * candidates.length)];
      const ask = Math.round(estimatePlayerValueEUR(pick, currentYear) * (0.9 + rng() * 0.3) / 50_000) * 50_000;
      const days = 5 + Math.floor(rng() * 6);
      const newListing = buildListing({
        playerId: pick.internalId,
        sellerTid,
        askingEUR: ask,
        durationDays: days,
        currentDate: today,
      });
      listings = [...listings, newListing];
      alreadyListed.add(pick.internalId);

      // Seed an opening bid from another AI club so the listing doesn't show
      // €0 highest bid on day 1. Sometimes nobody bites — that's also fine,
      // keeps variety. Bid sits between 70–105% of asking.
      if (rng() < 0.7) {
        // Opening bidder must also have capacity to buy — otherwise we'd
        // strand the listing with a phantom bid from a capped club.
        const otherSellers = eligibleSellers.filter(t => {
          if (t === sellerTid) return false;
          const cap = capByTid.get(t);
          return !cap || cap.canBuy;
        });
        if (otherSellers.length > 0) {
          const bidderTid = otherSellers[Math.floor(rng() * otherSellers.length)];
          const openingBidAmount = Math.round(ask * (0.7 + rng() * 0.35) / 50_000) * 50_000;
          const opening = buildBid({
            listingId: newListing.id,
            playerId: pick.internalId,
            bidderTid,
            sellerTid,
            bidType: 'transfer',
            amountEUR: openingBidAmount,
            currentDate: today,
            validDays: 5,
          });
          bids = [...bids, opening];
        }
      }
      return true;
    }
    return false;
  };

  // Refill loop: top up to MIN_AI_LISTINGS, but bail out if no eligible
  // candidates remain so we don't spin forever on a thin roster pool.
  let refillGuard = 50;
  while (activeAICount < MIN_AI_LISTINGS && refillGuard-- > 0) {
    if (!pickRandomAISellerListing()) break;
    activeAICount++;
  }

  // Drip above the floor: small ~2%/team chance to add organic churn so the
  // board doesn't look frozen once the floor is met.
  if (activeAICount < MIN_AI_LISTINGS + 5) {
    for (const sellerTid of eligibleTids) {
      if (sellerTid === userTid) continue;
      if (rng() > 0.02) continue;
      if (pickRandomAISellerListing()) activeAICount++;
    }
  }

  // Sync rollups + highest pass — but only for listings that gained bids
  // during refill. Skip the full-listings scan otherwise.
  if (newBids.length > 0 || activeAICount > 0) {
    for (const l of listings) {
      if (l.status === 'active') bids = markHighest(bids, l.id);
    }
    listings = syncListingRollups(listings, bids);
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
    userBidResolutions,
    historyEntries,
  };
}
