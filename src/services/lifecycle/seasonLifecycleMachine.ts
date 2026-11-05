import type { GameState, LeagueSeasonLifecycle, SeasonLifecyclePhase } from '../../types';
import { resolveLeagueSeasonLifecycle } from './leagueSeasonLifecycle';

export type LifecycleTransitionCommand = {
  league: string;
  season: number;
  from: SeasonLifecyclePhase;
  to: SeasonLifecyclePhase;
  atDate: string;
  evidence?: {
    standingsFingerprint?: string;
    bracketFingerprint?: string;
    championTeamId?: number;
    runnerUpTeamId?: number;
    finalizedAwardKeys?: string[];
  };
};

export type LifecycleTransitionResult =
  | { status: 'applied' | 'idempotent'; lifecycle: LeagueSeasonLifecycle }
  | { status: 'rejected'; lifecycle: LeagueSeasonLifecycle; reason: string };

const NEXT: Record<SeasonLifecyclePhase, SeasonLifecyclePhase> = {
  REGULAR_SEASON_ACTIVE: 'REGULAR_SEASON_COMPLETE',
  REGULAR_SEASON_COMPLETE: 'PLAYOFFS_MATERIALIZED',
  PLAYOFFS_MATERIALIZED: 'PLAYOFFS_ACTIVE',
  PLAYOFFS_ACTIVE: 'CHAMPION_FINALIZED',
  CHAMPION_FINALIZED: 'OFFSEASON_OPEN',
  OFFSEASON_OPEN: 'OFFSEASON_TASKS_ACTIVE',
  OFFSEASON_TASKS_ACTIVE: 'NEXT_SEASON_PREPARED',
  NEXT_SEASON_PREPARED: 'PRESEASON_ACTIVE',
  PRESEASON_ACTIVE: 'REGULAR_SEASON_ACTIVE',
};

/** Exact-league/exact-season and idempotent transition owner. UI effects may only dispatch commands. */
export function transitionSeasonLifecycle(
  state: GameState,
  command: LifecycleTransitionCommand,
): LifecycleTransitionResult {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  const league = lifecycle.mode;
  if (command.league !== league) return { status: 'rejected', lifecycle, reason: 'league_mismatch' };
  if (command.season !== lifecycle.activeSeason) return { status: 'rejected', lifecycle, reason: 'season_mismatch' };
  if (lifecycle.currentPhase === command.to) return { status: 'idempotent', lifecycle };
  if (lifecycle.currentPhase !== command.from) return { status: 'rejected', lifecycle, reason: 'phase_mismatch' };
  if (NEXT[command.from] !== command.to) return { status: 'rejected', lifecycle, reason: 'invalid_transition' };

  const next: LeagueSeasonLifecycle = {
    ...lifecycle,
    currentPhase: command.to,
    nextValidTransition: NEXT[command.to],
  };
  if (command.to === 'REGULAR_SEASON_COMPLETE') {
    next.regularSeason = {
      ...next.regularSeason,
      status: 'complete',
      standingsFingerprint: command.evidence?.standingsFingerprint,
    };
  }
  if (command.to === 'PLAYOFFS_MATERIALIZED') {
    next.playoffs = {
      ...next.playoffs,
      materialized: true,
      bracketFingerprint: command.evidence?.bracketFingerprint,
      regularSeasonCompletionFingerprint: command.evidence?.standingsFingerprint,
    };
  }
  if (command.to === 'CHAMPION_FINALIZED') {
    next.completedSeason = command.season;
    next.playoffs = {
      ...next.playoffs,
      championTeamId: command.evidence?.championTeamId,
      runnerUpTeamId: command.evidence?.runnerUpTeamId,
      finalizedAtDate: command.atDate,
    };
    next.awards = {
      ...next.awards,
      status: 'pending',
      finalizedAwardKeys: command.evidence?.finalizedAwardKeys ?? next.awards.finalizedAwardKeys,
    };
  }
  if (command.to === 'OFFSEASON_OPEN' || command.to === 'OFFSEASON_TASKS_ACTIVE') {
    next.offseasonCycle = command.season;
    next.offseasonOpen = true;
    next.taskCycle = {
      id: `${league}:${command.season}`,
      season: command.season,
      status: command.to === 'OFFSEASON_TASKS_ACTIVE' ? 'pending' : 'blocked',
    };
  }
  if (command.to === 'PRESEASON_ACTIVE') {
    next.offseasonOpen = false;
    next.offseasonCycle = null;
    next.taskCycle = { ...next.taskCycle, status: 'complete' };
  }
  return { status: 'applied', lifecycle: next };
}
