import type { GameState, NBAPlayer } from '../../types';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { isOnRoster } from '../../utils/teamLookup';
import { normalizePositionLabel } from '../../utils/positionUtils';
import { materializeGeneratedEuroYouthRatings } from './prospectRatings';
import type { EuroScoutedProspect, EuroScoutingAssignment } from './types';

export type ScoutingPipelineStage = 'reported' | 'academy' | 'senior';

export interface ScoutingPipelineRecord {
  id: string;
  assignment: EuroScoutingAssignment;
  prospect: EuroScoutedProspect;
  currentPlayer: NBAPlayer;
  joinedAcademy: boolean;
  reachedSenior: boolean;
  statusLabel: string;
}

export interface AcademyPromotionResult {
  state: GameState;
  promotedIds: string[];
  blockedIds: string[];
  duplicateIds: string[];
}

export interface AcademyFreeAgencyResult {
  state: GameState;
  releasedIds: string[];
}

function playerKey(player: Pick<NBAPlayer, 'internalId'>): string {
  return String(player.internalId ?? '');
}

export function buildScoutingPipeline(state: GameState): ScoutingPipelineRecord[] {
  const academyPlayers = state.euroScouting?.academyPlayers ?? [];
  const seniorPlayers = state.players ?? [];
  const records: ScoutingPipelineRecord[] = [];
  for (const assignment of state.euroScouting?.assignments ?? []) {
    for (const prospect of assignment.prospects) {
      const id = playerKey(prospect);
      const academy = academyPlayers.find(player => playerKey(player) === id);
      const promoted = seniorPlayers.find(player => playerKey(player) === id && player.promotedFromAcademy);
      const joinedAcademy = assignment.assignedProspectIds.includes(prospect.internalId);
      const reachedSenior = !!promoted;
      const currentPlayer = promoted ?? academy ?? prospect;
      const statusLabel = promoted
        ? promoted.status === 'Retired'
          ? 'Retired'
          : promoted.tid === state.userTeamId
            ? 'Senior Team'
            : promoted.tid != null && promoted.tid >= 0
              ? 'With another club'
              : 'Free Agent'
        : academy
          ? 'Youth Academy'
          : joinedAcademy
            ? 'Left Academy'
            : 'Report only';
      records.push({ id: `${assignment.id}:${id}`, assignment, prospect, currentPlayer, joinedAcademy, reachedSenior, statusLabel });
    }
  }
  return records;
}

export function filterScoutingPipeline(records: ScoutingPipelineRecord[], stage: ScoutingPipelineStage): ScoutingPipelineRecord[] {
  if (stage === 'academy') return records.filter(record => record.joinedAcademy);
  if (stage === 'senior') return records.filter(record => record.reachedSenior);
  return records;
}

