import type { Game, GameState } from '../../types';
import { resolveLeagueSeasonLifecycle } from './leagueSeasonLifecycle';

export type PostseasonRegularSeasonConflict = {
  code: 'LEGACY_POSTSEASON_REGULAR_SEASON_CONFLICT';
  season: number;
  competition: 'main';
  playedPostseasonGameIds: number[];
  unresolvedRegularSeasonGameIds: number[];
  standingsCanStillChange: boolean;
  recommendedAction: 'continue_postseason';
};

export const isCountableMainRegularSeasonGame = (
  game: Game,
  season: number,
  activeTeamIds?: ReadonlySet<number>,
): boolean => (
  !game.isPreseason
  && !game.isPlayoff
  && !game.isPlayIn
  && !game.isAllStar
  && !game.isRisingStars
  && !game.isCelebrityGame
  && !game.isExhibition
  && !game.competitionId
  && !game.excludeFromRecord
  && game.legacyRecovery?.disposition !== 'void'
  && (game.season == null || Number(game.season) === season)
  && (!activeTeamIds || (activeTeamIds.has(Number(game.homeTid)) && activeTeamIds.has(Number(game.awayTid))))
);

export function getUnresolvedCountableRegularSeasonGames(state: GameState): Game[] {
  const season = resolveLeagueSeasonLifecycle(state).activeSeason;
  const teamIds = new Set((state.teams ?? []).map(team => Number(team.id)));
  return (state.schedule ?? [])
    .filter(game => !game.played && isCountableMainRegularSeasonGame(game, season, teamIds))
    .sort((left, right) => left.gid - right.gid);
}

export function getRegularSeasonCompletionFingerprint(state: GameState): string {
  const season = resolveLeagueSeasonLifecycle(state).activeSeason;
  const teamIds = new Set((state.teams ?? []).map(team => Number(team.id)));
  const evidence = (state.schedule ?? [])
    .filter(game => isCountableMainRegularSeasonGame(game, season, teamIds))
    .map(game => [game.gid, game.played, game.homeTid, game.awayTid, game.homeScore, game.awayScore])
    .sort((left, right) => Number(left[0]) - Number(right[0]));
  const text = JSON.stringify(evidence);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function detectPostseasonRegularSeasonConflict(
  state: GameState,
): PostseasonRegularSeasonConflict | null {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  // This recovery decision protects an in-flight postseason graph. Once the
  // champion is final, downstream manual offseason authority (for example
  // Rookie Contracts) must remain the truthful blocker; do not reopen an
  // already completed postseason through the legacy recovery surface.
  if (state.playoffs?.bracketComplete || lifecycle.currentPhase === 'CHAMPION_FINALIZED'
    || lifecycle.currentPhase === 'OFFSEASON_OPEN' || lifecycle.currentPhase === 'OFFSEASON_TASKS_ACTIVE'
    || lifecycle.currentPhase === 'NEXT_SEASON_PREPARED' || lifecycle.currentPhase === 'PRESEASON_ACTIVE') {
    return null;
  }
  const season = Number(state.playoffs?.season ?? lifecycle.activeSeason);
  const playedPostseasonGameIds = (state.schedule ?? [])
    .filter(game => game.played && !game.competitionId && (game.isPlayoff || game.isPlayIn))
    .map(game => game.gid)
    .sort((left, right) => left - right);
  if (playedPostseasonGameIds.length === 0) return null;
  const unresolvedRegularSeasonGameIds = getUnresolvedCountableRegularSeasonGames(state)
    .map(game => game.gid);
  if (unresolvedRegularSeasonGameIds.length === 0) return null;
  return {
    code: 'LEGACY_POSTSEASON_REGULAR_SEASON_CONFLICT',
    season,
    competition: 'main',
    playedPostseasonGameIds,
    unresolvedRegularSeasonGameIds,
    standingsCanStillChange: true,
    recommendedAction: 'continue_postseason',
  };
}

export type LegacyPostseasonRecoveryCommand = {
  action: 'continue_postseason';
  confirmed: boolean;
  confirmedAtDate: string;
};

/**
 * Explicit working-copy recovery. It never replays games, touches standings or
 * regenerates the saved bracket. Ordinary load paths must not invoke it.
 */
export function applyLegacyPostseasonRecovery(
  state: GameState,
  command: LegacyPostseasonRecoveryCommand,
): GameState {
  if (!command.confirmed) throw new Error('confirmation_required');
  const conflict = detectPostseasonRegularSeasonConflict(state);
  if (!conflict) return state;
  const recoveryId = [
    'legacy-postseason-regular-season-conflict-v1',
    conflict.season,
    conflict.playedPostseasonGameIds.join('-'),
    conflict.unresolvedRegularSeasonGameIds.join('-'),
  ].join(':');
  if ((state.lifecycleRecoveryAudit ?? []).some(event => event.id === recoveryId)) return state;

  const voidedIds = new Set(conflict.unresolvedRegularSeasonGameIds);
  const schedule = state.schedule.map(game => !voidedIds.has(game.gid) ? game : {
    ...game,
    excludeFromRecord: true,
    legacyRecovery: {
      disposition: 'void' as const,
      recoveryId,
      reason: conflict.code,
      confirmedAtDate: command.confirmedAtDate,
    },
  });
  return {
    ...state,
    schedule,
    lifecycleIntegrity: {
      ...conflict,
      status: 'recovered',
      recoveryId,
    },
    lifecycleRecoveryAudit: [
      ...(state.lifecycleRecoveryAudit ?? []),
      {
        id: recoveryId,
        version: 1,
        code: conflict.code,
        action: command.action,
        season: conflict.season,
        competition: conflict.competition,
        confirmedAtDate: command.confirmedAtDate,
        preservedPostseasonGameIds: conflict.playedPostseasonGameIds,
        voidedRegularSeasonGameIds: conflict.unresolvedRegularSeasonGameIds,
      },
    ],
  };
}
