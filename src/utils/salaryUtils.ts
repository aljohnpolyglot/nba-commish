import { NBAPlayer, NBATeam, TeamStatus, DeadMoneyEntry, GameState } from '../types';
import { convertTo2KRating } from './helpers';
import { EXTERNAL_SALARY_SCALE } from '../constants';

/** BBGM contract.amount is in thousands of dollars.
 *  Multiply by 1000 to get actual USD. */
export const contractToUSD = (amount: number): number => amount * 1000;

/** Convert a contractYears season label like "2025-26" → calendar year of season end (2026).
 *  Matches the convention used by simulationHandler / seasonRollover. */
export const seasonLabelToYear = (label: string): number => parseInt(label.split('-')[0], 10) + 1;

/** Sum dead money owed by `team` for the season ending in `seasonYear`. */
export const getTeamDeadMoneyForSeason = (team: NBATeam | undefined, seasonYear: number): number => {
  if (!team?.deadMoney?.length) return 0;
  return team.deadMoney.reduce((sum, entry) => {
    const hit = entry.remainingByYear.find(y => seasonLabelToYear(y.season) === seasonYear);
    return sum + (hit?.amountUSD ?? 0);
  }, 0);
};

/** Build a stretched payment schedule. NBA formula: spread total over (2 × remaining years + 1) seasons.
 *  Returns the new remainingByYear; preserves the FIRST season as the start. */
export const buildStretchedSchedule = (
  remainingByYear: DeadMoneyEntry['remainingByYear'],
  multiplier = 2,
): DeadMoneyEntry['remainingByYear'] => {
  if (!remainingByYear.length) return [];
  const totalUSD = remainingByYear.reduce((s, y) => s + y.amountUSD, 0);
  const remainingYears = remainingByYear.length;
  const stretchYears = remainingYears * multiplier + 1;
  const perYear = Math.round(totalUSD / stretchYears);
  const startYear = seasonLabelToYear(remainingByYear[0].season);
  return Array.from({ length: stretchYears }).map((_, i) => {
    const yr = startYear + i;
    return { season: `${yr - 1}-${String(yr).slice(-2)}`, amountUSD: perYear };
  });
};

/** Sum all player contracts for a team, returning USD dollars.
 *  Two-way players ($625K each) are excluded from cap payroll — they don't count against the salary cap.
 *  When `team` is provided, dead-money charges for the current season are added so cap math
 *  reflects waived guaranteed contracts. `seasonYear` defaults to the latest contractYears year on the roster. */
export const getTeamPayrollUSD = (
  players: NBAPlayer[],
  teamId: number,
  team?: NBATeam,
  seasonYear?: number,
): number => {
  const livePayroll = players
    .filter(p => p.tid === teamId && !(p as any).twoWay)
    .reduce((sum, p) => sum + contractToUSD(p.contract?.amount || 0), 0);
  if (!team?.deadMoney?.length) return livePayroll;
  const yr = seasonYear ?? (() => {
    let max = new Date().getUTCFullYear();
    players.forEach(p => {
      const exp = p.contract?.exp;
      if (typeof exp === 'number' && exp > max) max = exp;
    });
    return max;
  })();
  return livePayroll + getTeamDeadMoneyForSeason(team, yr);
};

/** Format dollar amount as "$X.XM" */
export const formatSalaryM = (dollars: number): string =>
  `$${(dollars / 1_000_000).toFixed(1)}M`;

/** Format dollar amount with configurable decimal places. Used where fine-grained precision matters (signing UI). */
export const formatSalaryMPrecise = (dollars: number, decimals = 2): string =>
  `$${(dollars / 1_000_000).toFixed(decimals)}M`;

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
  apronsEnabled?: boolean;
  numberOfAprons?: number;
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
export type ApronBucket = 'under_cap' | 'over_cap' | 'over_tax' | 'over_1st' | 'over_2nd';

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

// ─── Effective Record ─────────────────────────────────────────────────────────

/**
 * Returns a team's effective W-L for classification purposes.
 * During the offseason (or early season with < 10 games played) `team.wins` and
 * `team.losses` are both 0, which causes `getTradeOutlook` to misclassify every
 * team as rebuilding. Fall back to the previous season's record when gp < 10.
 * Mirrors the pattern used in PowerRankingsView.
 */
