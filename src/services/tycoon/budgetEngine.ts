import type { NBATeam } from '../../types';
import type { AnnualLedger, TycoonState } from '../../types/tycoon';
import { TIER_BASE } from './specs/spain';
import { academyBudgetCostEUR, fallbackStaffPayrollEUR, sumStaffPayrollEUR } from './economyScale';

export interface BudgetContext {
  year: number;
  endesaFinishPosition: number; // 1..18; 0 = saison läuft noch (live preview)
  euroleagueStage: 'final-four' | 'qf' | 'group' | 'none';
  euroleagueAwayGames: number;
  endesaPrizeEUR: number;
  euroleaguePrizeEUR: number;
  avgOpponentPrestige?: number;
}

function estimateTravelCost(
  prefs: { hotel: number; flight: number; bus: number },
  domesticAwayGames: number,
  euroleagueAwayGames: number,
): number {
  const key = (v: number) => v.toFixed(1);
  const hotelPrice: Record<string, number> = {
    '0.5': 1_500, '1.0': 2_500, '1.5': 4_000, '2.0': 6_000, '2.5': 8_000,
    '3.0': 10_000, '3.5': 13_000, '4.0': 16_000, '4.5': 22_000, '5.0': 30_000,
  };
  const flightPrice: Record<string, number> = {
    '0.5': 4_000, '1.0': 7_000, '1.5': 12_000, '2.0': 18_000, '2.5': 28_000,
    '3.0': 40_000, '3.5': 70_000, '4.0': 110_000, '4.5': 160_000, '5.0': 220_000,
  };
  const busPrice: Record<string, number> = {
    '0.5': 400, '1.0': 700, '1.5': 1_100, '2.0': 1_700, '2.5': 2_400,
    '3.0': 3_500, '3.5': 5_000, '4.0': 7_500, '4.5': 11_000, '5.0': 16_000,
  };
  const totalAway = domesticAwayGames + euroleagueAwayGames;
  const flightGames = Math.max(domesticAwayGames, euroleagueAwayGames);
  return Math.round(
    (hotelPrice[key(prefs.hotel)] ?? 0) * totalAway
    + (flightPrice[key(prefs.flight)] ?? 0) * flightGames
    + (busPrice[key(prefs.bus)] ?? 0) * domesticAwayGames,
  );
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
  const players = allPlayers ?? (team as any).players ?? [];
  const tid = (team as any).tid ?? team.id;
  return players
    .filter((p: any) => p.tid === tid)
    .reduce((sum: number, p: any) => sum + ((p.contract?.amount ?? 0) * 1000), 0);
}

export function computeAnnualBudget(team: NBATeam, ctx: BudgetContext, allPlayers?: any[]): AnnualLedger {
  const t = team.tycoon;
  if (!t) throw new Error(`Team ${team.name} has no tycoon state`);
  const tb = TIER_BASE[t.tier];
  const success = successMultiplier(ctx);

  const ticketMult = Math.max(0.5, Math.min(2.0, t.ticketPriceMultiplier ?? 1));
  const ticketDemand = Math.max(0.72, Math.min(1.12, 1.06 - (ticketMult - 1) * 0.18));
  const attendancePct = Math.min(0.99, averageAttendancePct(t.tier, success) * ticketDemand);
  const capacity = (t.facilities?.stadium as any)?.capacity ?? tb.stadiumCapacity;
  const matchday = Math.round(capacity * attendancePct * tb.ticketPrice * ticketMult * 30);

  const slotRev = (slot: 'kit' | 'sleeve' | 'stadium'): number => {
    const s = t.sponsorships?.[slot];
    if (s) return s.valuePerYear;
    return Math.round(tb.sponsorshipFloor[slot] * 0.5);
  };
  // Euroleague exposure boosts kit/sleeve/stadium sponsor values — sponsors
  // pay more when the club's logo gets continental TV minutes.
  const elSponsorMult = ctx.euroleagueStage === 'final-four' ? 1.45
                      : ctx.euroleagueStage === 'qf'         ? 1.30
                      : ctx.euroleagueStage === 'group'      ? 1.20
                                                             : 1.00;
  const sponsorship = Math.round((slotRev('kit') + slotRev('sleeve') + slotRev('stadium')) * elSponsorMult);

  const prize = (ctx.endesaPrizeEUR ?? 0) + (ctx.euroleaguePrizeEUR ?? 0);

  // TV split:
  //   - Domestic Endesa TV pool — tier-base floor
  //   - Euroleague TV/market pool when participating. Real life: ~€600K
  //     base + market-pool bonus, deeper runs earn substantially more.
  const elTvBonus = ctx.euroleagueStage === 'final-four' ? 4_500_000
                  : ctx.euroleagueStage === 'qf'         ? 2_800_000
                  : ctx.euroleagueStage === 'group'      ? 1_400_000
                                                         : 0;
  const tv = tb.tvRevenue + elTvBonus;
  const transfer = 0;

  const wages = wagesEUR(team, allPlayers);
  const staff = sumStaffPayrollEUR({
    ...t,
    staffMembers: (t.staffMembers ?? []).map(member => ({
      ...member,
      salary: member.salary,
    })),
  } as any, 'euro') || fallbackStaffPayrollEUR(wages);
  const facilityLevelSum = (t.facilities?.stadium?.level ?? 1)
    + (t.facilities?.trainingCenter?.level ?? 1)
    + (t.facilities?.academy?.level ?? 1);
  const facility = facilityLevelSum * tb.facilityOpsPerLevel;
  const scouting = t.scoutingInvestment ?? tb.scoutingBudget;
  const medical = t.medicalBudget ?? 0;
  const academy = academyBudgetCostEUR(t.academyBudget, t.tier);
  const travelPrefs = t.travelPreferences;
  const travel = travelPrefs
    ? estimateTravelCost(travelPrefs, 17, ctx.euroleagueAwayGames)
    : tb.travelBase + (ctx.euroleagueAwayGames * 40_000);
  const cash = t.cashOnHand ?? 0;
  const financeCosts = cash < 0 ? Math.round(Math.abs(cash) * 0.05) : 0;

  const profit = Math.round(matchday + sponsorship + prize + tv + transfer
               - wages - staff - facility - scouting - travel - medical - academy - financeCosts);

  return {
    year: ctx.year,
    revenue: { matchday, sponsorship, prize, tv, transfer },
    expenses: { wages, staff, facility, scouting, travel, medical, academy, financeCosts },
    profit,
    cashOnHandEnd: cash + profit,
    ffpDeficitContribution: Math.min(profit, 0),
  };
}

export function projectYearEndCash(team: NBATeam, ctx: BudgetContext, plannedSpendEUR = 0, players?: any[]): number {
  const tycoon = team.tycoon;
  if (!tycoon) return 0;
  const ledger = computeAnnualBudget(team, ctx, players);
  return Math.round((tycoon.cashOnHand ?? 0) + ledger.profit - plannedSpendEUR);
}
