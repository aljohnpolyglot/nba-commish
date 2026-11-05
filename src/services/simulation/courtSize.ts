import type { LeagueStats } from '../../types';

export const DEFAULT_PLAYERS_ON_COURT = 5;

export function getPlayersOnCourt(
  leagueStats?: Partial<LeagueStats> | null,
  availablePlayers?: number,
): number {
  const configured = Number(leagueStats?.maxPlayersOnCourt ?? DEFAULT_PLAYERS_ON_COURT);
  const requested = Number.isFinite(configured)
    ? Math.max(1, Math.min(10, Math.round(configured)))
    : DEFAULT_PLAYERS_ON_COURT;
  const rosterMinimum = Number(leagueStats?.minPlayersPerTeam);
  const rosterLimit = Number.isFinite(rosterMinimum) && rosterMinimum > 0
    ? Math.round(rosterMinimum)
    : 10;
  const availableLimit = Number.isFinite(availablePlayers) && Number(availablePlayers) > 0
    ? Math.round(Number(availablePlayers))
    : 10;
  return Math.max(1, Math.min(requested, rosterLimit, availableLimit));
}

export function getCourtSlotLabels(playersOnCourt: number): string[] {
  if (playersOnCourt === DEFAULT_PLAYERS_ON_COURT) return ['PG', 'SG', 'SF', 'PF', 'C'];
  return Array.from({ length: playersOnCourt }, (_, index) => `${index + 1}`);
}
