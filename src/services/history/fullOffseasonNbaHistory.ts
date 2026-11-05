import { fetchWorkerNbaSeasonHistory } from '../../data/basketballDataWorkerHistory';
import { matchTeamByWikiName, type BRefAwardEntry, type BRefSeasonData } from '../../data/brefFetcher';
import type { HistoricalAward, NBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { WORKER_NBA_STAFF_AWARD_SOURCE } from './workerNbaStaffAwards';

export const FULL_OFFSEASON_NBA_HISTORY_VERSION = 1;

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const canonicalAwardType = (value: unknown): string => {
  const type = normalize(value);
  const aliases: Record<string, string> = {
    'most valuable player': 'mvp',
    mvp: 'mvp',
    'defensive player of the year': 'dpoy',
    dpoy: 'dpoy',
    'sixth man of the year': 'smoy',
    smoy: 'smoy',
    'most improved player': 'mip',
    mip: 'mip',
    'coach of the year': 'coy',
    coy: 'coy',
    'rookie of the year': 'roy',
    roy: 'roy',
    'clutch player of the year': 'clutch',
    'nba sportsmanship award': 'sportsmanship',
    'sportsmanship award': 'sportsmanship',
    'nba hustle award': 'hustle',
    'hustle award': 'hustle',
    'twyman stokes teammate of the year award': 'teammate',
    'teammate of the year': 'teammate',
  };
  return aliases[type] ?? type;
};

const resolveTeam = (entry: BRefAwardEntry, teams: NBATeam[]): NBATeam | undefined => {
  const label = normalize(entry.team || entry.name);
  if (!label) return undefined;
  const exact = teams.find(team => (
    normalize(getTeamFullName(team)) === label
    || normalize(team.name) === label
    || normalize(team.abbrev) === label
  ));
  if (exact) return exact;
  const regionMatches = teams.filter(team => normalize(team.region) === label);
  if (regionMatches.length === 1) return regionMatches[0];
  if (regionMatches.length > 1) return undefined;
  return matchTeamByWikiName(entry.team || entry.name, teams as any[]) as NBATeam | undefined;
};

const personAward = (
  season: number,
  type: string,
  entry: BRefAwardEntry | undefined,
  teams: NBATeam[],
): HistoricalAward[] => {
  if (!entry?.name) return [];
  const team = resolveTeam(entry, teams);
  return [{
    season,
    type,
    name: entry.name,
    ...(team ? { tid: team.id, team: getTeamFullName(team) } : entry.team ? { team: entry.team } : {}),
    uiMode: 'nba',
    source: WORKER_NBA_STAFF_AWARD_SOURCE,
  }];
};

const teamAward = (
  season: number,
  type: 'Champion' | 'Runner Up',
  entry: BRefAwardEntry | undefined,
  teams: NBATeam[],
): HistoricalAward[] => {
  if (!entry?.name) return [];
  const team = resolveTeam(entry, teams);
  return [{
    season,
    type,
    name: team ? getTeamFullName(team) : entry.name,
    ...(team ? { tid: team.id, team: getTeamFullName(team) } : { team: entry.name }),
    uiMode: 'nba',
    source: WORKER_NBA_STAFF_AWARD_SOURCE,
  }];
};

const storedAdditionalAwardType = (awardName: string): string | null => {
  const key = normalize(awardName);
  if ([
    'most valuable player',
    'defensive player of the year',
    'rookie of the year',
    'sixth man of the year',
    'most improved player',
    'clutch player of the year',
    'coach of the year',
    'executive of the year',
  ].includes(key)) return null;
  if (key === 'nba sportsmanship award') return 'Sportsmanship Award';
  if (key === 'nba hustle award') return 'Hustle Award';
  if (key === 'twyman stokes teammate of the year award') return 'Teammate of the Year';
  return awardName;
};

export function buildRevisionedNbaSeasonAwardRows(
  season: BRefSeasonData,
  teams: NBATeam[],
): HistoricalAward[] {
  const rows: HistoricalAward[] = [
    ...teamAward(season.year, 'Champion', season.champion, teams),
    ...teamAward(season.year, 'Runner Up', season.runnerUp, teams),
    ...personAward(season.year, 'Finals MVP', season.finalsMvp, teams),
    ...personAward(season.year, 'MVP', season.mvp, teams),
    ...personAward(season.year, 'DPOY', season.dpoy, teams),
    ...personAward(season.year, 'SMOY', season.smoy, teams),
    ...personAward(season.year, 'Clutch Player of the Year', season.clutch, teams),
    ...personAward(season.year, 'MIP', season.mip, teams),
    ...personAward(season.year, 'ROY', season.roy, teams),
    ...personAward(season.year, 'COY', season.coy, teams),
    ...season.semifinalsMvps.flatMap(entry => personAward(season.year, 'Semifinals MVP', entry, teams)),
  ];
  for (const [prefix, groups] of [
    ['All-NBA', season.allNBA],
    ['All-Defensive', season.allDefensive],
    ['All-Rookie', season.allRookie],
  ] as const) {
    for (const group of groups) {
      rows.push(...group.players.flatMap(entry => personAward(season.year, `${prefix} ${group.teamName}`, entry, teams)));
    }
  }
  for (const award of season.otherAwards) {
    const type = storedAdditionalAwardType(award.awardName);
    if (!type) continue;
    rows.push(...award.recipients.flatMap(entry => personAward(season.year, type, entry, teams)));
  }
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = `${row.season}|${canonicalAwardType(row.type)}|${normalize(row.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergeRevisionedNbaSeasonAwards(
  existing: HistoricalAward[],
  revisioned: HistoricalAward[],
  season: number,
): HistoricalAward[] {
  const incomingSlots = new Set(
    revisioned
      .filter(award => Number(award.season) === Number(season))
      .map(award => canonicalAwardType(award.type)),
  );
  const consumedIncoming = new Set<number>();
  const retained = existing.flatMap(award => {
    if (
      Number(award.season) !== Number(season)
      || !incomingSlots.has(canonicalAwardType(award.type))
    ) return [award];
    const matchIndex = revisioned.findIndex((incoming, index) => (
      !consumedIncoming.has(index)
      && Number(incoming.season) === Number(season)
      && canonicalAwardType(incoming.type) === canonicalAwardType(award.type)
      && normalize(incoming.name) === normalize(award.name)
    ));
    if (matchIndex < 0) return [];
    consumedIncoming.add(matchIndex);
    const incoming = revisioned[matchIndex];
    return [{
      ...incoming,
      ...award,
      team: incoming.team ?? award.team,
      tid: incoming.tid ?? award.tid,
    }];
  });
  return [...retained, ...revisioned.filter((_, index) => !consumedIncoming.has(index))];
}

export async function hydrateFullOffseasonNbaHistoricalAwards(
  existing: HistoricalAward[],
  teams: NBATeam[],
  season: number,
): Promise<{ awards: HistoricalAward[]; hydrated: boolean }> {
  const sourceSeason = await fetchWorkerNbaSeasonHistory(season);
  if (!sourceSeason?.champion) return { awards: existing, hydrated: false };
  return {
    awards: mergeRevisionedNbaSeasonAwards(
      existing,
      buildRevisionedNbaSeasonAwardRows(sourceSeason, teams),
      season,
    ),
    hydrated: true,
  };
}
