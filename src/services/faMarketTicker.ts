/**
 * faMarketTicker.ts — Drives the FA bidding lifecycle during the FA period.
 *
 * Per sim day, this module:
 *   1. Opens markets for notable unsigned FAs (K2 >= 80) that don't have one yet.
 *      AI team bids are generated via `generateAIBids`, with each bid's
 *      decision window (3-5 days) driving when the player picks.
 *   2. Resolves any markets whose decision window has closed — the best bid wins
 *      via `resolvePlayerDecision`, the player moves, history gets a signing entry,
 *      and the market is marked resolved.
 *
 * The pre-existing `runAIFreeAgencyRound` still handles low-tier FAs and
 * roster-minimum enforcement — this ticker runs first and filters top FAs
 * (and any with an active market) out of the pool so we never double-sign.
 */

import type { GameState, NBAPlayer, HistoryEntry } from '../types';
import { convertTo2KRating, calculateSocialEngagement } from '../utils/helpers';
import { getContractLimits } from '../utils/salaryUtils';
import { generateAIBids, resolvePlayerDecision, type FreeAgentBid, type FreeAgentMarket } from './freeAgencyBidding';
import { buildShamsTransactionPost } from './social/templates/charania';
import { findShamsPhoto } from './social/charaniaphotos';

/** A FA is eligible for a competitive market if they're notable enough to attract bids. */
const MARKET_K2_THRESHOLD = 80;
const MAX_NEW_MARKETS_PER_DAY = 6;

function getK2(player: NBAPlayer): number {
  const lastRating = (player as any).ratings?.[(player as any).ratings?.length - 1];
  return convertTo2KRating(player.overallRating ?? 60, lastRating?.hgt ?? 50);
}

export interface MarketTickResult {
  updatedMarkets: FreeAgentMarket[];
  /** Player mutations for signings that resolved this tick. */
  signedPlayerIds: Set<string>;
  playerMutations: Map<string, Partial<NBAPlayer>>;
  historyEntries: HistoryEntry[];
  /** News items for resolved signings — folded into state.news by simulationHandler. */
  newsItems: any[];
  /** Shams social posts for notable (K2 ≥ 78) resolved signings. */
  socialPosts: any[];
  /** Player ids that have an ACTIVE (unresolved) market — callers should skip these
   *  in `runAIFreeAgencyRound` so the regular round doesn't poach them. */
  pendingPlayerIds: Set<string>;
}

/**
 * Main entry. Call once per sim day during the FA season.
 */
