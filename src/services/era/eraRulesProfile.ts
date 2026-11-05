import type { EraRulesProfile, LeagueStats } from '../../types';

const VERSION = 1 as const;

function earlyFictionalProfile(season: number): EraRulesProfile {
  return {
    version: VERSION,
    id: `fictional-naismith:${season}`,
    season,
    source: 'fictional-era-default',
    periodStructure: 'halves',
    periodCount: 2,
    periodLengthMinutes: 15,
    halftimeMinutes: 5,
    overtimePolicy: 'none',
    allowTies: true,
    postseasonTiebreakPolicy: 'fixed_period',
    shotClockSeconds: null,
    threePointLine: false,
    foulOutLimit: 2,
    rosterSize: 9,
    substitutionLimit: null,
    draftEnabled: false,
    lotteryEnabled: false,
    lotteryMethod: 'none',
    freeAgencyType: 'open_market',
    rfaEnabled: false,
    salaryCapEnabled: false,
    luxuryTaxEnabled: false,
    apronsEnabled: false,
    tradeDeadlineEnabled: false,
    tradeDeadlineMonth: null,
    moratoriumDays: 0,
    minContractYears: 1,
    maxContractYears: 1,
    enabledAwards: ['champion'],
    standingsMode: 'points',
    pointsForWin: 2,
    pointsForDraw: 1,
    pointsForLoss: 0,
    financialScale: 0.008,
    commissionerOverrides: {},
  };
}

function modernFictionalProfile(season: number): EraRulesProfile {
  return {
    version: VERSION,
    id: `fictional-modern:${season}`,
    season,
    source: 'fictional-era-default',
    periodStructure: 'quarters',
    periodCount: 4,
    periodLengthMinutes: 12,
    halftimeMinutes: 15,
    overtimePolicy: 'modern',
    allowTies: false,
    postseasonTiebreakPolicy: 'modern',
    shotClockSeconds: 24,
    threePointLine: true,
    foulOutLimit: 6,
    rosterSize: 15,
    substitutionLimit: null,
    draftEnabled: true,
    lotteryEnabled: true,
    lotteryMethod: 'modern_2019',
    freeAgencyType: 'modern',
    rfaEnabled: true,
    salaryCapEnabled: true,
    luxuryTaxEnabled: true,
    apronsEnabled: true,
    tradeDeadlineEnabled: true,
    tradeDeadlineMonth: 2,
    moratoriumDays: 6,
    minContractYears: 1,
    maxContractYears: 5,
    enabledAwards: ['mvp', 'dpoy', 'roy', 'mip', 'smoy', 'coy'],
    standingsMode: 'win_pct',
    pointsForWin: 0,
    pointsForDraw: 0,
    pointsForLoss: 0,
    financialScale: 1,
    commissionerOverrides: {},
  };
}

export function getEraRulesProfileDefaults(season: number): EraRulesProfile {
  return season <= 1900 ? earlyFictionalProfile(season) : modernFictionalProfile(season);
}

export function resolveEraRulesProfile(
  season: number,
  saved?: EraRulesProfile,
  commissionerOverrides: EraRulesProfile['commissionerOverrides'] = saved?.commissionerOverrides ?? {},
): EraRulesProfile {
  const base = saved?.version === VERSION && saved.season === season ? saved : getEraRulesProfileDefaults(season);
  return {
    ...base,
    ...commissionerOverrides,
    version: VERSION,
    season,
    source: Object.keys(commissionerOverrides).length > 0 ? 'commissioner-custom' : base.source,
    commissionerOverrides: { ...commissionerOverrides },
  };
}

export function applyEraRulesProfile(stats: LeagueStats, season: number): LeagueStats {
  const profile = resolveEraRulesProfile(season, stats.eraRulesProfile);
  return {
    ...stats,
    eraRulesProfile: profile,
    numQuarters: profile.periodCount,
    quarterLength: profile.periodLengthMinutes,
    overtimeEnabled: profile.overtimePolicy !== 'none',
    overtimePolicy: profile.overtimePolicy,
    allowTies: profile.allowTies,
    postseasonTiebreakPolicy: profile.postseasonTiebreakPolicy,
    shotClockEnabled: profile.shotClockSeconds != null,
    shotClockValue: profile.shotClockSeconds ?? undefined,
    threePointLineEnabled: profile.threePointLine,
    foulOutLimit: profile.foulOutLimit,
    maxPlayersPerTeam: profile.rosterSize,
    enableDraft: profile.draftEnabled,
    draftType: profile.draftEnabled
      ? profile.lotteryEnabled ? profile.lotteryMethod : 'inverse_standings'
      : 'none',
    draftLotteryEnabled: profile.lotteryEnabled,
    draftLotteryMethod: profile.lotteryMethod,
    rfaEnabled: profile.rfaEnabled,
    rfaMatchWindowDays: profile.rfaEnabled ? 2 : 0,
    autoDeclineRfaAboveSecondApron: profile.rfaEnabled && profile.apronsEnabled,
    salaryCapEnabled: profile.salaryCapEnabled,
    luxuryTaxEnabled: profile.luxuryTaxEnabled,
    apronsEnabled: profile.apronsEnabled,
    numberOfAprons: profile.apronsEnabled ? 2 : 0,
    tradeDeadlineEnabled: profile.tradeDeadlineEnabled,
    tradeDeadlineMonth: profile.tradeDeadlineMonth ?? undefined,
    faMoratoriumDays: profile.moratoriumDays,
    regularSeasonFAEnabled: profile.freeAgencyType === 'modern',
    postDeadlineMultiYearContracts: profile.freeAgencyType === 'modern',
    minContractLength: profile.minContractYears,
    maxContractLengthStandard: profile.maxContractYears,
    maxContractLengthBird: profile.maxContractYears,
    standingsMode: profile.standingsMode,
    pointsForWin: profile.pointsForWin,
    pointsForDraw: profile.pointsForDraw,
    pointsForLoss: profile.pointsForLoss,
    simulationEnginePolicy: stats.simulationEnginePolicy ?? 'hybrid',
  };
}

