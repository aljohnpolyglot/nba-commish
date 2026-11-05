import type { BRefTeamRecord } from '../../../data/brefFetcher';

export function resolveTeamHistoryRecord(
  teamSeason: any,
  sourceRecord: BRefTeamRecord | undefined,
): { won: number | undefined; lost: number | undefined } {
  const nativeWon = teamSeason?.won ?? teamSeason?.wins;
  const nativeLost = teamSeason?.lost ?? teamSeason?.losses;
  const nativeGames = Number(nativeWon ?? 0) + Number(nativeLost ?? 0);
  return nativeGames > 0
    ? { won: nativeWon, lost: nativeLost }
    : { won: sourceRecord?.wins, lost: sourceRecord?.losses };
}
