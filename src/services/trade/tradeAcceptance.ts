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
import { validateCBATradeRules } from '../../utils/cbaTradeRules';
import { isInPostDeadlinePreFAWindow } from '../../utils/dateUtils';
import { roleToMode } from './tradeFinderShared';

export interface EvaluateAcceptanceInput {
  /** Team initiating the trade (user in GM mode). */
  fromTid: number;
  /** Team evaluating acceptance (AI in GM mode). */
  toTid: number;
  /** What fromTid is sending. */
  fromItems: Array<{ type: 'player' | 'pick' | 'absorb'; player?: NBAPlayer; pick?: DraftPick }>;
  /** What toTid is sending. */
  toItems: Array<{ type: 'player' | 'pick' | 'absorb'; player?: NBAPlayer; pick?: DraftPick }>;
  teams: NBATeam[];
  currentYear: number;
  powerRanks: Map<number, number>;
  teamOutlooks: Map<number, { role: string }>;
  tvContext?: TVContext;
  /** GM-mode 0-100 (50 = default "+10 fleece"). */
  tradeDifficulty?: number;
  /** Optional dynamic pick-value inputs (see draftClassStrength.ts). */
  classStrengthByYear?: Map<number, number>;
  lotterySlotByTid?: Map<number, number>;
  /** AI side's current roster — used to project post-trade trim dead money. */
  toTeamRoster?: NBAPlayer[];
  /** Roster cap for trim projection (default 15). */
  maxRoster?: number;
  leagueStats?: LeagueStats;
  currentDate?: string;
  allPlayers?: NBAPlayer[];
  fromCashUSD?: number;
  toCashUSD?: number;
}

export interface AcceptanceResult {
  accepted: boolean;
  /** TV of fromItems in fromTid's mode — what user is sending. */
  offerValue: number;
  /** TV of toItems in toTid's mode — what AI is sending. */
  returnVal: number;
  /** offerValue − difficultyBias; what AI expects to give. */
  expectedReturn: number;
  /** Positive if AI considers itself overpaying (must add more from user side). */
  shortfall: number;
  /** Engine ratio: max/min of expectedReturn vs returnVal. */
  ratio: number;
  ratioThreshold: number;
  /** Flavor text for the UI response card. */
  reason: string;
}

/**
 * Contract toxicity in TV units — how much the receiver demands as compensation
 * for absorbing this contract beyond fair-market value. Drives the "smart enough
 * to ask for more picks on bad contracts" behavior.
 *
 * Fair annual = piecewise USD/M by K2 OVR. Overpay × years left × 0.5 → TV units.
 * Example: $50M/3yr on a 78 OVR (fair ≈ $24M) → (50−24)×3×0.5 ≈ 39 TV demanded.
 */
function contractToxicity(player: NBAPlayer, currentYear: number): number {
  const c = player.contract;
  if (!c?.amount || !c.exp) return 0;
  const annualM = c.amount / 1000;
  const yrsLeft = Math.max(1, c.exp - currentYear + 1);
  const k2 = calcOvr2K(player);
  let fairM: number;
  if (k2 >= 90) fairM = 50;
  else if (k2 >= 85) fairM = 40;
  else if (k2 >= 80) fairM = 30;
  else if (k2 >= 75) fairM = 22;
  else if (k2 >= 70) fairM = 12;
  else if (k2 >= 65) fairM = 6;
  else if (k2 >= 60) fairM = 3;
  else fairM = 1.5;
  const overpayPerYr = Math.max(0, annualM - fairM);
  return overpayPerYr * yrsLeft * 0.5;
}

/** Projects USD dead-money the team would eat after post-trade roster trim (overflow above maxRoster). */
export function projectTrimDeadMoneyUSD(
  currentRoster: NBAPlayer[],
  incomingPlayers: NBAPlayer[],
  outgoingPlayerIds: Set<string>,
  currentYear: number,
  maxRoster = 15,
): number {
  // Project post-trade roster (existing minus outgoing plus incoming, std only).
  const postTrade = [
    ...currentRoster.filter(p => !outgoingPlayerIds.has(p.internalId) && !(p as any).twoWay),
    ...incomingPlayers.filter(p => !(p as any).twoWay),
  ];
  const overflow = postTrade.length - maxRoster;
  if (overflow <= 0) return 0;

  // Project the cut order (lowest-OVR among guaranteed) and sum their remaining guaranteed USD.
  const cutCandidates = [...postTrade]
    .filter(p => !(p as any).twoWay && !(p as any).nonGuaranteed)
    .sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0));

  let deadUSD = 0;
  for (let i = 0; i < overflow && i < cutCandidates.length; i++) {
    const p = cutCandidates[i];
    const cy = (p as any).contractYears as Array<{ season: string; guaranteed: number; option?: string }> | undefined;
    if (Array.isArray(cy) && cy.length > 0) {
      deadUSD += cy
        .filter(y =>
          seasonLabelToYear(y.season) >= currentYear && y.option !== 'team' && y.option !== 'player'
        )
        .reduce((s, y) => s + (y.guaranteed || 0), 0);
    } else {
      const exp = (p.contract?.exp ?? currentYear);
      const amountUSD = contractToUSD(p.contract?.amount || 0);
      const yrs = Math.max(1, exp - currentYear + 1);
      deadUSD += amountUSD * yrs;
    }
  }
  return deadUSD;
}

