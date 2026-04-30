/**
 * tradeValueEngine.ts
 *
 * Pure trade-value calculation functions — no React, no game state.
 * Used by TradeFinderView and AITradeHandler for consistent valuations.
 */

import type { NBAPlayer, DraftPick } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';
import { getPlayerInjuryProfile } from '../../data/playerInjuryData';
import { formatPickLabel } from '../draft/draftClassStrength';

export type TeamMode = 'contend' | 'rebuild' | 'presti';

// ── Untouchable / Trading Block classification ──────────────────────────────
// Used by AI trades, TradeFinder, and TradingBlock UI for consistent behavior.

/** Check if a player is untouchable (should NOT be included in trade offers). */
export function isUntouchable(player: NBAPlayer, mode: TeamMode, currentYear: number): boolean {
  const ovr = calcOvr2K(player);
  const pot = calcPot2K(player, currentYear);
  const age = player.born?.year ? currentYear - player.born.year : (player.age ?? 27);

  // Loyalty rule: 10+ years with the same team = always untouchable (Curry/Dirk/Duncan/Draymond)
  // Uses MAX(direct yearsWithTeam field, stats count) because the live counter can
  // lag behind career history early in a game (rollover hasn't incremented yet).
  const directYrs = (player as any).yearsWithTeam ?? 0;
  const statYrs = player.stats
    ? player.stats.filter((s: any) => s.tid === player.tid && !s.playoffs && (s.gp ?? 0) > 0).length
    : 0;
  if (Math.max(directYrs, statYrs) >= 10) return true;

  if (mode === 'contend') return ovr >= 82;             // core rotation pieces
  if (mode === 'rebuild' || mode === 'presti') return age < 25 && pot >= 85;  // young + high ceiling
  return ovr >= 85 || (age < 24 && pot >= 88);          // neutral: stars or elite prospects
}

/**
 * Young-core protection: contending teams whose active roster averages under 27 years
 * old still lock up high-ceiling prospects (POT ≥ 90). Captures OKC-style teams winning
 * now but whose young talent hasn't fully cooked yet. Call alongside isUntouchable.
 */
export function isYoungContenderCore(
  player: NBAPlayer,
  teamRoster: NBAPlayer[],
  mode: TeamMode,
  currentYear: number,
): boolean {
  if (mode !== 'contend') return false;
  const pot = calcPot2K(player, currentYear);
  if (pot < 90) return false;
  if (teamRoster.length === 0) return false;
  const sumAge = teamRoster.reduce((s, p) => {
    const age = p.born?.year ? currentYear - p.born.year : (p.age ?? 27);
    return s + age;
  }, 0);
  return (sumAge / teamRoster.length) < 27;
}

/** Check if a player is on the trading block (AI is willing to trade). */
export function isOnTradingBlock(player: NBAPlayer, mode: TeamMode, currentYear: number): boolean {
  if (isUntouchable(player, mode, currentYear)) return false;
  const ovr = calcOvr2K(player);
  const age = player.born?.year ? currentYear - player.born.year : (player.age ?? 27);

  if (mode === 'contend') return ovr < 78 || ((player.contract?.exp ?? currentYear + 5) <= currentYear + 1);
  if (mode === 'rebuild' || mode === 'presti') return age >= 28 && ovr >= 75;
  return (player.contract?.amount ?? 0) > 15000 && ovr < 82;
}

// ── Player display ratings ────────────────────────────────────────────────────

export function calcOvr2K(player: NBAPlayer): number {
  const r = player.ratings?.[player.ratings.length - 1];
  return convertTo2KRating(player.overallRating ?? r?.ovr ?? 50, r?.hgt ?? 50, r?.tp);
}

export function calcPot2K(player: NBAPlayer, currentYear: number): number {
  const r = player.ratings?.[player.ratings.length - 1];
  const rawOvr = player.overallRating ?? r?.ovr ?? 50;
  const age = player.born?.year ? currentYear - player.born.year : 26;
  const potBbgm = age >= 29
    ? rawOvr
    : Math.max(rawOvr, Math.round(72.314 + (-2.331 * age) + (0.833 * rawOvr)));
  return convertTo2KRating(Math.min(99, Math.max(40, potBbgm)), r?.hgt ?? 50, r?.tp);
}

