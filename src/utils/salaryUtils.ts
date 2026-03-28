import { NBAPlayer } from '../types';

/** BBGM contract.amount is in thousands of dollars.
 *  Multiply by 1000 to get actual USD. */
export const contractToUSD = (amount: number): number => amount * 1000;

/** Sum all player contracts for a team, returning USD dollars. */
export const getTeamPayrollUSD = (players: NBAPlayer[], teamId: number): number =>
  players
    .filter(p => p.tid === teamId)
    .reduce((sum, p) => sum + contractToUSD(p.contract?.amount || 0), 0);

/** Format dollar amount as "$X.XM" */
export const formatSalaryM = (dollars: number): string =>
  `$${(dollars / 1_000_000).toFixed(1)}M`;

/** Format dollar amount as "$X.XM" or "$XXXk" for smaller amounts */
export const formatSalaryShort = (dollars: number): string =>
  dollars >= 1_000_000
    ? `$${(dollars / 1_000_000).toFixed(1)}M`
    : `$${(dollars / 1_000).toFixed(0)}K`;

export interface CapThresholds {
  salaryCap: number;    // USD
  luxuryTax: number;    // USD
  firstApron: number;   // USD
  secondApron: number;  // USD
  minPayroll: number;   // USD
}

/** Derive all cap thresholds from leagueStats.
 *
 *  Luxury tax is computed from `luxuryTaxThresholdPercentage` (stored in leagueStats
 *  from the Economy settings) so that it stays in sync whenever the salary cap
 *  changes due to a new broadcasting deal.  Falls back to the raw `luxuryPayroll`
 *  dollar value for backwards compatibility. */
export const getCapThresholds = (leagueStats: {
  salaryCap: number;
  luxuryPayroll: number;
  luxuryTaxThresholdPercentage?: number;
  firstApronPercentage?: number;
  secondApronPercentage?: number;
  minimumPayrollPercentage?: number;
}): CapThresholds => {
  const cap = leagueStats.salaryCap;
  // Prefer percentage-derived value so it auto-scales with cap changes
  const luxuryTax = leagueStats.luxuryTaxThresholdPercentage
    ? cap * (leagueStats.luxuryTaxThresholdPercentage / 100)
    : leagueStats.luxuryPayroll;
  return {
    salaryCap: cap,
    luxuryTax,
    firstApron: cap * ((leagueStats.firstApronPercentage ?? 126.7) / 100),
    secondApron: cap * ((leagueStats.secondApronPercentage ?? 134.4) / 100),
    minPayroll: cap * ((leagueStats.minimumPayrollPercentage ?? 90) / 100),
  };
};

export type CapStatusKey = 'under_cap' | 'over_cap' | 'over_tax' | 'over_first_apron' | 'over_second_apron';

export interface CapStatus {
  key: CapStatusKey;
  label: string;
  color: string;        // tailwind text color class
  bgColor: string;      // tailwind bg color class (semi-transparent)
  barColor: string;     // hex or tailwind for bars
}

