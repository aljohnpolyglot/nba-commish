import { NBATeam, Game, HeadToHead, PlayoffBracket, PlayInGame, PlayoffSeries } from '../../types';
import { sortByStandings } from '../../utils/standingsUtils';
import { bracketNodesToSeries, buildFixedBracketSide, buildReseededBracketSide } from './bracketGraph';
import { TimeService } from '../time/TimeService';

type PlayoffFormatOptions = {
  totalPlayoffTeams?: number;
  firstRoundByes?: number;
  entryRounds?: number[];
  playInFormat?: 'modern_7_10' | 'bubble_8_9';
  byConference?: boolean;
  tiebreakers?: string[];
  headToHead?: HeadToHead;
  standingsMode?: 'win_pct' | 'points';
  pointsForWin?: number;
  pointsForDraw?: number;
  pointsForLoss?: number;
  playoffReseeding?: boolean;
};

export class PlayoffGenerator {

  // Called once when regular season ends. Seeds teams, builds play-in games.
  static generateBracket(
    teams: NBATeam[],
    season: number,
    numGamesPerRound: number[] = [7, 7, 7, 7],
    playInEnabled = true,
    format: PlayoffFormatOptions = {},
  ): PlayoffBracket {
    const conferenceGroups = [...new Set(teams.map(team => Number(team.cid)).filter(Number.isFinite))]
      .sort((a, b) => a - b)
      .map(cid => teams.filter(team => Number(team.cid) === cid))
      .filter(group => group.length > 0);
    const useConferenceSeeding = format.byConference !== false && conferenceGroups.length === 2;
    if (!useConferenceSeeding) {
      return this.generateLeagueWideBracket(teams, season, numGamesPerRound, format);
    }
    const east = sortByStandings(conferenceGroups[0], format.tiebreakers, format.headToHead, format);
    const west = sortByStandings(conferenceGroups[1], format.tiebreakers, format.headToHead, format);
    const firstRoundByes = Math.max(0, Math.round(format.firstRoundByes ?? 0));
    const totalPlayoffTeams = Math.max(2, Math.round(format.totalPlayoffTeams ?? 16));
    const playInFormat = format.playInFormat ?? 'modern_7_10';
    const useHistoricalFormat = !playInEnabled && (
      totalPlayoffTeams !== 16
      || firstRoundByes > 0
      || numGamesPerRound.length !== 4
    );

    const eastTop6 = east.slice(0, 6).map(t => t.id);
    const westTop6 = west.slice(0, 6).map(t => t.id);
    const eastTop7 = east.slice(0, 7).map(t => t.id);
    const westTop7 = west.slice(0, 7).map(t => t.id);
    const eastTop8 = east.slice(0, 8).map(t => t.id);
    const westTop8 = west.slice(0, 8).map(t => t.id);

    if (!playInEnabled) {
      const [eastCount, westCount] = this.splitPlayoffTeams(east.length, west.length, totalPlayoffTeams);
      const eastSeeds = east.slice(0, useHistoricalFormat ? eastCount : 8).map(t => t.id);
      const westSeeds = west.slice(0, useHistoricalFormat ? westCount : 8).map(t => t.id);
      const historicalSeries = useHistoricalFormat && numGamesPerRound.length === 1 && eastSeeds[0] != null && westSeeds[0] != null
        ? [{
            id: 'Finals',
            round: 1,
            conference: 'Finals' as const,
            higherSeedTid: eastSeeds[0],
            lowerSeedTid: westSeeds[0],
            higherSeedWins: 0,
            lowerSeedWins: 0,
            gamesNeeded: numGamesPerRound[0] ?? 7,
            gameIds: [],
            status: 'active' as const,
            higherSeed: 1,
            lowerSeed: 1,
          }]
        : this.buildHistoricalOpeningRound(eastSeeds, westSeeds, firstRoundByes, numGamesPerRound[0] ?? 7);
      const graph = useHistoricalFormat && numGamesPerRound.length > 1
        ? this.buildConferenceGraph(eastSeeds, westSeeds, numGamesPerRound, format.playoffReseeding === true)
        : null;
      return {
        season,
        eastTop6,
        westTop6,
        eastTop7,
        westTop7,
        eastTop8,
        westTop8,
        playoffFormat: useHistoricalFormat ? 'historical' : 'modern',
        playoffSeeding: 'conference',
        numPlayoffTeams: useHistoricalFormat ? eastSeeds.length + westSeeds.length : 16,
        numPlayoffByes: useHistoricalFormat ? firstRoundByes : 0,
        playInFormat,
        playInGames: [],
        playInComplete: true,
        series: graph
          ? graph.series
          : useHistoricalFormat
          ? historicalSeries
          : this.buildRound1(eastSeeds, westSeeds, numGamesPerRound[0] ?? 7),
        graphVersion: graph ? 1 : undefined,
        bracketPolicy: graph?.policy,
        nodes: graph?.nodes,
        byes: graph?.byes,
        currentRound: 1,
        gamesInjected: true,
        round1Injected: false,
        bracketComplete: false,
      };
    }

    if (playInFormat === 'bubble_8_9') {
      return this.generateBubblePlayInBracket({
        season,
        east,
        west,
        eastTop6,
        westTop6,
        eastTop7,
        westTop7,
        eastTop8,
        westTop8,
      });
    }

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
      eastTop7,
      westTop7,
      eastTop8,
      westTop8,
      playoffFormat: 'modern',
      playoffSeeding: 'conference',
      playInFormat,
      playInGames,
      playInComplete: false,
      series: [],
      currentRound: 1,
      gamesInjected: false,
      round1Injected: false,
      bracketComplete: false,
    };
  }

  private static generateLeagueWideBracket(
    teams: NBATeam[],
    season: number,
    numGamesPerRound: number[],
    format: PlayoffFormatOptions,
  ): PlayoffBracket {
    const sorted = sortByStandings(teams, format.tiebreakers, format.headToHead, format);
    const totalPlayoffTeams = Math.min(
      sorted.length,
      Math.max(2, Math.round(format.totalPlayoffTeams ?? 2 ** numGamesPerRound.length)),
    );
    const firstRoundByes = Math.min(
      Math.max(0, totalPlayoffTeams - 2),
      Math.max(0, Math.round(format.firstRoundByes ?? 0)),
    );
    const leagueSeeds = sorted.slice(0, totalPlayoffTeams).map(team => team.id);
    const playoffEntryRounds = this.resolveEntryRounds(
      leagueSeeds.length,
      numGamesPerRound.length,
      firstRoundByes,
      format.entryRounds,
    );
    const graph = (format.playoffReseeding === true ? buildReseededBracketSide : buildFixedBracketSide)(
      leagueSeeds.map((teamId, index) => ({ teamId, seed: index + 1 })),
      'League',
      numGamesPerRound.length,
    );
    return {
      season,
      eastTop6: [],
      westTop6: [],
      playoffFormat: 'historical',
      playoffSeeding: 'league-wide',
      leagueSeeds,
      numPlayoffTeams: leagueSeeds.length,
      numPlayoffByes: firstRoundByes,
      playoffEntryRounds,
      playInFormat: format.playInFormat ?? 'modern_7_10',
      playInGames: [],
      playInComplete: true,
      graphVersion: 1,
      bracketPolicy: graph.policy,
      nodes: graph.nodes,
      byes: graph.byes,
      series: bracketNodesToSeries(graph.nodes, numGamesPerRound),
      currentRound: 1,
      gamesInjected: true,
      round1Injected: false,
      bracketComplete: false,
    };
  }

  private static generateBubblePlayInBracket(args: {
    season: number;
    east: NBATeam[];
    west: NBATeam[];
    eastTop6: number[];
    westTop6: number[];
    eastTop7: number[];
    westTop7: number[];
    eastTop8: number[];
    westTop8: number[];
  }): PlayoffBracket {
    const playInGames: PlayInGame[] = [];

    for (const conf of ['East', 'West'] as const) {
      const seeds = conf === 'East' ? args.east : args.west;
      const prefix = conf[0];
      const seed8 = seeds[7];
      const seed9 = seeds[8];
      if (!seed8 || !seed9) continue;
      if (!this.isWithinBubblePlayInRange(seed8, seed9)) continue;
      playInGames.push({
        id: `${prefix}8v9`,
        conference: conf,
        gameType: '8v9',
        team1Tid: seed8.id,
        team2Tid: seed9.id,
        played: false,
      }, {
        id: `${prefix}8v9g2`,
        conference: conf,
        gameType: '8v9Game2',
        team1Tid: -1,
        team2Tid: -1,
        played: false,
      });
    }

    if (playInGames.length === 0) {
      return {
        season: args.season,
        eastTop6: args.eastTop6,
        westTop6: args.westTop6,
        eastTop7: args.eastTop7,
        westTop7: args.westTop7,
        eastTop8: args.eastTop8,
        westTop8: args.westTop8,
        playoffFormat: 'modern',
        playInFormat: 'bubble_8_9',
        numPlayoffTeams: 16,
        numPlayoffByes: 0,
        playInGames: [],
        playInComplete: true,
        series: this.buildRound1(args.eastTop8, args.westTop8, 7),
        currentRound: 1,
        gamesInjected: true,
        round1Injected: false,
        bracketComplete: false,
      };
    }

    return {
      season: args.season,
      eastTop6: args.eastTop6,
      westTop6: args.westTop6,
      eastTop7: args.eastTop7,
      westTop7: args.westTop7,
      eastTop8: args.eastTop8,
      westTop8: args.westTop8,
      playoffFormat: 'modern',
      playInFormat: 'bubble_8_9',
      numPlayoffTeams: 16,
      numPlayoffByes: 0,
      playInGames,
      playInComplete: false,
      series: [],
      currentRound: 1,
      gamesInjected: false,
      round1Injected: false,
      bracketComplete: false,
    };
  }

  private static isWithinBubblePlayInRange(seed8: NBATeam, seed9: NBATeam): boolean {
    const gamesBack = ((seed8.wins - seed9.wins) + (seed9.losses - seed8.losses)) / 2;
    return gamesBack <= 4;
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

  static buildHistoricalOpeningRound(
    eastSeeds: number[],
    westSeeds: number[],
    totalFirstRoundByes: number,
    numGames: number
  ): PlayoffSeries[] {
    const [eastByes, westByes] = this.splitPlayoffTeams(eastSeeds.length, westSeeds.length, totalFirstRoundByes);
    return [
      ...this.buildConferenceOpeningRound('East', eastSeeds, eastByes, numGames),
      ...this.buildConferenceOpeningRound('West', westSeeds, westByes, numGames),
    ];
  }

  private static splitPlayoffTeams(eastCount: number, westCount: number, total: number): [number, number] {
    const targetEast = Math.min(eastCount, Math.ceil(total / 2));
    const targetWest = Math.min(westCount, total - targetEast);
    const finalEast = Math.min(eastCount, total - targetWest);
    return [finalEast, targetWest];
  }

  private static buildConferenceOpeningRound(
    conf: 'East' | 'West' | 'League',
    seeds: number[],
    byes: number,
    numGames: number
  ): PlayoffSeries[] {
    if (seeds.length < 2) return [];
    const byeCount = Math.min(Math.max(0, byes), Math.max(0, seeds.length - 2));
    const series: PlayoffSeries[] = [];
    const entrants = seeds.slice(byeCount).map((tid, index) => ({ tid, seed: byeCount + index + 1 }));
    for (let index = 0; index < Math.floor(entrants.length / 2); index++) {
      const high = entrants[index];
      const low = entrants[entrants.length - 1 - index];
      series.push({
        id: `${conf[0]}R1S${index + 1}`,
        round: 1,
        conference: conf,
        higherSeedTid: high.tid,
        lowerSeedTid: low.tid,
        higherSeedWins: 0,
        lowerSeedWins: 0,
        gamesNeeded: numGames,
        gameIds: [],
        status: 'active',
        higherSeed: high.seed,
        lowerSeed: low.seed,
      });
    }

    return series;
  }

  static buildConferenceGraph(
    eastSeeds: number[],
    westSeeds: number[],
    numGamesPerRound: number[],
    reseeded: boolean,
  ) {
    const conferenceRounds = Math.max(
      1,
      numGamesPerRound.length - 1,
      Math.ceil(Math.log2(Math.max(2, eastSeeds.length, westSeeds.length))),
    );
    const sideBuilder = reseeded ? buildReseededBracketSide : buildFixedBracketSide;
    const east = sideBuilder(
      eastSeeds.map((teamId, index) => ({ teamId, seed: index + 1 })),
      'East',
      conferenceRounds,
    );
    const west = sideBuilder(
      westSeeds.map((teamId, index) => ({ teamId, seed: index + 1 })),
      'West',
      conferenceRounds,
    );
    const sideSource = (teamIds: number[], nodes: typeof east.nodes) => {
      const last = [...nodes].sort((a, b) => b.roundIndex - a.roundIndex || a.slotIndex - b.slotIndex)[0];
      return last
        ? { kind: 'winnerOf' as const, seriesId: last.id }
        : { kind: 'team' as const, teamId: teamIds[0], seed: 1 };
    };
    const sourceA = sideSource(eastSeeds, east.nodes);
    const sourceB = sideSource(westSeeds, west.nodes);
    const finalsRound = conferenceRounds + 1;
    const finals = {
      id: 'Finals',
      roundIndex: finalsRound,
      slotIndex: 0,
      conference: 'Finals' as const,
      sourceA,
      sourceB,
      resolvedTeamA: sourceA.kind === 'team' ? sourceA.teamId : undefined,
      resolvedTeamB: sourceB.kind === 'team' ? sourceB.teamId : undefined,
      resolvedSeedA: sourceA.kind === 'team' ? sourceA.seed : undefined,
      resolvedSeedB: sourceB.kind === 'team' ? sourceB.seed : undefined,
      status: sourceA.kind === 'team' && sourceB.kind === 'team' ? 'active' as const : 'waiting' as const,
    };
    const nodes = [...east.nodes, ...west.nodes, finals];
    return {
      policy: reseeded ? 'reseeded' as const : 'fixed' as const,
      nodes,
      byes: [...east.byes, ...west.byes],
      series: bracketNodesToSeries(nodes, numGamesPerRound),
    };
  }

  private static buildLeagueOpeningRound(seeds: number[], entryRounds: number[], numGames: number): PlayoffSeries[] {
    const entrants = seeds
      .map((tid, index) => ({ tid, seed: index + 1, round: entryRounds[index] ?? 1 }))
      .filter(entry => entry.round === 1);
    const series: PlayoffSeries[] = [];
    for (let index = 0; index < Math.floor(entrants.length / 2); index++) {
      const high = entrants[index];
      const low = entrants[entrants.length - 1 - index];
      series.push({
        id: `LR1S${index + 1}`,
        round: 1,
        conference: 'League',
        higherSeedTid: high.tid,
        lowerSeedTid: low.tid,
        higherSeedWins: 0,
        lowerSeedWins: 0,
        gamesNeeded: numGames,
        gameIds: [],
        status: 'active',
        higherSeed: high.seed,
        lowerSeed: low.seed,
      });
    }
    if (seeds.length === 2 && series.length === 1) {
      series[0] = { ...series[0], id: 'Finals', conference: 'Finals' };
    }
    return series;
  }

  private static resolveEntryRounds(
    teamCount: number,
    roundCount: number,
    firstRoundByes: number,
    explicit?: number[],
  ): number[] {
    if (explicit?.length === teamCount) {
      return explicit.map(round => Math.max(1, Math.min(roundCount, Math.round(Number(round) || 1))));
    }
    const byeCount = Math.min(Math.max(0, firstRoundByes), Math.max(0, teamCount - 2));
    return Array.from({ length: teamCount }, (_, index) => index < byeCount ? 2 : 1);
  }

  // Build series for round 2+ from winners of previous round.
  static buildNextRound(
    prevSeries: PlayoffSeries[],
    round: 2 | 3 | 4,
    numGames: number
  ): PlayoffSeries[] {
    const eastWinners = prevSeries
      .filter(s => s.conference === 'East' && s.winnerId != null)
      .map(s => Number(s.winnerId));
    const westWinners = prevSeries
      .filter(s => s.conference === 'West' && s.winnerId != null)
      .map(s => Number(s.winnerId));

    const series: PlayoffSeries[] = [];

    if (round === 4) {
      // Finals: east champion vs west champion
      // Home court to the conference with better combined record (simplified: east goes first)
      const eastChamp = eastWinners[0];
      const westChamp = westWinners[0];
      if (eastChamp != null && westChamp != null) {
        const eastSeries = prevSeries.filter(s => s.conference === 'East');
        const westSeries = prevSeries.filter(s => s.conference === 'West');
        const getWinnerSeedLocal = (tid: number, confSeries: PlayoffSeries[]): number => {
          const s = confSeries.find(ps => Number(ps.winnerId) === tid);
          if (!s) return 1;
          return Number(s.winnerId) === Number(s.higherSeedTid) ? s.higherSeed : s.lowerSeed;
        };
        const eastSeed = getWinnerSeedLocal(eastChamp, eastSeries);
        const westSeed = getWinnerSeedLocal(westChamp, westSeries);
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
          higherSeed: eastSeed,
          lowerSeed: westSeed,
        });
      }
    } else {
      // Helper: find a team's original seed from prevSeries
      const getWinnerSeed = (tid: number, confSeries: PlayoffSeries[]): number => {
        const s = confSeries.find(ps => Number(ps.winnerId) === tid);
        if (!s) return 99;
        return Number(s.winnerId) === Number(s.higherSeedTid) ? s.higherSeed : s.lowerSeed;
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
    existingMaxGid: number,
    latestEndDate?: Date
  ): Game[] {
    const newGames: Game[] = [];
    let gid = existingMaxGid + 1;

    // Stagger series start dates so multiple series don't all start on same day
    let seriesOffset = 0;
    for (const s of series) {
      const maxGames = s.gamesNeeded;
      const isHigherSeedHome = (gameIndex: number) =>
        gameIndex < 2 || (gameIndex >= 4 && gameIndex % 2 === 0);

      const seriesStart = new Date(startDate);
      // Slight stagger: alternate series start 1 day apart to spread the schedule
      seriesStart.setDate(seriesStart.getDate() + (seriesOffset % 2));
      seriesOffset++;

      let gameDate = new Date(seriesStart);
      const seriesGameIds: number[] = [];
      const isFinals = s.conference === 'Finals';
      const latestEndMs = latestEndDate?.getTime();
      const compressedFinalsGap = (() => {
        if (!isFinals || !Number.isFinite(latestEndMs) || maxGames <= 1) return 2;
        const availableDays = Math.floor(((latestEndMs as number) - seriesStart.getTime()) / 86_400_000);
        if (availableDays <= 0) return 1;
        return Math.max(1, Math.floor(availableDays / (maxGames - 1)));
      })();

      for (let g = 0; g < maxGames; g++) {
        newGames.push({
          gid,
          homeTid: isHigherSeedHome(g) ? s.higherSeedTid : s.lowerSeedTid,
          awayTid: isHigherSeedHome(g) ? s.lowerSeedTid : s.higherSeedTid,
          homeScore: 0,
          awayScore: 0,
          played: false,
          date: TimeService.normalize(gameDate),
          isPlayoff: true,
          isPlayIn: false,
          playoffSeriesId: s.id,
          playoffGameNumber: g + 1,
        } as Game);
        seriesGameIds.push(gid);
        gid++;
        // 2 days between games, 3 days extra rest after games 2 and 4 (not for Finals — keep it tight)
        const gap = isFinals ? compressedFinalsGap : ((g === 1 || g === 3) ? 3 : 2);
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

    const isBubblePlayIn = playInGames.some(game => game.gameType === '8v9');
    const schedule: [string, number][] = isBubblePlayIn
      ? [
          ['E8v9', 0],
          ['W8v9', 1],
        ]
      : [
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
        date: TimeService.normalize(gameDate),
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
