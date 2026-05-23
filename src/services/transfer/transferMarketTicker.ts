import type { GameState, NBAPlayer, TransferBid, TransferListing } from '../../types';
import { isInTransferWindow } from '../../utils/transferWindow';
import {
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
import { getDisplayOverall, getDisplayPotential } from '../../utils/playerRatings';
import { evaluateOffer } from './interestModel';
import { filterTransferMarketTeams, isTransferMarketEligibleTid, getTransferMarketLeague } from './marketEligibility';
import { getCapStatus } from './transferCaps';
import {
  adjustCash,
  AI_ACCEPTS_PER_DAY_CAP,
  collectMovedPlayerIdsThisSeason,
  countCompletedTransfersInWindow,
  GLOBAL_WINDOW_CAP,
  seedRng,
  type TickResult,
} from './transferMarketTickerHelpers';
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
  const gameDate = typeof state.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(state.date)
    ? state.date
    : new Date(`${today}T00:00:00Z`).toLocaleDateString('en-US', {
        timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
      });
  const userTid = state.userTeamId ?? -1;
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
  if (state.gameMode === 'gm' && userTid >= 0) {
    bids = bids.map(b =>
      b.bidderTid === userTid &&
      b.userInitiated !== true &&
      (b.status === 'active' || b.status === 'highest' || b.status === 'outbid')
        ? { ...b, status: 'withdrawn' as const }
        : b
    );
  }
  listings = listings.map(l => {
    if (l.status !== 'active') return l;
    const next = l.daysLeft - 1;
    if (next <= 0) return { ...l, daysLeft: 0, status: 'expired' as const };
    return { ...l, daysLeft: next };
  });
  bids = bids.map(b => {
    if ((b.status === 'active' || b.status === 'highest') && b.expiresDate <= today) {
      return { ...b, status: 'expired' as const };
    }
    return b;
  });
  if (!windowStatus.open) {
    return { transferListings: listings, transferBids: bids, transferActivity: activity, players, teams, nonNBATeams: nonNBA, inboxNotices, userBidResolutions, historyEntries };
  }
  const currentYear: number = state.leagueStats?.year ?? new Date().getFullYear();
  const euroMode = state.leagueStats?.uiMode === 'euro_isolated';
  const playerById = new Map<string, NBAPlayer>();
  for (const p of players) playerById.set(p.internalId, p);
  if (euroMode) {
    listings = listings.map(l => {
      const player = playerById.get(l.playerId);
      return l.status === 'active' && (!player || player.tid !== l.sellerTid || !isTransferMarketEligibleTid(l.sellerTid))
        ? { ...l, status: 'expired' as const, daysLeft: 0 }
        : l;
    });
    bids = bids.map(b => {
      const player = playerById.get(b.playerId);
      return (b.status === 'active' || b.status === 'highest') && (
        !player ||
        player.tid !== b.sellerTid ||
        !isTransferMarketEligibleTid(b.sellerTid) ||
        !isTransferMarketEligibleTid(b.bidderTid)
      )
        ? { ...b, status: 'expired' as const }
        : b;
    });
  }
  const rosterByTid = new Map<number, NBAPlayer[]>();
  for (const p of players) {
    const tid = p.tid;
    if (typeof tid !== 'number' || tid < 0) continue;
    let arr = rosterByTid.get(tid);
    if (!arr) { arr = []; rosterByTid.set(tid, arr); }
    arr.push(p);
  }
  const eligibleTeams: any[] = euroMode
    ? filterTransferMarketTeams([...(nonNBA ?? [])])
    : [...(teams ?? [])];
  const eligibleTids: number[] = eligibleTeams
    .map(t => (t.id ?? t.tid))
    .filter((tid: number) => typeof tid === 'number' && tid >= 0);
  const aiBidderTids = state.gameMode === 'gm'
    ? eligibleTids.filter(tid => tid !== userTid)
    : eligibleTids;
  const cashByTid = new Map<number, number>();
  for (const tid of eligibleTids) cashByTid.set(tid, teamCashEUR(state, tid));
  const settings = state.leagueStats?.transferMarket ?? { summerStart: '07-01', summerEnd: '09-30', winterStart: '01-01', winterEnd: '01-31' };
  const todayY = parseInt(today.slice(0, 4), 10);
  const todayMonth = parseInt(today.slice(5, 7), 10);
  const seasonStartYear = todayMonth >= 7 ? todayY : todayY - 1;
  const transferSeasonStartIso = `${seasonStartYear}-07-01`;
  const transferSeasonEndIso = `${seasonStartYear + 1}-06-30`;
  const transferredPlayerIdsThisSeason = collectMovedPlayerIdsThisSeason(state, activity, transferSeasonStartIso, transferSeasonEndIso);
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
  const completedTransfersThisWindow = countCompletedTransfersInWindow(state, activity, windowOpenIsoCap, windowCloseIsoCap);
  const globalWindowFull = completedTransfersThisWindow >= GLOBAL_WINDOW_CAP[windowStatus.window ?? 'closed'];
  const capByTid = new Map<number, ReturnType<typeof getCapStatus>>();
  for (const tid of eligibleTids) {
    capByTid.set(tid, getCapStatus(activity, tid, windowStatus.window ?? 'closed', windowOpenIsoCap, windowCloseIsoCap));
  }
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
  const teamByTid = new Map<number, any>();
  for (const t of teams ?? []) teamByTid.set(((t as any).id ?? (t as any).tid) as number, t);
  for (const t of nonNBA ?? []) teamByTid.set(((t as any).tid ?? (t as any).id) as number, t);
  const activeBidKey = (listingId: string, bidderTid: number) => `${listingId}|${bidderTid}`;
  const activeBidByPair = new Map<string, any>();
  for (const b of bids) {
    if (b.status === 'active' || b.status === 'highest') {
      activeBidByPair.set(activeBidKey(b.listingId, b.bidderTid), b);
    }
  }
  const newBids: typeof bids = [];
  if (!globalWindowFull) {
    for (const l of listings) {
      if (l.status !== 'active') continue;
      if (transferredPlayerIdsThisSeason.has(l.playerId)) continue;
      const player = playerById.get(l.playerId);
      if (!player) continue;
      const fairEUR = estimatePlayerValueEUR(player, currentYear);
      for (const bidderTid of aiBidderTids) {
        if (bidderTid === l.sellerTid) continue;
        if (activeBidByPair.has(activeBidKey(l.id, bidderTid))) continue;
        const cap = capByTid.get(bidderTid);
        if (cap && !cap.canBuy) continue;
        const wantThreshold = player.tid === userTid
          ? (windowStatus.window === 'winter' ? 0.08 : 0.16)
          : (windowStatus.window === 'winter' ? 0.006 : 0.018);
        if (rng() > wantThreshold) continue;
        const cash = cashByTid.get(bidderTid) ?? 0;
        const willingness = Math.min(cash * 0.25, fairEUR * (0.8 + rng() * 0.35));
        const amount = Math.max(50_000, Math.round(willingness / 50_000) * 50_000);
        if (amount < l.askingEUR * 0.75) continue;
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
  }
  if (newBids.length > 0) bids = [...bids, ...newBids];
  for (const l of listings) {
    if (l.status === 'active') bids = markHighest(bids, l.id);
  }
  listings = syncListingRollups(listings, bids);
  for (const l of listings) {
    if (l.status !== 'active') continue;
    if (l.sellerTid === userTid) continue;
    const userBids = bids.filter(b =>
      b.listingId === l.id &&
      b.bidderTid === userTid &&
      b.userInitiated === true &&
      (b.status === 'active' || b.status === 'highest' || b.status === 'outbid')
    );
    for (const ub of userBids) {
      const verdict = evaluateOffer(ub.amountEUR, l.askingEUR, l.playerId);
      if (!verdict.clubLowball && !verdict.playerVeto) continue;
      bids = bids.map(b => b.id === ub.id ? { ...b, status: 'rejected' as const } : b);
      const sellerTeam = resolveTeamAnywhere(state, l.sellerTid);
      const player = playerById.get(l.playerId);
      const reason = verdict.clubLowball
        ? verdict.rejectReason
        : `${sellerTeam ? (sellerTeam as any).name : 'The club'} accepted, but the player wants to join a contender.`;
      userBidResolutions.push({
        playerName: player?.name ?? '—',
        accepted: false,
        sellerTeamName: (sellerTeam as any)?.name ?? '—',
        feeEUR: ub.amountEUR,
        reason,
        userInitiated: true,
      });
    }
  }
  listings = syncListingRollups(listings, bids);
  let aiAcceptedToday = 0;
  const aiAcceptsTodayCap = AI_ACCEPTS_PER_DAY_CAP[windowStatus.window ?? 'closed'];
  for (const l of listings) {
    if (l.status !== 'active') continue;
    if (l.sellerTid === userTid) continue; // never auto-accept for the user
    if (transferredPlayerIdsThisSeason.has(l.playerId)) {
      listings = listings.map(x => x.id === l.id ? { ...x, status: 'expired' as const, daysLeft: 0 } : x);
      continue;
    }
    const highest = bids.find(b => b.listingId === l.id && b.status === 'highest');
    if (!highest) continue;
    const isUserBid = highest.bidderTid === userTid && highest.userInitiated === true;
    if (!isUserBid && (
      completedTransfersThisWindow + aiAcceptedToday >= GLOBAL_WINDOW_CAP[windowStatus.window ?? 'closed'] ||
      aiAcceptedToday >= aiAcceptsTodayCap
    )) continue;
    const meetsAsk = highest.amountEUR >= l.askingEUR;
    const nearAsk = highest.amountEUR >= l.askingEUR * 0.9;
    const lastDay = l.daysLeft <= 1;
    const eagerSell = rng() < (windowStatus.window === 'winter' ? 0.005 : 0.02);
    const v = evaluateOffer(highest.amountEUR, l.askingEUR, l.playerId);
    if (v.playerVeto && (meetsAsk || eagerSell || lastDay)) {
      bids = bids.map(b => b.id === highest.id ? { ...b, status: 'rejected' as const } : b);
      if (highest.bidderTid === userTid && highest.userInitiated === true) {
        const sellerTeam = resolveTeamAnywhere(state, l.sellerTid);
        const player = playerById.get(highest.playerId);
        userBidResolutions.push({
          playerName: player?.name ?? '—',
          accepted: false,
          sellerTeamName: (sellerTeam as any)?.name ?? '—',
          feeEUR: highest.amountEUR,
          reason: `${sellerTeam ? (sellerTeam as any).name : 'The club'} accepted, but the player wants to join a contender.`,
          userInitiated: true,
        });
      }
      continue;
    }
    if (meetsAsk || (nearAsk && lastDay && rng() < 0.35) || (nearAsk && eagerSell)) {
      const player = playerById.get(highest.playerId);
      const buyerRosterStatus =
        highest.bidderTid >= 1000 && highest.bidderTid < 2000 ? 'Euroleague'
        : highest.bidderTid >= 5000 && highest.bidderTid < 6000 ? 'Endesa'
        : highest.bidderTid >= 2000 && highest.bidderTid < 3000 ? 'PBA'
        : highest.bidderTid >= 4000 && highest.bidderTid < 5000 ? 'B-League'
        : highest.bidderTid >= 7000 && highest.bidderTid < 8000 ? 'China CBA'
        : highest.bidderTid >= 8000 && highest.bidderTid < 9000 ? 'NBL Australia'
        : undefined;
      players = players.map(p => p.internalId === highest.playerId
        ? { ...p, tid: highest.bidderTid, ...(buyerRosterStatus ? { status: buyerRosterStatus as any } : {}) }
        : p);
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
      if (!isUserBid) aiAcceptedToday++;
      listings = listings.map(x => x.id === l.id ? { ...x, status: 'sold' as const, daysLeft: 0 } : x);
      bids = bids.map(b => {
        if (b.id === highest.id) return { ...b, status: 'accepted' as const };
        if (b.listingId === l.id && (b.status === 'active' || b.status === 'highest')) return { ...b, status: 'rejected' as const };
        return b;
      });
      bumpCap(highest.sellerTid, { sold: 1 });
      bumpCap(highest.bidderTid, { bought: 1 });
      const sellerTeam = teamByTid.get(highest.sellerTid);
      const buyerTeam = teamByTid.get(highest.bidderTid);
      const feeM = (highest.amountEUR / 1_000_000).toFixed(highest.amountEUR >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '');
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
      if (highest.bidderTid === userTid && highest.userInitiated === true) {
        const sellerTeam = resolveTeamAnywhere(state, highest.sellerTid);
        userBidResolutions.push({
          playerName: player?.name ?? '—',
          accepted: true,
          sellerTeamName: (sellerTeam as any)?.name ?? '—',
          feeEUR: highest.amountEUR,
          userInitiated: true,
        });
      }
    }
  }
  const MIN_AI_LISTINGS = globalWindowFull ? 0 : (windowStatus.window === 'winter' ? 3 : 8);
  let activeAICount = 0;
  for (const l of listings) {
    if (l.status === 'active' && l.sellerTid !== userTid) activeAICount++;
  }
  const alreadyListed = new Set(listings.filter(l => l.status === 'active').map(l => l.playerId));
  const pickRandomAISellerListing = (): boolean => {
    if (globalWindowFull) return false;
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
      const sortedRoster = [...roster].sort((a, b) =>
        (getDisplayOverall(b) + getDisplayPotential(b, currentYear) * 0.35) -
        (getDisplayOverall(a) + getDisplayPotential(a, currentYear) * 0.35)
      );
      const protectedIds = new Set(sortedRoster.slice(0, 2).map(p => p.internalId));
      const maxAutoListedOvr = windowStatus.window === 'winter' ? 75 : 78;
      const candidates = roster.filter(p => {
        const ovr2k = getDisplayOverall(p);
        const pot2k = getDisplayPotential(p, currentYear);
        return (
          ovr2k >= 60 &&
          ovr2k <= maxAutoListedOvr &&
          !(pot2k >= 83 && ovr2k >= 72) &&
          !protectedIds.has(p.internalId) &&
          !alreadyListed.has(p.internalId) &&
          !transferredPlayerIdsThisSeason.has(p.internalId)
        );
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
      if (rng() < (windowStatus.window === 'winter' ? 0.35 : 0.55)) {
        const otherSellers = eligibleSellers.filter(t => {
          if (t === sellerTid) return false;
          const cap = capByTid.get(t);
          return !cap || cap.canBuy;
        });
        if (otherSellers.length > 0) {
          const bidderTid = otherSellers[Math.floor(rng() * otherSellers.length)];
          const openingBidAmount = Math.round(ask * (0.85 + rng() * 0.25) / 50_000) * 50_000;
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
  let refillGuard = 50;
  while (activeAICount < MIN_AI_LISTINGS && refillGuard-- > 0) {
    if (!pickRandomAISellerListing()) break;
    activeAICount++;
  }
  if (!globalWindowFull && activeAICount < MIN_AI_LISTINGS + 4) {
    for (const sellerTid of eligibleTids) {
      if (sellerTid === userTid) continue;
      if (rng() > (windowStatus.window === 'winter' ? 0.003 : 0.01)) continue;
      if (pickRandomAISellerListing()) activeAICount++;
    }
  }
  if (newBids.length > 0 || activeAICount > 0) {
    for (const l of listings) {
      if (l.status === 'active') bids = markHighest(bids, l.id);
    }
    listings = syncListingRollups(listings, bids);
  }
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
