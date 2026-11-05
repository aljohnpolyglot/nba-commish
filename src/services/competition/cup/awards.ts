import type { Game, GameResult, NBAPlayer } from '../../../types';
import type { CupAwardWinner, CupCompetitionState } from './types';

interface CupPlayerPerformance {
  playerId: string;
  teamTid: number;
  score: number;
  games: number;
  knockoutGames: number;
}

function scopedGameIds(cup: CupCompetitionState, schedule: Game[]): Map<number, boolean> {
  return new Map(schedule
    .filter(game => game.isCupGame
      && game.cupLeagueId === cup.leagueId
      && game.cupCompetitionId === cup.competitionId)
    .map(game => [game.gid, game.cupRoundId !== 'group']));
}

function rankCupPerformers(
  cup: CupCompetitionState,
  schedule: Game[],
  boxScores: GameResult[],
): CupPlayerPerformance[] {
  const gameIds = scopedGameIds(cup, schedule);
  const totals = new Map<string, CupPlayerPerformance>();
  for (const result of boxScores) {
    const knockout = gameIds.get(result.gameId);
    if (knockout == null) continue;
    const sides = [
      { tid: result.homeTeamId, stats: result.homeStats ?? [] },
      { tid: result.awayTeamId, stats: result.awayStats ?? [] },
    ];
    for (const side of sides) {
      for (const row of side.stats) {
        const playerId = String(row.playerId ?? '').trim();
        if (!playerId) continue;
        const current = totals.get(playerId) ?? {
          playerId,
          teamTid: side.tid,
          score: 0,
          games: 0,
          knockoutGames: 0,
        };
        const gameScore = Number.isFinite(Number(row.gameScore))
          ? Number(row.gameScore)
          : Number(row.pts ?? 0) + Number(row.reb ?? 0) * 0.7 + Number(row.ast ?? 0) * 0.7;
        current.score += gameScore * (knockout ? 1.5 : 1);
        current.games += 1;
        current.knockoutGames += knockout ? 1 : 0;
        current.teamTid = side.tid;
        totals.set(playerId, current);
      }
    }
  }
  return [...totals.values()]
    .filter(row => row.knockoutGames > 0)
    .sort((left, right) => {
      const leftAverage = left.games > 0 ? left.score / left.games : 0;
      const rightAverage = right.games > 0 ? right.score / right.games : 0;
      return rightAverage - leftAverage || right.knockoutGames - left.knockoutGames || left.playerId.localeCompare(right.playerId);
    });
}

export function computeGenericCupAwards(
  cup: CupCompetitionState,
  schedule: Game[],
  boxScores: GameResult[],
): CupAwardWinner[] {
  const performers = rankCupPerformers(cup, schedule, boxScores);
  if (performers.length === 0) return cup.awards;
  const championTid = cup.history.at(-1)?.season === cup.season
    ? cup.history.at(-1)?.championTid
    : null;
  const winners: CupAwardWinner[] = [];
  for (const award of cup.format.awards) {
    const pool = award.kind === 'tournamentMvp'
      ? performers.filter(row => row.teamTid === championTid)
      : performers;
    const selected = (pool.length > 0 ? pool : performers).slice(0, award.selectionCount);
    winners.push(...selected.map(row => ({
      awardId: award.id,
      playerId: row.playerId,
      teamTid: row.teamTid,
    })));
  }
  return winners;
}

export function applyGenericCupAwardsToPlayers(
  cup: CupCompetitionState,
  players: NBAPlayer[],
): NBAPlayer[] {
  if (cup.status !== 'complete') return players;
  const latestHistory = cup.history.at(-1);
  const championTid = latestHistory?.season === cup.season ? latestHistory.championTid : null;
  const mvpIds = new Set(cup.awards
    .filter(winner => cup.format.awards.find(award => award.id === winner.awardId)?.kind === 'tournamentMvp')
    .map(winner => winner.playerId));
  const allTeamIds = new Set(cup.awards
    .filter(winner => cup.format.awards.find(award => award.id === winner.awardId)?.kind === 'allLeague')
    .map(winner => winner.playerId));
  const labels = {
    champion: `${cup.format.displayName} Champion`,
    mvp: `${cup.format.displayName} MVP`,
    allTeam: `${cup.format.displayName} All-Tournament Team`,
  };
  return players.map(player => {
    const current = player.awards ?? [];
    const additions: NonNullable<NBAPlayer['awards']> = [];
    const has = (type: string) => current.some(award => award.season === cup.season && award.type === type);
    if (player.tid === championTid && !has(labels.champion)) {
      additions.push({ season: cup.season, type: labels.champion, competitionId: cup.competitionId });
    }
    if (mvpIds.has(String(player.internalId)) && !has(labels.mvp)) {
      additions.push({ season: cup.season, type: labels.mvp, competitionId: cup.competitionId });
    }
    if (allTeamIds.has(String(player.internalId)) && !has(labels.allTeam)) {
      additions.push({ season: cup.season, type: labels.allTeam, competitionId: cup.competitionId });
    }
    return additions.length > 0 ? { ...player, awards: [...current, ...additions] } : player;
  });
}
