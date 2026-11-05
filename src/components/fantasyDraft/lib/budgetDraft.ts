import { Player, getEligiblePositions, getResolvedOvr, type SlotPosition } from '../types';
import { FantasyTeam } from './wheelDraft';
import { autoBuildRoster, solveUnit, validateRosterLegality } from './rosterOptimizer';
import { acquirePlayer } from './draftUtils';

export interface BudgetPlayer extends Player {
  fantasyPrice: number;
}

/**
 * Assigns prices to players based on their OVR rank.
 * STANDALONE FANTASY-DRAFT BUDGET PRICING.
 * When integrated into the main game, this pricing calculation should
 * use the game's native player OVR and value metrics.
 */
export function calculateBudgetPrices(players: Player[], poolSize: number): BudgetPlayer[] {
  // Sort top 450 players by OVR descending, PID as tie-breaker
  const sorted = [...players]
    .sort((a, b) => {
      const ovrA = getResolvedOvr(a);
      const ovrB = getResolvedOvr(b);
      if (ovrB !== ovrA) return ovrB - ovrA;
      return a.id.localeCompare(b.id);
    })
    .slice(0, poolSize);

  return sorted.map((p, index) => {
    const rankPercentile = (index + 1) / Math.max(1, sorted.length);
    let price = 1;

    if (rankPercentile <= 4 / 450) price = 15;
    else if (rankPercentile <= 8 / 450) price = 14;
    else if (rankPercentile <= 15 / 450) price = 13;
    else if (rankPercentile <= 25 / 450) price = 12;
    else if (rankPercentile <= 40 / 450) price = 11;
    else if (rankPercentile <= 60 / 450) price = 10;
    else if (rankPercentile <= 85 / 450) price = 9;
    else if (rankPercentile <= 115 / 450) price = 8;
    else if (rankPercentile <= 150 / 450) price = 7;
    else if (rankPercentile <= 190 / 450) price = 6;
    else if (rankPercentile <= 235 / 450) price = 5;
    else if (rankPercentile <= 285 / 450) price = 4;
    else if (rankPercentile <= 340 / 450) price = 3;
    else if (rankPercentile <= 395 / 450) price = 2;
    else price = 1;

    return {
      ...p,
      fantasyPrice: price
    };
  });
}

export function calculateBudgetDraftStartingBudget(
  players: Player[],
  teamCount: number,
  rosterSize: number,
): number {
  const baseBudget = Math.max(rosterSize, Math.round((85 / 15) * rosterSize));
  if (teamCount <= 1) return baseBudget;
  const priced = calculateBudgetPrices(players, teamCount * rosterSize);
  const minimumUserSpend = [...priced]
    .sort((left, right) => left.fantasyPrice - right.fantasyPrice)
    .slice(0, rosterSize)
    .reduce((sum, player) => sum + player.fantasyPrice, 0);
  const remainingPoolCost = priced.reduce((sum, player) => sum + player.fantasyPrice, 0) - minimumUserSpend;
  return Math.max(baseBudget, Math.ceil(remainingPoolCost / (teamCount - 1)));
}

/**
 * Checks if a purchase is mathematically feasible.
 * The user must retain at least $1 for every remaining roster slot.
 */
export function isPurchaseFeasible(
  currentBudget: number,
  playerPrice: number,
  currentRosterSize: number,
  rosterSize: number,
): boolean {
  const budgetAfter = currentBudget - playerPrice;
  const slotsRemaining = rosterSize - (currentRosterSize + 1);
  return budgetAfter >= slotsRemaining;
}

/**
 * AI logic for Budget Draft.
 * Picks a player while staying under budget and keeping feasibility.
 */
