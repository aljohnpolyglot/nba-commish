import type { GameState } from '../../types';
import { initialEuroOffseasonChecklist } from '../offseason/offseasonChecklistState';
import { getManagedEuroCompetitions } from '../../utils/euroLeagueDefaults';
import { selectCompetitionTeamTids } from './competitionScheduler';
import { resolveCompetitionSeason, type CompetitionSeasonResolution } from './competitionResolver';
import { matchesBoxScoreSeason, matchesScheduleSeason } from './competitionSeasonState';

export interface CompletedEuroSeasonReviewPatch {
  competitionHistory: Record<string, CompetitionSeasonResolution[]>;
  offseasonChecklist: NonNullable<GameState['offseasonChecklist']>;
  resolutions: CompetitionSeasonResolution[];
}

export function getCompletedEuroSeasonYear(
  resolutions: readonly CompetitionSeasonResolution[],
): number | null {
  const seasons = resolutions
    .map(resolution => Number(resolution.season))
    .filter(Number.isFinite);
  return seasons.length > 0 ? Math.max(...seasons) : null;
}

export function shouldPrepareCompletedEuroSeasonRollover(
  state: Pick<GameState, 'leagueStats' | 'offseasonChecklist'>,
  resolutions: readonly CompetitionSeasonResolution[],
): boolean {
  const season = getCompletedEuroSeasonYear(resolutions);
  return season != null
    && Number(state.leagueStats.year) === season
    && state.leagueStats.euroRolloverPreparedSeason !== season;
}

function hasSeasonMaterial(state: GameState, competitionId: string, season: number): boolean {
  return state.schedule.some(game =>
    game.competitionId === competitionId && matchesScheduleSeason(game, season),
  ) || state.boxScores.some(game =>
    game.competitionId === competitionId && matchesBoxScoreSeason(game, season),
  );
}

function storedResolution(
  state: GameState,
  competitionId: string,
  season: number,
): CompetitionSeasonResolution | null {
  const entries = (state.competitionHistory?.[competitionId] ?? []) as CompetitionSeasonResolution[];
  return entries.find(entry =>
    Number(entry?.season) === season && entry?.championTid != null,
  ) ?? null;
}

export function getCompletedManagedEuroSeasonResolutions(
  state: GameState,
): CompetitionSeasonResolution[] | null {
  if (state.leagueStats?.uiMode !== 'euro_isolated' || state.gameMode !== 'gm') return null;
  const season = Number(state.leagueStats?.year);
  if (!Number.isFinite(season)) return null;
  const competitions = getManagedEuroCompetitions(state as any);
  if (competitions.length === 0) return null;

  const resolutions: CompetitionSeasonResolution[] = [];
  for (const competition of competitions) {
    const saved = storedResolution(state, competition.id, season);
    if (saved) {
      resolutions.push(saved);
      continue;
    }
    if (!hasSeasonMaterial(state, competition.id, season)) continue;
    const resolution = resolveCompetitionSeason(
      competition,
      state.boxScores,
      season,
      selectCompetitionTeamTids(competition, state),
    );
    if (!resolution || resolution.championTid == null) return null;
    resolutions.push(resolution);
  }
  return resolutions.length > 0 ? resolutions : null;
}

export function buildCompletedEuroSeasonReviewPatch(
  state: GameState,
): CompletedEuroSeasonReviewPatch | null {
  const resolutions = getCompletedManagedEuroSeasonResolutions(state);
  if (!resolutions) return null;

  let historyChanged = false;
  const competitionHistory = Object.fromEntries(
    Object.entries(state.competitionHistory ?? {}).map(([id, entries]) => [id, [...entries] as CompetitionSeasonResolution[]]),
  );
  const backgroundResolutions = (state.activeCompetitions ?? [])
    .filter(competition => !resolutions.some(resolution => resolution.competitionId === competition.id))
    .map(competition => resolveCompetitionSeason(
      competition,
      state.boxScores,
      Number(state.leagueStats.year),
      selectCompetitionTeamTids(competition, state),
    ))
    .filter((resolution): resolution is CompetitionSeasonResolution => !!resolution?.championTid);
  for (const resolution of [...resolutions, ...backgroundResolutions]) {
    const existing = competitionHistory[resolution.competitionId] ?? [];
    const index = existing.findIndex(entry => Number(entry?.season) === resolution.season);
    if (index < 0) {
      competitionHistory[resolution.competitionId] = [...existing, resolution];
      historyChanged = true;
    } else if (existing[index]?.championTid == null) {
      const next = [...existing];
      next[index] = resolution;
      competitionHistory[resolution.competitionId] = next;
      historyChanged = true;
    }
  }

  let offseasonChecklist = state.offseasonChecklist;
  let checklistChanged = false;
  if (!offseasonChecklist) {
    offseasonChecklist = initialEuroOffseasonChecklist(true);
    checklistChanged = true;
  } else if (offseasonChecklist.seasonSummary === 'skipped') {
    offseasonChecklist = { ...offseasonChecklist, seasonSummary: 'pending' };
    checklistChanged = true;
  }

  if (!historyChanged && !checklistChanged) return null;
  return {
    competitionHistory,
    offseasonChecklist: offseasonChecklist!,
    resolutions,
  };
}
