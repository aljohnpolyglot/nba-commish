import type { LeagueStats, NBATeam } from '../../types';
import type {
  HistoricalWnbaState,
  WnbaFranchiseLineage,
  WnbaLeagueEvent,
  WnbaLeagueRuleSnapshot,
  WnbaTeamIdentitySnapshot,
} from './types';
import { WNBA_LEAGUE_CALENDAR } from '../leagueCalendar';
import {
  isWnbaAllStarGameSeason,
  isWnbaSkillsChallengeSeason,
  isWnbaThreePointContestSeason,
} from '../allStar/allStarEventAvailability';
import { defaultAwardSettings } from '../awards/AwardEngine';
import { getDefaultDraftLotteryType } from '../../lib/lotteryPresets';
import { getWnbaEconomySnapshot } from './economy';
import { WNBA_DEVELOPMENTAL_DEFAULTS } from './developmentalContracts';

type RawRecord = Record<string, unknown>;

const FRANCHISE_TIDS: Record<string, number[]> = {
  atlanta: [0],
  chicago: [1],
  'orlando-connecticut': [20, 2],
  'detroit-tulsa-dallas': [17, 25, 3],
  'golden-state': [4],
  indiana: [5],
  'utah-san-antonio-las-vegas': [26, 23, 24, 6],
  'los-angeles': [7],
  minnesota: [8],
  'new-york': [9],
  phoenix: [10],
  'portland-2026': [11],
  seattle: [12],
  toronto: [13],
  washington: [14],
  charlotte: [15],
  cleveland: [16],
  houston: [18],
  miami: [19],
  'portland-2000': [21],
  sacramento: [22],
};

const LINEAGES: WnbaFranchiseLineage[] = Object.entries(FRANCHISE_TIDS)
  .map(([franchiseId, tids]) => ({ franchiseId, tids }));

const FRANCHISE_BY_TID = new Map(LINEAGES.flatMap(lineage => (
  lineage.tids.map(tid => [tid, lineage.franchiseId] as const)
)));

const HISTORICAL_GAME_COUNTS: Array<[number, number, number]> = [
  [1997, 1997, 28],
  [1998, 1998, 30],
  [1999, 2002, 32],
  [2003, 2019, 34],
  [2020, 2020, 22],
  [2021, 2021, 32],
  [2022, 2022, 36],
  [2023, 2024, 40],
  [2025, 2026, 44],
];

const normalizeName = (region: unknown, name: unknown): string => (
  `${String(region ?? '').trim()} ${String(name ?? '').trim()}`.trim().replace(/\s+/g, ' ')
);

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const teamSeasons = (team: RawRecord): RawRecord[] => (
  Array.isArray(team.seasons) ? team.seasons.filter(row => row && typeof row === 'object') as RawRecord[] : []
);

const activeRows = (team: RawRecord): RawRecord[] => {
  const rows = teamSeasons(team);
  const played = rows.filter(row => asNumber(row.won) + asNumber(row.lost) > 0);
  if (played.length > 0) return played;
  return team.disabled === true ? [] : rows.filter(row => Number.isFinite(Number(row.season)));
};

export function getWnbaRuleSnapshot(
  season: number,
  knowledgeDate?: string,
): WnbaLeagueRuleSnapshot {
  const announced2027 = !knowledgeDate || knowledgeDate >= '2026-06-17';
  const gamesPerSeason = season >= 2027 && announced2027
    ? 50
    : HISTORICAL_GAME_COUNTS.find(([first, last]) => season >= first && season <= last)?.[2] ?? 44;
  if (season <= 1997) {
    return { season, gamesPerSeason, numPlayoffTeams: 4, numPlayoffByes: 0, numGamesPlayoffSeries: [1, 1], inSeasonTournament: false };
  }
  if (season <= 2004) {
    return { season, gamesPerSeason, numPlayoffTeams: 4, numPlayoffByes: 0, numGamesPlayoffSeries: [3, 3], inSeasonTournament: false };
  }
  if (season <= 2015) {
    return { season, gamesPerSeason, numPlayoffTeams: 8, numPlayoffByes: 0, numGamesPlayoffSeries: [3, 3, 5], inSeasonTournament: false };
  }
  if (season <= 2021) {
    return {
      season,
      gamesPerSeason,
      numPlayoffTeams: 8,
      numPlayoffByes: 2,
      playoffEntryRounds: [3, 3, 2, 2, 1, 1, 1, 1],
      numGamesPlayoffSeries: [1, 1, 5, 5],
      inSeasonTournament: season >= 2021,
      ...(season >= 2021 ? { cupCompetitionId: 'wnba-commissioners-cup' } : {}),
    };
  }
  return {
    season,
    gamesPerSeason,
    numPlayoffTeams: 8,
    numPlayoffByes: 0,
    numGamesPlayoffSeries: season >= 2025 ? [3, 5, 7] : [3, 5, 5],
    inSeasonTournament: true,
    cupCompetitionId: 'wnba-commissioners-cup',
    ...(season >= 2026 ? {
      tradeDeadlineMonth: 8,
      tradeDeadlineOrdinal: 1,
      tradeDeadlineDayOfWeek: 'Sun' as const,
    } : {}),
    ...(season >= 2027 ? { announcedAt: '2026-06-17' } : {}),
  };
}

