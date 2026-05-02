import { PlayoffBracket, GameResult, Game, PlayInGame, PlayoffSeries } from '../../types';
import { PlayoffGenerator } from './PlayoffGenerator';
import { getDraftDate } from '../../utils/dateUtils';

// Defines which pair of completed series creates each next-round matchup.
// feeder1 = West/Away side, feeder2 = East/Home side (matters only for Finals home-court).
const MATCHUP_PAIRS: ReadonlyArray<{
  feeder1: string; feeder2: string; targetId: string;
  round: 2 | 3 | 4; conference: 'East' | 'West' | 'Finals';
}> = [
  // First Round → Semis
  { feeder1: 'WR1S1', feeder2: 'WR1S4', targetId: 'WR2S1', round: 2, conference: 'West' },
  { feeder1: 'WR1S2', feeder2: 'WR1S3', targetId: 'WR2S2', round: 2, conference: 'West' },
  { feeder1: 'ER1S1', feeder2: 'ER1S4', targetId: 'ER2S1', round: 2, conference: 'East' },
  { feeder1: 'ER1S2', feeder2: 'ER1S3', targetId: 'ER2S2', round: 2, conference: 'East' },
  // Semis → Conference Finals
  { feeder1: 'WR2S1', feeder2: 'WR2S2', targetId: 'WR3S1', round: 3, conference: 'West' },
  { feeder1: 'ER2S1', feeder2: 'ER2S2', targetId: 'ER3S1', round: 3, conference: 'East' },
  // Conference Finals → NBA Finals (feeder1=WCF, feeder2=ECF — East gets home court)
  { feeder1: 'WR3S1', feeder2: 'ER3S1', targetId: 'Finals', round: 4, conference: 'Finals' },
];

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
      series: bracket.series.map(s => ({ ...s, higherSeedWins: s.higherSeedWins ?? 0, lowerSeedWins: s.lowerSeedWins ?? 0 })),
      playInGames: bracket.playInGames.map(p => ({ ...p })),
    };

    const newGames: Game[] = [];
    const maxGid = Math.max(0, ...schedule.map(g => g.gid));

    // Process all results for this batch
    for (const result of results) {
      const game = schedule.find(g => g.gid === result.gameId);
      if (!game) continue;

      if (game.isPlayIn && game.playoffSeriesId) {
        const pig = b.playInGames.find(p => p.id === game.playoffSeriesId);
        if (pig && !pig.played) {
          pig.winnerId = Number(result.winnerId);
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
      const existingR1 = b.series.filter(s => s.round === 1);
      if ((east8.length === 8 && west8.length === 8) || existingR1.length > 0) {
        const r1Series = existingR1.length > 0
          ? existingR1
          : PlayoffGenerator.buildRound1(east8, west8, numGamesPerRound[0] ?? 7);
        if (existingR1.length === 0) b.series = [...b.series, ...r1Series];
        const startDate = new Date(`${b.season}-04-22T00:00:00Z`);
        const curMaxGid = Math.max(maxGid, ...newGames.map(g => g.gid), 0);
        const injected = PlayoffGenerator.injectSeriesGames(r1Series, startDate, curMaxGid);
        newGames.push(...injected);
        b.round1Injected = true;
        b.currentRound = 1;
      }
    }

    // Per-matchup advancement: as soon as BOTH feeder series complete, create the next-round
    // matchup and schedule its games. This prevents the cascade where all next-round series wait
    // for the slowest G7 — each matchup starts 3 days after its own two feeders finish.
    for (const pair of MATCHUP_PAIRS) {
      // Skip if target series already exists
      if (b.series.some(s => s.id === pair.targetId)) continue;

      const s1 = b.series.find(s => s.id === pair.feeder1);
      const s2 = b.series.find(s => s.id === pair.feeder2);
      if (!s1 || !s2 || s1.status !== 'complete' || s2.status !== 'complete') continue;

      const numGames = numGamesPerRound[pair.round - 1] ?? 7;
      const newSeries = this.buildSingleMatchup(s1, s2, pair.targetId, pair.round, pair.conference, numGames);
      if (!newSeries) continue;

      b.series = [...b.series, newSeries];

      // Start after the LATER of the two feeder series' last games.
      const s1End = this.getLastGameDate(schedule, newGames, [s1], b.season);
      const s2End = this.getLastGameDate(schedule, newGames, [s2], b.season);
      const laterEnd = s1End.getTime() >= s2End.getTime() ? s1End : s2End;
      const nextStart = new Date(laterEnd);
      nextStart.setDate(nextStart.getDate() + (pair.round === 4 ? 1 : 3));

      // Finals cap: Game 7 must land before draft day. If conference finals run
      // late, the Finals compress to daily games instead of drifting past the draft.
      let latestEndDate: Date | undefined;
      if (pair.round === 4) {
        const draftDate = getDraftDate(b.season);
        latestEndDate = new Date(draftDate);
        latestEndDate.setDate(latestEndDate.getDate() - 1);
        const normalFinalsSpanDays = (numGames - 1) * 2;
        const juneMaxStart = new Date(latestEndDate);
        juneMaxStart.setDate(juneMaxStart.getDate() - normalFinalsSpanDays);
        if (nextStart > juneMaxStart && juneMaxStart > laterEnd) {
          nextStart.setTime(juneMaxStart.getTime());
        }
      }

      const curMaxGid = Math.max(maxGid, ...newGames.map(g => g.gid), 0);
      const injected = PlayoffGenerator.injectSeriesGames([newSeries], nextStart, curMaxGid, latestEndDate);
      newGames.push(...injected);
    }

    // Update currentRound to the lowest round that still has active (incomplete) series.
    // This keeps "Sim Round" targeting the earliest unfinished round.
    const activeSeries = b.series.filter(s => s.status !== 'complete');
    if (activeSeries.length > 0) {
      b.currentRound = Math.min(...activeSeries.map(s => s.round)) as any;
    } else if (b.series.length > 0) {
      b.currentRound = Math.max(...b.series.map(s => s.round)) as any;
    }

    // Crown champion when Finals complete
    const finals = b.series.find(s => s.round === 4);
    if (finals?.status === 'complete' && !b.champion) {
      b.champion = finals.winnerId;
      b.bracketComplete = true;
    }

    return { bracket: b, newGames };
  }

  // Build a single next-round series from two completed feeder series.
  // For the Finals (round 4), the East champ (feeder2) always gets home court.
  private static buildSingleMatchup(
    feeder1: PlayoffSeries,
    feeder2: PlayoffSeries,
    targetId: string,
    round: number,
    conference: string,
    numGames: number
  ): PlayoffSeries | null {
    const w1 = feeder1.winnerId;
    const w2 = feeder2.winnerId;
    if (w1 == null || w2 == null) return null;

    const seed1 = w1 === feeder1.higherSeedTid ? feeder1.higherSeed : feeder1.lowerSeed;
    const seed2 = w2 === feeder2.higherSeedTid ? feeder2.higherSeed : feeder2.lowerSeed;

    let higherTid: number;
    let lowerTid: number;
    let hSeed: number;
    let lSeed: number;

    if (round === 4) {
      // Finals: East champ (feeder2 = ECF winner) always has home court
      higherTid = w2;
      lowerTid = w1;
      hSeed = seed2;
      lSeed = seed1;
    } else {
      // Within-conference: lower seed number = higher seeding = home court
      if (seed1 <= seed2) {
        [higherTid, lowerTid, hSeed, lSeed] = [w1, w2, seed1, seed2];
      } else {
        [higherTid, lowerTid, hSeed, lSeed] = [w2, w1, seed2, seed1];
      }
    }

    return {
      id: targetId,
      round: round as any,
      conference: conference as any,
      higherSeedTid: higherTid,
      lowerSeedTid: lowerTid,
      higherSeedWins: 0,
      lowerSeedWins: 0,
      gamesNeeded: numGames,
      gameIds: [],
      status: 'active',
      higherSeed: hSeed,
      lowerSeed: lSeed,
    };
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
    // Use Number() coercion on both sides — JSON deserialization can produce string IDs
    if (game7v8?.played && game7v8.winnerId != null) {
      const loserOf7v8 = Number(game7v8.team1Tid) === Number(game7v8.winnerId)
        ? game7v8.team2Tid
        : game7v8.team1Tid;
      loserGame.team1Tid = Number(loserOf7v8);
    }

    // Set team2 (winner of 9v10) as soon as 9v10 resolves
    if (game9v10?.played && game9v10.winnerId != null) {
      loserGame.team2Tid = Number(game9v10.winnerId);
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
