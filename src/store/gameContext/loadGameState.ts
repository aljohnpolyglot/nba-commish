import type { GameLoadProgress, GameState, NBATeam } from '../../types';
import { setRefereeData } from '../../data/photos/referees';
import { normalizeEndesaTeam } from '../../utils/endesaTeams';
import { initialState } from '../initialState';
import {
  applyTrainingAiSetup,
  cleanDeadMoneyTeams,
  cleanDuplicateAutoNews,
  cleanFaMarkets,
  cleanOptionHistory,
  finalizeLoadedPlayers,
  healDuplicatePlayerInternalIds,
  healCompletedNbaDraftUndraftedFreeAgents,
  healLoadedDraftPicks,
  healLoadedSigningContractsAndTournamentDraftClasses,
  healLegacyAutomaticBrawlDiscipline,
  healFollowedHandles,
  healHistoricalTeamIdentity,
  healLoadedPbaContracts,
  healLoadedPbaDraftProspects,
  healHistoricalNbaStaffFreeAgents,
  healNbaActiveStaffContracts,
  healNbaDraftCycleState,
  healLegacyNbaStaff,
  healLoadedNbaTeamRecords,
  healOffseasonChecklist,
  healPbaCommissionerBootstrapDraftState,
  healPbaEconomySettings,
  healPbaTeamStaff,
  healSchedule,
  healStaleCompletedNbaFinalsLifecycle,
  migrateLeagueStats,
  migrateLoadedPlayers,
  normalizeExternalLeagueRatingCaps,
  refreshTrainingCalendars,
} from './loadGameStateHealers';
import {
  CANONICAL_PLAYER_LOAD_MIGRATION_VERSION,
  restoreCanonicalHistoricalDraftClasses,
} from '../../services/playerUniverse/playerLoadMigration';
import {
  healHistoricalNbaAwardTeamIds,
  healHistoricalNbaPlayerStatTeamIds,
} from './historicalNbaTeamIdHealer';
import { applyEuroLoadHeals, ensureStandardStaffPool } from './loadGameStateEuro';
import { applyPbaAwardsToPlayers, buildPbaHistoricalAwards, healPbaAwardsFromConferenceChampions, hydratePbaHistoricalAwardIdentities, preparePbaAwardArchive } from '../../services/pba/awards';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { repairCompetitionSchedules } from '../../services/competition/competitionScheduler';
import { injectCompetitionPostseasonGames } from '../../services/competition/competitionResolver';
import { applyPbaConferenceLifecycle, repairPbaConferenceForDate } from '../../services/pba/conferenceTransition';
import { ensurePbaGovernorsBoardMeeting } from '../../services/pba/governorsBoard';
import {
  isExplicitHistoricalPbaImport,
  mergeDuplicatePbaImportIdentities,
  sanitizePbaImportBiographyClaims,
  restorePbaImportReferenceBios,
  restorePbaImportReferenceNationalities,
  restorePbaImportSourceNationalities,
} from '../../services/pba/importIdentity';
import { sanitizePbaAllStarForDate } from '../../services/pba/allStar';
import {
  ensurePortraitLookupsLoaded,
  getBioForPlayerIdentity,
  getVerifiedBioForPlayerIdentity,
} from '../../data/realPlayerDataFetcher';
import { applyTeamIdentitiesForTimeline } from '../../utils/teamAssets';
import { timelineInputFromState } from '../../utils/historicalTimeline';
import { getHistoricalNbaRuleOverrides, getRecordedHistoricalNbaSalaryCap, isHistoricalNbaStart } from '../../data/historicalNbaSeasons';
import {
  backfillHistoricalNbaCareerAwards,
  buildZengmHistoricalDraftProspects,
  repairHistoricalCareerContractLeak,
} from '../../services/zengmHistoricalRoster';
import { applyHistoricalNbaContractions, applyHistoricalNbaTeamStructure } from '../../services/historicalNbaTeamLifecycle';
import { normalizeModernNbaDivisionAssignments } from '../../utils/modernNbaTeamStructure';
import { applyHistoricalNbaInjuryProfilePolicy } from '../../utils/durabilityUtils';
import { healInternationalTournamentHistory, healInternationalTournamentState } from '../../services/fiba/healTournamentState';
import { createInitialGmCareerState } from '../../services/gmCareer/careerService';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { normalizeLeagueTreasuryStats } from '../../services/logic/leagueTreasury';
import { healSummerLeagueHistory, healSummerLeagueTournament } from '../../services/summerLeague/healTournament';
import { reconcileSummerLeagueUserCandidatePool } from '../../services/summerLeague/roster';
import { enrichPlayersWithFibaHistoricalAwards } from '../../services/fiba/prepareTournamentWindow';
import {
  applyHistoricalNbaClutchAwardsToPlayers,
  mergeHistoricalNbaClutchAwards,
} from '../../data/historicalNbaClutchAwards';
import {
  applyHistoricalNbaExtraAwardsToPlayers,
  mergeHistoricalNbaExtraAwards,
} from '../../data/historicalNbaExtraAwards';
import { reconcilePlayerFamilyTiesForScope, sanitizeHistoricalFutureFamilyTies } from '../../services/playerFamilyLineage';
import { COMPETITION_AWARD_HISTORY_VERSION, hydrateCompetitionAwardHistory } from '../../services/competition/competitionAwardHistory';
import { ensureCommissionerTaskLedger } from '../../services/commissionerTasks/taskRegistry';
import { prehydratePlayerBioData } from '../../services/playerBioPreload';
import { buildEuroLeagueAssemblyMeeting } from '../../services/euro/leagueAssembly';
import {
  FULL_OFFSEASON_NBA_HISTORY_VERSION,
  hydrateFullOffseasonNbaHistoricalAwards,
} from '../../services/history/fullOffseasonNbaHistory';
import { loadHistoricalPbaSource } from '../../services/pba/historicalLoader';
import {
  hydrateHistoricalPbaSourceHistory,
  PBA_SOURCE_HISTORY_HYDRATION_VERSION,
} from '../../services/pba/historicalHistoryHydration';
import { fetchAllStarHistory } from '../../data/allStarHistoryFetcher';
import { materializeKnownNbaAllStarHosts } from '../../services/allStar/hostAutoResolver';
import { prepareAllStarWeekendForWatch } from '../../services/allStar/allStarWeekendEvents';
import { getSeasonSimStartDate } from '../../utils/dateUtils';
import { inferEuroStaffLeagueId, toStaffFreeAgent } from '../../services/euro/staffPool';
import { staffContractIdentityKey, syncStaffDirectoryHeadCoaches } from '../../services/staff/activeStaffContracts';
import {
  enforcePbaBranchHistoryOwnership,
  getPbaBranchStartSeason,
} from '../../services/pba/branchHistoryOwnership';
import { healHistoricalPbaPlayerPortraits } from '../../services/pba/portraits';
import { attachHistoricalPbaTeamIdentityTimeline } from '../../services/pba/historicalTypes';
import { prepareHistoricalCoachArchive } from '../../services/staff/historicalCoachArchive';
import { prepareHistoricalExecutiveArchive } from '../../services/staff/historicalExecutiveArchive';
import {
  hydrateAllStarHistorySelectionAwards,
  sanitizeAllStarReplacementInboxForMode,
} from '../../services/allStar/allStarInjuryReplacements';
import { hydrateHistoricalCareerMetrics } from '../../services/playerDevelopment/historicalCareerMetrics';
import { restoreNbaExternalSourceReserves } from '../../services/euro/rosterTrim';
import { normalizeOpeningFantasyDraftHistory } from '../../services/fantasyDraft/openingFantasyDraft';
import {
  loadExternalPortraitCatalog,
  preloadExternalPortraitCatalogsForPlayers,
} from '../../services/externalPortraitCatalog';
import {
  applyCachedExternalTeamLogoCatalogs,
  preloadExternalTeamLogoCatalogsForTeams,
} from '../../services/externalTeamLogoCatalog';
import {
  CANONICAL_NBA_CAREER_HYDRATION_VERSION,
  hydrateCanonicalNbaCareers,
} from '../../services/playerUniverse/canonicalNbaCareerHydration';
import { canonicalizeDraftProspectIdentities } from '../../services/playerUniverse/canonicalDraftProspectIdentity';
import {
  CANONICAL_CROSS_LEAGUE_IDENTITY_VERSION,
  canonicalizeCrossLeaguePlayerIdentities,
} from '../../services/playerUniverse/canonicalCrossLeagueIdentity';
import { rewritePlayerIdAliases } from '../../services/playerUniverse/playerIdAliases';
import { getActiveNativeTeamIds } from '../../services/backgroundUniverse/backgroundSeasonGenerator';
import { reconcileBackgroundNativeTeams } from '../../services/backgroundUniverse/backgroundNativeTransition';
import { canonicalizeTeamIdentitiesForState } from '../../services/teamIdentity';
import { withCanonicalPersonIdentity } from '../../utils/playerIdentity';
import {
  CANONICAL_HISTORICAL_PEOPLE_VERSION,
  materializeCanonicalHistoricalPeople,
} from '../../services/playerUniverse/canonicalHistoricalPeople';