export function pickPlayerForAIBudget(
  team: FantasyTeam,
  availablePlayers: BudgetPlayer[],
  remainingBudget: number,
  rosterSize: number,
): { player: BudgetPlayer; cost: number } | null {
  const slotsLeft = rosterSize - team.players.length;
  if (slotsLeft <= 0) return null;

  // Filter for feasible players
  const feasible = availablePlayers.filter(p => 
    isPurchaseFeasible(remainingBudget, p.fantasyPrice, team.players.length, rosterSize) &&
    p.fantasyPrice <= remainingBudget
  );

  if (feasible.length === 0) {
    // Fallback: pick the cheapest available player if feasible is tight
    const cheapest = [...availablePlayers].sort((a, b) => a.fantasyPrice - b.fantasyPrice)[0];
    if (cheapest && cheapest.fantasyPrice <= remainingBudget) {
      return { player: cheapest, cost: cheapest.fantasyPrice };
    }
    return null;
  }

  const averageBudgetPerSlot = remainingBudget / slotsLeft;
  
  const assignedStarterPositions = solveUnit(team.players);
  const missingStarterPositions = (['PG', 'SG', 'SF', 'PF', 'C'] as SlotPosition[])
    .filter(position => !assignedStarterPositions.has(position));
  const starterFits = missingStarterPositions.length > 0
    ? feasible.filter(player => getEligiblePositions(player.position).some(position => missingStarterPositions.includes(position)))
    : [];
  let candidates = starterFits.length > 0 ? starterFits : feasible;
  // Save $1 players for teams with low remaining budget unless no choice exists
  if (averageBudgetPerSlot > 1.5) {
    const nonDollar = feasible.filter(p => p.fantasyPrice > 1);
    if (nonDollar.length > 0) {
      candidates = nonDollar;
    }
  }

  if (averageBudgetPerSlot > 8 && Math.random() > 0.3) {
    candidates = candidates.slice(0, Math.max(5, Math.floor(candidates.length * 0.1)));
  } else if (averageBudgetPerSlot < 3) {
    const frugal = candidates.filter(p => p.fantasyPrice <= averageBudgetPerSlot + 2);
    if (frugal.length > 0) candidates = frugal;
  } else {
    candidates = candidates.slice(0, Math.max(10, Math.floor(candidates.length * 0.3)));
  }

  if (candidates.length === 0) candidates = [feasible[0]];

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  return { player: selected, cost: selected.fantasyPrice };
}

/**
 * Generates all 29 AI fantasy teams for Budget Draft.
 * This happens AFTER the user completes their roster.
 */