export function effectiveRecord(team: any, currentYear: number): { wins: number; losses: number } {
  const wins   = team.wins   ?? 0;
  const losses = team.losses ?? 0;
  if (wins + losses >= 10) return { wins, losses };
  const lastSeason = (team.seasons as any[] | undefined)?.find(s => s.season === currentYear - 1);
  if (lastSeason && (lastSeason.won + lastSeason.lost) > 0) {
    return { wins: lastSeason.won, losses: lastSeason.lost };
  }
  return { wins, losses };
}

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

// Outlook shapes produced when the user manually pins their team's status in GM mode.
const MANUAL_STATUS_OUTLOOK: Record<TeamStatus, TradeOutlook> = {
  contending:   { role: 'heavy_buyer', label: 'Contending',   color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: 'Manual' },
  win_now:      { role: 'buyer',       label: 'Win-Now',      color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: 'Manual' },
  play_in_push: { role: 'buyer',       label: 'Play-In Push', color: 'text-sky-300',     bgColor: 'bg-sky-500/15',     dot: '#7dd3fc', reason: 'Manual' },
  retooling:    { role: 'seller',      label: 'Retooling',    color: 'text-amber-400',   bgColor: 'bg-amber-500/20',   dot: '#fbbf24', reason: 'Manual' },
  cap_clearing: { role: 'seller',      label: 'Cap Clearing', color: 'text-orange-300',  bgColor: 'bg-orange-500/20',  dot: '#fdba74', reason: 'Manual' },
  rebuilding:   { role: 'rebuilding',  label: 'Rebuilding',   color: 'text-purple-400',  bgColor: 'bg-purple-500/20',  dot: '#c084fc', reason: 'Manual' },
  development:  { role: 'rebuilding',  label: 'Development',  color: 'text-fuchsia-300', bgColor: 'bg-fuchsia-500/15', dot: '#f0abfc', reason: 'Manual' },
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

/**
 * Return the manual-override outlook for a team if (and only if) the user has
 * pinned one in GM mode for their own team. Otherwise returns undefined so
 * callers fall back to the auto-computed outlook.
 */
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

/**
 * Compute the average K2 OVR of a team's top-N players by overall rating.
 * Used for the star-power override in getTradeOutlook.
 */
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
    const bbgmOvr = last?.ovr ?? p.overallRating ?? 0;
    const hgt = last?.hgt ?? 50;
    const tp = last?.tp ?? 50;
    return acc + convertTo2KRating(bbgmOvr, hgt, tp);
  }, 0);
  return sum / top.length;
}

/** Bird Rights resolver with stats-based fallback.
 *  The `hasBirdRights` flag is set by seasonRollover when yearsWithTeam ≥ 3.
 *  Real-player gist imports often lack the flag (e.g. Duren on DET 4 yrs but
 *  the rollover never seeded it because his contract preserved through the
 *  expiring-FA branch which doesn't compute Bird). Derive from stats:
 *  ≥ 3 consecutive recent seasons with the same NBA tid. */
export function hasBirdRights(player: NBAPlayer): boolean {
  if ((player as any).hasBirdRights === true) return true;
  const stats: Array<{ season?: number; tid?: number; gp?: number; playoffs?: boolean }> = (player as any).stats ?? [];
  const sorted = stats
    .filter(s => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0 && (s.tid ?? -1) <= 29)
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
  if (sorted.length < 3) return false;
  const lastTid = sorted[0].tid;
  let consecutive = 0;
  for (const s of sorted) {
    if (s.tid === lastTid) consecutive++;
    else break;
  }
  return consecutive >= 3;
}

/** League-average of each team's top-N avg K2 — relative benchmark for strategy labels. */
export function leagueAvgTopNK2(players: NBAPlayer[], teams: { id: number }[], n = 3): number {
  if (teams.length === 0) return 0;
  const sum = teams.reduce((s, t) => s + topNAvgK2(players, t.id, n), 0);
  return sum / teams.length;
}