// ── Internal TV (never shown to user — used for auto-balance only) ────────────

/** Context for in-season PER adjustment. Passed through by callers that know the
 * league PER average and whether the sim is currently in regular season. */
export interface TVContext {
  leaguePerAvg: number;
  isRegularSeason: boolean;
}

/** League-average PER across qualified regular-season players this season.
 * Qualification: >10 GP AND >12 MPG (matches PlayerStatsView convention).
 * Weighted by minutes so bench warmers don't skew the average down. */
export function computeLeaguePerAvg(players: NBAPlayer[], currentYear: number): number {
  let perTimesMin = 0;
  let totalMin = 0;
  for (const p of players) {
    if (p.tid < 0) continue;
    const stats = p.stats?.filter((s: any) => s.season === currentYear && !s.playoffs && (s.gp ?? 0) > 0) ?? [];
    if (stats.length === 0) continue;
    const gp = stats.reduce((s: number, x: any) => s + (x.gp ?? 0), 0);
    const minSum = stats.reduce((s: number, x: any) => s + (x.min ?? 0), 0);
    if (gp <= 10 || (gp > 0 && minSum / gp <= 12)) continue;
    perTimesMin += stats.reduce((s: number, x: any) => s + (x.per ?? 0) * (x.min ?? 0), 0);
    totalMin += minSum;
  }
  return totalMin > 0 ? perTimesMin / totalMin : 15; // 15 = classic NBA PER baseline
}

export function calcPlayerTV(player: NBAPlayer, mode: TeamMode, currentYear: number, ctx?: TVContext): number {
  const ovr = calcOvr2K(player);
  const pot = calcPot2K(player, currentYear);
  const age = player.born?.year ? currentYear - player.born.year : 26;

  const ovrBase = ovr >= 68 ? 10 : ovr >= 60 ? 3 : 0;
  const potBase = pot >= 68 ? 10 : pot >= 60 ? 3 : 0;
  // Flatter curve (exp 2.0) + higher scale (160) — 85-90 OVR players now sit
  // in real star territory instead of compressing near the role-player floor.
  // Ref: 87/87 contend = 140 TV (was 102); 94/94 contend = 245 TV (was 200).
  const ovrPart = ovrBase + Math.pow(Math.max(0, ovr - 68) / 31, 2.0) * 160;
  const potPart = potBase + Math.pow(Math.max(0, pot - 68) / 31, 2.0) * 160;

  let val: number;
  if (mode === 'rebuild')       val = Math.round(ovrPart * 0.6 + potPart * 1.4);
  else if (mode === 'contend')  val = Math.round(ovrPart * 1.4 + potPart * 0.6);
  else /* presti */              val = Math.round(ovrPart * 0.5 + potPart * 1.5);

  // Age nerf — minimal global decay. OVR already declines naturally with age in the
  // ratings engine, so a 41yo still sitting at 94 OVR is a genuine outlier (LeBron, KJ
  // types) and their TV should reflect that they're still elite. Start at 39, gentle decay, 72% floor.
  if (age >= 39) val = Math.round(val * Math.max(0.72, Math.pow(0.97, age - 38)));

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
      if (age >= 33)      val = Math.round(val * (isExpiring ? 0.55 : 0.28));
      else if (age >= 30) val = Math.round(val * (isExpiring ? 0.75 : 0.50));
      else if (age >= 28) val = Math.round(val * (isExpiring ? 0.92 : 0.75));
    } else if (ovr < 85) {
      // 80-84 OVR starters: gentler curve, still discount real graybeards.
      if (age >= 35)      val = Math.round(val * (isExpiring ? 0.70 : 0.50));
      else if (age >= 32) val = Math.round(val * (isExpiring ? 0.85 : 0.70));
    } else {
      // 85+ OVR stars: only the deepest twilight (37+) gets a small haircut.
      if (age >= 37) val = Math.round(val * 0.80);
    }
    // Prime-age stars are the literal foundation a rebuilder builds around — Herro
    // (26y/87 OVR signed through 2031), SGA-tier guys, etc. The rebuilder values
    // them MORE than a contender does because they ARE the timeline. Tiered:
    //   * 28+ stars → no bonus (they're just "good"; build-around timeline tightening)
    //   * 26-27 + 85+ OVR → moderate cornerstone premium (Herro tier)
    //   * ≤25 + 85+ OVR → strong cornerstone premium (true young stars)
    //   * ≤23 + 88+ POT → developmental-cornerstone premium
    if (age <= 25 && ovr >= 85)      val = Math.round(val * 1.30);
    else if (age <= 27 && ovr >= 86) val = Math.round(val * 1.20);
    else if (age <= 23 && pot >= 88) val = Math.round(val * 1.15);
  } else if (mode === 'contend') {
    // Contenders fairly value their veterans but slightly under-value pure projects
    // (need NOW production). Mild — they still see role-player upside, just not full.
    if (age <= 21 && ovr < 70 && isFutureMultiYear) val = Math.round(val * 0.85);
    // Toxic multi-year role-player vet contracts (34+, ovr<82, 2+yr deal) are a drag
    // for contenders trying to stay flexible. High-OVR stars are exempt — a 35yo 88
    // OVR is still a championship piece.
    if (age >= 34 && ovr < 82 && isFutureMultiYear) val = Math.round(val * 0.85);
  }

  // Walk-year stub: contract already past expiry (data lag). Flat half — keeps the
  // pre-existing safety net for malformed contract data.
  if (expYear <= currentYear) val = Math.round(val * 0.5);

  // In-season PER adjustment (marginal, regular-season only). Auto-resets on rollover:
  // once currentYear increments, the stats filter returns nothing → no boost applied.
  // Qualified: >10 GP AND >12 MPG this season. Capped at ±10%.
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
        const mult = 1 + Math.max(-0.10, Math.min(0.10, perDelta / 100));
        val = Math.round(val * mult);
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
    if (durability < 30)       val = Math.round(val * 0.65);
    else if (durability < 45)  val = Math.round(val * 0.75);
    else if (durability < 60)  val = Math.round(val * 0.85);
    else if (durability < 75)  val = Math.round(val * 0.93);
  }

  return Math.max(0, val);
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

