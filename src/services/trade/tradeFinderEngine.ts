/**
 * tradeFinderEngine.ts — Unified trade offer generation.
 *
 * Used by BOTH TradeFinderView (UI) and AITradeHandler (background AI-AI trades).
 * Single source of truth for all trade logic: player matching, pick sweeteners,
 * untouchable protection, salary matching, ratio thresholds.
 */

import type { NBAPlayer, NBATeam, DraftPick, LeagueStats } from '../../types';
import {
  calcOvr2K, calcPot2K, calcPlayerTV, calcPickTV,
  calcCashTV, CASH_TRADE_CAP_USD,
  isUntouchable, isYoungContenderCore, isOnTradingBlock, isSalaryLegal, type TeamMode,
  type TVContext,
} from './tradeValueEngine';
import { effectiveRecord, seasonLabelToYear, contractToUSD } from '../../utils/salaryUtils';
import { tradeRoleToTeamMode } from '../../utils/teamStrategy';
import { formatPickLabel } from '../draft/draftClassStrength';
import { wouldStepienViolateForTid } from './stepienRule';
import { validateCBATradeRules } from '../../utils/cbaTradeRules';

const EXTERNAL = new Set(['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'Draft Prospect', 'Prospect']);

// ── Types ────────────────────────────────────────────────────────────────────

export interface TradeOfferItem {
  id: string;
  type: 'player' | 'pick' | 'absorb';
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
  /** 'match' = closest-value player swap (default); 'dump' = low-value vet + pick hoard;
   *  'absorb' = cap-space team takes the contract for future flexibility (no return). */
  variant?: 'match' | 'dump' | 'absorb';
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
  /** Optional: in-season PER context (league avg + regular-season flag). When
   * present, TV is marginally adjusted by each player's current-season PER. */
  tvContext?: TVContext;
  /** Optional: per-team cap space in thousands (negative = over cap). Enables the
   * 'absorb' salary-dump variant when a team has enough room to take the outgoing
   * contract without matching salary back. */
  capSpaces?: Map<number, number>;
  /** Optional GM-mode trade difficulty 0-100 (50 = default).
   *  Applied as a TV bias on the target `gap`: higher difficulty = AI returns less. */
  tradeDifficulty?: number;
  /** When set, untouchable / young-core filters are SKIPPED for this team's roster.
   *  Used in reverse-mode-star-chasing: AI demands user's core for an elite target. */
  bypassUntouchablesForTid?: number;
  /** When true, the reverse-mode loyalty-lifer block is bypassed — user has
   *  overridden the owner's "don't trade our lifer" warning. */
  allowLifers?: boolean;
  /** Optional: season → class-strength multiplier (0.75-1.30). Scales pick TV
   *  based on upcoming draft class quality. See draftClassStrength.ts. */
  classStrengthByYear?: Map<number, number>;
  /** Optional: tid → actual lottery slot (1-14) for currentYear draft. When
   *  present, current-year R1 picks get priced off the KNOWN slot instead of
   *  power-rank projection — critical for June draft-day trades. */
  lotterySlotByTid?: Map<number, number>;
  /** When true, filter out 1st-round picks whose inclusion would leave the
   *  donor team with no 1st in two consecutive future drafts. Without this,
   *  the assembled basket gets rejected wholesale by the Stepien post-validator
   *  in AITradeHandler instead of falling back to a 2nd or alt-year 1st. */
  stepienEnabled?: boolean;
  /** Trade window (years) used by the Stepien check. Mirrors leagueStats.tradableDraftPickSeasons (default 7). */
  tradablePickWindow?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function roleToMode(role: string): TeamMode {
  return tradeRoleToTeamMode(role);
}

/**
 * Power-rank teams (1 = best) using effectiveRecord so offseason 0-0 falls back
 * to last season. In-season leans on win pct; offseason on roster strength.
 * Used by BOTH TradeFinderView and TradeMachineModal so pick values line up.
 */
export function teamPowerRanks(teams: NBATeam[], currentYear: number): Map<number, number> {
  const sorted = [...teams].sort((a, b) => {
    const recA = effectiveRecord(a, currentYear);
    const recB = effectiveRecord(b, currentYear);
    const wpA = (recA.wins + recA.losses) > 0 ? recA.wins / (recA.wins + recA.losses) : 0.5;
    const wpB = (recB.wins + recB.losses) > 0 ? recB.wins / (recB.wins + recB.losses) : 0.5;
    const scoreA = wpA * 0.6 + ((a as any).strength ?? 50) / 100 * 0.4;
    const scoreB = wpB * 0.6 + ((b as any).strength ?? 50) / 100 * 0.4;
    return scoreB - scoreA;
  });
  const map = new Map<number, number>();
  sorted.forEach((t, i) => map.set(t.id, i + 1));
  return map;
}

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
    classStrengthByYear, lotterySlotByTid,
    stepienEnabled = false, tradablePickWindow = 7,
  } = input;

  // Stepien-aware filter: would shipping `candidate` leave `tid` without a 1st
  // in two straight future drafts, given the picks ALREADY chosen from this team?
  // 2nds and disabled rule short-circuit to "ok".
  const stepienBlocks = (tid: number, candidate: DraftPick, alreadyLeaving: DraftPick[]): boolean => {
    if (!stepienEnabled) return false;
    if (candidate.round !== 1) return false;
    return wouldStepienViolateForTid(draftPicks, currentYear, tradablePickWindow, tid, [...alreadyLeaving, candidate]);
  };

  // Resolve a pick's classStrength + actualSlot once. Current-year R1 picks
  // get their real lottery slot if the lottery has run; everything else falls
  // back to power-rank projection inside calcPickTV.
  const pickOpts = (pk: DraftPick) => ({
    classStrength: classStrengthByYear?.get(pk.season) ?? 1.0,
    actualSlot: pk.round === 1 && pk.season === currentYear
      ? lotterySlotByTid?.get(pk.originalTid)
      : undefined,
  });

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
  // Uses MAX(direct field, stats count) because the live counter can lag behind
  // career history early in a game.
  if (targetTids !== undefined && !allowLifers) {
    for (const p of players) {
      if (!basketIds.has(p.internalId)) continue;
      const directYrs = (p as any).yearsWithTeam ?? 0;
      const statYrs = p.stats
        ? p.stats.filter((s: any) => s.tid === p.tid && !s.playoffs && (s.gp ?? 0) > 0).length
        : 0;
      if (Math.max(directYrs, statYrs) >= 10) return [];
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
    const expectedReturn = Math.max(10, offerValue - difficultyBias);
    let gap = expectedReturn;

    // Get their roster sorted by OVR, excluding external/prospects
    const theirRoster = players
      .filter(p => p.tid === team.id && !EXTERNAL.has(p.status ?? '') && p.tid !== -2)
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
      const theirPicksOnly = draftPicks
        .filter(pk => pk.tid === team.id && pk.season >= minTradableSeason && !pickSwapUsed.has(String(pk.dpid)))
        .sort((a, b) => a.season - b.season);
      let safetyP = 0;
      const swapPicksFromTeam: DraftPick[] = [];
      while (pickSwapGap > 2 && safetyP++ < 8 && theirPicksOnly.length > 0) {
        const pk = theirPicksOnly.shift()!;
        if (stepienBlocks(team.id, pk, swapPicksFromTeam)) continue;
        const pickRank = powerRanks.get(pk.originalTid) ?? theirRank;
        const pv = calcPickTV(pk.round, pickRank, teams.length, Math.max(1, pk.season - currentYear), pickOpts(pk));
        if (pv > pickSwapGap + 30) break;
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
    const MAX_PLAYERS = isStarTarget ? 2 : offerValue >= 100 ? 3 : 5;

    // Star-offer exception: when the basket is ≥140 TV, the opposing team will
    // part with their LOWEST-TV untouchable (one per offer). Hard guards so a
    // team's FRANCHISE piece (Ant for Minny: 90/94) never comes out — only true
    // rotation-tier untouchables (loyalty vets, 82 OVR contend-locks) unlock.
    // For monster offers (>170 TV), the SECOND-lowest qualifying untouchable unlocks too.
    // FRANCHISE-FACE PROTECTION: if a team has only ONE untouchable overall, that player
    // is their face — never unlock even if they squeak past the ovr/pot guards.
    const unlockedUntouchableIds = new Set<string>();
    if (offerValue >= 140) {
      const allUntouchables = theirRoster.filter(p => isUntouchable(p, theirMode, currentYear));
      const franchiseFaceProtected = allUntouchables.length <= 1;
      if (!franchiseFaceProtected) {
        const qualifying = allUntouchables
          // Loyalty floor: 10+ year lifers are ABSOLUTELY untradeable, no unlock ever.
          // Saves Curry/Draymond/Duncan-types regardless of how wild the offer gets //lol
          .filter(p => {
            const directYrs = (p as any).yearsWithTeam ?? 0;
            const statYrs = p.stats
              ? p.stats.filter((s: any) => s.tid === p.tid && !s.playoffs && (s.gp ?? 0) > 0).length
              : 0;
            return Math.max(directYrs, statYrs) < 10;
          })
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

    for (let round = 0; round < MAX_PLAYERS && gap > (round === 0 ? 0 : 8); round++) {
      const maxGapMult = round === 0 ? 1.8 : round === 1 ? 1.5 : 1.3;
      // Star chase in reverse mode: shopping an elite target waives the user's
      // own untouchable/young-core protections. Be careful what you wish for.
      const bypassUT = bypassUntouchablesForTid === team.id;
      const candidate = theirRoster
        .filter(p => !usedIds.has(p.internalId)
                  && (bypassUT || unlockedUntouchableIds.has(p.internalId) || !isUntouchable(p, theirMode, currentYear))
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
    const theirPicks = draftPicks
      .filter(pk => pk.tid === team.id && pk.season >= minTradableSeason && !usedIds.has(String(pk.dpid)))
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
    while (gap > 2 && safety++ < pickCap && theirPicks.length > 0) {
      const pk = theirPicks.shift()!;
      if (stepienBlocks(team.id, pk, sweetenerPicksFromTeam)) continue;
      // Pick value follows the ORIGINAL owner's record (whose slot this pick
      // represents), not the current holder's. OKC holding LAC's 1st stays
      // valued at LAC's lottery curve even though OKC is a contender.
      const pickRank = powerRanks.get(pk.originalTid) ?? theirRank;
      const pv = calcPickTV(pk.round, pickRank, teams.length, Math.max(1, pk.season - currentYear), pickOpts(pk));
      if (pv > gap + overshootMargin) break;
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
    const ratioThreshold = totalVal >= 300 ? 1.30 : totalVal >= 200 ? 1.35 : totalVal >= 100 ? 1.40 : 1.45;
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
                  && (dumpBypassUT || !isUntouchable(p, theirMode, currentYear))
                  && (dumpBypassUT || !isYoungContenderCore(p, theirRoster, theirMode, currentYear))
                  && (dumpBypassUT || isOnTradingBlock(p, theirMode, currentYear)))
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
        const dumpPicks = draftPicks
          .filter(pk => pk.tid === team.id && pk.season >= minTradableSeason && !dumpUsedIds.has(String(pk.dpid)))
          .sort((a, b) => a.season - b.season);

        let dumpPicksAdded = 0;
        const MAX_DUMP_PICK_COMPENSATION = 3;
        let dumpSafety = 0;
        const dumpPicksFromTeam: DraftPick[] = [];
        // Salary dumps are a sweetener, not a full pick inventory transfer.
        // Realistic dumps usually cost 1-2 picks; hard-cap at 3 so the AI
        // never creates 10+ pick Mitchell Robinson-style dump packages.
        while (dumpGap > 3 && dumpSafety++ < 40 && dumpPicks.length > 0 && dumpPicksAdded < MAX_DUMP_PICK_COMPENSATION) {
          const pk = dumpPicks.shift()!;
          if (stepienBlocks(team.id, pk, dumpPicksFromTeam)) continue;
          const pickRank = powerRanks.get(pk.originalTid) ?? theirRank;
          const pv = calcPickTV(pk.round, pickRank, teams.length, Math.max(1, pk.season - currentYear), pickOpts(pk));
          if (pv > dumpGap + 35) break;
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
        const dumpRatioThreshold = dumpTotalVal >= 200 ? 1.35 : dumpTotalVal >= 100 ? 1.40 : 1.45;
        if (dumpRatio <= dumpRatioThreshold && dumpTrimDeadUSD <= 25_000_000) {
          offers.push({ tid: team.id, items: dumpItems, totalVal: dumpReturnVal, variant: 'dump' });
        }
      }
    }

    // Absorb variant: cap-space team takes the contract for nothing in return.
    const teamCapSpace = capSpaces?.get(team.id) ?? -Infinity;
    const canAbsorb = outgoingSalary > 0
      && teamCapSpace >= outgoingSalary
      && theirMode !== 'contend'; // contenders don't take on dead money for nothing
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
}): { buyerGives: TradeOfferItem[]; sellerGives: TradeOfferItem[] } | null {
  const { buyerTid, sellerTid, players, teams, draftPicks, currentYear, minTradableSeason, powerRanks, teamOutlooks, tvContext, classStrengthByYear, lotterySlotByTid, stepienEnabled, tradablePickWindow } = input;

  const sellerOutlook = teamOutlooks.get(sellerTid) ?? { role: 'neutral' };
  const buyerOutlook = teamOutlooks.get(buyerTid) ?? { role: 'neutral' };
  const sellerMode = roleToMode(sellerOutlook.role);
  const buyerMode = roleToMode(buyerOutlook.role);

  // Find a target player on the seller's team (non-untouchable, best TV)
  const sellerRoster = players
    .filter(p => p.tid === sellerTid && !EXTERNAL.has(p.status ?? ''))
    .sort((a, b) => calcPlayerTV(b, sellerMode, currentYear, tvContext) - calcPlayerTV(a, sellerMode, currentYear, tvContext));

  const target = sellerRoster.find(p => !isUntouchable(p, sellerMode, currentYear));
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
    buyerCashAvailableUSD = 0, sellerCashAvailableUSD = 0,
    stepienEnabled = false, tradablePickWindow = 7,
  } = input;

  // Stepien-aware: skip 1st-round picks whose departure would leave the donor
  // with no 1st in two consecutive future drafts. Causes Variant A to fall
  // through (returning null) so the caller can try a different proposal type
  // instead of generating a basket the post-validator will reject.
  const stepienBlocksOne = (tid: number, candidate: DraftPick): boolean => {
    if (!stepienEnabled) return false;
    if (candidate.round !== 1) return false;
    return wouldStepienViolateForTid(draftPicks, currentYear, tradablePickWindow, tid, [candidate]);
  };

  const buyerOutlookRole = teamOutlooks.get(buyerTid)?.role ?? 'neutral';
  const sellerOutlookRole = teamOutlooks.get(sellerTid)?.role ?? 'neutral';
  const buyerMode = roleToMode(buyerOutlookRole);
  const sellerMode = roleToMode(sellerOutlookRole);

  const pickOpts = (pk: DraftPick) => ({
    classStrength: classStrengthByYear?.get(pk.season) ?? 1.0,
    actualSlot: pk.round === 1 && pk.season === currentYear
      ? lotterySlotByTid?.get(pk.originalTid)
      : undefined,
  });
  const tvOf = (pk: DraftPick): number => {
    const rank = powerRanks.get(pk.originalTid) ?? Math.ceil(teams.length / 2);
    return calcPickTV(pk.round, rank, teams.length, Math.max(1, pk.season - currentYear), pickOpts(pk));
  };

  const sellerPicks = draftPicks
    .filter(p => p.tid === sellerTid && p.season >= minTradableSeason)
    .sort((a, b) => a.season - b.season);
  const buyerPicks = draftPicks
    .filter(p => p.tid === buyerTid && p.season >= minTradableSeason)
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

  // Variant C — pick consolidation. Buyer offers 2× 2nds for one of seller's later 2nds
  // bundled toward an earlier 1st? Skip — too case-specific. Variant A + B cover most.

  return null;
}

// ── Acceptance evaluator ─────────────────────────────────────────────────────
//
// Single source of truth for "does the AI team accept this trade?". Used by
// TradeMachineModal.handleExecuteTrade and mirrors generateCounterOffers' gate
// so a deal the Finder would produce is also one the Machine will accept.

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
  const fairM = k2 >= 90 ? 50 : k2 >= 85 ? 40 : k2 >= 80 ? 30 : k2 >= 75 ? 22 : k2 >= 70 ? 12 : k2 >= 65 ? 6 : k2 >= 60 ? 3 : 1.5;
  const overpayPerYr = Math.max(0, annualM - fairM);
  return overpayPerYr * yrsLeft * 0.5;
}

/** Projects USD dead-money the team would eat after post-trade roster trim (overflow above maxRoster). */
function projectTrimDeadMoneyUSD(
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
    // Use originatingTid rank — pick value reflects where the pick will land,
    // which tracks the original team's record, not the current holder.
    const pickRank = powerRanks.get(item.pick.originalTid) ?? Math.ceil(teams.length / 2);
    const classStrength = classStrengthByYear?.get(item.pick.season) ?? 1.0;
    // Actual lottery slot keys off the ORIGINAL owner (the team whose record
    // determined the slot), not the current holder.
    const actualSlot = item.pick.round === 1 && item.pick.season === currentYear
      ? lotterySlotByTid?.get(item.pick.originalTid)
      : undefined;
    return calcPickTV(item.pick.round, pickRank, teams.length, Math.max(1, item.pick.season - currentYear), { classStrength, actualSlot });
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
  const totalVal = Math.max(Math.max(10, expectedReturn), returnVal);
  // Mirrors generateCounterOffers: relaxed for franchise-tier targets where
  // picks can't close the TV gap perfectly.
  const ratioThreshold = totalVal >= 300 ? 1.30 : totalVal >= 200 ? 1.35 : totalVal >= 100 ? 1.40 : 1.45;

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
    reason = shortfall > 30
      ? "No way. This isn't even close to fair value for what we're giving up."
      : "We'd need a bit more to make this work.";
  }

  return { accepted, offerValue, returnVal, expectedReturn, shortfall, ratio, ratioThreshold, reason };
}
