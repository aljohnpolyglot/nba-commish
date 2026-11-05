import type { GameState, NBATeam, StaffData, StaffMember } from '../../types';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';

export type GMAttributes = {
  overall: number;
  trade_aggression: number;
  scouting_focus: number;
  drafting: number;
  work_ethic: number;
  spending: number;
  negotiation: number;
};

export const DEFAULT_GM_ATTRIBUTES: GMAttributes = {
  overall: 50,
  trade_aggression: 50,
  scouting_focus: 50,
  drafting: 50,
  work_ethic: 50,
  spending: 50,
  negotiation: 50,
};

type GMAttributeInput = Partial<GMAttributes> & {
  tradeAggression?: number;
  scouting?: number;
  workEthic?: number;
};

const clampRating = (value: unknown, fallback = 50): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(25, Math.min(99, Math.round(numeric))) : fallback;
};

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function ratingFromSeed(seed: string): number {
  return 25 + (hashSeed(seed) % 75);
}

export function generateGMAttributes(seed: string): GMAttributes {
  const overall = ratingFromSeed(`${seed}:overall`);
  const competence = (key: string) => clampRating(
    overall * 0.45 + ratingFromSeed(`${seed}:${key}`) * 0.55,
  );
  return {
    overall,
    trade_aggression: ratingFromSeed(`${seed}:trade-aggression`),
    scouting_focus: competence('scouting'),
    drafting: competence('drafting'),
    work_ethic: clampRating(overall * 0.25 + ratingFromSeed(`${seed}:work-ethic`) * 0.75),
    spending: ratingFromSeed(`${seed}:spending`),
    negotiation: competence('negotiation'),
  };
}

export function normalizeGMAttributes(
  input?: GMAttributeInput | null,
  fallback: GMAttributes = DEFAULT_GM_ATTRIBUTES,
): GMAttributes {
  return {
    overall: clampRating(input?.overall, fallback.overall),
    trade_aggression: clampRating(input?.trade_aggression ?? input?.tradeAggression, fallback.trade_aggression),
    scouting_focus: clampRating(input?.scouting_focus ?? input?.scouting, fallback.scouting_focus),
    drafting: clampRating(input?.drafting, fallback.drafting),
    work_ethic: clampRating(input?.work_ethic ?? input?.workEthic, fallback.work_ethic),
    spending: clampRating(input?.spending, fallback.spending),
    negotiation: clampRating(input?.negotiation, fallback.negotiation),
  };
}

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const isExecutiveRole = (member: StaffMember): boolean => {
  const role = normalize(member.role ?? member.jobTitle ?? member.position);
  return role === 'gm'
    || role.includes('general manager')
    || role.includes('sporting director')
    || role.includes('basketball operations')
    || role.includes('team executive');
};

export function resolveGeneralManagerForTeam(team: NBATeam, staff?: StaffData | null): StaffMember | null {
  const embedded = ((team as NBATeam & { tycoon?: { staffMembers?: StaffMember[] } }).tycoon?.staffMembers ?? [])
    .find(member => member.name && isExecutiveRole(member));
  if (embedded) return embedded;
  const teamName = team.name.toLowerCase();
  const teamCity = (team.region ?? team.name).toLowerCase();
  const fullName = getTeamFullName(team).toLowerCase();
  return (staff?.gms ?? []).find(g => {
    const haystack = [
      g.position,
      g.team,
      (g as StaffMember & { organization?: string }).organization,
      (g as StaffMember & { teamAbbrev?: string }).teamAbbrev,
      (g as StaffMember & { teamId?: number }).teamId,
    ].map(value => String(value ?? '').toLowerCase()).join(' ');
    return haystack.includes(teamName) ||
      haystack.includes(teamCity) ||
      haystack.includes(fullName) ||
      haystack.includes(team.abbrev?.toLowerCase() ?? '');
  }) ?? null;
}

export function findGMForTeam(state: GameState, teamId: number): StaffMember | null {
  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  return team ? resolveGeneralManagerForTeam(team, state.staff) : null;
}

export function getGMAttributes(state: GameState, teamId: number): GMAttributes {
  return normalizeGMAttributes(findGMForTeam(state, teamId)?.attributes);
}

export function getGMName(state: GameState, teamId: number): string {
  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
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

export function gmValuationError(overall: number): number {
  const normalizedOverall = (clampRating(overall) - 25) / 74;
  return 0.35 - normalizedOverall * 0.30;
}

export function gmPerceivedValue(value: number, overall: number, seed: string): number {
  const roll = hashSeed(seed) / 0xffffffff;
  const error = (roll * 2 - 1) * gmValuationError(overall);
  return Math.max(0, value * (1 + error));
}

export function negotiationInterestModifier(negotiation: number): number {
  return Math.max(-0.15, Math.min(0.15, ((clampRating(negotiation) - 62) / 37) * 0.15));
}

export function draftingBoardError(drafting: number): number {
  // Bad evaluators can still reach or miss, but they must not erase an entire
  // talent tier from the board. Elite evaluators stay within a narrow band.
  return 9 - ((clampRating(drafting) - 25) / 74) * 6.5;
}

export function gmDraftBoardScore(baseRating: number, drafting: number, seed: string): number {
  const roll = hashSeed(seed) / 0xffffffff;
  return baseRating + (roll * 2 - 1) * draftingBoardError(drafting);
}
