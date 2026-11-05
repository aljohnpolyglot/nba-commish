import { Player, DraftSlot, SlotPosition, getEligiblePositions, getResolvedOvr } from '../types';
import { autoBuildRoster } from './rosterOptimizer';
import { acquirePlayer } from './draftUtils';

export interface TeamInfo {
  id: number;
  abbrev: string;
  name: string;
  conference: 'Eastern' | 'Western';
  division?: string;
}

export interface FantasyTeam {
  id: number;
  draftSlot: number; // 1 to 30
  name: string;
  abbrev: string;
  isUser: boolean;
  players: Player[];
  slots: DraftSlot[];
}

const CORE_ROSTER_SLOTS: DraftSlot[] = [
  { id: 1, slotPosition: 'PG', label: 'Starting Point Guard', player: null },
  { id: 2, slotPosition: 'SG', label: 'Starting Shooting Guard', player: null },
  { id: 3, slotPosition: 'SF', label: 'Starting Small Forward', player: null },
  { id: 4, slotPosition: 'PF', label: 'Starting Power Forward', player: null },
  { id: 5, slotPosition: 'C', label: 'Starting Center', player: null },
  { id: 6, slotPosition: 'B1', label: 'Bench 1', player: null },
  { id: 7, slotPosition: 'B2', label: 'Bench 2', player: null },
  { id: 8, slotPosition: 'B3', label: 'Bench 3', player: null },
  { id: 9, slotPosition: 'B4', label: 'Bench 4', player: null },
  { id: 10, slotPosition: 'B5', label: 'Bench 5', player: null },
  { id: 11, slotPosition: 'D1', label: 'Deep Bench 1', player: null },
  { id: 12, slotPosition: 'D2', label: 'Deep Bench 2', player: null },
  { id: 13, slotPosition: 'D3', label: 'Deep Bench 3', player: null },
  { id: 14, slotPosition: 'D4', label: 'Deep Bench 4', player: null },
  { id: 15, slotPosition: 'D5', label: 'Deep Bench 5', player: null },
];

export function buildRosterSlots(rosterSize: number): DraftSlot[] {
  const size = Math.max(5, Math.floor(rosterSize));
  if (size <= CORE_ROSTER_SLOTS.length) {
    return CORE_ROSTER_SLOTS.slice(0, size).map(slot => ({ ...slot, player: null }));
  }
  const slots = CORE_ROSTER_SLOTS.map(slot => ({ ...slot, player: null }));
  for (let id = slots.length + 1; id <= size; id += 1) {
    slots.push({ id, slotPosition: `D${id - 10}`, label: `Deep Bench ${id - 10}`, player: null });
  }
  return slots;
}

/**
 * Extracts the unique active source teams from the player pool.
 */
export function extractTeams(allPlayers: Player[]): TeamInfo[] {
  const map = new Map<string, TeamInfo>();

  for (const p of allPlayers) {
    if (p.teamAbbrev && !map.has(p.teamAbbrev)) {
      map.set(p.teamAbbrev, {
        id: p.teamId,
        abbrev: p.teamAbbrev,
        name: p.teamName || p.teamAbbrev,
        conference: p.conference || 'Eastern',
        division: p.division,
      });
    }
  }

  // Ensure deterministic ordering
  return Array.from(map.values()).sort((a, b) => a.abbrev.localeCompare(b.abbrev));
}

/**
 * Gets all undrafted players for a specific team, sorted by OVR descending.
 */
export function getUndraftedPlayersForTeam(
  allPlayers: Player[],
  teamAbbrev: string,
  draftedIds: Set<string>
): Player[] {
  return allPlayers
    .filter((p) => p.teamAbbrev === teamAbbrev && !draftedIds.has(p.id))
    .sort((a, b) => getResolvedOvr(b) - getResolvedOvr(a));
}

/**
 * Selects a random team that has at least 1 undrafted player remaining.
 */
export function selectRandomValidTeam(
  teams: TeamInfo[],
  allPlayers: Player[],
  draftedIds: Set<string>
): TeamInfo {
  const validTeams = teams.filter(
    (t) => getUndraftedPlayersForTeam(allPlayers, t.abbrev, draftedIds).length > 0
  );

  if (validTeams.length === 0) {
    throw new Error('No valid teams with undrafted players remaining!');
  }

  const randomIndex = Math.floor(Math.random() * validTeams.length);
  return validTeams[randomIndex];
}

/**
 * Initializes all 30 fantasy teams for the draft.
 */
