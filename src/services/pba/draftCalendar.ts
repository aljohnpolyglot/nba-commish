import type { LeagueStats, NBAPlayer } from '../../types';
import { getPbaDraftPool } from './draftRules';

export const PBA_DRAFT_NOT_HELD_YEARS = new Set([2021]);

export function getPbaDraftYearForSeasonYear(seasonYear: number): number {
  return seasonYear === 2021 ? 2020 : seasonYear;
}

export function getPbaSourceDraftYear(draftYear: number): number {
  return draftYear === 2020 ? 2021 : draftYear;
}

export function getUpcomingPbaDraftYears(seasonYear: number, count = 4): number[] {
  const years: number[] = [];
  let year = getPbaDraftYearForSeasonYear(seasonYear);
  while (years.length < Math.max(0, Math.floor(count))) {
    if (isPbaDraftHeldInYear(year)) years.push(year);
    year += 1;
  }
  return years;
}

export function getPbaDraftPickYears(
  seasonYear: number,
  windowSize = 4,
  includeCurrent = false,
): number[] {
  const years = getUpcomingPbaDraftYears(seasonYear, Math.max(0, Math.floor(windowSize)) + 1);
  return includeCurrent ? years : years.slice(1);
}

export function isPbaDraftHeldInYear(year: number): boolean {
  return Number.isFinite(year) && !PBA_DRAFT_NOT_HELD_YEARS.has(year);
}

export function carryPbaDraftClassForward(
  players: NBAPlayer[],
  draftYear: number,
  leagueStats?: LeagueStats,
): NBAPlayer[] {
  if (isPbaDraftHeldInYear(draftYear)) return players;
  let nextDraftYear = draftYear + 1;
  while (!isPbaDraftHeldInYear(nextDraftYear)) nextDraftYear += 1;
  const eligibleIds = new Set(getPbaDraftPool(players, draftYear, leagueStats).map(player => player.internalId));
  if (eligibleIds.size === 0) return players;
  return players.map(player => eligibleIds.has(player.internalId)
    ? { ...player, draft: { ...player.draft, year: nextDraftYear } }
    : player,
  );
}
