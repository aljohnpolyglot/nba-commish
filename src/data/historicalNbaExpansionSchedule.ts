import type { ExpansionTeamSpec, NBATeam } from '../types';
import { getExpansionTeamLogoUrl } from '../utils/teamAssets';

export type HistoricalNbaExpansionEvent = {
  season: number;
  teams: ExpansionTeamSpec[];
  realignment?: Record<number, { conference: 'East' | 'West'; cid: 0 | 1; did: number }>;
};

export type HistoricalNbaContractionEvent = {
  lastLeagueYear: number;
  abbrevs: string[];
  names: string[];
  validAgainYear?: number;
};

const EQUIVALENT_ABBREVS: Record<string, readonly string[]> = {
  BUF: ['SDC', 'SD', 'LAC'],
  CHA: ['CHH', 'CHO'],
  CHH: ['CHA', 'CHO'],
  CHP: ['BAL', 'WSB', 'WAS'],
  NOJ: ['UTA'],
  SDR: ['HOU'],
  SEA: ['OKC'],
  VAN: ['MEM'],
};

function team(
  region: string,
  name: string,
  abbrev: string,
  conference: 'East' | 'West',
  did: number,
  colors: [string, string, string],
  pop = 2,
): ExpansionTeamSpec {
  const cid = conference === 'East' ? 0 : 1;
  return {
    region,
    name,
    abbrev,
    conference,
    cid,
    did,
    colors,
    pop,
    imgURL: getExpansionTeamLogoUrl({ abbrev }, 'primary'),
    imgURLSmall: getExpansionTeamLogoUrl({ abbrev }, 'secondary'),
  };
}

export const HISTORICAL_NBA_EXPANSION_EVENTS: readonly HistoricalNbaExpansionEvent[] = [
  {
    season: 1962,
    teams: [
      team('Chicago', 'Packers', 'CHP', 'East', 1, ['#0b3d91', '#d71920', '#ffffff'], 3.6),
    ],
  },
  {
    season: 1967,
    teams: [
      team('Chicago', 'Bulls', 'CHI', 'East', 1, ['#ce1141', '#000000', '#ffffff'], 3.8),
    ],
  },
  {
    season: 1968,
    teams: [
      team('Seattle', 'SuperSonics', 'SEA', 'West', 4, ['#00653a', '#ffc200', '#ffffff'], 1.4),
      team('San Diego', 'Rockets', 'SDR', 'West', 5, ['#ce1141', '#ffffff', '#000000'], 1.2),
    ],
  },
  {
    season: 1969,
    teams: [
      team('Milwaukee', 'Bucks', 'MIL', 'East', 1, ['#00471b', '#eee1c6', '#0077c0'], 1.4),
      team('Phoenix', 'Suns', 'PHX', 'West', 5, ['#1d1160', '#e56020', '#ffffff'], 1.1),
    ],
  },
  {
    season: 1971,
    teams: [
      team('Buffalo', 'Braves', 'BUF', 'East', 0, ['#07295c', '#f16229', '#ffffff'], 1.1),
      team('Cleveland', 'Cavaliers', 'CLE', 'East', 2, ['#6f263d', '#ffb81c', '#041e42'], 2.1),
      team('Portland', 'Trail Blazers', 'POR', 'West', 4, ['#e03a3e', '#000000', '#ffffff'], 1.1),
    ],
  },
  {
    season: 1975,
    teams: [
      team('New Orleans', 'Jazz', 'NOJ', 'West', 6, ['#2e3192', '#f9a01b', '#00843d'], 1.1),
    ],
  },
  {
    season: 1981,
    teams: [
      team('Dallas', 'Mavericks', 'DAL', 'West', 6, ['#00538c', '#002b5e', '#b8c4ca'], 2.4),
    ],
  },
  {
    season: 1989,
    teams: [
      team('Charlotte', 'Hornets', 'CHH', 'East', 3, ['#1d8cab', '#702f8a', '#ffffff'], 1.1),
      team('Miami', 'Heat', 'MIA', 'East', 3, ['#98002e', '#f9a01b', '#000000'], 2.8),
    ],
  },
  {
    season: 1990,
    teams: [
      team('Minnesota', 'Timberwolves', 'MIN', 'West', 7, ['#0c2340', '#78be20', '#9ea2a2'], 2.5),
      team('Orlando', 'Magic', 'ORL', 'East', 3, ['#0077c0', '#c4ced4', '#000000'], 1.2),
    ],
  },
  {
    season: 1996,
    teams: [
      team('Toronto', 'Raptors', 'TOR', 'East', 2, ['#ce1141', '#000000', '#a1a1a4'], 4.3),
      team('Vancouver', 'Grizzlies', 'VAN', 'West', 5, ['#00788c', '#f5b112', '#bed4e9'], 2.3),
    ],
  },
  {
    season: 2005,
    teams: [
      team('Charlotte', 'Bobcats', 'CHA', 'East', 3, ['#f26522', '#1d1160', '#ffffff'], 1.5),
    ],
  },
];