/**
 * Classifies a team's trade/FA outlook using cap position AND standings context.
 *
 * @param confRank         - 1–15 rank within conference (undefined = ignore standings)
 * @param gbFromLeader     - Games Behind the conference leader (undefined = ignore)
 * @param topThreeAvgK2    - Avg K2 OVR of team's top-3 players
 * @param leagueTopAvgK2   - League avg of each team's top-3 K2. When provided, uses
 *                           talentDelta-based relative classify instead of absolute ≥88 gate.
 */
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

  // Relative classify — uses talentDelta to avoid absolute-K2 inflation bias
  if (topThreeAvgK2 !== undefined && leagueTopAvgK2 !== undefined) {
    const talentDelta = topThreeAvgK2 - leagueTopAvgK2;
    if (winPct < 0.35)
      return { role: 'rebuilding', label: 'Rebuilding', color: 'text-purple-400', bgColor: 'bg-purple-500/20', dot: '#c084fc', reason: '' };
    if (winPct < 0.42)
      return talentDelta >= 3
        ? { role: 'seller', label: 'Underperforming', color: 'text-orange-400', bgColor: 'bg-orange-500/20', dot: '#fb923c', reason: '' }
        : { role: 'neutral', label: 'Mid', color: 'text-slate-400', bgColor: 'bg-slate-700/40', dot: '#94a3b8', reason: '' };
    if (winPct >= 0.55)
      return talentDelta >= 2
        ? { role: 'heavy_buyer', label: 'Contending', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: '' }
        : { role: 'buyer', label: 'Overachieving', color: 'text-sky-400', bgColor: 'bg-sky-500/20', dot: '#38bdf8', reason: '' };
    // winPct 0.42–0.54: playoff bubble
    if (payrollUSD >= thresholds.secondApron)
      return { role: 'seller', label: 'Retooling', color: 'text-amber-400', bgColor: 'bg-amber-500/20', dot: '#fbbf24', reason: '' };
    return { role: 'neutral', label: 'Mid', color: 'text-slate-400', bgColor: 'bg-slate-700/40', dot: '#94a3b8', reason: '' };
  }

  // Star-power override: if the top-3 players avg K2 ≥ 88, always Contending
  // (AI trade gate — absolute threshold kept for callers without league benchmark)
  if (topThreeAvgK2 !== undefined && topThreeAvgK2 >= 88) {
    return { role: 'heavy_buyer', label: 'Contending', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: '' };
  }

  // Standings-aware overrides
  const inPlayoffs   = confRank !== undefined && confRank <= 6;
  const inPlayIn     = confRank !== undefined && confRank >= 7 && confRank <= 10;
  const outsidePlayIn = confRank !== undefined && confRank > 10;
  const farBehind    = gbFromLeader !== undefined && gbFromLeader >= 10;
  const veryFarBehind = gbFromLeader !== undefined && gbFromLeader >= 15;

  // Top 3 seed + cap room = championship hunting
  if (confRank !== undefined && confRank <= 3 && capSpace > 5_000_000)
    return { role: 'heavy_buyer', label: 'Contending', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: '' };

  // Playoff team (top 6): buyer if cap space available OR under luxury tax (MLE available)
  if (inPlayoffs && (capSpace > 2_000_000 || payrollUSD < thresholds.luxuryTax))
    return { role: 'buyer', label: 'Contending', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: '' };

  // Play-in team with cap room = opportunistic buyer
  if (inPlayIn && (capSpace > 3_000_000 || payrollUSD < thresholds.luxuryTax - 5_000_000))
    return { role: 'buyer', label: 'Contending', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: '' };

  // Way out of it = rebuilding (regardless of cap)
  if (veryFarBehind || (outsidePlayIn && farBehind))
    return { role: 'rebuilding', label: 'Rebuilding', color: 'text-purple-400', bgColor: 'bg-purple-500/20', dot: '#c084fc', reason: '' };

  // Outside play-in + over tax + losing = motivated seller
  if (outsidePlayIn && isOverTax)
    return { role: 'seller', label: 'Seller', color: 'text-rose-400', bgColor: 'bg-rose-500/20', dot: '#f87171', reason: '' };

  // Fallbacks without standings data
  if (winPct >= 0.55 && (capSpace > 5_000_000 || payrollUSD < thresholds.luxuryTax))
    return { role: 'heavy_buyer', label: 'Contending', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', dot: '#6ee7b7', reason: '' };
  if (winPct >= 0.48 && (capSpace > 0 || payrollUSD < thresholds.luxuryTax))
    return { role: 'buyer', label: 'Contending', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: '#34d399', reason: '' };
  if (winPct < 0.35 || (winPct < 0.42 && expiringCount >= 3))
    return { role: 'rebuilding', label: 'Rebuilding', color: 'text-purple-400', bgColor: 'bg-purple-500/20', dot: '#c084fc', reason: '' };
  if (winPct < 0.46 && isOverTax)
    return { role: 'seller', label: 'Seller', color: 'text-rose-400', bgColor: 'bg-rose-500/20', dot: '#f87171', reason: '' };

  return { role: 'neutral', label: 'Neutral', color: 'text-slate-400', bgColor: 'bg-slate-700/40', dot: '#94a3b8', reason: '' };
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

/** Single source of truth for "team cap profile from live state".
 *  Looks up the team object and current season year from `state` so dead money
 *  is always folded into payroll. Use this instead of getTeamCapProfile when
 *  you have access to the full GameState — i.e. nearly everywhere. */
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
    t, team, state.leagueStats?.year,
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
): TeamCapProfile => {
  const payrollUSD = getTeamPayrollUSD(players, teamId, team, seasonYear);
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

// ─── Mid-Level Exception (MLE) ────────────────────────────────────────────────

export type MleType = 'room' | 'non_taxpayer' | 'taxpayer' | null;

export interface MleAvailability {
  /** Which MLE type the team qualifies for at this payroll level (null = none). */
  type: MleType;
  /** Full dollar limit for this MLE type. */
  limit: number;
  /** Dollars already spent from this exception this season. */
  used: number;
  /** Remaining dollars available (limit − used). 0 if blocked or conditions not met. */
  available: number;
  /** True when no exception is usable (over 2nd apron, already used conflicting exception, etc.). */
  blocked: boolean;
}

/**
 * Determine which MLE (if any) a team can use, and how much of it remains.
 *
 * @param teamId          - team to evaluate
 * @param payrollUSD      - current payroll (before hypothetical signing)
 * @param signingUSD      - first-year salary of the player being considered (0 = just check status)
 * @param thresholds      - from getCapThresholds()
 * @param leagueStats     - for MLE settings and usage tracking
 */
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
    apronsEnabled?: boolean;
    numberOfAprons?: number;
  },
): MleAvailability {
  const NONE: MleAvailability = { type: null, limit: 0, used: 0, available: 0, blocked: true };

  if (leagueStats.mleEnabled === false) return NONE;

  // Percentage settings scale with the cap (commissioner-tunable in EconomyContractsSection).
  // Fall back to raw USD when no percentage is configured.
  const cap = thresholds.salaryCap;
  const ls = leagueStats as any;
  const limitFromPct = (pct: number | undefined, fallbackUSD: number) =>
    typeof pct === 'number' ? Math.round(cap * (pct / 100)) : fallbackUSD;
  const ROOM_LIMIT = limitFromPct(ls.roomMlePercentage,        leagueStats.roomMleAmount        ?? 8_781_000);
  const NT_LIMIT   = limitFromPct(ls.nonTaxpayerMlePercentage, leagueStats.nonTaxpayerMleAmount ?? 14_104_000);
  const TAX_LIMIT  = limitFromPct(ls.taxpayerMlePercentage,    leagueStats.taxpayerMleAmount    ?? 5_685_000);

  const usage = leagueStats.mleUsage?.[teamId];
  const priorType   = usage?.type   ?? null;
  const priorUsed   = usage?.usedUSD ?? 0;

  const apronsActive = leagueStats.apronsEnabled !== false;
  const apronCount = leagueStats.numberOfAprons ?? 2;
  const firstApron = apronsActive && apronCount > 0 ? thresholds.firstApron : Number.POSITIVE_INFINITY;
  const secondApron = apronsActive && apronCount > 1 ? thresholds.secondApron : Number.POSITIVE_INFINITY;
  const projectedPayroll = payrollUSD + signingUSD;

  // ── Room MLE ───────────────────────────────────────────────────────────────
  // Team is below the salary cap AND hasn't used biannual/NT-MLE/taxpayer-MLE.
  if (payrollUSD < cap) {
    const blocked = priorType === 'non_taxpayer' || priorType === 'taxpayer';
    if (blocked) return NONE;
    const usedThisSeason = priorType === 'room' ? priorUsed : 0;
    const available = Math.max(0, ROOM_LIMIT - usedThisSeason);
    return { type: 'room', limit: ROOM_LIMIT, used: usedThisSeason, available, blocked: available === 0 };
  }

  // ── Over 2nd apron → no exceptions ─────────────────────────────────────────
  if (payrollUSD >= secondApron) return NONE;

  // ── Taxpayer MLE (check first: if signing busts the first apron) ───────────
  // First year salary causes team to cross the first apron, or already over it.
  // Must not have used: biannual, room exception, room MLE, NT-MLE.
  const crossesFirstApron = projectedPayroll >= firstApron || payrollUSD >= firstApron;
  if (crossesFirstApron) {
    const blocked = priorType === 'room' || priorType === 'non_taxpayer';
    if (blocked) return NONE;
    // Signing must not bust second apron
    if (projectedPayroll >= secondApron) return NONE;
    const usedThisSeason = priorType === 'taxpayer' ? priorUsed : 0;
    const available = Math.max(0, TAX_LIMIT - usedThisSeason);
    return { type: 'taxpayer', limit: TAX_LIMIT, used: usedThisSeason, available, blocked: available === 0 };
  }

  // ── Non-Taxpayer MLE ────────────────────────────────────────────────────────
  // Team is above cap AND below first apron; signing keeps them below first apron.
  // Must not have used room MLE or taxpayer MLE.
  if (payrollUSD >= cap && payrollUSD < firstApron && projectedPayroll < firstApron) {
    const blocked = priorType === 'room' || priorType === 'taxpayer';
    if (blocked) return NONE;
    const usedThisSeason = priorType === 'non_taxpayer' ? priorUsed : 0;
    const available = Math.max(0, NT_LIMIT - usedThisSeason);
    return { type: 'non_taxpayer', limit: NT_LIMIT, used: usedThisSeason, available, blocked: available === 0 };
  }

  return NONE;
}

