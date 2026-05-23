export function getTradeValueFloor(anchor: number, max = 10, ratio = 0.1, min = 0.5): number {
  const safe = Math.max(0, anchor);
  if (safe === 0) return 0;
  return Math.max(min, Math.min(max, safe * ratio));
}

export function getTradeGapTolerance(anchor: number): number {
  return Math.max(0.35, Math.min(2, Math.max(0, anchor) * 0.04));
}

export function getTradeCandidateFloor(anchor: number): number {
  return Math.max(0.25, Math.min(5, Math.max(0, anchor) * 0.05));
}

export function getTradeOvershootMargin(anchor: number, maxMargin = 30, minMargin = 6): number {
  return Math.max(minMargin, Math.min(maxMargin, Math.max(0, anchor) * 0.3));
}

export function getTradeRatioThreshold(totalVal: number): number {
  if (totalVal >= 300) return 1.30;
  if (totalVal >= 200) return 1.35;
  if (totalVal >= 100) return 1.40;
  return 1.45;
}

export const CASH_TRADE_CAP_USD = 7_500_000;

export function calcCashTV(usd: number): number {
  if (!usd || usd <= 0) return 0;
  return Number((((usd / 1_000_000) * 1.5)).toFixed(2));
}

export function getOvrTailwind(v: number): { bg: string; text: string } {
  if (v >= 95) return { bg: 'bg-violet-900/50', text: 'text-violet-300' };
  if (v >= 90) return { bg: 'bg-blue-900/50', text: 'text-blue-300' };
  if (v >= 85) return { bg: 'bg-emerald-900/50', text: 'text-emerald-300' };
  if (v >= 78) return { bg: 'bg-amber-900/50', text: 'text-amber-300' };
  if (v >= 72) return { bg: 'bg-slate-700', text: 'text-slate-300' };
  return { bg: 'bg-red-900/40', text: 'text-red-300' };
}

export function getPotColor(v: number): string {
  if (v >= 95) return 'text-violet-400';
  if (v >= 90) return 'text-blue-400';
  if (v >= 85) return 'text-emerald-400';
  if (v >= 78) return 'text-amber-400';
  if (v >= 72) return 'text-slate-400';
  return 'text-red-400';
}

export function computeLeagueAvg(players: Array<{ tid: number; overallRating: number }>, teams: { id: number }[]): number {
  let total = 0;
  let count = 0;
  teams.forEach((team) => {
    const roster = players.filter((player) => player.tid === team.id).sort((a, b) => b.overallRating - a.overallRating).slice(0, 8);
    if (roster.length > 0) {
      total += roster.reduce((sum, player) => sum + player.overallRating, 0) / roster.length;
      count++;
    }
  });
  return count > 0 ? total / count : 50;
}

export function getTeamMode(teamId: number, players: Array<{ tid: number; overallRating: number }>, leagueAvg: number): 'contend' | 'rebuild' {
  const roster = players.filter((player) => player.tid === teamId).sort((a, b) => b.overallRating - a.overallRating).slice(0, 8);
  if (roster.length === 0) return 'rebuild';
  const avg = roster.reduce((sum, player) => sum + player.overallRating, 0) / roster.length;
  return avg >= leagueAvg ? 'contend' : 'rebuild';
}

export function isSalaryLegal(salaryA: number, salaryB: number): boolean {
  if (salaryA === 0 && salaryB === 0) return true;
  if (salaryA === 0 || salaryB === 0) return true;
  return Math.max(salaryA, salaryB) <= Math.min(salaryA, salaryB) * 1.25 + 100;
}
