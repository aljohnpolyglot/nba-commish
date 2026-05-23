import type { NBAPlayer, DraftPick, LeagueStats } from '../../types';
import { getDisplayAge, getDisplayOverall, getDisplayPotential } from '../../store/playerRatingStore';
import { getPlayerInjuryProfile } from '../../data/playerInjuryData';
import { formatPickLabel } from '../draft/draftClassStrength';
import { isTradeEligible } from '../../utils/signingMoratorium';
import {
  calcCashTV,
  CASH_TRADE_CAP_USD,
  computeLeagueAvg,
  getOvrTailwind,
  getPotColor,
  getTeamMode,
  getTradeCandidateFloor,
  getTradeGapTolerance,
  getTradeOvershootMargin,
  getTradeRatioThreshold,
  getTradeValueFloor,
  isSalaryLegal,
} from './tradeValueHelpers';
import {
  calcOvr2K,
  calcPot2K,
  computeLeaguePerAvg,
  isOnTradingBlock,
  isRecentlySignedLocked,
  isUntouchable,
  isWalkingExpiring,
  isYoungContenderCore,
  type TeamMode,
  type TVContext,
} from './tradeValueCore';
export {
  calcCashTV,
  CASH_TRADE_CAP_USD,
  computeLeagueAvg,
  getOvrTailwind,
  getPotColor,
  getTeamMode,
  getTradeCandidateFloor,
  getTradeGapTolerance,
  getTradeOvershootMargin,
  getTradeRatioThreshold,
  getTradeValueFloor,
  isSalaryLegal,
} from './tradeValueHelpers';
export {
  calcOvr2K,
  calcPot2K,
  computeLeaguePerAvg,
  isOnTradingBlock,
  isRecentlySignedLocked,
  isTradeEligible,
  isUntouchable,
  isWalkingExpiring,
  isYoungContenderCore,
};
export type { TeamMode, TVContext } from './tradeValueCore';

