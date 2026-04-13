import { NBAPlayer } from '../types';
import { convertTo2KRating } from './helpers';

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

  // Playoff team (top 6): buyer if cap space available OR under luxury tax (MLE available)
  if (inPlayoffs && (capSpace > 2_000_000 || payrollUSD < thresholds.luxuryTax))
    return { role: 'buyer', label: 'Buyer', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: `Playoff seed #${confRank} — adding pieces` };

  // Play-in team with cap room = opportunistic buyer
  if (inPlayIn && (capSpace > 3_000_000 || payrollUSD < thresholds.luxuryTax - 5_000_000))
    return { role: 'buyer', label: 'Buyer', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: `Play-in #${confRank} — push for playoffs` };

  // Way out of it = rebuilding (regardless of cap)
  if (veryFarBehind || (outsidePlayIn && farBehind))
    return { role: 'rebuilding', label: 'Rebuilding', color: 'text-purple-400', bgColor: 'bg-purple-500/20', dot: '#c084fc', reason: gbFromLeader !== undefined ? `${gbFromLeader} GB — future-focused` : 'Future-focused' };

  // Outside play-in + over tax + losing = motivated seller
  if (outsidePlayIn && isOverTax)
    return { role: 'seller', label: 'Seller', color: 'text-rose-400', bgColor: 'bg-rose-500/20', dot: '#f87171', reason: 'Outside play-in, over tax' };

  // Fallbacks without standings data
  if (winPct >= 0.55 && (capSpace > 5_000_000 || payrollUSD < thresholds.luxuryTax))
    return { role: 'heavy_buyer', label: 'Heavy Buyer', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: 'Contender with cap room' };
  if (winPct >= 0.48 && (capSpace > 0 || payrollUSD < thresholds.luxuryTax))
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

// ─── Contract Offer Engine ────────────────────────────────────────────────────

/** Tier labels used for UI display (cosmetic only). */
export type ContractTier = 'Superstar' | 'Star' | 'All-Star' | 'Starter' | 'Bench' | 'Charity';

export interface ContractOffer {
  salaryUSD: number;    // annual value in USD
  years: number;        // contract length
  tier: ContractTier;
  hasPlayerOption: boolean; // player can opt out in final year
}

// Max contract % of cap by years of service; index = min(yrs, 10)
const MAX_CONTRACT_PCT = [0.25, 0.26, 0.27, 0.28, 0.29, 0.30, 0.31, 0.32, 0.33, 0.34, 0.35];

// Min contract $M calibrated at cap = $154.6M; index = min(yrs, 10)
// Scaled proportionally when cap differs.
const MIN_CONTRACT_BASE_M = [1.273, 1.426, 1.598, 1.790, 2.006, 2.247, 2.518, 2.821, 3.161, 3.541, 3.967];
const BASE_CAP_M = 154.6;

type ContractLeagueStats = Pick<
  import('../types').LeagueStats,
  | 'salaryCap'
  | 'minContractType'
  | 'minContractStaticAmount'
  | 'maxContractType'
  | 'maxContractStaticPercentage'
  | 'minContractLength'
  | 'maxContractLengthStandard'
>;

/**
 * Compute a full contract offer for a player using the spec from §6c.
 *
 * Formula:
 *   score  = OVR × 0.5 + POT × 0.5
 *   salary = MAX(minSalary, maxContract × ((MAX(0, score − 68) / 31) ^ 1.6))
 *
 * @param player       - the player being offered
 * @param leagueStats  - for cap + contract settings
 * @param moodTraits   - player's mood traits (LOYAL, MERCENARY, etc.)
 * @param moodScore    - numeric mood score from computeMoodScore (0 = neutral)
 */
