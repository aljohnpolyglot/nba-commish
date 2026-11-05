import type { DeadMoneyEntry, NBAPlayer, NBATeam, NonNBATeam } from '../../types';
import { EXTERNAL_SALARY_SCALE, formatExternalSalary } from '../../constants';
import { getTwoWayRosterLimit } from '../rosterLimits';
import { hasTwoWayContractMarker, isTwoWayContract, normalizeContractOptionKind } from '../contractTypes';

export const contractToUSD = (amount: number): number => amount * 1000;

export const seasonLabelToYear = (label: string): number => parseInt(label.split('-')[0], 10) + 1;

export const getTeamDeadMoneyForSeason = (team: NBATeam | undefined, seasonYear: number): number => {
  if (!team?.deadMoney?.length) return 0;
  return team.deadMoney.reduce((sum, entry) => {
    const hit = entry.remainingByYear.find(y => seasonLabelToYear(y.season) === seasonYear);
    return sum + (hit?.amountUSD ?? 0);
  }, 0);
};

export const buildStretchedSchedule = (
  remainingByYear: DeadMoneyEntry['remainingByYear'],
  multiplier = 2,
): DeadMoneyEntry['remainingByYear'] => {
  if (!remainingByYear.length) return [];
  const totalUSD = remainingByYear.reduce((s, y) => s + y.amountUSD, 0);
  const remainingYears = remainingByYear.length;
  const stretchYears = remainingYears * multiplier + 1;
  const perYear = Math.round(totalUSD / stretchYears);
  const startYear = seasonLabelToYear(remainingByYear[0].season);
  return Array.from({ length: stretchYears }).map((_, i) => {
    const yr = startYear + i;
    return { season: `${yr - 1}-${String(yr).slice(-2)}`, amountUSD: perYear };
  });
};

export const getTeamPayrollUSD = (
  players: NBAPlayer[],
  teamId: number,
  team?: NBATeam,
  seasonYear?: number,
  leagueStats?: { twoWayContractsEnabled?: boolean | null; maxTwoWayPlayersPerTeam?: number | null; uiMode?: string | null } | null,
): number => {
  const twoWayActive = leagueStats
    ? getTwoWayRosterLimit(leagueStats) > 0
    : seasonYear == null || seasonYear >= 2018;
  const livePayroll = players
    .filter(p => {
      const isTwoWay = twoWayActive && (leagueStats
        ? isTwoWayContract(p, leagueStats)
        : hasTwoWayContractMarker(p));
      return p.tid === teamId && !isTwoWay;
    })
    .reduce((sum, p) => sum + contractToUSD(p.contract?.amount || 0), 0);
  if (!team?.deadMoney?.length) return livePayroll;
  const yr = seasonYear ?? (() => {
    let max = new Date().getUTCFullYear();
    players.forEach(p => {
      const exp = p.contract?.exp;
      if (typeof exp === 'number' && exp > max) max = exp;
    });
    return max;
  })();
  return livePayroll + getTeamDeadMoneyForSeason(team, yr);
};

export const getLeaguePayrollsUSD = (
  players: NBAPlayer[],
  teams: NBATeam[],
  seasonYear: number,
  leagueStats?: { twoWayContractsEnabled?: boolean | null; maxTwoWayPlayersPerTeam?: number | null; uiMode?: string | null } | null,
): Map<number, number> => {
  const teamIds = new Set(teams.map(team => Number(team.id)));
  const payrolls = new Map(teams.map(team => [Number(team.id), 0]));
  const twoWayActive = leagueStats
    ? getTwoWayRosterLimit(leagueStats) > 0
    : seasonYear >= 2018;
  for (const player of players) {
    const teamId = Number(player.tid);
    if (!teamIds.has(teamId)) continue;
    const isTwoWay = twoWayActive && (leagueStats
      ? isTwoWayContract(player, leagueStats)
      : hasTwoWayContractMarker(player));
    if (isTwoWay) continue;
    payrolls.set(teamId, (payrolls.get(teamId) ?? 0) + contractToUSD(player.contract?.amount || 0));
  }
  for (const team of teams) {
    const teamId = Number(team.id);
    payrolls.set(teamId, (payrolls.get(teamId) ?? 0) + getTeamDeadMoneyForSeason(team, seasonYear));
  }
  return payrolls;
};

