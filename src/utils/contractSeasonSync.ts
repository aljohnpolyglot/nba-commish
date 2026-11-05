import type { GameState, NBAPlayer } from '../types';

export interface ContractSeasonOwnership {
  completedSeason: number;
  upcomingSeason: number;
  activeSeason: number;
  cycleId: string;
}

/**
 * Canonical contract-year owner. Contract `exp` is the ending year of the
 * season label (2003 means 2002-03), while new offseason money starts in the
 * following ending year.
 */
export function resolveContractSeasonOwnership(
  state: Pick<GameState, 'leagueStats'> & Partial<Pick<GameState, 'seasonLifecycle'>>,
): ContractSeasonOwnership {
  const activeSeason = Number(state.seasonLifecycle?.activeSeason ?? state.leagueStats?.year ?? new Date().getUTCFullYear());
  const completedSeason = Number(
    state.seasonLifecycle?.offseasonCycle
    ?? state.seasonLifecycle?.completedSeason
    ?? (state.seasonLifecycle?.currentPhase === 'OFFSEASON_OPEN' || state.seasonLifecycle?.currentPhase === 'OFFSEASON_TASKS_ACTIVE'
      ? activeSeason - 1
      : activeSeason),
  );
  const upcomingSeason = completedSeason + 1;
  return {
    completedSeason,
    upcomingSeason,
    activeSeason,
    cycleId: `${String(state.leagueStats?.uiMode ?? 'nba')}:${completedSeason}`,
  };
}

export function syncPlayerContractAmountForSeason(player: NBAPlayer, seasonYear: number): NBAPlayer {
  if (!player.contract || !Array.isArray(player.contractYears)) return player;
  const season = `${seasonYear - 1}-${String(seasonYear).slice(-2)}`;
  const row = player.contractYears.find(contractYear => contractYear.season === season);
  const guaranteed = Number(row?.guaranteed ?? 0);
  if (!Number.isFinite(guaranteed) || guaranteed <= 0 || guaranteed > 250_000_000) return player;
  const amount = Math.round(guaranteed / 1_000);
  if (amount <= 0 || amount > 250_000 || amount === player.contract.amount) return player;
  return { ...player, contract: { ...player.contract, amount } };
}
