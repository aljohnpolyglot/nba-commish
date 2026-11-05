import type {
  InternationalGroupStanding,
  InternationalTournamentGame,
  InternationalTournamentGroup,
  InternationalTournamentState,
} from './types';

type MutableStanding = Omit<InternationalGroupStanding, 'rank'> & { rank?: number };

function playedGroupGames(
  tournament: InternationalTournamentState,
  group: InternationalTournamentGroup,
): InternationalTournamentGame[] {
  const teamIds = new Set(group.teamIds);
  return tournament.games.filter(game =>
    (group.stage === 'classification'
      ? game.phase === 'classification' || game.phase === 'group'
      : game.phase === 'group')
    && game.played
    && typeof game.homeScore === 'number'
    && typeof game.awayScore === 'number'
    && teamIds.has(game.homeTeamId)
    && teamIds.has(game.awayTeamId),
  );
}

function buildRows(
  teamIds: readonly string[],
  games: readonly InternationalTournamentGame[],
): MutableStanding[] {
  const rows = new Map(teamIds.map(teamId => [teamId, {
    teamId,
    played: 0,
    wins: 0,
    losses: 0,
    tablePoints: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDifference: 0,
  }]));

  for (const game of games) {
    const home = rows.get(game.homeTeamId);
    const away = rows.get(game.awayTeamId);
    if (!home || !away || game.homeScore == null || game.awayScore == null) continue;
    home.played += 1;
    away.played += 1;
    home.pointsFor += game.homeScore;
    home.pointsAgainst += game.awayScore;
    away.pointsFor += game.awayScore;
    away.pointsAgainst += game.homeScore;
    if (
      game.winnerTeamId === game.homeTeamId
      || (game.winnerTeamId == null && game.homeScore > game.awayScore)
    ) {
      home.wins += 1;
      away.losses += 1;
      home.tablePoints += 2;
      away.tablePoints += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
      away.tablePoints += 2;
      home.tablePoints += 1;
    }
  }

  for (const row of rows.values()) row.pointDifference = row.pointsFor - row.pointsAgainst;
  return [...rows.values()];
}

function seedOf(tournament: InternationalTournamentState, teamId: string): number {
  return tournament.teams.find(team => team.id === teamId)?.seed ?? Number.MAX_SAFE_INTEGER;
}

function rankRows(
  tournament: InternationalTournamentState,
  teamIds: readonly string[],
  games: readonly InternationalTournamentGame[],
): InternationalGroupStanding[] {
  const overall = buildRows(teamIds, games);
  const tiedByPoints = new Map<number, MutableStanding[]>();
  for (const row of overall) {
    const tied = tiedByPoints.get(row.tablePoints);
    if (tied) tied.push(row);
    else tiedByPoints.set(row.tablePoints, [row]);
  }

  const ordered = [...tiedByPoints.entries()]
    .sort(([left], [right]) => right - left)
    .flatMap(([, tied]) => {
      if (tied.length === 1) return tied;
      const tiedIds = new Set(tied.map(row => row.teamId));
      const headToHead = new Map(buildRows(
        tied.map(row => row.teamId),
        games.filter(game => tiedIds.has(game.homeTeamId) && tiedIds.has(game.awayTeamId)),
      ).map(row => [row.teamId, row]));
      return [...tied].sort((left, right) => {
        const leftHead = headToHead.get(left.teamId)!;
        const rightHead = headToHead.get(right.teamId)!;
        return rightHead.tablePoints - leftHead.tablePoints
          || rightHead.pointDifference - leftHead.pointDifference
          || rightHead.pointsFor - leftHead.pointsFor
          || right.pointDifference - left.pointDifference
          || right.pointsFor - left.pointsFor
          || seedOf(tournament, left.teamId) - seedOf(tournament, right.teamId);
      });
    });

  return ordered.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function calculateInternationalGroupStandings(
  tournament: InternationalTournamentState,
): Record<string, InternationalGroupStanding[]> {
  return Object.fromEntries(tournament.groups.map(group => {
    return [group.id, rankRows(tournament, group.teamIds, playedGroupGames(tournament, group))];
  }));
}
