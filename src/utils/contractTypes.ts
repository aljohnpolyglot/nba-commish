import type { NBAPlayer } from '../types';
import { getTwoWayRosterLimit } from './rosterLimits';
import { areWnbaDevelopmentalContractsEnabled, isWnbaDevelopmentalContract } from '../services/wnba/developmentalContracts';

export type PlayerContractType = 'guaranteed' | 'twoWay' | 'nonGuaranteed' | 'none';
export type ContractOptionKind = 'player' | 'team' | 'twoWay' | 'nonGuaranteed' | 'none';

type ContractTypeCarrier = {
  contract?: {
    amount?: number;
    exp?: number;
    rookie?: boolean;
    type?: string;
    [key: string]: unknown;
  };
  contractYears?: unknown[];
  salaries?: unknown[];
  draft?: {
    year?: number;
    round?: number;
    pick?: number;
  };
  twoWay?: boolean;
  developmentalContract?: boolean;
  developmentalGamesPlayed?: number;
  developmentalContractSeason?: number;
  nonGuaranteed?: boolean;
};

export function areTwoWayContractsEnabled(leagueStats?: unknown): boolean {
  const stats = leagueStats as any;
  if (areWnbaDevelopmentalContractsEnabled(stats)) return getTwoWayRosterLimit(stats) > 0;
  return stats?.twoWayContractsEnabled !== false && getTwoWayRosterLimit(stats) > 0;
}

export function areNonGuaranteedContractsEnabled(leagueStats?: unknown): boolean {
  return (leagueStats as any)?.nonGuaranteedContractsEnabled !== false;
}

export function hasTwoWayContractMarker(player: ContractTypeCarrier | null | undefined): boolean {
  return !!player?.twoWay || player?.contract?.type === 'TWO_WAY';
}

function getLeagueYear(leagueStats?: unknown): number | null {
  const year = Number((leagueStats as any)?.year);
  return Number.isFinite(year) && year > 0 ? year : null;
}

const contractAmountToUSD = (amount: unknown): number => {
  const value = Number(amount ?? 0);
  return Number.isFinite(value) ? value * 1000 : 0;
};

const rowMatchesLiveContract = (rowUSD: number, liveUSD: number): boolean =>
  liveUSD <= 0 || (rowUSD > 0 && Math.abs(rowUSD - liveUSD) <= Math.max(1_000, liveUSD * 0.02));

function seasonLabelToEndYear(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const range = text.match(/^(\d{4})\D+(\d{2}|\d{4})$/);
  if (range) {
    const start = Number(range[1]);
    const suffix = Number(range[2]);
    if (!Number.isFinite(start) || !Number.isFinite(suffix)) return null;
    if (range[2].length === 4) return suffix;
    return Math.floor(start / 100) * 100 + suffix + (suffix < (start % 100) ? 100 : 0);
  }
  const year = Number(text.match(/\d{4}/)?.[0]);
  return Number.isFinite(year) && year > 0 ? year : null;
}

function activeContractOptionKind(player: ContractTypeCarrier | null | undefined, leagueStats?: unknown): ContractOptionKind {
  if (!player) return 'none';
  const currentYear = getLeagueYear(leagueStats);
  const readOption = (row: any) => normalizeContractOptionKind(
    row?.option ?? row?.options ?? row?.type ?? row?.contractType ?? row?.guarantee ?? row?.guarantees,
  );
  const liveContractUSD = contractAmountToUSD(player.contract?.amount);

  const contractYears: any[] = Array.isArray(player.contractYears) ? player.contractYears : [];
  const currentContractYear = currentYear == null
    ? undefined
    : contractYears.find((row: any) => seasonLabelToEndYear(row?.season) === currentYear);
  const contractYearKind = readOption(currentContractYear);
  const contractYearUSD = Number(currentContractYear?.guaranteed ?? currentContractYear?.amount ?? 0);
  if (contractYearKind !== 'none' && rowMatchesLiveContract(contractYearUSD, liveContractUSD)) {
    return contractYearKind;
  }

  const salaries: any[] = Array.isArray(player.salaries) ? player.salaries : [];
  const currentSalary = currentYear == null
    ? undefined
    : salaries.find((row: any) => seasonLabelToEndYear(row?.season ?? row?.seasonEnd ?? row?.year) === currentYear);
  const salaryKind = readOption(currentSalary);
  const salaryUSD = contractAmountToUSD(currentSalary?.amount);
  return salaryKind !== 'none' && rowMatchesLiveContract(salaryUSD, liveContractUSD) ? salaryKind : 'none';
}

function hasActiveContractYear(player: ContractTypeCarrier | null | undefined, leagueStats?: unknown): boolean {
  if (!player) return false;
  const currentYear = getLeagueYear(leagueStats);
  const contractYears = Array.isArray(player.contractYears) ? player.contractYears : [];
  if (currentYear == null) return contractYears.length > 0;
  const liveContractUSD = contractAmountToUSD(player.contract?.amount);
  return contractYears.some((row: any) => {
    const year = seasonLabelToEndYear(row?.season);
    if (year == null || year !== currentYear) return false;
    const guaranteed = Number(row?.guaranteed ?? row?.amount ?? 0);
    if (guaranteed > 0 && !rowMatchesLiveContract(guaranteed, liveContractUSD)) return false;
    const option = normalizeContractOptionKind(row?.option ?? row?.type ?? row?.contractType);
    return guaranteed > 0 || (liveContractUSD <= 0 && option !== 'none');
  });
}

