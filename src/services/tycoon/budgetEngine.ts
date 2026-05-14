import type { NBATeam } from '../../types';
import type { AnnualLedger, TycoonState } from '../../types/tycoon';
import { TIER_BASE } from './specs/spain';

export interface BudgetContext {
  year: number;
  endesaFinishPosition: number; // 1..18; 0 = saison läuft noch (live preview)
  euroleagueStage: 'final-four' | 'qf' | 'group' | 'none';
  euroleagueAwayGames: number;
  endesaPrizeEUR: number;
  euroleaguePrizeEUR: number;
  avgOpponentPrestige?: number;
}

function successMultiplier(ctx: BudgetContext): number {
  let m = 1.0;
  const pos = ctx.endesaFinishPosition;
  if (pos >= 1 && pos <= 4) m = 1.25;
  else if (pos >= 5 && pos <= 8) m = 1.10;
  else if (pos >= 9 && pos <= 14) m = 1.00;
  else if (pos >= 15) m = 0.85;
  // pos === 0 = season-in-progress, no multiplier bump
  if (ctx.euroleagueStage === 'final-four') m += 0.20;
  else if (ctx.euroleagueStage === 'qf') m += 0.10;
  else if (ctx.euroleagueStage === 'group') m += 0.05;
  return m;
}

function averageAttendancePct(tier: TycoonState['tier'], success: number): number {
  const floor: Record<TycoonState['tier'], number> = { S: 0.85, A: 0.75, B: 0.65, C: 0.55, D: 0.45 };
  return Math.min(0.99, floor[tier] * success);
}

function wagesEUR(team: NBATeam, allPlayers?: any[]): number {
  // contract.amount in BBGM-thousands; × 1000 = USD; treated as EUR 1:1 in Euro mode
  const players = allPlayers ?? (team as any).players ?? [];
  const tid = (team as any).tid ?? team.id;
  const total = players
    .filter((p: any) => p.tid === tid)
    .reduce((sum: number, p: any) => sum + ((p.contract?.amount ?? 0) * 1000), 0);
  return Math.round(total);
}

export function computeAnnualBudget(team: NBATeam, ctx: BudgetContext, allPlayers?: any[]): AnnualLedger {
  const t = team.tycoon;
  if (!t) throw new Error(`Team ${team.name} has no tycoon state`);
  const tb = TIER_BASE[t.tier];
  const success = successMultiplier(ctx);

  const attendancePct = averageAttendancePct(t.tier, success);
  const matchday = Math.round(t.facilities.stadium.capacity * attendancePct * tb.ticketPrice * 30);

  const slotRev = (slot: 'kit' | 'sleeve' | 'stadium'): number => {
    const s = t.sponsorships[slot];
    if (s) return s.valuePerYear;
    return Math.round(tb.sponsorshipFloor[slot] * 0.5);
  };
  const sponsorship = slotRev('kit') + slotRev('sleeve') + slotRev('stadium');

  const prize = (ctx.endesaPrizeEUR ?? 0) + (ctx.euroleaguePrizeEUR ?? 0);
  const tv = tb.tvRevenue;
  const transfer = 0;

  const wages = wagesEUR(team, allPlayers);
  const staff = Math.round(wages * 0.10);
  const facilityLevelSum = t.facilities.stadium.level + t.facilities.trainingCenter.level + t.facilities.academy.level;
  const facility = facilityLevelSum * tb.facilityOpsPerLevel;
  const scouting = tb.scoutingBudget;
  const travel = tb.travelBase + (ctx.euroleagueAwayGames * 40_000);
  const financeCosts = t.cashOnHand < 0 ? Math.round(Math.abs(t.cashOnHand) * 0.05) : 0;

  const profit = Math.round(matchday + sponsorship + prize + tv + transfer
               - wages - staff - facility - scouting - travel - financeCosts);

  return {
    year: ctx.year,
    revenue: { matchday, sponsorship, prize, tv, transfer },
    expenses: { wages, staff, facility, scouting, travel, financeCosts },
    profit,
    cashOnHandEnd: t.cashOnHand + profit,
    ffpDeficitContribution: Math.min(profit, 0),
  };
}
