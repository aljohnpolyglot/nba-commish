import { STATIC_NBA_TEAMS } from '../data/staticNbaTeams';
import { DEFAULT_DIVS } from '../constants';
import type { NBATeam } from '../types';
import { normalizeHistoricalNbaTeamAbbrev } from './historicalNbaTeamAbbrev';

const MODERN_DIVISION_START_YEAR = 2005;

type DivisionMetadata = { cid: number; did: number; name: string };

export function normalizeModernNbaDivisionAssignments<T extends NBATeam>(
  teams: T[],
  season: number,
  configuredDivisions?: readonly DivisionMetadata[],
): T[] {
  if (!Number.isFinite(season) || season < MODERN_DIVISION_START_YEAR) return teams;
  if (configuredDivisions) {
    const configuredById = new Map(configuredDivisions.map(division => [Number(division.did), division]));
    const usesStandardStructure = configuredById.size === DEFAULT_DIVS.length && DEFAULT_DIVS.every(division => {
      const configured = configuredById.get(division.did);
      return Number(configured?.cid) === division.cid
        && String(configured?.name ?? '').replace(/\s+division$/i, '').trim().toLowerCase() === division.name.toLowerCase();
    });
    if (!usesStandardStructure) return teams;
  }
  const structureByAbbrev = new Map(STATIC_NBA_TEAMS.map(team => [team.abbrev, team]));
  const matched = teams.flatMap(team => {
    const abbrev = normalizeHistoricalNbaTeamAbbrev(team.abbrev);
    const structure = abbrev ? structureByAbbrev.get(abbrev) : undefined;
    return structure ? [{ team, structure }] : [];
  });
  if (matched.length < 20) return teams;
  const divisionIds = new Set(matched.map(({ team }) => Number(team.did)).filter(Number.isFinite));
  const collapsedToConferences = divisionIds.size <= 2 && matched.every(({ team }) => (
    team.did == null || Number(team.did) === Number(team.cid)
  ));
  if (!collapsedToConferences) return teams;

  return teams.map(team => {
    const abbrev = normalizeHistoricalNbaTeamAbbrev(team.abbrev);
    const structure = abbrev ? structureByAbbrev.get(abbrev) : undefined;
    if (!structure) return team;
    return {
      ...team,
      conference: structure.conference,
      cid: structure.cid,
      did: structure.did,
    };
  });
}
