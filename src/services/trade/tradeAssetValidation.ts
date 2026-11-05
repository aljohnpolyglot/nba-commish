import type { DraftPick, GameState } from '../../types';
import { getTradablePicks } from '../draft/DraftPickGenerator';
import { isTradeAssetOwnedBy } from '../freeAgency/eurostashRights';

export interface ExecutiveTradeAssetPayload {
  teamAId: number;
  teamBId: number;
  teamAPlayers?: string[];
  teamBPlayers?: string[];
  teamAPicks?: number[];
  teamBPicks?: number[];
}

function hasDuplicates<T>(values: T[]): boolean {
  return new Set(values).size !== values.length;
}

export function validateExecutiveTradeAssets(
  state: Pick<GameState, 'players' | 'draftPicks' | 'leagueStats' | 'draftComplete' | 'activeDraftPicks' | 'activeDraftPassedPicks' | 'activeDraftOrder'>,
  payload: ExecutiveTradeAssetPayload,
): string | null {
  const teamAPlayers = payload.teamAPlayers ?? [];
  const teamBPlayers = payload.teamBPlayers ?? [];
  const teamAPicks = payload.teamAPicks ?? [];
  const teamBPicks = payload.teamBPicks ?? [];

  if (hasDuplicates([...teamAPlayers, ...teamBPlayers]) || hasDuplicates([...teamAPicks, ...teamBPicks])) {
    return 'The trade contains the same asset more than once. Refresh the trade and try again.';
  }

  const playersById = new Map(state.players.map(player => [player.internalId, player]));
  for (const [ids, ownerTid] of [[teamAPlayers, payload.teamAId], [teamBPlayers, payload.teamBId]] as const) {
    if (ids.some(id => {
      const player = playersById.get(id);
      return !player || !isTradeAssetOwnedBy(player, ownerTid);
    })) {
      return 'A selected player is no longer on that team. Refresh the trade and try again.';
    }
  }

  const tradablePicks = new Map<number, DraftPick>(getTradablePicks(state).map(pick => [pick.dpid, pick]));
  for (const [ids, ownerTid] of [[teamAPicks, payload.teamAId], [teamBPicks, payload.teamBId]] as const) {
    if (ids.some(id => tradablePicks.get(id)?.tid !== ownerTid)) {
      return 'A selected draft pick is no longer available. Refresh the trade and try again.';
    }
  }

  return null;
}
