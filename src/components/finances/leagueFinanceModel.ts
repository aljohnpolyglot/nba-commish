import type { GameState, NBAPlayer, NBATeam } from '../../types';
import type { TycoonState, TycoonTier } from '../../types/tycoon';
import { buildBudgetContext, computeAnnualBudget, getEuroFinanceProjectionReadiness } from '../../services/tycoon/budgetEngine';
import { academyBudgetCostEUR, resolveStaffMarketForTeam, sumStaffPayroll } from '../../services/tycoon/economyScale';
import { getTierForClub, TIER_BASE } from '../../services/tycoon/specs/spain';
import {
  ensureFranchiseOperations,
  isJerseyPatchAvailable,
} from '../../services/franchises/franchiseState';
import { getFranchiseMatchdayProjection } from '../../services/franchises/franchiseMatchday';
import { getFranchiseSponsorRevenue } from '../../services/franchises/franchiseSponsors';

export interface FinanceTeamLike {
  tid?: number;
  id?: number;
  name: string;
  region?: string;
  abbrev?: string;
  imgURL?: string;
  logoUrl?: string;
  league?: string;
  conference?: string;
  tycoon?: TycoonState;
}

export interface FinanceRow {
  team: FinanceTeamLike;
  cashAvailable: boolean;
  cashOnHand: number;
  projectedCash: number;
  matchday: number;
  sponsorship: number;
  tv: number;
  otherRevenue: number;
  totalRev: number;
  wages: number;
  staff: number;
  facility: number;
  scouting: number;
  travel: number;
  medical: number;
  academy: number;
  transferFees: number;
  financeCosts: number;
  totalExp: number;
  profit: number;
  wageRevPct: number;
  pending: Partial<Record<'matchday' | 'sponsorship' | 'tv' | 'travel' | 'profit', boolean>>;
  health: { label: string; tone: 'pending' | 'excellent' | 'good' | 'stable' | 'risk' | 'critical' };
}

export const getFinanceTeamId = (team: FinanceTeamLike): number => team.tid ?? team.id ?? -1;
export const getFinanceTeamLogo = (team: FinanceTeamLike): string | undefined => team.imgURL ?? team.logoUrl;

function classifyHealth(profit: number, projectedCash: number, totalExpenses: number): FinanceRow['health'] {
  const monthlyExpenses = Math.max(1, totalExpenses / 12);
  if (projectedCash < 0 || projectedCash < monthlyExpenses * 0.5) return { label: 'Critical', tone: 'critical' };
  if (projectedCash < monthlyExpenses * 2) return { label: 'At Risk', tone: 'risk' };
  if (profit < 0 || projectedCash < monthlyExpenses * 5) return { label: 'Stable', tone: 'stable' };
  if (profit < totalExpenses * 0.15) return { label: 'Good', tone: 'good' };
  return { label: 'Excellent', tone: 'excellent' };
}

function classifyProfitHealth(profit: number, euroToLocalRate: number): FinanceRow['health'] {
  const scale = Math.max(0.05, euroToLocalRate);
  if (profit < -1_000_000 * scale) return { label: 'Critical', tone: 'critical' };
  if (profit < 250_000 * scale) return { label: 'At Risk', tone: 'risk' };
  if (profit < 1_000_000 * scale) return { label: 'Stable', tone: 'stable' };
  if (profit < 10_000_000 * scale) return { label: 'Good', tone: 'good' };
  return { label: 'Excellent', tone: 'excellent' };
}

