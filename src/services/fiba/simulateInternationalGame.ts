import type { NBAPlayer, NBATeam } from '../../types';
import { GameSimulator } from '../simulation/GameSimulator';
import { simulateGameViaAdapter, type FastSimRunner } from '../simulation/SimulatorAdapter';
import { KNOBS_FIBA_QUARTERS } from '../simulation/SimulatorKnobs';
import '../simulation/realistic';
import type {
  FibaSelectedPlayer,
  InternationalTournamentGame,
  InternationalTournamentState,
  InternationalTournamentTeam,
  SimulatedInternationalGame,
} from './types';

export interface SimulateInternationalGameOptions {
  tournament: InternationalTournamentState;
  game: InternationalTournamentGame;
  gameId: number;
  savePlayers: readonly NBAPlayer[];
  playerApproval?: number;
  riggedForTid?: number;
}

function syntheticTid(seed: number): number {
  return 900_000 + seed;
}

export function internationalSimulatorTeam(team: InternationalTournamentTeam): NBATeam {
  return {
    id: syntheticTid(team.seed),
    name: `${team.country} National Team`,
    region: team.country,
    abbrev: team.abbrev,
    conference: 'International',
    wins: 0,
    losses: 0,
    strength: team.strength,
    logoUrl: team.imageUrl,
  };
}

function archivePlayer(
  selected: FibaSelectedPlayer,
  tid: number,
  year: number,
): NBAPlayer {
  return {
    internalId: selected.id,
    tid,
    name: selected.name,
    overallRating: selected.strength,
    potential: selected.strength,
    ratings: selected.rating ? [{ ...selected.rating }] : [],
    imgURL: selected.imageUrl,
    pos: selected.position,
    age: selected.birthYear ? year - selected.birthYear : undefined,
    born: selected.birthYear ? { year: selected.birthYear, loc: selected.country } : undefined,
    jerseyNumber: selected.jerseyNumber,
    injury: { type: 'Healthy', gamesRemaining: 0 },
    status: 'Active',
  };
}

export function internationalSimulatorRoster(
  team: InternationalTournamentTeam,
  savePlayersById: Map<string, NBAPlayer>,
  year: number,
): NBAPlayer[] {
  const tid = syntheticTid(team.seed);
  return team.players.map(selected => {
    const savePlayer = selected.savePlayerId ? savePlayersById.get(selected.savePlayerId) : undefined;
    if (!savePlayer) return archivePlayer(selected, tid, year);
    const injuryGames = Number(savePlayer.injury?.gamesRemaining ?? 0);
    return {
      ...savePlayer,
      tid,
      imgURL: selected.imageUrl ?? savePlayer.imgURL,
      ratings: savePlayer.ratings.map(rating => ({ ...rating })),
      stats: savePlayer.stats?.map(stat => ({ ...stat })),
      injury: {
        ...savePlayer.injury,
        type: savePlayer.injury?.type || 'Healthy',
        gamesRemaining: Number.isFinite(injuryGames) ? Math.max(0, injuryGames) : 0,
      },
      jerseyNumber: selected.jerseyNumber,
    };
  });
}

export function resolveFibaSimulationKnobs(year: number, isPlayoffs: boolean) {
  const eraPace = year < 2000
    ? 70.64375 / 83.346875
    : year < 2020
      ? 75.525 / 83.346875
      : 1;
  const eraThreePointVolume = year < 2000
    ? 17.78 / 27.75
    : year < 2020
      ? 21.97 / 27.75
      : 1;
  const eraFreeThrowRate = year < 2000 ? 1.2 : year < 2020 ? 1.13 : 1.065;
  const realisticFreeThrowCalibration = year < 2000 ? 1.36 : year < 2020 ? 1.415 : 1.17;
  const realisticEfficiencyCalibration = year < 2000 ? 0.9 : year < 2020 ? 0.91 : 0.94;
  return {
    ...KNOBS_FIBA_QUARTERS,
    isPlayoffs,
    strengthCorrectionWithOverrideRosters: true,
    paceMultiplier: KNOBS_FIBA_QUARTERS.paceMultiplier * eraPace,
    fastScorePaceMultiplier: (KNOBS_FIBA_QUARTERS.fastScorePaceMultiplier ?? 1) * eraPace,
    threePointRateMult: KNOBS_FIBA_QUARTERS.threePointRateMult * eraThreePointVolume,
    ftRateMult: eraFreeThrowRate,
    engineCalibration: { realistic: {
      efficiencyMultiplier: realisticEfficiencyCalibration,
      ftRateMult: realisticFreeThrowCalibration,
    } },
  };
}

const runFast: FastSimRunner = args => GameSimulator.simulateGame(
  args.homeTeam,
  args.awayTeam,
  args.players,
  args.gameId,
  args.date,
  args.playerApproval,
  args.homeOverridePlayers,
  args.awayOverridePlayers,
  args.isAllStar,
  args.isRisingStars,
  args.isEliminationGame,
  args.riggedForTid,
  args.homeKnobs,
  args.awayKnobs,
  args.injuryFrequencyFactor,
  args.season,
);

export function simulateInternationalGame(
  options: SimulateInternationalGameOptions,
): SimulatedInternationalGame {
  const homeTournamentTeam = options.tournament.teams.find(team => team.id === options.game.homeTeamId);
  const awayTournamentTeam = options.tournament.teams.find(team => team.id === options.game.awayTeamId);
  if (!homeTournamentTeam || !awayTournamentTeam) {
    throw new Error('The international game references a team outside its tournament field.');
  }

  const savePlayersById = new Map(options.savePlayers.map(player => [player.internalId, player]));
  const homeTeam = internationalSimulatorTeam(homeTournamentTeam);
  const awayTeam = internationalSimulatorTeam(awayTournamentTeam);
  const playedYear = options.tournament.playedYear ?? options.tournament.year;
  const homeRoster = internationalSimulatorRoster(homeTournamentTeam, savePlayersById, playedYear);
  const awayRoster = internationalSimulatorRoster(awayTournamentTeam, savePlayersById, playedYear);
  const eliminationGame = !['group', 'classification'].includes(options.game.phase);
  const knobs = resolveFibaSimulationKnobs(playedYear, eliminationGame);
  const boxScore = simulateGameViaAdapter({
    homeTeam,
    awayTeam,
    players: [...homeRoster, ...awayRoster],
    gameId: options.gameId,
    date: options.game.date,
    season: playedYear,
    playerApproval: options.playerApproval,
    homeOverridePlayers: homeRoster,
    awayOverridePlayers: awayRoster,
    isEliminationGame: eliminationGame,
    riggedForTid: options.riggedForTid,
    homeKnobs: knobs,
    awayKnobs: knobs,
  }, runFast);
  const winnerTeamId = boxScore.winnerId === homeTeam.id
    ? homeTournamentTeam.id
    : awayTournamentTeam.id;

  return {
    tournamentGame: {
      ...options.game,
      gameId: options.gameId,
      played: true,
      homeScore: boxScore.homeScore,
      awayScore: boxScore.awayScore,
      winnerTeamId,
    },
    boxScore: {
      ...boxScore,
      season: playedYear,
      competitionId: options.tournament.competitionId,
      competitionPhase: options.game.phase,
      homeTeamName: homeTournamentTeam.country,
      awayTeamName: awayTournamentTeam.country,
      homeTeamAbbrev: homeTournamentTeam.abbrev,
      awayTeamAbbrev: awayTournamentTeam.abbrev,
      excludeFromRecord: true,
    },
  };
}
