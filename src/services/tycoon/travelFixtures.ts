import type { GameState } from '../../types';
import { matchesScheduleSeason } from '../competition/competitionSeasonState';

export type TravelFixtureStatus = 'pending' | 'provisional' | 'ready';

export interface EuroTravelFixtureCounts {
  domesticAwayGames: number;
  internationalAwayGames: number;
  totalAwayGames: number;
  status: TravelFixtureStatus;
}

const gameTeamId = (game: any, side: 'home' | 'away') => Number(
  side === 'home' ? game.homeTid ?? game.homeTeamId : game.awayTid ?? game.awayTeamId,
);

export function getEuroTravelFixtureCounts(state: GameState, userTeamId: number): EuroTravelFixtureCounts {
  const season = state.leagueStats.year;
  const primaryId = state.euroPrimaryCompetitionId;
  const active = state.activeCompetitions ?? [];
  const seasonGames = (state.schedule ?? []).filter(game => matchesScheduleSeason(game, season));
  const relevantCompetitionIds = new Set<string>();

  for (const competition of active) {
    const explicit = state.euroCompetitionTeamTids?.[competition.id] ?? [];
    const scheduled = seasonGames.some(game => (
      game.competitionId === competition.id
      && (gameTeamId(game, 'home') === userTeamId || gameTeamId(game, 'away') === userTeamId)
    ));
    if (competition.id === primaryId || explicit.includes(userTeamId) || scheduled) {
      relevantCompetitionIds.add(competition.id);
    }
  }
  if (primaryId) relevantCompetitionIds.add(primaryId);

  const userGames = seasonGames.filter(game => {
    const competitionId = game.competitionId ?? primaryId;
    return !!competitionId
      && relevantCompetitionIds.has(competitionId)
      && (gameTeamId(game, 'home') === userTeamId || gameTeamId(game, 'away') === userTeamId);
  });
  const uniqueGames = [...new Map(userGames.map(game => {
    const competitionId = game.competitionId ?? primaryId ?? 'domestic';
    const key = game.gid != null
      ? `${competitionId}:${game.gid}`
      : `${competitionId}:${game.date}:${gameTeamId(game, 'home')}:${gameTeamId(game, 'away')}`;
    return [key, game];
  })).values()];

  const domesticCompetitionIds = new Set(active
    .filter(competition => competition.id === primaryId || competition.domesticParentId === primaryId)
    .map(competition => competition.id));
  if (primaryId) domesticCompetitionIds.add(primaryId);
  const awayGames = uniqueGames.filter(game => gameTeamId(game, 'away') === userTeamId);
  const domesticAwayGames = awayGames.filter(game => (
    domesticCompetitionIds.has(game.competitionId ?? primaryId ?? '')
  )).length;
  const internationalAwayGames = awayGames.length - domesticAwayGames;
  const competitionsWithFixtures = new Set(uniqueGames.map(game => game.competitionId ?? primaryId).filter(Boolean));
  const missingDraw = [...relevantCompetitionIds].some(id => !competitionsWithFixtures.has(id));
  const status: TravelFixtureStatus = uniqueGames.length === 0 ? 'pending' : missingDraw ? 'provisional' : 'ready';

  return {
    domesticAwayGames,
    internationalAwayGames,
    totalAwayGames: awayGames.length,
    status,
  };
}
