import { NBATeam, Game, PlayoffBracket, PlayInGame, PlayoffSeries } from '../../types';

export class PlayoffGenerator {

  // Called once when regular season ends. Seeds teams, builds play-in games.
  static generateBracket(
    teams: NBATeam[],
    season: number,
    numGamesPerRound: number[] = [7, 7, 7, 7]
  ): PlayoffBracket {
    const east = [...teams]
      .filter(t => t.conference === 'East')
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    const west = [...teams]
      .filter(t => t.conference === 'West')
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);

    const eastTop6 = east.slice(0, 6).map(t => t.id);
    const westTop6 = west.slice(0, 6).map(t => t.id);

    const playInGames: PlayInGame[] = [];
    for (const conf of ['East', 'West'] as const) {
      const seeds = conf === 'East' ? east : west;
      const prefix = conf[0];
      // Need at least 10 teams; fall back gracefully
      const s7 = seeds[6]?.id ?? -1;
      const s8 = seeds[7]?.id ?? -1;
      const s9 = seeds[8]?.id ?? -1;
      const s10 = seeds[9]?.id ?? -1;

      playInGames.push(
        { id: `${prefix}7v8`, conference: conf, gameType: '7v8', team1Tid: s7, team2Tid: s8, played: false },
        { id: `${prefix}9v10`, conference: conf, gameType: '9v10', team1Tid: s9, team2Tid: s10, played: false },
        { id: `${prefix}loser`, conference: conf, gameType: 'loserGame', team1Tid: -1, team2Tid: -1, played: false }
      );
    }

