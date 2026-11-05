import { Player, DraftSlot, SlotPosition, getEligiblePositions, getResolvedOvr } from '../types';

/**
 * LINEUP OPTIMIZER.
 * Prioritizes filling as many starting positions as possible,
 * then maximizes total OVR, then uses natural position preference.
 */

/**
 * Returns a score for how "natural" a player is in a slot.
 * 3 = exact match, 2 = direct multi-pos match, 1 = generic flex (G/F).
 */
function getNaturalScore(pos: string, slot: SlotPosition): number {
  const norm = pos.toUpperCase().replace(/[\s\/-]/g, '');
  if (norm === slot) return 3;
  
  const multiPos = ['GF', 'FG', 'FC', 'CF', 'PGSG', 'SGPG', 'SGSF', 'SFSG', 'SFPF', 'PFSF', 'PFC', 'CPF'];
  if (multiPos.includes(norm)) return 2;
  
  if (norm === 'G' || norm === 'F') return 1;
  
  return 0;
}

interface LineupScore {
  filledSlots: number;
  totalOvr: number;
  naturalPosScore: number;
  tieBreak: string;
}

function isBetter(a: LineupScore, b: LineupScore): boolean {
  if (a.filledSlots !== b.filledSlots) return a.filledSlots > b.filledSlots;
  if (a.totalOvr !== b.totalOvr) return a.totalOvr > b.totalOvr;
  if (a.naturalPosScore !== b.naturalPosScore) return a.naturalPosScore > b.naturalPosScore;
  return a.tieBreak > b.tieBreak;
}

/**
 * Solves an optimal 5-man court assignment (PG, SG, SF, PF, C) from a pool of players.
 * Uses exhaustive backtracking to explore combinations.
 */
export function solveUnit(players: Player[]): Map<SlotPosition, Player> {
  const courtSlots: SlotPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  let bestAssignment: Map<SlotPosition, Player> = new Map();
  let bestScore: LineupScore | null = null;

  function backtrack(
    slotIdx: number,
    assignedPlayers: Set<string>,
    currentAssignment: Map<SlotPosition, Player>,
    currentTotalOvr: number,
    currentNaturalScore: number
  ) {
    if (slotIdx === courtSlots.length) {
      const filled = currentAssignment.size;
      const tieBreak = Array.from(currentAssignment.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([slot, p]) => `${slot}:${p.id}`)
        .join(',');

      const score: LineupScore = {
        filledSlots: filled,
        totalOvr: currentTotalOvr,
        naturalPosScore: currentNaturalScore,
        tieBreak
      };

      if (!bestScore || isBetter(score, bestScore)) {
        bestScore = score;
        bestAssignment = new Map(currentAssignment);
      }
      return;
    }

    const slot = courtSlots[slotIdx];

    // Option 1: Try placing each eligible player into this slot
    for (const player of players) {
      if (assignedPlayers.has(player.id)) continue;
      
      const eligibleSlots = getEligiblePositions(player.position);
      if (eligibleSlots.includes(slot)) {
        assignedPlayers.add(player.id);
        currentAssignment.set(slot, player);

        backtrack(
          slotIdx + 1,
          assignedPlayers,
          currentAssignment,
          currentTotalOvr + getResolvedOvr(player),
          currentNaturalScore + getNaturalScore(player.position, slot)
        );

        currentAssignment.delete(slot);
        assignedPlayers.delete(player.id);
      }
    }

    // Option 2: Leave this slot empty
    backtrack(
      slotIdx + 1,
      assignedPlayers,
      currentAssignment,
      currentTotalOvr,
      currentNaturalScore
    );
  }

  // Pre-sort players by OVR descending to find high-OVR solutions earlier
  const sortedUnitPlayers = [...players].sort((a, b) => getResolvedOvr(b) - getResolvedOvr(a));
  backtrack(0, new Set(), new Map(), 0, 0);
  return bestAssignment;
}

