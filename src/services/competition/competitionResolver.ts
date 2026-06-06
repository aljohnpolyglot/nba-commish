import type { Game, GameResult } from '../../types';
import type { CompetitionSpec } from './types';
import { selectCompetitionTeamTids } from './competitionScheduler';
import { normalizeDate } from '../../utils/helpers';
import {
  addDays,
  dateForRound,
  type EuroSeasonCompletionState,
  getUnresolvedEuroSeasonCompetitionIds as getUnresolvedEuroSeasonCompetitionIdsFromState,
  hasUnresolvedEuroSeasonCompetitions as hasUnresolvedEuroSeasonCompetitionsFromState,
  matchesBoxScoreSeason,
  roundEndDate,
  roundStartDate,
  type PostseasonScheduleState,
} from './competitionSeasonState';
export interface CompetitionStanding {
  tid: number;
  seed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
}
export interface CompetitionKnockoutMatch {
  round: 'play-in' | 'quarterfinal' | 'semifinal' | 'final';
  highSeedTid: number;
  lowSeedTid: number;
  winnerTid: number;
  loserTid: number;
  bestOf: number;
  higherSeedWinsNeeded?: number;
  lowerSeedWinsNeeded?: number;
  maxGames?: number;
}
export interface CompetitionSeasonResolution {
  competitionId: string;
  season: number;
  standings: CompetitionStanding[];
  playInMatches: CompetitionKnockoutMatch[];
  knockoutMatches: CompetitionKnockoutMatch[];
  championTid: number | null;
  runnerUpTid: number | null;
  semifinalistTids: number[];
  quarterfinalistTids: number[];
}

function activePbaCompetitionId(state: PostseasonScheduleState): string | null {
  const leagueStats = (state as any).leagueStats;
  if (leagueStats?.uiMode !== 'pba_isolated') return null;
  if (leagueStats.pbaConferencePhase === 'offseason' || leagueStats.pbaConferencePhase === 'complete') return null;
  if (leagueStats.pbaConference === 'commissioners') return 'pba-commissioners-cup';
  if (leagueStats.pbaConference === 'governors') return 'pba-governors-cup';
  return 'pba-philippine-cup';
}

function shouldHandleSeriesSpec(state: PostseasonScheduleState, spec: CompetitionSpec): boolean {
  if (!spec.id.startsWith('pba-')) return true;
  if ((state as any).leagueStats?.uiMode !== 'pba_isolated') return true;
  return activePbaCompetitionId(state) === spec.id;
}

function rankStandings(rows: Map<number, Omit<CompetitionStanding, 'seed' | 'pointDiff'>>): CompetitionStanding[] {
  return [...rows.values()]
    .map(row => ({ ...row, pointDiff: row.pointsFor - row.pointsAgainst }))
    .sort((a, b) =>
      b.wins - a.wins ||
      b.pointDiff - a.pointDiff ||
      b.pointsFor - a.pointsFor ||
      a.tid - b.tid,
    )
    .map((row, index) => ({ ...row, seed: index + 1 }));
}
function expectedWinner(
  high: CompetitionStanding,
  low: CompetitionStanding,
): { winner: CompetitionStanding; loser: CompetitionStanding } {
  const highScore = high.wins * 5 + high.pointDiff * 0.15 + (50 - high.seed);
  const lowScore = low.wins * 5 + low.pointDiff * 0.15 + (50 - low.seed);
  if (lowScore > highScore + 4) return { winner: low, loser: high };
  return { winner: high, loser: low };
}
function makeMatch(
  round: CompetitionKnockoutMatch['round'],
  high: CompetitionStanding,
  low: CompetitionStanding,
  bestOf: number,
): CompetitionKnockoutMatch {
  const { winner, loser } = expectedWinner(high, low);
  return {
    round,
    highSeedTid: high.tid,
    lowSeedTid: low.tid,
    winnerTid: winner.tid,
    loserTid: loser.tid,
    bestOf,
  };
}

