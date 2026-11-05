import type { GameResult, LeagueStats, NBAGMStat, NBAPlayer } from '../../types';
import { mergeNormalizedPlayerAwards } from '../../utils/playerAwardNormalizer';
import { getAwardSettingActive } from '../awards/awardEraProgression';
import { calculateInternationalGroupStandings } from '../fiba/calculateGroupStandings';
import {
  internationalSimulatorRoster,
  internationalSimulatorTeam,
  simulateInternationalGame,
} from '../fiba/simulateInternationalGame';
import type {
  InternationalTournamentState,
  InternationalTournamentTeam,
} from '../fiba/types';
import { scheduleSummerLeagueFinal } from './schedule';
import type {
  SummerLeagueAwards,
  SummerLeagueStanding,
  SummerLeagueTournamentState,
} from './types';

interface PlayerTotals {
  playerId: string;
  teamId: string;
  gp: number;
  gs: number;
  min: number;
  fg: number;
  fga: number;
  tp: number;
  tpa: number;
  ft: number;
  fta: number;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  pm: number;
  gameScore: number;
}

function asInternationalTeam(team: SummerLeagueTournamentState['teams'][number]): InternationalTournamentTeam {
  return {
    id: team.id,
    country: team.name,
    abbrev: team.abbrev,
    imageUrl: team.logoUrl,
    sourceTid: team.sourceTid,
    seed: team.seed,
    strength: team.strength,
    players: team.players,
    reserves: team.reserves,
  };
}

export function summerLeagueSimulatorTeam(team: SummerLeagueTournamentState['teams'][number]) {
  return internationalSimulatorTeam(asInternationalTeam(team));
}

export function summerLeagueSimulatorRoster(
  team: SummerLeagueTournamentState['teams'][number],
  players: readonly NBAPlayer[],
  year: number,
) {
  return internationalSimulatorRoster(
    asInternationalTeam(team),
    new Map(players.map(player => [player.internalId, player])),
    year,
  );
}

function simulatorState(tournament: SummerLeagueTournamentState): InternationalTournamentState {
  const teams: InternationalTournamentTeam[] = tournament.teams.map(asInternationalTeam);
  return {
    version: 1,
    id: tournament.id,
    competitionId: tournament.competitionId,
    kind: 'olympics-men',
    year: tournament.year,
    playedYear: tournament.year,
    branchYear: tournament.branchYear,
    status: tournament.status === 'final' ? 'knockout' : 'group-stage',
    hostCountries: ['United States'],
    fieldMode: 'capped',
    teams,
    groups: [{ id: 'LV', stage: 'first-round', teamIds: teams.map(team => team.id) }],
    games: tournament.games,
    boxScores: tournament.boxScores,
    reviewed: tournament.reviewed,
  };
}

export function calculateSummerLeagueStandings(
  tournament: SummerLeagueTournamentState,
): SummerLeagueStanding[] {
  const rows = calculateInternationalGroupStandings(simulatorState(tournament)).LV ?? [];
  return rows.map(row => ({
    rank: row.rank,
    teamId: row.teamId,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    pointDifference: row.pointDifference,
  }));
}

function nextGameId(tournament: SummerLeagueTournamentState): number {
  return 980_000_000 + (tournament.year % 1000) * 1000 + tournament.boxScores.length;
}

function simulateNext(
  tournament: SummerLeagueTournamentState,
  players: readonly NBAPlayer[],
  playerApproval?: number,
): SummerLeagueTournamentState {
  const game = tournament.games
    .filter(entry => !entry.played)
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))[0];
  if (!game) return tournament;
  const simulated = simulateInternationalGame({
    tournament: simulatorState(tournament),
    game,
    gameId: nextGameId(tournament),
    savePlayers: players,
    playerApproval,
  });
  return {
    ...tournament,
    games: tournament.games.map(entry =>
      entry.id === simulated.tournamentGame.id ? simulated.tournamentGame : entry,
    ),
    boxScores: [...tournament.boxScores, {
      ...simulated.boxScore,
      competitionId: tournament.competitionId,
      competitionPhase: game.phase === 'group' ? 'preliminary' : 'final',
      excludeFromRecord: true,
    }],
  };
}

