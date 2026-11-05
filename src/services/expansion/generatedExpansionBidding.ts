import { ZENGM_EXPANSION_POOL } from '../../data/expansionTeamPool';
import type { ExpansionTeamSpec, GameState } from '../../types';
import { getSimulationSeed } from '../saveIdentity';
import {
  generatedCatalogTeamToExpansion,
  type GeneratedTeamCatalogEntry,
} from '../generatedTeamCatalog';

interface GeneratedExpansionSchedule {
  year: number;
  teams: ExpansionTeamSpec[];
  realignment: {};
}

export interface ExpansionBidProfile {
  bidUSD: number;
  bidAmount?: number;
  currency?: 'USD' | 'PHP';
  ownershipFunding: number;
  arenaReadiness: number;
  basketballInterest: number;
  mediaValue: number;
  travelFit: number;
  pitch: string;
}

export const getExpansionBidYear = (expansionYear: number) => expansionYear;

const unitFrom = (value: string) => {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4_294_967_295;
};

export function selectGeneratedHistoricalBidCandidates(
  state: Pick<GameState, 'saveId' | 'simulationSeed' | 'teams'>,
  expansionYear: number,
  catalog: GeneratedTeamCatalogEntry[],
  scheduledTeams: readonly ExpansionTeamSpec[],
): ExpansionTeamSpec[] {
  const occupied = new Set([
    ...state.teams.map(team => `${team.region}:${team.name}:${team.abbrev}`.toLowerCase()),
    ...scheduledTeams.map(team => `${team.region}:${team.name}:${team.abbrev}`.toLowerCase()),
  ]);
  const candidates = catalog
    .map(generatedCatalogTeamToExpansion)
    .filter(team => team.region && team.name && team.abbrev)
    .filter(team => !occupied.has(`${team.region}:${team.name}:${team.abbrev}`.toLowerCase()))
    .map(team => ({
      team,
      order: unitFrom(`${getSimulationSeed(state)}:${expansionYear}:historical-branch:${team.region}:${team.abbrev}`),
    }))
    .sort((left, right) => right.order - left.order)
    .map(candidate => candidate.team);
  const count = 1 + Math.floor(
    unitFrom(`${getSimulationSeed(state)}:${expansionYear}:historical-branch-count`) * 3,
  );
  return candidates.slice(0, count);
}

export function buildGeneratedExpansionBidSchedule(
  state: Pick<GameState, 'saveId' | 'simulationSeed' | 'leagueStats' | 'teams' | 'expansionBidDecisions' | 'leagueType'>,
  catalog: GeneratedTeamCatalogEntry[] = [],
): GeneratedExpansionSchedule | null {
  const currentYear = Number(state.leagueStats.year);
  if (!Number.isFinite(currentYear) || currentYear < 2029 || state.leagueType === 'fictional') return null;

  const decisionYears = Object.keys(state.expansionBidDecisions ?? {})
    .map(Number)
    .filter(Number.isFinite);
  const lastCycle = Math.max(2029, ...decisionYears);
  const alignedFutureCycle = 2029 + (Math.floor((currentYear - 2029) / 8) + 1) * 8;
  const year = Math.max(lastCycle + 8, alignedFutureCycle);
  if (state.expansionBidDecisions?.[year]) return null;

  const activeAbbrevs = new Set(state.teams.map(team => team.abbrev.toUpperCase()));
  const activeNames = new Set(state.teams.map(team => `${team.region}:${team.name}`.toLowerCase()));
  const rank = (teams: ExpansionTeamSpec[], source: string) => teams
    .filter(team => team.region && team.name && team.abbrev)
    .filter(team => !activeAbbrevs.has(team.abbrev.toUpperCase()))
    .filter(team => !activeNames.has(`${team.region}:${team.name}`.toLowerCase()))
    .map(team => ({
      team,
      order: unitFrom(`${getSimulationSeed(state)}:${year}:${source}:${team.region}:${team.abbrev}`),
    }))
    .sort((left, right) => right.order - left.order)
    .map(candidate => candidate.team);
  const classicCandidates = rank(ZENGM_EXPANSION_POOL, 'classic');
  const catalogCandidates = rank(catalog.map(generatedCatalogTeamToExpansion), 'generated');
  const candidates: ExpansionTeamSpec[] = [];
  const selectedKeys = new Set<string>();
  const append = (team: ExpansionTeamSpec | undefined) => {
    if (!team) return;
    const key = `${team.region}:${team.name}:${team.abbrev}`.toLowerCase();
    if (selectedKeys.has(key)) return;
    selectedKeys.add(key);
    candidates.push(team);
  };

  classicCandidates.slice(0, 2).forEach(append);
  catalogCandidates.slice(0, 2).forEach(append);
  [...classicCandidates.slice(2), ...catalogCandidates.slice(2)]
    .sort((left, right) => (
      unitFrom(`${getSimulationSeed(state)}:${year}:fill:${right.abbrev}`)
      - unitFrom(`${getSimulationSeed(state)}:${year}:fill:${left.abbrev}`)
    ))
    .forEach(team => {
      if (candidates.length < 4) append(team);
    });
  if (candidates.length < 2) return null;

  return { year, teams: candidates.slice(0, 4), realignment: {} };
}

export function buildExpansionBidProfile(
  state: Pick<GameState, 'saveId' | 'simulationSeed' | 'leagueStats'>,
  team: ExpansionTeamSpec,
): ExpansionBidProfile {
  const year = Number(state.leagueStats.year) || 2026;
  const seed = `${getSimulationSeed(state)}:${year}:${team.region}:${team.abbrev}`;
  const populationScore = Math.min(100, 38 + Math.log10(Math.max(0.1, team.pop) + 1) * 52);
  const ownershipFunding = Math.round(58 + unitFrom(`${seed}:funding`) * 41);
  const arenaReadiness = Math.round(Math.min(100, 35 + (team.stadiumCapacity ?? 18_000) / 300));
  const basketballInterest = Math.round(Math.min(100, populationScore * 0.55 + 25 + unitFrom(`${seed}:interest`) * 25));
  const mediaValue = Math.round(Math.min(100, populationScore * 0.7 + 12 + unitFrom(`${seed}:media`) * 22));
  const travelFit = Math.round(55 + unitFrom(`${seed}:travel`) * 44);
  const eraScale = Math.pow(1.035, year - 2026);
  const bidUSD = Math.max(25_000, Math.round(
    2_000_000_000
    * eraScale
    * (0.7 + ownershipFunding / 260)
    * (0.75 + mediaValue / 400),
  ));
  const strongest = [
    { label: 'ownership group', value: ownershipFunding },
    { label: 'arena plan', value: arenaReadiness },
    { label: 'basketball market', value: basketballInterest },
    { label: 'media market', value: mediaValue },
    { label: 'regional fit', value: travelFit },
  ].sort((left, right) => right.value - left.value)[0].label;

  return {
    bidUSD,
    ownershipFunding,
    arenaReadiness,
    basketballInterest,
    mediaValue,
    travelFit,
    pitch: `${team.region} is centering its application on its ${strongest}, with a long-term commitment to league growth and local fan investment.`,
  };
}