export function calcPlayerTV(player: NBAPlayer, mode: TeamMode, currentYear: number, ctx?: TVContext): number {
  const ovr = calcOvr2K(player);
  const pot = calcPot2K(player, currentYear);
  const age = getDisplayAge(player, currentYear);

  const ovrBase = ovr >= 68 ? 10 : ovr >= 60 ? 3 : 0;
  const potBase = pot >= 68 ? 10 : pot >= 60 ? 3 : 0;
  // Flatter curve (exp 2.0) + higher scale (160) — 85-90 OVR players now sit
  // in real star territory instead of compressing near the role-player floor.
  // Ref: 87/87 contend = 140 TV (was 102); 94/94 contend = 245 TV (was 200).
  const ovrPart = ovrBase + Math.pow(Math.max(0, ovr - 68) / 31, 2.0) * 160;
  const potPart = potBase + Math.pow(Math.max(0, pot - 68) / 31, 2.0) * 160;

  let val: number;
  if (mode === 'rebuild')       val = ovrPart * 0.6 + potPart * 1.4;
  else if (mode === 'contend')  val = ovrPart * 1.4 + potPart * 0.6;
  else /* presti */              val = ovrPart * 0.5 + potPart * 1.5;

  // Age nerf — minimal global decay. OVR already declines naturally with age in the
  // ratings engine, so a 41yo still sitting at 94 OVR is a genuine outlier (LeBron, KJ
  // types) and their TV should reflect that they're still elite. Start at 39, gentle decay, 72% floor.
  if (age >= 39) val *= Math.max(0.72, Math.pow(0.97, age - 38));

  // Mode-aware age + contract handling. Rebuilders heavily discount aging ROLE-PLAYER
  // vets on multi-year deals (toxic salary they can't shed) but still value expirings
  // as flip-at-deadline / cap-relief assets — mirrors real NBA rebuilder behavior.
  // Critical: stars (ovr >= 80) are NOT treated as "aging vets" until they actually
  // decline to role-player OVR. A 28yo 89 OVR Tatum stays a franchise piece even when
  // his team's strategy flips to "rebuild" (e.g. season-ending injury).
  const expYear = player.contract?.exp ?? currentYear + 1;
  const isExpiring = expYear <= currentYear + 1;       // 1 year or less remaining
  const isFutureMultiYear = expYear >= currentYear + 2; // 2+ years left = locked-in salary
  if (mode === 'rebuild' || mode === 'presti') {
    // Age penalty applies only to non-star OVR — once a player is below 80 OVR, the
    // rebuilder sees them as either flip asset (expiring) or toxic salary (multi-year).
    if (ovr < 80) {
      if (age >= 33)      val *= isExpiring ? 0.55 : 0.28;
      else if (age >= 30) val *= isExpiring ? 0.75 : 0.50;
      else if (age >= 28) val *= isExpiring ? 0.92 : 0.75;
    } else if (ovr < 85) {
      // 80-84 OVR starters: gentler curve, still discount real graybeards.
      if (age >= 35)      val *= isExpiring ? 0.70 : 0.50;
      else if (age >= 32) val *= isExpiring ? 0.85 : 0.70;
    } else {
      // 85+ OVR stars: only the deepest twilight (37+) gets a small haircut.
      if (age >= 37) val *= 0.80;
    }
    // Prime-age stars are the literal foundation a rebuilder builds around — Herro
    // (26y/87 OVR signed through 2031), SGA-tier guys, etc. The rebuilder values
    // them MORE than a contender does because they ARE the timeline. Tiered:
    //   * 28+ stars → no bonus (they're just "good"; build-around timeline tightening)
    //   * 26-27 + 85+ OVR → moderate cornerstone premium (Herro tier)
    //   * ≤25 + 85+ OVR → strong cornerstone premium (true young stars)
    //   * ≤23 + 88+ POT → developmental-cornerstone premium
    if (age <= 25 && ovr >= 85)      val *= 1.30;
    else if (age <= 27 && ovr >= 86) val *= 1.20;
    else if (age <= 23 && pot >= 88) val *= 1.15;
  } else if (mode === 'contend') {
    // Contenders fairly value their veterans but slightly under-value pure projects
    // (need NOW production). Mild — they still see role-player upside, just not full.
    if (age <= 21 && ovr < 70 && isFutureMultiYear) val *= 0.85;
    // Toxic multi-year role-player vet contracts (34+, ovr<82, 2+yr deal) are a drag
    // for contenders trying to stay flexible. High-OVR stars are exempt — a 35yo 88
    // OVR is still a championship piece.
    if (age >= 34 && ovr < 82 && isFutureMultiYear) val *= 0.85;
  }

  // Walk-year stub: contract already past expiry (data lag). Flat half — keeps the
  // pre-existing safety net for malformed contract data.
  if (expYear <= currentYear) val *= 0.5;

  // In-season PER adjustment — regular season only, auto-resets on rollover.
  // Qualified: >10 GP AND >12 MPG. Cap ±20% (up from ±10%); scaling is perDelta/60
  // so a PER 10 above avg (~27 vs 17) swings ~+17% instead of the old +10%.
  if (ctx?.isRegularSeason) {
    const stats = player.stats?.filter((s: any) => s.season === currentYear && !s.playoffs && (s.gp ?? 0) > 0) ?? [];
    if (stats.length > 0) {
      const gp = stats.reduce((s: number, x: any) => s + (x.gp ?? 0), 0);
      const minSum = stats.reduce((s: number, x: any) => s + (x.min ?? 0), 0);
      if (gp > 10 && minSum / gp > 12) {
        const playerPer = minSum > 0
          ? stats.reduce((s: number, x: any) => s + (x.per ?? 0) * (x.min ?? 0), 0) / minSum
          : ctx.leaguePerAvg;
        const perDelta = playerPer - ctx.leaguePerAvg;
        const mult = 1 + Math.max(-0.20, Math.min(0.20, perDelta / 60));
        val *= mult;
      }
    }
  }

  // Durability penalty — injury-prone players are worth less (AD, Embiid, Zion)
  // Based on career injury history, NOT current injury status
  const profile = getPlayerInjuryProfile(player.name);
  if (profile) {
    const careerGP = player.stats
      ? player.stats.filter((s: any) => !s.playoffs && (s.tid ?? -1) >= 0).reduce((sum: number, s: any) => sum + (s.gp ?? 0), 0)
      : 0;
    const durability = careerGP > 0
      ? Math.max(0, Math.min(99, Math.round(99 - ((profile.careerCount / careerGP) * 100) * 5)))
      : (player as any).durability ?? 75;
    // Glass (< 30): 0.65x, Injury-Prone (30-44): 0.75x, Fragile (45-59): 0.85x, Average (60-74): 0.93x, Durable (75+): no penalty
    if (durability < 30)       val *= 0.65;
    else if (durability < 45)  val *= 0.75;
    else if (durability < 60)  val *= 0.85;
    else if (durability < 75)  val *= 0.93;
  }

  // MVP-race premium — Luka/Joker/SGA-tier guys do not move at fair OVR/POT
  // value in real life. Tiered so the top three command a true franchise tax,
  // top-10 still get a heavy premium, and the back of the top-30 gets a nudge.
  // Only applied when caller passes mvpRank (built from AwardService.calculateMVPRankings).
  const rank = ctx?.mvpRank?.get(player.internalId);
  if (rank !== undefined) {
    const mvpMult =
      rank <= 3  ? 1.50 :  // Luka / Jokić / SGA tier
      rank <= 10 ? 1.32 :  // MVP fringe / All-NBA 1st team
      rank <= 20 ? 1.18 :  // All-NBA 2nd-3rd team anchors
                   1.10;   // 21-30: high-end All-Stars
    val *= mvpMult;
  }

  return Math.max(0, Number(val.toFixed(2)));
}