export function tickFAMarkets(state: GameState): MarketTickResult {
  const currentDay = state.day;
  const currentYear = state.leagueStats?.year ?? 2026;
  const existing = state.faBidding?.markets ?? [];
  const workingMarkets: FreeAgentMarket[] = existing.map(m => ({ ...m, bids: [...m.bids] }));

  const signedPlayerIds = new Set<string>();
  const playerMutations = new Map<string, Partial<NBAPlayer>>();
  const historyEntries: HistoryEntry[] = [];
  const newsItems: any[] = [];
  const socialPosts: any[] = [];

  // ── 1. Resolve any markets whose decision day has arrived ──────────────────
  for (let i = 0; i < workingMarkets.length; i++) {
    const m = workingMarkets[i];
    if (m.resolved) continue;
    if (m.decidesOnDay > currentDay) continue;

    const player = state.players.find(p => p.internalId === m.playerId);
    if (!player) { workingMarkets[i] = { ...m, resolved: true }; continue; }
    if (player.tid >= 0) { workingMarkets[i] = { ...m, resolved: true }; continue; } // already signed elsewhere

    const resolved = resolvePlayerDecision(m, player, state);
    workingMarkets[i] = resolved;

    const winner = resolved.bids.find(b => b.status === 'accepted');
    if (!winner) continue;

    const team = state.teams.find(t => t.id === winner.teamId);
    if (!team) continue;

    // Apply the winning bid to the player. Bird Rights reset when signing with a
    // different franchise — yearsWithTeam goes to 0, and season rollover will
    // recompute hasBirdRights fresh against the new team next cycle.
    const previousTid = player.tid;
    const joinedNewTeam = previousTid !== winner.teamId;
    const newContract = {
      amount: Math.round(winner.salaryUSD / 1_000),
      exp: currentYear + winner.years - 1,
      hasPlayerOption: winner.option === 'PLAYER',
    };
    const newContractYears = Array.from({ length: winner.years }, (_, idx) => {
      const yr = currentYear + idx;
      const annual = Math.round(winner.salaryUSD * Math.pow(1.05, idx));
      return {
        season: `${yr - 1}-${String(yr).slice(-2)}`,
        guaranteed: annual,
        option: idx === winner.years - 1 && winner.option === 'PLAYER' ? 'Player'
              : idx === winner.years - 1 && winner.option === 'TEAM' ? 'Team' : '',
      };
    });
    const historicalYears = ((player as any).contractYears ?? []).filter((cy: any) => {
      const yr = parseInt(cy.season.split('-')[0], 10) + 1;
      return yr < currentYear;
    });

    const mutation: Partial<NBAPlayer> = {
      tid: winner.teamId,
      status: 'Active' as any,
      contract: newContract,
      contractYears: [...historicalYears, ...newContractYears],
      ...(joinedNewTeam ? { yearsWithTeam: 0, hasBirdRights: false } : {}),
    } as any;
    playerMutations.set(player.internalId, mutation);
    signedPlayerIds.add(player.internalId);

    const annualM = Math.round(winner.salaryUSD / 100_000) / 10;
    const totalM = Math.round(annualM * winner.years);
    const optTag = winner.option === 'PLAYER' ? ' (player option)' : winner.option === 'TEAM' ? ' (team option)' : '';
    const userWon = !!winner.isUserBid;
    historyEntries.push({
      text: `${player.name} signs with the ${team.name}: $${totalM}M/${winner.years}yr${optTag}`,
      date: state.date,
      type: 'Signing',
    } as any);

    // News item — matches the shape the existing FA round produces so the
    // transactions view renders it the same way.
    const isMax = annualM >= 30;
    const headline = userWon
      ? `${player.name} Picks Your ${team.name}`
      : isMax
        ? `${player.name} Lands Max Deal with ${team.name}`
        : `${player.name} Signs with ${team.name}`;
    const content = `${player.name} has agreed to a ${winner.years}-year, $${totalM}M deal with the ${team.name}${optTag}. ${isMax ? 'Sources: Shams Charania.' : 'Sources: Adrian Wojnarowski.'}`;
    newsItems.push({
      id: `fa-market-signing-${player.internalId}-${state.date}`,
      headline,
      content,
      date: state.date,
      type: 'transaction',
      read: false,
      isNew: true,
    });

    // Shams social post for notable signings (K2 >= 78) — mirror existing gate.
    const k2 = getK2(player);
    if (k2 >= 78) {
      const shamsContent = buildShamsTransactionPost({
        type: 'signing',
        playerName: player.name,
        teamName: team.name,
        amount: annualM,
        years: winner.years,
        hasPlayerOption: winner.option === 'PLAYER',
      });
      if (shamsContent) {
        const engagement = calculateSocialEngagement('@ShamsCharania', shamsContent, player.overallRating);
        const shamsPhoto = findShamsPhoto(player.name, team.name);
        socialPosts.push({
          id: `shams-market-sign-${player.internalId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          author: 'Shams Charania',
          handle: '@ShamsCharania',
          content: shamsContent,
          date: new Date(state.date).toISOString(),
          likes: engagement.likes,
          retweets: engagement.retweets,
          source: 'TwitterX' as const,
          isNew: true,
          playerPortraitUrl: (player as any).imgURL,
          ...(shamsPhoto ? { mediaUrl: shamsPhoto } : {}),
        });
      }
    }
  }

  // ── 2. Collect ids currently tied up in active markets (seed for de-dup) ───
  const activeMarketIds = new Set<string>();
  for (const m of workingMarkets) {
    if (!m.resolved) activeMarketIds.add(m.playerId);
  }

  // ── 3. Open new markets for notable FAs without one ────────────────────────
  const unsignedTopFAs = state.players
    .filter(p => p.tid < 0 && p.status === 'Free Agent')
    .filter(p => !activeMarketIds.has(p.internalId))
    // Don't reopen a market for someone whose market just resolved this tick.
    .filter(p => !workingMarkets.some(m => m.playerId === p.internalId && m.resolved))
    .map(p => ({ player: p, k2: getK2(p) }))
    .filter(x => x.k2 >= MARKET_K2_THRESHOLD)
    .sort((a, b) => b.k2 - a.k2)
    .slice(0, MAX_NEW_MARKETS_PER_DAY);

  for (const { player } of unsignedTopFAs) {
    const bids = generateAIBids(player, state, 3);
    if (bids.length === 0) continue;
    // Clamp every bid to the player's max contract — `generateAIBids` uses tier-
    // based pct of cap, which can inch above max for supermax-tier stars.
    const limits = getContractLimits(player, state.leagueStats as any);
    const clamped: FreeAgentBid[] = bids.map(b => ({
      ...b,
      salaryUSD: Math.min(b.salaryUSD, Math.round(limits.maxSalaryUSD)),
    }));
    const decidesOnDay = Math.max(...clamped.map(b => b.expiresDay));
    workingMarkets.push({
      playerId: player.internalId,
      playerName: player.name,
      bids: clamped,
      decidesOnDay,
      resolved: false,
    });
    activeMarketIds.add(player.internalId);
  }

  // Refresh the pending set after opening new markets (we want the most recent view).
  const pendingPlayerIds = new Set<string>();
  for (const m of workingMarkets) {
    if (!m.resolved) pendingPlayerIds.add(m.playerId);
  }

  return {
    updatedMarkets: workingMarkets,
    signedPlayerIds,
    playerMutations,
    historyEntries,
    newsItems,
    socialPosts,
    pendingPlayerIds,
  };
}