    return {
      season,
      eastTop6,
      westTop6,
      playInGames,
      playInComplete: false,
      series: [],
      currentRound: 1,
      gamesInjected: false,
      round1Injected: false,
      bracketComplete: false,
    };
  }

  // After play-in completes, build Round 1 series with final seeds 1-8 per conference.
  // seedTids: array of 8 tids in seed order [1st, 2nd, ..., 8th]
  static buildRound1(
    east8Seeds: number[],
    west8Seeds: number[],
    numGames: number
  ): PlayoffSeries[] {
    const series: PlayoffSeries[] = [];
    // Matchups: 1v8, 4v5, 3v6, 2v7 (indices 0-based)
    const matchups: [number, number][] = [[0, 7], [3, 4], [2, 5], [1, 6]];

    for (const conf of ['East', 'West'] as const) {
      const seeds = conf === 'East' ? east8Seeds : west8Seeds;
      matchups.forEach(([hi, lo], i) => {
        series.push({
          id: `${conf[0]}R1S${i + 1}`,
          round: 1,
          conference: conf,
          higherSeedTid: seeds[hi],
          lowerSeedTid: seeds[lo],
          higherSeedWins: 0,
          lowerSeedWins: 0,
          gamesNeeded: numGames,
          gameIds: [],
          status: 'active',
          higherSeed: hi + 1,
          lowerSeed: lo + 1,
        });
      });
    }
    return series;
  }

  // Build series for round 2+ from winners of previous round.
  static buildNextRound(
    prevSeries: PlayoffSeries[],
    round: 2 | 3 | 4,
    numGames: number
  ): PlayoffSeries[] {
    const eastWinners = prevSeries
      .filter(s => s.conference === 'East' && s.winnerId)
      .map(s => s.winnerId!);
    const westWinners = prevSeries
      .filter(s => s.conference === 'West' && s.winnerId)
      .map(s => s.winnerId!);

    const series: PlayoffSeries[] = [];

    if (round === 4) {
      // Finals: east champion vs west champion
      // Home court to the conference with better combined record (simplified: east goes first)
      const eastChamp = eastWinners[0];
      const westChamp = westWinners[0];
      if (eastChamp != null && westChamp != null) {
        series.push({
          id: 'Finals',
          round: 4,
          conference: 'Finals',
          higherSeedTid: eastChamp,
          lowerSeedTid: westChamp,
          higherSeedWins: 0,
          lowerSeedWins: 0,
          gamesNeeded: numGames,
          gameIds: [],
          status: 'active',
          higherSeed: 1,
          lowerSeed: 1,
        });
      }
    } else {
      // Helper: find a team's original seed from prevSeries
      const getWinnerSeed = (tid: number, confSeries: PlayoffSeries[]): number => {
        const s = confSeries.find(ps => ps.winnerId === tid);
        if (!s) return 99;
        return s.winnerId === s.higherSeedTid ? s.higherSeed : s.lowerSeed;
      };

      // Pair winners 1-2, 3-4 within each conference, carrying forward original seeds
      for (const conf of ['East', 'West'] as const) {
        const winners = conf === 'East' ? eastWinners : westWinners;
        const confPrevSeries = prevSeries.filter(s => s.conference === conf);
        for (let i = 0; i < winners.length; i += 2) {
          const w1 = winners[i];
          const w2 = winners[i + 1];
          if (w1 != null && w2 != null) {
            const seed1 = getWinnerSeed(w1, confPrevSeries);
            const seed2 = getWinnerSeed(w2, confPrevSeries);
            // Lower seed number = higher seed (1 beats 8)
            const [higherTid, lowerTid, hSeed, lSeed] = seed1 <= seed2
              ? [w1, w2, seed1, seed2]
              : [w2, w1, seed2, seed1];
            series.push({
              id: `${conf[0]}R${round}S${Math.floor(i / 2) + 1}`,
              round: round as any,
              conference: conf as any,
              higherSeedTid: higherTid,
              lowerSeedTid: lowerTid,
              higherSeedWins: 0,
              lowerSeedWins: 0,
              gamesNeeded: numGames,
              gameIds: [],
              status: 'active',
              higherSeed: hSeed,
              lowerSeed: lSeed,
            });
          }
        }
      }
    }
    return series;
  }

  // Inject all games for a set of series into the schedule (2-2-1-1-1 home/away format).
  // Games spaced 2 days apart. Returns new games to append to schedule.
  static injectSeriesGames(
    series: PlayoffSeries[],
    startDate: Date,
    existingMaxGid: number
  ): Game[] {
    const newGames: Game[] = [];
    let gid = existingMaxGid + 1;

    // Stagger series start dates so multiple series don't all start on same day
    let seriesOffset = 0;
    for (const s of series) {
      const maxGames = s.gamesNeeded;
      // 2-2-1-1-1 home/away: higher seed home for games 1,2,5,7; lower for 3,4,6
      const homePattern = [
        s.higherSeedTid, s.higherSeedTid,
        s.lowerSeedTid, s.lowerSeedTid,
        s.higherSeedTid, s.lowerSeedTid, s.higherSeedTid
      ];
      const awayPattern = [
        s.lowerSeedTid, s.lowerSeedTid,
        s.higherSeedTid, s.higherSeedTid,
        s.lowerSeedTid, s.higherSeedTid, s.lowerSeedTid
      ];

      const seriesStart = new Date(startDate);
      // Slight stagger: alternate series start 1 day apart to spread the schedule
      seriesStart.setDate(seriesStart.getDate() + (seriesOffset % 2));
      seriesOffset++;

      let gameDate = new Date(seriesStart);
      const seriesGameIds: number[] = [];

      for (let g = 0; g < maxGames; g++) {
        newGames.push({
          gid,
          homeTid: homePattern[g],
          awayTid: awayPattern[g],
          homeScore: 0,
          awayScore: 0,
          played: false,
          date: gameDate.toISOString(),
          isPlayoff: true,
          isPlayIn: false,
          playoffSeriesId: s.id,
          playoffGameNumber: g + 1,
        } as Game);
        seriesGameIds.push(gid);
        gid++;
        // 2 days between games, 3 days extra rest after games 2 and 4
        const gap = (g === 1 || g === 3) ? 3 : 2;
        gameDate = new Date(gameDate);
        gameDate.setDate(gameDate.getDate() + gap);
      }
      s.gameIds = seriesGameIds;
    }
    return newGames;
  }

  // Inject play-in games into the schedule.
  // Day 0: E7v8, Day 1: W7v8, Day 2: E9v10 + W9v10, Day 3: Eloser, Day 4: Wloser
  static injectPlayInGames(
    playInGames: PlayInGame[],
    playInStart: Date,
    existingMaxGid: number
  ): Game[] {
    const newGames: Game[] = [];
    let gid = existingMaxGid + 1;

    const schedule: [string, number][] = [
      ['E7v8', 0],
      ['W7v8', 1],
      ['E9v10', 2],
      ['W9v10', 2],
      ['Eloser', 3],
      ['Wloser', 4],
    ];

    for (const [id, dayOffset] of schedule) {
      const pig = playInGames.find(p => p.id === id);
      if (!pig || pig.team1Tid === -1 || pig.team2Tid === -1) continue;

      const gameDate = new Date(playInStart);
      gameDate.setDate(gameDate.getDate() + dayOffset);

      newGames.push({
        gid,
        homeTid: pig.team1Tid,
        awayTid: pig.team2Tid,
        homeScore: 0,
        awayScore: 0,
        played: false,
        date: gameDate.toISOString(),
        isPlayIn: true,
        isPlayoff: false,
        playoffSeriesId: id,
      } as Game);
      pig.gameId = gid;
      gid++;
    }
    return newGames;
  }
}