// ─── Contract Offer Engine ────────────────────────────────────────────────────

/** Tier labels used for UI display (cosmetic only). */
export type ContractTier = 'Superstar' | 'Star' | 'All-Star' | 'Starter' | 'Bench' | 'Charity';

export interface ContractOffer {
  salaryUSD: number;    // annual value in USD
  years: number;        // contract length
  tier: ContractTier;
  hasPlayerOption: boolean; // player can opt out in final year
}

// Max contract % of cap by years of service; index = min(yrs, 10).
// Real NBA CBA tiers: 0-6 yrs = 25%, 7-9 yrs = 30%, 10+ yrs = 35%.
const MAX_CONTRACT_PCT = [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.30, 0.30, 0.30, 0.35];

// Min contract $M calibrated at cap = $154.6M; index = min(yrs, 10).
// Mirrors the NBA minimum-salary schedule (0-yr rookie ≈ $1.27M → 10+ vet ≈ $3.97M).
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
  | 'supermaxEnabled'
  | 'supermaxPercentage'
  | 'supermaxMinYears'
  | 'rookieExtEnabled'
  | 'rookieExtPct'
  | 'rookieExtRosePct'
>;

/**
 * True if the player meets supermax award criteria.
 * Real NBA CBA: the Designated Veteran Player Extension (a.k.a. supermax) requires
 * BOTH the service threshold AND the award criteria — there is no "10+ YOS auto-qualify"
 * shortcut. A 10-year vet without recent MVP/DPOY/All-NBA recognition signs at the
 * regular service-tiered max (35% of cap from the 10+ YOS tier), not the supermax 35%.
 *
 * Criteria (must satisfy ≥ minYears AND one of):
 *   - MVP or DPOY in the previous 3 seasons
 *   - All-NBA in the immediately preceding season
 *   - All-NBA in 2 of the previous 3 seasons
 */
