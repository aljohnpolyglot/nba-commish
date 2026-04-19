import type { GameState } from '../../types';

export type GMAttributes = {
  trade_aggression: number;
  scouting_focus: number;
  work_ethic: number;
  spending: number;
};

export const DEFAULT_GM_ATTRIBUTES: GMAttributes = {
  trade_aggression: 65,
  scouting_focus: 60,
  work_ethic: 55,
  spending: 60,
};

export function findGMForTeam(state: GameState, teamId: number): any | null {
  const team = state.teams.find(t => t.id === teamId);
  if (!team) return null;
  const teamName = team.name.toLowerCase();
  const teamCity = (team.region ?? team.name).toLowerCase();
  const gms: any[] = (state as any).staff?.gms ?? [];
  return gms.find(g => {
    const pos = (g.position ?? g.team ?? '').toLowerCase();
    return pos.includes(teamName) || pos.includes(teamCity) || pos.includes(team.abbrev?.toLowerCase() ?? '');
  }) ?? null;
}

export function getGMAttributes(state: GameState, teamId: number): GMAttributes {
  return findGMForTeam(state, teamId)?.attributes ?? DEFAULT_GM_ATTRIBUTES;
}

export function getGMName(state: GameState, teamId: number): string {
  const team = state.teams.find(t => t.id === teamId);
  return findGMForTeam(state, teamId)?.name ?? `${team?.name ?? 'AI'} GM`;
}

/** Probability a GM initiates a trade today: 50→~10%, 65→~40%, 80→~70%, 95+→100%. */
export function tradeInitiateProb(aggression: number): number {
  return Math.max(0.05, Math.min(1.0, (aggression - 45) / 50));
}

/** Probability a GM completes a free-agent signing this round: 50→~0.45, 75→~0.70, 95→~0.90. */
export function workEthicSignProb(workEthic: number): number {
  return Math.max(0.15, Math.min(1.0, 0.45 + (workEthic - 50) / 100));
}

/** Multiplier on a free-agent/extension offer amount: 50→0.85, 75→1.00, 95→1.12, 100→1.15. */
export function spendingOfferMultiplier(spending: number): number {
  return 0.85 + Math.max(0, Math.min(100, spending) - 50) * 0.006;
}

/** Apply the spending multiplier to a base salary and clamp so the final offer
 *  never exceeds the player's max contract and never pushes the team above a
 *  caller-supplied hard ceiling (typically a cap/apron limit). Clamping here
 *  keeps individual call sites from having to repeat the safety math. */
export function clampSpendOffer(
  baseSalaryUSD: number,
  spending: number,
  maxContractUSD: number,
  hardCeilingUSD?: number,
): number {
  const mult = spendingOfferMultiplier(spending);
  let scaled = Math.round(baseSalaryUSD * mult);
  if (scaled > maxContractUSD) scaled = Math.round(maxContractUSD);
  if (hardCeilingUSD !== undefined && scaled > hardCeilingUSD) scaled = Math.max(0, Math.round(hardCeilingUSD));
  return scaled;
}

/** Reluctance of a GM to include draft picks in outgoing packages — 0 below 70, rising to 0.5 at 100.
 *  Multiplied by pick count for a per-proposal rejection roll. */
export function pickHoardResistance(scoutingFocus: number): number {
  if (scoutingFocus <= 70) return 0;
  return Math.min(0.5, (scoutingFocus - 70) / 60);
}
