import { normalizeHistoricalNbaTeamAbbrev } from '../../../utils/historicalNbaTeamAbbrev';

export type HistoryLeagueBucket = 'nba' | 'wnba';

export const getLeagueHistoryTeamPool = <T extends { id?: number; tid?: number }>(
  activeTeams: readonly T[],
  teamArchive: readonly T[] | undefined,
  bucket: HistoryLeagueBucket,
): T[] => {
  if (bucket !== 'wnba') return [...activeTeams];
  const teams = new Map<number, T>();
  for (const team of [...activeTeams, ...(teamArchive ?? [])]) {
    const id = Number(team.id ?? team.tid);
    if (Number.isFinite(id) && !teams.has(id)) teams.set(id, team);
  }
  return [...teams.values()];
};

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
const normalizeAbbrev = (value: unknown) => String(value ?? '').trim().toUpperCase();

const explicitLeagueBucket = (row: any): HistoryLeagueBucket | 'external' | null => {
  const values = [row?.competitionId, row?.league, row?.leagueKey, row?.uiMode]
    .map(normalize)
    .filter(Boolean);
  if (!values.length) return null;
  const text = values.join(' ');
  if (text.includes('wnba')) return 'wnba';
  if (text.includes('g-league') || text.includes('gleague')) return 'external';
  if (
    text.includes('euro')
    || text.includes('endesa')
    || text.includes('acb')
    || text.includes('pba')
    || text.includes('nbl')
    || text.includes('b-league')
    || text.includes('bleague')
    || text.includes('cba')
    || text.includes('france')
    || text.includes('serie a')
    || text.includes('bbl')
    || text.includes('a1')
    || text.includes('bsl')
  ) return 'external';
  if (text.includes('nba')) return 'nba';
  return 'external';
};

const rowAbbrev = (row: any) => normalizeAbbrev(
  row?.abbrev ?? row?.teamAbbrev ?? row?.tm ?? row?.TM,
);

const leagueAbbrev = (value: unknown, bucket: HistoryLeagueBucket) => (
  bucket === 'nba' ? normalizeHistoricalNbaTeamAbbrev(value) ?? '' : normalizeAbbrev(value)
);

const teamId = (team: any) => Number(team?.id ?? team?.tid);

export const scopeHistoryPlayersToLeague = <T extends { stats?: any[] }>(
  players: readonly T[],
  teams: readonly any[],
  bucket: HistoryLeagueBucket,
): T[] => {
  const teamIds = new Set(
    teams.map(teamId).filter(id => Number.isFinite(id) && id >= 0),
  );
  const teamAbbrevs = new Set(
    teams.map(team => leagueAbbrev(team?.abbrev, bucket)).filter(Boolean),
  );
  return players.map(player => ({
    ...player,
    stats: (player.stats ?? []).filter(row => {
      const explicit = explicitLeagueBucket(row);
      if (explicit) return explicit === bucket;
      const tid = Number(row?.tid);
      return (Number.isFinite(tid) && teamIds.has(tid)) || teamAbbrevs.has(leagueAbbrev(rowAbbrev(row), bucket));
    }),
  }));
};

export const scopeHistoryPlayersToTeam = <T extends { stats?: any[] }>(
  players: readonly T[],
  acceptedTeamAbbrevs: ReadonlySet<string>,
  bucket: HistoryLeagueBucket,
): T[] => {
  const abbrevs = new Set([...acceptedTeamAbbrevs].map(value => leagueAbbrev(value, bucket)).filter(Boolean));
  const sourceTeamIds = new Set<number>();
  for (const player of players) {
    for (const row of player.stats ?? []) {
      const explicit = explicitLeagueBucket(row);
      if (explicit && explicit !== bucket) continue;
      if (!abbrevs.has(leagueAbbrev(rowAbbrev(row), bucket))) continue;
      const tid = Number(row?.tid);
      if (Number.isFinite(tid) && tid >= 0) sourceTeamIds.add(tid);
    }
  }
  return players.map(player => ({
    ...player,
    stats: (player.stats ?? []).filter(row => {
      const explicit = explicitLeagueBucket(row);
      if (explicit && explicit !== bucket) return false;
      const abbrev = leagueAbbrev(rowAbbrev(row), bucket);
      if (abbrev) return abbrevs.has(abbrev);
      const tid = Number(row?.tid);
      return Number.isFinite(tid) && sourceTeamIds.has(tid);
    }),
  }));
};

export const isHistoryAwardInLeagueScope = (
  award: any,
  bucket: HistoryLeagueBucket,
  scopedStatSeasons: ReadonlySet<number>,
): boolean => {
  const explicit = explicitLeagueBucket(award);
  if (explicit) return explicit === bucket;
  const season = Number(award?.season);
  return Number.isFinite(season) && scopedStatSeasons.has(season);
};
