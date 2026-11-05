import { readJsonResponse } from '../utils/jsonResponse';
import type {
  FibaHistoricalRoster,
  FibaRosterDiagnostics,
  FibaSourceAward,
  FibaSourcePlayer,
  FibaSourceRating,
  FibaSourceStat,
  FibaSourceTeam,
  LoadedFibaRoster,
} from './types';

let rosterPromise: Promise<LoadedFibaRoster> | undefined;
const rosterSourceUrl = `${import.meta.env?.BASE_URL ?? '/'}data/fiba/fiba-historical-roster.json`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTeam(value: unknown): FibaSourceTeam | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.tid !== 'number' || typeof value.region !== 'string') return undefined;
  if (typeof value.name !== 'string' || typeof value.abbrev !== 'string') return undefined;
  return { ...value } as FibaSourceTeam;
}

function readPlayer(value: unknown): {
  player?: FibaSourcePlayer;
  invalidRatings: number;
  invalidStats: number;
  invalidAwards: number;
} {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.tid !== 'number') {
    return { invalidRatings: 0, invalidStats: 0, invalidAwards: 0 };
  }

  const sourceRatings = Array.isArray(value.ratings) ? value.ratings : [];
  const sourceStats = Array.isArray(value.stats) ? value.stats : [];
  const sourceAwards = Array.isArray(value.awards) ? value.awards : [];
  const ratings = sourceRatings.filter(isRecord) as FibaSourceRating[];
  const stats = sourceStats.filter(isRecord) as FibaSourceStat[];
  const awards = sourceAwards.filter((award): award is FibaSourceAward =>
    isRecord(award)
    && typeof award.season === 'number'
    && Number.isFinite(award.season)
    && typeof award.type === 'string'
    && award.type.trim().length > 0,
  );

  return {
    player: { ...value, ratings, stats, awards } as FibaSourcePlayer,
    invalidRatings: sourceRatings.length - ratings.length,
    invalidStats: sourceStats.length - stats.length,
    invalidAwards: sourceAwards.length - awards.length,
  };
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseRoster(value: unknown): LoadedFibaRoster {
  if (!isRecord(value) || !Array.isArray(value.teams) || !Array.isArray(value.players)) {
    throw new Error('The FIBA historical roster has an invalid top-level structure.');
  }

  const teams = value.teams.map(readTeam).filter((team): team is FibaSourceTeam => !!team);
  const parsedPlayers = value.players.map(readPlayer);
  const players = parsedPlayers.flatMap(result => result.player ? [result.player] : []);
  const teamIds = new Set(teams.map(team => team.tid));
  const ratingSeasons = players.flatMap(player =>
    player.ratings.map(rating => rating.season).filter((season): season is number => typeof season === 'number'),
  );

  const roster: FibaHistoricalRoster = {
    version: readNumber(value.version),
    startingSeason: readNumber(value.startingSeason),
    name: typeof value.name === 'string' ? value.name : 'FIBA National Team History',
    confs: Array.isArray(value.confs) ? value.confs : [],
    divs: Array.isArray(value.divs) ? value.divs : [],
    teams,
    players,
    gameAttributes: Array.isArray(value.gameAttributes) ? value.gameAttributes : [],
  };

  const diagnostics: FibaRosterDiagnostics = {
    sourceTeamRows: value.teams.length,
    validTeams: teams.length,
    invalidTeams: value.teams.length - teams.length,
    sourcePlayerRows: value.players.length,
    validPlayers: players.length,
    invalidPlayers: value.players.length - players.length,
    ratingRows: players.reduce((total, player) => total + player.ratings.length, 0),
    invalidRatingRows: parsedPlayers.reduce((total, result) => total + result.invalidRatings, 0),
    statRows: players.reduce((total, player) => total + player.stats.length, 0),
    invalidStatRows: parsedPlayers.reduce((total, result) => total + result.invalidStats, 0),
    awardRows: players.reduce((total, player) => total + player.awards.length, 0),
    invalidAwardRows: parsedPlayers.reduce((total, result) => total + result.invalidAwards, 0),
    playersWithoutRatings: players.filter(player => player.ratings.length === 0).length,
    playersWithoutStats: players.filter(player => player.stats.length === 0).length,
    playersWithoutJersey: players.filter(player => !String(player.jerseyNumber ?? '').trim()).length,
    playersWithUnknownTeam: players.filter(player => !teamIds.has(player.tid)).length,
    ratingSeasonStart: ratingSeasons.length > 0 ? Math.min(...ratingSeasons) : undefined,
    ratingSeasonEnd: ratingSeasons.length > 0 ? Math.max(...ratingSeasons) : undefined,
    countries: new Set(teams.map(team => team.region)).size,
  };

  return { roster, diagnostics };
}

async function fetchRoster(): Promise<LoadedFibaRoster> {
  const response = await fetch(rosterSourceUrl);
  return parseRoster(await readJsonResponse<unknown>(response, 'FIBA historical roster'));
}

function emptyRoster(): LoadedFibaRoster {
  return {
    roster: {
      version: 0,
      startingSeason: 0,
      name: 'FIBA National Team History',
      confs: [],
      divs: [],
      teams: [],
      players: [],
      gameAttributes: [],
    },
    diagnostics: {
      sourceTeamRows: 0,
      validTeams: 0,
      invalidTeams: 0,
      sourcePlayerRows: 0,
      validPlayers: 0,
      invalidPlayers: 0,
      ratingRows: 0,
      invalidRatingRows: 0,
      statRows: 0,
      invalidStatRows: 0,
      awardRows: 0,
      invalidAwardRows: 0,
      playersWithoutRatings: 0,
      playersWithoutStats: 0,
      playersWithoutJersey: 0,
      playersWithUnknownTeam: 0,
      countries: 0,
    },
  };
}

export function loadFibaHistoricalRoster(): Promise<LoadedFibaRoster> {
  rosterPromise ??= fetchRoster().catch(error => {
    console.warn('[FIBA] Historical roster unavailable; continuing without archive enrichment.', error);
    return emptyRoster();
  });
  return rosterPromise;
}
