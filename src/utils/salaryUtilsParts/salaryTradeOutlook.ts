import type { NBAPlayer, NBATeam, TeamStatus } from '../../types';
import { convertTo2KRating } from '../helpers';
import { resolveBirdRights } from '../playerBirdRights';
import type { CapThresholds } from './salaryCapUtils';

export function effectiveRecord(team: any, currentYear: number): { wins: number; losses: number } {
  const wins = team.wins ?? 0;
  const losses = team.losses ?? 0;
  if (wins + losses >= 10) return { wins, losses };
  const lastSeason = (team.seasons as any[] | undefined)?.find(s => s.season === currentYear - 1);
  if (lastSeason && (lastSeason.won + lastSeason.lost) > 0) {
    return { wins: lastSeason.won, losses: lastSeason.lost };
  }
  return { wins, losses };
}

export type TradeRole = 'heavy_buyer' | 'buyer' | 'neutral' | 'seller' | 'rebuilding';

export interface TradeOutlook {
  role: TradeRole;
  label: string;
  color: string;
  bgColor: string;
  dot: string;
  reason: string;
}

const MANUAL_STATUS_OUTLOOK: Record<TeamStatus, TradeOutlook> = {
  contending: { role: 'heavy_buyer', label: 'Contending', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: 'Manual' },
  win_now: { role: 'buyer', label: 'Win-Now', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: 'Manual' },
  play_in_push: { role: 'buyer', label: 'Play-In Push', color: 'text-sky-300', bgColor: 'bg-sky-500/15', dot: '#7dd3fc', reason: 'Manual' },
  retooling: { role: 'seller', label: 'Retooling', color: 'text-amber-400', bgColor: 'bg-amber-500/20', dot: '#fbbf24', reason: 'Manual' },
  cap_clearing: { role: 'seller', label: 'Cap Clearing', color: 'text-orange-300', bgColor: 'bg-orange-500/20', dot: '#fdba74', reason: 'Manual' },
  rebuilding: { role: 'rebuilding', label: 'Rebuilding', color: 'text-purple-400', bgColor: 'bg-purple-500/20', dot: '#c084fc', reason: 'Manual' },
  development: { role: 'rebuilding', label: 'Development', color: 'text-fuchsia-300', bgColor: 'bg-fuchsia-500/15', dot: '#f0abfc', reason: 'Manual' },
};

export const MANUAL_STATUS_LABEL: Record<TeamStatus, string> = {
  contending: 'Contending',
  win_now: 'Win-Now',
  play_in_push: 'Play-In Push',
  retooling: 'Retooling',
  cap_clearing: 'Cap Clearing',
  rebuilding: 'Rebuilding',
  development: 'Development',
};

export function manualStatusOutlook(status: TeamStatus): TradeOutlook {
  return MANUAL_STATUS_OUTLOOK[status];
}

export function resolveManualOutlook(
  team: Pick<NBATeam, 'id' | 'manualTeamStatus'>,
  gameMode: string | undefined,
  userTeamId: number | undefined | null,
): TradeOutlook | undefined {
  if (gameMode !== 'gm') return undefined;
  if (userTeamId == null || team.id !== userTeamId) return undefined;
  if (!team.manualTeamStatus) return undefined;
  return MANUAL_STATUS_OUTLOOK[team.manualTeamStatus];
}

export function topNAvgK2(players: NBAPlayer[], teamId: number, n = 3): number {
  const roster = players.filter(p => p.tid === teamId);
  if (roster.length === 0) return 0;
  const sorted = roster.slice().sort((a, b) => {
    const aLast = (a as any).ratings?.[(a as any).ratings?.length - 1];
    const bLast = (b as any).ratings?.[(b as any).ratings?.length - 1];
    const aOvr = aLast?.ovr ?? a.overallRating ?? 0;
    const bOvr = bLast?.ovr ?? b.overallRating ?? 0;
    return bOvr - aOvr;
  });
  const top = sorted.slice(0, n);
  const sum = top.reduce((acc, p) => {
    const last = (p as any).ratings?.[(p as any).ratings?.length - 1];
    return acc + convertTo2KRating(last?.ovr ?? p.overallRating ?? 0, last?.hgt ?? 50, last?.tp ?? 50);
  }, 0);
  return sum / top.length;
}

export function hasBirdRights(player: NBAPlayer): boolean {
  return resolveBirdRights(player);
}

export function leagueAvgTopNK2(players: NBAPlayer[], teams: { id: number }[], n = 3): number {
  if (teams.length === 0) return 0;
  const sum = teams.reduce((s, t) => s + topNAvgK2(players, t.id, n), 0);
  return sum / teams.length;
}

