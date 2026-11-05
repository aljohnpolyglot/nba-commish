import type { LeagueStats, NBATeam } from '../../types';
import type { AllStarHistoryEntry } from '../../data/allStarHistoryFetcher';
import { matchTeamByWikiName } from '../../data/brefFetcher';
import { getArenaForTeamAtSeason } from '../../utils/arenaData';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import { getAllStarSunday } from './allStarWeekendDates';

type Host = NonNullable<LeagueStats['allStarHosts']>[number];
export type HistoricalAllStarHostSource = {
  city: string;
  arena: string;
  teamIds: number[];
};

interface AnnouncedAllStarHost {
  year: number;
  announcedOn: string;
  city: string;
  arena: string;
  teamAbbrev: string;
}

const ANNOUNCED_NBA_ALL_STAR_HOSTS: AnnouncedAllStarHost[] = [
  { year: 2016, announcedOn: '2013-09-30', city: 'Toronto, Ontario', arena: 'Air Canada Centre', teamAbbrev: 'TOR' },
  { year: 2017, announcedOn: '2016-08-19', city: 'New Orleans, Louisiana', arena: 'Smoothie King Center', teamAbbrev: 'NOP' },
  { year: 2018, announcedOn: '2016-03-22', city: 'Los Angeles, California', arena: 'Staples Center', teamAbbrev: 'LAL' },
  { year: 2019, announcedOn: '2017-05-24', city: 'Charlotte, North Carolina', arena: 'Spectrum Center', teamAbbrev: 'CHA' },
  { year: 2020, announcedOn: '2017-11-10', city: 'Chicago, Illinois', arena: 'United Center', teamAbbrev: 'CHI' },
  { year: 2021, announcedOn: '2021-02-18', city: 'Atlanta, Georgia', arena: 'State Farm Arena', teamAbbrev: 'ATL' },
  { year: 2022, announcedOn: '2018-11-01', city: 'Cleveland, Ohio', arena: 'Rocket Mortgage FieldHouse', teamAbbrev: 'CLE' },
  { year: 2023, announcedOn: '2019-10-23', city: 'Salt Lake City, Utah', arena: 'Vivint Arena', teamAbbrev: 'UTA' },
  { year: 2024, announcedOn: '2020-11-25', city: 'Indianapolis, Indiana', arena: 'Gainbridge Fieldhouse', teamAbbrev: 'IND' },
  { year: 2025, announcedOn: '2023-11-06', city: 'San Francisco, California', arena: 'Chase Center', teamAbbrev: 'GSW' },
  { year: 2026, announcedOn: '2024-01-16', city: 'Inglewood, California', arena: 'Intuit Dome', teamAbbrev: 'LAC' },
  { year: 2027, announcedOn: '2024-03-07', city: 'Phoenix, Arizona', arena: 'Footprint Center', teamAbbrev: 'PHX' },
];

export function normalizeAllStarHost(host: Partial<Host> | null | undefined): Host | null {
  const year = Number(host?.year);
  if (!Number.isFinite(year)) return null;

  return {
    year,
    city: typeof host?.city === 'string' ? host.city : '',
    arena: typeof host?.arena === 'string' ? host.arena : '',
    teamIds: Array.isArray(host?.teamIds)
      ? [...new Set(host.teamIds.map(Number).filter(Number.isFinite))]
      : [],
  };
}

export function materializeKnownNbaAllStarHosts({
  existing,
  teams,
  seedSeasonYear,
  knowledgeDate,
  history = [],
}: {
  existing: LeagueStats['allStarHosts'];
  teams: NBATeam[];
  seedSeasonYear: number;
  knowledgeDate: Date;
  history?: AllStarHistoryEntry[];
}): Host[] {
  const byYear = new Map(
    (existing ?? [])
      .map(normalizeAllStarHost)
      .filter((host): host is Host => host != null)
      .map(host => [host.year, host]),
  );
  const cutoff = Number.isNaN(knowledgeDate.getTime())
    ? ''
    : knowledgeDate.toISOString().slice(0, 10);
  const sourcedHosts = buildHistoricalAllStarHostsByYear(history, teams);
  const lastSeedYear = seedSeasonYear + 2;
  for (let year = seedSeasonYear; year <= lastSeedYear; year += 1) {
    if (!cutoff || getAllStarSunday(year) > knowledgeDate) continue;
    const source = sourcedHosts.get(year);
    if (!source?.teamIds.length) continue;
    byYear.set(year, {
      year,
      city: source.city,
      arena: source.arena,
      teamIds: source.teamIds,
    });
  }
  for (const assignment of ANNOUNCED_NBA_ALL_STAR_HOSTS) {
    if (
      assignment.year < seedSeasonYear
      || assignment.year > lastSeedYear
      || !cutoff
      || assignment.announcedOn > cutoff
    ) continue;
    const team = teams.find(candidate => candidate.abbrev === assignment.teamAbbrev);
    if (!team) continue;
    byYear.set(assignment.year, {
      year: assignment.year,
      city: assignment.city,
      arena: assignment.arena,
      teamIds: [team.id],
    });
  }
  return [...byYear.values()].sort((left, right) => left.year - right.year);
}

export const getAllStarHostDecisionYear = (leagueStats: Pick<LeagueStats, 'year'>): number =>
  (leagueStats.year ?? new Date().getFullYear()) + 3;