export function isSupermaxAwardQualified(
  awards: Array<{ season: number; type: string }>,
  currentSeason: number,
  yearsOfService: number,
  minYears: number,
): boolean {
  if (yearsOfService < minYears) return false;
  // MVP or DPOY in last 3 seasons
  if (awards.some(a => a.season >= currentSeason - 2 && /mvp|defensive player|dpoy/i.test(a.type))) return true;
  // All-NBA in immediately preceding season
  if (awards.some(a => a.season === currentSeason && /all.nba/i.test(a.type))) return true;
  // All-NBA in 2 of the previous 3 seasons
  const allNbaSeasons = new Set(
    awards.filter(a => a.season >= currentSeason - 2 && /all.nba/i.test(a.type)).map(a => a.season),
  );
  return allNbaSeasons.size >= 2;
}

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

  // Awards + current season — needed for both supermax and rookie ext checks.
  const playerAwards: Array<{ season: number; type: string }> = (player as any).awards ?? [];
  const playerCurrentSeason = (player as any).stats?.reduce((m: number, s: any) => Math.max(m, s.season ?? 0), 0) ?? 0;

  // ── Supermax eligibility ─────────────────────────────────────────────────
  const supermaxEnabled = leagueStats.supermaxEnabled ?? true;
  const supermaxPct = (leagueStats.supermaxPercentage ?? 35) / 100;
  const supermaxMinYrs = leagueStats.supermaxMinYears ?? 8;
  let isSupermaxEligible: boolean;
  if ((player as any).superMaxEligible !== undefined) {
    isSupermaxEligible = supermaxEnabled && !!(player as any).superMaxEligible;
  } else {
    const hasBirdRights = (player as any).hasBirdRights ?? false;
    isSupermaxEligible = supermaxEnabled && hasBirdRights &&
      isSupermaxAwardQualified(playerAwards, playerCurrentSeason, yearsOfService, supermaxMinYrs);
  }

  // ── Rookie extension (Derrick Rose Rule) ────────────────────────────────
  // Only available from own team (hasBirdRights). 25% standard, 30% with Rose Rule awards.
  const hasBirdRightsForRookieExt = (player as any).hasBirdRights ?? false;
  const rookieExtEnabled = leagueStats.rookieExtEnabled ?? true;
  const rookieExtPct    = (leagueStats.rookieExtPct    ?? 25) / 100;
  const rookieExtRosePct = (leagueStats.rookieExtRosePct ?? 30) / 100;
  const inRookieExtWindow = hasBirdRightsForRookieExt && yearsOfService >= 3 && yearsOfService <= 4;
  const rookieRoseQualified = inRookieExtWindow &&
    isSupermaxAwardQualified(playerAwards, playerCurrentSeason, yearsOfService, 3);

  // ── Max contract ────────────────────────────────────────────────────────
  let maxContractUSD: number;
  if (isSupermaxEligible) {
    maxContractUSD = capM * supermaxPct * 1_000_000;
  } else if (rookieExtEnabled && inRookieExtWindow) {
    const pct = rookieRoseQualified ? rookieExtRosePct : rookieExtPct;
    maxContractUSD = capM * pct * 1_000_000;
  } else if ((leagueStats.maxContractType ?? 'service_tiered') === 'service_tiered') {
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
  // Older players have less upside — weight POT less as age rises.
  const age = (player as any).age ?? 27;
  const potWeight = age < 24 ? 0.65 : age < 28 ? 0.50 : age < 32 ? 0.35 : 0.20;
  const score = ovr * (1 - potWeight) + pot * potWeight;

  // ── Tier ────────────────────────────────────────────────────────────────
  let tier: ContractTier;
  if      (score >= 95) tier = 'Superstar';
  else if (score >= 90) tier = 'Star';
  else if (score >= 85) tier = 'All-Star';
  else if (score >= 78) tier = 'Starter';
  else if (score >= 72) tier = 'Bench';
  else                  tier = 'Charity';

  // ── Base salary ─────────────────────────────────────────────────────────
  // Supermax and Rose Rule players command their full ceiling — the market price
  // IS the designated max, not a scaled fraction of it.
  const normalised = Math.max(0, score - 68) / (99 - 68);
  // Exponent 1.3 (was 1.6) — 1.6 was too punitive on the K2 70-90 mid-tier band.
  // Real NBA: K2 76 rotation player gets ~$15M; with ^1.6 the formula gave $7M.
  // With ^1.3: K2 88 = 56% of max, K2 80 = 30%, K2 76 = 18% — closer to real-NBA
  // mid-tier deals while preserving the curve shape (stars still get most of cap).
  let salaryUSD = (isSupermaxEligible || rookieRoseQualified)
    ? maxContractUSD
    : Math.max(minSalaryUSD, maxContractUSD * Math.pow(normalised, 1.3));

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

  // ── External-league NBA-offer cap ───────────────────────────────────────
  // BBGM overrates overseas ratings, so PBA / B-League / etc. can otherwise score 75+ OVR
  // and trigger NBA mid-tier money. Cap the offer at ~3× the peak salary for that league —
  // realistic NBA step-up for overseas stars, while the minSalary floor protects NBA minimum.
  // EXTERNAL_SALARY_SCALE (constants.ts) is the single source of truth for peak overseas pay.
  const scale = EXTERNAL_SALARY_SCALE[(player as any).status ?? ''];
  if (scale) {
    const externalPeakUSD = salaryCapUSD * scale.maxPct;
    salaryUSD = Math.min(salaryUSD, externalPeakUSD * 3);
  }

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

// ── External-league buyout ────────────────────────────────────────────────────
// Real NBA rule (2024-25 CBA): an NBA team can contribute up to the FIBA buyout cap
// (~$825K, rises with the cap each year); the rest of the buyout is on the player.
// Overseas clubs negotiate buyouts; realistic estimates scale by league strength,
// player OVR, and years left on their current deal.

export interface ExternalBuyout {
  applicable: boolean;
  estimatedBuyoutUSD: number;       // total the overseas club asks
  teamMaxContributionUSD: number;   // FIBA cap — league setting, defaults to $825K
  recommendedTeamContribUSD: number;// sensible default (min of cap vs. half of buyout)
  playerContributionUSD: number;    // what the player covers out of pocket
  league: string;                   // human-readable source league
}

const EXTERNAL_STATUSES = ['Euroleague', 'China CBA', 'NBL Australia', 'Endesa', 'B-League', 'PBA', 'G-League'] as const;

// League-strength multipliers for buyout estimates.
// Euroleague clubs command the biggest buyouts; G-League has no buyout (two-way convertible).
const BUYOUT_LEAGUE_MULT: Record<string, number> = {
  Euroleague:     1.00,
  'China CBA':    0.80,
  'NBL Australia':0.60,
  Endesa:         0.55,
  'B-League':     0.45,
  PBA:            0.40,
  'G-League':     0.00,
};

export function computeExternalBuyout(
  player: NBAPlayer,
  leagueStats: ContractLeagueStats & { teamBuyoutMaxUSD?: number; year?: number },
): ExternalBuyout {
  const status = player.status ?? '';
  if (!(EXTERNAL_STATUSES as readonly string[]).includes(status)) {
    return { applicable: false, estimatedBuyoutUSD: 0, teamMaxContributionUSD: 0, recommendedTeamContribUSD: 0, playerContributionUSD: 0, league: status };
  }
  const mult = BUYOUT_LEAGUE_MULT[status] ?? 0.3;
  if (mult === 0) {
    // G-League has no buyout — NBA teams can promote directly.
    return { applicable: false, estimatedBuyoutUSD: 0, teamMaxContributionUSD: 0, recommendedTeamContribUSD: 0, playerContributionUSD: 0, league: status };
  }
  const cap = leagueStats.salaryCap ?? 154_647_000;
  // FIBA cap scales with the salary cap (2024-25 ratio: $825K / $140.6M ≈ 0.59%).
  const teamMaxContributionUSD = leagueStats.teamBuyoutMaxUSD ?? Math.round(cap * 0.00586);
  // Reuse the existing market-value math — computeContractOffer already factors OVR, POT, and age.
  // Overseas annual salary ≈ NBA market × league-strength mult. Buyout is ~1 year of that.
  const marketOffer = computeContractOffer(player, leagueStats as any);
  const baseUSD = marketOffer.salaryUSD * mult;
  const estimatedBuyoutUSD = Math.max(100_000, Math.round(baseUSD / 10_000) * 10_000);
  const recommendedTeamContribUSD = Math.min(teamMaxContributionUSD, Math.round(estimatedBuyoutUSD * 0.5));
  const playerContributionUSD = Math.max(0, estimatedBuyoutUSD - recommendedTeamContribUSD);
  return {
    applicable: true,
    estimatedBuyoutUSD,
    teamMaxContributionUSD,
    recommendedTeamContribUSD,
    playerContributionUSD,
    league: status,
  };
}

export interface ContractLimits {
  minSalaryUSD: number;
  maxSalaryUSD: number;
  maxPct: number;
  isSupermaxEligible: boolean;
  isRookieExtEligible: boolean;
  rookieRoseQualified: boolean;
}

export function getContractLimits(
  player: NBAPlayer,
  leagueStats: ContractLeagueStats,
): ContractLimits {
  const salaryCapUSD = leagueStats.salaryCap ?? (BASE_CAP_M * 1_000_000);
  const capM = salaryCapUSD / 1_000_000;

  const yearsOfService = (player as any).stats
    ? (player as any).stats.filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length
    : 0;
  const svcIdx = Math.min(yearsOfService, 10);

  const supermaxEnabled = leagueStats.supermaxEnabled ?? true;
  const supermaxPct = (leagueStats.supermaxPercentage ?? 35) / 100;
  const supermaxMinYrs = leagueStats.supermaxMinYears ?? 8;
  // Always compute fresh eligibility — union cached flag with live check so mid-season
  // awards (All-NBA / MVP / DPOY) are caught without waiting for next rollover.
  const awards: Array<{ season: number; type: string }> = (player as any).awards ?? [];
  const currentSeason = (player as any).stats?.reduce((m: number, s: any) => Math.max(m, s.season ?? 0), 0) ?? 0;
  const hasBirdRightsForSupermax = (player as any).hasBirdRights ?? false;
  const cachedSupermax = (player as any).superMaxEligible === true;
  const freshSupermax = hasBirdRightsForSupermax &&
    isSupermaxAwardQualified(awards, currentSeason, yearsOfService, supermaxMinYrs);
  const isSupermaxEligible = supermaxEnabled && (cachedSupermax || freshSupermax);

  // ── Rookie extension (Derrick Rose Rule) ────────────────────────────────
  // Own-team only (hasBirdRights). 25% standard, 30% with Rose Rule awards.
  const rookieExtEnabled  = leagueStats.rookieExtEnabled  ?? true;
  const rookieExtPct      = (leagueStats.rookieExtPct     ?? 25) / 100;
  const rookieExtRosePct  = (leagueStats.rookieExtRosePct ?? 30) / 100;
  const inRookieExtWindow = hasBirdRightsForSupermax && yearsOfService >= 3 && yearsOfService <= 4;
  const rookieRoseQualified = inRookieExtWindow &&
    isSupermaxAwardQualified(awards, currentSeason, yearsOfService, 3);
  const isRookieExtEligible = rookieExtEnabled && inRookieExtWindow;

  // ── Max salary ─────────────────────────────────────────────────────────────
  const maxType = (leagueStats as any).maxContractType ?? 'service_tiered';
  let maxPct: number;
  let maxSalaryUSD: number;
  if (maxType === 'none') {
    maxPct = 1;
    maxSalaryUSD = salaryCapUSD * 10;
  } else if (isSupermaxEligible) {
    maxPct = supermaxPct;
    maxSalaryUSD = capM * supermaxPct * 1_000_000;
  } else if (isRookieExtEligible) {
    maxPct = rookieRoseQualified ? rookieExtRosePct : rookieExtPct;
    maxSalaryUSD = capM * maxPct * 1_000_000;
  } else if (maxType === 'service_tiered') {
    maxPct = MAX_CONTRACT_PCT[svcIdx];
    maxSalaryUSD = capM * maxPct * 1_000_000;
  } else {
    maxPct = ((leagueStats as any).maxContractStaticPercentage ?? 25) / 100;
    maxSalaryUSD = capM * maxPct * 1_000_000;
  }

  // ── Min salary ─────────────────────────────────────────────────────────────
  // Reads EconomyContractsSection: minContractType ('none' | 'static' | 'dynamic'),
  // minContractStaticAmount (millions, per the "M" UI label).
  const minType = (leagueStats as any).minContractType ?? 'dynamic';
  const staticMinM = (leagueStats as any).minContractStaticAmount ?? 1.273;
  let minSalaryUSD: number;
  if (minType === 'none') {
    minSalaryUSD = 0;
  } else if (minType === 'static') {
    minSalaryUSD = staticMinM * 1_000_000;
  } else {
    // dynamic — scale the NBA service-tier schedule up/down against the configured cap
    // and against a commissioner-tunable year-0 floor.
    const baseM = MIN_CONTRACT_BASE_M[svcIdx];
    const yr0M  = MIN_CONTRACT_BASE_M[0];
    const floorAdj = staticMinM / yr0M;                  // 1.0 = NBA default
    minSalaryUSD = (baseM / BASE_CAP_M) * capM * floorAdj * 1_000_000;
  }

  return { minSalaryUSD, maxSalaryUSD, maxPct, isSupermaxEligible, isRookieExtEligible, rookieRoseQualified };
}