/** NBA cap on cash sent in trades per team per season (USD). */
export const CASH_TRADE_CAP_USD = 7_500_000;

/** Convert cash USD into trade value units. ~1.5 TV per $1M (full $7.5M ≈ 11 TV — late 2nd-round-pick tier). */
export function calcCashTV(usd: number): number {
  if (!usd || usd <= 0) return 0;
  return Math.round((usd / 1_000_000) * 1.5);
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
  pick: { round: number; season: number; tid: number },
  ctx: PickValueContext,
): number {
  const yearsFromNow = Math.max(1, pick.season - ctx.currentYear);
  const rank = ctx.powerRanks.get(pick.tid) ?? Math.ceil(ctx.totalTeams / 2);
  const classStrength = ctx.classStrengthByYear?.get(pick.season) ?? 1.0;
  // Lottery slot applies ONLY for current-year round-1 picks whose owner is in the lottery.
  const actualSlot = pick.round === 1 && pick.season === ctx.currentYear
    ? ctx.lotterySlotByTid?.get(pick.tid)
    : undefined;
  return calcPickTV(pick.round, rank, ctx.totalTeams, yearsFromNow, { classStrength, actualSlot });
}

// ── Team mode ─────────────────────────────────────────────────────────────────

export function computeLeagueAvg(players: NBAPlayer[], teams: { id: number }[]): number {
  let total = 0, count = 0;
  teams.forEach(t => {
    const roster = players.filter(p => p.tid === t.id).sort((a, b) => b.overallRating - a.overallRating).slice(0, 8);
    if (roster.length > 0) {
      total += roster.reduce((s, p) => s + p.overallRating, 0) / roster.length;
      count++;
    }
  });
  return count > 0 ? total / count : 50;
}

