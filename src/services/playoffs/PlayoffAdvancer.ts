import { PlayoffBracket, GameResult, Game, PlayInGame, PlayoffSeries, type LeagueStats } from '../../types';
import { PlayoffGenerator } from './PlayoffGenerator';
import { getDraftDate } from '../../utils/dateUtils';
import { getLeagueCalendarDates } from '../leagueCalendar';
import { bracketNodesToSeries, resolveBracketGraph, resolveReseededBracketGraph, upgradeLegacyBracketGraph } from './bracketGraph';
import { getCanonicalCurrentPlayoffRound, getPlayoffCompletionEvidence } from './playoffCompletion';

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
    numGamesPerRound: number[],
    leagueStats?: LeagueStats,
  ): { bracket: PlayoffBracket; newGames: Game[] } {
    const canonicalBracket = upgradeLegacyBracketGraph(bracket, numGamesPerRound);
    // Deep clone to avoid mutation
    let b: PlayoffBracket = {
      ...canonicalBracket,
      series: canonicalBracket.series
        .filter(series => !(
          series.status === 'pending'
          && series.gameIds.length === 0
          && (series.higherSeedTid < 0 || series.lowerSeedTid < 0 || series.higherSeed >= 99 || series.lowerSeed >= 99)
        ))
        .map(s => ({ ...s, higherSeedWins: s.higherSeedWins ?? 0, lowerSeedWins: s.lowerSeedWins ?? 0 })),
      playInGames: canonicalBracket.playInGames.map(p => ({ ...p })),
      nodes: canonicalBracket.nodes?.map(node => ({ ...node, sourceA: { ...node.sourceA }, sourceB: { ...node.sourceB } })),
      byes: canonicalBracket.byes?.map(bye => ({ ...bye })),
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
          this.resolvePlayInFollowUpGame(b, pig);
        }
      }

      if (game.isPlayoff && game.playoffSeriesId) {
        const series = b.series.find(s => s.id === game.playoffSeriesId);
        if (series && series.status === 'active') {
          if (Number(result.winnerId) === Number(series.higherSeedTid)) {
            series.higherSeedWins++;
          } else {
            series.lowerSeedWins++;
          }

          const winsNeeded = Math.ceil(series.gamesNeeded / 2);
          if (series.higherSeedWins >= winsNeeded || series.lowerSeedWins >= winsNeeded) {
            series.winnerId = series.higherSeedWins >= winsNeeded
              ? Number(series.higherSeedTid)
              : Number(series.lowerSeedTid);
            series.status = 'complete';
          }
        }
      }
    }

    // Check if all play-in games (that have valid teams) are done → mark complete
    if (!b.playInComplete) {
      const activePIGames = b.playInGames.filter(
        p => Number(p.team1Tid) !== -1 && Number(p.team2Tid) !== -1
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
        let r1Series = existingR1;
        if (existingR1.length === 0) {
          const graph = PlayoffGenerator.buildConferenceGraph(
            east8,
            west8,
            numGamesPerRound,
            leagueStats?.playoffReseeding === true,
          );
          b.graphVersion = 1;
          b.bracketPolicy = graph.policy;
          b.nodes = graph.nodes;
          b.byes = graph.byes;
          b.series = graph.series;
          r1Series = graph.series.filter(series => series.round === 1 && series.status === 'active');
        }
        const startDate = new Date(`${b.firstRoundStartDate ?? `${b.season}-04-22`}T00:00:00Z`);
        const curMaxGid = Math.max(maxGid, ...newGames.map(g => g.gid), 0);
        const injected = PlayoffGenerator.injectSeriesGames(r1Series.filter(s => s.status === 'active'), startDate, curMaxGid);
        newGames.push(...injected);
        b.round1Injected = true;
        b.currentRound = 1;
      }
    }

    if (b.graphVersion === 1 && b.nodes?.length) {
      this.advancePersistedGraph(b, schedule, newGames, maxGid, numGamesPerRound, leagueStats);
    } else if (b.playoffFormat === 'historical') {
      this.advanceHistoricalBracket(b, schedule, newGames, maxGid, numGamesPerRound, leagueStats);
    } else {
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
        const s1End = this.getLastGameDate(schedule, newGames, [s1], b.season, leagueStats);
        const s2End = this.getLastGameDate(schedule, newGames, [s2], b.season, leagueStats);
        const laterEnd = s1End.getTime() >= s2End.getTime() ? s1End : s2End;
        const nextStart = new Date(laterEnd);
        nextStart.setDate(nextStart.getDate() + (pair.round === 4 ? 1 : 3));

        // Finals cap: Game 7 must land before draft day. If conference finals run
        // late, the Finals compress to daily games instead of drifting past the draft.
        let latestEndDate: Date | undefined;
        if (pair.round === 4) {
          latestEndDate = this.getFinalsLatestEndDate(b.season, nextStart, laterEnd, numGames, leagueStats);
        }

        const curMaxGid = Math.max(maxGid, ...newGames.map(g => g.gid), 0);
        const injected = PlayoffGenerator.injectSeriesGames([newSeries], nextStart, curMaxGid, latestEndDate);
        newGames.push(...injected);
      }
    }

    // Update currentRound to the lowest round that still has active (incomplete) series.
    // This keeps "Sim Round" targeting the earliest unfinished round.
    b.currentRound = getCanonicalCurrentPlayoffRound(b) as any;

    // Crown champion when Finals complete
    const finals = b.series.find(s => s.conference === 'Finals');
    if (finals?.status === 'complete' && !b.champion) {
      b.champion = finals.winnerId;
    }
    b.bracketComplete = getPlayoffCompletionEvidence(b, [...schedule, ...newGames]).complete;

    return { bracket: b, newGames };
  }

  /**
   * Resolves saved winnerOf edges into the same future node. No standings query,
   * survivor rebuild, or new series ID participates in this transition.
   */
  private static advancePersistedGraph(
    bracket: PlayoffBracket,
    schedule: Game[],
    newGames: Game[],
    maxGid: number,
    numGamesPerRound: number[],
    leagueStats?: LeagueStats,
  ): void {
    if (!bracket.nodes) return;
    const previousStatus = new Map(bracket.nodes.map(node => [node.id, node.status] as const));
    const seriesById = new Map(bracket.series.map(series => [series.id, series] as const));
    const synchronized = bracket.nodes.map(node => {
      const series = seriesById.get(node.id);
      if (!series) return node;
      return {
        ...node,
        status: series.status === 'complete' ? 'complete' as const : node.status,
        winnerId: series.winnerId ?? node.winnerId,
      };
    });
    bracket.nodes = bracket.bracketPolicy === 'reseeded'
      ? resolveReseededBracketGraph(
          synchronized,
          bracket.byes ?? [],
          bracket.playoffSeeding === 'league-wide',
        )
      : resolveBracketGraph(synchronized);

    // A saved future node becomes a real series only after both canonical
    // feeder slots resolve. Its stable node/series ID is preserved in place.
    for (const node of bracket.nodes) {
      if (seriesById.has(node.id) || node.status === 'waiting') continue;
      const created = bracketNodesToSeries([node], numGamesPerRound)[0];
      if (!created) continue;
      bracket.series = [...bracket.series, created];
      seriesById.set(created.id, created);
    }

    for (const node of bracket.nodes) {
      const existing = seriesById.get(node.id);
      if (!existing) continue;
      const aFirst = (node.resolvedSeedA ?? 99) <= (node.resolvedSeedB ?? 99);
      existing.higherSeedTid = aFirst ? node.resolvedTeamA ?? -1 : node.resolvedTeamB ?? -1;
      existing.lowerSeedTid = aFirst ? node.resolvedTeamB ?? -1 : node.resolvedTeamA ?? -1;
      existing.higherSeed = aFirst ? node.resolvedSeedA ?? 99 : node.resolvedSeedB ?? 99;
      existing.lowerSeed = aFirst ? node.resolvedSeedB ?? 99 : node.resolvedSeedA ?? 99;
      existing.sourceA = node.sourceA;
      existing.sourceB = node.sourceB;
      if (node.status === 'active' && existing.status === 'pending') existing.status = 'active';
      if (node.status === 'complete') {
        existing.status = 'complete';
        existing.winnerId = node.winnerId;
      }
    }

    const newlyActive = bracket.nodes.filter(node =>
      node.status === 'active'
      && previousStatus.get(node.id) === 'waiting'
      && (seriesById.get(node.id)?.gameIds.length ?? 0) === 0,
    );
    for (const node of newlyActive) {
      const series = seriesById.get(node.id);
      if (!series) continue;
      const feederIds = [node.sourceA, node.sourceB]
        .filter((source): source is Extract<typeof source, { kind: 'winnerOf' | 'loserOf' }> => source.kind === 'winnerOf' || source.kind === 'loserOf')
        .map(source => source.seriesId);
      const feeders = feederIds
        .map(id => seriesById.get(id))
        .filter((row): row is PlayoffSeries => Boolean(row));
      if (feeders.length === 0) continue;
      const feederEnd = this.getLastGameDate(schedule, newGames, feeders, bracket.season, leagueStats);
      const nextStart = new Date(feederEnd);
      nextStart.setUTCDate(nextStart.getUTCDate() + (node.conference === 'Finals' ? 1 : 3));
      const numGames = numGamesPerRound[Math.min(node.roundIndex - 1, numGamesPerRound.length - 1)] ?? 7;
      series.gamesNeeded = numGames;
      const latestEndDate = node.conference === 'Finals'
        ? this.getFinalsLatestEndDate(bracket.season, nextStart, feederEnd, numGames, leagueStats)
        : undefined;
      const currentMax = Math.max(maxGid, ...newGames.map(game => game.gid), 0);
      newGames.push(...PlayoffGenerator.injectSeriesGames([series], nextStart, currentMax, latestEndDate));
    }
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

  private static advanceHistoricalBracket(
    bracket: PlayoffBracket,
    schedule: Game[],
    newGames: Game[],
    maxGid: number,
    numGamesPerRound: number[],
    leagueStats?: LeagueStats,
  ): void {
    if (bracket.playoffSeeding === 'league-wide') {
      this.advanceLeagueWideBracket(bracket, schedule, newGames, maxGid, numGamesPerRound, leagueStats);
      return;
    }
    let createdSeries = true;
    while (createdSeries) {
      createdSeries = false;

      for (const conf of ['East', 'West'] as const) {
        const confSeries = bracket.series.filter(s => s.conference === conf);
        if (confSeries.length === 0) continue;
        const latestRound = Math.max(...confSeries.map(s => s.round));
        const latestRoundSeries = confSeries.filter(s => s.round === latestRound);
        if (!latestRoundSeries.every(s => s.status === 'complete')) continue;
        const winners = this.getCompletedSeriesWinners(latestRoundSeries);
        if (winners.length <= 1) continue;
        const nextRound = (latestRound + 1) as 2 | 3 | 4;
        if (bracket.series.some(s => s.conference === conf && s.round === nextRound)) continue;
        const numGames = this.getHistoricalRoundGames(numGamesPerRound, nextRound, false);
        const nextSeries = this.buildHistoricalRoundSeries(conf, winners, nextRound, numGames);
        if (nextSeries.length === 0) continue;
        bracket.series = [...bracket.series, ...nextSeries];
        const nextStart = this.nextHistoricalRoundStart(schedule, newGames, latestRoundSeries, bracket.season, nextRound, leagueStats);
        const curMaxGid = Math.max(maxGid, ...newGames.map(g => g.gid), 0);
        const injected = PlayoffGenerator.injectSeriesGames(nextSeries, nextStart, curMaxGid);
        newGames.push(...injected);
        createdSeries = true;
      }

      const eastChamp = this.getHistoricalConferenceChampion(bracket, 'East');
      const westChamp = this.getHistoricalConferenceChampion(bracket, 'West');
      if (!eastChamp || !westChamp || bracket.series.some(s => s.id === 'Finals')) continue;
      const finalsRound = Math.max(1, numGamesPerRound.length);
      const numGames = this.getHistoricalRoundGames(numGamesPerRound, finalsRound, true);
      const finals: PlayoffSeries = {
        id: 'Finals',
        round: finalsRound,
        conference: 'Finals',
        higherSeedTid: eastChamp.tid,
        lowerSeedTid: westChamp.tid,
        higherSeedWins: 0,
        lowerSeedWins: 0,
        gamesNeeded: numGames,
        gameIds: [],
        status: 'active',
        higherSeed: eastChamp.seed,
        lowerSeed: westChamp.seed,
      };
      bracket.series = [...bracket.series, finals];
      const eastEnd = this.getLastGameDate(schedule, newGames, eastChamp.sourceSeries, bracket.season, leagueStats);
      const westEnd = this.getLastGameDate(schedule, newGames, westChamp.sourceSeries, bracket.season, leagueStats);
      const laterEnd = eastEnd.getTime() >= westEnd.getTime() ? eastEnd : westEnd;
      const nextStart = new Date(laterEnd);
      nextStart.setDate(nextStart.getDate() + 1);
      const latestEndDate = this.getFinalsLatestEndDate(bracket.season, nextStart, laterEnd, numGames, leagueStats);
      const curMaxGid = Math.max(maxGid, ...newGames.map(g => g.gid), 0);
      const injected = PlayoffGenerator.injectSeriesGames([finals], nextStart, curMaxGid, latestEndDate);
      newGames.push(...injected);
      createdSeries = true;
    }
  }

  private static advanceLeagueWideBracket(
    bracket: PlayoffBracket,
    schedule: Game[],
    newGames: Game[],
    maxGid: number,
    numGamesPerRound: number[],
    leagueStats?: LeagueStats,
  ): void {
    let createdSeries = true;
    while (createdSeries) {
      createdSeries = false;
      const finals = bracket.series.find(series => series.conference === 'Finals');
      if (finals) break;
      const leagueSeries = bracket.series.filter(series => series.conference === 'League');
      if (leagueSeries.length === 0) break;
      const latestRound = Math.max(...leagueSeries.map(series => series.round));
      const feeders = leagueSeries.filter(series => series.round === latestRound);
      if (!feeders.every(series => series.status === 'complete')) break;
      const winners = this.getCompletedSeriesWinners(feeders);
      const winnerIds = new Set(winners.map(winner => winner.tid));
      const entrants = (bracket.leagueSeeds ?? [])
        .map((tid, index) => ({
          tid,
          seed: index + 1,
          entryRound: bracket.playoffEntryRounds?.[index] ?? 1,
        }))
        .filter(entry => entry.entryRound === latestRound + 1 && !winnerIds.has(entry.tid))
        .map(({ tid, seed }) => ({ tid, seed }));
      const participants = [...winners, ...entrants].sort((left, right) => left.seed - right.seed);
      if (participants.length < 2) {
        if (participants.length === 1) {
          bracket.champion = participants[0].tid;
        }
        break;
      }
      const nextRound = latestRound + 1;
      const isFinals = nextRound >= numGamesPerRound.length && participants.length === 2;
      const numGames = numGamesPerRound[Math.min(nextRound - 1, numGamesPerRound.length - 1)] ?? 7;
      const nextSeries = this.buildHistoricalRoundSeries(
        isFinals ? 'Finals' : 'League',
        participants,
        nextRound,
        numGames,
      ).map((series, index) => isFinals
        ? { ...series, id: index === 0 ? 'Finals' : series.id, conference: 'Finals' as const }
        : series);
      if (nextSeries.length === 0) break;
      bracket.series = [...bracket.series, ...nextSeries];
      const nextStart = this.nextHistoricalRoundStart(schedule, newGames, feeders, bracket.season, nextRound, leagueStats);
      const curMaxGid = Math.max(maxGid, ...newGames.map(game => game.gid), 0);
      const latestEndDate = isFinals
        ? this.getFinalsLatestEndDate(bracket.season, nextStart, this.getLastGameDate(schedule, newGames, feeders, bracket.season, leagueStats), numGames, leagueStats)
        : undefined;
      newGames.push(...PlayoffGenerator.injectSeriesGames(nextSeries, nextStart, curMaxGid, latestEndDate));
      createdSeries = true;
    }
  }

  private static getCompletedSeriesWinners(series: PlayoffSeries[]): Array<{ tid: number; seed: number }> {
    return series
      .map(s => {
        if (s.winnerId == null) return null;
        const winnerId = Number(s.winnerId);
        return {
          tid: winnerId,
          seed: winnerId === Number(s.higherSeedTid) ? s.higherSeed : s.lowerSeed,
        };
      })
      .filter((winner): winner is { tid: number; seed: number } => Boolean(winner))
      .sort((a, b) => a.seed - b.seed);
  }

  private static buildHistoricalRoundSeries(
    conf: 'East' | 'West' | 'League' | 'Finals',
    winners: Array<{ tid: number; seed: number }>,
    round: number,
    numGames: number
  ): PlayoffSeries[] {
    const series: PlayoffSeries[] = [];
    for (let i = 0; i < Math.floor(winners.length / 2); i++) {
      const high = winners[i];
      const low = winners[winners.length - 1 - i];
      if (!high || !low) continue;
      series.push({
        id: `${conf === 'Finals' ? 'F' : conf[0]}R${round}S${i + 1}`,
        round,
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

  private static getHistoricalConferenceChampion(
    bracket: PlayoffBracket,
    conf: 'East' | 'West'
  ): { tid: number; seed: number; sourceSeries: PlayoffSeries[] } | null {
    const confSeries = bracket.series.filter(s => s.conference === conf);
    if (confSeries.length === 0) return null;
    const latestRound = Math.max(...confSeries.map(s => s.round));
    const latestRoundSeries = confSeries.filter(s => s.round === latestRound);
    if (!latestRoundSeries.every(s => s.status === 'complete')) return null;
    const winners = this.getCompletedSeriesWinners(latestRoundSeries);
    if (winners.length !== 1) return null;
    return { ...winners[0], sourceSeries: latestRoundSeries };
  }

  private static getHistoricalRoundGames(numGamesPerRound: number[], round: number, finals: boolean): number {
    if (finals) return numGamesPerRound[numGamesPerRound.length - 1] ?? 7;
    const finalIndex = Math.max(0, numGamesPerRound.length - 2);
    return numGamesPerRound[Math.min(round - 1, finalIndex)] ?? 7;
  }

  private static nextHistoricalRoundStart(
    schedule: Game[],
    newGames: Game[],
    feederSeries: PlayoffSeries[],
    season: number,
    round: number,
    leagueStats?: LeagueStats,
  ): Date {
    const lastDate = this.getLastGameDate(schedule, newGames, feederSeries, season, leagueStats);
    const start = new Date(lastDate);
    start.setDate(start.getDate() + (round === 4 ? 1 : 3));
    return start;
  }

  private static getFinalsLatestEndDate(
    season: number,
    nextStart: Date,
    laterEnd: Date,
    numGames: number,
    leagueStats?: LeagueStats,
  ): Date {
    const draftDate = getDraftDate(season, leagueStats);
    const latestEndDate = new Date(draftDate);
    latestEndDate.setDate(latestEndDate.getDate() - 1);
    const normalFinalsSpanDays = (numGames - 1) * 2;
    const juneMaxStart = new Date(latestEndDate);
    juneMaxStart.setDate(juneMaxStart.getDate() - normalFinalsSpanDays);
    if (nextStart > juneMaxStart && juneMaxStart > laterEnd) {
      nextStart.setTime(juneMaxStart.getTime());
    }
    return latestEndDate;
  }

  private static resolvePlayInFollowUpGame(bracket: PlayoffBracket, resolvedGame: PlayInGame): void {
    const conf = resolvedGame.conference;
    const prefix = conf[0];

    if (resolvedGame.gameType === '8v9') {
      const secondGame = bracket.playInGames.find(p => p.id === `${prefix}8v9g2`);
      if (!secondGame || resolvedGame.winnerId == null) return;
      if (Number(resolvedGame.winnerId) === Number(resolvedGame.team2Tid)) {
        secondGame.team1Tid = Number(resolvedGame.team1Tid);
        secondGame.team2Tid = Number(resolvedGame.team2Tid);
      }
      return;
    }

    if (resolvedGame.gameType !== '7v8' && resolvedGame.gameType !== '9v10') return;

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
    if (bracket.playInFormat === 'bubble_8_9') {
      const top7 = conf === 'East' ? (bracket.eastTop7 ?? []) : (bracket.westTop7 ?? []);
      const top8 = conf === 'East' ? (bracket.eastTop8 ?? []) : (bracket.westTop8 ?? []);
      const bubbleGame = bracket.playInGames.find(p => p.id === `${conf[0]}8v9`);
      const secondGame = bracket.playInGames.find(p => p.id === `${conf[0]}8v9g2`);
      if (!bubbleGame) return top8;
      if (bubbleGame.winnerId == null || top7.length < 7) return [];
      if (Number(bubbleGame.winnerId) === Number(bubbleGame.team1Tid)) return [...top7, Number(bubbleGame.team1Tid)];
      if (secondGame?.winnerId != null) return [...top7, Number(secondGame.winnerId)];
      return [];
    }

    const top6 = conf === 'East' ? bracket.eastTop6 : bracket.westTop6;
    const prefix = conf[0];

    const game7v8 = bracket.playInGames.find(p => p.id === `${prefix}7v8`);
    const loserGame = bracket.playInGames.find(p => p.id === `${prefix}loser`);

    const seed7 = game7v8?.winnerId;
    const seed8 = loserGame?.winnerId;

    if (seed7 == null || seed8 == null || top6.length < 6) return [];
    return [...top6, seed7, seed8];
  }

  private static getLastGameDate(
    schedule: Game[],
    newGames: Game[],
    series: PlayoffSeries[],
    seasonYear?: number,
    leagueStats?: LeagueStats,
  ): Date {
    const allGameIds = new Set(series.flatMap(s => s.gameIds));
    const allGames = [...schedule, ...newGames].filter(g => allGameIds.has(g.gid));
    if (allGames.length === 0) {
      return getLeagueCalendarDates(seasonYear ?? new Date().getFullYear(), leagueStats).playoffStart;
    }
    const dates = allGames.map(g => new Date(g.date).getTime());
    return new Date(Math.max(...dates));
  }
}
