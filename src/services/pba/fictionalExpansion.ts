import type { ExpansionTeamSpec, GameState } from '../../types';
import type { ExpansionBidProfile } from '../expansion/generatedExpansionBidding';
import { getSimulationSeed } from '../saveIdentity';

type PbaExpansionSourceTeam = {
  region?: unknown;
  name?: unknown;
  abbrev?: unknown;
  pop?: unknown;
  stadiumCapacity?: unknown;
  colors?: unknown;
  imgURL?: unknown;
  imgURLSmall?: unknown;
  jersey?: unknown;
};

type PbaExpansionSource = {
  teams?: PbaExpansionSourceTeam[];
};

export const PBA_EXPANSION_FIRST_YEAR = 2026;
export const PBA_EXPANSION_PROTECTION_SETTINGS = {
  perTeamLimit: 8,
  maxDraftedPerTeam: 2,
  picksPerExpansionTeam: 12,
} as const;

const unitFrom = (value: string) => {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4_294_967_295;
};

const validColorTuple = (value: unknown): [string, string, string] => {
  const colors = Array.isArray(value)
    ? value.map(color => String(color ?? '').trim()).filter(Boolean)
    : [];
  return [
    colors[0] ?? '#1d4ed8',
    colors[1] ?? '#fbbf24',
    colors[2] ?? '#ffffff',
  ];
};

function mapSourceTeam(team: PbaExpansionSourceTeam): ExpansionTeamSpec | null {
  const region = String(team.region ?? '').trim();
  const name = String(team.name ?? '').trim();
  const abbrev = String(team.abbrev ?? '').trim().toUpperCase();
  if (!region || !name || !abbrev) return null;
  return {
    region,
    name,
    abbrev,
    pop: Math.max(0.1, Number(team.pop) || 1),
    stadiumCapacity: Math.max(1, Number(team.stadiumCapacity) || 10_000),
    colors: validColorTuple(team.colors),
    imgURL: String(team.imgURL ?? '').trim() || undefined,
    imgURLSmall: String(team.imgURLSmall ?? team.imgURL ?? '').trim() || undefined,
    jersey: String(team.jersey ?? '').trim() || undefined,
    conference: 'East',
    cid: 0,
    did: 0,
  };
}

export async function loadPbaFictionalExpansionPool(): Promise<ExpansionTeamSpec[]> {
  const response = await fetch('/data/pba/fictional-expansion/pba-fictional-expansion-pool.json');
  if (!response.ok) throw new Error(`PBA expansion pool unavailable (${response.status})`);
  const source = JSON.parse((await response.text()).replace(/^\uFEFF/, '')) as PbaExpansionSource;
  return (source.teams ?? [])
    .map(mapSourceTeam)
    .filter((team): team is ExpansionTeamSpec => team != null);
}

export function buildPbaFictionalExpansionSchedule(
  state: Pick<GameState, 'saveId' | 'simulationSeed' | 'leagueStats' | 'nonNBATeams' | 'expansionBidDecisions'>,
  pool: readonly ExpansionTeamSpec[],
): NonNullable<GameState['expansionSchedule']> | null {
  const currentYear = Number(state.leagueStats.year);
  if (!Number.isFinite(currentYear)) return null;
  const pbaDecisionYears = Object.entries(state.expansionBidDecisions ?? {})
    .filter(([, decision]) => decision.league === 'pba')
    .map(([year]) => Number(year))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const lastDecisionYear = pbaDecisionYears.at(-1);
  const year = lastDecisionYear == null
    ? Math.max(PBA_EXPANSION_FIRST_YEAR, currentYear)
    : Math.max(lastDecisionYear + 8, currentYear);
  if (state.expansionBidDecisions?.[year]?.league === 'pba') return null;

  const activePbaTeams = state.nonNBATeams.filter(team => team.league === 'PBA');
  const activeAbbrevs = new Set(activePbaTeams.map(team => String(team.abbrev ?? '').toUpperCase()));
  const activeNames = new Set(activePbaTeams.map(team =>
    `${String(team.region ?? '').trim()}:${String(team.name ?? '').trim()}`.toLowerCase(),
  ));
  const candidates = pool
    .filter(team => !activeAbbrevs.has(team.abbrev.toUpperCase()))
    .filter(team => !activeNames.has(`${team.region}:${team.name}`.toLowerCase()))
    .map(team => ({
      team,
      order: unitFrom(`${getSimulationSeed(state)}:${year}:pba-expansion:${team.abbrev}`),
    }))
    .sort((left, right) => right.order - left.order || left.team.abbrev.localeCompare(right.team.abbrev))
    .map(candidate => candidate.team)
    .slice(0, 4);
  if (candidates.length === 0) return null;
  return { year, teams: candidates, league: 'pba', realignment: {} };
}

export function buildPbaExpansionBidProfile(
  state: Pick<GameState, 'saveId' | 'simulationSeed' | 'leagueStats'>,
  team: ExpansionTeamSpec,
): ExpansionBidProfile {
  const year = Number(state.leagueStats.year) || PBA_EXPANSION_FIRST_YEAR;
  const seed = `${getSimulationSeed(state)}:${year}:pba-bid:${team.abbrev}`;
  const ownershipFunding = Math.round(56 + unitFrom(`${seed}:funding`) * 43);
  const arenaReadiness = Math.round(Math.min(100, 42 + (team.stadiumCapacity ?? 10_000) / 240));
  const basketballInterest = Math.round(65 + unitFrom(`${seed}:interest`) * 34);
  const mediaValue = Math.round(52 + unitFrom(`${seed}:media`) * 42);
  const travelFit = Math.round(72 + unitFrom(`${seed}:travel`) * 27);
  const eraScale = Math.pow(1.035, Math.max(0, year - PBA_EXPANSION_FIRST_YEAR));
  const bidAmount = Math.round(
    120_000_000
    * eraScale
    * (0.75 + ownershipFunding / 250)
    * (0.8 + mediaValue / 500),
  );
  const strongest = [
    { label: 'ownership group', value: ownershipFunding },
    { label: 'arena plan', value: arenaReadiness },
    { label: 'local following', value: basketballInterest },
    { label: 'broadcast potential', value: mediaValue },
    { label: 'travel plan', value: travelFit },
  ].sort((left, right) => right.value - left.value)[0].label;
  return {
    bidUSD: 0,
    bidAmount,
    currency: 'PHP',
    ownershipFunding,
    arenaReadiness,
    basketballInterest,
    mediaValue,
    travelFit,
    pitch: `${team.region} is building its application around its ${strongest} and a long-term commitment to PBA growth.`,
  };
}