function makeTwiceToBeatMatch(
  round: CompetitionKnockoutMatch['round'],
  high: CompetitionStanding,
  low: CompetitionStanding,
): CompetitionKnockoutMatch {
  const projected = makeMatch(round, high, low, 2);
  return {
    ...projected,
    higherSeedWinsNeeded: 1,
    lowerSeedWinsNeeded: 2,
    maxGames: 2,
  };
}

function winsNeededForMatch(match: CompetitionKnockoutMatch, tid: number): number {
  if (tid === match.highSeedTid) {
    return match.higherSeedWinsNeeded ?? Math.ceil(match.bestOf / 2);
  }
  if (tid === match.lowSeedTid) {
    return match.lowerSeedWinsNeeded ?? Math.ceil(match.bestOf / 2);
  }
  return Math.ceil(match.bestOf / 2);
}

function seriesCompleteFromWins(
  match: CompetitionKnockoutMatch,
  wins: Map<number, number>,
): { complete: boolean; winnerTid: number | null } {
  const highWins = wins.get(match.highSeedTid) ?? 0;
  const lowWins = wins.get(match.lowSeedTid) ?? 0;
  const highNeeded = winsNeededForMatch(match, match.highSeedTid);
  const lowNeeded = winsNeededForMatch(match, match.lowSeedTid);
  if (highWins >= highNeeded && highWins !== lowWins) {
    return { complete: true, winnerTid: match.highSeedTid };
  }
  if (lowWins >= lowNeeded && highWins !== lowWins) {
    return { complete: true, winnerTid: match.lowSeedTid };
  }
  return { complete: false, winnerTid: null };
}
function getQuarterfinalBestOf(spec: CompetitionSpec): number {
  return spec.playoffFormat?.qfBest ?? (spec.playoffFormat?.qfFormat === 'twice-to-beat' ? 2 : 3);
}

function isSeriesCompetitionSpec(spec: CompetitionSpec): boolean {
  return !!spec.playoffFormat && (
    spec.id === 'endesa' ||
    spec.id === 'euroleague' ||
    spec.id.startsWith('pba-')
  );
}

