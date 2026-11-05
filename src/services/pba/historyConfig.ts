import type {
  PbaHistoricalDataStatus,
  PbaMasterSource,
  PbaSourcePlayer,
  PbaSourceStat,
  PbaSourceTeam,
  PbaSourceTeamSeason,
} from './historicalTypes';

export const PBA_HISTORY = {
  archiveStartYear: 1975,
  playableStartYear: 1988,
  latestCompletedHistorySeason: 2025,
  latestPlayableSeason: 2026,
} as const;

export const PBA_HISTORICAL_SOURCE = {
  sourceUrl: '/data/external/pba/pba-2027-final-jerseys-cleaned-bbgm.json',
  sourceVersion: 'sha256-4ee759f9baa11c2a7022d560b8c6af0ee63886a7156e664a5c07f3a668eb2cbf',
  teamTidOffset: 2000,
  nbaCoexistSeason: 2026,
} as const;

export interface PlayablePbaSeason {
  season: number;
  sourceSeason: number;
  startYear: number;
  label: string;
  dataStatus: PbaHistoricalDataStatus;
  teamCount: number;
}

const seasonRows = (team: PbaSourceTeam, season: number): PbaSourceTeamSeason[] => (
  (team.seasons ?? []).filter(row => Number(row.season) === season)
);

const regularStats = (player: PbaSourcePlayer, season: number): PbaSourceStat[] => (
  (player.stats ?? []).filter(row => Number(row.season) === season && row.playoffs !== true)
);

const normalized = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(the|team|basketball|club)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const aliasesForTeam = (team: PbaSourceTeam, row: PbaSourceTeamSeason): string[] => [
  row.pbaTeamName,
  ...(row.pbaAliases ?? []),
  row.region,
  row.name,
  `${row.region ?? ''} ${row.name ?? ''}`,
  team.region,
  team.name,
  `${team.region ?? ''} ${team.name ?? ''}`,
].map(normalized).filter(Boolean);

const sourceTeamLabel = (stat: PbaSourceStat | undefined): string => normalized(
  stat?.pbaSourceTeamName ?? stat?.pbaSourceTeam ?? stat?.pba1993RosterTeam,
);

const aliasScore = (left: string, right: string): number => {
  if (!left || !right) return 0;
  if (left === right) return 1000;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) + 100;
  const leftTokens = new Set(left.split(' ').filter(token => token.length > 2));
  return right.split(' ').filter(token => leftTokens.has(token)).reduce((sum, token) => sum + token.length, 0);
};

export function getPbaSeasonDataStatus(_season: number): PbaHistoricalDataStatus {
  return 'COMPLETE';
}

export function getPbaSeasonTeamEntries(
  leagueData: PbaMasterSource,
  season: number,
): Array<{ team: PbaSourceTeam; row: PbaSourceTeamSeason }> {
  const direct = leagueData.teams.flatMap(team => seasonRows(team, season).map(row => ({ team, row })));
  if (direct.length > 0) return direct;
  return leagueData.teams.flatMap(team => {
    const prior = seasonRows(team, season - 1)
      .sort((left, right) => Number(right.season) - Number(left.season))[0];
    const resumes = seasonRows(team, season + 1).length > 0;
    return prior && resumes
      ? [{ team, row: { ...prior, season, pbaSeasonLabel: String(season) } }]
      : [];
  });
}

export function resolvePbaPlayerRawTid(
  player: PbaSourcePlayer,
  season: number,
  leagueData: PbaMasterSource,
): number | null {
  const entries = getPbaSeasonTeamEntries(leagueData, season);
  if (entries.length === 0) return null;
  const activeTids = new Set(entries.map(entry => entry.team.tid));
  const stat = regularStats(player, season)
    .sort((left, right) => Number(right.gp ?? 0) - Number(left.gp ?? 0))[0];
  const directCandidates = [
    stat?.tid,
    (player.ratings ?? []).find(row => Number(row.season) === season)?.tid,
    season === Number(leagueData.startingSeason) ? player.tid : undefined,
  ].map(Number).filter(Number.isInteger);
  const direct = directCandidates.find(tid => tid >= 0 && activeTids.has(tid));
  if (direct !== undefined) return direct;

  const label = sourceTeamLabel(stat);
  if (!label) return null;
  const ranked = entries
    .map(entry => ({
      tid: entry.team.tid,
      score: Math.max(...aliasesForTeam(entry.team, entry.row).map(alias => aliasScore(label, alias)), 0),
    }))
    .sort((left, right) => right.score - left.score || left.tid - right.tid);
  return ranked[0]?.score >= 4 ? ranked[0].tid : null;
}