function tvOfItem(
  item: { type: string; player?: NBAPlayer; pick?: DraftPick },
  receiverMode: TeamMode,
  teams: NBATeam[],
  currentYear: number,
  powerRanks: Map<number, number>,
  tvContext?: TVContext,
  classStrengthByYear?: Map<number, number>,
  lotterySlotByTid?: Map<number, number>,
): number {
  if (item.type === 'player' && item.player) {
    return calcPlayerTV(item.player, receiverMode, currentYear, tvContext);
  }
  if (item.type === 'pick' && item.pick) {
    return getPickTV(item.pick, {
      currentYear, totalTeams: teams.length, powerRanks, classStrengthByYear, lotterySlotByTid,
    });
  }
  return 0;
}

export function evaluateTradeAcceptance(input: EvaluateAcceptanceInput): AcceptanceResult {
  const {
    fromTid, toTid, fromItems, toItems, teams, currentYear,
    powerRanks, teamOutlooks, tvContext, tradeDifficulty,
    classStrengthByYear, lotterySlotByTid, toTeamRoster, maxRoster,
    leagueStats, currentDate, allPlayers, fromCashUSD = 0, toCashUSD = 0,
  } = input;

  const fromMode = roleToMode(teamOutlooks.get(fromTid)?.role ?? 'neutral');
  const toMode = roleToMode(teamOutlooks.get(toTid)?.role ?? 'neutral');

  // Match engine asymmetry: each side's outgoing assets valued in THEIR mode —
  // a contender values their pick the way a contender would, etc.
  const offerValue = fromItems.reduce((s, i) => s + tvOfItem(i, fromMode, teams, currentYear, powerRanks, tvContext, classStrengthByYear, lotterySlotByTid), 0);
  const returnVal = toItems.reduce((s, i) => s + tvOfItem(i, toMode, teams, currentYear, powerRanks, tvContext, classStrengthByYear, lotterySlotByTid), 0);

  if (currentDate && isInPostDeadlinePreFAWindow(currentDate, currentYear, leagueStats as any)) {
    const walkingPlayers = [...fromItems, ...toItems]
      .filter((i): i is { type: 'player'; player: NBAPlayer } => i.type === 'player' && !!i.player)
      .map(i => i.player)
      .filter(p => isWalkingExpiring(p, currentYear, true));
    if (walkingPlayers.length > 0) {
      const names = walkingPlayers.slice(0, 3).map(p => p.name).join(', ');
      const suffix = walkingPlayers.length > 3 ? ` and ${walkingPlayers.length - 3} more` : '';
      const subject = walkingPlayers.length === 1 ? `${names}${suffix} is` : `${names}${suffix} are`;
      return {
        accepted: false,
        offerValue,
        returnVal,
        expectedReturn: offerValue,
        shortfall: Math.max(0, returnVal - offerValue),
        ratio: 999,
        ratioThreshold: 0,
        reason: `${subject} on an expiring contract that reaches free agency before an acquiring team can use him.`,
      };
    }
  }

  if (leagueStats && currentDate && allPlayers) {
    const cba = validateCBATradeRules({
      teamAId: fromTid,
      teamBId: toTid,
      teamAPlayers: fromItems.filter((i): i is { type: 'player'; player: NBAPlayer } => i.type === 'player' && !!i.player).map(i => i.player),
      teamBPlayers: toItems.filter((i): i is { type: 'player'; player: NBAPlayer } => i.type === 'player' && !!i.player).map(i => i.player),
      teamAPicks: fromItems.filter((i): i is { type: 'pick'; pick: DraftPick } => i.type === 'pick' && !!i.pick).map(i => i.pick),
      teamBPicks: toItems.filter((i): i is { type: 'pick'; pick: DraftPick } => i.type === 'pick' && !!i.pick).map(i => i.pick),
      teamACashUSD: fromCashUSD,
      teamBCashUSD: toCashUSD,
      teams,
      players: allPlayers,
      leagueStats,
      currentDate,
      currentYear,
    });
    if (!cba.ok) {
      return {
        accepted: false,
        offerValue,
        returnVal,
        expectedReturn: offerValue,
        shortfall: Math.max(0, returnVal - offerValue),
        ratio: 999,
        ratioThreshold: 0,
        reason: cba.reason ?? 'Trade violates current CBA settings.',
      };
    }
  }

  // Same asymmetric difficulty curve as generateCounterOffers.
  const difficultyBias = (() => {
    if (tradeDifficulty === undefined) return 0;
    const d = Math.max(0, Math.min(100, tradeDifficulty));
    return d <= 50 ? (d / 50) * 70 - 60 : 10 + (d - 50);
  })();

  // Contract toxicity: receiver demands picks as compensation for absorbing
  // overpaid deals. fromAbsorb = liability AI is taking on (lowers expectedReturn);
  // toAbsorb = liability user takes on (raises expectedReturn — AI willing to give
  // less since they're already off-loading a bad contract).
  const fromAbsorb = fromItems.reduce((s, i) =>
    i.type === 'player' && i.player ? s + contractToxicity(i.player, currentYear) : s, 0);
  const toAbsorb = toItems.reduce((s, i) =>
    i.type === 'player' && i.player ? s + contractToxicity(i.player, currentYear) : s, 0);

  // Post-trade trim cost: if the AI absorbs more players than it sends out and
  // would end up over the roster cap, the autoTrim guillotine books dead money
  // on the cheapest multi-year guaranteed contracts. Real GMs price this in.
  // Each $1M projected dead ≈ 0.6 TV (≈ contractToxicity scale for the same dollar).
  let trimDeadTV = 0;
  if (toTeamRoster) {
    const incomingPlayers = fromItems
      .filter((i): i is { type: 'player'; player: NBAPlayer } => i.type === 'player' && !!i.player)
      .map(i => i.player);
    const outgoingIds = new Set(
      toItems.filter(i => i.type === 'player' && i.player).map(i => i.player!.internalId)
    );
    const trimDeadUSD = projectTrimDeadMoneyUSD(toTeamRoster, incomingPlayers, outgoingIds, currentYear, maxRoster ?? 15);
    trimDeadTV = (trimDeadUSD / 1_000_000) * 0.6;
  }

  // expectedReturn can go negative when toxic contracts + trim cost dominate —
  // that's the "you need to attach more picks" demand.
  const expectedReturn = (offerValue - difficultyBias) - fromAbsorb - trimDeadTV + toAbsorb;
  const totalVal = Math.max(Math.max(getTradeValueFloor(offerValue), expectedReturn), returnVal);
  // Mirrors generateCounterOffers: relaxed for franchise-tier targets where
  // picks can't close the TV gap perfectly.
  const ratioThreshold = getTradeRatioThreshold(totalVal);

  // Asymmetric gate: AI only refuses when THEY would be overpaying relative to
  // expectedReturn (which already accounts for toxic-contract absorption demand).
  // Cap legality + roster space are enforced upstream by salaryViolation.
  const aiOverpaying = returnVal > expectedReturn;
  const ratio = aiOverpaying ? returnVal / Math.max(1, expectedReturn) : 1;
  const accepted = !aiOverpaying || ratio <= ratioThreshold;
  // Shortfall = how much MORE value user must add to clear AI's bar.
  const shortfall = Math.max(0, returnVal - expectedReturn);
  const netToAI = offerValue - returnVal - fromAbsorb + toAbsorb; // post-toxicity

  let reason: string;
  if (accepted) {
    reason = netToAI > 15
      ? 'This is a great deal for us. Done!'
      : 'Fair trade. We can work with this.';
  } else if (trimDeadTV > 15) {
    // Roster overflow — taking these throw-ins would force expensive waives.
    reason = "Too many bodies coming back — we'd be eating dead money to fit them. Cut a player or send a pick to cover it.";
  } else if (fromAbsorb > 20 && returnVal === 0) {
    // Pure dump of a toxic contract — AI wants compensation, not just the body.
    reason = "That contract's a tough pill. Sweeten it with another pick or two and we'll talk.";
  } else if (fromAbsorb > 20) {
    // Toxic contract included but with some return — still need more.
    reason = "Bad money on that deal — we'd need more draft compensation to take it on.";
  } else {
    reason = shortfall > getTradeOvershootMargin(Math.max(offerValue, returnVal), 30, 8)
      ? "No way. This isn't even close to fair value for what we're giving up."
      : "We'd need a bit more to make this work.";
  }

  return { accepted, offerValue, returnVal, expectedReturn, shortfall, ratio, ratioThreshold, reason };
}
