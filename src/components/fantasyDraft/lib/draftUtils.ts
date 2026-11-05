import { Player, getResolvedOvr } from '../types';
import { FantasyTeam } from './wheelDraft';
import { autoBuildRoster } from './rosterOptimizer';

export function acquirePlayer(
  fantasyTeams: FantasyTeam[],
  teamId: number,
  player: Player,
  draftedIds: Set<string>
): { success: boolean; updatedTeams: FantasyTeam[]; updatedDraftedIds: Set<string> } {
  if (!player || !player.id) {
    return { success: false, updatedTeams: fantasyTeams, updatedDraftedIds: draftedIds };
  }
  if (draftedIds.has(player.id)) {
    return { success: false, updatedTeams: fantasyTeams, updatedDraftedIds: draftedIds };
  }
  // Check if player is already on any team
  if (fantasyTeams.some(t => t.players.some(p => p.id === player.id))) {
    return { success: false, updatedTeams: fantasyTeams, updatedDraftedIds: draftedIds };
  }

  const teamIndex = fantasyTeams.findIndex(t => t.id === teamId);
  if (teamIndex === -1) {
    return { success: false, updatedTeams: fantasyTeams, updatedDraftedIds: draftedIds };
  }

  const targetTeam = fantasyTeams[teamIndex];
  if (targetTeam.players.length >= targetTeam.slots.length) {
    return { success: false, updatedTeams: fantasyTeams, updatedDraftedIds: draftedIds };
  }

  // Immutable updates
  const updatedPlayers = [...targetTeam.players, player];
  const updatedSlots = autoBuildRoster(updatedPlayers, targetTeam.slots);

  const updatedTeam: FantasyTeam = {
    ...targetTeam,
    players: updatedPlayers,
    slots: updatedSlots
  };

  const updatedTeams = [...fantasyTeams];
  updatedTeams[teamIndex] = updatedTeam;

  const updatedDraftedIds = new Set(draftedIds);
  updatedDraftedIds.add(player.id);

  return { success: true, updatedTeams, updatedDraftedIds };
}

/**
 * Fisher-Yates array shuffle.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// End of file
