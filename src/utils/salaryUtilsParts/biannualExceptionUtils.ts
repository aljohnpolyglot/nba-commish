import type { Game, LeagueStats, TeamCapExceptionUsage } from '../../types';
import { getRegularSeasonStartDate, parseGameDate } from '../dateUtils';
import type { CapThresholds } from './salaryCapUtils';

export type BiannualAcquisitionType = 'signing' | 'trade' | 'waiver';

export type BiannualBlockReason =
  | 'disabled'
  | 'under_cap'
  | 'cap_room_used'
  | 'room_mle_used'
  | 'taxpayer_mle_used'
  | 'previous_season'
  | 'first_apron'
  | 'trade_waiver_unavailable'
  | 'contract_too_long'
  | 'insufficient_exception'
  | null;

export interface BiannualExceptionAvailability {
  enabled: boolean;
  blocked: boolean;
  reasonCode: BiannualBlockReason;
  reason: string;
  limit: number;
  used: number;
  available: number;
  hardCapLevel: 'first' | null;
}

interface BiannualAvailabilityInput {
  teamId: number;
  payrollUSD: number;
  signingUSD?: number;
  contractSeasons?: number;
  acquisitionType?: BiannualAcquisitionType;
  season: number;
  currentDate?: string;
  schedule?: Game[];
  thresholds: CapThresholds;
  leagueStats: LeagueStats;
  backgroundNba?: boolean;
}

interface ConsumeBiannualInput {
  teamId: number;
  amountUSD: number;
  season: number;
  currentDate?: string;
  backgroundNba?: boolean;
}

const EMPTY_REASON: Record<Exclude<BiannualBlockReason, null>, string> = {
  disabled: 'The bi-annual exception is not active for this league year.',
  under_cap: 'Teams operating below the salary cap must use cap space.',
  cap_room_used: 'This team already operated using cap space this league year.',
  room_mle_used: 'The room mid-level exception and bi-annual exception cannot be used in the same league year.',
  taxpayer_mle_used: 'The taxpayer mid-level exception is not compatible with the first-apron hard cap.',
  previous_season: 'This team used the bi-annual exception last league year.',
  first_apron: 'This transaction would exceed the first-apron hard cap.',
  trade_waiver_unavailable: 'This league year only allows the bi-annual exception for free-agent signings.',
  contract_too_long: 'Bi-annual exception contracts may cover no more than two seasons.',
  insufficient_exception: 'The contract does not fit in the remaining bi-annual exception.',
};

const getUsageMap = (
  leagueStats: LeagueStats,
  backgroundNba = false,
): Record<number, TeamCapExceptionUsage> => (
  backgroundNba
    ? leagueStats.backgroundNbaCapExceptionUsage
    : leagueStats.capExceptionUsage
) ?? {};

const getMleUsageMap = (
  leagueStats: LeagueStats,
  backgroundNba = false,
): LeagueStats['mleUsage'] => (
  backgroundNba
    ? leagueStats.backgroundNbaMleUsage
    : leagueStats.mleUsage
) ?? {};

const getSeasonUsage = (
  leagueStats: LeagueStats,
  teamId: number,
  season: number,
  backgroundNba = false,
): TeamCapExceptionUsage => {
  const stored = getUsageMap(leagueStats, backgroundNba)[teamId];
  if (!stored) return { season };
  if (stored.season === season) return stored;
  return {
    season,
    baeLastUsedSeason: stored.baeLastUsedSeason,
  };
};

const getBiannualLimit = (leagueStats: LeagueStats, thresholds: CapThresholds): number => {
  if (typeof leagueStats.biannualPercentage === 'number') {
    return Math.max(0, Math.round(
      thresholds.salaryCap * (leagueStats.biannualPercentage / 100) / 1_000,
    ) * 1_000);
  }
  return Math.max(0, Math.round(leagueStats.biannualAmount ?? 0));
};