const normalizeHostTeamName = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function historicalAllStarSourceMatchesHost(
  source: HistoricalAllStarHostSource,
  host: Host,
): boolean {
  const cityMatch = host.city?.trim() !== ''
    && normalizeHostTeamName(source.city) === normalizeHostTeamName(host.city ?? '');
  const arenaMatch = host.arena?.trim() !== ''
    && normalizeHostTeamName(source.arena) === normalizeHostTeamName(host.arena ?? '');
  return cityMatch || arenaMatch;
}

export function resolveHistoricalAllStarHostTeamIds(
  event: AllStarHistoryEntry,
  teams: NBATeam[],
): number[] {
  const historicalTeams = teams.map(team => getHistoricalTeamSnapshot(team, event.year));
  const explicitTeamIds = [...new Set(
    (event.host_teams ?? [])
      .map(hostName => matchTeamByWikiName(hostName, historicalTeams)?.id)
      .filter((teamId): teamId is number => teamId != null),
  )];
  if (explicitTeamIds.length > 0) return explicitTeamIds;

  const sourceArena = normalizeHostTeamName(event.host_arena ?? '');
  const sourceCity = normalizeHostTeamName(String(event.host_city ?? '').split(',')[0]);
  if (!sourceArena && !sourceCity) return [];
  return historicalTeams
    .filter(team => {
      const arena = getArenaForTeamAtSeason(team, event.year);
      if (!arena) return false;
      const arenaMatch = sourceArena !== '' && normalizeHostTeamName(arena.name) === sourceArena;
      const cityMatch = sourceCity !== '' && [arena.city, arena.location]
        .map(value => normalizeHostTeamName(String(value ?? '').split(',')[0]))
        .includes(sourceCity);
      return arenaMatch || cityMatch;
    })
    .map(team => team.id);
}

export function buildHistoricalAllStarHostYears(
  history: AllStarHistoryEntry[],
  teams: NBATeam[],
  cutoffYear: number,
): Map<number, number> {
  const latest = new Map<number, number>();
  for (const event of history) {
    if (event.year > cutoffYear) continue;
    for (const teamId of resolveHistoricalAllStarHostTeamIds(event, teams)) {
      latest.set(teamId, Math.max(latest.get(teamId) ?? 0, event.year));
    }
  }
  return latest;
}

export function buildHistoricalAllStarHostsByYear(
  history: AllStarHistoryEntry[],
  teams: NBATeam[],
): Map<number, HistoricalAllStarHostSource> {
  return new Map(history.map(event => [
    event.year,
    {
      city: event.host_city ?? '',
      arena: event.host_arena ?? '',
      teamIds: resolveHistoricalAllStarHostTeamIds(event, teams),
    },
  ]));
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function autoResolveAllStarHosts(
  leagueStats: LeagueStats,
  teams: NBATeam[],
  opts: {
    horizon?: number;
    historicalHostYears?: ReadonlyMap<number, number>;
    historicalHostsByYear?: ReadonlyMap<number, HistoricalAllStarHostSource>;
  } = {},
): Host[] {
  const horizon = opts.horizon ?? 4;
  const currentYear = leagueStats.year ?? new Date().getFullYear();
  const existing = (leagueStats.allStarHosts ?? [])
    .map(normalizeAllStarHost)
    .filter((host): host is Host => host != null);
  const byYear = new Map<number, Host>();
  existing.forEach(h => byYear.set(h.year, h));

  const lastHosted = new Map<number, number>(opts.historicalHostYears);
  for (const host of existing) {
    if (host.year >= currentYear) continue;
    const source = opts.historicalHostsByYear?.get(host.year);
    const teamIds = host.teamIds?.length
      ? host.teamIds
      : source && historicalAllStarSourceMatchesHost(source, host)
        ? source.teamIds
        : [];
    teamIds.forEach(id => lastHosted.set(id, Math.max(lastHosted.get(id) ?? 0, host.year)));
  }

  const rng = mulberry32(currentYear);
  const pool = teams.filter(t => t && t.id >= 0).map(t => t.id);
  const tieBreak = new Map(pool.map(id => [id, rng()]));

  let mutated = false;
  for (let y = currentYear; y <= currentYear + horizon; y++) {
    const assigned = byYear.get(y);
    if (assigned && assigned.teamIds.length > 0) {
      const source = opts.historicalHostsByYear?.get(y);
      const teamIds = assigned.teamIds.length
        ? assigned.teamIds
        : source && historicalAllStarSourceMatchesHost(source, assigned)
          ? source.teamIds
          : [];
      teamIds.forEach(id => lastHosted.set(id, y));
      continue;
    }
    if (pool.length === 0) continue;

    const tid = [...pool].sort((left, right) => {
      const leftYear = lastHosted.get(left);
      const rightYear = lastHosted.get(right);
      if (leftYear == null && rightYear != null) return -1;
      if (leftYear != null && rightYear == null) return 1;
      if (leftYear !== rightYear) return (leftYear ?? 0) - (rightYear ?? 0);
      return (tieBreak.get(left) ?? 0) - (tieBreak.get(right) ?? 0);
    })[0];
    const team = teams.find(t => t.id === tid);
    if (!team) continue;

    lastHosted.set(tid, y);
    const arena = getArenaForTeamAtSeason(team, y);
    byYear.set(y, {
      year: y,
      city: arena?.location || team.region || team.name,
      arena: arena?.name ?? '',
      teamIds: [tid],
    });
    mutated = true;
  }

  if (!mutated) return existing;
  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}
