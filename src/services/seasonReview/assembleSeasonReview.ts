import type { GameState } from '../../types';

export function assembleSeasonReview(state: GameState, season: number) {
  const lifecycle = state.seasonLifecycle;
  const league = lifecycle?.mode ?? state.leagueStats.uiMode ?? state.leagueType;
  const completedSeasonSnapshot = state.completedSeasonSnapshots?.[`${league}:${season}`]
    ?? (state.completedSeasonSnapshot?.season === season ? state.completedSeasonSnapshot : undefined);
  if (!completedSeasonSnapshot) return null;
  return {
    season,
    championTeamId: completedSeasonSnapshot.championTeamId,
    runnerUpTeamId: completedSeasonSnapshot.runnerUpTeamId,
    awards: completedSeasonSnapshot.awards,
    bestRecords: [...completedSeasonSnapshot.standings].sort((a, b) =>
      (b.standingsPoints ?? b.wins) - (a.standingsPoints ?? a.wins)
      || b.pointDifferential - a.pointDifferential,
    ),
    statLeaders: completedSeasonSnapshot.statLeaders,
  };
}
