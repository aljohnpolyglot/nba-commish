import type { LeagueStats } from '../types';
import { INITIAL_LEAGUE_STATS, PBA_ISOLATED_DEFAULTS, EXTERNAL_SALARY_SCALE } from '../constants';
import { LEAGUE_MULTIPLIERS, calculateLeagueOverall } from './logic/leagueOvr';

/** Returns true if the URL is ProBallers' "no photo" placeholder. Treat as missing. */
function isDefaultProballers(url: string | undefined): boolean {
  return !!url && url.includes('head-par-defaut');
}

/** Returns the imgURL from ProBallers ratings gist, treating the default placeholder as absent. */
export function resolveImgURL(itemUrl: string | undefined, bioImage?: string): string | undefined {
  const ratingsPng = itemUrl && itemUrl.trim() !== '' && !isDefaultProballers(itemUrl) ? itemUrl : undefined;
  const bioImg = bioImage && bioImage.trim() !== '' && !isDefaultProballers(bioImage) ? bioImage : undefined;
  return ratingsPng ?? bioImg;
}

export function extractJerseyNumber(player: { jerseyNumber?: string | number; stats?: Array<{ jerseyNumber?: string | number }> }): string | undefined {
  const latestStats = player.stats
    ?.filter(s => s.jerseyNumber !== undefined && s.jerseyNumber !== null && s.jerseyNumber !== '')
    .sort((a: any, b: any) => Number(b?.season ?? 0) - Number(a?.season ?? 0))[0];
  const raw = latestStats?.jerseyNumber ?? player.jerseyNumber;
  return raw === undefined || raw === null || raw === '' ? undefined : String(raw);
}

const ATTR_SKIP = new Set(['hgt', 'ft', 'season', 'ovr', 'pot', 'fuzz', 'injuryIndex', 'skills', 'jerseyNumber']);

export function scaleRatings(ratings: any[], mult: number, hgtMult?: number): any[] {
  if (!ratings.length) return ratings;
  return ratings.map(r => {
    const out: any = {};
    for (const [k, v] of Object.entries(r)) {
      if (typeof v !== 'number') {
        out[k] = v;
      } else if (k === 'hgt') {
        out[k] = hgtMult ? Math.round((v as number) * hgtMult) : v;
      } else if (ATTR_SKIP.has(k)) {
        out[k] = v;
      } else {
        out[k] = mult < 1.0 ? Math.round((v as number) * mult) : v;
      }
    }
    return out;
  });
}

export function computeLeagueOvr(rawRatings: any, league: string): number {
  const mult = LEAGUE_MULTIPLIERS[league] ?? 1.0;

  if (league === 'PBA') {
    return calculateLeagueOverall(rawRatings, league);
  }

  const srcOvr = rawRatings?.ovr;
  if (srcOvr && srcOvr > 0 && srcOvr <= 100) {
    return Math.round(Math.max(10, srcOvr * mult));
  }

  return calculateLeagueOverall(rawRatings, league);
}

export type PBAEconomyConfig = {
  salaryCapUSD: number;
  minSalaryUSD: number;
  maxSalaryPct: number;
};

type PBAEconomySource = Pick<LeagueStats, 'salaryCap' | 'minContractStaticAmount' | 'maxContractStaticPercentage'>;

export function getPBARosterEconomyConfig(
  leagueStats?: Partial<PBAEconomySource>,
  mode: 'pba_isolated' | 'external' = 'pba_isolated',
): PBAEconomyConfig {
  const salaryCapUSD = leagueStats?.salaryCap
    ?? (mode === 'pba_isolated'
      ? PBA_ISOLATED_DEFAULTS.salaryCap
      : INITIAL_LEAGUE_STATS.salaryCap)
    ?? INITIAL_LEAGUE_STATS.salaryCap;

  if (mode === 'external') {
    const scale = EXTERNAL_SALARY_SCALE.PBA ?? { minPct: 0.001, maxPct: 0.0088 };
    return {
      salaryCapUSD,
      minSalaryUSD: Math.round(salaryCapUSD * scale.minPct),
      maxSalaryPct: scale.maxPct * 100,
    };
  }

  const minContractStaticAmount = leagueStats?.minContractStaticAmount
    ?? PBA_ISOLATED_DEFAULTS.minContractStaticAmount
    ?? INITIAL_LEAGUE_STATS.minContractStaticAmount
    ?? 0;
  const maxContractStaticPercentage = leagueStats?.maxContractStaticPercentage
    ?? PBA_ISOLATED_DEFAULTS.maxContractStaticPercentage
    ?? INITIAL_LEAGUE_STATS.maxContractStaticPercentage
    ?? 0;

  return {
    salaryCapUSD,
    minSalaryUSD: Math.round(minContractStaticAmount * 1_000_000),
    maxSalaryPct: maxContractStaticPercentage,
  };
}

function computeImportedPBASalaryUSD(ovr: number, economy: PBAEconomyConfig): number {
  const ovrNorm = Math.max(0, Math.min(1, (ovr - 35) / 11));
  const maxSalaryUSD = Math.round(economy.salaryCapUSD * (economy.maxSalaryPct / 100));
  return Math.round(economy.minSalaryUSD + ovrNorm * Math.max(0, maxSalaryUSD - economy.minSalaryUSD));
}

export function normalizeImportedPBAContract(contract: any, pbaOvr: number, economy: PBAEconomyConfig): any {
  const salaryUSD = computeImportedPBASalaryUSD(pbaOvr, economy);
  const exp = Number(contract?.exp ?? 2026);
  return {
    ...(contract ?? {}),
    amount: Math.round(salaryUSD / 1_000),
    exp: Number.isFinite(exp) && exp > 0 ? exp : 2026,
  };
}
