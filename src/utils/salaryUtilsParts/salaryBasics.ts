import type { DeadMoneyEntry, NBAPlayer, NBATeam, NonNBATeam } from '../../types';
import { EXTERNAL_SALARY_SCALE, formatExternalSalary } from '../../constants';

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
): number => {
  const livePayroll = players
    .filter(p => p.tid === teamId && !(p as any).twoWay)
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
  },
  currentYear: number,
): number {
  const currentContractUSD = contractToUSD(player.contract?.amount ?? 0);
  const currentSeasonRow = (player.contractYears ?? []).find(cy => {
    if (!cy?.season) return false;
    return seasonLabelToYear(cy.season) === currentYear;
  });
  if (!currentSeasonRow) return currentContractUSD;
  const guaranteedUSD = Math.max(0, Number(currentSeasonRow.guaranteed ?? 0));
  return guaranteedUSD > 0 ? guaranteedUSD : currentContractUSD;
}

export function sumPlayerCurrentSalariesUSD(
  players: Array<Pick<NBAPlayer, 'contract'> & {
    contractYears?: Array<{ season?: string; guaranteed?: number }>;
  }>,
  currentYear: number,
): number {
  return players.reduce((sum, player) => sum + getPlayerCurrentSalaryUSD(player, currentYear), 0);
}

export function formatPlayerSalaryDisplay(
  player: Pick<NBAPlayer, 'tid' | 'status' | 'contract'> & {
    contractYears?: Array<{ season?: string; guaranteed?: number }>;
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
  player: Pick<NBAPlayer, 'status' | 'contract'> & { pbaImportContract?: { status?: string } | null; isImport?: boolean },
  currentYear: number,
): { label: string; sortYear: number; isExpiring: boolean; isConferenceDeal: boolean } {
  if (hasActivePbaImportContract(player)) {
    return { label: 'Conf.', sortYear: currentYear, isExpiring: true, isConferenceDeal: true };
  }
  const exp = player.contract?.exp;
  if (typeof exp !== 'number') {
    return { label: '—', sortYear: 0, isExpiring: false, isConferenceDeal: false };
  }
  return { label: String(exp), sortYear: exp, isExpiring: exp <= currentYear, isConferenceDeal: false };
}
