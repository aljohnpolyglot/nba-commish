import type { LeagueStats } from '../types';
import {
  EXTERNAL_LEAGUE_OVR_CAP,
  INITIAL_LEAGUE_STATS,
  PBA_ISOLATED_DEFAULTS,
  EXTERNAL_SALARY_SCALE,
} from '../constants';
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

export function extractJerseyNumber(
  player: { jerseyNumber?: string | number; stats?: Array<{ jerseyNumber?: string | number; season?: number }> },
  throughSeason?: number,
): string | undefined {
  const latestStats = player.stats
    ?.filter(s => (
      s.jerseyNumber !== undefined
      && s.jerseyNumber !== null
      && s.jerseyNumber !== ''
      && (throughSeason === undefined || Number(s.season) <= throughSeason)
    ))
    .sort((a: any, b: any) => Number(b?.season ?? 0) - Number(a?.season ?? 0))[0];
  const raw = latestStats?.jerseyNumber ?? (throughSeason === undefined ? player.jerseyNumber : undefined);
  return raw === undefined || raw === null || raw === '' ? undefined : String(raw);
}

const ATTR_SKIP = new Set([
  'tid',
  'hgt',
  'ft',
  'season',
  'ovr',
  'pot',
  'fuzz',
  'injuryIndex',
  'skills',
  'jerseyNumber',
  'pbaImportSourceSeason',
]);

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
  const cap = EXTERNAL_LEAGUE_OVR_CAP[league];

  const srcOvr = rawRatings?.ovr;
  const ovr = srcOvr && srcOvr > 0 && srcOvr <= 100
    ? Math.round(Math.max(10, srcOvr * mult))
    : calculateLeagueOverall(rawRatings, league);

  return cap !== undefined && league !== 'PBA' ? Math.min(ovr, cap) : ovr;
}

export type PBAEconomyConfig = {
  salaryCapUSD: number;
  minSalaryUSD: number;
  maxSalaryPct: number;
  economyScale: number;
};

type PBAContractPlayerLike = {
  internalId?: string;
  name?: string;
  tid?: number;
  born?: { year?: number };
  age?: number;
  stats?: Array<{ playoffs?: boolean; gp?: number }>;
};

type PBAEconomySource = Pick<
  LeagueStats,
  'salaryCap' | 'minContractStaticAmount' | 'maxContractStaticPercentage' | 'historicalEconomyScale'
>;

export function getPBARosterEconomyConfig(
  leagueStats?: Partial<PBAEconomySource>,
  mode: 'pba_isolated' | 'external' = 'pba_isolated',
): PBAEconomyConfig {
  const baseSalaryCapUSD = leagueStats?.salaryCap
    ?? (mode === 'pba_isolated'
      ? PBA_ISOLATED_DEFAULTS.salaryCap
      : INITIAL_LEAGUE_STATS.salaryCap)
    ?? INITIAL_LEAGUE_STATS.salaryCap;
  const rawEconomyScale = mode === 'pba_isolated'
    ? Number(leagueStats?.historicalEconomyScale ?? 1)
    : 1;
  const economyScale = Number.isFinite(rawEconomyScale)
    ? Math.max(0.05, rawEconomyScale)
    : 1;
  const salaryCapUSD = Math.round(baseSalaryCapUSD * economyScale);

  if (mode === 'external') {
    const scale = EXTERNAL_SALARY_SCALE.PBA ?? { minPct: 0.001, maxPct: 0.0088 };
    return {
      salaryCapUSD,
      minSalaryUSD: Math.round(salaryCapUSD * scale.minPct),
      maxSalaryPct: scale.maxPct * 100,
      economyScale,
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
    minSalaryUSD: Math.round(minContractStaticAmount * 1_000_000 * economyScale),
    maxSalaryPct: maxContractStaticPercentage,
    economyScale,
  };
}

function computeImportedPBASalaryUSD(ovr: number, economy: PBAEconomyConfig): number {
  const maxSalaryUSD = Math.round(economy.salaryCapUSD * (economy.maxSalaryPct / 100));
  const importFloorUSD = Math.max(
    Math.round(economy.minSalaryUSD * 4),
    Math.round(maxSalaryUSD * 0.35),
  );
  const ovrNorm = Math.max(0, Math.min(1, (ovr - 34) / 18));
  const scaledUSD = importFloorUSD + Math.pow(ovrNorm, 1.15) * Math.max(0, maxSalaryUSD - importFloorUSD);
  return Math.round(Math.min(maxSalaryUSD, Math.max(importFloorUSD, scaledUSD)));
}

function seededUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function computeLocalPBASalaryUSD(
  pbaOvr: number,
  economy: PBAEconomyConfig,
  player?: PBAContractPlayerLike,
  currentYear = new Date().getFullYear(),
): number {
  const minSalaryUSD = Math.max(2_500, economy.minSalaryUSD);
  const maxSalaryUSD = Math.max(minSalaryUSD, Math.round(economy.salaryCapUSD * (economy.maxSalaryPct / 100)));
  const age = player?.born?.year ? currentYear - player.born.year : player?.age ?? 28;
  const service = (player?.stats ?? []).filter(row => !row.playoffs && (row.gp ?? 0) > 0).length;
  const ratingScore = Math.pow(Math.max(0, Math.min(1, (pbaOvr - 15) / 25)), 1.15);
  const veteranBump =
    age >= 36 ? 0.10 :
    age >= 32 ? 0.18 :
    age >= 29 ? 0.12 :
    age <= 23 ? -0.06 :
    0;
  const serviceBump = Math.min(0.10, service * 0.012);
  const seed = seededUnit(`${player?.internalId ?? ''}|${player?.name ?? ''}|${player?.tid ?? ''}|${pbaOvr}`);
  const noise = (seed - 0.5) * 0.18;
  const score = Math.max(0, Math.min(1, ratingScore + veteranBump + serviceBump + noise));
  return Math.round(minSalaryUSD + score * (maxSalaryUSD - minSalaryUSD));
}

export function normalizeImportedPBAContract(contract: any, pbaOvr: number, economy: PBAEconomyConfig, player?: PBAContractPlayerLike): any {
  const salaryUSD = contract?.isImport
    ? computeImportedPBASalaryUSD(pbaOvr, economy)
    : computeLocalPBASalaryUSD(pbaOvr, economy, player);
  const exp = Number(contract?.exp ?? 2026);
  return {
    ...(contract ?? {}),
    amount: Math.round(salaryUSD / 1_000),
    exp: Number.isFinite(exp) && exp > 0 ? exp : 2026,
  };
}