export function getTeamMode(teamId: number, players: NBAPlayer[], leagueAvg: number): TeamMode {
  const roster = players.filter(p => p.tid === teamId).sort((a, b) => b.overallRating - a.overallRating).slice(0, 8);
  if (roster.length === 0) return 'rebuild';
  const avg = roster.reduce((s, p) => s + p.overallRating, 0) / roster.length;
  return avg >= leagueAvg ? 'contend' : 'rebuild';
}

// ── OVR colors (K2 scale) ─────────────────────────────────────────────────────

export function getOvrTailwind(v: number): { bg: string; text: string } {
  if (v >= 95) return { bg: 'bg-violet-900/50', text: 'text-violet-300' };
  if (v >= 90) return { bg: 'bg-blue-900/50',   text: 'text-blue-300'   };
  if (v >= 85) return { bg: 'bg-emerald-900/50', text: 'text-emerald-300' };
  if (v >= 78) return { bg: 'bg-amber-900/50',   text: 'text-amber-300'  };
  if (v >= 72) return { bg: 'bg-slate-700',       text: 'text-slate-300'  };
  return       { bg: 'bg-red-900/40',             text: 'text-red-300'    };
}

export function getPotColor(v: number): string {
  if (v >= 95) return 'text-violet-400';
  if (v >= 90) return 'text-blue-400';
  if (v >= 85) return 'text-emerald-400';
  if (v >= 78) return 'text-amber-400';
  if (v >= 72) return 'text-slate-400';
  return 'text-red-400';
}

// ── Salary match (NBA 125% rule) ─────────────────────────────────────────────

export function isSalaryLegal(salaryA: number, salaryB: number): boolean {
  if (salaryA === 0 && salaryB === 0) return true;
  if (salaryA === 0 || salaryB === 0) return true; // one-sided (pick-only side)
  return Math.max(salaryA, salaryB) <= Math.min(salaryA, salaryB) * 1.25 + 100; // +100 buffer (units = thousands)
}

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

  // 1. Find a player to fill the gap (exclude untouchables — they're off-limits)
  const available = players
    .filter(p => p.tid === targetTid && !usedIds.has(p.internalId) && !isUntouchable(p, modeWeak, currentYear))
    .map(p => ({ ...p, tv: calcPlayerTV(p, modeWeak, currentYear) }))
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
  const pickOpts = (pk: DraftPick) => ({
    classStrength: classStrengthByYear?.get(pk.season) ?? 1.0,
    actualSlot: pk.round === 1 && pk.season === currentYear
      ? lotterySlotByTid?.get(pk.originalTid)
      : undefined,
  });

  // Pick value follows ORIGINAL owner's record, not the current holder's.
  const fallbackRank = teamPowerRanks.get(targetTid) ?? Math.ceil(totalTeams / 2);
  const rankForPick = (originalTid: number) =>
    teamPowerRanks.get(originalTid) ?? fallbackRank;

  let picksAdded = 0;
  let safety = 0;
  while (gap > 2 && safety++ < 10 && picksAdded < 4) {
    const nextPick = availPicks[0];
    const yearsFromNow = Math.max(1, (nextPick?.season ?? currentYear + 1) - currentYear);
    const peekRank = nextPick ? rankForPick(nextPick.originalTid) : fallbackRank;
    const peekOpts = nextPick ? pickOpts(nextPick) : undefined;
    const pickVal = calcPickTV(1, peekRank, totalTeams, yearsFromNow, peekOpts);
    if (pickVal > gap + 12) break;

    const pick = availPicks.shift();
    if (!pick) {
      // Use generic future pick if no real pick available
      targetBasket.push({ id: `genpick-${safety}`, type: 'pick', label: `${currentYear + 1} 1st Round`, val: Math.min(gap, 11) });
      gap -= Math.min(gap, 11);
    } else {
      const val = calcPickTV(pick.round, rankForPick(pick.originalTid), totalTeams, pick.season - currentYear, pickOpts(pick));
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