// ── Pick value (power-ranking aware) ─────────────────────────────────────────
//
// teamPowerRank: 1 = best (→ late pick ~8 TV), totalTeams = worst (→ lottery ~28 TV)
// yearsFromNow: 1 = next draft, 2 = +2, 3+ = flat/stale
//
// opts.classStrength (0.75–1.30, default 1.0): scales the final value based on
//   how loaded the prospect class for this pick's year looks. Computed by
//   draftClassStrength.ts from top-14 prospect POT averages.
// opts.actualSlot (1-14, optional): when the draft lottery has run for this
//   pick's year AND the owning team is in the lottery, this is the KNOWN slot.
//   Overrides the power-rank projection (collapses uncertainty on draft day).

export interface PickTVOpts {
  classStrength?: number;
  actualSlot?: number;
}

export function calcPickTV(
  round: number,
  teamPowerRank: number,
  totalTeams: number,
  yearsFromNow: number,
  opts?: PickTVOpts,
): number {
  const classStrength = opts?.classStrength ?? 1.0;

  if (round === 2) {
    // 2nd rounders: small exponential curve (pick #31 ≈ 6TV, pick #60 ≈ 1TV)
    // teamPowerRank inversely maps to slot: worst team picks ~31, best ~60
    const rankPct2 = totalTeams > 1 ? (teamPowerRank - 1) / (totalTeams - 1) : 0.5; // 0=best, 1=worst
    const slot2 = Math.round(31 + rankPct2 * 29); // 31 (lottery team) → 60 (contender)
    const base2 = Math.max(1, Math.round(6 * Math.exp(-0.05 * (slot2 - 31))));
    // 2nd rounders only half-absorb class strength — talent density beyond #30 is low.
    const class2 = 1.0 + (classStrength - 1.0) * 0.5;
    if (yearsFromNow <= 1) return Math.max(1, Math.round(base2 * class2));
    return Math.max(1, Math.round(base2 * class2 * 0.6));
  }

  // 1st round: exponential decay — slot 1 ≈ 50TV, slot 5 ≈ 32TV, slot 15 ≈ 16TV, slot 30 ≈ 8TV
  // If lottery has run and we know the actual slot, use it directly — otherwise
  // project from team power rank (worst team → earliest pick).
  let estimatedSlot: number;
  if (typeof opts?.actualSlot === 'number' && opts.actualSlot >= 1 && opts.actualSlot <= 30) {
    estimatedSlot = opts.actualSlot;
  } else {
    const rankPct = totalTeams > 1 ? (teamPowerRank - 1) / (totalTeams - 1) : 0.5; // 0=best, 1=worst
    estimatedSlot = Math.round(1 + (1 - rankPct) * 29); // 1 (worst team) → 30 (best team)
  }
  const nextYearBase = Math.round(50 * Math.exp(-0.065 * (estimatedSlot - 1)));

  let value: number;
  if (yearsFromNow <= 1) value = nextYearBase;
  // 2yr out: elite picks retain more value; don't collapse to flat 11
  else if (yearsFromNow === 2) value = Math.max(11, Math.round(nextYearBase * 0.60));
  else value = 11; // 3+ years: everyone flat, too uncertain

  return Math.max(1, Math.round(value * classStrength));
}

