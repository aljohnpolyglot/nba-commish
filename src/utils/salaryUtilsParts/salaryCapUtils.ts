import type { GameState, NBAPlayer, NBATeam } from '../../types';
import { getTeamPayrollUSD } from './salaryBasics';

export interface CapThresholds {
  salaryCap: number;
  luxuryTax: number;
  firstApron: number;
  secondApron: number;
  minPayroll: number;
}

export const getCapThresholds = (leagueStats: {
  salaryCap: number;
  luxuryPayroll: number;
  luxuryTaxThresholdPercentage?: number;
  luxuryTaxEnabled?: boolean;
  firstApronPercentage?: number;
  secondApronPercentage?: number;
  firstApronAmount?: number;
  secondApronAmount?: number;
  minimumPayrollPercentage?: number;
  apronsEnabled?: boolean;
  numberOfAprons?: number;
  salaryCapEnabled?: boolean;
  salaryCapType?: string;
  uiMode?: string | null;
}): CapThresholds => {
  if (
    leagueStats.uiMode === 'pba_isolated' ||
    leagueStats.salaryCapEnabled === false ||
    leagueStats.salaryCapType === 'none'
  ) {
    return {
      salaryCap: Number.POSITIVE_INFINITY,
      luxuryTax: Number.POSITIVE_INFINITY,
      firstApron: Number.POSITIVE_INFINITY,
      secondApron: Number.POSITIVE_INFINITY,
      minPayroll: 0,
    };
  }
  const cap = leagueStats.salaryCap;
  const luxuryTax = leagueStats.luxuryTaxEnabled === false
    ? Number.POSITIVE_INFINITY
    : leagueStats.luxuryTaxThresholdPercentage
      ? cap * (leagueStats.luxuryTaxThresholdPercentage / 100)
      : leagueStats.luxuryPayroll;
  const apronsActive = leagueStats.apronsEnabled !== false;
  const apronCount = apronsActive ? (leagueStats.numberOfAprons ?? 2) : 0;
  return {
    salaryCap: cap,
    luxuryTax,
    firstApron: apronCount > 0
      ? (leagueStats.firstApronAmount && leagueStats.firstApronAmount > 0
          ? leagueStats.firstApronAmount
          : cap * ((leagueStats.firstApronPercentage ?? 126.7) / 100))
      : Number.POSITIVE_INFINITY,
    secondApron: apronCount > 1
      ? (leagueStats.secondApronAmount && leagueStats.secondApronAmount > 0
          ? leagueStats.secondApronAmount
          : cap * ((leagueStats.secondApronPercentage ?? 134.4) / 100))
      : Number.POSITIVE_INFINITY,
    minPayroll: cap * ((leagueStats.minimumPayrollPercentage ?? 90) / 100),
  };
};

export type CapStatusKey = 'under_cap' | 'over_cap' | 'over_tax' | 'over_first_apron' | 'over_second_apron';
export type ApronBucket = 'under_cap' | 'over_cap' | 'over_tax' | 'over_1st' | 'over_2nd';

export interface CapStatus {
  key: CapStatusKey;
  label: string;
  color: string;
  bgColor: string;
  barColor: string;
}