export const HISTORICAL_NBA_CONTRACTION_EVENTS: readonly HistoricalNbaContractionEvent[] = [
  {
    lastLeagueYear: 1947,
    abbrevs: ['CLR', 'CLE'],
    names: ['Cleveland Rebels'],
    validAgainYear: 1971,
  },
  {
    lastLeagueYear: 1947,
    abbrevs: ['DTF', 'DET'],
    names: ['Detroit Falcons'],
    validAgainYear: 1958,
  },
  {
    lastLeagueYear: 1947,
    abbrevs: ['PIT'],
    names: ['Pittsburgh Ironmen'],
  },
  {
    lastLeagueYear: 1947,
    abbrevs: ['TRH', 'TOR'],
    names: ['Toronto Huskies'],
    validAgainYear: 1996,
  },
  {
    lastLeagueYear: 1949,
    abbrevs: ['PRO'],
    names: ['Providence Steamrollers'],
  },
  {
    lastLeagueYear: 1950,
    abbrevs: ['AND'],
    names: ['Anderson Packers'],
  },
  {
    lastLeagueYear: 1950,
    abbrevs: ['SHE'],
    names: ['Sheboygan Red Skins', 'Sheboygan Redskins'],
  },
  {
    lastLeagueYear: 1950,
    abbrevs: ['WAT'],
    names: ['Waterloo Hawks'],
  },
  {
    lastLeagueYear: 1950,
    abbrevs: ['CHS'],
    names: ['Chicago Stags'],
  },
  {
    lastLeagueYear: 1950,
    abbrevs: ['STB'],
    names: ['St. Louis Bombers'],
  },
  {
    lastLeagueYear: 1951,
    abbrevs: ['WSC'],
    names: ['Washington Capitols'],
  },
  {
    lastLeagueYear: 1953,
    abbrevs: ['INO'],
    names: ['Indianapolis Olympians'],
  },
  {
    lastLeagueYear: 1949,
    abbrevs: ['INJ'],
    names: ['Indianapolis Jets'],
  },
  {
    lastLeagueYear: 1950,
    abbrevs: ['DNN'],
    names: ['Denver Nuggets'],
    validAgainYear: 1977,
  },
  {
    lastLeagueYear: 1954,
    abbrevs: ['BLB'],
    names: ['Baltimore Bullets'],
    validAgainYear: 1964,
  },
];