export function healWnbaTransactionCalendarDefaults(leagueStats: LeagueStats): LeagueStats {
  if (leagueStats.uiMode !== 'wnba_isolated' || leagueStats.transactionCalendarRulesCustomized === true) return leagueStats;
  const rules = getWnbaRuleSnapshot(Number(leagueStats.year));
  const inheritedNbaDeadline = (leagueStats.tradeDeadlineMonth ?? 2) === 2
    && (leagueStats.tradeDeadlineOrdinal ?? 1) === 1
    && (leagueStats.tradeDeadlineDayOfWeek ?? 'Thu') === 'Thu';
  if (!inheritedNbaDeadline || rules.tradeDeadlineMonth == null) return leagueStats;
  return {
    ...leagueStats,
    tradeDeadlineMonth: rules.tradeDeadlineMonth,
    tradeDeadlineOrdinal: rules.tradeDeadlineOrdinal,
    tradeDeadlineDayOfWeek: rules.tradeDeadlineDayOfWeek,
  };
}

export function healWnbaDraftLotteryDefaults(leagueStats: LeagueStats): LeagueStats {
  if (leagueStats.uiMode !== 'wnba_isolated' || leagueStats.draftRulesCustomized === true) return leagueStats;
  const draftType = String(leagueStats.draftType ?? '');
  if (draftType.startsWith('wnba')) return leagueStats;
  return {
    ...leagueStats,
    draftType: getDefaultDraftLotteryType('wnba_isolated', Number(leagueStats.year)),
  };
}

const WNBA_RULE_DEFAULTS_VERSION = 3;
const WNBA_MINIMUM_AWARD_IDS = [
  'mvp',
  'dpoy',
  'roy',
  'mip',
  'smoy',
  'all-league',
  'all-defensive',
  'all-rookie',
];

function buildWnbaAwardSettings(leagueStats: LeagueStats, season: number, gamesPerSeason: number) {
  const defaults = defaultAwardSettings('wnba_isolated', season);
  const stored = leagueStats.awardSettings;
  const minGames = Math.max(1, Math.ceil(gamesPerSeason * 0.6));
  const playerMinimums = Object.fromEntries(
    WNBA_MINIMUM_AWARD_IDS.map(id => [id, minGames]),
  );
  return {
    ...defaults,
    ...stored,
    enabled: {
      ...defaults.enabled,
      ...(leagueStats.awardSettingsCommissionerOverrides ?? {}),
    },
    announceDates: { ...defaults.announceDates, ...stored?.announceDates },
    minGames: { ...playerMinimums, ...stored?.minGames },
  };
}

export function healWnbaAwardDefaults(leagueStats: LeagueStats): LeagueStats {
  if (
    leagueStats.uiMode !== 'wnba_isolated'
    || Number(leagueStats.wnbaRuleDefaultsVersion ?? 0) >= WNBA_RULE_DEFAULTS_VERSION
  ) return leagueStats;
  const rules = getWnbaRuleSnapshot(Number(leagueStats.year));
  return {
    ...leagueStats,
    awardSettings: buildWnbaAwardSettings(leagueStats, Number(leagueStats.year), rules.gamesPerSeason),
    wnbaRuleDefaultsVersion: WNBA_RULE_DEFAULTS_VERSION,
  };
}