function resolveBracket(
  standings: CompetitionStanding[],
  spec: CompetitionSpec,
): Omit<CompetitionSeasonResolution, 'competitionId' | 'season' | 'standings'> {
  if (standings.length < 2) {
    return { playInMatches: [], knockoutMatches: [], championTid: null, runnerUpTid: null, semifinalistTids: [], quarterfinalistTids: [] };
  }
  const byTid = new Map(standings.map(row => [row.tid, row]));
  const playInMatches: CompetitionKnockoutMatch[] = [];
  let playoffSeeds = standings.slice(0, Math.min(8, standings.length));
  if (spec.id === 'euroleague' && standings.length >= 10) {
    const sevenEight = makeMatch('play-in', standings[6], standings[7], 1);
    const nineTen = makeMatch('play-in', standings[8], standings[9], 1);
    const eighthSeedMatch = makeMatch(
      'play-in',
      byTid.get(sevenEight.loserTid)!,
      byTid.get(nineTen.winnerTid)!,
      1,
    );
    playInMatches.push(sevenEight, nineTen, eighthSeedMatch);
    playoffSeeds = [
      ...standings.slice(0, 6),
      byTid.get(sevenEight.winnerTid)!,
      byTid.get(eighthSeedMatch.winnerTid)!,
    ].map((row, index) => ({ ...row, seed: index + 1 }));
  }
  const qfBest = getQuarterfinalBestOf(spec);
  const sfBest = spec.playoffFormat?.sfBest ?? spec.playoffFormat?.finalBest ?? 5;
  const finalBest = spec.playoffFormat?.finalFormat === 'final-four' ? 1 : (spec.playoffFormat?.finalBest ?? 5);
  const knockoutMatches: CompetitionKnockoutMatch[] = [];
  const quarterPairs = [
    [playoffSeeds[0], playoffSeeds[7]],
    [playoffSeeds[3], playoffSeeds[4]],
    [playoffSeeds[1], playoffSeeds[6]],
    [playoffSeeds[2], playoffSeeds[5]],
  ].filter((pair): pair is [CompetitionStanding, CompetitionStanding] => !!pair[0] && !!pair[1]);
  const qf = quarterPairs.map(([high, low]) =>
    spec.playoffFormat?.qfFormat === 'twice-to-beat'
      ? makeTwiceToBeatMatch('quarterfinal', high, low)
      : makeMatch('quarterfinal', high, low, qfBest),
  );
  knockoutMatches.push(...qf);
  const qfWinners = qf.map(match => byTid.get(match.winnerTid)!).filter(Boolean);
  const qfLosers = qf.map(match => match.loserTid);
  const sfPairs = [
    [qfWinners[0], qfWinners[1]],
    [qfWinners[2], qfWinners[3]],
  ].filter((pair): pair is [CompetitionStanding, CompetitionStanding] => !!pair[0] && !!pair[1]);
  const sf = sfPairs.map(([high, low]) => makeMatch('semifinal', high.seed < low.seed ? high : low, high.seed < low.seed ? low : high, sfBest));
  knockoutMatches.push(...sf);
  const sfWinners = sf.map(match => byTid.get(match.winnerTid)!).filter(Boolean);
  const sfLosers = sf.map(match => match.loserTid);
  const final = sfWinners.length === 2
    ? makeMatch('final', sfWinners[0].seed < sfWinners[1].seed ? sfWinners[0] : sfWinners[1], sfWinners[0].seed < sfWinners[1].seed ? sfWinners[1] : sfWinners[0], finalBest)
    : null;
  if (final) knockoutMatches.push(final);
  return {
    playInMatches,
    knockoutMatches,
    championTid: final?.winnerTid ?? playoffSeeds[0]?.tid ?? null,
    runnerUpTid: final?.loserTid ?? playoffSeeds[1]?.tid ?? null,
    semifinalistTids: sfLosers,
    quarterfinalistTids: qfLosers,
  };
}
export function getUnresolvedEuroSeasonCompetitionIds(state: EuroSeasonCompletionState): string[] {
  return getUnresolvedEuroSeasonCompetitionIdsFromState(state, resolveCompetitionSeason);
}
export function hasUnresolvedEuroSeasonCompetitions(state: EuroSeasonCompletionState): boolean {
  return hasUnresolvedEuroSeasonCompetitionsFromState(state, resolveCompetitionSeason);
}
function roundWinnerFromResults(
  match: CompetitionKnockoutMatch,
  competitionId: string,
  phase: string,
  boxScores: GameResult[],
  season?: number,
): number | null {
  const wins = new Map<number, number>([
    [match.highSeedTid, 0],
    [match.lowSeedTid, 0],
  ]);
  boxScores
    .filter(game =>
      game.competitionId === competitionId &&
      game.competitionPhase === phase &&
      matchesBoxScoreSeason(game, season) &&
      ((game.homeTeamId === match.highSeedTid && game.awayTeamId === match.lowSeedTid) ||
        (game.homeTeamId === match.lowSeedTid && game.awayTeamId === match.highSeedTid)),
    )
    .forEach(game => {
      const winner = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
      wins.set(winner, (wins.get(winner) ?? 0) + 1);
    });
  return seriesCompleteFromWins(match, wins).winnerTid;
}

