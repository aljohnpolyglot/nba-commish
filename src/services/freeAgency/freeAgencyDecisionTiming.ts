import type { GameState } from '../../types';

export const CENTRAL_FREE_AGENCY_DAYS = 15;
export const NBA_EXTERNAL_FREE_AGENCY_DAYS = 30;
export const CENTRAL_CORE_FREE_AGENCY_DAYS = 15;

export function getCentralFreeAgencyDays(state: Pick<GameState, 'leagueType' | 'moddedLeagueBase' | 'leagueStats' | 'nonNBATeams'>): number {
  const hasExternalMensMarket = (state.nonNBATeams ?? []).some(team => (
    team.league
    && team.league !== 'WNBA'
    && team.league !== 'G-League'
  ));
  return state.leagueType === 'modded'
    && (state.moddedLeagueBase ?? 'nba') === 'nba'
    && state.leagueStats?.uiMode === 'nba'
    && hasExternalMensMarket
    ? NBA_EXTERNAL_FREE_AGENCY_DAYS
    : CENTRAL_FREE_AGENCY_DAYS;
}

export interface CentralFreeAgencyCadence {
  day: number;
  totalDays: number;
}

export function getCentralPremiumFreeAgencyDays(totalDays: number): number {
  return totalDays > CENTRAL_FREE_AGENCY_DAYS ? CENTRAL_CORE_FREE_AGENCY_DAYS : 10;
}

export function isCentralFreeAgencyQualityEligible(
  displayedOverall: number,
  cadence?: CentralFreeAgencyCadence,
): boolean {
  if (!cadence) return true;
  return cadence.day > getCentralPremiumFreeAgencyDays(cadence.totalDays)
    || displayedOverall >= 70;
}

export function isCentralFreeAgencyCampMarket(cadence?: CentralFreeAgencyCadence): boolean {
  return !!cadence
    && cadence.totalDays > CENTRAL_CORE_FREE_AGENCY_DAYS
    && cadence.day > CENTRAL_CORE_FREE_AGENCY_DAYS;
}

export function countActiveOfferTeams(
  bids: ReadonlyArray<{ teamId: number; status?: string }> | null | undefined,
): number {
  return new Set(
    (bids ?? [])
      .filter(bid => bid.status === 'active' && Number.isFinite(Number(bid.teamId)))
      .map(bid => Number(bid.teamId)),
  ).size;
}

export function getHiddenFreeAgencyDecisionDay(
  playerId: string,
  season: number,
  currentDay: number,
  totalDays: number,
): number {
  const finalDecisionDay = Math.max(currentDay, totalDays - 1);
  const slots = Math.max(1, finalDecisionDay - currentDay + 1);
  let hash = season >>> 0;
  for (let index = 0; index < playerId.length; index++) {
    hash = Math.imul(hash ^ playerId.charCodeAt(index), 16777619) >>> 0;
  }
  return currentDay + (hash % slots);
}

/**
 * Spreads unresolved markets across the remaining signing window while keeping
 * the best available players first. The final day stays available as a safety
 * drain instead of being the normal decision date for a large market batch.
 */
export function getPriorityFreeAgencyDecisionDay(
  priorityIndex: number,
  marketCount: number,
  currentDay: number,
  totalDays: number,
): number {
  const safeCurrent = Math.max(1, Math.floor(currentDay));
  const safeTotal = Math.max(safeCurrent, Math.floor(totalDays));
  const normalDecisionDays = Math.max(1, safeTotal - safeCurrent);
  const marketsPerDay = Math.max(1, Math.ceil(Math.max(1, marketCount) / normalDecisionDays));
  return Math.min(
    Math.max(safeCurrent, safeTotal - 1),
    safeCurrent + Math.floor(Math.max(0, priorityIndex) / marketsPerDay),
  );
}

export function getCentralFreeAgencyEligiblePlayerIds(
  playerIds: ReadonlyArray<string>,
  _season: number,
  day: number,
  totalDays: number,
): Set<string> {
  const safeTotal = Math.max(1, Math.floor(totalDays));
  const safeDay = Math.min(safeTotal, Math.max(1, Math.floor(day)));
  const coreDecisionDays = Math.min(safeTotal, CENTRAL_CORE_FREE_AGENCY_DAYS);
  if (safeDay >= coreDecisionDays) return new Set(playerIds);
  return new Set(playerIds.filter((_playerId, priorityIndex) =>
    getPriorityFreeAgencyDecisionDay(priorityIndex, playerIds.length, 1, coreDecisionDays) <= safeDay
  ));
}

export function getCentralDailyTeamSigningLimit(cadence?: CentralFreeAgencyCadence): number {
  if (!cadence) return Number.POSITIVE_INFINITY;
  const coreDecisionDays = Math.min(cadence.totalDays, CENTRAL_CORE_FREE_AGENCY_DAYS);
  return cadence.day < coreDecisionDays ? 1 : Number.POSITIVE_INFINITY;
}

export function shouldRunCentralRosterCompletion(cadence?: CentralFreeAgencyCadence): boolean {
  if (!cadence) return true;
  return cadence.day >= Math.min(cadence.totalDays, CENTRAL_CORE_FREE_AGENCY_DAYS);
}