// ── getPickTV: context-aware convenience wrapper ─────────────────────────────
//
// Prefer this over raw calcPickTV at trade call sites. Handles:
//   - power rank lookup (falls back to mid-league if team unknown)
//   - class strength lookup (falls back to 1.0 for far-future years)
//   - lottery slot lookup (only applies for current-year round-1 picks)
//   - yearsFromNow clamp (≥1 so same-year picks don't get yearsFromNow=0)

export interface PickValueContext {
  currentYear: number;
  totalTeams: number;
  /** tid → power rank (1=best). Missing teams get mid-league fallback. */
  powerRanks: Map<number, number>;
  /** season → class strength multiplier (0.75-1.30). Optional. */
  classStrengthByYear?: Map<number, number>;
  /** tid → actual lottery slot (1-14) for currentYear draft. Optional. */
  lotterySlotByTid?: Map<number, number>;
}

export function getPickTV(
  pick: { round: number; season: number; originalTid: number },
  ctx: PickValueContext,
): number {
  const yearsFromNow = Math.max(1, pick.season - ctx.currentYear);
  // Pick value follows ORIGINAL owner's record, not the current holder's.
  const rank = ctx.powerRanks.get(pick.originalTid) ?? Math.ceil(ctx.totalTeams / 2);
  const classStrength = ctx.classStrengthByYear?.get(pick.season) ?? 1.0;
  // Lottery slot applies ONLY for current-year round-1 picks whose owner is in the lottery.
  const actualSlot = pick.round === 1 && pick.season === ctx.currentYear
    ? ctx.lotterySlotByTid?.get(pick.originalTid)
    : undefined;
  return calcPickTV(pick.round, rank, ctx.totalTeams, yearsFromNow, { classStrength, actualSlot });
}

// ── Team mode ─────────────────────────────────────────────────────────────────

// ── Auto-balance logic ────────────────────────────────────────────────────────

interface BalanceItem {
  id: string;
  type: 'player' | 'pick';
  name?: string;
  label: string;
  val: number;
  ovr?: number;
  pot?: number;
  pick?: DraftPick;
  player?: NBAPlayer;
}

interface AutoBalanceResult {
  extraA: BalanceItem[];
  extraB: BalanceItem[];
  error: string | null;
}

function playerToItem(p: NBAPlayer, mode: TeamMode, currentYear: number): BalanceItem {
  return {
    id: p.internalId,
    type: 'player',
    name: p.name,
    label: p.name,
    val: calcPlayerTV(p, mode, currentYear),
    ovr: calcOvr2K(p),
    pot: calcPot2K(p, currentYear),
    player: p,
  };
}

