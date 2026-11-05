import { seasonLabelToYear } from './salaryUtils';
import { clearPlayerContractType } from './contractTypes';

type ContractYearRow = { season?: string; guaranteed?: number; option?: string };
type ContractCarrier = { contract?: { amount?: number; exp?: number; rookie?: boolean; type?: string }; contractYears?: ContractYearRow[]; twoWay?: boolean; nonGuaranteed?: boolean };

export function historicalContractYearsBefore(player: { contractYears?: ContractYearRow[] }, seasonYear: number): ContractYearRow[] {
  return Array.isArray(player.contractYears)
    ? player.contractYears.filter(cy => {
        const yr = seasonLabelToYear(String(cy.season ?? ''));
        return Number.isFinite(yr) && yr < seasonYear;
      })
    : [];
}

export function hasLiveContractAfterWaive(player: { contract?: { amount?: number; exp?: number }; contractYears?: ContractYearRow[] }, seasonYear: number): boolean {
  const hasLiveContractYears = Array.isArray(player.contractYears)
    ? player.contractYears.some(cy => {
        const yr = seasonLabelToYear(String(cy.season ?? ''));
        return Number.isFinite(yr) && yr >= seasonYear;
      })
    : false;
  return Number(player.contract?.amount ?? 0) > 0 ||
    Number(player.contract?.exp ?? 0) > seasonYear ||
    hasLiveContractYears;
}

export function stripLiveContractAfterWaive<T extends ContractCarrier>(
  player: T,
  seasonYear: number,
): T & { contract: { amount: number; exp: number; rookie: false }; contractYears: ContractYearRow[] } {
  return clearPlayerContractType({
    ...player,
    contract: { amount: 0, exp: seasonYear, rookie: false },
    contractYears: historicalContractYearsBefore(player, seasonYear),
  });
}

export function clearWaiverMarkers<T extends object>(value: T): T & { recentlyWaivedBy?: undefined; recentlyWaivedDate?: undefined } {
  return {
    ...value,
    recentlyWaivedBy: undefined,
    recentlyWaivedDate: undefined,
  };
}