export const getTradeOutlook = (
  payrollUSD: number,
  wins: number,
  losses: number,
  expiringCount: number,
  thresholds: CapThresholds,
  confRank?: number,
  gbFromLeader?: number,
  topThreeAvgK2?: number,
  leagueTopAvgK2?: number,
): TradeOutlook => {
  const gp = wins + losses || 1;
  const winPct = wins / gp;
  const capSpace = thresholds.salaryCap - payrollUSD;
  const isOverTax = payrollUSD >= thresholds.luxuryTax;

  if (topThreeAvgK2 !== undefined && leagueTopAvgK2 !== undefined) {
    const talentDelta = topThreeAvgK2 - leagueTopAvgK2;
    if (winPct < 0.35) return { role: 'rebuilding', label: 'Rebuilding', color: 'text-purple-400', bgColor: 'bg-purple-500/20', dot: '#c084fc', reason: '' };
    if (winPct < 0.42) {
      return talentDelta >= 3
        ? { role: 'seller', label: 'Underperforming', color: 'text-orange-400', bgColor: 'bg-orange-500/20', dot: '#fb923c', reason: '' }
        : { role: 'neutral', label: 'Mid', color: 'text-slate-400', bgColor: 'bg-slate-700/40', dot: '#94a3b8', reason: '' };
    }
    if (winPct >= 0.55) {
      return talentDelta >= 2
        ? { role: 'heavy_buyer', label: 'Contending', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: '' }
        : { role: 'buyer', label: 'Overachieving', color: 'text-sky-400', bgColor: 'bg-sky-500/20', dot: '#38bdf8', reason: '' };
    }
    if (payrollUSD >= thresholds.secondApron) {
      return { role: 'seller', label: 'Retooling', color: 'text-amber-400', bgColor: 'bg-amber-500/20', dot: '#fbbf24', reason: '' };
    }
    return { role: 'neutral', label: 'Mid', color: 'text-slate-400', bgColor: 'bg-slate-700/40', dot: '#94a3b8', reason: '' };
  }

  if (topThreeAvgK2 !== undefined && topThreeAvgK2 >= 88) {
    return { role: 'heavy_buyer', label: 'Contending', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: '' };
  }

  const inPlayoffs = confRank !== undefined && confRank <= 6;
  const inPlayIn = confRank !== undefined && confRank >= 7 && confRank <= 10;
  const outsidePlayIn = confRank !== undefined && confRank > 10;
  const farBehind = gbFromLeader !== undefined && gbFromLeader >= 10;
  const veryFarBehind = gbFromLeader !== undefined && gbFromLeader >= 15;

  if (confRank !== undefined && confRank <= 3 && capSpace > 5_000_000) {
    return { role: 'heavy_buyer', label: 'Contending', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: '' };
  }
  if (inPlayoffs && (capSpace > 2_000_000 || payrollUSD < thresholds.luxuryTax)) {
    return { role: 'buyer', label: 'Contending', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: '' };
  }
  if (inPlayIn && (capSpace > 3_000_000 || payrollUSD < thresholds.luxuryTax - 5_000_000)) {
    return { role: 'buyer', label: 'Contending', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: '' };
  }
  if (veryFarBehind || (outsidePlayIn && farBehind)) {
    return { role: 'rebuilding', label: 'Rebuilding', color: 'text-purple-400', bgColor: 'bg-purple-500/20', dot: '#c084fc', reason: '' };
  }
  if (outsidePlayIn && isOverTax) {
    return { role: 'seller', label: 'Seller', color: 'text-rose-400', bgColor: 'bg-rose-500/20', dot: '#f87171', reason: '' };
  }
  if (winPct >= 0.55 && (capSpace > 5_000_000 || payrollUSD < thresholds.luxuryTax)) {
    return { role: 'heavy_buyer', label: 'Contending', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: '' };
  }
  if (winPct >= 0.48 && (capSpace > 0 || payrollUSD < thresholds.luxuryTax)) {
    return { role: 'buyer', label: 'Contending', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: '' };
  }
  if (winPct < 0.35 || (winPct < 0.42 && expiringCount >= 3)) {
    return { role: 'rebuilding', label: 'Rebuilding', color: 'text-purple-400', bgColor: 'bg-purple-500/20', dot: '#c084fc', reason: '' };
  }
  if (winPct < 0.46 && isOverTax) {
    return { role: 'seller', label: 'Seller', color: 'text-rose-400', bgColor: 'bg-rose-500/20', dot: '#f87171', reason: '' };
  }
  return { role: 'neutral', label: 'Neutral', color: 'text-slate-400', bgColor: 'bg-slate-700/40', dot: '#94a3b8', reason: '' };
};