const getProrationFactor = (
  season: number,
  currentDate: string | undefined,
  leagueStats: LeagueStats,
  schedule: Game[] | undefined,
): number => {
  if (leagueStats.biannualProrationEnabled === false || !currentDate) return 1;
  const now = parseGameDate(currentDate);
  const prorationStart = new Date(Date.UTC(season, 0, 10));
  if (now < prorationStart) return 1;

  const scheduledEnd = (schedule ?? [])
    .filter(game => !game.isPreseason && !game.isPlayoff && !game.isPlayIn && !game.isAllStar)
    .map(game => parseGameDate(game.date))
    .filter(date => Number.isFinite(date.getTime()) && date >= getRegularSeasonStartDate(season, leagueStats, schedule))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const regularSeasonEnd = scheduledEnd ?? new Date(Date.UTC(season, 3, 15));
  const dayMs = 86_400_000;
  const totalDays = Math.max(1, Math.floor((regularSeasonEnd.getTime() - prorationStart.getTime()) / dayMs) + 1);
  const remainingDays = Math.max(0, Math.floor((regularSeasonEnd.getTime() - now.getTime()) / dayMs) + 1);
  return Math.min(1, remainingDays / totalDays);
};

const blockedAvailability = (
  reasonCode: Exclude<BiannualBlockReason, null>,
  limit: number,
  used: number,
  available = 0,
): BiannualExceptionAvailability => ({
  enabled: reasonCode !== 'disabled',
  blocked: true,
  reasonCode,
  reason: EMPTY_REASON[reasonCode],
  limit,
  used,
  available,
  hardCapLevel: null,
});

export const getBiannualExceptionAvailability = (
  input: BiannualAvailabilityInput,
): BiannualExceptionAvailability => {
  const {
    teamId,
    payrollUSD,
    signingUSD = 0,
    contractSeasons = 1,
    acquisitionType = 'signing',
    season,
    currentDate,
    schedule,
    thresholds,
    leagueStats,
    backgroundNba = false,
  } = input;
  const limit = getBiannualLimit(leagueStats, thresholds);
  const usage = getSeasonUsage(leagueStats, teamId, season, backgroundNba);
  const used = Math.max(0, usage.baeUsedUSD ?? 0);

  if (
    leagueStats.biannualEnabled === false ||
    leagueStats.salaryCapEnabled === false ||
    leagueStats.salaryCapType === 'none' ||
    limit <= 0
  ) return blockedAvailability('disabled', limit, used);
  if (payrollUSD < thresholds.salaryCap) return blockedAvailability('under_cap', limit, used);
  if (usage.usedCapRoom) return blockedAvailability('cap_room_used', limit, used);
  const mleUsage = getMleUsageMap(leagueStats, backgroundNba)?.[teamId];
  if (mleUsage?.type === 'room') return blockedAvailability('room_mle_used', limit, used);
  if (mleUsage?.type === 'taxpayer') return blockedAvailability('taxpayer_mle_used', limit, used);
  if (usage.baeLastUsedSeason === season - 1) return blockedAvailability('previous_season', limit, used);
  if (contractSeasons > 2) return blockedAvailability('contract_too_long', limit, used);
  if (
    acquisitionType !== 'signing' &&
    leagueStats.biannualTradeWaiverEnabled !== true
  ) return blockedAvailability('trade_waiver_unavailable', limit, used);

  const beforeProration = Math.max(
    0,
    usage.baeUsedBeforeProrationUSD ?? used - (usage.baeUsedAfterProrationUSD ?? 0),
  );
  const afterProration = Math.max(0, usage.baeUsedAfterProrationUSD ?? 0);
  const prorationFactor = getProrationFactor(season, currentDate, leagueStats, schedule);
  const available = Math.max(
    0,
    prorationFactor < 1
      ? Math.round((limit - beforeProration) * prorationFactor) - afterProration
      : limit - used,
  );
  if (signingUSD > available) {
    return blockedAvailability('insufficient_exception', limit, used, available);
  }

  const firstApronHardCap = leagueStats.biannualFirstApronHardCapEnabled === true;
  if (
    firstApronHardCap &&
    Number.isFinite(thresholds.firstApron) &&
    payrollUSD + signingUSD > thresholds.firstApron
  ) {
    return blockedAvailability('first_apron', limit, used, available);
  }

  return {
    enabled: true,
    blocked: available <= 0,
    reasonCode: available <= 0 ? 'insufficient_exception' : null,
    reason: available <= 0 ? EMPTY_REASON.insufficient_exception : '',
    limit,
    used,
    available,
    hardCapLevel: firstApronHardCap ? 'first' : null,
  };
};

