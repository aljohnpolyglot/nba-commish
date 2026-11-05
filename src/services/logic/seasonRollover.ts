import { type GameState, type HistoryEntry, type NBAPlayer } from '../../types';
import { recordSimulationPerf } from '../simulation/simulationPerfDebug';
import { advanceBackgroundUniverse, getActiveNativeTeamIds } from '../backgroundUniverse/backgroundSeasonGenerator';
import { reconcileBackgroundNativeTeams } from '../backgroundUniverse/backgroundNativeTransition';
import { DEFAULT_CAP_INFLATION_AVERAGE, INITIAL_LEAGUE_STATS } from '../../constants';
import { getHistoricalNbaRuleOverrides, getRecordedHistoricalNbaSalaryCap, isHistoricalNbaStart } from '../../data/historicalNbaSeasons';
import { applyCapInflation } from '../../utils/finance/inflationUtils';
import { getFreeAgencyStartDate, getRolloverDate, toISODateString, formatGameDateShort } from '../../utils/dateUtils';
import { timelineInputFromState } from '../../utils/historicalTimeline';
import { mergeTeamArchive } from '../../utils/teamArchive';
import { applyTeamIdentitiesForTimeline } from '../../utils/teamAssets';
import { buildGovernorsBoardMeeting } from '../governorsBoard/governorsBoardMeeting';
import { getOffseasonState, isDraftBeforeSeasonOpening, logOffseasonDrift } from '../offseason/offseasonState';
import { hasUnresolvedEuroSeasonCompetitions, type CompetitionSeasonResolution } from '../competition/competitionResolver';
import { deriveLeagueStartYearFromHistory } from '../playerDevelopment/jerseyRetirementChecker';
import { buildHistoricalNonPlayerCoachPoolAdditions } from '../staff/historicalCoachPool';
import { HISTORICAL_NBA_EXECUTIVES_VERSION, refreshHistoricalNbaGeneralManagers, shouldUseHistoricalNbaExecutives } from '../staff/historicalNbaExecutives';
import { generateDraftPicksForTeamIdsAndSeasons, generateFuturePicks, getDraftRoundsForLeague, pruneExpiredPicks, DEFAULT_TRADABLE_PICK_SEASONS } from '../draft/DraftPickGenerator';
import { buildSeasonRolloverNewsAndPruning } from './seasonRollover/newsAndPruning';
import { getBasketballEraRules, getHistoricalBasketballGameRuleOverrides } from '../era/basketballEraRules';
import { runSeasonRolloverPlayerPass } from './seasonRollover/playerPass';
import { runSeasonRolloverTeamPass } from './seasonRollover/teamPass';
import { applyHistoricalNbaContractions, applyHistoricalNbaTeamStructure } from '../historicalNbaTeamLifecycle';
import { finalizeHistoricalNbaSeason } from '../historicalNbaSeasonFinalizer';
import { applyHistoricalNbaInjuryProfilePolicy } from '../../utils/durabilityUtils';
import { rollCapExceptionUsageToSeason } from '../../utils/salaryUtils';
import { appendAllStarHistorySnapshot } from '../allStar/allStarHistorySnapshot';
import { resolveStandingsChampion } from './standingsChampion';
import { finalizeEuroSeasonAwards } from './euroAwardAnnouncer';
import { buildEuroLeagueAssemblyMeeting } from '../euro/leagueAssembly';
import { isEuroIsolatedMode } from '../../utils/uiMode';
import { simDebug } from '../../utils/simDebug';
import { applyEuroDomesticRelegation } from '../euro/domesticRelegation';
import { selectNextDomesticTournamentParticipants } from '../euro/domesticCompetitionQualification';
import { applyPbaScopedSeasonRollover } from '../pba/seasonRollover';
import { getPbaDraftPickYears } from '../pba/draftCalendar';
import { buildRetirementAnnouncementEvents } from '../news/nativeLeagueAnnouncements';
import { graduateEuroAcademyPlayersToFreeAgency, promoteEuroAcademyPlayers } from '../euroScouting/pipeline';
import { advanceAwardSettingsForSeason } from '../awards/awardEraProgression';
import { runRefereeRollover } from '../referees/refereeRoster';
import { setRefereeData } from '../../data/photos/referees';
import { runBroadcastTalentRollover } from '../broadcasting/broadcastTalent';
import { prepareExternalNbaDraftDeclarations } from '../euroScouting/nbaDraft';
import { advanceSummerLeagueEraSettings } from '../summerLeague/availability';
import { authorizeNextSeasonBudget } from './leagueTreasury';
import { applyWnbaRuleSnapshot } from '../wnba/history';
import { buildWnbaGovernorsBoardMeeting } from '../wnba/governorsBoard';
import {
  assignCupGroups,
  buildWnbaStyleCupFormat,
  createCupCompetitionState,
  getCupCompetitionState,
  setCupCompetitionState,
  type CupCompetitionFormat,
} from '../competition/cup';
import { findCupPrizePool } from '../governorsBoard/cupPrizePool';
import { buildGmCareerRollover } from '../gmCareer/careerService';
import { finalizeEnabledStaffAwards } from '../awards/AwardEngine';
import { projectSeasonRolloverLeagueState } from './seasonRollover/leagueScope';
import {
  canActivateNextSeason,
  getLeagueLifecycleMode,
  isCanonicalDraftComplete,
  lifecycleAfterSeasonTransition,
} from '../lifecycle/leagueSeasonLifecycle';
import { applyHistoricalNationalityTransitionPass } from '../identity/historicalNationality';
import { resolveBirdRightsForTeam } from '../../utils/playerBirdRights';

export interface SeasonRolloverDiagnostics {
  invocations: number;
  mutations: number;
  attempts: Array<{
    activeSeason: number;
    date?: string;
    leagueYear: number;
    mutated: boolean;
    owner?: 'euro-season-review';
    reason: 'applied' | 'lifecycle-guard' | 'rollover-date-guard' | 'euro-owner-guard';
  }>;
}

let seasonRolloverDiagnostics: SeasonRolloverDiagnostics = {
  invocations: 0,
  mutations: 0,
  attempts: [],
};

export function resetSeasonRolloverDiagnostics(): void {
  seasonRolloverDiagnostics = { invocations: 0, mutations: 0, attempts: [] };
}

export function getSeasonRolloverDiagnostics(): SeasonRolloverDiagnostics {
  return {
    ...seasonRolloverDiagnostics,
    attempts: seasonRolloverDiagnostics.attempts.map(attempt => ({ ...attempt })),
  };
}

