import type { NBAPlayer } from '../../types';
import { EURO_BASKETBALL_SOURCE_ARCHIVES } from '../../data/euroBasketballSources';
import { syncPlayerContractAmountForSeason } from '../../utils/contractSeasonSync';

export const EURO_PLAYER_WAGE_SCALE = 0.75;
export const EURO_ISOLATED_SALARY_CAP_USD = 33_750_000;

const EURO_MODE_EXTERNAL_STATUSES = new Set([
  'Euroleague',
  'Endesa',
  'PBA',
  'B-League',
  'G-League',
  'China CBA',
  'NBL Australia',
  ...EURO_BASKETBALL_SOURCE_ARCHIVES.map(source => source.leagueStatus),
]);

function scaleSalaryUSD(amount: number): number {
  return Math.max(0, Math.round(amount * EURO_PLAYER_WAGE_SCALE));
}

function shouldScaleEuroModePlayer(player: NBAPlayer): boolean {
  return EURO_MODE_EXTERNAL_STATUSES.has((player as any).status ?? '');
}

export function scaleEuroPlayerContracts(players: NBAPlayer[], seasonYear?: number): { players: NBAPlayer[]; scaledCount: number } {
  let scaledCount = 0;
  const scaledPlayers = players.map(player => {
    if (!shouldScaleEuroModePlayer(player)) return player;
    const nextAmount = Math.max(0, Math.round((player.contract?.amount ?? 0) * EURO_PLAYER_WAGE_SCALE));
    const nextYears = Array.isArray((player as any).contractYears)
      ? (player as any).contractYears.map((yearRow: any) => ({
          ...yearRow,
          guaranteed: scaleSalaryUSD(yearRow?.guaranteed ?? 0),
        }))
      : (player as any).contractYears;
    const scaledPlayer = {
      ...player,
      contract: player.contract ? { ...player.contract, amount: nextAmount } : player.contract,
      contractYears: nextYears,
    };
    const synchronizedPlayer = Number.isFinite(seasonYear)
      ? syncPlayerContractAmountForSeason(scaledPlayer, Number(seasonYear))
      : scaledPlayer;
    const amountChanged = synchronizedPlayer.contract?.amount !== (player.contract?.amount ?? 0);
    const yearsChanged = Array.isArray(nextYears) && nextYears.some((row: any, index: number) => row.guaranteed !== (player as any).contractYears?.[index]?.guaranteed);
    if (!amountChanged && !yearsChanged) return player;
    scaledCount++;
    return synchronizedPlayer;
  });
  return { players: scaledPlayers, scaledCount };
}
