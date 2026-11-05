import type { NBAPlayer, NBATeam, NonNBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';

export interface InternationalShowcaseOpponent {
  team: NonNBATeam;
  strength: number;
  displayName: string;
  showcasePlayerIds?: string[];
}

export interface InternationalShowcaseOpponentOptions {
  excludedLeagues?: readonly string[];
}

export interface InternationalPreseasonGameInput {
  teamId: number;
  opponentId: number;
  opponentName?: string;
  showcasePlayerIds?: string[];
  date: string;
  city: string;
  country: string;
}

function playerStrength(player: NBAPlayer): number {
  return Number(player.overallRating ?? 0);
}

function rosterStrength(players: readonly NBAPlayer[]): number {
  const rotation = [...players].sort((left, right) => playerStrength(right) - playerStrength(left)).slice(0, 8);
  return rotation.length > 0
    ? rotation.reduce((sum, player) => sum + playerStrength(player), 0) / rotation.length
    : 0;
}

export function buildInternationalShowcaseOpponents(
  nonNBATeams: readonly NonNBATeam[],
  players: readonly NBAPlayer[],
  options: InternationalShowcaseOpponentOptions = {},
): InternationalShowcaseOpponent[] {
  const excludedLeagues = new Set(
    (options.excludedLeagues ?? []).map(league => league.trim().toLowerCase()),
  );
  const playersByTid = new Map<number, NBAPlayer[]>();
  for (const player of players) {
    if (player.tid < 0) continue;
    const bucket = playersByTid.get(player.tid) ?? [];
    bucket.push(player);
    playersByTid.set(player.tid, bucket);
  }

  const teamsByLeague = new Map<string, NonNBATeam[]>();
  for (const team of nonNBATeams) {
    const league = String(team.league ?? '').trim();
    if (!league || excludedLeagues.has(league.toLowerCase())) continue;
    const bucket = teamsByLeague.get(league) ?? [];
    bucket.push(team);
    teamsByLeague.set(league, bucket);
  }

  const opponents: InternationalShowcaseOpponent[] = [];
  for (const [league, teams] of teamsByLeague) {
    const playableClubs = teams.flatMap(team => {
      const roster = playersByTid.get(team.tid) ?? [];
      return roster.length >= 8
        ? [{
            team,
            strength: rosterStrength(roster),
            displayName: getTeamFullName(team),
          }]
        : [];
    });
    if (playableClubs.length > 0) {
      opponents.push(...playableClubs);
      continue;
    }

    const leaguePlayers = teams
      .flatMap(team => playersByTid.get(team.tid) ?? [])
      .sort((left, right) => playerStrength(right) - playerStrength(left));
    if (leaguePlayers.length < 8) continue;
    const representative = [...teams].sort((left, right) => {
      const leftRoster = playersByTid.get(left.tid) ?? [];
      const rightRoster = playersByTid.get(right.tid) ?? [];
      return rightRoster.length - leftRoster.length
        || rosterStrength(rightRoster) - rosterStrength(leftRoster)
        || getTeamFullName(left).localeCompare(getTeamFullName(right));
    })[0];
    if (!representative) continue;
    opponents.push({
      team: representative,
      strength: rosterStrength(leaguePlayers),
      displayName: `${league} Select`,
      showcasePlayerIds: leaguePlayers.slice(0, 12).map(player => player.internalId),
    });
  }
  return opponents;
}

export function validateInternationalPreseasonGames(
  teams: readonly NBATeam[],
  nonNBATeams: readonly NonNBATeam[],
  players: readonly NBAPlayer[],
  games: readonly InternationalPreseasonGameInput[],
): InternationalPreseasonGameInput[] {
  if (games.length === 0 || games.length > 5) {
    throw new Error('International Preseason requires between one and five games.');
  }
  const activeTeams = new Map(teams.filter(team => team.id >= 0).map(team => [team.id, team]));
  const opponents = new Map(buildInternationalShowcaseOpponents(nonNBATeams, players, {
    excludedLeagues: ['WNBA'],
  }).map(opponent => [opponent.team.tid, opponent]));
  const usedTeams = new Set<number>();
  const usedOpponents = new Set<number>();
  return games.map(game => {
    if (!activeTeams.has(game.teamId) || usedTeams.has(game.teamId)) {
      throw new Error(`NBA team ${game.teamId} is not eligible for this International Preseason slate.`);
    }
    const opponent = opponents.get(game.opponentId);
    if (!opponent || usedOpponents.has(game.opponentId)) {
      throw new Error(`International opponent ${game.opponentId} is not eligible for this men's exhibition.`);
    }
    const date = new Date(game.date);
    if (!Number.isFinite(date.getTime())) throw new Error('International Preseason game date is invalid.');
    usedTeams.add(game.teamId);
    usedOpponents.add(game.opponentId);
    return {
      teamId: game.teamId,
      opponentId: opponent.team.tid,
      opponentName: opponent.displayName,
      showcasePlayerIds: opponent.showcasePlayerIds,
      date: date.toISOString().slice(0, 10),
      city: String(game.city || opponent.team.region || 'International City'),
      country: String(game.country || 'International'),
    };
  });
}