function phaseMatchResults(
  matches: CompetitionKnockoutMatch[],
  competitionId: string,
  phase: string,
  boxScores: GameResult[],
  season?: number,
): Array<{ winnerTid: number; loserTid: number }> {
  return matches.flatMap(match => {
    const wins = new Map<number, number>([
      [match.highSeedTid, 0],
      [match.lowSeedTid, 0],
    ]);
    boxScores
      .filter(game =>
        game.competitionId === competitionId &&
        game.competitionPhase === phase &&
        matchesBoxScoreSeason(game, season) &&
        ((game.homeTeamId === match.highSeedTid && game.awayTeamId === match.lowSeedTid) ||
          (game.homeTeamId === match.lowSeedTid && game.awayTeamId === match.highSeedTid)),
      )
      .forEach(game => {
        const winner = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
        wins.set(winner, (wins.get(winner) ?? 0) + 1);
      });
    const result = seriesCompleteFromWins(match, wins);
    if (!result.complete || result.winnerTid == null) return [];
    return [{
      winnerTid: result.winnerTid,
      loserTid: result.winnerTid === match.highSeedTid ? match.lowSeedTid : match.highSeedTid,
    }];
  });
}
function isRegularSeasonPhase(phase?: string): boolean {
  return !phase || phase === 'group' || phase.startsWith('r');
}
function makeSeriesGames(
  baseGid: number,
  match: CompetitionKnockoutMatch,
  spec: CompetitionSpec,
  phase: string,
  startIso: string,
): Game[] {
  const isPlayIn = phase === 'play-in';
  const isPlayoff = phase === 'qf' || phase === 'sf' || phase === 'final';
  return Array.from({ length: match.maxGames ?? match.bestOf }).map((_, index) => ({
    gid: baseGid + index,
    homeTid: index % 2 === 0 ? match.highSeedTid : match.lowSeedTid,
    awayTid: index % 2 === 0 ? match.lowSeedTid : match.highSeedTid,
    homeScore: 0,
    awayScore: 0,
    played: false,
    date: addDays(startIso, index * 2),
    competitionId: spec.id,
    competitionPhase: phase,
    isPlayIn,
    isPlayoff,
  }));
}
function playoffSeedsForResolution(
  spec: CompetitionSpec,
  resolution: CompetitionSeasonResolution,
  boxScores: GameResult[],
  season: number,
): CompetitionStanding[] {
  if (spec.id !== 'euroleague' || resolution.playInMatches.length < 3) {
    return resolution.standings.slice(0, Math.min(8, resolution.standings.length));
  }
  const standingsByTid = new Map(resolution.standings.map(row => [row.tid, row]));
  const sevenEight = resolution.playInMatches[0];
  const eighthSeedMatch = resolution.playInMatches[2];
  const seventhTid = roundWinnerFromResults(sevenEight, spec.id, 'play-in', boxScores, season) ?? sevenEight.winnerTid;
  const eighthTid = roundWinnerFromResults(eighthSeedMatch, spec.id, 'play-in', boxScores, season) ?? eighthSeedMatch.winnerTid;
  return [
    ...resolution.standings.slice(0, 6),
    standingsByTid.get(seventhTid),
    standingsByTid.get(eighthTid),
  ].filter((row): row is CompetitionStanding => !!row).map((row, index) => ({ ...row, seed: index + 1 }));
}
function quarterfinalMatchesForResolution(
  spec: CompetitionSpec,
  resolution: CompetitionSeasonResolution,
  boxScores: GameResult[],
  season: number,
): CompetitionKnockoutMatch[] {
  const seeds = playoffSeedsForResolution(spec, resolution, boxScores, season);
  const qfBest = getQuarterfinalBestOf(spec);
  return [
    [seeds[0], seeds[7]],
    [seeds[3], seeds[4]],
    [seeds[1], seeds[6]],
    [seeds[2], seeds[5]],
  ].filter((pair): pair is [CompetitionStanding, CompetitionStanding] => !!pair[0] && !!pair[1])
    .map(([high, low]) =>
      spec.playoffFormat?.qfFormat === 'twice-to-beat'
        ? makeTwiceToBeatMatch('quarterfinal', high, low)
        : makeMatch('quarterfinal', high, low, qfBest),
    );
}
function seedTidsForSpec(spec: CompetitionSpec, state: PostseasonScheduleState): number[] {
  return selectCompetitionTeamTids(spec, state);
}
function phaseExists(schedule: Game[], competitionId: string, phase: string): boolean {
  return schedule.some(game => game.competitionId === competitionId && game.competitionPhase === phase);
}
function phaseUnplayed(schedule: Game[], competitionId: string, phase: string): boolean {
  return schedule.some(game => game.competitionId === competitionId && game.competitionPhase === phase && !game.played);
}
function regularSeasonComplete(state: PostseasonScheduleState, spec: CompetitionSpec): boolean {
  return !state.schedule.some(game =>
    game.competitionId === spec.id &&
    !game.played &&
    (game.competitionPhase === 'group' || game.competitionPhase?.startsWith('r')),
  );
}

