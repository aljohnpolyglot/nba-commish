/**
 * tradeFinderEngine.ts — Unified trade offer generation.
 *
 * Used by BOTH TradeFinderView (UI) and AITradeHandler (background AI-AI trades).
 * Single source of truth for all trade logic: player matching, pick sweeteners,
 * untouchable protection, salary matching, ratio thresholds.
 */

import type { NBAPlayer, NBATeam, DraftPick, LeagueStats } from '../../types';
import {
  calcOvr2K, calcPot2K, calcPlayerTV, getPickTV, type PickValueContext,
  calcCashTV, CASH_TRADE_CAP_USD,
  isUntouchable, isYoungContenderCore, isOnTradingBlock, isSalaryLegal, isWalkingExpiring, isRecentlySignedLocked, type TeamMode,
  getTradeGapTolerance, getTradeOvershootMargin, getTradeRatioThreshold, getTradeValueFloor, type TVContext,
} from './tradeValueEngine';
import { DEFAULT_TRADABLE_PICK_SEASONS } from '../draft/DraftPickGenerator';
import { effectiveRecord, seasonLabelToYear, contractToUSD } from '../../utils/salaryUtils';
import { tradeRoleToTeamMode } from '../../utils/teamStrategy';
import { formatPickLabel } from '../draft/draftClassStrength';
import { wouldStepienViolateForTid } from './stepienRule';
import { generateCounterOffers } from './tradeFinderCore';
import { isTradeExcludedPlayer, roleToMode, type TradeOfferItem } from './tradeFinderShared';

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
  tvContext?: TVContext;
  classStrengthByYear?: Map<number, number>;
  lotterySlotByTid?: Map<number, number>;
  stepienEnabled?: boolean;
  tradablePickWindow?: number;
  isPostDeadlinePreFA?: boolean;
  recentlySignedLockMs?: { currentDate: string; leagueStats?: LeagueStats };
  allowPbaRoster?: boolean;
}): { buyerGives: TradeOfferItem[]; sellerGives: TradeOfferItem[] } | null {
  const { buyerTid, sellerTid, players, teams, draftPicks, currentYear, minTradableSeason, powerRanks, teamOutlooks, tvContext, classStrengthByYear, lotterySlotByTid, stepienEnabled, tradablePickWindow, isPostDeadlinePreFA, recentlySignedLockMs, allowPbaRoster = false } = input;

  const sellerOutlook = teamOutlooks.get(sellerTid) ?? { role: 'neutral' };
  const buyerOutlook = teamOutlooks.get(buyerTid) ?? { role: 'neutral' };
  const sellerMode = roleToMode(sellerOutlook.role);
  const buyerMode = roleToMode(buyerOutlook.role);

  // Find a target player on the seller's team (non-untouchable, best TV).
  // Walking expirings and recently-signed players are excluded from proposals.
  const sellerRoster = players
    .filter(p => p.tid === sellerTid && !isTradeExcludedPlayer(p, allowPbaRoster)
              && !isWalkingExpiring(p, currentYear, isPostDeadlinePreFA ?? false)
              && !(recentlySignedLockMs && isRecentlySignedLocked(p, recentlySignedLockMs.currentDate, recentlySignedLockMs.leagueStats)))
    .sort((a, b) => calcPlayerTV(b, sellerMode, currentYear, tvContext) - calcPlayerTV(a, sellerMode, currentYear, tvContext));

  const target = sellerRoster.find(p => !isUntouchable(p, sellerMode, currentYear, tvContext?.mvpRank));
  if (!target) return null;

  const targetTV = calcPlayerTV(target, sellerMode, currentYear, tvContext);
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
    tvContext,
    classStrengthByYear,
    lotterySlotByTid,
    stepienEnabled,
    tradablePickWindow,
    isPostDeadlinePreFA,
    allowPbaRoster,
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

// Pick-only proposal: cash-and-pick exchanges with no players on either side.
export function generatePickOnlyProposal(input: {
  buyerTid: number;
  sellerTid: number;
  teams: NBATeam[];
  draftPicks: DraftPick[];
  currentYear: number;
  minTradableSeason: number;
  powerRanks: Map<number, number>;
  teamOutlooks: Map<number, { role: string }>;
  classStrengthByYear?: Map<number, number>;
  lotterySlotByTid?: Map<number, number>;
  buyerCashAvailableUSD?: number;
  sellerCashAvailableUSD?: number;
  stepienEnabled?: boolean;
  tradablePickWindow?: number;
}): {
  buyerGives: TradeOfferItem[];
  sellerGives: TradeOfferItem[];
  cashFromBuyerUSD?: number;
  cashFromSellerUSD?: number;
} | null {
  const {
    buyerTid, sellerTid, teams, draftPicks, currentYear, minTradableSeason,
    powerRanks, teamOutlooks, classStrengthByYear, lotterySlotByTid,
    buyerCashAvailableUSD = 0,
    stepienEnabled = false, tradablePickWindow = DEFAULT_TRADABLE_PICK_SEASONS,
  } = input;
  const minLivePickSeason = Math.max(minTradableSeason, currentYear);
  const liveDraftPicks = draftPicks.filter(pk => pk.season >= currentYear);

  // Stepien-aware: skip 1st-round picks whose departure would leave the donor
  // with no 1st in two consecutive future drafts. Causes Variant A to fall
  // through (returning null) so the caller can try a different proposal type
  // instead of generating a basket the post-validator will reject.
  const stepienBlocksOne = (tid: number, candidate: DraftPick): boolean => {
    if (!stepienEnabled) return false;
    if (candidate.round !== 1) return false;
    return wouldStepienViolateForTid(liveDraftPicks, currentYear, tradablePickWindow, tid, [candidate]);
  };

  const buyerOutlookRole = teamOutlooks.get(buyerTid)?.role ?? 'neutral';
  const sellerOutlookRole = teamOutlooks.get(sellerTid)?.role ?? 'neutral';
  const buyerMode = roleToMode(buyerOutlookRole);
  const sellerMode = roleToMode(sellerOutlookRole);

  const swapPickCtx: PickValueContext = {
    currentYear,
    totalTeams: teams.length,
    powerRanks,
    classStrengthByYear,
    lotterySlotByTid,
  };
  const tvOf = (pk: DraftPick): number => getPickTV(pk, swapPickCtx);

  const sellerPicks = liveDraftPicks
    .filter(p => p.tid === sellerTid && p.season >= minLivePickSeason)
    .sort((a, b) => a.season - b.season);
  const buyerPicks = liveDraftPicks
    .filter(p => p.tid === buyerTid && p.season >= minLivePickSeason)
    .sort((a, b) => a.season - b.season);
  if (sellerPicks.length === 0 || buyerPicks.length === 0) return null;

  // Variant A — pick-delay swap. Contender (buyer) wants seller's earlier 1st;
  // sends a LATER 1st + small cash sweetener. Triggers when buyer is contend-tier
  // and seller is rebuild/develop-tier with a near-term R1 to part with.
  const buyerIsContend = buyerMode === 'contend';
  const sellerIsRebuild = sellerMode === 'rebuild' || sellerMode === 'presti';

  if (buyerIsContend && sellerIsRebuild) {
    const sellerR1 = sellerPicks.find(p => p.round === 1 && p.season - currentYear <= 2 && !stepienBlocksOne(sellerTid, p));
    const buyerLaterR1 = [...buyerPicks].reverse().find(p => p.round === 1 && p.season > (sellerR1?.season ?? currentYear) && !stepienBlocksOne(buyerTid, p));
    if (sellerR1 && buyerLaterR1) {
      const sellerTV = tvOf(sellerR1);
      const buyerTV = tvOf(buyerLaterR1);
      const gap = sellerTV - buyerTV;
      // Buyer can throw cash up to the buyer's available cap to close the gap.
      const cashTVBudget = Math.min(buyerCashAvailableUSD, CASH_TRADE_CAP_USD);
      const cashTVAvail = calcCashTV(cashTVBudget);
      if (gap > 0 && gap <= cashTVAvail + 6) {
        const cashUSD = Math.min(buyerCashAvailableUSD, Math.round(Math.max(0, gap) * 1_000_000 / 1.5));
        return {
          buyerGives: [{
            id: String(buyerLaterR1.dpid), type: 'pick',
            label: formatPickLabel(buyerLaterR1, currentYear, lotterySlotByTid, false),
            val: buyerTV, pick: buyerLaterR1,
          }],
          sellerGives: [{
            id: String(sellerR1.dpid), type: 'pick',
            label: formatPickLabel(sellerR1, currentYear, lotterySlotByTid, false),
            val: sellerTV, pick: sellerR1,
          }],
          cashFromBuyerUSD: cashUSD > 0 ? cashUSD : undefined,
        };
      }
    }
  }

  // Variant B — 2nd-round dump for cash. Contender ships a 2nd to a rebuilder for absorption.
  if (sellerIsRebuild) {
    // Note: caller picks roles; here "buyer" is the team trying to dump.
    const dumperPicks = buyerPicks.filter(p => p.round === 2);
    const dumper2nd = dumperPicks[0];
    if (dumper2nd) {
      const dumpTV = tvOf(dumper2nd);
      // Rebuilder demands ~$1-3M to absorb a worthless 2nd
      const askUSD = Math.min(buyerCashAvailableUSD, Math.max(1_000_000, Math.round(dumpTV * 1_000_000 / 1.5)));
      if (askUSD >= 500_000 && buyerCashAvailableUSD >= askUSD) {
        return {
          buyerGives: [{
            id: String(dumper2nd.dpid), type: 'pick',
            label: formatPickLabel(dumper2nd, currentYear, lotterySlotByTid, false),
            val: dumpTV, pick: dumper2nd,
          }],
          sellerGives: [],
          cashFromBuyerUSD: askUSD,
        };
      }
    }
  }

  return null;
}