export function healWnbaDevelopmentalContractDefaults(leagueStats: LeagueStats): LeagueStats {
  if (leagueStats.uiMode !== 'wnba_isolated' || Number(leagueStats.year) < 2026) return leagueStats;
  return {
    ...leagueStats,
    developmentalContractsEnabled: leagueStats.developmentalContractsEnabled ?? true,
    maxDevelopmentalPlayersPerTeam: leagueStats.maxDevelopmentalPlayersPerTeam
      ?? WNBA_DEVELOPMENTAL_DEFAULTS.maxPlayersPerTeam,
    developmentalMaxServiceYears: leagueStats.developmentalMaxServiceYears
      ?? WNBA_DEVELOPMENTAL_DEFAULTS.maxServiceYears,
    developmentalMaxGames: leagueStats.developmentalMaxGames
      ?? WNBA_DEVELOPMENTAL_DEFAULTS.maxGames,
    developmentalWeeklyStipendUSD: leagueStats.developmentalWeeklyStipendUSD
      ?? WNBA_DEVELOPMENTAL_DEFAULTS.weeklyStipendUSD,
    developmentalActiveGameBonusUSD: leagueStats.developmentalActiveGameBonusUSD
      ?? WNBA_DEVELOPMENTAL_DEFAULTS.activeGameBonusUSD,
  };
}

export function healWnbaAllStarTimingDefaults(leagueStats: LeagueStats): LeagueStats {
  if (leagueStats.uiMode !== 'wnba_isolated' || leagueStats.allStarRulesCustomized === true) return leagueStats;
  return {
    ...leagueStats,
    allStarMirrorLeagueRules: true,
    allStarGameFormat: 'timed',
    allStarQuarterLength: Number(leagueStats.quarterLength ?? 10),
    allStarNumQuarters: Number(leagueStats.numQuarters ?? 4),
    allStarOvertimeDuration: Number(leagueStats.overtimeDuration ?? 5),
  };
}