function recordSeasonRolloverAttempt(
  state: GameState,
  owner: 'euro-season-review' | undefined,
  reason: SeasonRolloverDiagnostics['attempts'][number]['reason'],
  mutated: boolean,
): void {
  seasonRolloverDiagnostics.invocations += 1;
  if (mutated) seasonRolloverDiagnostics.mutations += 1;
  seasonRolloverDiagnostics.attempts.push({
    activeSeason: Number(state.seasonLifecycle?.activeSeason ?? state.leagueStats.year),
    date: state.date ? String(state.date) : undefined,
    leagueYear: Number(state.leagueStats.year),
    mutated,
    owner,
    reason,
  });
}

function getRolloverDiagnosticPhases(state: GameState) {
  const mode = getLeagueLifecycleMode(state);
  if (mode === 'pba') return ['preCamp', 'postDraft', 'moratorium'] as const;
  if (mode === 'wnba') return ['preDraft'] as const;
  if (mode === 'euro' || mode === 'fictional') return ['postDraft', 'moratorium', 'openFA'] as const;
  return ['postDraft', 'moratorium'] as const;
}

function computeBirdRightsForRollover(
  player: NBAPlayer,
  leagueStats: GameState['leagueStats'],
  yearsCompleted: number,
): boolean {
  if (leagueStats.birdRightsEnabled === false) return false;
  const latestServiceSeason = ((player as any).stats ?? []).reduce(
    (max: number, row: { season?: number; playoffs?: boolean; gp?: number }) => (
      !row.playoffs && Number(row.gp ?? 0) > 0 ? Math.max(max, Number(row.season ?? 0)) : max
    ),
    0,
  );
  if (latestServiceSeason > 0 && player.tid >= 0 && player.tid < 100) {
    return resolveBirdRightsForTeam(player, player.tid, latestServiceSeason);
  }
  return yearsCompleted >= 3 || (player as any).hasBirdRights === true;
}

function isHistoricalNbaRollover(state: GameState): boolean {
  const nbaStartYear = Number(state.nbaStartYear ?? 0);
  return state.leagueType === 'modded' &&
    state.moddedLeagueBase === 'nba' &&
    isHistoricalNbaStart(nbaStartYear);
}

function isWnbaIsolatedRollover(state: GameState): boolean {
  return state.leagueStats?.uiMode === 'wnba_isolated';
}

function buildNextWnbaCupCompetitions(
  state: GameState,
  teams: GameState['teams'],
  season: number,
  leagueStats: GameState['leagueStats'],
) {
  if (leagueStats.inSeasonTournament !== true) return state.cupCompetitions;
  const scope = { leagueId: 'wnba', competitionId: 'wnba-commissioners-cup' };
  const previous = getCupCompetitionState(state.cupCompetitions, scope);
  const previousGroupByTid = new Map((previous?.groups ?? []).flatMap(group => (
    group.tids.map(tid => [tid, group.groupId] as const)
  )));
  const previousSeedByTid = new Map([...state.teams]
    .sort((left, right) => right.wins - left.wins || left.losses - right.losses || left.id - right.id)
    .map((team, index) => [team.id, index + 1] as const));
  const pool = findCupPrizePool(state.cupPrizePools ?? [], scope.leagueId, scope.competitionId);
  const baseFormat = buildWnbaStyleCupFormat(teams.length, scope.leagueId, scope.competitionId);
  const format: CupCompetitionFormat = pool?.enabled
    ? {
        ...baseFormat,
        prizePool: {
          currency: pool.currencyCode as NonNullable<CupCompetitionFormat['prizePool']['currency']>,
          winner: pool.perPlayerByFinish.winner,
          runnerUp: pool.perPlayerByFinish.runnerUp,
          semiFinalist: pool.perPlayerByFinish.semi,
          quarterFinalist: pool.perPlayerByFinish.quarter,
        },
      }
    : baseFormat;
  const groups = assignCupGroups(format, teams.map(team => ({
    tid: team.id,
    seed: previousSeedByTid.get(team.id),
    groupHint: previousGroupByTid.get(team.id),
  }))).groups;
  const next = {
    ...createCupCompetitionState(format, season, groups),
    history: [...(previous?.history ?? [])],
  };
  return setCupCompetitionState(state.cupCompetitions, next);
}

export function getHistoricalRolloverRuleOverrides(
  state: GameState,
  nextYear: number,
): Partial<GameState['leagueStats']> | null {
  const startYear = nextYear - 1;
  if (!isHistoricalNbaRollover(state)) {
    if (!state.leagueStats.historicalGameRulesAutoProgression || state.leagueStats.gameRulesCustomized) return null;
    const basketballEra = getBasketballEraRules(startYear);
    return {
      ...getHistoricalBasketballGameRuleOverrides(startYear),
      year: nextYear,
      historicalEraKey: basketballEra.key,
      historicalEraStartYear: startYear,
    };
  }
  const overrides = getHistoricalNbaRuleOverrides(startYear) as Partial<GameState['leagueStats']>;
  if (getRecordedHistoricalNbaSalaryCap(startYear) != null || overrides.salaryCapEnabled === false) {
    return overrides;
  }
  return {
    ...overrides,
    ...state.leagueStats,
    year: nextYear,
    historicalEraKey: overrides.historicalEraKey,
    historicalEraStartYear: startYear,
  };
}

export function getEuroAcademyAgeOutIds(state: GameState, nextYear: number): string[] {
  if (!isEuroIsolatedMode(state)) return [];
  return (state.euroScouting?.academyPlayers ?? [])
    .filter(player => {
      const age = player.born?.year ? nextYear - Number(player.born.year) : Number(player.age ?? 0) + 1;
      return Number.isFinite(age) && age >= 19;
    })
    .map(player => String(player.internalId));
}