export function computeContractOffer(
  player: NBAPlayer,
  leagueStats: ContractLeagueStats,
  moodTraits: string[] = [],
  moodScore: number = 0,
): ContractOffer {
  // leagueStats.salaryCap is stored in USD (e.g. 154_647_000). Convert to millions.
  const salaryCapUSD = leagueStats.salaryCap ?? (BASE_CAP_M * 1_000_000);
  const capM = salaryCapUSD / 1_000_000;

  // ── Years of service (no new field needed) ──────────────────────────────
  const yearsOfService = (player as any).stats
    ? (player as any).stats.filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length
    : 0;
  const svcIdx = Math.min(yearsOfService, 10);

  // ── Max contract ────────────────────────────────────────────────────────
  let maxContractUSD: number;
  if ((leagueStats.maxContractType ?? 'service_tiered') === 'service_tiered') {
    maxContractUSD = (capM * MAX_CONTRACT_PCT[svcIdx]) * 1_000_000;
  } else {
    const pct = (leagueStats.maxContractStaticPercentage ?? 25) / 100;
    maxContractUSD = capM * pct * 1_000_000;
  }

  // ── Min salary ──────────────────────────────────────────────────────────
  let minSalaryUSD: number;
  if ((leagueStats.minContractType ?? 'dynamic') === 'dynamic') {
    // Scale proportionally from base cap
    minSalaryUSD = (MIN_CONTRACT_BASE_M[svcIdx] / BASE_CAP_M) * capM * 1_000_000;
  } else {
    // Static — stored in thousands (BBGM convention)
    minSalaryUSD = ((leagueStats.minContractStaticAmount ?? 1273) as number) * 1_000;
  }

  // ── OVR + POT (K2 scale, formula calibrated for 60–99) ─────────────────
  // ratings[].ovr is BBGM scale (40–85). Convert → K2 (60–99) before using.
  const lastRating = (player as any).ratings?.[(player as any).ratings?.length - 1];
  const bbgmOvr = lastRating?.ovr ?? player.overallRating ?? 60;
  const bbgmPot = lastRating?.pot ?? bbgmOvr;
  const hgtAttr = lastRating?.hgt ?? 50;
  const ovr = convertTo2KRating(bbgmOvr, hgtAttr);
  const pot = convertTo2KRating(bbgmPot, hgtAttr);
  const score = ovr * 0.5 + pot * 0.5;

  // ── Tier ────────────────────────────────────────────────────────────────
  let tier: ContractTier;
  if      (score >= 95) tier = 'Superstar';
  else if (score >= 90) tier = 'Star';
  else if (score >= 85) tier = 'All-Star';
  else if (score >= 78) tier = 'Starter';
  else if (score >= 72) tier = 'Bench';
  else                  tier = 'Charity';

  // ── Base salary ─────────────────────────────────────────────────────────
  const normalised = Math.max(0, score - 68) / (99 - 68);
  let salaryUSD = Math.max(minSalaryUSD, maxContractUSD * Math.pow(normalised, 1.6));

  // ── Mood modifier ───────────────────────────────────────────────────────
  if (moodTraits.includes('LOYAL')) {
    salaryUSD *= 0.92;                    // L — hometown discount
  } else if (moodTraits.includes('MERCENARY')) {
    salaryUSD *= 1.28;                    // $ — fatter contract, demands premium
  } else if (moodTraits.includes('COMPETITOR')) {
    salaryUSD *= 0.91;                    // W — paycut to chase a ring
  } else if (moodScore < -2) {
    salaryUSD *= 1.17;                    // unhappy — costs more to keep/acquire
  } else if (moodScore < 2) {
    salaryUSD *= 1.10;                    // restless — slight premium
  }
  // Happy/Neutral → no adjustment

  salaryUSD = Math.max(minSalaryUSD, salaryUSD);

  // ── Contract length ─────────────────────────────────────────────────────
  // Seeded variance (0 or 1) so different players get slightly different lengths
  let varSeed = 0;
  const pid = (player as any).internalId ?? '';
  for (let ci = 0; ci < pid.length; ci++) varSeed += pid.charCodeAt(ci);
  varSeed += yearsOfService * 37;
  const sinV = Math.abs((Math.sin(varSeed) * 10000) % 1);  // 0–1
  const plusOne = sinV > 0.5 ? 1 : 0;                       // 0 or 1

  // Last-season GP — injury penalty
  const statsArr = (player as any).stats ?? [];
  const lastSeasonStats = statsArr.filter((s: any) => !s.playoffs).at(-1);
  const lastGP = lastSeasonStats?.gp ?? 82;
  const injuryPenalty = lastGP < 40 ? 1 : 0;

  // Base years by OVR (K2 scale: 60=fringe, 99=legend)
  // Also check raw BBGM pot > 99 (impossible but used as flag for generated elite prospects)
  const isEliteProspect = bbgmPot > 99 || pot >= 97;
  let years: number;
  if (isEliteProspect) {
    years = 5;                            // elite prospect → auto 5yr
  } else if (ovr >= 85) {
    years = 4 + plusOne;                  // star (K2 85+) → 4–5 yrs
  } else if (ovr >= 76) {
    years = 3 + plusOne;                  // rotation (K2 76+) → 3–4 yrs
  } else if (ovr >= 70) {
    years = 2 + plusOne;                  // bench (K2 70+) → 2–3 yrs
  } else {
    years = 1 + plusOne;                  // fringe/veteran (K2 <70) → 1–2 yrs
  }

  // Injury deduction
  years = Math.max(1, years - injuryPenalty);

  // Mood overrides
  if (moodScore < -2) years = Math.min(years, 2);
  if (moodTraits.includes('LOYAL')) years = Math.min(years + 1, 5);

  years = Math.min(years, leagueStats.maxContractLengthStandard ?? 5);
  years = Math.max(leagueStats.minContractLength ?? 1, years);

  // ── Player option ────────────────────────────────────────────────────────
  // High-OVR players often hold a player option on their final year
  const optV = Math.abs((Math.cos(varSeed + 42) * 10000) % 1);
  const hasPlayerOption =
    (ovr >= 85 && optV > 0.20) ||   // ~80 % chance for K2 85+ (stars)
    (ovr >= 76 && optV > 0.50);     // ~50 % chance for K2 76+ (rotation)

  return { salaryUSD, years, tier, hasPlayerOption };
}
