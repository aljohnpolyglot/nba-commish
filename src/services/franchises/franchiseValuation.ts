import type { GameState, NBATeam } from '../../types';
import { getPopulation } from '../../data/fictionalTeams';
import { ZENGM_EXPANSION_POOL } from '../../data/expansionTeamPool';
import { getSeasonEconomyIndex } from '../tycoon/clubFinance';
import { ensureFranchiseOperations, isJerseyPatchAvailable } from './franchiseState';
import { getFranchiseSponsorRevenue } from './franchiseSponsors';
import { getFranchiseSourceSeason } from './franchiseMath';
import { NBA_TEAM_META } from '../../data/franchises/nbaTeamMeta';

export type FranchiseMarketTier =
  | 'Tier 1 Mega'
  | 'Tier 2 Large'
  | 'Tier 3 Mid'
  | 'Tier 4 Small';

export interface FranchiseValuationSnapshot {
  populationMillions: number;
  marketTier: FranchiseMarketTier;
  championships: number;
  recentChampionships: number;
  recentFinals: number;
  valuationUSD: number;
}

const META_ALIASES: Record<string, string> = {
  BKN: 'BRK',
  NJN: 'BRK',
  PHX: 'PHO',
  SEA: 'OKC',
  WSB: 'WAS',
};

const parsePopulation = (value: string | undefined) => {
  const parsed = Number(String(value ?? '').match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const eraScale = (season: number) => {
  const points: Array<[number, number]> = [
    [1946, 0.002],
    [1960, 0.004],
    [1970, 0.007],
    [1980, 0.012],
    [1990, 0.045],
    [2000, 0.12],
    [2010, 0.3],
    [2020, 0.7],
    [2026, 1],
  ];
  if (season <= points[0][0]) return points[0][1];
  if (season >= 2026) return Math.pow(1.035, season - 2026);
  for (let index = 1; index < points.length; index += 1) {
    const [endYear, endValue] = points[index];
    const [startYear, startValue] = points[index - 1];
    if (season <= endYear) {
      const progress = (season - startYear) / (endYear - startYear);
      return startValue + (endValue - startValue) * progress;
    }
  }
  return 1;
};

const hasDistinctSavedPopulations = (state: GameState) => {
  const values = state.teams
    .map(team => Number(team.pop))
    .filter(value => Number.isFinite(value) && value > 0)
    .map(value => value.toFixed(1));
  if (values.length < Math.max(2, Math.floor(state.teams.length / 2))) return false;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Math.max(...counts.values()) < Math.ceil(values.length * 0.6);
};

const modernMarketPopulation = (team: NBATeam) => {
  const abbrev = team.abbrev.toUpperCase();
  const expansion = ZENGM_EXPANSION_POOL.find(candidate =>
    candidate.abbrev.toUpperCase() === abbrev
    || candidate.region.toLowerCase() === String(team.region ?? '').toLowerCase(),
  );
  if (expansion?.pop) return expansion.pop;
  const meta = NBA_TEAM_META[META_ALIASES[abbrev] ?? abbrev];
  return parsePopulation(meta?.marketPopulation) ?? getPopulation(abbrev);
};

const getPopulationAtSeason = (state: GameState, team: NBATeam, sourceSeason: number) => {
  if (state.leagueType === 'fictional') {
    return Math.max(0.1, Number(team.pop) || getPopulation(team.abbrev));
  }
  const seasonPopulation = [...(team.seasons ?? [])]
    .filter(row => row.season <= sourceSeason && Number.isFinite(Number(row.pop)) && Number(row.pop) > 0)
    .sort((left, right) => right.season - left.season)[0]?.pop;
  if (seasonPopulation) return Number(seasonPopulation);
  if (hasDistinctSavedPopulations(state) && Number(team.pop) > 0) return Number(team.pop);
  const modern = modernMarketPopulation(team);
  return Math.max(0.1, modern / Math.pow(1.009, Math.max(0, 2026 - sourceSeason)));
};

const getFranchiseSuccess = (state: GameState, team: NBATeam, season: number) => {
  const championships = new Set<number>();
  const finals = new Set<number>();
  for (const row of team.seasons ?? []) {
    const year = Number(row.season);
    if (!Number.isFinite(year) || year > season) continue;
    if (Number(row.playoffRoundsWon) >= 3) finals.add(year);
    if (Number(row.playoffRoundsWon) >= 4) championships.add(year);
  }
  for (const award of state.historicalAwards ?? []) {
    const year = Number(award.season);
    if (!Number.isFinite(year) || year > season || Number(award.tid) !== team.id) continue;
    if (/champion/i.test(award.type) && !/conference|cup|division/i.test(award.type)) {
      championships.add(year);
      finals.add(year);
    }
  }
  for (const row of state.seasonHistory ?? []) {
    if (row.year > season) continue;
    if (row.championTid === team.id) {
      championships.add(row.year);
      finals.add(row.year);
    } else if (row.runnerUpTid === team.id) {
      finals.add(row.year);
    }
  }
  const recentStart = season - 8;
  return {
    championships: championships.size,
    recentChampionships: [...championships].filter(year => year >= recentStart).length,
    recentFinals: [...finals].filter(year => year >= recentStart).length,
  };
};

const marketTier = (population: number): FranchiseMarketTier => {
  if (population >= 7.5) return 'Tier 1 Mega';
  if (population >= 4) return 'Tier 2 Large';
  if (population >= 2) return 'Tier 3 Mid';
  return 'Tier 4 Small';
};

export function getFranchiseValuationSnapshot(
  state: GameState,
  team: NBATeam,
): FranchiseValuationSnapshot {
  const season = state.leagueStats.year;
  const sourceSeason = getFranchiseSourceSeason(state, season);
  const populationMillions = getPopulationAtSeason(state, team, sourceSeason);
  const success = getFranchiseSuccess(state, team, season);
  const franchise = ensureFranchiseOperations(state, team);
  const games = Math.max(1, team.wins + team.losses);
  const winRate = team.wins / games;
  const baseValue = 1_050_000_000
    + populationMillions * 190_000_000
    + franchise.arena.capacity * 16_000
    + getFranchiseSponsorRevenue(franchise, season, isJerseyPatchAvailable(state.leagueStats)) * 12;
  const legacyFactor = 1 + Math.log1p(success.championships) * 0.11;
  const dynastyFactor = 1
    + success.recentChampionships * 0.24
    + Math.max(0, success.recentFinals - success.recentChampionships) * 0.05;
  const performanceFactor = 0.88 + winRate * 0.28;
  const economyGrowth = getSeasonEconomyIndex(state, season)
    / Math.max(0.05, getSeasonEconomyIndex(state, sourceSeason));
  const valuationUSD = Math.round(
    baseValue
    * legacyFactor
    * dynastyFactor
    * performanceFactor
    * eraScale(sourceSeason)
    * economyGrowth,
  );
  return {
    populationMillions,
    marketTier: marketTier(populationMillions),
    ...success,
    valuationUSD: Math.max(1_000_000, valuationUSD),
  };
}