function normalizeAbbrev(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[.'’`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamFullName(team: any): string {
  const name = String(team?.name ?? '').trim();
  const region = String(team?.region ?? team?.location ?? '').trim();
  if (!name) return region;
  if (!region || normalizeName(name).startsWith(`${normalizeName(region)} `)) return name;
  return `${region} ${name}`;
}

function eventTeamExists(existingAbbrevs: ReadonlySet<string>, abbrev: string): boolean {
  const candidates = [abbrev, ...(EQUIVALENT_ABBREVS[abbrev] ?? [])].map(normalizeAbbrev);
  return candidates.some(candidate => existingAbbrevs.has(candidate));
}

function contractionEventAppliesToYear(
  event: HistoricalNbaContractionEvent,
  year: number,
  minSeason: number,
): boolean {
  return (!Number.isFinite(minSeason) || event.lastLeagueYear >= minSeason) &&
    year > event.lastLeagueYear &&
    (event.validAgainYear == null || year < event.validAgainYear);
}

function teamMatchesContractionEvent(team: any, event: HistoricalNbaContractionEvent): boolean {
  const abbrevs = new Set(event.abbrevs.map(normalizeAbbrev));
  const names = new Set(event.names.map(normalizeName));
  return abbrevs.has(normalizeAbbrev(team?.abbrev)) || names.has(normalizeName(teamFullName(team)));
}

function missingTeamsForEvent(event: HistoricalNbaExpansionEvent, teams: readonly NBATeam[] | undefined): ExpansionTeamSpec[] {
  const existingAbbrevs = new Set((teams ?? []).map(team => normalizeAbbrev((team as any).abbrev)).filter(Boolean));
  return event.teams.filter(team => !eventTeamExists(existingAbbrevs, team.abbrev));
}

export function findHistoricalNbaExpansionEvent(
  leagueYear: number | undefined,
  teams: readonly NBATeam[] | undefined,
  skippedSeasons: readonly number[] = [],
  minSeason: number | undefined = undefined,
): HistoricalNbaExpansionEvent | null {
  const year = Number(leagueYear);
  if (!Number.isFinite(year)) return null;
  const lowerBound = Number(minSeason);
  const skipped = new Set(skippedSeasons.map(Number).filter(Number.isFinite));

  const candidates = HISTORICAL_NBA_EXPANSION_EVENTS
    .filter(event => !Number.isFinite(lowerBound) || event.season >= lowerBound)
    .filter(event => !skipped.has(event.season))
    .map(event => ({ ...event, teams: missingTeamsForEvent(event, teams) }))
    .filter(event => event.teams.length > 0);

  return candidates.find(event => event.season <= year)
    ?? candidates.find(event => event.season > year)
    ?? null;
}

export function findHistoricalNbaContractionIssues(
  leagueYear: number | undefined,
  teams: readonly NBATeam[] | undefined,
  minSeason: number | undefined = undefined,
): string[] {
  const year = Number(leagueYear);
  if (!Number.isFinite(year)) return [];
  const lowerBound = Number(minSeason);
  const activeTeams = teams ?? [];

  return HISTORICAL_NBA_CONTRACTION_EVENTS
    .filter(event => contractionEventAppliesToYear(event, year, lowerBound))
    .flatMap(event => {
      return activeTeams
        .filter((team: any) => teamMatchesContractionEvent(team, event))
        .map((team: any) => `${teamFullName(team)} (${team?.abbrev ?? '?'}) after ${event.lastLeagueYear}`);
    });
}

export function findHistoricalNbaContractedTeamIds(
  leagueYear: number | undefined,
  teams: readonly NBATeam[] | undefined,
  minSeason: number | undefined = undefined,
): number[] {
  const year = Number(leagueYear);
  if (!Number.isFinite(year)) return [];
  const lowerBound = Number(minSeason);
  const activeEvents = HISTORICAL_NBA_CONTRACTION_EVENTS
    .filter(event => contractionEventAppliesToYear(event, year, lowerBound));
  if (activeEvents.length === 0) return [];

  const ids = new Set<number>();
  for (const team of teams ?? []) {
    const id = Number((team as any).id);
    if (!Number.isFinite(id)) continue;
    if (activeEvents.some(event => teamMatchesContractionEvent(team, event))) ids.add(id);
  }
  return Array.from(ids);
}