export function getPositionRank(pos: string): number {
  const norm = pos.toUpperCase().replace(/[\s\/-]/g, '');
  if (norm.startsWith('PG')) return 1;
  if (norm.startsWith('SG')) return 2;
  if (norm.startsWith('SF')) return 3;
  if (norm.startsWith('PF')) return 4;
  if (norm.startsWith('C')) return 5;
  if (norm === 'G' || norm === 'GF' || norm === 'FG') return 1.5;
  if (norm === 'F') return 3.5;
  if (norm === 'FC' || norm === 'CF') return 4.5;
  return 3;
}

/**
 * Automatically sorts a list of drafted players into the 15-slot roster.
 */
export function autoBuildRoster(players: Player[], currentSlots: DraftSlot[]): DraftSlot[] {
  // Clear slots
  const newSlots = currentSlots.map(slot => ({ ...slot, player: null }));
  
  // Deduplicate input players to avoid any double-addition bugs
  const uniquePlayers = new Map<string, Player>();
  for (const p of players) {
    if (!uniquePlayers.has(p.id)) {
      uniquePlayers.set(p.id, p);
    }
  }
  const deduplicatedPlayers = Array.from(uniquePlayers.values());
  if (deduplicatedPlayers.length === 0) return newSlots;

  const assignedIds = new Set<string>();

  // 1. Assign Starters optimally using solver
  const starterAssignment = solveUnit(deduplicatedPlayers);
  
  // Place solved starters into starting slots
  starterAssignment.forEach((player, slot) => {
    assignedIds.add(player.id);
    const idx = newSlots.findIndex(s => s.slotPosition === slot);
    if (idx !== -1) {
      newSlots[idx].player = player;
    }
  });

  // 2. Assign remaining players to Bench and Deep Bench
  const remainingPlayers = deduplicatedPlayers.filter(p => !assignedIds.has(p.id));

  // Positional sort:
  function getPositionalGroup(pos: string): number {
    const norm = pos.toUpperCase().replace(/[\s\/-]/g, '');
    if (norm === 'PG' || norm === 'G') return 1;
    if (norm === 'SG' || norm === 'GF' || norm === 'FG' || norm === 'PGSG' || norm === 'SGPG') return 2;
    if (norm === 'SF' || norm === 'F' || norm === 'SGSF' || norm === 'SFSG' || norm === 'SFPF' || norm === 'PFSF') return 3;
    if (norm === 'PF' || norm === 'FC' || norm === 'CF' || norm === 'PFC' || norm === 'CPF') return 4;
    if (norm === 'C') return 5;
    
    if (norm.includes('PG')) return 1;
    if (norm.includes('SG')) return 2;
    if (norm.includes('SF')) return 3;
    if (norm.includes('PF')) return 4;
    if (norm.includes('C')) return 5;
    if (norm.includes('G')) return 1.5;
    if (norm.includes('F')) return 3.5;
    return 3;
  }

  const sortedRemaining = [...remainingPlayers].sort((a, b) => {
    const groupA = getPositionalGroup(a.position);
    const groupB = getPositionalGroup(b.position);
    if (groupA !== groupB) {
      return groupA - groupB;
    }
    const ovrA = getResolvedOvr(a);
    const ovrB = getResolvedOvr(b);
    if (ovrA !== ovrB) {
      return ovrB - ovrA; // Higher OVR first
    }
    return a.id.localeCompare(b.id); // Deterministic tie break
  });

  // Populate B1-B5 and D1-D5, then any leftover empty slot
  const benchAndDeep = newSlots
    .map(slot => slot.slotPosition)
    .filter(slot => !['PG', 'SG', 'SF', 'PF', 'C'].includes(slot));
  let benchIdx = 0;
  const unplaced: Player[] = [];
  for (const player of sortedRemaining) {
    if (benchIdx < benchAndDeep.length) {
      const slotName = benchAndDeep[benchIdx++];
      const idx = newSlots.findIndex(s => s.slotPosition === slotName);
      if (idx !== -1) {
        newSlots[idx].player = player;
      }
    } else {
      unplaced.push(player);
    }
  }

  // If any players couldn't fit in bench/deep (e.g. if fewer than 5 starters were solved), place into empty starting slots legally
  if (unplaced.length > 0) {
    const courtSlots = ['PG', 'SG', 'SF', 'PF', 'C'];
    for (const player of unplaced) {
      // 1. Try to find an empty starting slot where player is eligible
      const eligibleSlots = getEligiblePositions(player.position);
      const eligibleStartingSlotIdx = newSlots.findIndex(
        (s) => s.player === null && courtSlots.includes(s.slotPosition) && eligibleSlots.includes(s.slotPosition)
      );

      if (eligibleStartingSlotIdx !== -1) {
        newSlots[eligibleStartingSlotIdx].player = player;
        continue;
      }

      // 2. Try to swap with a bench/deepBench player who IS eligible for an empty starting slot
      let swapped = false;
      const emptyStartingSlots = newSlots.filter((s) => s.player === null && courtSlots.includes(s.slotPosition));
      for (const emptyStart of emptyStartingSlots) {
        const benchSlotWithEligiblePlayer = newSlots.find(
          (s) =>
            s.player !== null &&
            benchAndDeep.includes(s.slotPosition) &&
            getEligiblePositions(s.player.position).includes(emptyStart.slotPosition)
        );
        if (benchSlotWithEligiblePlayer) {
          emptyStart.player = benchSlotWithEligiblePlayer.player;
          benchSlotWithEligiblePlayer.player = player;
          swapped = true;
          break;
        }
      }

      if (!swapped) {
        // Emergency fallback: place into any empty slot
        const emptySlotIdx = newSlots.findIndex((s) => s.player === null);
        if (emptySlotIdx !== -1) {
          newSlots[emptySlotIdx].player = player;
        }
      }
    }
  }

  // HARD INVARIANT VALIDATION
  const uniqueOwnedIds = new Set(deduplicatedPlayers.map(p => p.id));
  const visiblePlayers = newSlots.filter(s => s.player !== null).map(s => s.player!);
  const visiblePlayerIds = visiblePlayers.map(p => p.id);
  const uniqueVisiblePlayerIds = new Set(visiblePlayerIds);

  if (visiblePlayerIds.length !== uniqueVisiblePlayerIds.size) {
    const counts = new Map<string, number>();
    for (const id of visiblePlayerIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const duplicates = Array.from(counts.entries()).filter(([_, c]) => c > 1).map(([id]) => id);
    console.warn(`Duplicate player(s) in roster slots: ${duplicates.join(', ')}`);
  }

  if (uniqueVisiblePlayerIds.size !== uniqueOwnedIds.size) {
    const missing = Array.from(uniqueOwnedIds).filter(id => !uniqueVisiblePlayerIds.has(id));
    const extra = Array.from(uniqueVisiblePlayerIds).filter(id => !uniqueOwnedIds.has(id));
    console.warn(`Player mismatch! Missing in slots: [${missing.join(', ')}], Extra in slots: [${extra.join(', ')}]. Owned count: ${uniqueOwnedIds.size}, Visible count: ${uniqueVisiblePlayerIds.size}`);
  }

  return newSlots;
}

export function validateRosterLegality(slots: DraftSlot[], reportError = true): boolean {
  const courtSlots = ['PG', 'SG', 'SF', 'PF', 'C'];
  for (const slot of slots) {
    if (!slot.player) continue;

    if (courtSlots.includes(slot.slotPosition)) {
      const eligible = getEligiblePositions(slot.player.position);
      if (!eligible.includes(slot.slotPosition)) {
        if (reportError) {
          console.error(`ILLEGAL ASSIGNMENT: Starter ${slot.player.name} (${slot.player.position}) assigned to strict position ${slot.slotPosition}`);
        }
        return false;
      }
    }
  }
  return true;
}
