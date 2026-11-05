import type { NBAPlayer } from '../../types';
import { getNbaYearsOfService } from '../../utils/playerExperience';

export const WNBA_DEVELOPMENTAL_DEFAULTS = {
  maxPlayersPerTeam: 2,
  maxServiceYears: 3,
  maxGames: 12,
  weeklyStipendUSD: 750,
  activeGameBonusUSD: 6_000,
  paidWeeks: 20,
} as const;

type DevelopmentalLeagueStats = {
  uiMode?: string | null;
  developmentalContractsEnabled?: boolean | null;
  maxDevelopmentalPlayersPerTeam?: number | null;
  developmentalMaxServiceYears?: number | null;
  developmentalMaxGames?: number | null;
  developmentalWeeklyStipendUSD?: number | null;
  developmentalActiveGameBonusUSD?: number | null;
};

type DevelopmentalPlayer = {
  developmentalContract?: boolean;
  developmentalGamesPlayed?: number;
  contract?: { type?: string };
};

export function areWnbaDevelopmentalContractsEnabled(
  leagueStats?: DevelopmentalLeagueStats | null,
): boolean {
  return leagueStats?.uiMode === 'wnba_isolated'
    && leagueStats.developmentalContractsEnabled !== false;
}

export function getWnbaDevelopmentalRosterLimit(
  leagueStats?: DevelopmentalLeagueStats | null,
): number {
  if (!areWnbaDevelopmentalContractsEnabled(leagueStats)) return 0;
  return Math.max(0, Math.trunc(Number(
    leagueStats?.maxDevelopmentalPlayersPerTeam
      ?? WNBA_DEVELOPMENTAL_DEFAULTS.maxPlayersPerTeam,
  )));
}

export function getWnbaDevelopmentalGameLimit(
  leagueStats?: DevelopmentalLeagueStats | null,
): number {
  if (!areWnbaDevelopmentalContractsEnabled(leagueStats)) return 0;
  return Math.max(0, Math.trunc(Number(
    leagueStats?.developmentalMaxGames ?? WNBA_DEVELOPMENTAL_DEFAULTS.maxGames,
  )));
}

export function isWnbaDevelopmentalContract(
  player: DevelopmentalPlayer | null | undefined,
  leagueStats?: DevelopmentalLeagueStats | null,
): boolean {
  if (!areWnbaDevelopmentalContractsEnabled(leagueStats) || !player) return false;
  return player.developmentalContract === true
    || String(player.contract?.type ?? '').toUpperCase() === 'DEVELOPMENTAL';
}

export function isWnbaDevelopmentalServiceEligible(
  player: NBAPlayer,
  throughSeason: number,
  leagueStats?: DevelopmentalLeagueStats | null,
): boolean {
  const limit = Math.max(0, Math.trunc(Number(
    leagueStats?.developmentalMaxServiceYears
      ?? WNBA_DEVELOPMENTAL_DEFAULTS.maxServiceYears,
  )));
  return getNbaYearsOfService(player, throughSeason) <= limit;
}

export function getWnbaDevelopmentalBaseStipendUSD(
  leagueStats?: DevelopmentalLeagueStats | null,
): number {
  const weekly = Math.max(0, Number(
    leagueStats?.developmentalWeeklyStipendUSD
      ?? WNBA_DEVELOPMENTAL_DEFAULTS.weeklyStipendUSD,
  ));
  return Math.round(weekly * WNBA_DEVELOPMENTAL_DEFAULTS.paidWeeks);
}

export function getWnbaDevelopmentalCompensationUSD(
  player: DevelopmentalPlayer,
  leagueStats?: DevelopmentalLeagueStats | null,
): number {
  const games = Math.min(
    getWnbaDevelopmentalGameLimit(leagueStats),
    Math.max(0, Math.trunc(Number(player.developmentalGamesPlayed ?? 0))),
  );
  const bonus = Math.max(0, Number(
    leagueStats?.developmentalActiveGameBonusUSD
      ?? WNBA_DEVELOPMENTAL_DEFAULTS.activeGameBonusUSD,
  ));
  return getWnbaDevelopmentalBaseStipendUSD(leagueStats) + Math.round(games * bonus);
}

export function getWnbaDevelopmentalContractLabel(
  leagueStats?: DevelopmentalLeagueStats | null,
): 'Developmental' | 'Two-Way' {
  return areWnbaDevelopmentalContractsEnabled(leagueStats) ? 'Developmental' : 'Two-Way';
}
