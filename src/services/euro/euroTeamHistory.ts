import type { GameResult, GameState } from '../../types';
import { selectCompetitionTeamTids } from '../competition/competitionScheduler';
import { getWinningTeamId } from '../../utils/gameOutcome';

export interface EuroTeamCompetitionOption {
  id: string;
  label: string;
  shortLabel: string;
  accentColor: string;
}

export interface EuroTeamSeasonRow {
  season: number;
  won?: number;
  lost?: number;
  playoffRoundsWon?: number;
  playoffAppearances?: number;
  isChamp: boolean;
  isRU: boolean;
  isCurrent: boolean;
  isStandingsTitle: boolean;
  titleCount: number;
  competitionTitles: string[];
  conferenceTitles: string[];
}

export interface EuroTeamTrophy {
  key: string;
  season: number;
  competitionId: string;
  competitionName: string;
  shortName: string;
  accentColor: string;
  runnerUpTid?: number;
  score?: string;
  mvpName?: string;
  coachName?: string;
}

type ResolutionLike = {
  season: number;
  championTid?: number;
  runnerUpTid?: number;
  semifinalistTids: number[];
  quarterfinalistTids: number[];
  standings: Array<{ tid: number; wins?: number; losses?: number }>;
  score?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

function readResolution(value: unknown): ResolutionLike | null {
  if (!isRecord(value) || !Number.isFinite(Number(value.season))) return null;
  const standings = Array.isArray(value.standings)
    ? value.standings.flatMap(row => {
        if (!isRecord(row) || !Number.isFinite(Number(row.tid))) return [];
        return [{
          tid: Number(row.tid),
          wins: Number.isFinite(Number(row.wins)) ? Number(row.wins) : undefined,
          losses: Number.isFinite(Number(row.losses)) ? Number(row.losses) : undefined,
        }];
      })
    : [];
  return {
    season: Number(value.season),
    championTid: Number.isFinite(Number(value.championTid)) ? Number(value.championTid) : undefined,
    runnerUpTid: Number.isFinite(Number(value.runnerUpTid)) ? Number(value.runnerUpTid) : undefined,
    semifinalistTids: numberArray(value.semifinalistTids),
    quarterfinalistTids: numberArray(value.quarterfinalistTids),
    standings,
    score: typeof value.score === 'string' ? value.score : undefined,
  };
}

function containsTeam(row: ResolutionLike, tid: number): boolean {
  return row.championTid === tid
    || row.runnerUpTid === tid
    || row.semifinalistTids.includes(tid)
    || row.quarterfinalistTids.includes(tid)
    || row.standings.some(standing => standing.tid === tid);
}

function gameSeason(game: GameResult, currentSeason: number): number {
  const explicit = Number((game as GameResult & { season?: number }).season);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const date = new Date(String(game.date ?? ''));
  if (Number.isNaN(date.getTime())) return currentSeason;
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 7 ? year + 1 : year;
}

export function getEuroTeamCompetitionOptions(
  state: GameState,
  tid: number,
): EuroTeamCompetitionOption[] {
  const options = (state.activeCompetitions ?? []).filter(spec => {
    if (selectCompetitionTeamTids(spec, state).includes(tid)) return true;
    return (state.competitionHistory?.[spec.id] ?? [])
      .map(readResolution)
      .some(row => !!row && containsTeam(row, tid));
  }).map(spec => ({
    id: spec.id,
    label: spec.displayName,
    shortLabel: spec.shortName,
    accentColor: spec.accentColor,
  }));
  const primary = state.euroPrimaryCompetitionId;
  return options.sort((left, right) =>
    Number(right.id === primary) - Number(left.id === primary)
    || left.label.localeCompare(right.label)
  );
}

export function buildEuroTeamSeasonHistory(
  state: GameState,
  tid: number,
  competitionId: string | 'all',
): EuroTeamSeasonRow[] {
  const options = getEuroTeamCompetitionOptions(state, tid);
  const ids = competitionId === 'all' ? options.map(option => option.id) : [competitionId];
  const labels = new Map(options.map(option => [option.id, option.shortLabel || option.label]));
  const rows = new Map<number, EuroTeamSeasonRow>();
  const getRow = (season: number) => {
    const existing = rows.get(season);
    if (existing) return existing;
    const row: EuroTeamSeasonRow = {
      season,
      isChamp: false,
      isRU: false,
      isCurrent: season === state.leagueStats.year,
      isStandingsTitle: false,
      titleCount: 0,
      competitionTitles: [],
      conferenceTitles: [],
    };
    rows.set(season, row);
    return row;
  };

  for (const id of ids) {
    for (const raw of state.competitionHistory?.[id] ?? []) {
      const result = readResolution(raw);
      if (!result || !containsTeam(result, tid)) continue;
      const row = getRow(result.season);
      const standing = result.standings.find(item => item.tid === tid);
      if (standing?.wins != null) row.won = (row.won ?? 0) + standing.wins;
      if (standing?.losses != null) row.lost = (row.lost ?? 0) + standing.losses;
      if (result.championTid === tid) {
        row.isChamp = true;
        row.isCurrent = false;
        row.titleCount += 1;
        row.competitionTitles.push(labels.get(id) ?? id);
        row.playoffRoundsWon = Math.max(row.playoffRoundsWon ?? 0, 4);
      } else if (result.runnerUpTid === tid) {
        row.isRU = true;
        row.isCurrent = false;
        row.playoffRoundsWon = Math.max(row.playoffRoundsWon ?? 0, 3);
      } else if (result.semifinalistTids.includes(tid)) {
        row.playoffRoundsWon = Math.max(row.playoffRoundsWon ?? 0, 2);
      } else if (result.quarterfinalistTids.includes(tid)) {
        row.playoffRoundsWon = Math.max(row.playoffRoundsWon ?? 0, 1);
      }
      if ((row.playoffRoundsWon ?? -1) >= 0) row.playoffAppearances = (row.playoffAppearances ?? 0) + 1;
    }
  }

  const gameRecords = new Map<string, { wins: number; losses: number; postseason: boolean }>();
  for (const game of state.boxScores ?? []) {
    if (!ids.includes(String(game.competitionId))) continue;
    if (game.homeTeamId !== tid && game.awayTeamId !== tid) continue;
    const season = gameSeason(game, state.leagueStats.year);
    const key = `${season}:${game.competitionId}`;
    const record = gameRecords.get(key) ?? { wins: 0, losses: 0, postseason: false };
    const won = Number(getWinningTeamId(game)) === tid;
    record.wins += Number(won);
    record.losses += Number(!won);
    record.postseason ||= ['play-in', 'qf', 'sf', 'final'].includes(String(game.competitionPhase));
    gameRecords.set(key, record);
  }
  for (const [key, record] of gameRecords) {
    const season = Number(key.split(':')[0]);
    const row = getRow(season);
    const hasArchivedRecord = row.won != null || row.lost != null;
    if (!hasArchivedRecord || season === state.leagueStats.year) {
      row.won = (row.won ?? 0) + record.wins;
      row.lost = (row.lost ?? 0) + record.losses;
    }
    if (record.postseason && (row.playoffAppearances ?? 0) === 0) row.playoffAppearances = 1;
  }

  return [...rows.values()]
    .map(row => ({
      ...row,
      competitionTitles: [...new Set(row.competitionTitles)],
      conferenceTitles: [...new Set(row.competitionTitles)],
    }))
    .sort((left, right) => right.season - left.season);
}

export function buildEuroTeamTrophies(state: GameState, tid: number): EuroTeamTrophy[] {
  const options = getEuroTeamCompetitionOptions(state, tid);
  const awards = state.historicalAwards ?? [];
  return options.flatMap(option => (state.competitionHistory?.[option.id] ?? []).flatMap(raw => {
    const result = readResolution(raw);
    if (!result || result.championTid !== tid) return [];
    const mvp = awards.find(award =>
      Number(award.season) === result.season
      && award.competitionId === option.id
      && /MVP$/i.test(award.type)
    );
    const coach = awards.find(award =>
      Number(award.season) === result.season
      && award.competitionId === option.id
      && /Coach|Championship Coach/i.test(award.type)
    );
    return [{
      key: `${option.id}:${result.season}:${tid}`,
      season: result.season,
      competitionId: option.id,
      competitionName: option.label,
      shortName: option.shortLabel,
      accentColor: option.accentColor,
      runnerUpTid: result.runnerUpTid,
      score: result.score,
      mvpName: mvp?.mvp?.name ?? mvp?.name,
      coachName: coach?.coachName ?? coach?.name,
    }];
  })).sort((left, right) => right.season - left.season || left.competitionName.localeCompare(right.competitionName));
}
