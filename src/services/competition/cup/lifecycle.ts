import type { Game, GameResult, NBAPlayer } from '../../../types';
import { applyGenericCupAwardsToPlayers, computeGenericCupAwards } from './awards';
import { buildCupOpeningRound } from './format';
import { cupRoundDate } from './schedule';
import { qualifyCupTeams, rankCupGroups } from './standings';
import { setCupCompetitionState } from './state';
import type {
  CupBracketMatch,
  CupCompetitionState,
  CupCompetitionStateMap,
  CupResult,
} from './types';

type SimulationResult = { gameId: number };

const isCupGame = (game: Game, cup: CupCompetitionState): boolean => (
  game.isCupGame === true
  && game.cupLeagueId === cup.leagueId
  && game.cupCompetitionId === cup.competitionId
);

const resultRows = (cup: CupCompetitionState, schedule: Game[]): CupResult[] => schedule
  .filter(game => isCupGame(game, cup) && game.cupRoundId === 'group' && game.played)
  .map(game => ({
    leagueId: cup.leagueId,
    competitionId: cup.competitionId,
    season: cup.season,
    homeTid: game.homeTid,
    awayTid: game.awayTid,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    played: true,
    date: game.date,
  }));

const expectedGroupGames = (cup: CupCompetitionState): number => cup.groups.reduce((total, assignment) => {
  const group = cup.format.groups.find(candidate => candidate.id === assignment.groupId);
  const gamesPerTeam = group?.gamesPerTeam ?? cup.format.groupStage.gamesPerTeam;
  return total + Math.floor((assignment.tids.length * gamesPerTeam) / 2);
}, 0);

const appendRoundGames = (
  cup: CupCompetitionState,
  bracket: CupBracketMatch[],
  roundId: string,
  schedule: Game[],
): Game[] => {
  const round = cup.format.knockoutRounds.find(candidate => candidate.id === roundId);
  if (!round) return schedule;
  let gid = Math.max(0, ...schedule.map(game => game.gid)) + 1;
  const additions = bracket
    .filter(match => match.roundId === roundId)
    .filter(match => !schedule.some(game => isCupGame(game, cup)
      && game.cupRoundId === roundId
      && ((game.homeTid === match.homeTid && game.awayTid === match.awayTid)
        || (game.homeTid === match.awayTid && game.awayTid === match.homeTid))))
    .map(match => ({
      gid: gid++,
      homeTid: match.homeTid,
      awayTid: match.awayTid,
      homeScore: 0,
      awayScore: 0,
      played: false,
      date: cupRoundDate(cup, round.date),
      isCupGame: true,
      cupLeagueId: cup.leagueId,
      cupCompetitionId: cup.competitionId,
      cupRoundId: roundId,
      excludeFromRecord: true,
    } satisfies Game));
  return [...schedule, ...additions]
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime() || left.gid - right.gid);
};

const applyPlayedKnockoutGames = (cup: CupCompetitionState, schedule: Game[]): CupCompetitionState => ({
  ...cup,
  bracket: cup.bracket.map(match => {
    if (match.winnerTid != null) return match;
    const game = schedule.find(candidate => isCupGame(candidate, cup)
      && candidate.cupRoundId === match.roundId
      && candidate.played
      && ((candidate.homeTid === match.homeTid && candidate.awayTid === match.awayTid)
        || (candidate.homeTid === match.awayTid && candidate.awayTid === match.homeTid)));
    if (!game || game.homeScore === game.awayScore) return match;
    return { ...match, winnerTid: game.homeScore > game.awayScore ? game.homeTid : game.awayTid };
  }),
});