export {
  EURO_TRANSFER_MARKET_DEFAULTS,
  buildSetupSponsorships,
  getClubId,
  getClubLabel,
  mergeTycoonStaffMembers,
} from './loadGameStateShared';

export async function loadGameState(
  loaded: any,
  onProgress?: (progress: GameLoadProgress) => void,
): Promise<{ nextState: GameState; imageCachePlayers: any[] }> {
  loaded = normalizeOpeningFantasyDraftHistory(loaded);
  loaded = healStaleCompletedNbaFinalsLifecycle(loaded);
  let activePhase = 'Opening loaded league state';
  let activePhaseStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const reportProgress = async (
    currentPhase: string,
    percentComplete: number,
    stepsComplete: number,
  ) => {
    const measuredAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    console.info('[LOAD_GAME_PHASE]', {
      phase: activePhase,
      durationMs: Math.round((measuredAt - activePhaseStartedAt) * 10) / 10,
    });
    activePhase = currentPhase;
    activePhaseStartedAt = measuredAt;
    if (!onProgress) return;
    onProgress({ currentPhase, percentComplete, stepsComplete, stepsTotal: 12 });
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  };
  const currentSeasonYear = loaded.leagueStats?.year ?? new Date().getFullYear();
  loaded = healNbaDraftCycleState(loaded);
  const nbaStartYear = Number(loaded.nbaStartYear ?? loaded.leagueStats?.historicalEraStartYear ?? 0);
  const isHistoricalNbaSave =
    loaded.leagueType === 'modded' &&
    loaded.moddedLeagueBase === 'nba' &&
    isHistoricalNbaStart(nbaStartYear);
  const isNbaSave = loaded.leagueType === 'modded' && (loaded.moddedLeagueBase ?? 'nba') === 'nba';
  const isWnbaSave = loaded.leagueStats?.uiMode === 'wnba_isolated'
    || loaded.moddedLeagueBase === 'wnba';
  const needsCanonicalPlayerIdentityMigration = Number(loaded.canonicalPlayerIdentityVersion ?? 0)
    < CANONICAL_CROSS_LEAGUE_IDENTITY_VERSION;
  const needsCanonicalPlayerLoadMigration = Number(loaded.canonicalPlayerLoadMigrationVersion ?? 0)
    < CANONICAL_PLAYER_LOAD_MIGRATION_VERSION;
  const nbaHistoryCutoff = nbaStartYear > 0 ? nbaStartYear : Math.max(0, currentSeasonYear - 1);
  const allStarHistoryPromise = isNbaSave ? fetchAllStarHistory() : Promise.resolve([]);
  const pbaAwardArchivePromise = loaded.leagueStats?.uiMode === 'pba_isolated'
    ? preparePbaAwardArchive()
    : null;
  const historicalStaffArchivePromise = isNbaSave
    ? Promise.all([prepareHistoricalCoachArchive(), prepareHistoricalExecutiveArchive()])
    : null;
  const needsHistoricalPbaHistoryHydration = loaded.historicalPba
    && Number(loaded.historicalPba.sourceHistoryHydrationVersion ?? 0) < PBA_SOURCE_HISTORY_HYDRATION_VERSION;
  const needsPbaImportIdentitySource = (loaded.players ?? []).some(isExplicitHistoricalPbaImport);
  const historicalPbaSourcePromise = needsHistoricalPbaHistoryHydration || needsPbaImportIdentitySource
    ? loadHistoricalPbaSource().then(
        source => ({ source, error: null }),
        error => ({
          source: null,
          error: error instanceof Error ? error : new Error('Historical PBA source is unavailable.'),
        }),
      )
    : null;

  await reportProgress('Preparing rosters and portraits...', 23, 3);
  if (loaded.leagueType !== 'fictional') {
    await Promise.all([
      ensurePortraitLookupsLoaded(),
      preloadExternalPortraitCatalogsForPlayers(loaded.players ?? [], currentSeasonYear),
      isWnbaSave
        ? loadExternalPortraitCatalog('WNBA', currentSeasonYear).catch(() => new Map())
        : Promise.resolve(new Map()),
      preloadExternalTeamLogoCatalogsForTeams(loaded.nonNBATeams ?? [], currentSeasonYear),
    ]);
  }
  await reportProgress('Checking players, contracts, and teams...', 32, 4);
  const versionMigratedPlayers = needsCanonicalPlayerLoadMigration
    ? migrateLoadedPlayers(loaded, currentSeasonYear)
    : loaded.players ?? [];
  const migratedPlayers = healLoadedSigningContractsAndTournamentDraftClasses(
    loaded,
    versionMigratedPlayers,
    currentSeasonYear,
  );
  const { backfilledPlayers: migratedBackfilledPlayers } = needsCanonicalPlayerLoadMigration
    ? finalizeLoadedPlayers(loaded, migratedPlayers, currentSeasonYear)
    : { backfilledPlayers: migratedPlayers };
  const backfilledPlayers = isHistoricalNbaSave
    ? migratedBackfilledPlayers.map(player => repairHistoricalCareerContractLeak(player, nbaStartYear, currentSeasonYear))
    : migratedBackfilledPlayers;
  const duplicateIdHeal = healDuplicatePlayerInternalIds(backfilledPlayers, loaded.boxScores ?? [], currentSeasonYear);
  let playersWithUniqueIds = duplicateIdHeal.players;
  if (isHistoricalNbaSave && needsCanonicalPlayerLoadMigration) {
    const sourceProspects = await buildZengmHistoricalDraftProspects(currentSeasonYear - 1, playersWithUniqueIds);
    playersWithUniqueIds = restoreCanonicalHistoricalDraftClasses(playersWithUniqueIds, sourceProspects, currentSeasonYear);
  }
  let canonicalPlayerIdAliases: Record<string, string> = {};
  if (
    isNbaSave
    && Number(loaded.canonicalNbaCareerHydrationVersion ?? 0) < CANONICAL_NBA_CAREER_HYDRATION_VERSION
  ) {
    const canonicalCareerHydration = await hydrateCanonicalNbaCareers(playersWithUniqueIds, nbaHistoryCutoff);
    playersWithUniqueIds = normalizeExternalLeagueRatingCaps(canonicalCareerHydration.players);
    if (canonicalCareerHydration.hydrated > 0) {
      console.log(`[LOAD_GAME] Restored canonical NBA careers for ${canonicalCareerHydration.hydrated} player row(s).`);
    }
    const canonicalDraftProspects = canonicalizeDraftProspectIdentities(playersWithUniqueIds, currentSeasonYear);
    playersWithUniqueIds = canonicalDraftProspects.players;
    canonicalPlayerIdAliases = canonicalDraftProspects.idAliases;
    if (canonicalDraftProspects.merged > 0) {
      console.log(`[LOAD_GAME] Unified ${canonicalDraftProspects.merged} duplicate draft-prospect player row(s).`);
    }
  }
  let healedBoxScores = duplicateIdHeal.boxScores;
  const healedDraftPicks = healLoadedDraftPicks(loaded, currentSeasonYear);

  let migratedLeagueStats = migrateLeagueStats(loaded);
  if (isHistoricalNbaSave) {
    const activeStartYear = Number(migratedLeagueStats?.year ?? currentSeasonYear) - 1;
    if (Number.isFinite(activeStartYear) && activeStartYear >= nbaStartYear) {
      const savedAllStarHosts = migratedLeagueStats.allStarHosts;
      const recordedSalaryCap = getRecordedHistoricalNbaSalaryCap(activeStartYear);
      const restoredRules = getHistoricalNbaRuleOverrides(activeStartYear);
      migratedLeagueStats = recordedSalaryCap == null && activeStartYear >= 1984
        ? {
            ...restoredRules,
            ...migratedLeagueStats,
            historicalEraKey: restoredRules.historicalEraKey,
            historicalEraStartYear: activeStartYear,
            allStarHosts: savedAllStarHosts,
          }
        : {
            ...migratedLeagueStats,
            ...restoredRules,
            allStarHosts: savedAllStarHosts,
          };
    }
  }
  migratedLeagueStats = healPbaEconomySettings(migratedLeagueStats);
  const pbaBranchStartSeason = getPbaBranchStartSeason({
    pbaSeasonKey: loaded.pbaSeasonKey,
    historicalPba: loaded.historicalPba,
    leagueStats: migratedLeagueStats,
  } as GameState);
  let healedSchedule = healSchedule(loaded.schedule, migratedLeagueStats);
  const teamsWithCleanDeadMoney = cleanDeadMoneyTeams(loaded.teams);
  const playersWithHealedHistoricalTeamIds = isNbaSave
    ? healHistoricalNbaPlayerStatTeamIds(teamsWithCleanDeadMoney as any, playersWithUniqueIds)
    : playersWithUniqueIds;
  const teamsWithHealedIdentity = healHistoricalTeamIdentity(loaded, teamsWithCleanDeadMoney as any, playersWithHealedHistoricalTeamIds);
  const teamsWithHealedRecords = healLoadedNbaTeamRecords(loaded, migratedLeagueStats, healedSchedule, teamsWithHealedIdentity as any);
  const teamsWithLegacyStaff = healLegacyNbaStaff(teamsWithHealedRecords as any, loaded);
  const staffContractHeal = healNbaActiveStaffContracts(teamsWithLegacyStaff as any, loaded);
  const teamsWithHealedStaff = staffContractHeal.teams;
  const cleanedFAMarkets = cleanFaMarkets(loaded, migratedLeagueStats, healedSchedule, playersWithHealedHistoricalTeamIds, teamsWithHealedStaff as any);
  let cleanedHistory = [...cleanOptionHistory(loaded.history), ...staffContractHeal.historyEntries];

  await reportProgress('Restoring the league calendar and team plans...', 45, 5);
  let teamsWithFreshTraining = await refreshTrainingCalendars(loaded, teamsWithHealedStaff as any);
  let playersWithAISetup = await applyTrainingAiSetup(loaded, playersWithHealedHistoricalTeamIds, teamsWithFreshTraining as any);
  if (historicalPbaSourcePromise) {
    const sourceResult = await historicalPbaSourcePromise;
    if (sourceResult.source) {
      if (Number(migratedLeagueStats.pbaBiographyIntegrityVersion ?? 0) < 1) {
        playersWithAISetup = sanitizePbaImportBiographyClaims(playersWithAISetup, sourceResult.source);
        migratedLeagueStats = { ...migratedLeagueStats, pbaBiographyIntegrityVersion: 1 };
      }
      playersWithAISetup = restorePbaImportSourceNationalities(playersWithAISetup, sourceResult.source);
    }
  }
  playersWithAISetup = restorePbaImportReferenceBios(playersWithAISetup, getVerifiedBioForPlayerIdentity);
  playersWithAISetup = restorePbaImportReferenceNationalities(playersWithAISetup, player => {
    const bio = getBioForPlayerIdentity(player);
    return bio?.country
      ? { nationality: bio.country, born: { year: bio.bornYear ?? player.born?.year ?? 0, country: bio.country, loc: bio.country } }
      : null;
  });
  if (needsCanonicalPlayerIdentityMigration) {
    playersWithAISetup = mergeDuplicatePbaImportIdentities(playersWithAISetup, migratedLeagueStats?.uiMode);
  }
  if (loaded.leagueType !== 'fictional' && needsCanonicalPlayerIdentityMigration) {
    const canonicalCrossLeaguePlayers = canonicalizeCrossLeaguePlayerIdentities(playersWithAISetup, currentSeasonYear);
    playersWithAISetup = canonicalCrossLeaguePlayers.players;
    Object.assign(canonicalPlayerIdAliases, canonicalCrossLeaguePlayers.idAliases);
    if (canonicalCrossLeaguePlayers.merged > 0) {
      console.log(`[LOAD_GAME] Unified ${canonicalCrossLeaguePlayers.merged} cross-league player row(s).`);
    }
  } else {
    playersWithAISetup = playersWithAISetup.map(withCanonicalPersonIdentity);
  }
  await reportProgress('Restoring league rules and player history...', 56, 6);
  if (isHistoricalNbaSave) {
    playersWithAISetup = await backfillHistoricalNbaCareerAwards(
      playersWithAISetup,
      teamsWithFreshTraining as any,
      nbaStartYear + 1,
    );
    playersWithAISetup = applyHistoricalNbaInjuryProfilePolicy(playersWithAISetup, nbaStartYear);
  }
  if (isNbaSave) {
    playersWithAISetup = applyHistoricalNbaClutchAwardsToPlayers(playersWithAISetup, nbaHistoryCutoff);
    playersWithAISetup = applyHistoricalNbaExtraAwardsToPlayers(playersWithAISetup, nbaHistoryCutoff);
    playersWithAISetup = hydrateAllStarHistorySelectionAwards(
      playersWithAISetup,
      loaded.allStarHistory,
      Math.max(nbaStartYear, currentSeasonYear - 1),
    );
  }
  const isInternationalNbaSave = isNbaSave;
  if (isInternationalNbaSave) {
    playersWithAISetup = await enrichPlayersWithFibaHistoricalAwards(
      playersWithAISetup,
      nbaStartYear || currentSeasonYear - 1,
    );
  }
  playersWithAISetup = healCompletedNbaDraftUndraftedFreeAgents(
    playersWithAISetup,
    { ...loaded, leagueStats: migratedLeagueStats },
    currentSeasonYear,
  );

  if (loaded.staff?.referees?.length) {
    setRefereeData(loaded.staff.referees);
    console.log(`[LOAD_GAME] Restored ${loaded.staff.referees.length} saved referees.`);
  }

  const healedFollowedHandles = healFollowedHandles(loaded);
  let healedOffseasonChecklist = healOffseasonChecklist({ ...loaded, leagueStats: migratedLeagueStats });
  let healedHistoricalAwards = Array.isArray(loaded.historicalAwards) ? loaded.historicalAwards : initialState.historicalAwards;
  if (migratedLeagueStats?.uiMode === 'pba_isolated') {
    const branchOwnedHistory = enforcePbaBranchHistoryOwnership(
      playersWithAISetup,
      healedHistoricalAwards,
      { ...loaded, leagueStats: migratedLeagueStats },
    );
    playersWithAISetup = branchOwnedHistory.players;
    healedHistoricalAwards = branchOwnedHistory.historicalAwards;
  }
  if (isNbaSave) {
    healedHistoricalAwards = mergeHistoricalNbaClutchAwards(healedHistoricalAwards, nbaHistoryCutoff);
    healedHistoricalAwards = mergeHistoricalNbaExtraAwards(healedHistoricalAwards, nbaHistoryCutoff);
  }
  let healedNews = cleanDuplicateAutoNews(loaded.news ?? initialState.news);
  let healedStaff = syncStaffDirectoryHeadCoaches(loaded.staff, teamsWithFreshTraining as any, currentSeasonYear);
  let healedAllStar = loaded.allStar;
  let healedNonNBATeams = healPbaTeamStaff(
    (loaded.nonNBATeams ?? []).map(normalizeEndesaTeam),
    migratedLeagueStats,
    loaded.historicalPba,
  );
  healedNonNBATeams = applyCachedExternalTeamLogoCatalogs(healedNonNBATeams, currentSeasonYear);
  healedNonNBATeams = attachHistoricalPbaTeamIdentityTimeline(healedNonNBATeams, loaded.historicalPba);
  if (migratedLeagueStats?.uiMode === 'pba_isolated') {
    const repairedPbaSchedule = repairCompetitionSchedules(
      {
        ...loaded,
        leagueStats: migratedLeagueStats,
        nonNBATeams: healedNonNBATeams,
        schedule: healedSchedule,
      },
      PBA_COMPETITIONS,
      migratedLeagueStats?.year ?? currentSeasonYear,
    );
    if (repairedPbaSchedule !== healedSchedule) healedSchedule = repairedPbaSchedule;
    const pbaPostseasonSchedule = injectCompetitionPostseasonGames(
      {
        ...loaded,
        leagueStats: migratedLeagueStats,
        nonNBATeams: healedNonNBATeams,
        schedule: healedSchedule,
        boxScores: healedBoxScores ?? [],
      },
      PBA_COMPETITIONS,
      migratedLeagueStats?.year ?? currentSeasonYear,
    );
    if (pbaPostseasonSchedule !== healedSchedule) healedSchedule = pbaPostseasonSchedule;
    const pbaLifecyclePatch = applyPbaConferenceLifecycle({
      ...loaded,
      leagueStats: migratedLeagueStats,
      players: playersWithAISetup,
      nonNBATeams: healedNonNBATeams,
      schedule: healedSchedule,
      boxScores: healedBoxScores ?? [],
      news: healedNews,
      historicalAwards: healedHistoricalAwards,
      offseasonChecklist: healedOffseasonChecklist,
    } as GameState);
    if (pbaLifecyclePatch.schedule) healedSchedule = pbaLifecyclePatch.schedule;
    if (pbaLifecyclePatch.leagueStats) migratedLeagueStats = pbaLifecyclePatch.leagueStats as any;
    if ((pbaLifecyclePatch as any).players) playersWithAISetup = (pbaLifecyclePatch as any).players;
    if ((pbaLifecyclePatch as any).historicalAwards) healedHistoricalAwards = (pbaLifecyclePatch as any).historicalAwards;
    if (pbaLifecyclePatch.offseasonChecklist !== undefined) healedOffseasonChecklist = pbaLifecyclePatch.offseasonChecklist as any;
    if (pbaLifecyclePatch.history) cleanedHistory = pbaLifecyclePatch.history as any;
    if ((pbaLifecyclePatch as any).news) healedNews = (pbaLifecyclePatch as any).news;
    const pbaCalendarPatch = repairPbaConferenceForDate({
      ...loaded,
      leagueStats: migratedLeagueStats,
      players: playersWithAISetup,
      nonNBATeams: healedNonNBATeams,
      schedule: healedSchedule,
      boxScores: healedBoxScores ?? [],
      historicalAwards: healedHistoricalAwards,
      offseasonChecklist: healedOffseasonChecklist,
    } as GameState);
    healedSchedule = pbaCalendarPatch.schedule ?? healedSchedule;
    migratedLeagueStats = pbaCalendarPatch.leagueStats as any;
    playersWithAISetup = pbaCalendarPatch.players ?? playersWithAISetup;
    if (pbaCalendarPatch.offseasonChecklist !== undefined) healedOffseasonChecklist = pbaCalendarPatch.offseasonChecklist as any;
    if (pbaCalendarPatch.news) healedNews = pbaCalendarPatch.news as any;
    healedAllStar = sanitizePbaAllStarForDate({
      ...loaded,
      leagueStats: migratedLeagueStats,
      date: loaded.date,
      players: playersWithAISetup,
      nonNBATeams: healedNonNBATeams,
      allStar: healedAllStar,
    } as GameState, healedAllStar);
  }
  let healedEuroSetupSeed = (loaded as any).euroSetupSeed;
  const existingStaffFreeAgentKeys = new Set((loaded.staffFreeAgents ?? []).map((member: any) => staffContractIdentityKey(member)));
  const releasedStaffFreeAgents = staffContractHeal.releasedStaff
    .filter((member: any) => {
      const key = staffContractIdentityKey(member);
      return !key || !existingStaffFreeAgentKeys.has(key);
    })
    .map((member: any) => {
      const teamId = Number(member?.formerTeamId ?? member?.tid ?? 0);
      const leagueId = inferEuroStaffLeagueId(teamId, loaded.leagueType, { uiMode: migratedLeagueStats?.uiMode });
      return toStaffFreeAgent(
        member,
        leagueId,
        `staff-expired-${leagueId}-${currentSeasonYear}-${String(member?.id ?? member?.name ?? 'staff').replace(/[^a-z0-9]+/gi, '-')}`,
      );
    });
  let healedStaffFreeAgents = [...(loaded.staffFreeAgents ?? []), ...releasedStaffFreeAgents];
  let healedUserTeamId = loaded.userTeamId;
  let healedActiveCompetitions = loaded.activeCompetitions ?? initialState.activeCompetitions;

  await reportProgress('Preparing competitions and season records...', 67, 7);
  if (migratedLeagueStats?.uiMode === 'euro_isolated') {
    const euroHeals = applyEuroLoadHeals({
      loaded,
      migratedLeagueStats,
      playersWithAISetup,
      teamsWithFreshTraining,
      healedNonNBATeams,
      healedUserTeamId,
      healedOffseasonChecklist,
      healedStaff,
      healedEuroSetupSeed,
      healedStaffFreeAgents,
    });
    playersWithAISetup = euroHeals.playersWithAISetup;
    teamsWithFreshTraining = euroHeals.teamsWithFreshTraining;
    healedNonNBATeams = euroHeals.healedNonNBATeams;
    healedUserTeamId = euroHeals.healedUserTeamId;
    healedOffseasonChecklist = euroHeals.healedOffseasonChecklist;
    healedStaff = euroHeals.healedStaff;
    healedEuroSetupSeed = euroHeals.healedEuroSetupSeed;
    healedStaffFreeAgents = euroHeals.healedStaffFreeAgents;
    const competitionAwardCutoff = Math.max(0, Number(loaded.euroStartSeason ?? currentSeasonYear) - 1);
    const hasCurrentCompetitionAwardHistory =
      Number((migratedLeagueStats as any).competitionAwardHistoryVersion ?? 0) >= COMPETITION_AWARD_HISTORY_VERSION
      && Number((migratedLeagueStats as any).competitionAwardHistoryCutoff ?? -1) >= competitionAwardCutoff;
    if (!hasCurrentCompetitionAwardHistory) {
      const euroAwardHydration = await hydrateCompetitionAwardHistory(
        playersWithAISetup,
        healedHistoricalAwards,
        healedActiveCompetitions,
        competitionAwardCutoff,
      );
      playersWithAISetup = euroAwardHydration.players;
      healedHistoricalAwards = euroAwardHydration.historicalAwards;
      healedActiveCompetitions = euroAwardHydration.activeCompetitions;
      (migratedLeagueStats as any).competitionAwardHistoryVersion = COMPETITION_AWARD_HISTORY_VERSION;
      (migratedLeagueStats as any).competitionAwardHistoryCutoff = competitionAwardCutoff;
    }
  }

  if (migratedLeagueStats?.uiMode === 'pba_isolated') {
    healedHistoricalAwards = healPbaAwardsFromConferenceChampions(
      healedHistoricalAwards,
      (migratedLeagueStats as any)?.pbaConferenceChampions ?? [],
    );
    playersWithAISetup = healLoadedPbaContracts(playersWithAISetup, migratedLeagueStats, currentSeasonYear, healedNonNBATeams);
    playersWithAISetup = healLoadedPbaDraftProspects(playersWithAISetup, migratedLeagueStats, currentSeasonYear);
    playersWithAISetup = healHistoricalPbaPlayerPortraits(playersWithAISetup);
  }

  await reportProgress('Restoring staff and front-office data...', 72, 8);
  await historicalStaffArchivePromise;
  healedStaffFreeAgents = healHistoricalNbaStaffFreeAgents(
    loaded,
    migratedLeagueStats,
    healedStaffFreeAgents,
    playersWithAISetup,
  );

  healedStaffFreeAgents = ensureStandardStaffPool(
    loaded,
    migratedLeagueStats,
    healedNonNBATeams,
    teamsWithFreshTraining as any,
    healedStaffFreeAgents,
  );
  await reportProgress('Applying season identities and team history...', 77, 9);
  const timelineInput = timelineInputFromState({
    ...loaded,
    leagueStats: migratedLeagueStats,
  });
  const activeSeasonNonNBATeams = applyTeamIdentitiesForTimeline(healedNonNBATeams, timelineInput);
  if (isNbaSave) {
    playersWithAISetup = restoreNbaExternalSourceReserves(
      playersWithAISetup,
      activeSeasonNonNBATeams,
      Number(migratedLeagueStats.year ?? currentSeasonYear),
    );
  }
  const activeSeasonTeamsRaw = applyTeamIdentitiesForTimeline(teamsWithFreshTraining as any, timelineInput) as NBATeam[];
  await reportProgress('Finalizing teams and league identity...', 83, 10);
  const modernTeamStructure = isNbaSave && !isHistoricalNbaSave
    ? normalizeModernNbaDivisionAssignments(
        activeSeasonTeamsRaw,
        Number(migratedLeagueStats?.year ?? currentSeasonYear),
        migratedLeagueStats?.divs,
      )
    : activeSeasonTeamsRaw;
  if (modernTeamStructure !== activeSeasonTeamsRaw) {
    console.log('[LOAD_GAME] Restored six-division NBA team assignments.');
  }
  const historicalTeamStructurePatch = isHistoricalNbaSave
    ? applyHistoricalNbaTeamStructure(modernTeamStructure, migratedLeagueStats?.year)
    : null;
  if (historicalTeamStructurePatch?.changedTeamIds.length) {
    console.log(`[LOAD_GAME] Corrected ${historicalTeamStructurePatch.changedTeamIds.length} historical NBA team structure row(s).`);
  }
  const activeSeasonTeams = historicalTeamStructurePatch?.teams ?? modernTeamStructure;
  if (isNbaSave) {
    const seedSeasonYear = nbaStartYear > 0
      ? nbaStartYear + 1
      : Number(migratedLeagueStats.year ?? currentSeasonYear);
    const knowledgeDate = nbaStartYear > 0
      ? getSeasonSimStartDate(seedSeasonYear, migratedLeagueStats)
      : new Date(loaded.date);
    migratedLeagueStats = {
      ...migratedLeagueStats,
      allStarHosts: materializeKnownNbaAllStarHosts({
        existing: migratedLeagueStats.allStarHosts,
        teams: activeSeasonTeams,
        seedSeasonYear,
        knowledgeDate,
        history: await allStarHistoryPromise,
      }),
    };
  }
  if (isHistoricalNbaSave) {
    playersWithAISetup = sanitizeHistoricalFutureFamilyTies(playersWithAISetup, nbaStartYear);
  }
  const familyScope = migratedLeagueStats?.uiMode === 'euro_isolated'
    ? 'euro'
    : migratedLeagueStats?.uiMode === 'pba_isolated'
      ? 'pba'
      : loaded.leagueType === 'fictional' ? 'fictional' : 'nba';
  playersWithAISetup = reconcilePlayerFamilyTiesForScope(
    playersWithAISetup,
    currentSeasonYear,
    familyScope,
    isHistoricalNbaSave ? nbaStartYear : currentSeasonYear,
  );
  const historicalContractionPatch = isHistoricalNbaSave
    ? applyHistoricalNbaContractions({
        leagueYear: migratedLeagueStats?.year,
        teams: activeSeasonTeams,
        players: playersWithAISetup,
        draftPicks: healedDraftPicks,
        teamArchive: loaded.teamArchive,
        archiveThroughSeason: Number(migratedLeagueStats?.year ?? currentSeasonYear) - 1,
      })
    : null;
  if (historicalContractionPatch?.removedTeamIds.length) {
    console.log(`[LOAD_GAME] Removed contracted historical NBA teams: ${historicalContractionPatch.removedTeamNames.join(', ')}`);
  }

  let resolvedHistoricalAwards = healedHistoricalAwards;
  if (migratedLeagueStats?.uiMode === 'pba_isolated') {
    await pbaAwardArchivePromise;
    const merged = hydratePbaHistoricalAwardIdentities(
      [...healedHistoricalAwards, ...buildPbaHistoricalAwards(pbaBranchStartSeason)],
      playersWithAISetup,
      [...teamsWithFreshTraining, ...healedNonNBATeams],
    );
    const seen = new Set<string>();
    resolvedHistoricalAwards = merged.filter((award: any) => {
      const key = `${award.season}-${award.type}-${String(award.pid ?? award.name ?? award.team ?? '')}-${String(award.competitionId ?? award.conference ?? '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    playersWithAISetup = applyPbaAwardsToPlayers(playersWithAISetup, resolvedHistoricalAwards);
  }
  if (
    isNbaSave
    && loaded.nbaGmStartMode === 'full_offseason'
    && Number((migratedLeagueStats as any)?.fullOffseasonNbaHistoryVersion ?? 0) < FULL_OFFSEASON_NBA_HISTORY_VERSION
  ) {
    const fullOffseasonHistory = await hydrateFullOffseasonNbaHistoricalAwards(
      resolvedHistoricalAwards,
      (historicalContractionPatch?.teams ?? activeSeasonTeams) as NBATeam[],
      Number(migratedLeagueStats?.year ?? currentSeasonYear),
    );
    resolvedHistoricalAwards = fullOffseasonHistory.awards;
    if (fullOffseasonHistory.hydrated) {
      migratedLeagueStats = {
        ...migratedLeagueStats,
        fullOffseasonNbaHistoryVersion: FULL_OFFSEASON_NBA_HISTORY_VERSION,
      } as any;
    }
  }
  if (isNbaSave) {
    resolvedHistoricalAwards = healHistoricalNbaAwardTeamIds(playersWithAISetup, resolvedHistoricalAwards);
  }

  const healedFinalPlayers = healLoadedSigningContractsAndTournamentDraftClasses(
    loaded,
    normalizeExternalLeagueRatingCaps(historicalContractionPatch?.players ?? playersWithAISetup),
    currentSeasonYear,
  );
  const finalProspectIdentities = isNbaSave
    ? canonicalizeDraftProspectIdentities(healedFinalPlayers, currentSeasonYear)
    : { players: healedFinalPlayers, merged: 0, idAliases: {} };
  Object.assign(canonicalPlayerIdAliases, finalProspectIdentities.idAliases);
  const finalPlayers = finalProspectIdentities.players;
  let historicalPeople = loaded.historicalPeople;
  let historicalPeopleVersion = Number(loaded.historicalPeopleVersion ?? 0);
  if (
    isHistoricalNbaSave
    && historicalPeopleVersion < CANONICAL_HISTORICAL_PEOPLE_VERSION
  ) {
    await reportProgress('Indexing historical players and ratings...', 89, 11);
    historicalPeople = await materializeCanonicalHistoricalPeople(finalPlayers, nbaHistoryCutoff);
    historicalPeopleVersion = CANONICAL_HISTORICAL_PEOPLE_VERSION;
  }

  await reportProgress('Checking league history and your front office...', 92, 11);
  let nextState = {
    ...initialState,
    ...loaded,
    ...(isHistoricalNbaSave ? { nbaStartYear } : {}),
    leagueStats: { ...migratedLeagueStats, historyIdentityMigrationVersion: Math.max(Number((migratedLeagueStats as any)?.historyIdentityMigrationVersion ?? 0), 1) },
    stats: normalizeLeagueTreasuryStats(loaded.stats ?? initialState.stats),
    userTeamId: healedUserTeamId,
    nonNBATeams: activeSeasonNonNBATeams,
    activeCompetitions: migratedLeagueStats?.uiMode === 'pba_isolated'
      ? PBA_COMPETITIONS
      : healedActiveCompetitions,
    schedule: healedSchedule,
    boxScores: healedBoxScores,
    players: finalPlayers,
    canonicalPlayerIdentityVersion: CANONICAL_CROSS_LEAGUE_IDENTITY_VERSION,
    canonicalNbaCareerHydrationVersion: isNbaSave
      ? CANONICAL_NBA_CAREER_HYDRATION_VERSION
      : loaded.canonicalNbaCareerHydrationVersion,
    canonicalPlayerLoadMigrationVersion: CANONICAL_PLAYER_LOAD_MIGRATION_VERSION,
    historicalPeople,
    historicalPeopleVersion,
    teams: historicalContractionPatch?.teams ?? activeSeasonTeams,
    teamArchive: historicalContractionPatch?.teamArchive ?? loaded.teamArchive ?? initialState.teamArchive,
    staff: healedStaff,
    allStar: healedAllStar,
    staffFreeAgents: healedStaffFreeAgents,
    draftPicks: historicalContractionPatch?.draftPicks ?? healedDraftPicks,
    euroSetupSeed: healedEuroSetupSeed,
    history: cleanedHistory,
    inbox: sanitizeAllStarReplacementInboxForMode(loaded.inbox ?? initialState.inbox, loaded.gameMode),
    news: healedNews,
    faBidding: { markets: cleanedFAMarkets },
    followedHandles: healedFollowedHandles ?? initialState.followedHandles,
    offseasonChecklist: healedOffseasonChecklist,
    internationalTournament: healInternationalTournamentState(loaded.internationalTournament),
    internationalTournamentHistory: healInternationalTournamentHistory(loaded.internationalTournamentHistory),
    summerLeagueTournament: healSummerLeagueTournament(loaded.summerLeagueTournament),
    summerLeagueHistory: healSummerLeagueHistory(loaded.summerLeagueHistory),
    isProcessing: false,
    historicalAwards: resolvedHistoricalAwards,
  } as GameState;
  nextState = healLegacyAutomaticBrawlDiscipline(nextState);
  nextState = prepareAllStarWeekendForWatch(nextState);
  nextState = { ...nextState, ...canonicalizeTeamIdentitiesForState(nextState) };
  if (nextState.summerLeagueTournament) {
    nextState = {
      ...nextState,
      summerLeagueTournament: reconcileSummerLeagueUserCandidatePool(
        nextState.summerLeagueTournament,
        nextState.players,
      ),
    };
  }
  nextState = healPbaCommissionerBootstrapDraftState(nextState);
  if (nextState.gameMode !== 'gm') {
    nextState = { ...nextState, commissionerTasks: ensureCommissionerTaskLedger(nextState) };
  } else if (
    !nextState.gmCareer
    && nextState.userTeamId != null
    && resolveAnyTeam(nextState.userTeamId, nextState.teams, nextState.nonNBATeams ?? [])
  ) {
    const gmCareer = createInitialGmCareerState(nextState);
    nextState = { ...nextState, gmCareer, salary: gmCareer.employment.annualSalary };
  }
  if (nextState.leagueStats?.uiMode === 'euro_isolated') {
    const assemblyStatus = nextState.offseasonChecklist?.governorsBoardMeeting;
    if (
      (assemblyStatus === 'pending' || assemblyStatus === 'in-progress')
      && nextState.pendingGovernorsBoardMeeting?.kind !== 'euro-league-assembly'
    ) {
      nextState = {
        ...nextState,
        pendingGovernorsBoardMeeting: buildEuroLeagueAssemblyMeeting(
          nextState,
          nextState.euroCompetitionTeamTids ?? {},
          nextState.leagueStats?.year ?? new Date().getFullYear(),
        ),
      };
    }
    void prehydratePlayerBioData(nextState).catch(error => {
      console.warn('[LOAD_GAME] Euro Player Bio preload failed.', error);
    });
  }
  if (nextState.leagueStats?.uiMode === 'pba_isolated') {
    nextState = ensurePbaGovernorsBoardMeeting(nextState);
  }
  if (
    nextState.leagueStats?.uiMode === 'pba_isolated'
    && nextState.historicalPba
    && Number(nextState.historicalPba.sourceHistoryHydrationVersion ?? 0) < PBA_SOURCE_HISTORY_HYDRATION_VERSION
  ) {
    try {
      const sourceResult = historicalPbaSourcePromise
        ? await historicalPbaSourcePromise
        : { source: await loadHistoricalPbaSource(), error: null };
      if (sourceResult.error || !sourceResult.source) throw sourceResult.error ?? new Error('Historical PBA source is unavailable.');
      nextState = hydrateHistoricalPbaSourceHistory(nextState, sourceResult.source);
    } catch (error) {
      console.warn('[LOAD_GAME] Historical PBA source history hydration failed.', error);
    }
  }

  nextState = {
    ...nextState,
    players: hydrateHistoricalCareerMetrics(nextState.players, Number(nextState.leagueStats.year)),
  };
  const nativeTransition = reconcileBackgroundNativeTeams({
    players: nextState.players,
    universe: nextState.backgroundUniverse,
    promotedTids: [...getActiveNativeTeamIds(nextState)],
    teams: [...nextState.teams, ...(nextState.nonNBATeams ?? [])],
    currentSeason: Number(nextState.leagueStats.year),
  });
  if (nativeTransition.promotedTeamCount > 0) {
    nextState = {
      ...nextState,
      players: nativeTransition.players,
      backgroundUniverse: nativeTransition.universe,
    };
  }
  nextState = rewritePlayerIdAliases(nextState, canonicalPlayerIdAliases);

  await reportProgress('Warming up the simulation...', 99, 12);
  return {
    nextState: {
      ...nextState,
      isDataLoaded: true,
      isProcessing: false,
      lazySimProgress: undefined,
    },
    imageCachePlayers: finalPlayers,
  };
}