function applySharedSeasonRollover(state: GameState): Partial<GameState> {
  if (state.date) {
    const offseasonState = getOffseasonState(
      state.date,
      state.leagueStats as any,
      state.schedule as any,
      { playoffsActive: hasUnresolvedEuroSeasonCompetitions(state as any), draftComplete: isCanonicalDraftComplete(state) },
    );
    logOffseasonDrift(
      'seasonRollover.applySeasonRollover',
      getRolloverDiagnosticPhases(state),
      offseasonState.phase,
      `date=${offseasonState.dateStr}`,
    );
  }

  const currentYear = state.leagueStats.year;
  const backgroundStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const priorBackgroundSeasonCount = state.backgroundUniverse?.seasons.length ?? 0;
  const backgroundUniverse = advanceBackgroundUniverse(state, currentYear);
  const backgroundElapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - backgroundStartedAt;
  const materializedBackgroundSeasons = backgroundUniverse.seasons.slice(priorBackgroundSeasonCount);
  simDebug('background', () => (
    `Advanced ${new Set(materializedBackgroundSeasons.map(row => row.leagueId)).size} background leagues `
    + `and materialized ${materializedBackgroundSeasons.length} season rows in ${backgroundElapsedMs.toFixed(1)} ms.`
  ), {
    activePipeline: state.leagueStats.uiMode ?? 'nba',
    backgroundLeaguesAdvanced: new Set(materializedBackgroundSeasons.map(row => row.leagueId)).size,
    backgroundSeasonsMaterialized: materializedBackgroundSeasons.length,
    fullPbaNativePasses: state.leagueStats.uiMode === 'pba_isolated' ? 1 : 0,
    fullEuroNativePasses: state.leagueStats.uiMode === 'euro_isolated' ? 1 : 0,
    backgroundAdvancementMs: backgroundElapsedMs,
  });
  recordSimulationPerf({
    engine: 'background-universe',
    season: currentYear,
    backgroundUniverseMs: Math.round(backgroundElapsedMs * 10) / 10,
    leagues: new Set(materializedBackgroundSeasons.map(row => row.leagueId)).size,
    seasons: materializedBackgroundSeasons.length,
  });
  const rolloverScope = projectSeasonRolloverLeagueState(state);
  state = rolloverScope.state;
  const resetDraftCycleAtRollover = isDraftBeforeSeasonOpening(currentYear, state.leagueStats);
  const currentNativeTeamIds = getActiveNativeTeamIds(state);
  const nextYear = currentYear + 1;
  state = finalizeHistoricalNbaSeason(state, currentYear);
  state = finalizeEnabledStaffAwards(state);
  state = resolveStandingsChampion(state);
  const historicalRolloverRuleOverrides = getHistoricalRolloverRuleOverrides(state, nextYear);
  const baseNextRuleLeagueStats = historicalRolloverRuleOverrides
    ? { ...state.leagueStats, ...historicalRolloverRuleOverrides, year: nextYear } as GameState['leagueStats']
    : { ...state.leagueStats, year: nextYear } as GameState['leagueStats'];
  const nextRuleLeagueStatsBase = advanceSummerLeagueEraSettings(
    advanceAwardSettingsForSeason(baseNextRuleLeagueStats, nextYear),
    nextYear,
  );
  const nextRuleLeagueStats = isWnbaIsolatedRollover(state)
    ? applyWnbaRuleSnapshot(nextRuleLeagueStatsBase, nextYear, state.wnbaKnowledgeCutoffDate)
    : nextRuleLeagueStatsBase;
  const leagueStartYear = deriveLeagueStartYearFromHistory(state.history, currentYear);

  const freeAgencyStartDate = getFreeAgencyStartDate(currentYear, state.leagueStats as any);
  const optionDecisionDate = new Date(freeAgencyStartDate.getTime() - 86_400_000);
  const optionDateStr = formatGameDateShort(optionDecisionDate);

  state = prepareExternalNbaDraftDeclarations(state, nextYear);
  const playerPass = runSeasonRolloverPlayerPass({
    state,
    currentYear,
    nextYear,
    leagueStartYear,
    optionDateStr,
    nextLeagueStats: nextRuleLeagueStats,
    externalLeagueLifecycleEnabled: rolloverScope.playerScope === 'pba' || rolloverScope.playerScope === 'euro',
    computeBirdRightsForRollover,
  });
  const playersAfterOffseasonFatigueReset = playerPass.playersFinalized.map(player => {
    if ((player as any).trainingFatigue == null || (player as any).trainingFatigue === 0) return player;
    return { ...player, trainingFatigue: 0 } as NBAPlayer;
  });
  const euroSeasonAwards = isEuroIsolatedMode(state)
    ? finalizeEuroSeasonAwards({ ...state, players: playersAfterOffseasonFatigueReset })
    : {
        players: playersAfterOffseasonFatigueReset,
        historicalAwards: state.historicalAwards,
        teams: state.teams,
        nonNBATeams: state.nonNBATeams,
        staff: state.staff,
      };
  const playersAfterSeasonAwards = euroSeasonAwards.players;
  const academyAgeOutIds = getEuroAcademyAgeOutIds(state, nextYear);
  const academyPromotion = academyAgeOutIds.length > 0
    ? promoteEuroAcademyPlayers({ ...state, players: playersAfterSeasonAwards, leagueStats: nextRuleLeagueStats }, academyAgeOutIds)
    : { state: { ...state, players: playersAfterSeasonAwards }, promotedIds: [], blockedIds: [], duplicateIds: [] };
  const duplicateAcademyIds = new Set(academyPromotion.duplicateIds);
  const rosterBlockedAcademyIds = academyPromotion.blockedIds.filter(playerId => !duplicateAcademyIds.has(playerId));
  const academyFreeAgency = graduateEuroAcademyPlayersToFreeAgency(academyPromotion.state, rosterBlockedAcademyIds);
  const playersAfterAcademyTransition = academyFreeAgency.state.players;
  const academyPlayerNames = new Map((state.euroScouting?.academyPlayers ?? []).map(player => [String(player.internalId), player.name]));
  const academyPromotionHistory = (academyFreeAgency.state.history ?? []).slice((state.history ?? []).length);
  const academyPromotionToasts = [
    ...academyPromotion.promotedIds.map(playerId => ({
      playerName: academyPlayerNames.get(playerId) ?? 'Academy player',
      promoted: true,
      reason: 'reached the academy age limit',
    })),
    ...academyFreeAgency.releasedIds.map(playerId => ({
      playerName: academyPlayerNames.get(playerId) ?? 'Academy player',
      promoted: false,
      releasedToFreeAgency: true,
      reason: 'the senior roster was full',
    })),
    ...academyPromotion.duplicateIds.map(playerId => ({
      playerName: academyPlayerNames.get(playerId) ?? 'Academy player',
      promoted: false,
      reason: 'already exists in the senior squad',
    })),
  ];

  const leagueStats = state.leagueStats;
  let newSalaryCap = leagueStats.salaryCap ?? INITIAL_LEAGUE_STATS.salaryCap;
  let newLuxuryPayroll = leagueStats.luxuryPayroll ?? Math.round(newSalaryCap * (leagueStats.luxuryTaxThresholdPercentage ?? 121.5) / 100);
  let newFirstApron = (leagueStats.firstApronAmount ?? 0) > 0
    ? leagueStats.firstApronAmount
    : leagueStats.firstApronPercentage != null
      ? Math.round(newSalaryCap * leagueStats.firstApronPercentage / 100)
      : undefined;
  let newSecondApron = (leagueStats.secondApronAmount ?? 0) > 0
    ? leagueStats.secondApronAmount
    : leagueStats.secondApronPercentage != null
      ? Math.round(newSalaryCap * leagueStats.secondApronPercentage / 100)
      : undefined;
  let newMinContract = leagueStats.minContractStaticAmount ?? 1.273;
  let inflationPctApplied = 0;

  if (leagueStats.inflationEnabled ?? true) {
    const { thresholds, pct } = applyCapInflation(
      {
        salaryCap: newSalaryCap,
        luxuryPayroll: newLuxuryPayroll,
        firstApron: newFirstApron,
        secondApron: newSecondApron,
        minContract: Math.round(newMinContract * 1_000_000),
      },
      {
        inflationMin: leagueStats.inflationMin ?? 0,
        inflationMax: leagueStats.inflationMax ?? 10,
        inflationAverage: leagueStats.inflationAverage ?? DEFAULT_CAP_INFLATION_AVERAGE,
        inflationStdDev: leagueStats.inflationStdDev ?? 2.0,
      },
    );
    inflationPctApplied = pct;
    newSalaryCap = thresholds.salaryCap;
    newLuxuryPayroll = thresholds.luxuryPayroll;
    newFirstApron = thresholds.firstApron;
    newSecondApron = thresholds.secondApron;
    newMinContract = (thresholds.minContract ?? Math.round(newMinContract * 1_000_000)) / 1_000_000;
  }

  if (historicalRolloverRuleOverrides) {
    const historicalStartYear = nextYear - 1;
    const historicalCap = getRecordedHistoricalNbaSalaryCap(historicalStartYear);
    if (historicalCap != null) {
      newSalaryCap = historicalCap;
      newLuxuryPayroll = Math.round(historicalCap * ((nextRuleLeagueStats.luxuryTaxThresholdPercentage ?? 121.5) / 100));
      newFirstApron = nextRuleLeagueStats.firstApronPercentage != null
        ? Math.round(historicalCap * nextRuleLeagueStats.firstApronPercentage / 100)
        : undefined;
      newSecondApron = nextRuleLeagueStats.secondApronPercentage != null
        ? Math.round(historicalCap * nextRuleLeagueStats.secondApronPercentage / 100)
        : undefined;
    } else if (nextRuleLeagueStats.salaryCapEnabled === false || nextRuleLeagueStats.salaryCapType === 'none') {
      newSalaryCap = 0;
      newLuxuryPayroll = 0;
      newFirstApron = undefined;
      newSecondApron = undefined;
    }
  }
  const previousSalaryCap = state.leagueStats.salaryCap ?? 0;
  const capPctApplied = previousSalaryCap > 0 && newSalaryCap > 0
    ? ((newSalaryCap / previousSalaryCap) - 1) * 100
    : inflationPctApplied;

  const windowSize = state.leagueStats.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
  const nbaTeams = (state.teams ?? []).filter(team => team.id >= 0 && team.id < 100);
  const updatedPicks = (() => {
    if (rolloverScope.playerScope === 'euro') return state.draftPicks ?? [];
    const prunedPicks = pruneExpiredPicks(state.draftPicks ?? [], currentYear);
    const nbaUpdatedPicks = generateFuturePicks(
      prunedPicks,
      nbaTeams as any,
      nextYear,
      windowSize,
      resetDraftCycleAtRollover,
      getDraftRoundsForLeague(state.leagueStats),
    );
    const pbaTeamIds = (state.nonNBATeams ?? []).filter((team: any) => team.league === 'PBA').map((team: any) => team.tid);
    return pbaTeamIds.length > 0
      ? generateDraftPicksForTeamIdsAndSeasons(
          nbaUpdatedPicks,
          pbaTeamIds,
          getPbaDraftPickYears(nextYear, windowSize),
          2,
        )
      : nbaUpdatedPicks;
  })();

  const newsAndPruning = buildSeasonRolloverNewsAndPruning({
    state,
    currentYear,
    nextYear,
    newSalaryCap,
    inflationPctApplied: capPctApplied,
    expiredCount: playerPass.expiredIds.size,
    optionDateStr,
    playerOptionNews: playerPass.playerOptionNews,
    teamOptionNews: playerPass.teamOptionNews,
    newRetirees: playerPass.newRetirees,
    newFarewells: playerPass.newFarewells,
    newInductees: playerPass.newInductees,
    newJerseyRetirements: playerPass.newJerseyRetirements,
    deaths: playerPass.deaths,
    familyLineageEvents: playerPass.familyLineageEvents,
  });

  const shouldUseHistoricalCoachPool = state.leagueType === 'modded' &&
    state.moddedLeagueBase === 'nba' &&
    (!state.leagueStats?.uiMode || state.leagueStats.uiMode === 'nba');
  const historicalCoachPool = shouldUseHistoricalCoachPool
    ? buildHistoricalNonPlayerCoachPoolAdditions({
        state: { ...state, players: playersAfterAcademyTransition },
        currentYear: nextYear,
        staffFreeAgents: [
          ...playerPass.newRetireeStaffCandidates,
          ...(state.staffFreeAgents ?? []),
        ],
      })
    : {
        additions: [],
        joinedKeys: ((state.leagueStats as any)?.historicalCoachPoolJoinedKeys ?? []) as string[],
      };

  const staffFreeAgentsForHiring = [
    ...playerPass.newRetireeStaffCandidates,
    ...historicalCoachPool.additions,
    ...(state.staffFreeAgents ?? []),
  ];

  const teamPassBaseState = {
    ...state,
    teams: euroSeasonAwards.teams,
    nonNBATeams: euroSeasonAwards.nonNBATeams,
    staff: euroSeasonAwards.staff,
  } as GameState;
  const teamPassState = historicalRolloverRuleOverrides
    ? { ...teamPassBaseState, leagueStats: nextRuleLeagueStats } as GameState
    : teamPassBaseState;
  const teamPass = runSeasonRolloverTeamPass({
    state: teamPassState,
    currentYear,
    nextYear,
    teamsAfterJerseyRetirements: playerPass.teamsAfterJerseyRetirements,
    playersFinalized: playersAfterAcademyTransition,
    staffFreeAgentsForHiring,
  });
  const consumedStaffFreeAgentIds = new Set([
    ...teamPass.nbaStaffLifecycle.consumedFreeAgentIds,
    ...teamPass.pbaStaffHiring.consumedFreeAgentIds,
    ...teamPass.euroCoachHiring.consumedFreeAgentIds,
  ]);
  const employedStaffNames = new Set<string>();
  const normalizeNameKey = (value: string | undefined | null) => String(value ?? '').trim().toLowerCase();
  for (const team of (teamPass.nbaStaffLifecycle.teams ?? []) as any[]) {
    for (const member of (team?.tycoon?.staffMembers ?? []) as any[]) {
      const key = normalizeNameKey(member?.name);
      if (key) employedStaffNames.add(key);
    }
  }
  for (const team of (teamPass.nonNBATeamsWithTycoon ?? []) as any[]) {
    for (const member of (team?.tycoon?.staffMembers ?? []) as any[]) {
      const key = normalizeNameKey(member?.name);
      if (key) employedStaffNames.add(key);
    }
  }
  const combinedStaffFreeAgents = [
    ...staffFreeAgentsForHiring.filter(member => !member.id || !consumedStaffFreeAgentIds.has(member.id)),
    ...teamPass.nbaStaffLifecycle.freeAgents,
    ...teamPass.euroCoachHiring.freeAgents,
  ].filter(member => {
    const key = normalizeNameKey((member as any)?.name);
    return !key || !employedStaffNames.has(key);
  });
  const capRatio = previousSalaryCap > 0 && newSalaryCap > 0 ? newSalaryCap / previousSalaryCap : 1;
  const economyRatio = state.leagueType === 'fictional' && capPctApplied !== 0
    ? 1 + capPctApplied / 100
    : capRatio;
  const shouldInflateCupPrizes =
    nextRuleLeagueStats.inSeasonTournament &&
    (nextRuleLeagueStats.cupPrizePoolEnabled ?? true) &&
    (nextRuleLeagueStats.cupPrizePoolAutoInflate ?? true) &&
    capPctApplied > 0;
  const nextHistoricalContractScaleCap = historicalRolloverRuleOverrides && newSalaryCap > 0
    ? newSalaryCap
    : state.leagueType === 'fictional' && capPctApplied !== 0
    ? Math.max(1, Math.round(
        (state.leagueStats.historicalContractScaleCap ?? INITIAL_LEAGUE_STATS.salaryCap) *
        (1 + capPctApplied / 100),
      ))
    : nextRuleLeagueStats.historicalContractScaleCap;
  const nextLeagueStatsBeforeWnbaRules = {
    ...state.leagueStats,
    ...(historicalRolloverRuleOverrides ?? {}),
    year: nextYear,
    hasScheduledGlobalGames: false,
    hasInvitedPerformance: false,
    hasFinalsHalftime: false,
    hasAllStarHalftime: false,
    hasAllStarSaturdayPerformance: false,
    hasRingCeremony: false,
    salaryCap: newSalaryCap,
    luxuryPayroll: newLuxuryPayroll,
    firstApronAmount: newFirstApron ?? 0,
    secondApronAmount: newSecondApron ?? 0,
    minContractStaticAmount: newMinContract,
    historicalContractScaleCap: nextHistoricalContractScaleCap,
    awardSettings: nextRuleLeagueStats.awardSettings,
    awardSettingsEraVersion: nextRuleLeagueStats.awardSettingsEraVersion,
    awardSettingsCommissionerOverrides: nextRuleLeagueStats.awardSettingsCommissionerOverrides,
    ...(shouldInflateCupPrizes
      ? {
          cupPrizeWinner: Math.round((leagueStats.cupPrizeWinner ?? 500_000) * (1 + capPctApplied / 100)),
          cupPrizeRunnerUp: Math.round((leagueStats.cupPrizeRunnerUp ?? 200_000) * (1 + capPctApplied / 100)),
          cupPrizeSemi: Math.round((leagueStats.cupPrizeSemi ?? 100_000) * (1 + capPctApplied / 100)),
          cupPrizeQuarter: Math.round((leagueStats.cupPrizeQuarter ?? 50_000) * (1 + capPctApplied / 100)),
        }
      : {}),
    mleUsage: {},
    capExceptionUsage: rollCapExceptionUsageToSeason(state.leagueStats.capExceptionUsage, nextYear),
    revenue: Math.round((state.leagueStats.revenue ?? 0) * economyRatio),
    historicalCoachPoolJoinedKeys: historicalCoachPool.joinedKeys,
    ...(state.leagueStats.mediaRights
      ? {
          mediaRights: {
            ...state.leagueStats.mediaRights,
            salaryCap: newSalaryCap / 1_000_000,
            lpPrice: state.leagueStats.mediaRights.lpPrice,
            lpPriceMonthly: state.leagueStats.mediaRights.lpPriceMonthly,
            totalRev: (state.leagueStats.mediaRights.mediaRev ?? 0)
              + (state.leagueStats.mediaRights.lpRev ?? 0) * economyRatio
              + Math.max(
                  0,
                  (state.leagueStats.mediaRights.totalRev ?? 0)
                    - (state.leagueStats.mediaRights.mediaRev ?? 0)
                    - (state.leagueStats.mediaRights.lpRev ?? 0),
                ) * economyRatio,
            mediaRev: state.leagueStats.mediaRights.mediaRev ?? 0,
            lpRev: (state.leagueStats.mediaRights.lpRev ?? 0) * economyRatio,
            isLocked: state.leagueStats.mediaRights.contractEndSeason != null
              && state.leagueStats.mediaRights.contractEndSeason >= nextYear - 1,
          },
        }
      : {}),
  } as GameState['leagueStats'];
  const nextLeagueStats = isWnbaIsolatedRollover(state)
    ? applyWnbaRuleSnapshot(nextLeagueStatsBeforeWnbaRules, nextYear, state.wnbaKnowledgeCutoffDate)
    : nextLeagueStatsBeforeWnbaRules;
  const nextTimelineInput = timelineInputFromState({ ...state, leagueStats: nextLeagueStats });
  const nextTeamsRaw = applyTeamIdentitiesForTimeline(teamPass.nbaStaffLifecycle.teams, nextTimelineInput, { mode: 'scheduled' });
  const historicalTeamStructurePatch = isHistoricalNbaRollover(state)
    ? applyHistoricalNbaTeamStructure(nextTeamsRaw, nextYear)
    : null;
  const nextTeams = historicalTeamStructurePatch?.teams ?? nextTeamsRaw;
  const nextNonNBATeams = applyTeamIdentitiesForTimeline(teamPass.nonNBATeamsWithTycoon, nextTimelineInput, { mode: 'scheduled' });
  const nextTeamArchive = mergeTeamArchive(state.teamArchive, teamPass.nbaStaffLifecycle.teams, currentYear);
  const historicalContractionPatch = isHistoricalNbaRollover(state)
    ? applyHistoricalNbaContractions({
        leagueYear: nextYear,
        teams: nextTeams,
        players: playersAfterAcademyTransition,
        draftPicks: updatedPicks,
        teamArchive: nextTeamArchive,
        archiveThroughSeason: currentYear,
      })
    : null;
  const activeNextTeams = historicalContractionPatch?.teams ?? nextTeams;
  const activeNextPlayersRaw = historicalContractionPatch?.players ?? playersAfterAcademyTransition;
  const activeNextPlayers = isHistoricalNbaRollover(state)
    ? applyHistoricalNbaInjuryProfilePolicy(
        activeNextPlayersRaw,
        state.nbaStartYear ?? state.leagueStats?.historicalEraStartYear,
      )
    : activeNextPlayersRaw;
  const broadcastTalentPass = runBroadcastTalentRollover({
    state,
    players: activeNextPlayers,
    newRetirees: playerPass.newRetirees,
    currentYear,
    leagueStartYear,
  });
  const playersAfterBroadcastTalent = broadcastTalentPass.players;
  const activeNextDraftPicks = historicalContractionPatch?.draftPicks ?? updatedPicks;
  const activeNextTeamArchive = historicalContractionPatch?.teamArchive ?? nextTeamArchive;
  const shouldRefreshExecutives = state.staff && shouldUseHistoricalNbaExecutives({ ...state, teams: activeNextTeams, leagueStats: nextLeagueStats });
  const staffBeforeRefereeRollover = shouldRefreshExecutives
    ? refreshHistoricalNbaGeneralManagers(euroSeasonAwards.staff!, activeNextTeams, nextYear)
    : euroSeasonAwards.staff;
  const refereePass = runRefereeRollover({
    state,
    currentYear,
    nextYear,
    staff: staffBeforeRefereeRollover,
  });
  const nextStaff = refereePass.staff;
  const gmCareerRollover = buildGmCareerRollover(state, nextStaff);
  if (refereePass.active.length > 0) setRefereeData(refereePass.active);
  if (shouldRefreshExecutives) {
    (nextLeagueStats as any).historicalNbaExecutivesSeason = nextYear;
    (nextLeagueStats as any).historicalNbaExecutivesVersion = HISTORICAL_NBA_EXECUTIVES_VERSION;
  }
  const domesticResolution = teamPass.euroCompetitionResolutions
    .find(result => result.competitionId === state.euroPrimaryCompetitionId);
  const domesticRelegation = isEuroIsolatedMode(state)
    ? applyEuroDomesticRelegation({
        state,
        teams: nextNonNBATeams,
        players: playersAfterBroadcastTalent,
        resolution: domesticResolution,
        nextSeason: nextYear,
      })
    : { teams: nextNonNBATeams, participantTids: [], history: [] as HistoryEntry[] };
  const finalNextNonNBATeams = domesticRelegation.teams;
  const nextDomesticTournamentTeamTids = selectNextDomesticTournamentParticipants(
    state.activeCompetitions ?? [],
    teamPass.euroCompetitionResolutions,
    state.euroCompetitionTeamTids ?? {},
  );
  const nextEuroCompetitionTeamTids = {
    ...nextDomesticTournamentTeamTids,
    ...(teamPass.nextEuroleagueTids ? { euroleague: teamPass.nextEuroleagueTids } : {}),
    ...(teamPass.nextEuroCupTids ? { eurocup: teamPass.nextEuroCupTids } : {}),
    ...(isEuroIsolatedMode(state) && state.euroPrimaryCompetitionId && domesticRelegation.participantTids.length > 0
      ? { [state.euroPrimaryCompetitionId]: domesticRelegation.participantTids }
      : {}),
  };
  const nextNativeTeamIds = getActiveNativeTeamIds({
    ...state,
    players: playersAfterBroadcastTalent,
    teams: activeNextTeams,
    nonNBATeams: finalNextNonNBATeams,
    leagueStats: nextLeagueStats,
    schedule: [],
    ...(state.leagueStats.uiMode === 'euro_isolated'
      ? { euroCompetitionTeamTids: nextEuroCompetitionTeamTids }
      : {}),
  });
  const nativeTransition = reconcileBackgroundNativeTeams({
    players: playersAfterBroadcastTalent,
    universe: backgroundUniverse,
    promotedTids: [...nextNativeTeamIds].filter(tid => !currentNativeTeamIds.has(tid)),
    teams: [...activeNextTeams, ...finalNextNonNBATeams],
    currentSeason: nextYear,
  });
  const pendingGovernorsBoardMeeting = state.leagueStats.uiMode === 'euro_isolated'
    ? buildEuroLeagueAssemblyMeeting({
        ...state,
        nonNBATeams: finalNextNonNBATeams,
        continentalAgreements: teamPass.nextContinentalAgreements,
      }, nextEuroCompetitionTeamTids, nextYear, {
        agreements: teamPass.nextContinentalAgreements,
        candidateEvaluations: teamPass.euroleagueSelection?.candidateEvaluations,
        domesticTransition: state.euroPrimaryCompetitionId && domesticRelegation.participantTids.length > 0
          ? {
              competitionId: state.euroPrimaryCompetitionId,
              previousTids: domesticResolution?.standings
                .slice()
                .sort((left, right) => left.seed - right.seed)
                .map(row => row.tid)
                ?? state.euroCompetitionTeamTids?.[state.euroPrimaryCompetitionId]
                ?? [],
              nextTids: domesticRelegation.participantTids,
            }
          : undefined,
      })
    : isWnbaIsolatedRollover(state)
      ? buildWnbaGovernorsBoardMeeting({
          state,
          nextLeagueStats,
          nextTeams: activeNextTeams,
          season: nextYear,
        })
      : buildGovernorsBoardMeeting({
        state,
        nextLeagueStats,
        nextTeams: activeNextTeams,
        season: nextYear,
      });
  const nextWnbaCupCompetitions = isWnbaIsolatedRollover(state)
    ? buildNextWnbaCupCompetitions(state, activeNextTeams, nextYear, nextLeagueStats)
    : state.cupCompetitions;
  if (historicalContractionPatch?.removedTeamIds.length) {
    simDebug('lifecycle', () => (
      `Contracted historical NBA teams removed: ${historicalContractionPatch.removedTeamNames.join(', ')}`
    ));
  }

  simDebug('lifecycle', () => (
    `[SeasonRollover] ${currentYear} → ${nextYear} | ` +
    `Cap: $${(state.leagueStats.salaryCap ?? 0) / 1_000_000 | 0}M → $${(newSalaryCap / 1_000_000).toFixed(1)}M (${newsAndPruning.pctStr}) | ` +
    `${playerPass.expiredIds.size} contracts expired | ` +
    `${playerPass.teamOptionExercisedCount} team opts exercised | ` +
    `${playerPass.teamOptionDeclinedCount} team opts declined | ` +
    `${playerPass.optionExtensionsCount} rookie extensions signed | ` +
    `${playerPass.newRetirees.length} retirements | ${playerPass.newFarewells.length} farewell tours | ` +
    `${teamPass.staffRetirementRecords.length} staff retirements | ` +
    `${refereePass.announcements.filter(record => record.season === currentYear).length} referee retirements | ` +
    `${playerPass.newInductees.length} HOF inductions | ${playerPass.newJerseyRetirements.length} jersey retirements | ${playerPass.deaths.length} deaths | ` +
    `${activeNextDraftPicks.length} total draft picks`
  ));
  const retirementAnnouncementEvents = buildRetirementAnnouncementEvents(state, playerPass.newRetirees);
  const queuedAnnouncementIds = new Set(retirementAnnouncementEvents.map(event => event.payload.id));

  const rolloverPatch: Partial<GameState> = {
    backgroundUniverse: nativeTransition.universe ?? backgroundUniverse,
    players: rolloverScope.mergePlayers(nativeTransition.players),
    broadcastTalent: broadcastTalentPass.records,
    ...(isEuroIsolatedMode(state) ? { euroScouting: academyFreeAgency.state.euroScouting } : {}),
    ...(state.leagueType === 'fictional' && capPctApplied !== 0
      ? { salary: Math.max(1, Math.round(state.salary * (1 + capPctApplied / 100))) }
      : {}),
    teams: rolloverScope.mergeTeams(activeNextTeams),
    teamArchive: activeNextTeamArchive,
    nonNBATeams: rolloverScope.mergeNonNBATeams(finalNextNonNBATeams),
    draftPicks: rolloverScope.mergeDraftPicks(activeNextDraftPicks),
    stats: {
      ...authorizeNextSeasonBudget(state, nextLeagueStats),
      ...(gmCareerRollover.stats ? { ownerApproval: gmCareerRollover.stats.ownerApproval } : {}),
    },
    bets: rolloverScope.mergeBets(newsAndPruning.prunedBets),
    boxScores: rolloverScope.mergeBoxScores(newsAndPruning.prunedBoxScores),
    schedule: rolloverScope.mergeSchedule([]),
    ...(isWnbaIsolatedRollover(state) ? { cupCompetitions: nextWnbaCupCompetitions } : {}),
    christmasGames: rolloverScope.mergeChristmasGames([]),
    globalGames: rolloverScope.mergeGlobalGames([]),
    scheduledEvents: [
      ...(state.scheduledEvents ?? []).filter(event =>
        event?.type !== 'NATIVE_LEAGUE_ANNOUNCEMENT'
        || !queuedAnnouncementIds.has(event.payload?.id)
      ),
      ...retirementAnnouncementEvents,
    ],
    seasonHistory: state.seasonHistory,
    ...({
      historicalPlayoffs: {
        ...((state as any).historicalPlayoffs ?? {}),
        ...(state.playoffs ? { [currentYear]: state.playoffs } : {}),
      },
      competitionHistory: teamPass.euroCompetitionResolutions.length > 0
        ? {
            ...((state as any).competitionHistory ?? {}),
            ...Object.fromEntries(teamPass.euroCompetitionResolutions.map(result => [
              result.competitionId,
              [
                ...(((state as any).competitionHistory?.[result.competitionId] ?? []) as CompetitionSeasonResolution[]).filter(
                  entry => entry.season !== currentYear,
                ),
                result,
              ],
            ])),
          }
        : (state as any).competitionHistory,
    } as any),
    ...teamPass.nbaCupPatch,
    playoffs: undefined,
    allStarHistory: appendAllStarHistorySnapshot(state, currentYear),
    allStar: (() => {
      const beltHolderInternalId = (state.allStar as any)?.throne?.champion?.playerId
        ?? (state.allStar as any)?.beltHolderInternalId
        ?? null;
      return beltHolderInternalId
        ? ({
            season: nextYear,
            votes: [],
            startersAnnounced: false,
            reservesAnnounced: false,
            roster: [],
            weekendComplete: false,
            beltHolderInternalId,
          } as any)
        : undefined;
    })(),
    draftLotteryResult: resetDraftCycleAtRollover ? undefined : state.draftLotteryResult,
    draftLotteryReplayPendingYear: resetDraftCycleAtRollover ? undefined : state.draftLotteryReplayPendingYear,
    activeDraftPicks: resetDraftCycleAtRollover ? undefined : state.activeDraftPicks,
    activeDraftPassedPicks: resetDraftCycleAtRollover ? undefined : state.activeDraftPassedPicks,
    activeDraftOrder: resetDraftCycleAtRollover ? undefined : state.activeDraftOrder,
    historicalAwards: teamPass.euroHistoricalAwards.length > 0
      ? [
          ...(euroSeasonAwards.historicalAwards ?? []).filter((award: any) =>
            !(award.competitionId && award.season === currentYear && (award.type === 'Champion' || award.type === 'Runner Up')),
          ),
          ...teamPass.euroHistoricalAwards,
        ]
      : euroSeasonAwards.historicalAwards,
    faBidding: { markets: rolloverScope.mergeFAMarkets(playerPass.preservedUserBidMarkets) },
    staffFreeAgents: rolloverScope.mergeStaffFreeAgents(combinedStaffFreeAgents),
    staff: gmCareerRollover.staff ?? nextStaff,
    ...(gmCareerRollover.gmCareer ? { gmCareer: gmCareerRollover.gmCareer } : {}),
    ...(gmCareerRollover.salary != null ? { salary: gmCareerRollover.salary } : {}),
    pendingRFAMatchResolutions: rolloverScope.mergeRFAMatches([]),
    leagueStats: nextLeagueStats,
    pendingGovernorsBoardMeeting,
    seasonLifecycle: lifecycleAfterSeasonTransition(state, nextYear),
    ...(state.leagueStats.uiMode === 'euro_isolated' ? { euroCompetitionTeamTids: nextEuroCompetitionTeamTids } : {}),
    ...(state.leagueStats.uiMode === 'euro_isolated' ? { continentalAgreements: teamPass.nextContinentalAgreements } : {}),
    retirementAnnouncements: playerPass.newRetirees,
    staffRetirementAnnouncements: teamPass.staffRetirementRecords,
    refereeRetirementAnnouncements: refereePass.announcements,
    staffHallOfFame: [
      ...(state.staffHallOfFame ?? []),
      ...teamPass.staffRetirementRecords.filter(record => record.hallOfFameEligible),
    ].filter((record, index, rows) => rows.findIndex(candidate => candidate.id === record.id) === index),
    seasonPreviewDismissed: true,
    draftComplete: resetDraftCycleAtRollover ? undefined : state.draftComplete,
    ...(teamPass.pendingEuroBankruptcy ? { pendingEuroBankruptcy: teamPass.pendingEuroBankruptcy } : {}),
    ...(teamPass.pendingEuroleagueWelcome ? { pendingEuroleagueWelcome: teamPass.pendingEuroleagueWelcome } : {}),
    news: [
      ...teamPass.euroBankruptcyNews,
      ...newsAndPruning.familyLineageNewsItems,
      ...newsAndPruning.jerseyRetirementNewsItems,
      ...newsAndPruning.hofNewsItems,
      ...newsAndPruning.mortalityNewsItems,
      ...newsAndPruning.farewellNewsItems,
      ...newsAndPruning.teamOptionNewsItems,
      ...newsAndPruning.playerOptionNewsItems,
      ...newsAndPruning.retirementNewsItems,
      ...(newsAndPruning.rolloverNews ? [newsAndPruning.rolloverNews] : []),
      ...(state.news ?? []),
    ].filter((item, index, all) => all.findIndex(candidate => candidate.id === item.id) === index).slice(0, 200),
    history: [
      ...(state.history ?? []),
      ...playerPass.playerOptionHistory,
      ...newsAndPruning.teamOptionHistoryEntries,
      ...playerPass.optionExtHistory,
      ...teamPass.euroChampionHistory,
      ...teamPass.euroBankruptcyHistory,
      ...domesticRelegation.history,
      ...newsAndPruning.retirementHistoryEntries,
      ...newsAndPruning.farewellHistoryEntries,
      ...newsAndPruning.hofHistoryEntries,
      ...newsAndPruning.jerseyRetirementHistoryEntries,
      ...newsAndPruning.mortalityHistoryEntries,
      ...newsAndPruning.familyLineageHistoryEntries,
      ...playerPass.extRetireHistory,
      ...playerPass.extFAHistory,
      ...teamPass.nbaStaffLifecycle.historyEntries,
      ...teamPass.nonNBAStaffRetirementHistory,
      ...academyPromotionHistory,
    ],
    ...(academyPromotionToasts.length > 0
      ? { pendingAcademyPromotionToasts: [...((state as any).pendingAcademyPromotionToasts ?? []), ...academyPromotionToasts] }
      : {}),
    ...(playerPass.pendingOptionToasts.length > 0
      ? { pendingOptionToasts: [...(state.pendingOptionToasts ?? []), ...playerPass.pendingOptionToasts] }
      : {}),
  };
  const transitioned = applyHistoricalNationalityTransitionPass(
    { ...state, ...rolloverPatch } as GameState,
    nextYear,
  );
  return {
    ...rolloverPatch,
    players: transitioned.players,
    historicalPeople: transitioned.historicalPeople,
    inbox: transitioned.inbox,
    history: transitioned.history,
    historicalNationalityTransitions: transitioned.historicalNationalityTransitions,
  };
}

