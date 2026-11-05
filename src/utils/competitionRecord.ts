import type { GameResult } from '../types';
import { matchesBoxScoreSeason } from '../services/competition/competitionSeasonState';

export interface TeamCompetitionRecord {
  wins: number;
  losses: number;
}

function isRegularCompetitionPhase(phase?: string): boolean {
  return !phase || phase === 'regular' || phase === 'regular-season' || phase === 'group' || phase.startsWith('r');
}

export function getTeamCompetitionRecord(
  boxScores: GameResult[],
  teamId: number,
  season: number,
  competitionId: string,
): TeamCompetitionRecord {
  let wins = 0;
  let losses = 0;

  for (const result of boxScores) {
    if (result.competitionId !== competitionId) continue;
    if (!matchesBoxScoreSeason(result, season)) continue;
    if (!isRegularCompetitionPhase(result.competitionPhase)) continue;
    if (result.isPreseason || result.isPlayoff || result.isPlayIn || result.excludeFromRecord) continue;
    if (result.homeTeamId !== teamId && result.awayTeamId !== teamId) continue;

    if (result.winnerId === teamId) wins += 1;
    else losses += 1;
  }

  return { wins, losses };
}
