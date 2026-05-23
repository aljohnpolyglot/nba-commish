import type { NBAPlayer } from '../../types';
import { CLUB_NATIONALITY_MAP, NATIONALITY_LEAGUE_BIAS, NATIONALITY_LEAGUE_WEIGHTS } from '../../constants';
import { pickWeighted } from '../genDraftPlayers';

let collegesByLeague: Record<string, Map<string, number>> = {};
let retireCollegeOutflow: Record<string, Record<string, number>> = {};

export function resolveNationalityLeague(country: string, rng: number): string | null {
  const weighted = NATIONALITY_LEAGUE_WEIGHTS[country];
  if (weighted && weighted.length > 0) {
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = rng * total;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll <= 0) return entry.league;
    }
    return weighted[weighted.length - 1].league;
  }
  return (NATIONALITY_LEAGUE_BIAS as Record<string, string>)[country] ?? null;
}

export function initCollegeTracking(players: NBAPlayer[]): void {
  collegesByLeague = {};
  for (const player of players) {
    const league = (player as any).status ?? '';
    const college = (player as any).college ?? '';
    if (!league || !college) continue;
    if (!collegesByLeague[league]) collegesByLeague[league] = new Map();
    const current = collegesByLeague[league].get(college) ?? 0;
    collegesByLeague[league].set(college, current + 1);
  }
}

export function recordRetiredCollege(league: string, college: string): void {
  if (!college) return;
  retireCollegeOutflow[league] = retireCollegeOutflow[league] ?? {};
  retireCollegeOutflow[league][college] = (retireCollegeOutflow[league][college] ?? 0) + 1;
}

export function pickCollegeForLeague(league: string, rng: number): string {
  const outflow = retireCollegeOutflow[league] ?? {};
  const outflowKeys = Object.keys(outflow);
  const pool = collegesByLeague[league];

  if (rng < 0.7 && outflowKeys.length > 0) {
    return pickWeighted(outflow) ?? '';
  }
  if (pool && pool.size > 0) {
    const weights: Record<string, number> = {};
    pool.forEach((count, college) => {
      weights[college] = count;
    });
    return pickWeighted(weights) ?? '';
  }
  return '';
}

const EUROPEAN_NATIONALITIES = new Set([
  'Spain', 'France', 'Germany', 'Italy', 'Serbia', 'Greece', 'Turkey', 'Russia',
  'Lithuania', 'Latvia', 'Estonia', 'Croatia', 'Slovenia', 'Bosnia', 'Montenegro',
  'North Macedonia', 'Bulgaria', 'Romania', 'Poland', 'Czech Republic', 'Slovakia',
  'Hungary', 'Austria', 'Switzerland', 'Netherlands', 'Belgium', 'Portugal',
  'Ukraine', 'Belarus', 'Georgia', 'Armenia', 'Israel', 'Sweden', 'Norway',
  'Denmark', 'Finland',
]);

const APAC_NATIONALITIES = new Set([
  'Japan', 'Australia', 'New Zealand', 'China', 'Philippines', 'South Korea',
  'Taiwan', 'Hong Kong', 'Indonesia', 'Malaysia', 'Vietnam', 'Thailand',
]);

export function resolveClubAffinity(tid: number, playerCountry: string): number {
  const clubCountry = CLUB_NATIONALITY_MAP[tid];
  if (!clubCountry) return 1.0;
  if (clubCountry === playerCountry) return 3.0;
  const isEuroClub = EUROPEAN_NATIONALITIES.has(clubCountry);
  const isEuroPlayer = EUROPEAN_NATIONALITIES.has(playerCountry);
  if (isEuroClub && isEuroPlayer) return 1.5;
  const isApacClub = APAC_NATIONALITIES.has(clubCountry);
  const isApacPlayer = APAC_NATIONALITIES.has(playerCountry);
  if (isApacClub && isApacPlayer) return 1.5;
  return 0.5;
}
