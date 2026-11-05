import type { GameState, GameStats, LeagueStats } from '../../types';
import { calculateAnnualLeagueOperatingSurplus } from './financialService';

const finiteNonNegative = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
};

export function getLeagueReserve(stats: Partial<GameStats> | undefined): number {
  return finiteNonNegative(stats?.leagueReserve, finiteNonNegative(stats?.leagueFunds));
}

export function getAvailableLeagueBudget(stats: Partial<GameStats> | undefined): number {
  return Math.min(
    getLeagueReserve(stats),
    finiteNonNegative(stats?.availableBudget, finiteNonNegative(stats?.leagueFunds)),
  );
}

export function normalizeLeagueTreasuryStats(stats: Partial<GameStats> | undefined): GameStats {
  const reserve = getLeagueReserve(stats);
  const availableBudget = getAvailableLeagueBudget(stats);
  return {
    publicApproval: finiteNonNegative(stats?.publicApproval, 50),
    ownerApproval: finiteNonNegative(stats?.ownerApproval, 50),
    playerApproval: finiteNonNegative(stats?.playerApproval, 50),
    leagueFunds: availableBudget,
    leagueReserve: reserve,
    availableBudget,
    personalWealth: finiteNonNegative(stats?.personalWealth, 2.5),
    legacy: finiteNonNegative(stats?.legacy),
  };
}

export function authorizeNextSeasonBudget(
  state: GameState,
  nextLeagueStats: LeagueStats,
): GameStats {
  const normalized = normalizeLeagueTreasuryStats(state.stats);
  const reserve = normalized.leagueReserve;
  const projectedSurplus = calculateAnnualLeagueOperatingSurplus({
    ...state,
    leagueStats: nextLeagueStats,
  });
  const availableBudget = Math.min(reserve, Math.max(0, projectedSurplus));
  return {
    ...normalized,
    leagueFunds: availableBudget,
    availableBudget,
  };
}