export const getCapStatus = (payrollUSD: number, t: CapThresholds): CapStatus => {
  if (payrollUSD >= t.secondApron) return { key: 'over_second_apron', label: '2nd Apron',  color: 'text-rose-400',    bgColor: 'bg-rose-500/20',    barColor: '#f43f5e' };
  if (payrollUSD >= t.firstApron)  return { key: 'over_first_apron',  label: '1st Apron',  color: 'text-orange-400',  bgColor: 'bg-orange-500/20',  barColor: '#fb923c' };
  if (payrollUSD >= t.luxuryTax)   return { key: 'over_tax',          label: 'Tax Payer',  color: 'text-yellow-400',  bgColor: 'bg-yellow-500/20',  barColor: '#facc15' };
  if (payrollUSD >= t.salaryCap)   return { key: 'over_cap',          label: 'Over Cap',   color: 'text-blue-400',    bgColor: 'bg-blue-500/20',    barColor: '#60a5fa' };
  return { key: 'under_cap', label: 'Cap Space', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', barColor: '#34d399' };
};

// ─── Trade Outlook ────────────────────────────────────────────────────────────

export type TradeRole = 'heavy_buyer' | 'buyer' | 'neutral' | 'seller' | 'rebuilding';

export interface TradeOutlook {
  role: TradeRole;
  label: string;
  color: string;   // tailwind text
  bgColor: string; // tailwind bg
  dot: string;     // hex dot colour
  reason: string;
}

/**
 * Classifies a team's trade/FA outlook using cap position AND standings context.
 *
 * @param confRank     - 1–15 rank within conference (undefined = ignore standings)
 * @param gbFromLeader - Games Behind the conference leader (undefined = ignore)
 */
export const getTradeOutlook = (
  payrollUSD: number,
  wins: number,
  losses: number,
  expiringCount: number,
  thresholds: CapThresholds,
  confRank?: number,
  gbFromLeader?: number,
): TradeOutlook => {
  const gp = wins + losses || 1;
  const winPct = wins / gp;
  const capSpace = thresholds.salaryCap - payrollUSD;
  const isOverTax = payrollUSD >= thresholds.luxuryTax;

  // Standings-aware overrides
  const inPlayoffs   = confRank !== undefined && confRank <= 6;
  const inPlayIn     = confRank !== undefined && confRank >= 7 && confRank <= 10;
  const outsidePlayIn = confRank !== undefined && confRank > 10;
  const farBehind    = gbFromLeader !== undefined && gbFromLeader >= 10;
  const veryFarBehind = gbFromLeader !== undefined && gbFromLeader >= 15;

  // Top 3 seed + cap room = championship hunting
  if (confRank !== undefined && confRank <= 3 && capSpace > 5_000_000)
    return { role: 'heavy_buyer', label: 'Heavy Buyer', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: `#${confRank} seed — title window open` };

  // Playoff team (top 6) with any meaningful cap space
  if (inPlayoffs && capSpace > 2_000_000)
    return { role: 'buyer', label: 'Buyer', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: `Playoff seed #${confRank} — adding pieces` };

  // Play-in team with cap room = opportunistic buyer
  if (inPlayIn && capSpace > 5_000_000)
    return { role: 'buyer', label: 'Buyer', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: `Play-in #${confRank} — push for playoffs` };

  // Way out of it = rebuilding (regardless of cap)
  if (veryFarBehind || (outsidePlayIn && farBehind))
    return { role: 'rebuilding', label: 'Rebuilding', color: 'text-purple-400', bgColor: 'bg-purple-500/20', dot: '#c084fc', reason: gbFromLeader !== undefined ? `${gbFromLeader} GB — future-focused` : 'Future-focused' };

  // Outside play-in + over tax + losing = motivated seller
  if (outsidePlayIn && isOverTax)
    return { role: 'seller', label: 'Seller', color: 'text-rose-400', bgColor: 'bg-rose-500/20', dot: '#f87171', reason: 'Outside play-in, over tax' };

  // Fallbacks without standings data
  if (winPct >= 0.55 && capSpace > 10_000_000)
    return { role: 'heavy_buyer', label: 'Heavy Buyer', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: 'Contender with cap room' };
  if (winPct >= 0.48 && capSpace > 3_000_000)
    return { role: 'buyer', label: 'Buyer', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: 'Winning, room to add' };
  if (winPct < 0.35 || (winPct < 0.42 && expiringCount >= 3))
    return { role: 'rebuilding', label: 'Rebuilding', color: 'text-purple-400', bgColor: 'bg-purple-500/20', dot: '#c084fc', reason: 'Future-focused' };
  if (winPct < 0.46 && isOverTax)
    return { role: 'seller', label: 'Seller', color: 'text-rose-400', bgColor: 'bg-rose-500/20', dot: '#f87171', reason: 'Losing & over tax' };

  return { role: 'neutral', label: 'Neutral', color: 'text-slate-400', bgColor: 'bg-slate-700/40', dot: '#94a3b8', reason: 'Holding steady' };
};

/** Full cap profile for a team — used by AI trade/FA logic. */
export interface TeamCapProfile {
  teamId: number;
  payrollUSD: number;
  capSpaceUSD: number;       // negative means over cap
  taxSpaceUSD: number;       // negative means over tax
  firstApronSpaceUSD: number;
  secondApronSpaceUSD: number;
  status: CapStatus;
  isTradeCandidate: boolean; // under tax, has assets
  isBuyer: boolean;          // has cap space, winning team
}

export const getTeamCapProfile = (
  players: NBAPlayer[],
  teamId: number,
  wins: number,
  losses: number,
  thresholds: CapThresholds
): TeamCapProfile => {
  const payrollUSD = getTeamPayrollUSD(players, teamId);
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