export function generateAIFantasyTeamsBudget(
  currentDraftedIds: Set<string>,
  allPlayers: BudgetPlayer[],
  currentTeams: FantasyTeam[],
  rosterSize: number,
  startingBudget: number,
): { updatedTeams: FantasyTeam[], updatedDraftedIds: Set<string>, remainingBudgets: Record<number, number>, aiPickHistory: Array<{team: FantasyTeam, player: Player}> } {
  const maxRetries = 10;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let workingTeams = [...currentTeams];
    let workingDraftedIds = new Set(currentDraftedIds);
    let available = allPlayers.filter(p => !workingDraftedIds.has(p.id));
    let aiPickHistory: Array<{team: FantasyTeam, player: Player}> = [];
    
    const budgets: Record<number, number> = {};
    workingTeams.filter(t => !t.isUser).forEach(t => budgets[t.id] = startingBudget);
    
    let success = true;

    for (let round = 0; round < rosterSize; round++) {
      const aiTeams = workingTeams.filter(t => !t.isUser);
      
      const shuffledAI = [...aiTeams];
      for (let i = shuffledAI.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledAI[i], shuffledAI[j]] = [shuffledAI[j], shuffledAI[i]];
      }
      
      for (const team of shuffledAI) {
        const liveTeam = workingTeams.find(t => t.id === team.id);
        if (!liveTeam) continue;
        if (liveTeam.players.length >= rosterSize) continue;
        
        const pick = pickPlayerForAIBudget(liveTeam, available, budgets[liveTeam.id], rosterSize);
        if (!pick) {
          success = false;
          break;
        }
        
        const { player, cost } = pick;
        const result = acquirePlayer(workingTeams, liveTeam.id, player, workingDraftedIds);
        
        if (result.success) {
          workingTeams = result.updatedTeams;
          workingDraftedIds = result.updatedDraftedIds;
          budgets[liveTeam.id] -= cost;
          available = available.filter(p => p.id !== player.id);
          aiPickHistory.push({ team: liveTeam, player });
        } else {
          success = false;
          break;
        }
      }
      
      if (!success) break;
    }
    
    const legalRosters = workingTeams
      .filter(team => !team.isUser)
      .every(team => team.players.length === rosterSize && validateRosterLegality(team.slots, false));
    if (success && legalRosters) {
      return {
        updatedTeams: workingTeams,
        updatedDraftedIds: workingDraftedIds,
        remainingBudgets: budgets,
        aiPickHistory
      };
    }
  }

  // Fallback pass: fill remaining AI rosters deterministically with cheapest valid players
  let workingTeams = [...currentTeams];
  let workingDraftedIds = new Set(currentDraftedIds);
  let available = [...allPlayers]
    .filter(p => !workingDraftedIds.has(p.id))
    .sort((a, b) => b.fantasyPrice - a.fantasyPrice || getResolvedOvr(b) - getResolvedOvr(a));
  let aiPickHistory: Array<{team: FantasyTeam, player: Player}> = [];
  const budgets: Record<number, number> = {};
  workingTeams.filter(t => !t.isUser).forEach(t => {
    const spent = t.players.reduce((sum, p) => sum + ((p as BudgetPlayer).fantasyPrice || 1), 0);
    budgets[t.id] = Math.max(rosterSize - t.players.length, startingBudget - spent);
  });

  const allocationState = workingTeams
    .filter(team => !team.isUser)
    .map(team => ({
      teamId: team.id,
      count: team.players.length,
      currentPlayers: team.players,
      initialSpend: startingBudget - budgets[team.id],
      allocatedCost: 0,
      players: [] as BudgetPlayer[],
    }));
  const totalNeeded = allocationState.reduce((sum, team) => sum + Math.max(0, rosterSize - team.count), 0);
  for (const player of available) {
    if (allocationState.reduce((sum, team) => sum + team.players.length, 0) >= totalNeeded) break;
    const fillsMissingStarter = (team: typeof allocationState[number]): boolean => {
      const roster = [...team.currentPlayers, ...team.players];
      const missing = (['PG', 'SG', 'SF', 'PF', 'C'] as SlotPosition[]).filter(slot =>
        !roster.some(rosterPlayer => getEligiblePositions(rosterPlayer.position).includes(slot)),
      );
      const eligible = getEligiblePositions(player.position);
      return missing.some(slot => eligible.includes(slot));
    };
    const target = allocationState
      .filter(team => team.count + team.players.length < rosterSize && team.allocatedCost + player.fantasyPrice <= budgets[team.teamId])
      .sort((left, right) =>
        Number(fillsMissingStarter(right)) - Number(fillsMissingStarter(left))
        || (left.initialSpend + left.allocatedCost) - (right.initialSpend + right.allocatedCost)
        || (left.count + left.players.length) - (right.count + right.players.length)
        || left.teamId - right.teamId,
      )[0];
    if (!target) continue;
    target.players.push(player);
    target.allocatedCost += player.fantasyPrice;
  }

  for (const allocation of allocationState) {
    for (const player of allocation.players) {
      const liveTeam = workingTeams.find(team => team.id === allocation.teamId);
      if (!liveTeam) continue;
      const result = acquirePlayer(workingTeams, allocation.teamId, player, workingDraftedIds);
      if (!result.success) continue;
      workingTeams = result.updatedTeams;
      workingDraftedIds = result.updatedDraftedIds;
      budgets[allocation.teamId] -= player.fantasyPrice;
      aiPickHistory.push({ team: liveTeam, player });
    }
  }

  return {
    updatedTeams: workingTeams,
    updatedDraftedIds: workingDraftedIds,
    remainingBudgets: budgets,
    aiPickHistory
  };
}
