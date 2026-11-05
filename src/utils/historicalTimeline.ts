import { isHistoricalNbaStart } from '../data/historicalNbaSeasons';
import type { GameState, NBAPlayer } from '../types';

export interface HistoricalTimelineInput {
  currentYear?: number;
  leagueType?: string;
  moddedLeagueBase?: string;
  nbaStartYear?: number;
  date?: string;
}

export function timelineInputFromState(state: Partial<GameState>): HistoricalTimelineInput {
  return {
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase ?? (state.leagueStats as any)?.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
    date: state.date,
  };
}

export function isHistoricalNbaWhatIfTimeline(input: HistoricalTimelineInput): boolean {
  const nbaStartYear = Number(input.nbaStartYear ?? 0);
  return input.leagueType === 'modded' &&
    input.moddedLeagueBase === 'nba' &&
    isHistoricalNbaStart(nbaStartYear);
}

export function getHistoricalCompletedSeasonCutoff(input: HistoricalTimelineInput): number | undefined {
  const nbaStartYear = Number(input.nbaStartYear ?? 0);
  if (!isHistoricalNbaWhatIfTimeline(input)) return undefined;
  const currentYear = Number(input.currentYear ?? 0);
  return Math.max(nbaStartYear, currentYear > 0 ? currentYear - 1 : nbaStartYear);
}

export function getCompletedSeasonCutoff(input: HistoricalTimelineInput): number {
  const historicalCutoff = getHistoricalCompletedSeasonCutoff(input);
  if (historicalCutoff !== undefined) return historicalCutoff;
  const currentYear = Number(input.currentYear ?? 0);
  if (currentYear > 0) return currentYear;
  const dateYear = input.date ? new Date(input.date).getFullYear() : NaN;
  return Number.isFinite(dateYear) ? dateYear : new Date().getUTCFullYear();
}

export function getCurrentSeasonYear(input: HistoricalTimelineInput): number {
  const currentYear = Number(input.currentYear ?? 0);
  if (currentYear > 0) return currentYear;
  const dateYear = input.date ? new Date(input.date).getFullYear() : NaN;
  return Number.isFinite(dateYear) ? dateYear : new Date().getUTCFullYear();
}

export function isCompletedSeasonVisible(season: unknown, input: HistoricalTimelineInput): boolean {
  const year = Number(season);
  return Number.isFinite(year) && year <= getCompletedSeasonCutoff(input);
}

export function isSeasonWithinTimeline(
  season: unknown,
  input: HistoricalTimelineInput,
  options: { includeCurrentSeason?: boolean } = {},
): boolean {
  const year = Number(season);
  if (!Number.isFinite(year)) return false;
  if (year <= getCompletedSeasonCutoff(input)) return true;
  return options.includeCurrentSeason === true && year === getCurrentSeasonYear(input);
}

export function seasonLabelToEndYear(season: unknown): number | undefined {
  const text = String(season ?? '').trim();
  if (!text) return undefined;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const match = text.match(/^(\d{4})\s*[-–]\s*(\d{2}|\d{4})$/);
  if (!match) return undefined;
  const startYear = Number(match[1]);
  let endYear = Number(match[2]);
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return undefined;
  if (match[2].length === 2) {
    endYear = Math.floor(startYear / 100) * 100 + endYear;
    if (endYear <= startYear) endYear += 100;
  }
  return endYear;
}

export function seasonLabelFromEndYear(seasonEndYear: number): string {
  return `${seasonEndYear - 1}-${String(seasonEndYear).slice(-2)}`;
}

export function filterContractYearsToTimeline<T extends { season?: string | number }>(
  rows: readonly T[] | undefined,
  input: HistoricalTimelineInput,
  options: { includeCurrentSeason?: boolean } = {},
): T[] {
  if (!isHistoricalNbaWhatIfTimeline(input)) return [...(rows ?? [])];
  return (rows ?? []).filter(row => {
    const seasonEndYear = seasonLabelToEndYear(row.season);
    return seasonEndYear !== undefined && isSeasonWithinTimeline(seasonEndYear, input, options);
  });
}

export function basketballSeasonFromDate(dateLike: unknown): number | undefined {
  const dateText = String(dateLike ?? '').trim();
  if (!dateText) return undefined;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return undefined;
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  return month >= 7 ? year + 1 : year;
}