export function applyWnbaRuleSnapshot(
  leagueStats: LeagueStats,
  season: number,
  knowledgeDate?: string,
  options: { preserveConfigured?: boolean } = {},
): LeagueStats {
  const rules = getWnbaRuleSnapshot(season, knowledgeDate);
  const firstSeed = !leagueStats.wnbaRuleDefaultsVersion;
  const preserveConfigured = options.preserveConfigured === true;
  const useCalendarDefaults = firstSeed && !preserveConfigured || leagueStats.calendarRulesCustomized !== true && !preserveConfigured;
  const useTransactionCalendarDefaults = !preserveConfigured && leagueStats.transactionCalendarRulesCustomized !== true;
  const useDraftDefaults = !preserveConfigured && leagueStats.draftRulesCustomized !== true;
  const useCompetitionDefaults = firstSeed && !preserveConfigured || leagueStats.competitionRulesCustomized !== true && !preserveConfigured;
  const useAllStarDefaults = firstSeed && !preserveConfigured || leagueStats.allStarRulesCustomized !== true && !preserveConfigured;
  const economy = getWnbaEconomySnapshot(season);
  const economyDefaults = preserveConfigured ? {} : {
    salaryCapEnabled: true,
    salaryCapType: 'hard' as const,
    salaryCap: economy.salaryCap,
    luxuryTaxEnabled: false,
    luxuryTaxThresholdPercentage: 0,
    luxuryPayroll: 0,
    apronsEnabled: false,
    numberOfAprons: 0,
    firstApronAmount: 0,
    secondApronAmount: 0,
    restrictCashSendOver2ndApron: false,
    restrictAggregationOver2ndApron: false,
    restrictSignAndTradeAcquisitionOver1stApron: false,
    freezePickAt2ndApron: false,
    restrictTPEProvenanceOver2ndApron: false,
    minContractType: 'dynamic' as const,
    minContract: economy.minimum,
    minContractStaticAmount: economy.minimum / 1_000_000,
    maxContractType: 'static' as const,
    maxContract: economy.maximum,
    maxContractStaticPercentage: economy.maxPercentage,
    supermaxEnabled: true,
    supermaxPercentage: economy.superMaxPercentage,
    mleEnabled: false,
    biannualEnabled: false,
    tradeExceptionsEnabled: false,
    rookieScaleType: 'dynamic' as const,
    rookieScaleAppliesTo: 'both_rounds' as const,
    rookieContractLength: 3,
    rookieTeamOptionsEnabled: true,
    rookieTeamOptionYears: 1,
    rookieRestrictedFreeAgentEligibility: true,
    r2ContractsNonGuaranteed: true,
  };
  const developmentalDefaults = preserveConfigured ? {} : {
    developmentalContractsEnabled: season >= 2026,
    maxDevelopmentalPlayersPerTeam: season >= 2026 ? WNBA_DEVELOPMENTAL_DEFAULTS.maxPlayersPerTeam : 0,
    developmentalMaxServiceYears: WNBA_DEVELOPMENTAL_DEFAULTS.maxServiceYears,
    developmentalMaxGames: WNBA_DEVELOPMENTAL_DEFAULTS.maxGames,
    developmentalWeeklyStipendUSD: WNBA_DEVELOPMENTAL_DEFAULTS.weeklyStipendUSD,
    developmentalActiveGameBonusUSD: WNBA_DEVELOPMENTAL_DEFAULTS.activeGameBonusUSD,
  };
  return {
    ...leagueStats,
    uiMode: 'wnba_isolated',
    leagueName: leagueStats.leagueName?.trim() || 'WNBA',
    year: season,
    gamesPerSeason: useCalendarDefaults ? rules.gamesPerSeason : leagueStats.gamesPerSeason,
    numPlayoffTeams: useCalendarDefaults ? rules.numPlayoffTeams : leagueStats.numPlayoffTeams,
    numPlayoffByes: useCalendarDefaults ? rules.numPlayoffByes : leagueStats.numPlayoffByes,
    playoffEntryRounds: useCalendarDefaults ? rules.playoffEntryRounds : leagueStats.playoffEntryRounds,
    numGamesPlayoffSeries: useCalendarDefaults ? rules.numGamesPlayoffSeries : leagueStats.numGamesPlayoffSeries,
    playoffsByConf: false,
    playIn: false,
    inSeasonTournament: useCompetitionDefaults ? rules.inSeasonTournament : leagueStats.inSeasonTournament,
    nbaCupEnabled: useCompetitionDefaults ? rules.inSeasonTournament : leagueStats.nbaCupEnabled,
    cupPrizePoolEnabled: useCompetitionDefaults ? rules.inSeasonTournament : leagueStats.cupPrizePoolEnabled,
    summerLeagueEnabled: useCompetitionDefaults ? false : leagueStats.summerLeagueEnabled,
    summerLeagueTournamentEnabled: useCompetitionDefaults ? false : leagueStats.summerLeagueTournamentEnabled,
    twoWayContractsEnabled: false,
    ...developmentalDefaults,
    draftType: useDraftDefaults
      ? getDefaultDraftLotteryType('wnba_isolated', season)
      : leagueStats.draftType,
    maxTwoWayPlayersPerTeam: 0,
    ...economyDefaults,
    minGamesRequirement: useCalendarDefaults
      ? Math.max(1, Math.ceil(rules.gamesPerSeason * 0.6))
      : leagueStats.minGamesRequirement,
    tradeDeadlineMonth: useTransactionCalendarDefaults
      ? rules.tradeDeadlineMonth ?? leagueStats.tradeDeadlineMonth
      : leagueStats.tradeDeadlineMonth,
    tradeDeadlineOrdinal: useTransactionCalendarDefaults
      ? rules.tradeDeadlineOrdinal ?? leagueStats.tradeDeadlineOrdinal
      : leagueStats.tradeDeadlineOrdinal,
    tradeDeadlineDayOfWeek: useTransactionCalendarDefaults
      ? rules.tradeDeadlineDayOfWeek ?? leagueStats.tradeDeadlineDayOfWeek
      : leagueStats.tradeDeadlineDayOfWeek,
    faStartMonth: useTransactionCalendarDefaults ? 2 : leagueStats.faStartMonth,
    faStartDay: useTransactionCalendarDefaults ? 1 : leagueStats.faStartDay,
    awardSettings: buildWnbaAwardSettings(leagueStats, season, rules.gamesPerSeason),
    allStarGameEnabled: useAllStarDefaults ? isWnbaAllStarGameSeason(season) : leagueStats.allStarGameEnabled,
    allStarFormat: useAllStarDefaults ? 'captains_draft' : leagueStats.allStarFormat,
    allStarTeams: useAllStarDefaults ? 2 : leagueStats.allStarTeams,
    allStarCaptainType: useAllStarDefaults ? 'legend' : leagueStats.allStarCaptainType,
    allStarMirrorLeagueRules: useAllStarDefaults ? true : leagueStats.allStarMirrorLeagueRules,
    allStarGameFormat: useAllStarDefaults ? 'timed' : leagueStats.allStarGameFormat,
    allStarQuarterLength: useAllStarDefaults ? 10 : leagueStats.allStarQuarterLength,
    allStarNumQuarters: useAllStarDefaults ? 4 : leagueStats.allStarNumQuarters,
    allStarOvertimeDuration: useAllStarDefaults ? 5 : leagueStats.allStarOvertimeDuration,
    risingStarsEnabled: useAllStarDefaults ? false : leagueStats.risingStarsEnabled,
    celebrityGameEnabled: useAllStarDefaults ? false : leagueStats.celebrityGameEnabled,
    allStarDanceContestEnabled: useAllStarDefaults ? false : leagueStats.allStarDanceContestEnabled,
    allStarDunkContest: useAllStarDefaults ? false : leagueStats.allStarDunkContest,
    allStarThreePointContest: useAllStarDefaults ? isWnbaThreePointContestSeason(season) : leagueStats.allStarThreePointContest,
    allStarShootingStars: useAllStarDefaults ? false : leagueStats.allStarShootingStars,
    allStarSkillsChallenge: useAllStarDefaults ? isWnbaSkillsChallengeSeason(season) : leagueStats.allStarSkillsChallenge,
    allStarHorse: useAllStarDefaults ? false : leagueStats.allStarHorse,
    allStarThroneEnabled: useAllStarDefaults ? false : leagueStats.allStarThroneEnabled,
    leagueCalendar: useCalendarDefaults ? WNBA_LEAGUE_CALENDAR : leagueStats.leagueCalendar,
    confs: [],
    divs: [],
    divisionGames: 0,
    conferenceGames: 0,
    numGamesDiv: 0,
    numGamesConf: 0,
    wnbaRuleDefaultsVersion: WNBA_RULE_DEFAULTS_VERSION,
  };
}

