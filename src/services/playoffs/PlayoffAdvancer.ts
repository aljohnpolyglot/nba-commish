import { PlayoffBracket, GameResult, Game, PlayInGame, PlayoffSeries } from '../../types';
import { PlayoffGenerator } from './PlayoffGenerator';

export class PlayoffAdvancer {

  // Call after each batch of sim results. Returns updated bracket + new games to inject.
  static advance(
    bracket: PlayoffBracket,
    results: GameResult[],
    schedule: Game[],
    numGamesPerRound: number[]
  ): { bracket: PlayoffBracket; newGames: Game[] } {
    // Deep clone to avoid mutation
    let b: PlayoffBracket = {
      ...bracket,
      series: bracket.series.map(s => ({ ...s })),
      playInGames: bracket.playInGames.map(p => ({ ...p })),
    };

    const newGames: Game[] = [];
    const allGames = [...schedule, ...newGames];
    const maxGid = Math.max(0, ...allGames.map(g => g.gid));

    // Process all results for this batch
    for (const result of results) {
      const game = schedule.find(g => g.gid === result.gameId);
      if (!game) continue;

      if (game.isPlayIn && game.playoffSeriesId) {
        const pig = b.playInGames.find(p => p.id === game.playoffSeriesId);
        if (pig && !pig.played) {
          pig.winnerId = result.winnerId;
          pig.played = true;
          this.resolvePlayInLoserGame(b, pig);
        }
      }

      if (game.isPlayoff && game.playoffSeriesId) {
        const series = b.series.find(s => s.id === game.playoffSeriesId);
        if (series && series.status === 'active') {
          if (result.winnerId === series.higherSeedTid) {
            series.higherSeedWins++;
          } else {
            series.lowerSeedWins++;
          }

          const winsNeeded = Math.ceil(series.gamesNeeded / 2);
          if (series.higherSeedWins >= winsNeeded || series.lowerSeedWins >= winsNeeded) {
            series.winnerId = series.higherSeedWins >= winsNeeded
              ? series.higherSeedTid
              : series.lowerSeedTid;
            series.status = 'complete';
          }
        }
      }
    }

    // Check if all play-in games (that have valid teams) are done → mark complete
    if (!b.playInComplete) {
      const activePIGames = b.playInGames.filter(
        p => p.team1Tid !== -1 && p.team2Tid !== -1
      );
      const allDone = activePIGames.length > 0 && activePIGames.every(p => p.played);
      if (allDone) {
        b.playInComplete = true;
      }
    }

    // Inject Round 1 once play-in is complete
    if (b.playInComplete && !b.round1Injected) {
      const east8 = this.getFinal8Seeds(b, 'East');
      const west8 = this.getFinal8Seeds(b, 'West');
      if (east8.length === 8 && west8.length === 8) {
        const r1Series = PlayoffGenerator.buildRound1(east8, west8, numGamesPerRound[0] ?? 7);
        b.series = [...b.series, ...r1Series];
        const startDate = new Date(`${b.season}-04-22T00:00:00Z`);
        const curMaxGid = Math.max(maxGid, ...newGames.map(g => g.gid), 0);
        const injected = PlayoffGenerator.injectSeriesGames(r1Series, startDate, curMaxGid);
        newGames.push(...injected);
        b.round1Injected = true;
        b.currentRound = 1;
      }
    }

    // Advance rounds: when all series in round N complete, inject round N+1
    for (const round of [1, 2, 3] as const) {
      const roundSeries = b.series.filter(s => s.round === round);
      if (roundSeries.length === 0) continue;
      if (!roundSeries.every(s => s.status === 'complete')) continue;

      const nextRound = (round + 1) as 2 | 3 | 4;
      const alreadyBuilt = b.series.some(s => s.round === nextRound);
      if (alreadyBuilt) continue;

      const nextSeries = PlayoffGenerator.buildNextRound(roundSeries, nextRound, numGamesPerRound[nextRound - 1] ?? 7);
      b.series = [...b.series, ...nextSeries];

      // Start next round ~3 days after the last game of current round
      const lastDate = this.getLastGameDate(schedule, newGames, roundSeries, b.season);
      const nextStart = new Date(lastDate);
      nextStart.setDate(nextStart.getDate() + 3);

      const curMaxGid2 = Math.max(maxGid, ...newGames.map(g => g.gid), 0);
      const injected = PlayoffGenerator.injectSeriesGames(nextSeries, nextStart, curMaxGid2);
      newGames.push(...injected);
      b.currentRound = nextRound;
    }

    // Crown champion when Finals complete
    const finals = b.series.find(s => s.round === 4);
    if (finals?.status === 'complete' && !b.champion) {
      b.champion = finals.winnerId;
      b.bracketComplete = true;
    }

    return { bracket: b, newGames };
  }

  // After a play-in game resolves, wire up the loser game slots progressively.
  // team1 (loser of 7v8) is set as soon as 7v8 is done; team2 (winner of 9v10) once 9v10 is done.
  private static resolvePlayInLoserGame(bracket: PlayoffBracket, resolvedGame: PlayInGame): void {
    if (resolvedGame.gameType !== '7v8' && resolvedGame.gameType !== '9v10') return;

    const conf = resolvedGame.conference;
    const prefix = conf[0];
    const loserGame = bracket.playInGames.find(p => p.id === `${prefix}loser`);
    if (!loserGame) return;

    const game7v8 = bracket.playInGames.find(p => p.id === `${prefix}7v8`);
    const game9v10 = bracket.playInGames.find(p => p.id === `${prefix}9v10`);

    // Set team1 (loser of 7v8) as soon as 7v8 resolves
    if (game7v8?.played && game7v8.winnerId != null) {
      const loserOf7v8 = game7v8.team1Tid === game7v8.winnerId
        ? game7v8.team2Tid
        : game7v8.team1Tid;
      loserGame.team1Tid = loserOf7v8;
    }

    // Set team2 (winner of 9v10) as soon as 9v10 resolves
    if (game9v10?.played && game9v10.winnerId != null) {
      loserGame.team2Tid = game9v10.winnerId;
    }
  }

  // Get the final 8 seeds for a conference post play-in.
  // Seeds 1-6 come from bracket.eastTop6 / bracket.westTop6.
  // Seed 7 = winner of 7v8 game.
  // Seed 8 = winner of loser game (loser of 7v8 vs winner of 9v10).
  static getFinal8Seeds(bracket: PlayoffBracket, conf: 'East' | 'West'): number[] {
    const top6 = conf === 'East' ? bracket.eastTop6 : bracket.westTop6;
    const prefix = conf[0];

    const game7v8 = bracket.playInGames.find(p => p.id === `${prefix}7v8`);
    const loserGame = bracket.playInGames.find(p => p.id === `${prefix}loser`);

    const seed7 = game7v8?.winnerId;
    const seed8 = loserGame?.winnerId;

    if (seed7 == null || seed8 == null || top6.length < 6) return [];
    return [...top6, seed7, seed8];
  }

  private static getLastGameDate(schedule: Game[], newGames: Game[], series: PlayoffSeries[], seasonYear?: number): Date {
    const allGameIds = new Set(series.flatMap(s => s.gameIds));
    const allGames = [...schedule, ...newGames].filter(g => allGameIds.has(g.gid));
    if (allGames.length === 0) return new Date(`${seasonYear ?? 2026}-04-18T00:00:00Z`);
    const dates = allGames.map(g => new Date(g.date).getTime());
    return new Date(Math.max(...dates));
  }
}