export function filterRowsToCompletedSeasons<T>(
  rows: readonly T[] | undefined,
  seasonOf: (row: T) => unknown,
  input: HistoricalTimelineInput,
): T[] {
  return (rows ?? []).filter(row => isCompletedSeasonVisible(seasonOf(row), input));
}

type StatLike = {
  season?: number | string;
  abbrev?: unknown;
  teamAbbrev?: unknown;
  tm?: unknown;
  TM?: unknown;
};

export function hasSourceTeamAbbrevStat(stat: StatLike): boolean {
  return Boolean(String(stat.abbrev ?? stat.teamAbbrev ?? stat.tm ?? stat.TM ?? '').trim());
}

export function isSourceOnlyHistoricalPlayer(player: Pick<NBAPlayer, 'internalId'> | null | undefined): boolean {
  const id = String(player?.internalId ?? '');
  return id.startsWith('hist-') || id.startsWith('native-hist-') || id.startsWith('native-season-');
}

export function filterPostBranchSourceStats<T extends StatLike>(
  stats: readonly T[] | undefined,
  branchStartSeason?: number,
): T[] {
  if (!branchStartSeason) return (stats ?? []) as T[];
  return (stats ?? []).filter(stat => {
    const season = Number(stat.season ?? 0);
    if (!Number.isFinite(season) || season <= branchStartSeason) return true;
    return !hasSourceTeamAbbrevStat(stat);
  });
}

export function isDraftProspectLikeAtYear(player: NBAPlayer, currentYear: number): boolean {
  if (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') {
    const draftYear = Number(player.draft?.year ?? 0);
    return draftYear <= 0 || draftYear <= currentYear;
  }

  return false;
}

export function isPlayerBornBySeason(player: NBAPlayer, currentYear: number): boolean {
  const bornYear = Number(player.born?.year ?? 0);
  return bornYear <= 0 || bornYear <= currentYear;
}

export function isPlayerVisibleInTimeline(player: NBAPlayer, currentYear: number): boolean {
  if (!isPlayerBornBySeason(player, currentYear)) return false;
  const draftYear = Number(player.draft?.year ?? 0);
  const isProspect = player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect';
  return !isProspect || draftYear <= 0 || draftYear <= currentYear;
}

type RetiredJerseyLike = {
  seasonRetired?: number | string;
  yearRetired?: number | string;
  retiredYear?: number | string;
  season?: number | string;
  playerId?: string;
  pid?: string | number;
  text?: string;
};

function retiredJerseySeason(record: RetiredJerseyLike): number | undefined {
  const candidates = [record.seasonRetired, record.yearRetired, record.retiredYear, record.season];
  for (const candidate of candidates) {
    const year = Number(candidate);
    if (Number.isFinite(year) && year > 0) return year;
  }
  return undefined;
}

function retiredJerseyPlayer(record: RetiredJerseyLike, players: readonly NBAPlayer[] | undefined): NBAPlayer | undefined {
  if (!players?.length) return undefined;
  const playerId = String(record.playerId ?? '').trim();
  const pid = String(record.pid ?? '').trim();
  const name = String(record.text ?? '').trim().toLowerCase();
  return players.find(player => {
    if (playerId && String(player.internalId ?? '') === playerId) return true;
    if (pid && String((player as any).pid ?? '') === pid) return true;
    return !!name && String(player.name ?? '').trim().toLowerCase() === name;
  });
}

export function isRetiredJerseyVisibleInTimeline<T extends RetiredJerseyLike>(
  record: T,
  input: HistoricalTimelineInput,
  players?: readonly NBAPlayer[],
): boolean {
  if (!isHistoricalNbaWhatIfTimeline(input)) return true;

  const explicitSeason = retiredJerseySeason(record);
  if (explicitSeason !== undefined) {
    return explicitSeason <= getCompletedSeasonCutoff(input);
  }

  const player = retiredJerseyPlayer(record, players);
  if (!player) return false;
  const retiredYear = Number(player.retiredYear ?? 0);
  return retiredYear > 0 && retiredYear <= getCompletedSeasonCutoff(input);
}

export function filterRetiredJerseysToTimeline<T extends RetiredJerseyLike>(
  records: readonly T[] | undefined,
  input: HistoricalTimelineInput,
  players?: readonly NBAPlayer[],
): T[] {
  return (records ?? []).filter(record => {
    if (!isRetiredJerseyVisibleInTimeline(record, input, players)) return false;
    const player = retiredJerseyPlayer(record, players);
    return !player || player.status === 'Retired' || !!player.retiredYear || !!player.hof;
  });
}