function buildIdentityTimeline(rawTeams: RawRecord[]): WnbaTeamIdentitySnapshot[] {
  return rawTeams.flatMap(team => {
    const tid = asNumber(team.tid, -1);
    if (tid < 0) return [];
    const franchiseId = FRANCHISE_BY_TID.get(tid) ?? `wnba-${tid}`;
    const rows = activeRows(team);
    return rows.flatMap(row => {
      const season = asNumber(row.season, NaN);
      if (!Number.isFinite(season)) return [];
      return [{
        tid,
        franchiseId,
        season,
        region: String(row.region ?? team.region ?? '').trim(),
        name: String(row.name ?? team.name ?? team.abbrev ?? 'Team').trim(),
        abbrev: String(row.abbrev ?? team.abbrev ?? `W${tid}`).trim(),
        cid: asNumber(row.cid ?? team.cid, 0),
        did: asNumber(row.did ?? team.did, 0),
        active: true,
        imgURL: String(row.imgURLSmall ?? row.imgURL ?? team.imgURLSmall ?? team.imgURL ?? '').trim() || undefined,
        colors: Array.isArray(row.colors ?? team.colors) ? (row.colors ?? team.colors) as string[] : undefined,
      }];
    });
  }).sort((left, right) => left.season - right.season || left.tid - right.tid);
}

