import type { OffseasonChecklist } from '../../types';

type LeagueStatsLike = {
  year?: number | string | null;
  uiMode?: string | null;
};

type ExpansionScheduleLike = {
  year?: number | string | null;
  teams?: readonly unknown[] | null;
  league?: 'nba' | 'pba' | 'wnba' | null;
} | null | undefined;

export const DEFAULT_EXPANSION_PROTECTION_SETTINGS = {
  perTeamLimit: 8,
  maxDraftedPerTeam: 2,
  picksPerExpansionTeam: 14,
} as const;

export function isExpansionDraftDueForOffseason(
  leagueStats?: LeagueStatsLike | null,
  expansionSchedule?: ExpansionScheduleLike,
): boolean {
  if (!leagueStats || !expansionSchedule) return false;
  if (leagueStats.uiMode === 'euro_isolated') return false;
  const activeLeague = leagueStats.uiMode === 'pba_isolated'
    ? 'pba'
    : leagueStats.uiMode === 'wnba_isolated'
      ? 'wnba'
      : 'nba';
  if (activeLeague !== (expansionSchedule.league ?? 'nba')) return false;

  const leagueYear = Number(leagueStats.year);
  const scheduleYear = Number(expansionSchedule.year);
  if (!Number.isFinite(leagueYear) || !Number.isFinite(scheduleYear)) return false;
  if (scheduleYear !== leagueYear) return false;

  return Array.isArray(expansionSchedule.teams) && expansionSchedule.teams.length > 0;
}

export function applyExpansionDraftOffseasonTransition(
  checklist: OffseasonChecklist | undefined,
  leagueStats?: LeagueStatsLike | null,
  expansionSchedule?: ExpansionScheduleLike,
): OffseasonChecklist | undefined {
  if (!checklist || !isExpansionDraftDueForOffseason(leagueStats, expansionSchedule)) return checklist;
  if (checklist.expansionDraft !== 'skipped') return checklist;
  return { ...checklist, expansionDraft: 'pending' };
}