export const getCapStatus = (payrollUSD: number, t: CapThresholds): CapStatus => {
  if (!Number.isFinite(t.salaryCap)) return { key: 'under_cap', label: 'No Cap', color: 'text-slate-400', bgColor: 'bg-slate-500/20', barColor: '#94a3b8' };
  if (payrollUSD >= t.secondApron) return { key: 'over_second_apron', label: '2nd Apron', color: 'text-rose-400', bgColor: 'bg-rose-500/20', barColor: '#f43f5e' };
  if (payrollUSD >= t.firstApron) return { key: 'over_first_apron', label: '1st Apron', color: 'text-orange-400', bgColor: 'bg-orange-500/20', barColor: '#fb923c' };
  if (payrollUSD >= t.luxuryTax) return { key: 'over_tax', label: 'Tax Payer', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', barColor: '#facc15' };
  if (payrollUSD >= t.salaryCap) return { key: 'over_cap', label: 'Over Cap', color: 'text-blue-400', bgColor: 'bg-blue-500/20', barColor: '#60a5fa' };
  return { key: 'under_cap', label: 'Cap Space', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', barColor: '#34d399' };
};

export const getApronBucketForPayroll = (
  payrollUSD: number,
  thresholds: CapThresholds,
  leagueStats?: { apronsEnabled?: boolean; numberOfAprons?: number },
): ApronBucket => {
  const apronsActive = leagueStats?.apronsEnabled !== false;
  const apronCount = leagueStats?.numberOfAprons ?? 2;
  if (apronsActive && apronCount > 1 && payrollUSD >= thresholds.secondApron) return 'over_2nd';
  if (apronsActive && apronCount > 0 && payrollUSD >= thresholds.firstApron) return 'over_1st';
  if (payrollUSD >= thresholds.luxuryTax) return 'over_tax';
  if (payrollUSD >= thresholds.salaryCap) return 'over_cap';
  return 'under_cap';
};

export const getApronBucketAfterTrade = (
  currentPayrollUSD: number,
  leg: { outgoingSalaryUSD?: number; incomingSalaryUSD?: number },
  leagueStats: {
    salaryCap: number;
    luxuryPayroll: number;
    luxuryTaxThresholdPercentage?: number;
    firstApronPercentage?: number;
    secondApronPercentage?: number;
    minimumPayrollPercentage?: number;
    apronsEnabled?: boolean;
    numberOfAprons?: number;
  },
): ApronBucket => {
  const thresholds = getCapThresholds(leagueStats);
  const projectedPayroll = currentPayrollUSD - (leg.outgoingSalaryUSD ?? 0) + (leg.incomingSalaryUSD ?? 0);
  return getApronBucketForPayroll(projectedPayroll, thresholds, leagueStats);
};

export const getTradeMatchingRatioForBucket = (
  bucket: ApronBucket,
  leagueStats: {
    tradeMatchingRatioUnder?: number;
    tradeMatchingRatioOver1st?: number;
    tradeMatchingRatioOver2nd?: number;
  },
): number => {
  if (bucket === 'over_2nd') return leagueStats.tradeMatchingRatioOver2nd ?? 1.00;
  if (bucket === 'over_1st') return leagueStats.tradeMatchingRatioOver1st ?? 1.10;
  return leagueStats.tradeMatchingRatioUnder ?? 1.25;
};

export interface TeamCapProfile {
  teamId: number;
  payrollUSD: number;
  capSpaceUSD: number;
  taxSpaceUSD: number;
  firstApronSpaceUSD: number;
  secondApronSpaceUSD: number;
  status: CapStatus;
  isTradeCandidate: boolean;
  isBuyer: boolean;
}

export const getTeamCapProfileFromState = (
  state: GameState,
  teamId: number,
  thresholds?: CapThresholds,
): TeamCapProfile => {
  const team = state.teams.find(t => t.id === teamId);
  const t = thresholds ?? getCapThresholds(state.leagueStats as any);
  return getTeamCapProfile(
    state.players, teamId,
    (team as any)?.wins ?? 0, (team as any)?.losses ?? 0,
    t, team, state.leagueStats?.year, state.leagueStats as any,
  );
};

export const getTeamCapProfile = (
  players: NBAPlayer[],
  teamId: number,
  wins: number,
  losses: number,
  thresholds: CapThresholds,
  team?: NBATeam,
  seasonYear?: number,
  leagueStats?: { twoWayContractsEnabled?: boolean | null; maxTwoWayPlayersPerTeam?: number | null; uiMode?: string | null } | null,
): TeamCapProfile => {
  const payrollUSD = getTeamPayrollUSD(players, teamId, team, seasonYear, leagueStats);
  const status = getCapStatus(payrollUSD, thresholds);
  const capSpaceUSD = thresholds.salaryCap - payrollUSD;
  const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0;
  return {
    teamId,
    payrollUSD,
    capSpaceUSD,
    taxSpaceUSD: thresholds.luxuryTax - payrollUSD,
    firstApronSpaceUSD: thresholds.firstApron - payrollUSD,
    secondApronSpaceUSD: thresholds.secondApron - payrollUSD,
    status,
    isTradeCandidate: payrollUSD < thresholds.luxuryTax,
    isBuyer: capSpaceUSD > 5_000_000 && winPct >= 0.5,
  };
};

export type MleType = 'room' | 'non_taxpayer' | 'taxpayer' | null;

export interface MleAvailability {
  type: MleType;
  limit: number;
  used: number;
  available: number;
  blocked: boolean;
}

export function getMLEAvailability(
  teamId: number,
  payrollUSD: number,
  signingUSD: number,
  thresholds: CapThresholds,
  leagueStats: {
    mleEnabled?: boolean;
    roomMleAmount?: number;
    nonTaxpayerMleAmount?: number;
    taxpayerMleAmount?: number;
    biannualEnabled?: boolean;
    biannualAmount?: number;
    mleUsage?: Record<number, { type: 'room' | 'non_taxpayer' | 'taxpayer'; usedUSD: number }>;
    capExceptionUsage?: Record<number, {
      season: number;
      baeUsedUSD?: number;
      usedCapRoom?: boolean;
      hardCapLevel?: 'first' | 'second';
    }>;
    year?: number;
    apronsEnabled?: boolean;
    numberOfAprons?: number;
    salaryCapEnabled?: boolean;
    salaryCapType?: string;
  },
): MleAvailability {
  const NONE: MleAvailability = { type: null, limit: 0, used: 0, available: 0, blocked: true };
  if (leagueStats.mleEnabled === false) return NONE;
  if (leagueStats.salaryCapEnabled === false || leagueStats.salaryCapType === 'none') return NONE;

  const cap = thresholds.salaryCap;
  const ls = leagueStats as any;
  const limitFromPct = (pct: number | undefined, fallbackUSD: number) =>
    typeof pct === 'number' ? Math.round(cap * (pct / 100)) : fallbackUSD;
  const ROOM_LIMIT = limitFromPct(ls.roomMlePercentage, leagueStats.roomMleAmount ?? 8_781_000);
  const NT_LIMIT = limitFromPct(ls.nonTaxpayerMlePercentage, leagueStats.nonTaxpayerMleAmount ?? 14_104_000);
  const TAX_LIMIT = limitFromPct(ls.taxpayerMlePercentage, leagueStats.taxpayerMleAmount ?? 5_685_000);

  const usage = leagueStats.mleUsage?.[teamId];
  const priorType = usage?.type ?? null;
  const priorUsed = usage?.usedUSD ?? 0;
  const storedCapUsage = leagueStats.capExceptionUsage?.[teamId];
  const capUsage = storedCapUsage && (
    storedCapUsage.season == null ||
    leagueStats.year == null ||
    storedCapUsage.season === leagueStats.year
  ) ? storedCapUsage : undefined;
  const baeUsed = (capUsage?.baeUsedUSD ?? 0) > 0 || capUsage?.hardCapLevel === 'first';
  const apronsActive = leagueStats.apronsEnabled !== false;
  const apronCount = leagueStats.numberOfAprons ?? 2;
  const firstApron = apronsActive && apronCount > 0 ? thresholds.firstApron : Number.POSITIVE_INFINITY;
  const secondApron = apronsActive && apronCount > 1 ? thresholds.secondApron : Number.POSITIVE_INFINITY;
  const projectedPayroll = payrollUSD + signingUSD;
  const usesApronMleSplit = apronsActive && apronCount > 0;

  if (capUsage?.usedCapRoom) {
    if (baeUsed || priorType === 'non_taxpayer' || priorType === 'taxpayer') return NONE;
    const usedThisSeason = priorType === 'room' ? priorUsed : 0;
    const available = Math.max(0, ROOM_LIMIT - usedThisSeason);
    return { type: 'room', limit: ROOM_LIMIT, used: usedThisSeason, available, blocked: available === 0 };
  }

  if (payrollUSD < cap) {
    const blocked = baeUsed || priorType === 'non_taxpayer' || priorType === 'taxpayer';
    if (blocked) return NONE;
    const usedThisSeason = priorType === 'room' ? priorUsed : 0;
    const available = Math.max(0, ROOM_LIMIT - usedThisSeason);
    return { type: 'room', limit: ROOM_LIMIT, used: usedThisSeason, available, blocked: available === 0 };
  }

  if (payrollUSD >= secondApron) return NONE;

  if (!usesApronMleSplit) {
    const taxLine = thresholds.luxuryTax;
    const taxpayerTeam = payrollUSD >= taxLine || projectedPayroll >= taxLine;
    if (taxpayerTeam) {
      const blocked = baeUsed || priorType === 'room' || priorType === 'non_taxpayer';
      if (blocked) return NONE;
      const usedThisSeason = priorType === 'taxpayer' ? priorUsed : 0;
      const available = Math.max(0, TAX_LIMIT - usedThisSeason);
      return { type: 'taxpayer', limit: TAX_LIMIT, used: usedThisSeason, available, blocked: available === 0 };
    }

    const blocked = priorType === 'room' || priorType === 'taxpayer';
    if (blocked) return NONE;
    const usedThisSeason = priorType === 'non_taxpayer' ? priorUsed : 0;
    const available = Math.max(0, NT_LIMIT - usedThisSeason);
    return { type: 'non_taxpayer', limit: NT_LIMIT, used: usedThisSeason, available, blocked: available === 0 };
  }

  const crossesFirstApron = projectedPayroll >= firstApron || payrollUSD >= firstApron;
  if (crossesFirstApron) {
    const blocked = baeUsed || priorType === 'room' || priorType === 'non_taxpayer';
    if (blocked) return NONE;
    if (projectedPayroll >= secondApron) return NONE;
    const usedThisSeason = priorType === 'taxpayer' ? priorUsed : 0;
    const available = Math.max(0, TAX_LIMIT - usedThisSeason);
    return { type: 'taxpayer', limit: TAX_LIMIT, used: usedThisSeason, available, blocked: available === 0 };
  }

  if (payrollUSD >= cap && payrollUSD < firstApron && projectedPayroll < firstApron) {
    const blocked = priorType === 'room' || priorType === 'taxpayer';
    if (blocked) return NONE;
    const usedThisSeason = priorType === 'non_taxpayer' ? priorUsed : 0;
    const available = Math.max(0, NT_LIMIT - usedThisSeason);
    return { type: 'non_taxpayer', limit: NT_LIMIT, used: usedThisSeason, available, blocked: available === 0 };
  }

  return NONE;
}
