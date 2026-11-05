// STANDALONE ORDINARY FANTASY DRAFT.
// Fixed, Snake, and Random are implemented here so this isolated mini-game
// can run independently.
//
// NOTE:
// This Fantasy Draft is available both as a standalone mini-game mode in the game
// and as part of the native league setup options.
//
// WHEN WIRED INTO THE MAIN GAME:
// reuse the game's native fantasy-draft/player-pool/order infrastructure
// wherever it already exists instead of maintaining a duplicate system.
// Ordinary Draft should use the active save's native player pool and
// native fantasy-team state.

import { Player, OrdinaryDraftType, getResolvedOvr, getEligiblePositions } from '../types';
import { FantasyTeam } from './wheelDraft';
import { shuffleArray } from './draftUtils';
import { solveUnit } from './rosterOptimizer';

export function getOrdinaryDraftOrder(
  teams: FantasyTeam[],
  round: number,
  type: OrdinaryDraftType,
  randomRoundOrders: Record<number, number[]>
): { order: FantasyTeam[]; updatedRandomOrders: Record<number, number[]> } {
  const updatedOrders = { ...randomRoundOrders };

  if (type === 'FIXED') {
    const order = [...teams].sort((a, b) => a.draftSlot - b.draftSlot);
    return { order, updatedRandomOrders: updatedOrders };
  }

  if (type === 'SNAKE') {
    const isAscending = round % 2 === 0;
    const order = [...teams].sort((a, b) =>
      isAscending ? a.draftSlot - b.draftSlot : b.draftSlot - a.draftSlot
    );
    return { order, updatedRandomOrders: updatedOrders };
  }

  // RANDOM
  if (!updatedOrders[round]) {
    const teamIds = shuffleArray(teams.map((t) => t.id));
    updatedOrders[round] = teamIds;
  }

  const orderMap = new Map<number, number>();
  updatedOrders[round].forEach((id, index) => orderMap.set(id, index));

  const order = [...teams].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  return { order, updatedRandomOrders: updatedOrders };
}

export function pickPlayerForAIOrdinary(team: FantasyTeam, availablePlayers: Player[]): Player {
  if (availablePlayers.length === 0) throw new Error('No players available for AI draft');

  const sorted = [...availablePlayers].sort((a, b) => getResolvedOvr(b) - getResolvedOvr(a));
  const assignedStarterPositions = solveUnit(team.players);
  const missingStarterPositions = ['PG', 'SG', 'SF', 'PF', 'C']
    .filter(position => !assignedStarterPositions.has(position as 'PG' | 'SG' | 'SF' | 'PF' | 'C'));
  const starterFits = missingStarterPositions.length > 0
    ? sorted.filter(player => getEligiblePositions(player.position).some(position => missingStarterPositions.includes(position)))
    : [];
  const topCandidates = (starterFits.length > 0 ? starterFits : sorted).slice(0, 10);

  const posCounts: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const p of team.players) {
    const eligible = getEligiblePositions(p.position);
    for (const pos of eligible) {
      if (posCounts[pos] !== undefined) {
        posCounts[pos]++;
      }
    }
  }

  let bestPlayer = topCandidates[0];
  let bestScore = -999;

  for (const p of topCandidates) {
    const ovr = getResolvedOvr(p);
    const eligible = getEligiblePositions(p.position);
    let minPosCount = 999;
    for (const pos of eligible) {
      if (posCounts[pos] !== undefined && posCounts[pos] < minPosCount) {
        minPosCount = posCounts[pos];
      }
    }
    if (minPosCount === 999) minPosCount = 0;

    const needBonus = (3 - Math.min(minPosCount, 3)) * 2;
    const randomJitter = Math.random() * 2;
    const score = ovr + needBonus + randomJitter;

    if (score > bestScore) {
      bestScore = score;
      bestPlayer = p;
    }
  }

  return bestPlayer;
}