export function promoteEuroAcademyPlayers(state: GameState, requestedPlayerIds: Array<string | number>): AcademyPromotionResult {
  if (state.userTeamId == null || requestedPlayerIds.length === 0) {
    return { state, promotedIds: [], blockedIds: [], duplicateIds: [] };
  }

  const requestedIds = [...new Set(requestedPlayerIds.map(String).filter(Boolean))];
  const requestedSet = new Set(requestedIds);
  const academyPlayers = state.euroScouting?.academyPlayers ?? [];
  const academyById = new Map(academyPlayers.map(player => [playerKey(player), player]));
  const existingSeniorIds = new Set(state.players
    .filter(player => isOnRoster(player) || player.promotedFromAcademy)
    .map(playerKey)
    .filter(Boolean));
  const leakedAcademyIds = new Set(state.players
    .filter(player => player.euroAcademyPlayer && !player.promotedFromAcademy && !isOnRoster(player))
    .map(playerKey)
    .filter(Boolean));
  const removedAcademyIds = new Set<string>();
  const promotedPlayers: NBAPlayer[] = [];
  const promotedIds: string[] = [];
  const blockedIds: string[] = [];
  const duplicateIds: string[] = [];
  const teamSource = state.nonNBATeams.find(team => team.tid === state.userTeamId);
  const rosterLimit = getStandardRosterLimit(state.leagueStats);
  let rosterSize = state.players.filter(player => player.tid === state.userTeamId && isOnRoster(player)).length;

  for (const playerId of requestedIds) {
    const player = academyById.get(playerId);
    if (!player || !requestedSet.has(playerId)) continue;
    if (existingSeniorIds.has(playerId)) {
      blockedIds.push(playerId);
      duplicateIds.push(playerId);
      continue;
    }
    if (rosterSize >= rosterLimit) {
      blockedIds.push(playerId);
      continue;
    }

    const materialized = materializeGeneratedEuroYouthRatings(player);
    promotedPlayers.push({
      ...materialized,
      pos: normalizePositionLabel(materialized.pos, materialized.hgt),
      tid: state.userTeamId,
      status: (teamSource?.league ?? 'Euroleague') as NBAPlayer['status'],
      euroAcademyPlayer: undefined,
      promotedFromAcademy: true,
      contract: {
        amount: Number(player.contract?.amount ?? 0),
        exp: Math.max(Number(player.contract?.exp ?? 0), state.leagueStats.year + 2),
      },
      transactions: [
        ...(player.transactions ?? []),
        { season: state.leagueStats.year, tid: state.userTeamId, type: 'academy' },
      ],
    });
    promotedIds.push(playerId);
    removedAcademyIds.add(playerId);
    existingSeniorIds.add(playerId);
    rosterSize += 1;
  }

  if (promotedPlayers.length === 0 && removedAcademyIds.size === 0) {
    return { state, promotedIds, blockedIds, duplicateIds };
  }

  const historyEntries = promotedPlayers.map(player => ({
    text: `${player.name} was promoted from the youth academy to the senior team.`,
    date: state.date,
    type: 'Academy Promotion',
    tid: state.userTeamId!,
    league: String(teamSource?.league ?? 'Euroleague'),
    playerIds: [String(player.internalId)],
  }));

  return {
    state: {
      ...state,
      players: [...state.players.filter(player => !removedAcademyIds.has(playerKey(player)) || !leakedAcademyIds.has(playerKey(player))), ...promotedPlayers],
      euroScouting: state.euroScouting
        ? {
            ...state.euroScouting,
            academyPlayers: academyPlayers.filter(player => !removedAcademyIds.has(playerKey(player))),
          }
        : state.euroScouting,
      history: [...(state.history ?? []), ...historyEntries],
    },
    promotedIds,
    blockedIds,
    duplicateIds,
  };
}

export function graduateEuroAcademyPlayersToFreeAgency(
  state: GameState,
  requestedPlayerIds: Array<string | number>,
): AcademyFreeAgencyResult {
  if (requestedPlayerIds.length === 0) return { state, releasedIds: [] };

  const requestedIds = [...new Set(requestedPlayerIds.map(String).filter(Boolean))];
  const academyPlayers = state.euroScouting?.academyPlayers ?? [];
  const academyById = new Map(academyPlayers.map(player => [playerKey(player), player]));
  const existingPlayerIds = new Set(state.players
    .filter(player => !player.euroAcademyPlayer || player.promotedFromAcademy)
    .map(playerKey)
    .filter(Boolean));
  const removedAcademyIds = new Set<string>();
  const releasedPlayers: NBAPlayer[] = [];
  const releasedIds: string[] = [];

  for (const playerId of requestedIds) {
    const player = academyById.get(playerId);
    if (!player || existingPlayerIds.has(playerId)) continue;
    const materialized = materializeGeneratedEuroYouthRatings(player);
    releasedPlayers.push({
      ...materialized,
      pos: normalizePositionLabel(materialized.pos, materialized.hgt),
      tid: -1,
      status: 'Free Agent',
      euroAcademyPlayer: undefined,
      promotedFromAcademy: true,
      contract: undefined,
      contractYears: undefined,
      signedDate: undefined,
      tradeEligibleDate: undefined,
      transactions: [
        ...(player.transactions ?? []),
        { season: state.leagueStats.year, tid: -1, type: 'freeAgent' },
      ],
    });
    releasedIds.push(playerId);
    removedAcademyIds.add(playerId);
    existingPlayerIds.add(playerId);
  }

  if (releasedPlayers.length === 0) return { state, releasedIds: [] };

  const historyEntries = releasedPlayers.map(player => ({
    text: `${player.name} left the youth academy and entered free agency after no senior roster place was available.`,
    date: state.date,
    type: 'Academy Release',
    tid: state.userTeamId!,
    league: String(state.nonNBATeams.find(team => team.tid === state.userTeamId)?.league ?? 'Euroleague'),
    playerIds: [String(player.internalId)],
  }));

  return {
    state: {
      ...state,
      players: [
        ...state.players.filter(player => !removedAcademyIds.has(playerKey(player))),
        ...releasedPlayers,
      ],
      euroScouting: state.euroScouting
        ? {
            ...state.euroScouting,
            academyPlayers: academyPlayers.filter(player => !removedAcademyIds.has(playerKey(player))),
          }
        : state.euroScouting,
      history: [...(state.history ?? []), ...historyEntries],
    },
    releasedIds,
  };
}