function totals(tournament: SummerLeagueTournamentState): Map<string, PlayerTotals> {
  const teamBySyntheticTid = new Map(tournament.teams.map(team => [900_000 + team.seed, team.id]));
  const rows = new Map<string, PlayerTotals>();
  for (const boxScore of tournament.boxScores) {
    for (const side of [
      { teamId: teamBySyntheticTid.get(boxScore.homeTeamId), stats: boxScore.homeStats },
      { teamId: teamBySyntheticTid.get(boxScore.awayTeamId), stats: boxScore.awayStats },
    ]) {
      if (!side.teamId) continue;
      for (const stat of side.stats) {
        const row = rows.get(stat.playerId) ?? {
          playerId: stat.playerId,
          teamId: side.teamId,
          gp: 0,
          gs: 0,
          min: 0,
          fg: 0,
          fga: 0,
          tp: 0,
          tpa: 0,
          ft: 0,
          fta: 0,
          orb: 0,
          drb: 0,
          trb: 0,
          ast: 0,
          stl: 0,
          blk: 0,
          tov: 0,
          pf: 0,
          pts: 0,
          pm: 0,
          gameScore: 0,
        };
        row.gp += 1;
        row.gs += stat.gs > 0 ? 1 : 0;
        row.min += stat.min;
        row.fg += stat.fgm;
        row.fga += stat.fga;
        row.tp += stat.threePm;
        row.tpa += stat.threePa;
        row.ft += stat.ftm;
        row.fta += stat.fta;
        row.orb += stat.orb;
        row.drb += stat.drb;
        row.trb += stat.reb;
        row.ast += stat.ast;
        row.stl += stat.stl;
        row.blk += stat.blk;
        row.tov += stat.tov;
        row.pf += stat.pf;
        row.pts += stat.pts;
        row.pm += stat.pm;
        row.gameScore += stat.gameScore;
        rows.set(stat.playerId, row);
      }
    }
  }
  return rows;
}

function performance(row: PlayerTotals): number {
  return row.gameScore / Math.max(1, row.gp);
}

function resultAwards(
  tournament: SummerLeagueTournamentState,
  championTeamId: string,
  finalBoxScore: GameResult,
): SummerLeagueAwards {
  const ranked = [...totals(tournament).values()]
    .sort((left, right) => performance(right) - performance(left) || right.min - left.min || left.playerId.localeCompare(right.playerId));
  const champion = tournament.teams.find(team => team.id === championTeamId);
  const championSyntheticTid = champion ? 900_000 + champion.seed : -1;
  const finalStats = finalBoxScore.homeTeamId === championSyntheticTid
    ? finalBoxScore.homeStats
    : finalBoxScore.awayStats;
  const championshipMvp = [...finalStats].sort((left, right) =>
    right.gameScore - left.gameScore || right.pts - left.pts || left.playerId.localeCompare(right.playerId),
  )[0];
  return {
    championshipMvpPlayerId: championshipMvp?.playerId,
    mvpPlayerId: ranked[0]?.playerId,
    firstTeamPlayerIds: ranked.slice(0, 5).map(row => row.playerId),
    secondTeamPlayerIds: ranked.slice(5, 10).map(row => row.playerId),
  };
}

export function simulateRemainingSummerLeague(
  tournament: SummerLeagueTournamentState,
  players: readonly NBAPlayer[],
  playerApproval?: number,
): SummerLeagueTournamentState {
  if (['complete', 'reviewed'].includes(tournament.status) || !tournament.userRosterFinalized) return tournament;
  let next = tournament;
  for (let step = 0; step < 128 && next.games.some(game => !game.played); step += 1) {
    next = simulateNext(next, players, playerApproval);
  }
  if (!next.games.some(game => game.phase === 'final')) {
    const standings = calculateSummerLeagueStandings(next);
    if (standings.length < 2) return next;
    next = {
      ...next,
      status: 'final',
      games: [...next.games, scheduleSummerLeagueFinal(next, [standings[0].teamId, standings[1].teamId])],
    };
  }
  for (let step = 0; step < 2 && next.games.some(game => game.phase === 'final' && !game.played); step += 1) {
    next = simulateNext(next, players, playerApproval);
  }
  const final = next.games.find(game => game.phase === 'final' && game.played);
  const finalBoxScore = final?.gameId == null
    ? undefined
    : next.boxScores.find(boxScore => boxScore.gameId === final.gameId);
  if (!final?.winnerTeamId || !finalBoxScore) return next;
  const runnerUpTeamId = final.winnerTeamId === final.homeTeamId ? final.awayTeamId : final.homeTeamId;
  const finalScore = final.winnerTeamId === final.homeTeamId
    ? `${final.homeScore}-${final.awayScore}`
    : `${final.awayScore}-${final.homeScore}`;
  const completed = { ...next, status: 'complete' as const };
  return {
    ...completed,
    result: {
      championTeamId: final.winnerTeamId,
      runnerUpTeamId,
      finalScore,
      awards: resultAwards(completed, final.winnerTeamId, finalBoxScore),
    },
  };
}

