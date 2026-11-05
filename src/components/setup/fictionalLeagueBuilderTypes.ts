import { FICTIONAL_TEAMS, fictionalLogoUrl } from '../../data/fictionalTeams';
import type {
  FictionalHistoryMode,
  FictionalNationalityFrequency,
  FictionalPlayerPool,
  FictionalRosterMode,
  FictionalStartupTeamDef,
  LeagueStats,
} from '../../types';
import type { GeneratedTeamCatalogEntry } from '../../services/generatedTeamCatalog';

export type { GeneratedTeamCatalogEntry } from '../../services/generatedTeamCatalog';

export type BuilderScreen = 'year' | 'customize' | 'leagueType' | 'nationalities' | 'leagueSettings' | 'leagueOrigin' | 'rosterSetup';

export interface BuilderTeam {
  id: number;
  region: string;
  name: string;
  abbrev: string;
  population: string;
  stadiumCapacity: string;
  logoUrl?: string;
  smallLogoUrl?: string;
  colors: [string, string, string];
  jerseyType: string;
}

export interface BuilderDivision {
  id: string;
  did: number;
  name: string;
  teams: BuilderTeam[];
}

export interface BuilderConference {
  id: string;
  cid: number;
  name: string;
  divisions: BuilderDivision[];
}

export interface FictionalLeagueStartupConfig {
  leagueName: string;
  seasonYear: number;
  historyMode: FictionalHistoryMode;
  playerPool: FictionalPlayerPool;
  rosterMode: FictionalRosterMode;
  nationalities: FictionalNationalityFrequency[];
  leagueRules: Partial<LeagueStats>;
  teams: FictionalStartupTeamDef[];
}

const DIVISION_NAMES: Record<number, string> = {
  0: 'Atlantic', 1: 'Central', 2: 'Southeast', 3: 'Northwest', 4: 'Pacific', 5: 'Southwest',
};

export function buildInitialConferences(): BuilderConference[] {
  return [
    { id: 'west', cid: 1, name: 'WESTERN CONFERENCE', divisions: [3, 4, 5].map(did => buildDivision(1, did)) },
    { id: 'east', cid: 0, name: 'EASTERN CONFERENCE', divisions: [0, 1, 2].map(did => buildDivision(0, did)) },
  ];
}

function buildDivision(cid: number, did: number): BuilderDivision {
  return {
    id: `${cid === 1 ? 'west' : 'east'}-${DIVISION_NAMES[did].toLowerCase()}`,
    did,
    name: DIVISION_NAMES[did],
    teams: FICTIONAL_TEAMS.filter(team => team.cid === cid && team.did === did).map(team => ({
      id: team.tid,
      region: team.region,
      name: team.name,
      abbrev: team.abbrev,
      population: String(team.pop),
      stadiumCapacity: '18000',
      logoUrl: fictionalLogoUrl(team.abbrev),
      colors: [...team.colors],
      jerseyType: 'Bordered',
    })),
  };
}

export function catalogTeamToBuilder(
  team: GeneratedTeamCatalogEntry,
  id: number,
): BuilderTeam {
  const colors = team.colors?.length && team.colors.length >= 3
    ? [String(team.colors[0]), String(team.colors[1]), String(team.colors[2])] as [string, string, string]
    : ['#000000', '#ffffff', '#aaaaaa'] as [string, string, string];
  return {
    id,
    region: String(team.region ?? 'City'),
    name: String(team.name ?? 'Club'),
    abbrev: String(team.abbrev ?? 'CLB').toUpperCase(),
    population: String(team.pop ?? 2),
    stadiumCapacity: String(team.stadiumCapacity ?? 18000),
    logoUrl: team.imgURL ?? team.logos?.primary,
    smallLogoUrl: team.imgURLSmall ?? team.logos?.small,
    colors,
    jerseyType: 'Bordered',
  };
}

export function serializeBuilderTeams(conferences: BuilderConference[]): FictionalStartupTeamDef[] {
  let tid = 0;
  const eastId = conferences.find(conference => conference.cid === 0)?.id ?? conferences[1]?.id ?? conferences[0]?.id;
  return conferences.flatMap(conference => {
    const cid = conference.id === eastId ? 0 : 1;
    return conference.divisions.flatMap(division => division.teams.map(team => ({
      tid: tid++,
      region: team.region.trim(),
      name: team.name.trim(),
      abbrev: team.abbrev.trim().toUpperCase(),
      colors: team.colors,
      pop: Math.max(0.1, Number(team.population) || 2),
      conference: cid === 0 ? 'East' : 'West',
      conferenceName: conference.name,
      cid,
      did: division.did,
      divisionName: division.name,
      stadiumCapacity: Math.max(1, Number(team.stadiumCapacity) || 18000),
      imgURL: team.logoUrl,
      imgURLSmall: team.smallLogoUrl,
      jerseyType: team.jerseyType,
    })));
  });
}

export function validateBuilder(conferences: BuilderConference[]): string | null {
  if (conferences.length !== 2) return 'The season format requires exactly two conferences.';
  const divisions = conferences.flatMap(conference => conference.divisions);
  if (divisions.length === 0) return 'Add at least one division.';
  if (divisions.some(division => division.teams.length < 2)) return 'All divisions need at least two teams.';
  const teams = divisions.flatMap(division => division.teams);
  if (teams.length > 100) return 'Use no more than 100 teams.';
  if (teams.some(team => !team.region.trim() || !team.name.trim() || !team.abbrev.trim())) return 'Every team needs a region, name, and abbreviation.';
  const abbrevs = teams.map(team => team.abbrev.trim().toUpperCase());
  if (new Set(abbrevs).size !== abbrevs.length) return 'Every team abbreviation must be unique.';
  const names = teams.map(team => `${team.region.trim()} ${team.name.trim()}`.toLowerCase());
  if (new Set(names).size !== names.length) return 'Every team name must be unique.';
  return null;
}