export const consumeBiannualException = (
  leagueStats: LeagueStats,
  input: ConsumeBiannualInput,
): LeagueStats => {
  const { teamId, amountUSD, season, currentDate, backgroundNba = false } = input;
  const usageMap = getUsageMap(leagueStats, backgroundNba);
  const current = getSeasonUsage(leagueStats, teamId, season, backgroundNba);
  const parsedDate = currentDate ? parseGameDate(currentDate) : null;
  const afterProration = parsedDate != null && parsedDate >= new Date(Date.UTC(season, 0, 10));
  const nextUsage: TeamCapExceptionUsage = {
    ...current,
    season,
    baeUsedUSD: Math.max(0, current.baeUsedUSD ?? 0) + amountUSD,
    baeLastUsedSeason: season,
    baeUsedBeforeProrationUSD: Math.max(0, current.baeUsedBeforeProrationUSD ?? 0)
      + (afterProration ? 0 : amountUSD),
    baeUsedAfterProrationUSD: Math.max(0, current.baeUsedAfterProrationUSD ?? 0)
      + (afterProration ? amountUSD : 0),
    hardCapLevel: leagueStats.biannualFirstApronHardCapEnabled === true ? 'first' : current.hardCapLevel,
  };
  const nextMap = { ...usageMap, [teamId]: nextUsage };
  return backgroundNba
    ? { ...leagueStats, backgroundNbaCapExceptionUsage: nextMap }
    : { ...leagueStats, capExceptionUsage: nextMap };
};

export const recordTeamCapSpaceUse = (
  leagueStats: LeagueStats,
  teamId: number,
  season: number,
  backgroundNba = false,
): LeagueStats => {
  const usageMap = getUsageMap(leagueStats, backgroundNba);
  const current = getSeasonUsage(leagueStats, teamId, season, backgroundNba);
  const nextMap = {
    ...usageMap,
    [teamId]: { ...current, season, usedCapRoom: true },
  };
  return backgroundNba
    ? { ...leagueStats, backgroundNbaCapExceptionUsage: nextMap }
    : { ...leagueStats, capExceptionUsage: nextMap };
};

export const getTeamHardCapUSD = (
  leagueStats: LeagueStats,
  thresholds: CapThresholds,
  teamId: number,
  season: number,
  backgroundNba = false,
): number => {
  const usage = getSeasonUsage(leagueStats, teamId, season, backgroundNba);
  if (usage.hardCapLevel === 'first') return thresholds.firstApron;
  if (usage.hardCapLevel === 'second') return thresholds.secondApron;
  return Number.POSITIVE_INFINITY;
};

export const rollCapExceptionUsageToSeason = (
  usageMap: Record<number, TeamCapExceptionUsage> | undefined,
  nextSeason: number,
): Record<number, TeamCapExceptionUsage> => Object.entries(usageMap ?? {}).reduce<
  Record<number, TeamCapExceptionUsage>
>((next, [teamId, usage]) => {
  if (usage.baeLastUsedSeason === nextSeason - 1) {
    next[Number(teamId)] = {
      season: nextSeason,
      baeLastUsedSeason: usage.baeLastUsedSeason,
    };
  }
  return next;
}, {});
