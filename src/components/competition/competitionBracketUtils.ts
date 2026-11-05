import type { CompetitionKnockoutMatch } from '../../services/competition/competitionResolver';
import type { CompetitionSpec } from '../../services/competition/types';
import { competitionSeasonForBox } from '../../services/pba/competitionGames';
import type { Game, GameResult } from '../../types';
import { findBoxScoreForGame } from '../../utils/boxScoreLookup';
import { normalizeDate } from '../../utils/helpers';
import { matchesBoxScoreSeason } from '../../services/competition/competitionSeasonState';
import { getWinningTeamId } from '../../utils/gameOutcome';

export const ROUND_NUMBER: Record<CompetitionKnockoutMatch['round'], 1 | 2 | 3 | 4> = {
  'play-in': 1,
  quarterfinal: 2,
  semifinal: 3,
  final: 4,
};

export const PHASE_FOR_ROUND: Record<CompetitionKnockoutMatch['round'], 'play-in' | 'qf' | 'sf' | 'final'> = {
  'play-in': 'play-in',
  quarterfinal: 'qf',
  semifinal: 'sf',
  final: 'final',
};

export const matchesCompetitionSeason = (game: GameResult, spec: CompetitionSpec, season: number): boolean => {
  if (spec.id.startsWith('pba-')) {
    return competitionSeasonForBox(spec as any, game) === season;
  }
  return matchesBoxScoreSeason(game, season);
};

export const maxDateString = (dates: Array<string | null | undefined>): string | null =>
  dates
    .filter((date): date is string => !!date)
    .map(normalizeDate)
    .sort()
    .at(-1) ?? null;

export const countCompetitionSeriesWins = (
  match: CompetitionKnockoutMatch,
  spec: CompetitionSpec,
  competitionId: string,
  phase: 'play-in' | 'qf' | 'sf' | 'final',
  boxScores: GameResult[],
  season: number,
  seriesGames: Game[],
): { high: number; low: number; complete: boolean; winnerTid?: number } => {
  let high = 0;
  let low = 0;
  const maxGames = match.maxGames ?? match.bestOf;
  const addWinner = (winner: number) => {
    if (winner === match.highSeedTid) high++;
    else if (winner === match.lowSeedTid) low++;
  };
  const currentWinner = () => {
    const highNeeded = match.higherSeedWinsNeeded ?? Math.ceil(match.bestOf / 2);
    const lowNeeded = match.lowerSeedWinsNeeded ?? Math.ceil(match.bestOf / 2);
    return low >= lowNeeded
      ? match.lowSeedTid
      : high >= highNeeded
        ? match.highSeedTid
        : undefined;
  };

  let countedGames = 0;
  for (const scheduledGame of seriesGames) {
    const game = findBoxScoreForGame(boxScores, scheduledGame.gid, scheduledGame.date, {
      homeTid: scheduledGame.homeTid,
      awayTid: scheduledGame.awayTid,
    });
    if (!game) continue;
    if (game.competitionId !== competitionId || game.competitionPhase !== phase) continue;
    if (!matchesCompetitionSeason(game, spec, season)) continue;
    addWinner(Number(getWinningTeamId(game)));
    countedGames++;
    if (countedGames >= maxGames || currentWinner() != null) break;
  }

  if (countedGames === 0) {
    const fallbackGames = boxScores
      .filter(game =>
        game.competitionId === competitionId &&
        game.competitionPhase === phase &&
        matchesCompetitionSeason(game, spec, season) &&
        ((game.homeTeamId === match.highSeedTid && game.awayTeamId === match.lowSeedTid) ||
          (game.homeTeamId === match.lowSeedTid && game.awayTeamId === match.highSeedTid)),
      )
      .sort((left: any, right: any) =>
        normalizeDate(left.date ?? '').localeCompare(normalizeDate(right.date ?? '')) ||
        Number(left.gameId ?? left.gid ?? 0) - Number(right.gameId ?? right.gid ?? 0),
      );
    for (const game of fallbackGames.slice(0, maxGames)) {
      addWinner(Number(getWinningTeamId(game)));
      if (currentWinner() != null) break;
    }
  }

  const winnerTid = currentWinner();
  return { high, low, complete: winnerTid != null, winnerTid };
};