export function applySeasonRollover(
  state: GameState,
  options?: { owner?: 'euro-season-review' },
): Partial<GameState> {
  const euroReviewOwnsTransition = state.leagueStats?.uiMode === 'euro_isolated'
    && options?.owner === 'euro-season-review';
  if (state.leagueStats?.uiMode === 'euro_isolated' && !euroReviewOwnsTransition) {
    recordSeasonRolloverAttempt(state, options?.owner, 'euro-owner-guard', false);
    return {};
  }
  if (
    state.leagueStats?.uiMode !== 'pba_isolated'
    && !euroReviewOwnsTransition
    && !canActivateNextSeason(state)
  ) {
    recordSeasonRolloverAttempt(state, options?.owner, 'lifecycle-guard', false);
    return {};
  }
  if (
    state.leagueStats?.uiMode !== 'pba_isolated'
    && !euroReviewOwnsTransition
    && state.date
    && !shouldFireRollover(state, String(state.date))
  ) {
    recordSeasonRolloverAttempt(state, options?.owner, 'rollover-date-guard', false);
    return {};
  }
  const patch = state.leagueStats?.uiMode === 'pba_isolated'
    ? applyPbaScopedSeasonRollover(state, applySharedSeasonRollover)
    : applySharedSeasonRollover(state);
  const mutated = Number(patch.leagueStats?.year ?? state.leagueStats.year) !== Number(state.leagueStats.year)
    || Number(patch.seasonLifecycle?.activeSeason ?? state.seasonLifecycle?.activeSeason ?? state.leagueStats.year)
      !== Number(state.seasonLifecycle?.activeSeason ?? state.leagueStats.year);
  recordSeasonRolloverAttempt(state, options?.owner, 'applied', mutated);
  return patch;
}

export function shouldFireRollover(state: GameState, dateNorm: string): boolean {
  const year = state.leagueStats.year;
  const rolloverDate = toISODateString(getRolloverDate(year, state.leagueStats as any, state.schedule as any));
  return dateNorm >= rolloverDate;
}