function inferredTwoWayContract(player: ContractTypeCarrier | null | undefined, leagueStats?: unknown): boolean {
  if (!player?.contract || player.nonGuaranteed) return false;
  if (normalizeContractOptionKind(player.contract.type) === 'nonGuaranteed') return false;
  const currentYear = getLeagueYear(leagueStats);
  const draftYear = Number(player.draft?.year);
  const draftRound = Number(player.draft?.round ?? 0);
  const draftPick = Number(player.draft?.pick ?? 0);
  if (currentYear == null || currentYear < 2018 || !Number.isFinite(draftYear)) return false;
  if (currentYear - draftYear < 0 || currentYear - draftYear >= 2) return false;
  if (!(draftRound === 2 || (draftRound <= 0 && draftPick <= 0))) return false;
  if (Number(player.contract.exp ?? currentYear) < currentYear) return false;

  const amountUSD = contractAmountToUSD(player.contract.amount);
  if (amountUSD <= 0) return false;
  const stats = leagueStats as { minContract?: number; minContractStaticAmount?: number } | undefined;
  const rawMinimum = Number(stats?.minContractStaticAmount ?? 0) > 0
    ? Number(stats?.minContractStaticAmount) * 1_000_000
    : Number(stats?.minContract ?? 0);
  const minimumUSD = rawMinimum > 0 && rawMinimum < 10_000 ? rawMinimum * 1000 : rawMinimum;
  const lowSalaryCeiling = Math.min(1_000_000, Math.max(900_000, minimumUSD > 0 ? minimumUSD * 0.8 : 1_000_000));
  return amountUSD <= lowSalaryCeiling;
}

export function normalizeContractOptionKind(value: unknown): ContractOptionKind {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return 'none';
  if (/\b(developmental|two[_-\s]?way|2[_-\s]?way|2w|tw)\b/.test(text)) return 'twoWay';
  if (/\b(non[_-\s]?guaranteed|unguaranteed|ng)\b/.test(text)) return 'nonGuaranteed';
  if (/\b(player[_\s]?option|player|po)\b/.test(text)) return 'player';
  if (/\b(team[_\s]?option|club[_\s]?option|team|club|to)\b/.test(text)) return 'team';
  return 'none';
}

export function getContractTimelineOptionKind(
  row: { option?: unknown; type?: unknown; contractType?: unknown },
  rowSeason: number,
  currentSeason: number,
  liveKind: ContractOptionKind = 'none',
): ContractOptionKind {
  const explicit = normalizeContractOptionKind(row.option ?? row.type ?? row.contractType);
  if (explicit !== 'none') return explicit;
  return rowSeason === currentSeason ? liveKind : 'none';
}

export function isTwoWayContract(player: ContractTypeCarrier | null | undefined, leagueStats?: unknown): boolean {
  if (areWnbaDevelopmentalContractsEnabled(leagueStats as any)) {
    return isWnbaDevelopmentalContract(player, leagueStats as any);
  }
  if (!areTwoWayContractsEnabled(leagueStats)) return false;
  const activeKind = activeContractOptionKind(player, leagueStats);
  return hasTwoWayContractMarker(player)
    || activeKind === 'twoWay'
    || (activeKind === 'none' && inferredTwoWayContract(player, leagueStats));
}

export function isNonGuaranteedContract(player: ContractTypeCarrier | null | undefined, leagueStats?: unknown): boolean {
  return areNonGuaranteedContractsEnabled(leagueStats)
    && !isTwoWayContract(player, leagueStats)
    && (!!player?.nonGuaranteed || activeContractOptionKind(player, leagueStats) === 'nonGuaranteed');
}

export function getPlayerContractType(player: ContractTypeCarrier | null | undefined, leagueStats?: unknown): PlayerContractType {
  if (!player) return 'none';
  if (isTwoWayContract(player, leagueStats)) return 'twoWay';
  if (isNonGuaranteedContract(player, leagueStats)) return 'nonGuaranteed';
  if (Number(player.contract?.amount ?? 0) > 0 || hasActiveContractYear(player, leagueStats)) return 'guaranteed';
  return 'none';
}

export function clearPlayerContractType<T extends ContractTypeCarrier>(player: T): T {
  const contract = player.contract
    ? Object.fromEntries(Object.entries(player.contract).filter(([key]) => key !== 'type'))
    : player.contract;
  return {
    ...player,
    ...(contract ? { contract } : {}),
    twoWay: undefined,
    developmentalContract: undefined,
    developmentalGamesPlayed: undefined,
    developmentalContractSeason: undefined,
    nonGuaranteed: false,
  } as T;
}

export function withPlayerContractType<T extends ContractTypeCarrier>(
  player: T,
  type: Exclude<PlayerContractType, 'none'>,
  leagueStats?: unknown,
): T {
  if (type === 'twoWay') {
    if (areWnbaDevelopmentalContractsEnabled(leagueStats as any)) {
      return {
        ...player,
        twoWay: false,
        developmentalContract: true,
        developmentalGamesPlayed: 0,
        developmentalContractSeason: Number((leagueStats as any)?.year) || undefined,
        nonGuaranteed: false,
        contract: { ...(player.contract ?? {}), type: 'DEVELOPMENTAL' },
      } as T;
    }
    return {
      ...player,
      twoWay: true,
      developmentalContract: undefined,
      developmentalGamesPlayed: undefined,
      developmentalContractSeason: undefined,
      nonGuaranteed: false,
      contract: { ...(player.contract ?? {}), type: 'TWO_WAY' },
    } as T;
  }

  const cleared = clearPlayerContractType(player);
  if (type === 'nonGuaranteed') {
    return { ...cleared, nonGuaranteed: true } as T;
  }
  return cleared;
}

export function countTwoWayContracts(players: NBAPlayer[], leagueStats?: unknown): number {
  return areTwoWayContractsEnabled(leagueStats)
    ? players.filter(player => isTwoWayContract(player, leagueStats)).length
    : 0;
}
