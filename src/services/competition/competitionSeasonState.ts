import type { Game, GameResult } from '../../types';
import type { CompetitionSpec } from './types';
import { selectCompetitionTeamTids } from './competitionScheduler';

export interface PostseasonScheduleState {
  date: string;
  schedule: Game[];
  boxScores: GameResult[];
  nonNBATeams?: Array<{ tid: number; league?: string }>;
  clubAliasMap?: Record<number, number>;
  userTeamId?: number | null;
}

export interface EuroSeasonCompletionState extends PostseasonScheduleState {
  activeCompetitions?: CompetitionSpec[];
  leagueStats?: { uiMode?: string; year?: number };
}

type CompetitionSeasonResolver = (
  spec: CompetitionSpec,
  boxScores: GameResult[],
  season: number,
  seedTids?: number[],
) => { championTid: number | null } | null;

const EURO_SEASON_COMPLETION_COMPETITION_IDS = new Set(['endesa', 'euroleague']);

export function dateForRound(season: number, month: number, day: number): string {
  return new Date(Date.UTC(month >= 9 ? season - 1 : season, month - 1, day)).toISOString();
}

export function matchesBoxScoreSeason(game: GameResult, season?: number): boolean {
  if (season == null) return true;
  if (typeof game.season === 'number') return game.season === season;
  const match = String(game.date ?? '').match(/(20\d{2})/);
  if (!match) return false;
  const year = Number(match[1]);
  return year === season || year === season - 1;
}

export function matchesScheduleSeason(game: Game, season: number): boolean {
  const year = new Date(game.date ?? '').getUTCFullYear();
  return Number.isFinite(year) && (year === season || year === season - 1);
}

export function roundStartDate(season: number, round: { start: { month: number; day: number } }): string {
  return dateForRound(season, round.start.month, round.start.day);
}

export function roundEndDate(season: number, round: { end: { month: number; day: number } }): string {
  return dateForRound(season, round.end.month, round.end.day);
}

export function addDays(dateIso: string, days: number): string {
  const date = new Date(dateIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function playoffStartDateForSeason(spec: CompetitionSpec, season: number): string | null {
  const round = spec.playoffFormat?.rounds.find((entry) =>
    entry.phase === 'qf' ||
    entry.phase === 'quarterfinals' ||
    entry.phase === 'play-in' ||
    entry.phase === 'semifinals' ||
    entry.phase === 'final-four' ||
    entry.phase === 'final',
  );
  if (!round) return null;
  return dateForRound(season, round.start.month, round.start.day).slice(0, 10);
}

function seasonEndDateForSeason(spec: CompetitionSpec, season: number): string {
  return dateForRound(season, spec.seasonEnd.month, spec.seasonEnd.day).slice(0, 10);
}

function hasCompetitionSeasonMaterial(state: EuroSeasonCompletionState, spec: CompetitionSpec, season: number): boolean {
  return state.schedule.some((game) =>
    game.competitionId === spec.id &&
    matchesScheduleSeason(game, season),
  ) || state.boxScores.some((game) =>
    game.competitionId === spec.id &&
    matchesBoxScoreSeason(game, season),
  );
}

function hasCompetitionPostseasonMaterial(state: EuroSeasonCompletionState, spec: CompetitionSpec, season: number): boolean {
  const postseasonPhases = new Set(['play-in', 'qf', 'sf', 'final']);
  return state.schedule.some((game) =>
    game.competitionId === spec.id &&
    postseasonPhases.has(String(game.competitionPhase)) &&
    matchesScheduleSeason(game, season),
  ) || state.boxScores.some((game) =>
    game.competitionId === spec.id &&
    postseasonPhases.has(String(game.competitionPhase)) &&
    matchesBoxScoreSeason(game, season),
  );
}

function isRegularSeasonPhase(phase?: string): boolean {
  return !phase || phase === 'regular-season' || phase === 'regular';
}

function regularSeasonMaterialized(state: EuroSeasonCompletionState, spec: CompetitionSpec, season: number): boolean {
  return state.schedule.some((game) =>
    game.competitionId === spec.id &&
    isRegularSeasonPhase(game.competitionPhase) &&
    matchesScheduleSeason(game, season),
  ) || state.boxScores.some((game) =>
    game.competitionId === spec.id &&
    isRegularSeasonPhase(game.competitionPhase) &&
    matchesBoxScoreSeason(game, season),
  );
}

function regularSeasonScheduleComplete(state: EuroSeasonCompletionState, spec: CompetitionSpec): boolean {
  return !state.schedule.some((game) =>
    game.competitionId === spec.id &&
    !game.played &&
    isRegularSeasonPhase(game.competitionPhase),
  );
}

function shouldCheckEuroSeasonCompletion(state: EuroSeasonCompletionState, spec: CompetitionSpec, season: number): boolean {
  const today = String(state.date ? new Date(state.date).toISOString() : '').slice(0, 10);
  const playoffStart = playoffStartDateForSeason(spec, season);
  const seasonEnd = seasonEndDateForSeason(spec, season);
  if (hasCompetitionPostseasonMaterial(state, spec, season)) return !playoffStart || today >= playoffStart;
  return today >= seasonEnd && regularSeasonMaterialized(state, spec, season) && regularSeasonScheduleComplete(state, spec);
}

function euroSeasonCandidates(state: EuroSeasonCompletionState): number[] {
  const season = state.leagueStats?.year;
  return typeof season === 'number' && Number.isFinite(season) ? [season] : [];
}

export function getUnresolvedEuroSeasonCompetitionIds(
  state: EuroSeasonCompletionState,
  resolveCompetitionSeason: CompetitionSeasonResolver,
): string[] {
  const seasons = euroSeasonCandidates(state);
  if (seasons.length === 0) return [];

  return (state.activeCompetitions ?? [])
    .filter((spec) => EURO_SEASON_COMPLETION_COMPETITION_IDS.has(spec.id))
    .filter((spec) => {
      return seasons.some((season) => {
        if (!hasCompetitionSeasonMaterial(state, spec, season)) return false;
        if (!shouldCheckEuroSeasonCompletion(state, spec, season)) return false;
        const seedTids = selectCompetitionTeamTids(spec, state);
        const resolution = resolveCompetitionSeason(spec, state.boxScores, season, seedTids);
        return !resolution || resolution.championTid == null;
      });
    })
    .map((spec) => spec.id);
}

export function hasUnresolvedEuroSeasonCompetitions(
  state: EuroSeasonCompletionState,
  resolveCompetitionSeason: CompetitionSeasonResolver,
): boolean {
  return getUnresolvedEuroSeasonCompetitionIds(state, resolveCompetitionSeason).length > 0;
}