export const formatSalaryM = (dollars: number): string =>
  `$${(dollars / 1_000_000).toFixed(1)}M`;

export const formatSalaryMPrecise = (dollars: number, decimals = 2): string =>
  `$${(dollars / 1_000_000).toFixed(decimals)}M`;

export const formatSalaryShort = (dollars: number): string =>
  dollars >= 1_000_000
    ? `$${(dollars / 1_000_000).toFixed(1)}M`
    : `$${(dollars / 1_000).toFixed(0)}K`;

export const formatContractUSD = (dollars: number): string => {
  const amount = Math.max(0, Math.round(Number.isFinite(dollars) ? dollars : 0));
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const display = millions >= 10 ? Math.round(millions).toString() : millions.toFixed(1).replace(/\.0$/, '');
    return `$${display}M`;
  }
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
};

export const formatContractTotalUSD = (annualUSD: number, years = 1): string =>
  formatContractUSD(Math.max(0, annualUSD) * Math.max(1, years));

const EXTERNAL_LEAGUES = new Set(Object.keys(EXTERNAL_SALARY_SCALE));
const salaryCloseEnough = (sourceUSD: number, liveUSD: number): boolean =>
  liveUSD <= 0 || (sourceUSD > 0 && Math.abs(sourceUSD - liveUSD) <= Math.max(1_000, liveUSD * 0.02));

function hasActivePbaImportContract(
  player: Pick<NBAPlayer, 'status' | 'contract'> & { pbaImportContract?: { status?: string } | null; isImport?: boolean },
): boolean {
  return !!player.isImport && player.status === 'PBA' && player.pbaImportContract?.status !== 'released';
}

export function getPlayerDisplayLeague(
  player: Pick<NBAPlayer, 'tid' | 'status'>,
  nonNBATeams: NonNBATeam[] = [],
): string | null {
  const teamLeague = nonNBATeams.find(t => t.tid === player.tid && (!player.status || t.league === player.status))
    ?? nonNBATeams.find(t => t.tid === player.tid);
  if (teamLeague?.league && EXTERNAL_LEAGUES.has(teamLeague.league)) return teamLeague.league;
  if (player.status && EXTERNAL_LEAGUES.has(player.status)) return player.status;
  return null;
}

export function getPlayerCurrentSalaryUSD(
  player: Pick<NBAPlayer, 'contract'> & {
    contractYears?: Array<{ season?: string; guaranteed?: number }>;
    salaries?: Array<{ season?: number | string; amount?: number; option?: string }>;
  },
  currentYear: number,
): number {
  const currentContractUSD = contractToUSD(player.contract?.amount ?? 0);
  const currentSeasonRow = (player.contractYears ?? []).find(cy => {
    if (!cy?.season) return false;
    return seasonLabelToYear(cy.season) === currentYear;
  });
  if (!currentSeasonRow) {
    const sourceSalaryRow = (player.salaries ?? []).find(row => seasonEndYearFromAny(row.season) === currentYear);
    const sourceSalaryUSD = contractToUSD(Number(sourceSalaryRow?.amount ?? 0));
    return sourceSalaryUSD > 0 && salaryCloseEnough(sourceSalaryUSD, currentContractUSD)
      ? sourceSalaryUSD
      : currentContractUSD;
  }
  const guaranteedUSD = Math.max(0, Number(currentSeasonRow.guaranteed ?? 0));
  return guaranteedUSD > 0 ? guaranteedUSD : currentContractUSD;
}

function seasonEndYearFromAny(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const range = text.match(/^(\d{4})\D+(\d{2}|\d{4})$/);
  if (range) return seasonLabelToYear(text);
  const exact = text.match(/^\d{4}$/);
  if (exact) return Number(exact[0]);
  const year = Number(text.match(/\d{4}/)?.[0]);
  return Number.isFinite(year) && year > 0 ? year : null;
}