function buildEvents(identityTimeline: WnbaTeamIdentitySnapshot[], sourceSeason: number): WnbaLeagueEvent[] {
  const events: WnbaLeagueEvent[] = [];
  for (const lineage of LINEAGES) {
    const periods = lineage.tids.flatMap(tid => {
      const rows = identityTimeline.filter(row => row.tid === tid);
      if (rows.length === 0) return [];
      return [{ tid, first: rows[0], last: rows.at(-1)! }];
    }).sort((left, right) => left.first.season - right.first.season);
    periods.forEach((period, index) => {
      const previous = periods[index - 1];
      const next = periods[index + 1];
      const currentName = normalizeName(period.first.region, period.first.name);
      if (!previous) {
        events.push({
          id: `wnba-expansion-${period.first.season}-${period.tid}`,
          season: period.first.season,
          type: 'expansion',
          franchiseId: lineage.franchiseId,
          toTid: period.tid,
          title: 'Expansion Team',
          summary: `${currentName} joined the WNBA.`,
        });
      } else {
        const previousName = normalizeName(previous.last.region, previous.last.name);
        const renamed = previous.last.region === period.first.region;
        events.push({
          id: `wnba-${renamed ? 'rename' : 'relocation'}-${period.first.season}-${period.tid}`,
          season: period.first.season,
          type: renamed ? 'rename' : 'relocation',
          franchiseId: lineage.franchiseId,
          fromTid: previous.tid,
          toTid: period.tid,
          title: renamed ? 'Team Renamed' : 'Franchise Relocation',
          summary: `${previousName} became the ${currentName}.`,
        });
      }
      if (!next && period.last.season < sourceSeason) {
        events.push({
          id: `wnba-contraction-${period.last.season + 1}-${period.tid}`,
          season: period.last.season + 1,
          type: 'contraction',
          franchiseId: lineage.franchiseId,
          fromTid: period.tid,
          title: 'Franchise Ceased Operations',
          summary: `${currentName} left the WNBA.`,
        });
      }
    });
  }
  return events.sort((left, right) => left.season - right.season || left.id.localeCompare(right.id));
}

export function buildHistoricalWnbaState(raw: RawRecord, sourceSeason: number): HistoricalWnbaState {
  const rawTeams = Array.isArray(raw.teams) ? raw.teams.filter(team => team && typeof team === 'object') as RawRecord[] : [];
  const identityTimeline = buildIdentityTimeline(rawTeams);
  const ruleTimeline = Array.from({ length: Math.max(1, sourceSeason - 1996) }, (_, index) => (
    getWnbaRuleSnapshot(1997 + index, `${sourceSeason}-01-01`)
  ));
  return {
    schemaVersion: 1,
    sourceSeason,
    identityTimeline,
    franchiseLineages: LINEAGES.map(lineage => ({ ...lineage, tids: [...lineage.tids] })),
    ruleTimeline,
    events: buildEvents(identityTimeline, sourceSeason),
    commissionersCupHistory: [],
  };
}

export function getWnbaTeamIdentity(
  history: HistoricalWnbaState | undefined,
  tid: number,
  season: number,
): WnbaTeamIdentitySnapshot | undefined {
  return history?.identityTimeline
    .filter(snapshot => snapshot.tid === tid && snapshot.season <= season)
    .sort((left, right) => left.season - right.season)
    .at(-1);
}

export function getWnbaActiveTeamIds(history: HistoricalWnbaState | undefined, season: number): number[] {
  if (!history) return [];
  const active = new Set<number>();
  for (const lineage of history.franchiseLineages) {
    const snapshots = history.identityTimeline
      .filter(snapshot => lineage.tids.includes(snapshot.tid) && snapshot.season <= season)
      .sort((left, right) => left.season - right.season);
    const latest = snapshots.at(-1);
    if (!latest || latest.season !== season) continue;
    active.add(latest.tid);
  }
  return [...active];
}

export function applyWnbaIdentityToTeam(
  team: NBATeam,
  history: HistoricalWnbaState | undefined,
  season: number,
): NBATeam {
  const identity = getWnbaTeamIdentity(history, team.id, season);
  if (!identity) return team;
  return {
    ...team,
    region: identity.region,
    name: normalizeName(identity.region, identity.name),
    abbrev: identity.abbrev,
    cid: identity.cid,
    did: identity.did,
    conference: identity.cid === 0 ? 'East' : 'West',
    logoUrl: identity.imgURL ?? team.logoUrl,
    colors: identity.colors ?? team.colors,
  };
}