export function getActivePbaSeasonTeamEntries(
  leagueData: PbaMasterSource,
  season: number,
): Array<{ team: PbaSourceTeam; row: PbaSourceTeamSeason }> {
  const supportedTids = new Set<number>();
  for (const player of leagueData.players) {
    const hasRating = (player.ratings ?? []).some(row => Number(row.season) === season);
    if (!hasRating) continue;
    const tid = resolvePbaPlayerRawTid(player, season, leagueData);
    if (tid !== null) supportedTids.add(tid);
  }
  return getPbaSeasonTeamEntries(leagueData, season)
    .filter(entry => supportedTids.has(entry.team.tid))
    .sort((left, right) => left.team.tid - right.team.tid);
}

export function isPlayablePbaSeason(season: number, leagueData: PbaMasterSource): boolean {
  if (
    !Number.isInteger(season)
    || season < PBA_HISTORY.playableStartYear
    || season > PBA_HISTORY.latestPlayableSeason
  ) return false;
  const entries = getActivePbaSeasonTeamEntries(leagueData, season);
  if (entries.length < 2) return false;
  const teamTids = new Set(entries.map(entry => entry.team.tid));
  const participatingPlayers = leagueData.players.filter(player => {
    const hasRating = (player.ratings ?? []).some(row => Number(row.season) === season);
    if (!hasRating) return false;
    const tid = resolvePbaPlayerRawTid(player, season, leagueData);
    return tid !== null && teamTids.has(tid);
  });
  return participatingPlayers.length > 0 && teamTids.size === entries.length;
}

export function formatPbaSeasonKeyLabel(season: number, leagueData?: PbaMasterSource): string {
  const sourceLabel = leagueData
    ? getPbaSeasonTeamEntries(leagueData, season)
      .map(entry => String(entry.row.pbaSeasonLabel ?? '').trim())
      .find(Boolean)
    : undefined;
  if (sourceLabel && /\d{4}\s*[-/]\s*\d{2}/.test(sourceLabel)) {
    return sourceLabel.replace(/\s*\/\s*/, '-');
  }
  if (season === 2020) return '2020';
  return `${season - 1}-${String(season).slice(-2)}`;
}

export function getPlayablePbaSeasons(leagueData: PbaMasterSource): PlayablePbaSeason[] {
  const candidates = new Set<number>();
  for (const team of leagueData.teams) {
    for (const row of team.seasons ?? []) candidates.add(Number(row.season));
  }
  for (const player of leagueData.players) {
    for (const rating of player.ratings ?? []) candidates.add(Number(rating.season));
  }
  return [...candidates]
    .filter(season => isPlayablePbaSeason(season, leagueData))
    .sort((left, right) => left - right)
    .map(season => ({
      season,
      sourceSeason: season,
      startYear: season,
      label: formatPbaSeasonKeyLabel(season, leagueData),
      dataStatus: getPbaSeasonDataStatus(season),
      teamCount: getActivePbaSeasonTeamEntries(leagueData, season).length,
    }));
}

export function getLatestPlayablePbaSeason(leagueData: PbaMasterSource): number {
  return getPlayablePbaSeasons(leagueData).at(-1)?.season ?? PBA_HISTORY.playableStartYear;
}

export function getNextPbaSeasonKey(currentSeason: number): number {
  return currentSeason + 1;
}

export function getPbaArchiveSeasonKeys(): number[] {
  return Array.from(
    { length: PBA_HISTORY.playableStartYear - PBA_HISTORY.archiveStartYear },
    (_, index) => PBA_HISTORY.archiveStartYear + index,
  );
}
