/**
 * tradeFinderEngine.ts — Unified trade offer generation.
 *
 * Used by BOTH TradeFinderView (UI) and AITradeHandler (background AI-AI trades).
 * Single source of truth for all trade logic: player matching, pick sweeteners,
 * untouchable protection, salary matching, ratio thresholds.
 */

import type { NBAPlayer, NBATeam, DraftPick } from '../../types';
import {
  calcOvr2K, calcPot2K, calcPlayerTV, calcPickTV,
  isUntouchable, type TeamMode,
} from './tradeValueEngine';

const EXTERNAL = new Set(['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'Draft Prospect', 'Prospect']);

// ── Types ────────────────────────────────────────────────────────────────────

export interface TradeOfferItem {
  id: string;
  type: 'player' | 'pick';
  label: string;
  val: number;
  player?: NBAPlayer;
  pick?: DraftPick;
  ovr?: number;
  pot?: number;
}

export interface TradeOffer {
  tid: number;
  items: TradeOfferItem[];
  totalVal: number;
}

export interface FindOffersInput {
  /** The team offering assets */
  fromTid: number;
  /** Total trade value of assets being offered */
  offerValue: number;
  /** IDs of players/picks already in the offer basket (don't reuse) */
  usedIds: Set<string>;
  /** All players in the game */
  players: NBAPlayer[];
  /** All teams */
  teams: NBATeam[];
  /** All draft picks */
  draftPicks: DraftPick[];
  /** Current season year */
  currentYear: number;
  /** Minimum tradeable draft season (filters completed drafts) */
  minTradableSeason: number;
  /** Power rank per team (tid → rank, 1=best) */
  powerRanks: Map<number, number>;
  /** Trade outlook per team (tid → { role }) */
  teamOutlooks: Map<number, { role: string }>;
  /** Optional: only generate offers from specific teams */
  targetTids?: number[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function roleToMode(role: string): TeamMode {
  if (role === 'heavy_buyer' || role === 'buyer') return 'contend';
  if (role === 'rebuilding') return 'presti';
  return 'rebuild';
}

// ── Core Engine ──────────────────────────────────────────────────────────────

/**
 * Generate counteroffers from other teams for a given basket value.
 * Returns sorted array of trade offers (best value first).
 */
export function generateCounterOffers(input: FindOffersInput): TradeOffer[] {
  const {
    fromTid, offerValue, usedIds: basketIds, players, teams, draftPicks,
    currentYear, minTradableSeason, powerRanks, teamOutlooks, targetTids,
  } = input;

  const offers: TradeOffer[] = [];
  const candidateTeams = targetTids
    ? teams.filter(t => targetTids.includes(t.id))
    : teams.filter(t => t.id !== fromTid);

  for (const team of candidateTeams) {
    if (team.id === fromTid) continue;

    const outlook = teamOutlooks.get(team.id) ?? { role: 'neutral' };
    const theirMode = roleToMode(outlook.role);
    const theirRank = powerRanks.get(team.id) ?? Math.ceil(teams.length / 2);

    const usedIds = new Set(basketIds);
    const returnItems: TradeOfferItem[] = [];
    let gap = offerValue;

    // Get their roster sorted by OVR, excluding external/prospects
    const theirRoster = players
      .filter(p => p.tid === team.id && !EXTERNAL.has(p.status ?? '') && p.tid !== -2)
      .sort((a, b) => b.overallRating - a.overallRating);

    // ── Player matching (up to 5 players — real NBA trades can be big) ──
    const MAX_PLAYERS = 5;
    for (let round = 0; round < MAX_PLAYERS && gap > (round === 0 ? 0 : 8); round++) {
      const maxGapMult = round === 0 ? 1.8 : round === 1 ? 1.5 : 1.3;
      const candidate = theirRoster
        .filter(p => !usedIds.has(p.internalId) && !isUntouchable(p, theirMode, currentYear))
        .map(p => ({ ...p, tv: calcPlayerTV(p, theirMode, currentYear) }))
        .filter(p => p.tv > 0 && p.tv <= gap * maxGapMult)
        .sort((a, b) => Math.abs(a.tv - gap) - Math.abs(b.tv - gap))[0];

      if (!candidate) break;

      returnItems.push({
        id: candidate.internalId,
        type: 'player',
        label: candidate.name,
        val: candidate.tv,
        player: candidate,
        ovr: calcOvr2K(candidate),
        pot: calcPot2K(candidate, currentYear),
      });
      usedIds.add(candidate.internalId);
      gap -= candidate.tv;
    }

    // ── Pick sweeteners (up to 4 picks) ──────────────────────────────────
    const theirPicks = draftPicks
      .filter(pk => pk.tid === team.id && pk.season >= minTradableSeason && !usedIds.has(String(pk.dpid)))
      .sort((a, b) => a.season - b.season);

    let picksAdded = 0;
    let safety = 0;
    while (gap > 2 && picksAdded < 4 && safety++ < 8 && theirPicks.length > 0) {
      const pk = theirPicks.shift()!;
      const pv = calcPickTV(pk.round, theirRank, teams.length, Math.max(1, pk.season - currentYear));
      if (pv > gap + 14) break;
      returnItems.push({
        id: String(pk.dpid),
        type: 'pick',
        label: `${pk.season} ${pk.round === 1 ? '1st' : '2nd'} Round`,
        val: pv,
        pick: pk,
      });
      usedIds.add(String(pk.dpid));
      gap -= pv;
      picksAdded++;
    }

    if (returnItems.length === 0) continue;

    // ── Ratio threshold — reject lopsided deals ──────────────────────────
    const returnVal = returnItems.reduce((s, i) => s + i.val, 0);
    const ratio = Math.max(offerValue, returnVal) / Math.max(1, Math.min(offerValue, returnVal));
    const totalVal = Math.max(offerValue, returnVal);
    const ratioThreshold = totalVal >= 200 ? 1.15 : totalVal >= 100 ? 1.35 : 1.45;
    if (ratio > ratioThreshold) continue;

    offers.push({ tid: team.id, items: returnItems, totalVal: returnVal });
  }

  return offers.sort((a, b) => b.totalVal - a.totalVal);
}

/**
 * Generate a single AI-initiated trade proposal.
 * Picks a seller team, finds a target player, builds a counteroffer.
 * Returns null if no viable trade found.
 */
export function generateAITradeProposal(input: {
  buyerTid: number;
  sellerTid: number;
  players: NBAPlayer[];
  teams: NBATeam[];
  draftPicks: DraftPick[];
  currentYear: number;
  minTradableSeason: number;
  powerRanks: Map<number, number>;
  teamOutlooks: Map<number, { role: string }>;
}): { buyerGives: TradeOfferItem[]; sellerGives: TradeOfferItem[] } | null {
  const { buyerTid, sellerTid, players, teams, draftPicks, currentYear, minTradableSeason, powerRanks, teamOutlooks } = input;

  const sellerOutlook = teamOutlooks.get(sellerTid) ?? { role: 'neutral' };
  const buyerOutlook = teamOutlooks.get(buyerTid) ?? { role: 'neutral' };
  const sellerMode = roleToMode(sellerOutlook.role);
  const buyerMode = roleToMode(buyerOutlook.role);

  // Find a target player on the seller's team (non-untouchable, best TV)
  const sellerRoster = players
    .filter(p => p.tid === sellerTid && !EXTERNAL.has(p.status ?? ''))
    .sort((a, b) => calcPlayerTV(b, sellerMode, currentYear) - calcPlayerTV(a, sellerMode, currentYear));

  const target = sellerRoster.find(p => !isUntouchable(p, sellerMode, currentYear));
  if (!target) return null;

  const targetTV = calcPlayerTV(target, sellerMode, currentYear);
  if (targetTV <= 0) return null;

  // Generate what the buyer needs to offer to match
  const counterOffers = generateCounterOffers({
    fromTid: sellerTid,
    offerValue: targetTV,
    usedIds: new Set([target.internalId]),
    players,
    teams,
    draftPicks,
    currentYear,
    minTradableSeason,
    powerRanks,
    teamOutlooks,
    targetTids: [buyerTid],
  });

  if (counterOffers.length === 0) return null;

  const best = counterOffers[0];
  return {
    buyerGives: best.items,
    sellerGives: [{
      id: target.internalId,
      type: 'player',
      label: target.name,
      val: targetTV,
      player: target,
      ovr: calcOvr2K(target),
      pot: calcPot2K(target, currentYear),
    }],
  };
}