function pct(made: number, attempts: number): number {
  return attempts > 0 ? made / attempts : 0;
}

function playerStat(tournament: SummerLeagueTournamentState, row: PlayerTotals): NBAGMStat {
  const team = tournament.teams.find(entry => entry.id === row.teamId);
  return {
    season: tournament.year,
    tid: team?.sourceTid ?? -1,
    playoffs: false,
    gp: row.gp,
    gs: row.gs,
    min: row.min,
    fg: row.fg,
    fga: row.fga,
    fgp: pct(row.fg, row.fga),
    tp: row.tp,
    tpa: row.tpa,
    tpp: pct(row.tp, row.tpa),
    ft: row.ft,
    fta: row.fta,
    ftp: pct(row.ft, row.fta),
    orb: row.orb,
    drb: row.drb,
    trb: row.trb,
    ast: row.ast,
    stl: row.stl,
    blk: row.blk,
    tov: row.tov,
    pf: row.pf,
    pts: row.pts,
    per: performance(row),
    pm: row.pm,
    competitionId: tournament.competitionId,
    competitionPhase: 'tournament',
  };
}

export function applySummerLeaguePlayerResults(
  players: readonly NBAPlayer[],
  tournament: SummerLeagueTournamentState,
  leagueStats?: Partial<LeagueStats>,
): NBAPlayer[] {
  if (!tournament.result || !['complete', 'reviewed'].includes(tournament.status)) return [...players];
  const playerTotals = totals(tournament);
  const champion = tournament.teams.find(team => team.id === tournament.result?.championTeamId);
  const championIds = new Set(champion?.players.flatMap(player => player.savePlayerId ? [player.savePlayerId] : []) ?? []);
  const awards = tournament.result.awards;
  const enabled = (awardId: string) =>
    !leagueStats || getAwardSettingActive(leagueStats, awardId, tournament.year);
  return players.map(player => {
    const row = playerTotals.get(player.internalId);
    const incomingAwards: Array<{ season: number; type: string; competitionId: string; source: string }> = [];
    const add = (type: string) => incomingAwards.push({
      season: tournament.year,
      type,
      competitionId: tournament.competitionId,
      source: tournament.title,
    });
    if (enabled('summer-league-champion') && championIds.has(player.internalId)) add('NBA Summer League Champion');
    if (enabled('summer-league-championship-mvp') && awards.championshipMvpPlayerId === player.internalId) add('NBA Summer League Championship MVP');
    if (enabled('summer-league-mvp') && awards.mvpPlayerId === player.internalId) add('NBA Summer League MVP');
    if (enabled('summer-league-first-team') && awards.firstTeamPlayerIds.includes(player.internalId)) add('NBA Summer League First Team');
    if (enabled('summer-league-second-team') && awards.secondTeamPlayerIds.includes(player.internalId)) add('NBA Summer League Second Team');
    if (!row && incomingAwards.length === 0) return player;
    const stats = [...(player.stats ?? [])];
    if (row) {
      const incoming = playerStat(tournament, row);
      const index = stats.findIndex(stat =>
        stat.season === tournament.year && stat.competitionId === tournament.competitionId,
      );
      if (index >= 0) stats[index] = incoming;
      else stats.push(incoming);
    }
    return {
      ...player,
      stats,
      awards: mergeNormalizedPlayerAwards(player.awards, incomingAwards),
    };
  });
}

export function reviewSummerLeagueTournament(
  tournament: SummerLeagueTournamentState,
): SummerLeagueTournamentState {
  return tournament.status === 'complete'
    ? { ...tournament, status: 'reviewed', reviewed: true }
    : tournament;
}