function pruneCompletedSeriesGames(
  schedule: Game[],
  matches: CompetitionKnockoutMatch[],
  competitionId: string,
  phase: 'play-in' | 'qf' | 'sf' | 'final',
  boxScores: GameResult[],
  season: number,
): Game[] {
  let pruned = schedule;
  for (const match of matches) {
    const winner = roundWinnerFromResults(match, competitionId, phase, boxScores, season);
    if (winner == null) continue;
    pruned = pruned.filter(game =>
      game.played ||
      game.competitionId !== competitionId ||
      game.competitionPhase !== phase ||
      !(
        (game.homeTid === match.highSeedTid && game.awayTid === match.lowSeedTid) ||
        (game.homeTid === match.lowSeedTid && game.awayTid === match.highSeedTid)
      ),
    );
  }
  return pruned;
}

export function injectCompetitionPostseasonGames(
  state: PostseasonScheduleState,
  specs: CompetitionSpec[] = [],
  season: number,
): Game[] {
  let schedule = [...state.schedule];
  let nextGid = Math.max(800_000, ...schedule.map(game => game.gid)) + 1;
  for (const spec of specs.filter(spec => isSeriesCompetitionSpec(spec) && shouldHandleSeriesSpec(state, spec))) {
    if (!regularSeasonComplete({ ...state, schedule }, spec)) continue;
    const resolution = resolveCompetitionSeason(spec, state.boxScores, season, seedTidsForSpec(spec, state));
    if (!resolution) continue;
    const qfRound = spec.playoffFormat?.rounds.find(round => round.phase === 'qf' || round.phase === 'quarterfinals');
    const sfRound = spec.playoffFormat?.rounds.find(round => round.phase === 'sf' || round.phase === 'semifinals' || round.phase === 'final-four');
    const finalRound = spec.playoffFormat?.rounds.find(round => round.phase === 'final' || round.phase === 'final-four');
    const qfStart = qfRound ? roundStartDate(season, qfRound) : null;
    const sfStart = sfRound ? roundStartDate(season, sfRound) : null;
    const finalStart = finalRound
      ? spec.playoffFormat?.finalFormat === 'final-four'
        ? roundEndDate(season, finalRound)
        : roundStartDate(season, finalRound)
      : null;
    const playInStart = spec.id === 'euroleague' && qfStart ? addDays(qfStart, -8) : null;
    const playInComplete = spec.id !== 'euroleague' ||
      phaseMatchResults(resolution.playInMatches, spec.id, 'play-in', state.boxScores, season).length >= resolution.playInMatches.length;
    if (playInStart && !phaseExists(schedule, spec.id, 'play-in')) {
      const playInGames = resolution.playInMatches.flatMap((match, index) => {
        const games = makeSeriesGames(nextGid, match, spec, 'play-in', addDays(playInStart, index < 2 ? 0 : 2));
        nextGid += games.length;
        return games;
      });
      schedule = [...schedule, ...playInGames];
    }
    if (
      qfStart &&
      !phaseExists(schedule, spec.id, 'qf') &&
      playInComplete
    ) {
      const qf = quarterfinalMatchesForResolution(spec, resolution, state.boxScores, season);
      const qfGames = qf.flatMap(match => {
        const games = makeSeriesGames(nextGid, match, spec, 'qf', qfStart);
        nextGid += games.length;
        return games;
      });
      schedule = [...schedule, ...qfGames];
    }
    const qfForSf = quarterfinalMatchesForResolution(spec, resolution, state.boxScores, season);
    if (spec.playoffFormat?.qfFormat === 'twice-to-beat') {
      const repairedGames: Game[] = [];
      for (const match of qfForSf) {
        const pairGames = schedule
          .filter(game =>
            game.competitionId === spec.id &&
            game.competitionPhase === 'qf' &&
            ((game.homeTid === match.highSeedTid && game.awayTid === match.lowSeedTid) ||
              (game.homeTid === match.lowSeedTid && game.awayTid === match.highSeedTid)),
          )
          .sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)) || a.gid - b.gid);
        const winner = roundWinnerFromResults(match, spec.id, 'qf', state.boxScores, season);
        if (winner != null || pairGames.length >= (match.maxGames ?? match.bestOf)) continue;
        const nextIndex = pairGames.length;
        const baseDate = pairGames[pairGames.length - 1]?.date ?? qfStart;
        repairedGames.push({
          gid: nextGid++,
          homeTid: nextIndex % 2 === 0 ? match.highSeedTid : match.lowSeedTid,
          awayTid: nextIndex % 2 === 0 ? match.lowSeedTid : match.highSeedTid,
          homeScore: 0,
          awayScore: 0,
          played: false,
          date: addDays(baseDate, 2),
          competitionId: spec.id,
          competitionPhase: 'qf',
          isPlayoff: true,
        });
      }
      if (repairedGames.length > 0) {
        schedule = [...schedule, ...repairedGames];
      }
    }
    schedule = pruneCompletedSeriesGames(schedule, qfForSf, spec.id, 'qf', state.boxScores, season);
    const completedQf = phaseMatchResults(qfForSf, spec.id, 'qf', state.boxScores, season);
    const qfComplete = qfForSf.length > 0 && completedQf.length >= qfForSf.length;
    if (!qfComplete && (phaseUnplayed(schedule, spec.id, 'sf') || phaseUnplayed(schedule, spec.id, 'final'))) {
      schedule = schedule.filter(game =>
        game.competitionId !== spec.id ||
        (game.competitionPhase !== 'sf' && game.competitionPhase !== 'final') ||
        game.played,
      );
    }
    if (sfStart && !phaseExists(schedule, spec.id, 'sf') && qfComplete) {
      const qf = quarterfinalMatchesForResolution(spec, resolution, state.boxScores, season);
      const qfWinners = qf.map(match => roundWinnerFromResults(match, spec.id, 'qf', state.boxScores, season)).filter((tid): tid is number => tid != null);
      const standingsByTid = new Map(resolution.standings.map(row => [row.tid, row]));
      const semifinalists = qfWinners.map(tid => standingsByTid.get(tid)).filter((row): row is CompetitionStanding => !!row);
      const sfPairs: Array<[CompetitionStanding, CompetitionStanding]> = [
        [semifinalists[0], semifinalists[1]],
        [semifinalists[2], semifinalists[3]],
      ].filter((pair): pair is [CompetitionStanding, CompetitionStanding] => !!pair[0] && !!pair[1]);
      const sfBest = spec.playoffFormat?.finalFormat === 'final-four' ? 1 : (spec.playoffFormat?.sfBest ?? spec.playoffFormat?.finalBest ?? 5);
      const sfGames = sfPairs.flatMap(([a, b]) => {
        const high = a.seed < b.seed ? a : b;
        const low = a.seed < b.seed ? b : a;
        const games = makeSeriesGames(nextGid, makeMatch('semifinal', high, low, sfBest), spec, 'sf', sfStart);
        nextGid += games.length;
        return games;
      });
      schedule = [...schedule, ...sfGames];
    }
    const sfBestForResults = spec.playoffFormat?.finalFormat === 'final-four' ? 1 : (spec.playoffFormat?.sfBest ?? spec.playoffFormat?.finalBest ?? 5);
    const sfMatches = resolution.knockoutMatches.filter(match => match.round === 'semifinal');
    const completedSf = phaseMatchResults(sfMatches, spec.id, 'sf', state.boxScores, season);
    const sfComplete = completedSf.length >= 2;
    schedule = pruneCompletedSeriesGames(schedule, sfMatches, spec.id, 'sf', state.boxScores, season);
    if (!sfComplete && phaseUnplayed(schedule, spec.id, 'final')) {
      schedule = schedule.filter(game =>
        game.competitionId !== spec.id ||
        game.competitionPhase !== 'final' ||
        game.played,
      );
    }
    if (finalStart && !phaseExists(schedule, spec.id, 'final') && sfComplete) {
      const actualSfWinners = phaseMatchResults(
        resolution.knockoutMatches.filter(match => match.round === 'semifinal'),
        spec.id,
        'sf',
        state.boxScores,
        season,
      ).map(result => result.winnerTid);
      const sfWinners = actualSfWinners.length >= 2 ? actualSfWinners : [];
      const standingsByTid = new Map(resolution.standings.map(row => [row.tid, row]));
      const finalists = sfWinners.map(tid => standingsByTid.get(tid)).filter((row): row is CompetitionStanding => !!row);
      if (finalists.length === 2) {
        const high = finalists[0].seed < finalists[1].seed ? finalists[0] : finalists[1];
        const low = finalists[0].seed < finalists[1].seed ? finalists[1] : finalists[0];
        const finalBest = spec.playoffFormat?.finalFormat === 'final-four' ? 1 : (spec.playoffFormat?.finalBest ?? 5);
        const finalGames = makeSeriesGames(nextGid, makeMatch('final', high, low, finalBest), spec, 'final', finalStart);
        nextGid += finalGames.length;
        schedule = [...schedule, ...finalGames];
      }
    }
    schedule = pruneCompletedSeriesGames(
      schedule,
      resolution.knockoutMatches.filter(match => match.round === 'final'),
      spec.id,
      'final',
      state.boxScores,
      season,
    );
  }
  return schedule.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.gid - b.gid);
}
export function injectSingleEliminationProgression(
  state: PostseasonScheduleState,
  specs: CompetitionSpec[] = [],
  season: number,
): Game[] {
  const today = new Date(state.date);
  let schedule = [...state.schedule];
  let nextGid = Math.max(800_000, ...schedule.map(g => g.gid)) + 1;
  const ROUND_CHAIN: Array<{ source: 'qf' | 'sf'; child: 'sf' | 'final'; childRoundAliases: string[] }> = [
    { source: 'qf', child: 'sf', childRoundAliases: ['sf', 'semifinals'] },
    { source: 'sf', child: 'final', childRoundAliases: ['final'] },
  ];
  for (const spec of specs.filter(s => s.format === 'tournament' || s.format === 'knockout')) {
    for (const link of ROUND_CHAIN) {
      const sourceGames = schedule
        .filter(g => g.competitionId === spec.id && g.competitionPhase === link.source)
        .sort((a, b) => a.gid - b.gid);
      if (sourceGames.length === 0) continue;
      const sourceAllPlayed = sourceGames.every(g => g.played);
      const childGames = schedule.filter(g => g.competitionId === spec.id && g.competitionPhase === link.child);
      const childHasUnplayed = childGames.some(g => !g.played);
      // saves that hardcoded a Final at init).
      if (childHasUnplayed && !sourceAllPlayed) {
        schedule = schedule.filter(g => !(g.competitionId === spec.id && g.competitionPhase === link.child && !g.played));
        continue;
      }
      if (!sourceAllPlayed) continue;
      // Skip when the round already exists (either fully played or just-written this tick).
      if (childGames.length > 0) continue;
      const childRound = spec.playoffFormat?.rounds.find(r => link.childRoundAliases.includes(r.phase));
      const childStartIso = childRound ? roundStartDate(season, childRound) : null;
      if (childStartIso && today < new Date(childStartIso)) continue;
      const winners: number[] = [];
      for (const g of sourceGames) {
        const box = state.boxScores.find(b =>
          b.competitionId === spec.id &&
          b.competitionPhase === link.source &&
          ((b.homeTeamId === g.homeTid && b.awayTeamId === g.awayTid) ||
            (b.homeTeamId === g.awayTid && b.awayTeamId === g.homeTid))
        );
        if (!box) { winners.length = 0; break; }
        winners.push(box.homeScore > box.awayScore ? box.homeTeamId : box.awayTeamId);
      }
      if (winners.length === 0) continue;
      const childDateIso = childStartIso ?? state.date;
      for (let i = 0; i + 1 < winners.length; i += 2) {
        schedule.push({
          gid: nextGid++,
          homeTid: winners[i],
          awayTid: winners[i + 1],
          homeScore: 0,
          awayScore: 0,
          played: false,
          date: new Date(childDateIso).toISOString(),
          competitionId: spec.id,
          competitionPhase: link.child,
          isPlayoff: true,
        } as Game);
      }
    }
  }
  return schedule.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.gid - b.gid);
}
export function resolveCompetitionSeason(
  spec: CompetitionSpec,
  boxScores: GameResult[],
  season: number,
  seedTids: number[],
): CompetitionSeasonResolution | null {
  const rows = new Map<number, Omit<CompetitionStanding, 'seed' | 'pointDiff'>>();
  seedTids.forEach(tid => rows.set(tid, { tid, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }));
  boxScores.filter(game => game.competitionId === spec.id && isRegularSeasonPhase(game.competitionPhase) && matchesBoxScoreSeason(game, season)).forEach(game => {
    const home = rows.get(game.homeTeamId) ?? { tid: game.homeTeamId, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
    const away = rows.get(game.awayTeamId) ?? { tid: game.awayTeamId, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
    const homeWon = game.homeScore > game.awayScore;
    home.wins += homeWon ? 1 : 0;
    home.losses += homeWon ? 0 : 1;
    home.pointsFor += game.homeScore;
    home.pointsAgainst += game.awayScore;
    away.wins += homeWon ? 0 : 1;
    away.losses += homeWon ? 1 : 0;
    away.pointsFor += game.awayScore;
    away.pointsAgainst += game.homeScore;
    rows.set(home.tid, home);
    rows.set(away.tid, away);
  });
  const standings = rankStandings(rows);
  if (standings.length < 2) return null;
  const projected = resolveBracket(standings, spec);
  const qfBest = getQuarterfinalBestOf(spec);
  const sfBest = spec.playoffFormat?.finalFormat === 'final-four' ? 1 : (spec.playoffFormat?.sfBest ?? spec.playoffFormat?.finalBest ?? 1);
  const finalBest = spec.playoffFormat?.finalFormat === 'final-four' ? 1 : (spec.playoffFormat?.finalBest ?? 1);
  const qfResults = phaseMatchResults(projected.knockoutMatches.filter(match => match.round === 'quarterfinal'), spec.id, 'qf', boxScores, season);
  const sfResults = phaseMatchResults(projected.knockoutMatches.filter(match => match.round === 'semifinal'), spec.id, 'sf', boxScores, season);
  const finalResults = phaseMatchResults(projected.knockoutMatches.filter(match => match.round === 'final'), spec.id, 'final', boxScores, season);
  const playInComplete = spec.id !== 'euroleague' || phaseMatchResults(projected.playInMatches, spec.id, 'play-in', boxScores, season).length >= projected.playInMatches.length;
  const qfExpected = projected.knockoutMatches.filter(match => match.round === 'quarterfinal').length;
  const sfExpected = projected.knockoutMatches.filter(match => match.round === 'semifinal').length || 2;
  const qfComplete = qfExpected > 0 && qfResults.length >= qfExpected;
  const sfComplete = sfExpected > 0 && sfResults.length >= sfExpected;
  const validFinalPath = playInComplete && qfComplete && sfComplete;
  const requiresPlayedFinal = !!spec.playoffFormat;
  const actualChampion = validFinalPath ? (finalResults[0]?.winnerTid ?? (requiresPlayedFinal ? null : projected.championTid)) : null;
  const actualRunnerUp = validFinalPath ? (finalResults[0]?.loserTid ?? (requiresPlayedFinal ? null : projected.runnerUpTid)) : null;
  return {
    competitionId: spec.id,
    season,
    standings,
    ...projected,
    championTid: actualChampion,
    runnerUpTid: actualRunnerUp,
    semifinalistTids: sfComplete ? sfResults.map(result => result.loserTid) : [],
    quarterfinalistTids: qfComplete ? qfResults.map(result => result.loserTid) : [],
  };
}
