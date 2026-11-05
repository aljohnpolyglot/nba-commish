import type {
  InternationalTournamentGame,
  InternationalTournamentGroup,
  InternationalTournamentState,
  InternationalTournamentTeam,
} from './types';
import { getSourcedInternationalTournamentMetadata } from './tournamentWindows';

const KINDS = new Set(['world-cup', 'olympics-men', 'eurobasket']);
const STATUSES = new Set(['scheduled', 'rosters-ready', 'group-stage', 'knockout', 'complete', 'reviewed']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isTeam(value: unknown): value is InternationalTournamentTeam {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.country === 'string'
    && typeof value.abbrev === 'string'
    && typeof value.sourceTid === 'number'
    && typeof value.seed === 'number'
    && typeof value.strength === 'number'
    && Array.isArray(value.players)
    && Array.isArray(value.reserves);
}

function isGroup(value: unknown): value is InternationalTournamentGroup {
  return isRecord(value)
    && typeof value.id === 'string'
    && Array.isArray(value.teamIds)
    && value.teamIds.every(teamId => typeof teamId === 'string');
}

function isGame(value: unknown): value is InternationalTournamentGame {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.date === 'string'
    && typeof value.phase === 'string'
    && typeof value.homeTeamId === 'string'
    && typeof value.awayTeamId === 'string'
    && typeof value.played === 'boolean';
}

export function healInternationalTournamentState(value: unknown): InternationalTournamentState | undefined {
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.id !== 'string'
    || typeof value.competitionId !== 'string'
    || !KINDS.has(String(value.kind))
    || typeof value.year !== 'number'
    || typeof value.branchYear !== 'number'
    || !STATUSES.has(String(value.status))
    || !Array.isArray(value.teams)
    || !Array.isArray(value.groups)
    || !Array.isArray(value.games)) {
    return undefined;
  }

  const kind = value.kind as InternationalTournamentState['kind'];
  const status = value.status as InternationalTournamentState['status'];
  const sourced = getSourcedInternationalTournamentMetadata(kind, value.year);
  const savedHosts = Array.isArray(value.hostCountries)
    ? value.hostCountries.filter((country): country is string => typeof country === 'string')
    : [];
  return {
    ...(value as unknown as InternationalTournamentState),
    version: 1,
    kind,
    status,
    playedYear: sourced?.playedYear
      ?? (typeof value.playedYear === 'number' ? value.playedYear : value.year),
    hostCountries: sourced?.hosts.length ? sourced.hosts : savedHosts,
    fieldMode: value.fieldMode === 'capped' || value.fieldMode === 'eligible-countries'
      ? value.fieldMode
      : kind === 'world-cup' ? 'eligible-countries' : 'capped',
    teams: value.teams.filter(isTeam),
    groups: value.groups.filter(isGroup),
    games: value.games.filter(isGame),
    boxScores: Array.isArray(value.boxScores) ? value.boxScores : [],
    reviewed: value.reviewed === true || status === 'reviewed',
    reviewEntryVersion: Number.isFinite(Number(value.reviewEntryVersion))
      ? Math.max(0, Math.floor(Number(value.reviewEntryVersion)))
      : undefined,
  };
}

export function healInternationalTournamentHistory(value: unknown): InternationalTournamentState[] {
  if (!Array.isArray(value)) return [];
  const tournaments = value
    .map(healInternationalTournamentState)
    .filter((tournament): tournament is InternationalTournamentState => !!tournament);
  return [...new Map(tournaments.map(tournament => [tournament.id, tournament])).values()];
}
