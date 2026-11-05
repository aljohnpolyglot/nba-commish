import marketRows from '../../data/euroClubMarketPopulations.json';
import { getSpainTeamPopulationOverride } from '../../data/templates/spain/teamPopulations';

type TeamMarketLike = {
  league?: string | null;
  region?: string | null;
  name?: string | null;
  pop?: number | null;
};

type MarketRow = {
  league: string;
  region: string;
  name: string;
  pop: number;
};

const normalize = (value: string | null | undefined) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const fullName = (team: TeamMarketLike) => `${normalize(team.region)} ${normalize(team.name)}`.trim();
const marketByLeagueAndName = new Map<string, number>();
const marketByUniqueName = new Map<string, number | null>();

for (const row of marketRows as MarketRow[]) {
  const name = fullName(row);
  marketByLeagueAndName.set(`${normalize(row.league)}|${name}`, row.pop);
  const existing = marketByUniqueName.get(name);
  marketByUniqueName.set(name, existing === undefined || existing === row.pop ? row.pop : null);
}

export function getEuroClubMarketPopulation(team: TeamMarketLike): number | null {
  const name = fullName(team);
  const sourced = marketByLeagueAndName.get(`${normalize(team.league)}|${name}`)
    ?? marketByUniqueName.get(name)
    ?? null;
  if (sourced != null) return sourced;

  const spanish = getSpainTeamPopulationOverride(team.region, team.name);
  if (spanish != null) return spanish;

  const saved = Number(team.pop);
  return Number.isFinite(saved) && saved > 0 ? saved : null;
}