const advanceCompletedRound = (cup: CupCompetitionState): CupCompetitionState => {
  const activeRoundIndex = cup.format.knockoutRounds.findIndex(round => {
    const matches = cup.bracket.filter(match => match.roundId === round.id);
    return matches.length > 0 && matches.some(match => match.winnerTid == null);
  });
  if (activeRoundIndex >= 0) return cup;
  const completedRoundIndex = [...cup.format.knockoutRounds]
    .map((round, index) => ({ round, index, matches: cup.bracket.filter(match => match.roundId === round.id) }))
    .filter(entry => entry.matches.length > 0 && entry.matches.every(match => match.winnerTid != null))
    .at(-1)?.index;
  if (completedRoundIndex == null) return cup;
  const currentRound = cup.format.knockoutRounds[completedRoundIndex];
  const currentMatches = cup.bracket.filter(match => match.roundId === currentRound.id);
  const nextRound = cup.format.knockoutRounds[completedRoundIndex + 1];
  if (!nextRound) {
    const final = currentMatches[0];
    const championTid = final?.winnerTid ?? null;
    const runnerUpTid = final && championTid != null
      ? (final.homeTid === championTid ? final.awayTid : final.homeTid)
      : null;
    if (cup.status === 'complete') return cup;
    return {
      ...cup,
      status: 'complete',
      history: [...cup.history, {
        leagueId: cup.leagueId,
        competitionId: cup.competitionId,
        season: cup.season,
        championTid,
        runnerUpTid,
        awards: cup.awards,
        prizePool: cup.prizePool,
      }],
    };
  }
  if (cup.bracket.some(match => match.roundId === nextRound.id)) return cup;
  const winners = currentMatches.map(match => ({
    tid: match.winnerTid!,
    seed: Math.min(match.homeSeed, match.awaySeed),
  })).sort((left, right) => left.seed - right.seed);
  const nextMatches = Array.from({ length: Math.floor(winners.length / 2) }, (_, index): CupBracketMatch => {
    const home = winners[index];
    const away = winners[winners.length - 1 - index];
    return {
      roundId: nextRound.id,
      slot: index + 1,
      homeSeed: home.seed,
      awaySeed: away.seed,
      homeTid: home.tid,
      awayTid: away.tid,
    };
  });
  return { ...cup, bracket: [...cup.bracket, ...nextMatches] };
};

export function applyGenericCupSimulationResults(args: {
  states?: CupCompetitionStateMap;
  schedule: Game[];
  results: SimulationResult[];
  boxScores?: GameResult[];
  players?: NBAPlayer[];
}): { states?: CupCompetitionStateMap; schedule: Game[]; players?: NBAPlayer[] } {
  if (!args.states || args.results.length === 0) {
    return { states: args.states, schedule: args.schedule, players: args.players };
  }
  const resultIds = new Set(args.results.map(result => result.gameId));
  let states = args.states;
  let schedule = args.schedule;
  let players = args.players;

  for (const cup of Object.values(states)) {
    if (!schedule.some(game => resultIds.has(game.gid) && isCupGame(game, cup))) continue;
    const groupResults = resultRows(cup, schedule);
    let next: CupCompetitionState = {
      ...cup,
      status: groupResults.length > 0 && cup.status === 'scheduled' ? 'group-stage' : cup.status,
      standings: rankCupGroups(cup.format, cup.groups, groupResults, cup.season),
    };
    const groupGames = schedule.filter(game => isCupGame(game, cup) && game.cupRoundId === 'group');
    if (next.bracket.length === 0
      && groupGames.length >= expectedGroupGames(next)
      && groupGames.every(game => game.played)) {
      const qualifiers = qualifyCupTeams(next.format, next.groups, groupResults, next.season);
      next = {
        ...next,
        status: 'knockout',
        qualifiers,
        bracket: buildCupOpeningRound(next.format, qualifiers),
      };
      schedule = appendRoundGames(next, next.bracket, next.format.knockoutRounds[0]?.id ?? '', schedule);
    }
    if (next.status === 'knockout') {
      next = advanceCompletedRound(applyPlayedKnockoutGames(next, schedule));
      if (next.status === 'complete') {
        const awards = computeGenericCupAwards(next, schedule, args.boxScores ?? []);
        if (awards !== next.awards) {
          const history = next.history.map((entry, index) => (
            index === next.history.length - 1 && entry.season === next.season
              ? { ...entry, awards }
              : entry
          ));
          next = { ...next, awards, history };
        }
        if (players) players = applyGenericCupAwardsToPlayers(next, players);
      }
      const pendingRound = next.format.knockoutRounds.find(round => (
        next.bracket.some(match => match.roundId === round.id && match.winnerTid == null)
      ));
      if (pendingRound) schedule = appendRoundGames(next, next.bracket, pendingRound.id, schedule);
    }
    states = setCupCompetitionState(states, next);
  }
  return { states, schedule, players };
}
