import type { Game, PlayoffSeries } from '../../../types';
import { getWinningTeamId } from '../../../utils/gameOutcome';

export interface PlayoffSeriesSnapshot {
  higherSeedWins: number;
  lowerSeedWins: number;
}

export function getPlayoffSeriesSnapshot(
  game: Game,
  series: PlayoffSeries,
  schedule: readonly Game[],
): PlayoffSeriesSnapshot {
  const gameIdOrder = new Map(series.gameIds.map((gid, index) => [gid, index]));
  const gamesById = new Map(
    schedule
      .filter(candidate => candidate.playoffSeriesId === series.id)
      .map(candidate => [candidate.gid, candidate] as const),
  );
  gamesById.set(game.gid, game);

  const orderedGames = [...gamesById.values()].sort((a, b) => {
    const gameNumberDiff = Number(a.playoffGameNumber ?? gameIdOrder.get(a.gid) ?? Number.MAX_SAFE_INTEGER)
      - Number(b.playoffGameNumber ?? gameIdOrder.get(b.gid) ?? Number.MAX_SAFE_INTEGER);
    return gameNumberDiff || a.date.localeCompare(b.date) || a.gid - b.gid;
  });
  const targetIndex = orderedGames.findIndex(candidate => candidate.gid === game.gid);
  const gamesThroughTarget = targetIndex >= 0 ? orderedGames.slice(0, targetIndex + 1) : [game];

  return gamesThroughTarget.reduce<PlayoffSeriesSnapshot>((wins, candidate) => {
    if (!candidate.played) return wins;
    const winnerId = Number(getWinningTeamId(candidate));
    if (winnerId === Number(series.higherSeedTid)) wins.higherSeedWins += 1;
    if (winnerId === Number(series.lowerSeedTid)) wins.lowerSeedWins += 1;
    return wins;
  }, { higherSeedWins: 0, lowerSeedWins: 0 });
}

export function formatPlayoffSeriesSnapshot(
  gameNumber: number,
  snapshot: PlayoffSeriesSnapshot,
  higherSeedAbbrev: string,
  lowerSeedAbbrev: string,
  gamesNeeded: number,
): string {
  const { higherSeedWins, lowerSeedWins } = snapshot;
  let text = `Game ${gameNumber}`;
  if (higherSeedWins === 0 && lowerSeedWins === 0) return text;
  if (higherSeedWins === lowerSeedWins) return `${text} · Tied ${higherSeedWins}-${lowerSeedWins}`;

  const higherLeads = higherSeedWins > lowerSeedWins;
  const leader = higherLeads ? higherSeedAbbrev : lowerSeedAbbrev;
  const leaderWins = Math.max(higherSeedWins, lowerSeedWins);
  const trailerWins = Math.min(higherSeedWins, lowerSeedWins);
  const winsNeeded = Math.ceil(gamesNeeded / 2);
  text += leaderWins >= winsNeeded
    ? ` · ${leader} wins ${leaderWins}-${trailerWins}`
    : ` · ${leader} leads ${leaderWins}-${trailerWins}`;
  return text;
}