export function initializeFantasyLeague(
  allTeams: TeamInfo[],
  controlledTeamAbbrev: string,
  userDraftSlot: number,
  rosterSize: number,
): FantasyTeam[] {
  // Sort teams so they are consistent
  const sortedTeams = [...allTeams].sort((a, b) => a.abbrev.localeCompare(b.abbrev));
  
  // We have 30 slots. We need to assign each team to a slot.
  // The controlled team gets userDraftSlot.
  // The others are randomized into the remaining slots.
  const slots: number[] = Array.from({ length: sortedTeams.length }, (_, i) => i + 1);
  const remainingSlots = slots.filter(s => s !== userDraftSlot);
  
  // Shuffle remaining slots for AI teams
  const shuffledSlots = remainingSlots.sort(() => Math.random() - 0.5);
  
  let aiSlotIdx = 0;
  return sortedTeams.map((t) => {
    const isUser = t.abbrev === controlledTeamAbbrev;
    const draftSlot = isUser ? userDraftSlot : shuffledSlots[aiSlotIdx++];
    
    return {
      id: t.id,
      draftSlot,
      name: t.name,
      abbrev: t.abbrev,
      isUser,
      players: [],
      slots: buildRosterSlots(rosterSize),
    };
  });
}

/**
 * Drafts one player for an AI fantasy team from a randomly selected source team.
 */
export function draftPlayerForAITeam(
  aiTeam: FantasyTeam,
  allPlayers: Player[],
  teams: TeamInfo[],
  globalDraftedIds: Set<string>,
  fantasyTeams: FantasyTeam[]
): { selectedPlayer: Player; spunTeam: TeamInfo; updatedTeams: FantasyTeam[]; updatedDraftedIds: Set<string> } {
  const spunTeam = selectRandomValidTeam(teams, allPlayers, globalDraftedIds);
  const available = getUndraftedPlayersForTeam(allPlayers, spunTeam.abbrev, globalDraftedIds);

  if (available.length === 0) {
    throw new Error(`Unexpected: Spun team ${spunTeam.name} has no available players`);
  }

  // Score available players based on OVR + starting position fit
  // Find which starting slots are currently unfilled in the AI team
  const filledStarterPositions = new Set<string>();
  aiTeam.slots.slice(0, 5).forEach(s => {
    if (s.player) filledStarterPositions.add(s.slotPosition);
  });
  
  const neededPositions = new Set(['PG', 'SG', 'SF', 'PF', 'C']);
  filledStarterPositions.forEach((pos) => neededPositions.delete(pos));

  let bestPlayer = available[0];
  let bestScore = -Infinity;

  for (const player of available) {
    // Check if player is eligible for any needed position
    const isEligibleForNeeded = Array.from(neededPositions).some(needed => 
      getEligiblePositions(player.position).includes(needed as SlotPosition)
    );
    const posMatch = isEligibleForNeeded ? 8 : 0;
    
    // Add small random noise (-2.5 to +2.5)
    const noise = (Math.random() - 0.5) * 5;
    const score = getResolvedOvr(player) * 2 + posMatch + noise;

    if (score > bestScore) {
      bestScore = score;
      bestPlayer = player;
    }
  }

  // Immutable update using acquirePlayer!
  const { updatedTeams, updatedDraftedIds } = acquirePlayer(fantasyTeams, aiTeam.id, bestPlayer, globalDraftedIds);

  return { selectedPlayer: bestPlayer, spunTeam, updatedTeams, updatedDraftedIds };
}

export interface AIRoundPickSummary {
  teamName: string;
  draftSlot: number;
  player: Player;
  spunTeamAbbrev: string;
}

/**
 * Resolves AI drafting for a subset of AI teams (e.g. pre-user or post-user) in order of draftSlot.
 */
export function resolveAITeamsSubset(
  aiTeams: FantasyTeam[],
  allPlayers: Player[],
  allTeams: TeamInfo[],
  globalDraftedIds: Set<string>,
  fantasyTeams: FantasyTeam[],
  isDescending: boolean = false,
  roundIndex: number = 0
): { summaries: AIRoundPickSummary[]; updatedTeams: FantasyTeam[]; updatedDraftedIds: Set<string> } {
  const sortedAi = [...aiTeams].sort((a, b) => 
    isDescending ? b.draftSlot - a.draftSlot : a.draftSlot - b.draftSlot
  );
  const summaries: AIRoundPickSummary[] = [];

  let currentTeams = fantasyTeams;
  let currentDraftedIds = globalDraftedIds;

  for (const aiTeam of sortedAi) {
    const liveAiTeam = currentTeams.find(t => t.id === aiTeam.id) || aiTeam;

    const { selectedPlayer, spunTeam, updatedTeams: nextTeams, updatedDraftedIds: nextDraftedIds } = draftPlayerForAITeam(
      liveAiTeam,
      allPlayers,
      allTeams,
      currentDraftedIds,
      currentTeams
    );

    currentTeams = nextTeams;
    currentDraftedIds = nextDraftedIds;

    summaries.push({
      teamName: aiTeam.name,
      draftSlot: aiTeam.draftSlot,
      player: selectedPlayer,
      spunTeamAbbrev: spunTeam.abbrev,
    });
  }

  return { summaries, updatedTeams: currentTeams, updatedDraftedIds: currentDraftedIds };
}
