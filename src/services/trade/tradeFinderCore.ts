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
import { effectiveRecord, seasonLabelToYear, contractToUSD, getCapThresholds, getTeamCapProfile } from '../../utils/salaryUtils';
import { tradeRoleToTeamMode } from '../../utils/teamStrategy';
import { formatPickLabel } from '../draft/draftClassStrength';
import { wouldStepienViolateForTid } from './stepienRule';
import { validateCBATradeRules } from '../../utils/cbaTradeRules';
import { isFranchiseLifer } from '../../utils/playerTenure';
import { isInPostDeadlinePreFAWindow } from '../../utils/dateUtils';
import { projectTrimDeadMoneyUSD } from './tradeAcceptance';
import { isTradeExcludedStatus, type FindOffersInput, roleToMode, type TradeOffer, type TradeOfferItem } from './tradeFinderShared';

// ── Core Engine ──────────────────────────────────────────────────────────────

/**
 * Generate counteroffers from other teams for a given basket value.
 * Returns sorted array of trade offers (best value first).
 */
export function generateCounterOffers(input: FindOffersInput): TradeOffer[] {
  const {
    fromTid, offerValue, usedIds: basketIds, players, teams, draftPicks,
    currentYear, minTradableSeason, powerRanks, teamOutlooks, targetTids, tvContext, capSpaces,
    tradeDifficulty, bypassUntouchablesForTid, allowLifers,
    allowPbaRoster = false,
    classStrengthByYear, lotterySlotByTid,
    stepienEnabled = false, tradablePickWindow = DEFAULT_TRADABLE_PICK_SEASONS,
    isPostDeadlinePreFA = false,
    recentlySignedLockMs,
  } = input;
  const minLivePickSeason = Math.max(minTradableSeason, currentYear);
  const liveDraftPicks = draftPicks.filter(pk => pk.season >= currentYear);

  // Premium inbound gate: high-end assets (K2 > 84) should only be offered
  // when the initiating basket already contains a premium return anchor
  // (POT > 84 player OR a 1st-round pick).
  const premiumIncoming = (() => {
    const offeredPlayers = players.filter(p => basketIds.has(p.internalId));
    const hasPremiumPotPlayer = offeredPlayers.some(p => calcPot2K(p, currentYear) > 84);
    if (hasPremiumPotPlayer) return true;
    const offeredPickIds = new Set([...basketIds].map(id => Number(id)).filter(n => Number.isFinite(n)));
    const hasFirstRoundPick = liveDraftPicks.some(pk => offeredPickIds.has(pk.dpid) && pk.round === 1);
    return hasFirstRoundPick;
  })();

  // Post-deadline pre-FA: expiring contracts are walking → filter from every
  // candidate pool so they don't end up in either side's basket.
  const isWalking = (p: NBAPlayer) => isWalkingExpiring(p, currentYear, isPostDeadlinePreFA);
  const isLocked = recentlySignedLockMs
    ? (p: NBAPlayer) => isRecentlySignedLocked(p, recentlySignedLockMs.currentDate, recentlySignedLockMs.leagueStats)
    : (_p: NBAPlayer) => false;

  // Stepien-aware filter: would shipping `candidate` leave `tid` without a 1st
  // in two straight future drafts, given the picks ALREADY chosen from this team?
  // 2nds and disabled rule short-circuit to "ok".
  const stepienBlocks = (tid: number, candidate: DraftPick, alreadyLeaving: DraftPick[]): boolean => {
    if (!stepienEnabled) return false;
    if (candidate.round !== 1) return false;
    return wouldStepienViolateForTid(liveDraftPicks, currentYear, tradablePickWindow, tid, [...alreadyLeaving, candidate]);
  };

  const pickCtx: PickValueContext = {
    currentYear,
    totalTeams: teams.length,
    powerRanks,
    classStrengthByYear,
    lotterySlotByTid,
  };

  // Difficulty → TV bias on the gap target. Asymmetric so 50 maps to the
  // current "+10 fleece" default the user is already tuned to.
  // d=0 → -60 (AI favors user by 60 TV), d=50 → +10 (current), d=100 → +60 (AI demands +60)
  const difficultyBias = (() => {
    if (tradeDifficulty === undefined) return 0;
    const d = Math.max(0, Math.min(100, tradeDifficulty));
    return d <= 50 ? (d / 50) * 70 - 60 : 10 + (d - 50);
  })();

  // Loyalty-lifer block — ONLY applies in reverse mode (targetTids set, meaning
  // user is asking an AI team to give up one of their lifers). If the Warriors
  // GM wants to trade Curry in NORMAL mode, that's their choice — don't block. //lol
  if (targetTids !== undefined && !allowLifers) {
    for (const p of players) {
      if (!basketIds.has(p.internalId)) continue;
      if (isFranchiseLifer(p)) return [];
    }
  }

  const offers: TradeOffer[] = [];
  const candidateTeams = targetTids
    ? teams.filter(t => targetTids.includes(t.id))
    : teams.filter(t => t.id !== fromTid);

  // Outgoing salary (thousands) from the offering basket — used for NBA 125% salary match.
  const outgoingSalary = players
    .filter(p => basketIds.has(p.internalId))
    .reduce((s, p) => s + (p.contract?.amount ?? 0), 0);

  for (const team of candidateTeams) {
    if (team.id === fromTid) continue;

    const outlook = teamOutlooks.get(team.id) ?? { role: 'neutral' };
    const theirMode = roleToMode(outlook.role);
    const theirRank = powerRanks.get(team.id) ?? Math.ceil(teams.length / 2);

    const usedIds = new Set(basketIds);
    const returnItems: TradeOfferItem[] = [];
    // difficultyBias shrinks the target gap when AI is tough (they return less for same offer)
    // and expands it when AI is generous (they return more). Floor at 10 so AI always offers something.
    // expectedReturn is used in the final ratio check so the threshold respects difficulty
    // (previously ratio compared against offerValue, causing false rejections on low-TV targets).
    const expectedReturn = Math.max(getTradeValueFloor(offerValue), offerValue - difficultyBias);
    const gapTolerance = getTradeGapTolerance(expectedReturn);
    let gap = expectedReturn;

    // Get their roster sorted by OVR, excluding external/prospects.
    // Walking expirings and recently-signed players are dropped from candidate pools.
    const theirRoster = players
      .filter(p => p.tid === team.id && !isTradeExcludedStatus(p.status, allowPbaRoster) && p.tid !== -2 && !isWalking(p) && !isLocked(p))
      .filter(p => premiumIncoming || calcOvr2K(p) <= 84)
      .sort((a, b) => b.overallRating - a.overallRating);

    // Picks-only basket — skip player matching entirely. Returns are pick-piles
    // from the AI's stash plus optional cash sweetener if mode mismatch (contender
    // pays cash to a rebuilder for absorbing late picks).
    const basketIsPicksOnly = outgoingSalary === 0
      && [...basketIds].every(id => !players.some(p => p.internalId === id));
    if (basketIsPicksOnly) {
      // Variant 1 — pick-for-pick swap from their stash.
      const pickSwapItems: TradeOfferItem[] = [];
      const pickSwapUsed = new Set(basketIds);
      let pickSwapGap = expectedReturn;
      const theirPicksOnly = liveDraftPicks
        .filter(pk => pk.tid === team.id && pk.season >= minLivePickSeason && !pickSwapUsed.has(String(pk.dpid)))
        .sort((a, b) => a.season - b.season);
      let safetyP = 0;
      const swapPicksFromTeam: DraftPick[] = [];
      while (pickSwapGap > gapTolerance && safetyP++ < 8 && theirPicksOnly.length > 0) {
        const pk = theirPicksOnly.shift()!;
        if (stepienBlocks(team.id, pk, swapPicksFromTeam)) continue;
        const pv = getPickTV(pk, pickCtx);
        if (pv > pickSwapGap + getTradeOvershootMargin(expectedReturn, 30, 6)) break;
        swapPicksFromTeam.push(pk);
        pickSwapItems.push({
          id: String(pk.dpid), type: 'pick',
          label: formatPickLabel(pk, currentYear, lotterySlotByTid, false),
          val: pv, pick: pk,
        });
        pickSwapUsed.add(String(pk.dpid));
        pickSwapGap -= pv;
      }
      if (pickSwapItems.length > 0) {
        const swapVal = pickSwapItems.reduce((s, i) => s + i.val, 0);
        const ratio = Math.max(expectedReturn, swapVal) / Math.max(1, Math.min(expectedReturn, swapVal));
        if (ratio <= 1.45) {
          offers.push({ tid: team.id, items: pickSwapItems, totalVal: swapVal, variant: 'match' });
        }
      }
      // Fall through to player matching: when offering picks, AI may also
      // counter with a player (rebuilders selling for picks, contenders
      // willing to part with a vet for future capital). Without this, every
      // counter to a picks-only basket comes back as picks too — exactly the
      // "no bodies" symptom users hit on draft day.
    }

    // ── Player matching — fewer players on star trades, picks fill the rest ──
    // Star targets (≥130 TV) mirror real NBA deals: 1 matching vet + pick pile.
    // With the flatter TV curve, 87/87 Bam-tier players land ~140 TV and get the
    // star package. Mid (100-129) allows 3 players; small (<100) up to 5.
    const isStarTarget = offerValue >= 130;
    let MAX_PLAYERS: number;
    if (isStarTarget) MAX_PLAYERS = 2;
    else if (offerValue >= 100) MAX_PLAYERS = 3;
    else MAX_PLAYERS = 5;

    // Star-offer exception: when the basket is ≥140 TV, the opposing team will
    // part with their LOWEST-TV untouchable (one per offer). Hard guards so a
    // team's FRANCHISE piece (Ant for Minny: 90/94) never comes out — only true
    // rotation-tier untouchables (loyalty vets, 82 OVR contend-locks) unlock.
    // For monster offers (>170 TV), the SECOND-lowest qualifying untouchable unlocks too.
    // FRANCHISE-FACE PROTECTION: if a team has only ONE untouchable overall, that player
    // is their face — never unlock even if they squeak past the ovr/pot guards.
    const unlockedUntouchableIds = new Set<string>();
    if (offerValue >= 140) {
      const allUntouchables = theirRoster.filter(p => isUntouchable(p, theirMode, currentYear, tvContext?.mvpRank));
      const franchiseFaceProtected = allUntouchables.length <= 1;
      if (!franchiseFaceProtected) {
        const qualifying = allUntouchables
          // Loyalty floor: 10+ year lifers are ABSOLUTELY untradeable, no unlock ever.
          // Saves Curry/Draymond/Duncan-types regardless of how wild the offer gets //lol
          .filter(p => !isFranchiseLifer(p))
          .map(p => ({ p, tv: calcPlayerTV(p, theirMode, currentYear, tvContext), ovr: calcOvr2K(p), pot: calcPot2K(p, currentYear) }))
          .filter(x =>
               x.tv > 0
            && x.tv <= offerValue * 0.5
            && x.ovr < 85
            && x.pot < 90
          )
          .sort((a, b) => a.tv - b.tv);
        if (qualifying[0]) unlockedUntouchableIds.add(qualifying[0].p.internalId);
        if (offerValue > 170 && qualifying[1]) unlockedUntouchableIds.add(qualifying[1].p.internalId);
      }
    }

    // Seed the return with each unlocked untouchable (1 for ≥150 TV, up to 2 for >180 TV)
    // so the build pattern reads: (1) unlocked untouchables → (2) fillers → (3) pick sweeteners.
    for (const unlockedId of unlockedUntouchableIds) {
      const ut = theirRoster.find(p => p.internalId === unlockedId);
      if (!ut) continue;
      const utTV = calcPlayerTV(ut, theirMode, currentYear, tvContext);
      returnItems.push({
        id: ut.internalId,
        type: 'player',
        label: ut.name,
        val: utTV,
        player: ut,
        ovr: calcOvr2K(ut),
        pot: calcPot2K(ut, currentYear),
      });
      usedIds.add(ut.internalId);
      gap -= utTV;
    }

    const isContender = theirMode === 'contend';
    const avgAge = theirRoster.length > 0
      ? theirRoster.reduce((s, p) => s + (p.age ?? 25), 0) / theirRoster.length
      : 30;
    const isYoungContender = isContender && avgAge < 27;

    for (let round = 0; round < MAX_PLAYERS && gap > (round === 0 ? 0 : getTradeValueFloor(expectedReturn, 8, 0.08, 1)); round++) {
      const maxGapMult = round === 0 ? 1.8 : round === 1 ? 1.5 : 1.3;
      // Star chase in reverse mode: shopping an elite target waives the user's
      // own untouchable/young-core protections. Be careful what you wish for.
      const bypassUT = bypassUntouchablesForTid === team.id;
      const candidate = theirRoster
        .filter(p => !usedIds.has(p.internalId)
                  && (bypassUT || unlockedUntouchableIds.has(p.internalId) || !isUntouchable(p, theirMode, currentYear, tvContext?.mvpRank))
                  && (bypassUT || !isYoungContenderCore(p, theirRoster, theirMode, currentYear)))
        .map(p => ({ ...p, tv: calcPlayerTV(p, theirMode, currentYear, tvContext) }))
        .filter(p => p.tv > 0 && p.tv <= gap * maxGapMult)
        .sort((a, b) => {
          const tvDiff = Math.abs(a.tv - gap) - Math.abs(b.tv - gap);
          // Young contenders prefer older/expendable players to protect their core —
          // among similarly-valued candidates, pick the veteran first.
          if (isYoungContender && Math.abs(tvDiff) < 20) return (b.age ?? 25) - (a.age ?? 25);
          return tvDiff;
        })[0];

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

    // ── Pick sweeteners — contenders spam picks to match star value ──────
    const theirPicks = liveDraftPicks
      .filter(pk => pk.tid === team.id && pk.season >= minLivePickSeason && !usedIds.has(String(pk.dpid)))
      .sort((a, b) => a.season - b.season);

    // Rebuild teams have high-value lottery picks (40-50 TV) — 14 was too tight,
    // causing the loop to break after only 2 picks on a 20 TV residual.
    const overshootMargin = isContender ? 35 : 30;
    // Young contenders (avg age < 27) cap picks at 2 ONLY on small residual gaps —
    // stops them from dumping 5 picks for a filler. When gap ≥ 40 (star-chase
    // territory), they go unrestricted like all-in contenders
    // so they can still stack picks to equalize big TV shortfalls.
    const pickCap = isYoungContender && gap < 40 ? 2 : 40;
    let safety = 0;
    const sweetenerPicksFromTeam: DraftPick[] = [];
    while (gap > gapTolerance && safety++ < pickCap && theirPicks.length > 0) {
      const pk = theirPicks.shift()!;
      if (stepienBlocks(team.id, pk, sweetenerPicksFromTeam)) continue;
      // Pick value follows the ORIGINAL owner's record (whose slot this pick
      // represents), not the current holder's — getPickTV handles that lookup.
      const pv = getPickTV(pk, pickCtx);
      if (pv > gap + getTradeOvershootMargin(expectedReturn, overshootMargin, isContender ? 8 : 6)) break;
      sweetenerPicksFromTeam.push(pk);
      returnItems.push({
        id: String(pk.dpid),
        type: 'pick',
        label: formatPickLabel(pk, currentYear, lotterySlotByTid, false),
        val: pv,
        pick: pk,
      });
      usedIds.add(String(pk.dpid));
      gap -= pv;
    }

    if (returnItems.length === 0) continue;

    // Post-trade trim cost: refuse offers that would force > $25M of dead money to waive throw-ins.
    const incomingPlayers = players.filter(p => basketIds.has(p.internalId));
    const outgoingIds = new Set(returnItems.filter(i => i.type === 'player' && i.player).map(i => i.player!.internalId));
    const trimDeadUSD = projectTrimDeadMoneyUSD(theirRoster, incomingPlayers, outgoingIds, currentYear);
    if (trimDeadUSD > 25_000_000) continue;

    // Ratio threshold: looser for franchise-tier targets where stacking picks can't close the gap.
    const returnVal = returnItems.reduce((s, i) => s + i.val, 0);
    const ratio = Math.max(expectedReturn, returnVal) / Math.max(1, Math.min(expectedReturn, returnVal));
    const totalVal = Math.max(expectedReturn, returnVal);
    const ratioThreshold = getTradeRatioThreshold(totalVal);
    if (ratio > ratioThreshold) continue;

    offers.push({ tid: team.id, items: returnItems, totalVal: returnVal, variant: 'match' });

    // ── Salary-dump variant — contenders chasing 50-149 TV targets ──────
    // Pulls filler players from the Trading Block (isOnTradingBlock) and stacks
    // AS MANY as needed to satisfy the NBA 125% salary rule. Then picks close
    // the remaining TV gap. If contracts can't legally add up, skip this variant.
    // 150+ TV targets use the star package (match variant) instead.
    if (isContender && offerValue >= 50 && offerValue < 150 && outgoingSalary > 0) {
      const dumpItems: TradeOfferItem[] = [];
      const dumpUsedIds = new Set(basketIds);
      let dumpGap = offerValue;
      let incomingSalary = 0;

      const dumpBypassUT = bypassUntouchablesForTid === team.id;
      const blockCandidates = theirRoster
        .filter(p => !dumpUsedIds.has(p.internalId)
                  && (dumpBypassUT || !isUntouchable(p, theirMode, currentYear, tvContext?.mvpRank))
                  && (dumpBypassUT || !isYoungContenderCore(p, theirRoster, theirMode, currentYear))
                  && (dumpBypassUT || isOnTradingBlock(p, theirMode, currentYear, false, tvContext?.mvpRank)))
        .map(p => ({ ...p, tv: calcPlayerTV(p, theirMode, currentYear, tvContext), sal: p.contract?.amount ?? 0 }))
        .filter(p => p.tv > 0 && p.sal > 0)
        // Higher-salary players first — match outgoing salary faster with fewer bodies.
        .sort((a, b) => b.sal - a.sal);

      // Pack MINIMUM players to hit salary-legal, then stop — picks close the TV gap.
      // Without this stop, the loop was packing 4+ players because the salary-over
      // check only broke when gap was also <30, causing contender roster drains.
      const MAX_DUMP_PLAYERS = 8;
      for (const cand of blockCandidates) {
        if (dumpItems.length >= MAX_DUMP_PLAYERS) break;
        // As soon as at least one player is in and salary clears the 125% rule, stop.
        if (dumpItems.length > 0 && isSalaryLegal(outgoingSalary, incomingSalary)) break;

        dumpItems.push({
          id: cand.internalId,
          type: 'player',
          label: cand.name,
          val: cand.tv,
          player: cand,
          ovr: calcOvr2K(cand),
          pot: calcPot2K(cand, currentYear),
        });
        dumpUsedIds.add(cand.internalId);
        dumpGap -= cand.tv;
        incomingSalary += cand.sal;
      }

      // Hard requirement: salary must be legal or the whole deal is illegal under CBA.
      const salaryLegal = dumpItems.length > 0 && isSalaryLegal(outgoingSalary, incomingSalary);

      if (salaryLegal) {
        // Pile picks to close the remaining TV gap.
        const dumpPicks = liveDraftPicks
          .filter(pk => pk.tid === team.id && pk.season >= minLivePickSeason && !dumpUsedIds.has(String(pk.dpid)))
          .sort((a, b) => a.season - b.season);

        let dumpPicksAdded = 0;
        const MAX_DUMP_PICK_COMPENSATION = 3;
        let dumpSafety = 0;
        const dumpPicksFromTeam: DraftPick[] = [];
        // Salary dumps are a sweetener, not a full pick inventory transfer.
        // Realistic dumps usually cost 1-2 picks; hard-cap at 3 so the AI
        // never creates 10+ pick Mitchell Robinson-style dump packages.
        while (dumpGap > Math.max(1, gapTolerance * 1.5) && dumpSafety++ < 40 && dumpPicks.length > 0 && dumpPicksAdded < MAX_DUMP_PICK_COMPENSATION) {
          const pk = dumpPicks.shift()!;
          if (stepienBlocks(team.id, pk, dumpPicksFromTeam)) continue;
          const pv = getPickTV(pk, pickCtx);
          if (pv > dumpGap + getTradeOvershootMargin(expectedReturn, 35, 8)) break;
          dumpPicksFromTeam.push(pk);
          dumpItems.push({
            id: String(pk.dpid),
            type: 'pick',
            label: formatPickLabel(pk, currentYear, lotterySlotByTid, false),
            val: pv,
            pick: pk,
          });
          dumpUsedIds.add(String(pk.dpid));
          dumpGap -= pv;
          dumpPicksAdded++;
        }

        // Dump-variant trim guard: the AI contender absorbs the user's basket.
        // If their post-trade roster blows past 15, the trim books dead money on
        // their cheapest multi-year guarantees. Refuse the dump variant if the
        // projected trim cost is heavy — same gate as the match variant above.
        const dumpIncoming = players.filter(p => basketIds.has(p.internalId));
        const dumpOutgoingIds = new Set(dumpItems.filter(i => i.type === 'player' && i.player).map(i => i.player!.internalId));
        const dumpTrimDeadUSD = projectTrimDeadMoneyUSD(theirRoster, dumpIncoming, dumpOutgoingIds, currentYear);
        const dumpReturnVal = dumpItems.reduce((s, i) => s + i.val, 0);
        const dumpRatio = Math.max(expectedReturn, dumpReturnVal) / Math.max(1, Math.min(expectedReturn, dumpReturnVal));
        const dumpTotalVal = Math.max(expectedReturn, dumpReturnVal);
        const dumpRatioThreshold = getTradeRatioThreshold(dumpTotalVal);
        if (dumpRatio <= dumpRatioThreshold && dumpTrimDeadUSD <= 25_000_000) {
          offers.push({ tid: team.id, items: dumpItems, totalVal: dumpReturnVal, variant: 'dump' });
        }
      }
    }

    // Absorb variant: cap-space team takes the contract for nothing in return.
    const hintedCapSpace = capSpaces?.get(team.id) ?? -Infinity;
    const strictCapSpace = (() => {
      const ls = recentlySignedLockMs?.leagueStats as LeagueStats | undefined;
      if (!ls || ls.salaryCapEnabled === false) return Number.POSITIVE_INFINITY;
      const thresholds = getCapThresholds(ls as any);
      const profile = getTeamCapProfile(
        players,
        team.id,
        team.wins ?? 0,
        team.losses ?? 0,
        thresholds,
        team,
        currentYear,
      );
      return profile.capSpaceUSD / 1000;
    })();
    const verifiedCapSpace = Math.min(hintedCapSpace, strictCapSpace);
    const hasStrictCapRoom = Number.isFinite(verifiedCapSpace) && verifiedCapSpace > 0;
    const absorbCbaOk = (() => {
      const ls = recentlySignedLockMs?.leagueStats as LeagueStats | undefined;
      const date = recentlySignedLockMs?.currentDate;
      if (!ls || !date) return true;
      const outgoingPlayers = players.filter(p => basketIds.has(p.internalId));
      const check = validateCBATradeRules({
        teamAId: fromTid,
        teamBId: team.id,
        teamAPlayers: outgoingPlayers,
        teamBPlayers: [],
        teams,
        players,
        leagueStats: ls,
        currentDate: date,
        currentYear,
      });
      return check.ok;
    })();
    const canAbsorb = outgoingSalary > 0
      && hasStrictCapRoom
      && outgoingSalary <= (verifiedCapSpace + 100)
      && absorbCbaOk;
    if (canAbsorb) {
      offers.push({
        tid: team.id,
        variant: 'absorb',
        items: [{
          id: `absorb-${team.id}`,
          type: 'absorb',
          label: 'Salary Dump',
          val: 0,
        }],
        totalVal: 0,
      });
    }
  }

  return offers.sort((a, b) => b.totalVal - a.totalVal);
}

/**
 * Generate a single AI-initiated trade proposal.
 * Picks a seller team, finds a target player, builds a counteroffer.
 * Returns null if no viable trade found.
 */
