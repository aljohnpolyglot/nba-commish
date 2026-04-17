/**
 * tradeValueEngine.ts
 *
 * Pure trade-value calculation functions — no React, no game state.
 * Used by TradeFinderView and AITradeHandler for consistent valuations.
 */

import type { NBAPlayer, DraftPick } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';

export type TeamMode = 'contend' | 'rebuild' | 'presti';

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

export function calcPlayerTV(player: NBAPlayer, mode: TeamMode, currentYear: number): number {
  const ovr = calcOvr2K(player);
  const pot = calcPot2K(player, currentYear);
  const age = player.born?.year ? currentYear - player.born.year : 26;

  const ovrBase = ovr >= 68 ? 10 : ovr >= 60 ? 3 : 0;
  const potBase = pot >= 68 ? 10 : pot >= 60 ? 3 : 0;
  const ovrPart = ovrBase + Math.pow(Math.max(0, ovr - 68) / 31, 2.5) * 140;
  const potPart = potBase + Math.pow(Math.max(0, pot - 68) / 31, 2.5) * 140;

  let val: number;
  if (mode === 'rebuild')       val = Math.round(ovrPart * 0.6 + potPart * 1.4);
  else if (mode === 'contend')  val = Math.round(ovrPart * 1.4 + potPart * 0.6);
  else /* presti */              val = Math.round(ovrPart * 0.5 + potPart * 1.5);

  if (age >= 35) val = Math.round(val * Math.pow(0.75, age - 34));
  if ((player.contract?.exp ?? currentYear + 1) <= currentYear) val = Math.round(val * 0.5);

  return Math.max(0, val);
}

// ── Pick value (power-ranking aware) ─────────────────────────────────────────
//
// teamPowerRank: 1 = best (→ late pick ~8 TV), totalTeams = worst (→ lottery ~28 TV)
// yearsFromNow: 1 = next draft, 2 = +2, 3+ = flat/stale

export function calcPickTV(round: number, teamPowerRank: number, totalTeams: number, yearsFromNow: number): number {
  if (round === 2) {
    // 2nd rounders: small exponential curve (pick #31 ≈ 6TV, pick #60 ≈ 1TV)
    // teamPowerRank inversely maps to slot: worst team picks ~31, best ~60
    const rankPct2 = totalTeams > 1 ? (teamPowerRank - 1) / (totalTeams - 1) : 0.5; // 0=best, 1=worst
    const slot2 = Math.round(31 + rankPct2 * 29); // 31 (lottery team) → 60 (contender)
    const base2 = Math.max(1, Math.round(6 * Math.exp(-0.05 * (slot2 - 31))));
    if (yearsFromNow <= 1) return base2;
    return Math.max(1, Math.round(base2 * 0.6));
  }

  // 1st round: exponential decay — slot 1 ≈ 50TV, slot 5 ≈ 32TV, slot 15 ≈ 16TV, slot 30 ≈ 8TV
  // Invert rank: worst team (rank = totalTeams) → earliest pick (slot 1)
  const rankPct = totalTeams > 1 ? (teamPowerRank - 1) / (totalTeams - 1) : 0.5; // 0=best, 1=worst
  const estimatedSlot = Math.round(1 + (1 - rankPct) * 29); // 1 (worst team) → 30 (best team)
  const nextYearBase = Math.round(50 * Math.exp(-0.065 * (estimatedSlot - 1)));

  if (yearsFromNow <= 1) return nextYearBase;
  // 2yr out: elite picks retain more value; don't collapse to flat 11
  if (yearsFromNow === 2) return Math.max(11, Math.round(nextYearBase * 0.60));
  return 11; // 3+ years: everyone flat, too uncertain
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

  // 1. Find a player to fill the gap
  const available = players
    .filter(p => p.tid === targetTid && !usedIds.has(p.internalId))
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

  let picksAdded = 0;
  let safety = 0;
  while (gap > 2 && safety++ < 10 && picksAdded < 4) {
    const yearsFromNow = Math.max(1, (availPicks[0]?.season ?? currentYear + 1) - currentYear);
    const rank = teamPowerRanks.get(targetTid) ?? Math.ceil(totalTeams / 2);
    const pickVal = calcPickTV(1, rank, totalTeams, yearsFromNow);
    if (pickVal > gap + 12) break;

    const pick = availPicks.shift();
    if (!pick) {
      // Use generic future pick if no real pick available
      targetBasket.push({ id: `genpick-${safety}`, type: 'pick', label: `${currentYear + 1} 1st Round`, val: Math.min(gap, 11) });
      gap -= Math.min(gap, 11);
    } else {
      targetBasket.push({
        id: String(pick.dpid),
        type: 'pick',
        label: `${pick.season} ${pick.round === 1 ? '1st' : '2nd'} Round`,
        val: calcPickTV(pick.round, rank, totalTeams, pick.season - currentYear),
        pick,
      });
      gap -= calcPickTV(pick.round, rank, totalTeams, pick.season - currentYear);
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