export function autoBalance(
  basketA: BalanceItem[],
  basketB: BalanceItem[],
  tidA: number,
  tidB: number,
  modeA: TeamMode,
  modeB: TeamMode,
  players: NBAPlayer[],
  teamPicks: { tid: number; picks: DraftPick[] },
  teamPowerRanks: Map<number, number>, // tid → rank (1=best)
  totalTeams: number,
  currentYear: number,
  pickValueInputs?: {
    classStrengthByYear?: Map<number, number>;
    lotterySlotByTid?: Map<number, number>;
  },
  tvCtx?: TVContext,
): AutoBalanceResult {
  const valA = basketA.reduce((s, i) => s + i.val, 0);
  const valB = basketB.reduce((s, i) => s + i.val, 0);

  if (valA === 0 && valB === 0) return { extraA: [], extraB: [], error: null };

  const weakSide = valA >= valB ? 'B' : 'A';
  const modeWeak = weakSide === 'A' ? modeA : modeB;
  const targetTid = weakSide === 'A' ? tidA : tidB;
  const extraA: BalanceItem[] = [];
  const extraB: BalanceItem[] = [];
  const targetBasket = weakSide === 'A' ? extraA : extraB;

  let gap = Math.max(valA, valB) - Math.min(valA, valB);
  const originalGap = gap;
  const usedIds = new Set([...basketA, ...basketB].map(i => i.id));
  const gapTolerance = getTradeGapTolerance(originalGap);

  // 1. Find a player to fill the gap (exclude untouchables — they're off-limits)
  const available = players
    .filter(p => p.tid === targetTid && !usedIds.has(p.internalId) && !isUntouchable(p, modeWeak, currentYear, tvCtx?.mvpRank))
    .map(p => ({ ...p, tv: calcPlayerTV(p, modeWeak, currentYear, tvCtx) }))
    .filter(p => p.tv > 0 && p.tv <= gap * 1.8)
    .sort((a, b) => Math.abs(a.tv - gap) - Math.abs(b.tv - gap));

  if (available.length > 0) {
    const p = available[0];
    targetBasket.push(playerToItem(p, modeWeak, currentYear));
    usedIds.add(p.internalId);
    gap -= p.tv;
  }

  // 2. Fill remaining gap with picks
  const availPicks = (teamPicks.tid === targetTid ? teamPicks.picks : [])
    .filter(pk => !usedIds.has(String(pk.dpid)));

  const classStrengthByYear = pickValueInputs?.classStrengthByYear;
  const lotterySlotByTid = pickValueInputs?.lotterySlotByTid;
  const pickCtx: PickValueContext = {
    currentYear,
    totalTeams,
    powerRanks: teamPowerRanks,
    classStrengthByYear,
    lotterySlotByTid,
  };

  let picksAdded = 0;
  let safety = 0;
  while (gap > gapTolerance && safety++ < 10 && picksAdded < 4) {
    const nextPick = availPicks[0];
    const peekR1 = { round: 1, season: nextPick?.season ?? currentYear + 1, originalTid: nextPick?.originalTid ?? targetTid };
    const pickVal = getPickTV(peekR1, pickCtx);
    if (pickVal > gap + getTradeOvershootMargin(originalGap, 12, 4)) break;

    const pick = availPicks.shift();
    if (!pick) {
      targetBasket.push({ id: `genpick-${safety}`, type: 'pick', label: `${currentYear + 1} 1st Round`, val: Math.min(gap, 11) });
      gap -= Math.min(gap, 11);
    } else {
      const val = getPickTV(pick, pickCtx);
      targetBasket.push({
        id: String(pick.dpid),
        type: 'pick',
        label: formatPickLabel(pick, currentYear, lotterySlotByTid, false),
        val,
        pick,
      });
      gap -= val;
    }
    picksAdded++;
  }

  // Validate ratio
  const finalValA = valA + extraA.reduce((s, i) => s + i.val, 0);
  const finalValB = valB + extraB.reduce((s, i) => s + i.val, 0);
  const ratio = Math.max(finalValA, finalValB) / Math.max(1, Math.min(finalValA, finalValB));
  const totalVal = Math.max(valA, valB);
  const threshold = totalVal >= 200 ? 1.15 : totalVal >= 100 ? 1.35 : 1.25;

  if (ratio > threshold) {
    return { extraA, extraB, error: 'Value gap too large to bridge with available assets.' };
  }

  return { extraA, extraB, error: null };
}
