import type { SummerLeagueTeam, SummerLeagueTournamentState } from './types';

const STATUSES = new Set(['roster-selection', 'preliminary', 'final', 'complete', 'reviewed']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isTeam(value: unknown): value is SummerLeagueTeam {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.sourceTid === 'number'
    && typeof value.name === 'string'
    && typeof value.abbrev === 'string'
    && typeof value.seed === 'number'
    && typeof value.strength === 'number'
    && Array.isArray(value.players)
    && Array.isArray(value.reserves);
}

export function healSummerLeagueTournament(
  value: unknown,
): SummerLeagueTournamentState | undefined {
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.id !== 'string'
    || value.competitionId !== 'nba-summer-league'
    || typeof value.year !== 'number'
    || typeof value.branchYear !== 'number'
    || typeof value.title !== 'string'
    || !STATUSES.has(String(value.status))
    || !Array.isArray(value.teams)
    || !Array.isArray(value.games)) {
    return undefined;
  }
  const status = value.status as SummerLeagueTournamentState['status'];
  const draft = isRecord(value.rosterReviewDraft) ? value.rosterReviewDraft : undefined;
  const editingPlayerId = draft?.editingPlayerId;
  const safeEditingPlayerId = typeof editingPlayerId === 'string' ? editingPlayerId : null;
  return {
    ...(value as unknown as SummerLeagueTournamentState),
    version: 1,
    competitionId: 'nba-summer-league',
    status,
    teams: value.teams.filter(isTeam).map(team => ({
      ...team,
      availablePlayerIds: Array.isArray(team.availablePlayerIds)
        ? team.availablePlayerIds.filter((id): id is string => typeof id === 'string')
        : [...team.players, ...team.reserves].flatMap(player => player.savePlayerId ? [player.savePlayerId] : []),
    })),
    games: value.games.filter(game => isRecord(game) && typeof game.id === 'string' && typeof game.date === 'string') as SummerLeagueTournamentState['games'],
    boxScores: Array.isArray(value.boxScores) ? value.boxScores : [],
    userRosterFinalized: value.userRosterFinalized === true,
    reviewed: value.reviewed === true || status === 'reviewed',
    reviewEntryVersion: Number.isFinite(Number(value.reviewEntryVersion))
      ? Math.max(0, Math.floor(Number(value.reviewEntryVersion)))
      : undefined,
    rosterReviewDraft: draft && Array.isArray(draft.selectedPlayerIds)
      ? {
          selectedPlayerIds: draft.selectedPlayerIds.filter((id): id is string => typeof id === 'string'),
          searchQuery: typeof draft.searchQuery === 'string' ? draft.searchQuery : '',
          editingPlayerId: safeEditingPlayerId,
        }
      : undefined,
  };
}

export function healSummerLeagueHistory(value: unknown): SummerLeagueTournamentState[] {
  if (!Array.isArray(value)) return [];
  return [...new Map(value
    .map(healSummerLeagueTournament)
    .filter((row): row is SummerLeagueTournamentState => !!row)
    .map(row => [row.id, row])).values()];
}