function activeSourceContractEndYear(
  player: {
    contract?: { amount?: number };
    contractYears?: Array<{ season?: string; guaranteed?: number; option?: string; type?: string; contractType?: string }>;
    salaries?: Array<{ season?: number | string; seasonEnd?: number | string; year?: number | string; amount?: number; option?: string; type?: string; contractType?: string }>;
  },
  currentYear: number,
): number | null {
  const liveContractUSD = contractToUSD(Number(player.contract?.amount ?? 0));
  const contractYears = player.contractYears ?? [];
  const currentContractYear = contractYears.find(row => seasonEndYearFromAny(row.season) === currentYear);
  if (currentContractYear) {
    const currentGuaranteed = Math.max(0, Number(currentContractYear.guaranteed ?? 0));
    if (!salaryCloseEnough(currentGuaranteed, liveContractUSD)) return null;
    const maxYear = contractYears.reduce((max, row) => {
      const year = seasonEndYearFromAny(row.season);
      if (year == null || year < currentYear) return max;
      const guaranteed = Math.max(0, Number(row.guaranteed ?? 0));
      const option = normalizeContractOptionKind(row.option ?? row.type ?? row.contractType);
      return guaranteed > 0 || option !== 'none' ? Math.max(max, year) : max;
    }, 0);
    if (maxYear > 0) return maxYear;
  }

  const salaries = player.salaries ?? [];
  const currentSalaryYear = salaries.find(row => seasonEndYearFromAny(row.season ?? row.seasonEnd ?? row.year) === currentYear);
  if (!currentSalaryYear) return null;
  const currentSourceSalaryUSD = contractToUSD(Number(currentSalaryYear.amount ?? 0));
  if (currentSourceSalaryUSD > 0 && !salaryCloseEnough(currentSourceSalaryUSD, liveContractUSD)) return null;
  const maxSalaryYear = salaries.reduce((max, row) => {
    const year = seasonEndYearFromAny(row.season ?? row.seasonEnd ?? row.year);
    if (year == null || year < currentYear) return max;
    const amountUSD = contractToUSD(Number(row.amount ?? 0));
    const option = normalizeContractOptionKind(row.option ?? row.type ?? row.contractType);
    return amountUSD > 0 || option !== 'none' ? Math.max(max, year) : max;
  }, 0);
  return maxSalaryYear > 0 ? maxSalaryYear : null;
}

export function sumPlayerCurrentSalariesUSD(
  players: Array<Pick<NBAPlayer, 'contract'> & {
    contractYears?: Array<{ season?: string; guaranteed?: number }>;
    salaries?: Array<{ season?: number | string; amount?: number; option?: string }>;
  }>,
  currentYear: number,
): number {
  return players.reduce((sum, player) => sum + getPlayerCurrentSalaryUSD(player, currentYear), 0);
}

export function formatPlayerSalaryDisplay(
  player: Pick<NBAPlayer, 'tid' | 'status' | 'contract'> & {
    contractYears?: Array<{ season?: string; guaranteed?: number }>;
    salaries?: Array<{ season?: number | string; amount?: number; option?: string }>;
  },
  currentYear: number,
  nonNBATeams: NonNBATeam[] = [],
): string {
  const salaryUSD = getPlayerCurrentSalaryUSD(player, currentYear);
  if (salaryUSD <= 0) return '—';
  const league = getPlayerDisplayLeague(player, nonNBATeams);
  return league ? formatExternalSalary(salaryUSD, league) : formatSalaryShort(salaryUSD);
}

export function getPlayerContractExpiryDisplay(
  player: Pick<NBAPlayer, 'status' | 'contract'> & {
    pbaImportContract?: { status?: string } | null;
    isImport?: boolean;
    contractYears?: Array<{ season?: string; guaranteed?: number; option?: string; type?: string; contractType?: string }>;
    salaries?: Array<{ season?: number | string; seasonEnd?: number | string; year?: number | string; amount?: number; option?: string; type?: string; contractType?: string }>;
  },
  currentYear: number,
): { label: string; sortYear: number; isExpiring: boolean; isConferenceDeal: boolean } {
  if (hasActivePbaImportContract(player)) {
    return { label: 'Conf.', sortYear: currentYear, isExpiring: true, isConferenceDeal: true };
  }
  const sourceExp = activeSourceContractEndYear(player, currentYear);
  const exp = sourceExp ?? player.contract?.exp;
  if (typeof exp !== 'number') {
    return { label: '—', sortYear: 0, isExpiring: false, isConferenceDeal: false };
  }
  return { label: String(exp), sortYear: exp, isExpiring: exp <= currentYear, isConferenceDeal: false };
}