export function buildLeagueFinanceRow(
  team: FinanceTeamLike,
  players: NBAPlayer[],
  state: GameState | undefined,
  contractCurrencyRate: number,
): FinanceRow {
  const tycoon = team.tycoon;
  const tid = getFinanceTeamId(team);
  const staffMarket = resolveStaffMarketForTeam(team);
  const hasEuroFinanceState = staffMarket === 'euro' && Boolean(tycoon?.tier && tycoon?.facilities);
  const ledger = hasEuroFinanceState && tycoon && state
    ? computeAnnualBudget(team as NBATeam, buildBudgetContext(state, tid), players)
    : hasEuroFinanceState ? tycoon?.ledgerHistory?.[tycoon.ledgerHistory.length - 1] : undefined;
  const liveWages = players
    .filter(player => player.tid === tid)
    .reduce((total, player) => total + Number(player.contract?.amount ?? 0) * 1_000 * contractCurrencyRate, 0);

  let matchday = 0;
  let sponsorship = 0;
  let tv = 0;
  let otherRevenue = 0;
  let wages = 0;
  let staff = 0;
  let facility = 0;
  let scouting = 0;
  let travel = 0;
  let medical = 0;
  let academy = 0;
  let transferFees = 0;
  let financeCosts = 0;

  if (ledger) {
    matchday = ledger.revenue.matchday ?? 0;
    sponsorship = ledger.revenue.sponsorship ?? 0;
    tv = ledger.revenue.tv ?? 0;
    otherRevenue = (ledger.revenue.commercial ?? 0) + (ledger.revenue.prize ?? 0) + (ledger.revenue.transfer ?? 0);
    wages = ledger.expenses.wages ?? liveWages;
    staff = sumStaffPayroll(tycoon, staffMarket) || (ledger.expenses.staff ?? 0);
    facility = ledger.expenses.facility ?? 0;
    scouting = ledger.expenses.scouting ?? 0;
    travel = ledger.expenses.travel ?? 0;
    medical = ledger.expenses.medical ?? 0;
    academy = ledger.expenses.academy ?? 0;
    transferFees = ledger.expenses.transfer ?? 0;
    financeCosts = ledger.expenses.financeCosts ?? 0;
  } else {
    wages = liveWages;
    const nbaTeam = state && team.id != null
      ? state.teams.find(candidate => candidate.id === team.id)
      : undefined;
    const franchise = state && nbaTeam
      ? ensureFranchiseOperations(state, nbaTeam)
      : undefined;
    const savedTier = hasEuroFinanceState ? tycoon?.tier : undefined;
    const lookupTier = hasEuroFinanceState
      ? getTierForClub(team.name || team.region || '')
      : undefined;
    const tier: TycoonTier | undefined = savedTier ?? lookupTier;
    const tierBase = tier ? TIER_BASE[tier] : undefined;

    sponsorship = franchise
      ? getFranchiseSponsorRevenue(franchise, state!.leagueStats.year, isJerseyPatchAvailable(state!.leagueStats))
      : Object.values(tycoon?.sponsorships ?? {})
        .reduce((total, slot) => total + Number(slot?.valuePerYear ?? 0), 0);
    if (
      tierBase
      && lookupTier
      && lookupTier !== savedTier
      && sponsorship < TIER_BASE[lookupTier].sponsorshipFloor.kit * 0.3
    ) {
      const floor = TIER_BASE[lookupTier].sponsorshipFloor;
      sponsorship = Math.round((floor.kit + floor.sleeve + floor.stadium) * 0.7);
    }
    if (sponsorship === 0) sponsorship = Math.round(wages * 0.7);
    tv = tierBase ? tierBase.tvRevenue : Math.round(wages * 0.4);

    if (tierBase && lookupTier) {
      const savedCapacity = tycoon?.facilities?.stadium?.capacity;
      const expectedCapacity = TIER_BASE[lookupTier].stadiumCapacity;
      const capacity = savedCapacity && savedCapacity >= expectedCapacity * 0.6
        ? savedCapacity
        : expectedCapacity;
      const fillFloor: Record<TycoonTier, number> = { S: 0.85, A: 0.75, B: 0.65, C: 0.55, D: 0.45 };
      const context = state ? buildBudgetContext(state, tid) : undefined;
      matchday = Math.round(
        capacity
        * fillFloor[tier!]
        * tierBase.ticketPrice
        * (context?.scheduledHomeGames ?? 15)
        * (context?.economyIndex ?? 1),
      );
    } else if (franchise && state && nbaTeam) {
      matchday = getFranchiseMatchdayProjection(state, nbaTeam, franchise).annualMatchdayRevenue;
    } else {
      matchday = Math.round(wages * 0.32);
    }

    staff = sumStaffPayroll(tycoon, staffMarket) || Math.round(wages * 0.1);
    const facilityLevels = (tycoon?.facilities?.stadium?.level ?? 1)
      + (tycoon?.facilities?.trainingCenter?.level ?? 1)
      + (tycoon?.facilities?.academy?.level ?? 1);
    facility = tierBase ? facilityLevels * tierBase.facilityOpsPerLevel : Math.round(wages * 0.07);
    scouting = tycoon?.scoutingInvestment || (tierBase ? tierBase.scoutingBudget : Math.round(wages * 0.04));
    travel = tierBase ? tierBase.travelBase : Math.round(wages * 0.06);
    medical = tycoon?.medicalBudget || Math.round(wages * 0.06);
    academy = hasEuroFinanceState
      ? academyBudgetCostEUR(tycoon?.academyBudget, tier, tycoon?.currentEconomyIndex ?? 1)
      : 0;
  }

  const readiness = hasEuroFinanceState && state
    ? getEuroFinanceProjectionReadiness(state, tid)
    : { matchday: true, sponsorship: true, mediaRights: true, travel: true };
  const pending: FinanceRow['pending'] = {};
  if (!readiness.matchday) {
    matchday = 0;
    pending.matchday = true;
  }
  if (!readiness.sponsorship) {
    sponsorship = 0;
    pending.sponsorship = true;
  }
  if (!readiness.mediaRights) {
    tv = 0;
    pending.tv = true;
  }
  if (!readiness.travel) {
    travel = 0;
    pending.travel = true;
  }
  pending.profit = Object.keys(pending).length > 0;

  const totalRev = matchday + sponsorship + tv + otherRevenue;
  const totalExp = wages + staff + facility + scouting + travel + medical + academy + transferFees + financeCosts;
  const profit = totalRev - totalExp;
  const cashAvailable = Boolean(tycoon && Number.isFinite(Number(tycoon.cashOnHand)));
  const cashOnHand = cashAvailable ? Number(tycoon?.cashOnHand) : 0;
  const projectedCash = ledger?.cashOnHandEnd ?? cashOnHand + profit;
  const wageRevPct = totalRev > 0 ? wages / totalRev * 100 : 0;
  return {
    team,
    cashAvailable,
    cashOnHand,
    projectedCash,
    matchday,
    sponsorship,
    tv,
    otherRevenue,
    totalRev,
    wages,
    staff,
    facility,
    scouting,
    travel,
    medical,
    academy,
    transferFees,
    financeCosts,
    totalExp,
    profit,
    wageRevPct,
    pending,
    health: pending.profit
      ? { label: 'Pending', tone: 'pending' }
      : cashAvailable
        ? classifyHealth(profit, projectedCash, totalExp)
        : classifyProfitHealth(profit, contractCurrencyRate / 0.92),
  };
}
