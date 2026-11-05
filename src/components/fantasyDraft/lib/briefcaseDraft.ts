import { Player, getResolvedOvr } from '../types';
import { shuffleArray } from './draftUtils';

/**
 * Validates and partitions the roster into 15 rounds of 30 players each.
 * Uses the canonical resolved display OVR.
 * Breaks ties with player ID.
 */
export function partitionPlayersForBriefcase(allPlayers: Player[], teamCount: number, rosterSize: number): Player[][] {
  // 1. Sort by OVR descending, then ID for stable tie-breaking
  const sorted = [...allPlayers].sort((a, b) => {
    const bOvr = getResolvedOvr(b);
    const aOvr = getResolvedOvr(a);
    if (bOvr !== aOvr) return bOvr - aOvr;
    return a.id.localeCompare(b.id);
  });

  // 2. Take top 450
  const draftPool = sorted.slice(0, teamCount * rosterSize);

  // 3. Split into 15 rounds of 30
  const rounds: Player[][] = [];
  for (let i = 0; i < rosterSize; i++) {
    rounds.push(draftPool.slice(i * teamCount, (i + 1) * teamCount));
  }

  return rounds;
}

/**
 * Shuffles a round's players for briefcase assignment using Fisher-Yates.
 */
export function shuffleBriefcases(roundPlayers: Player[]): Player[] {
  return shuffleArray(roundPlayers);
}
