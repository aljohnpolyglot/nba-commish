import type { GameState } from '../../types';
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
  healLoadedDraftPicks,
  healFollowedHandles,
  healHistoricalTeamIdentity,
  healLoadedPbaContracts,
  healLoadedPbaDraftProspects,
  healLegacyNbaStaff,
  healLoadedNbaTeamRecords,
  healOffseasonChecklist,
  healPbaEconomySettings,
  healPbaTeamStaff,
  healSchedule,
  migrateLeagueStats,
  migrateLoadedPlayers,
  refreshTrainingCalendars,
} from './loadGameStateHealers';
import { applyEuroLoadHeals, ensureStandardStaffPool } from './loadGameStateEuro';
import { applyPbaAwardsToPlayers, buildPbaHistoricalAwards, healPbaAwardsFromConferenceChampions } from '../../services/pba/awards';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { repairCompetitionSchedules } from '../../services/competition/competitionScheduler';
import { injectCompetitionPostseasonGames } from '../../services/competition/competitionResolver';
import { applyPbaConferenceLifecycle, repairPbaConferenceForDate } from '../../services/pba/conferenceTransition';
import { sanitizePbaAllStarForDate } from '../../services/pba/allStar';

export {
  EURO_TRANSFER_MARKET_DEFAULTS,
  buildSetupSponsorships,
  getClubId,
  getClubLabel,
  mergeTycoonStaffMembers,
} from './loadGameStateShared';

export async function loadGameState(loaded: any): Promise<{ nextState: GameState; imageCachePlayers: any[] }> {
  const currentSeasonYear = loaded.leagueStats?.year ?? new Date().getFullYear();
  const migratedPlayers = migrateLoadedPlayers(loaded, currentSeasonYear);
  const { finalPlayers, backfilledPlayers } = finalizeLoadedPlayers(loaded, migratedPlayers ?? loaded.players ?? [], currentSeasonYear);
  const duplicateIdHeal = healDuplicatePlayerInternalIds(backfilledPlayers, loaded.boxScores ?? [], currentSeasonYear);
  const playersWithUniqueIds = duplicateIdHeal.players;
  let healedBoxScores = duplicateIdHeal.boxScores;
  const healedDraftPicks = healLoadedDraftPicks(loaded, currentSeasonYear);

  let migratedLeagueStats = migrateLeagueStats(loaded);
  migratedLeagueStats = healPbaEconomySettings(migratedLeagueStats);
  let healedSchedule = healSchedule(loaded.schedule, migratedLeagueStats);
  const teamsWithCleanDeadMoney = cleanDeadMoneyTeams(loaded.teams);
  const teamsWithHealedIdentity = healHistoricalTeamIdentity(loaded, teamsWithCleanDeadMoney as any, playersWithUniqueIds);
  const teamsWithHealedRecords = healLoadedNbaTeamRecords(loaded, migratedLeagueStats, healedSchedule, teamsWithHealedIdentity as any);
  const teamsWithHealedStaff = healLegacyNbaStaff(teamsWithHealedRecords as any, loaded);
  const cleanedFAMarkets = cleanFaMarkets(loaded, migratedLeagueStats, healedSchedule, playersWithUniqueIds, teamsWithHealedStaff as any);
  let cleanedHistory = cleanOptionHistory(loaded.history);

  let teamsWithFreshTraining = await refreshTrainingCalendars(loaded, teamsWithHealedStaff as any);
  let playersWithAISetup = await applyTrainingAiSetup(loaded, playersWithUniqueIds, teamsWithFreshTraining as any);
  if (migratedLeagueStats?.uiMode === 'pba_isolated') {
    playersWithAISetup = applyPbaAwardsToPlayers(playersWithAISetup, buildPbaHistoricalAwards(currentSeasonYear));
  }

  if (loaded.leagueType === 'fictional' && loaded.staff?.referees?.length) {
    setRefereeData(loaded.staff.referees);
    console.log(`[LOAD_GAME] Restored ${loaded.staff.referees.length} fictional referees.`);
  }

  const healedFollowedHandles = healFollowedHandles(loaded);
  let healedOffseasonChecklist = healOffseasonChecklist({ ...loaded, leagueStats: migratedLeagueStats });
  let healedHistoricalAwards = Array.isArray(loaded.historicalAwards) ? loaded.historicalAwards : initialState.historicalAwards;
  let healedNews = cleanDuplicateAutoNews(loaded.news ?? initialState.news);
  let healedStaff = loaded.staff;
  let healedAllStar = loaded.allStar;
  let healedNonNBATeams = healPbaTeamStaff(
    (loaded.nonNBATeams ?? []).map(normalizeEndesaTeam),
    migratedLeagueStats,
  );
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
  let healedStaffFreeAgents = loaded.staffFreeAgents ?? [];
  let healedUserTeamId = loaded.userTeamId;

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
  }

  if (migratedLeagueStats?.uiMode === 'pba_isolated') {
    healedHistoricalAwards = healPbaAwardsFromConferenceChampions(
      healedHistoricalAwards,
      (migratedLeagueStats as any)?.pbaConferenceChampions ?? [],
    );
    playersWithAISetup = healLoadedPbaContracts(playersWithAISetup, migratedLeagueStats, currentSeasonYear, healedNonNBATeams);
    playersWithAISetup = healLoadedPbaDraftProspects(playersWithAISetup, migratedLeagueStats, currentSeasonYear);
  }

  healedStaffFreeAgents = ensureStandardStaffPool(
    loaded,
    migratedLeagueStats,
    healedNonNBATeams,
    teamsWithFreshTraining as any,
    healedStaffFreeAgents,
  );

  const nextState = {
    ...initialState,
    ...loaded,
    leagueStats: { ...migratedLeagueStats, historyIdentityMigrationVersion: Math.max(Number((migratedLeagueStats as any)?.historyIdentityMigrationVersion ?? 0), 1) },
    userTeamId: healedUserTeamId,
    nonNBATeams: healedNonNBATeams,
    activeCompetitions: migratedLeagueStats?.uiMode === 'pba_isolated'
      ? PBA_COMPETITIONS
      : loaded.activeCompetitions ?? initialState.activeCompetitions,
    schedule: healedSchedule,
    boxScores: healedBoxScores,
    players: playersWithAISetup,
    teams: teamsWithFreshTraining as any,
    staff: healedStaff,
    allStar: healedAllStar,
    staffFreeAgents: healedStaffFreeAgents,
    draftPicks: healedDraftPicks,
    euroSetupSeed: healedEuroSetupSeed,
    history: cleanedHistory,
    news: healedNews,
    faBidding: { markets: cleanedFAMarkets },
    followedHandles: healedFollowedHandles ?? initialState.followedHandles,
    offseasonChecklist: healedOffseasonChecklist,
    isProcessing: false,
    historicalAwards: migratedLeagueStats?.uiMode === 'pba_isolated'
      ? (() => {
          const pbaAwards = buildPbaHistoricalAwards(currentSeasonYear);
          const existing = healedHistoricalAwards;
          const merged = [...existing, ...pbaAwards];
          const seen = new Set<string>();
          return merged.filter((award: any) => {
            const key = `${award.season}-${award.type}-${String(award.name ?? '')}-${String(award.team ?? '')}-${String(award.conference ?? '')}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        })()
      : loaded.historicalAwards ?? initialState.historicalAwards,
  } as GameState;

  return {
    nextState,
    imageCachePlayers: finalPlayers,
  };
}
