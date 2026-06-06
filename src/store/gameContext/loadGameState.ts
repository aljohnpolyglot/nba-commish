import type { GameState } from '../../types';
import { setRefereeData } from '../../data/photos/referees';
import { normalizeEndesaTeam } from '../../utils/endesaTeams';
import { initialState } from '../initialState';
import {
  applyTrainingAiSetup,
  cleanDeadMoneyTeams,
  cleanFaMarkets,
  cleanOptionHistory,
  finalizeLoadedPlayers,
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
import { applyPbaAwardsToPlayers, buildPbaHistoricalAwards } from '../../services/pba/awards';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { repairCompetitionSchedules } from '../../services/competition/competitionScheduler';
import { applyPbaConferenceLifecycle } from '../../services/pba/conferenceTransition';

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
  const healedDraftPicks = healLoadedDraftPicks(loaded, currentSeasonYear);

  let migratedLeagueStats = migrateLeagueStats(loaded);
  migratedLeagueStats = healPbaEconomySettings(migratedLeagueStats);
  let healedSchedule = healSchedule(loaded.schedule, migratedLeagueStats);
  const teamsWithCleanDeadMoney = cleanDeadMoneyTeams(loaded.teams);
  const teamsWithHealedIdentity = healHistoricalTeamIdentity(loaded, teamsWithCleanDeadMoney as any, backfilledPlayers);
  const teamsWithHealedRecords = healLoadedNbaTeamRecords(loaded, migratedLeagueStats, healedSchedule, teamsWithHealedIdentity as any);
  const teamsWithHealedStaff = healLegacyNbaStaff(teamsWithHealedRecords as any, loaded);
  const cleanedFAMarkets = cleanFaMarkets(loaded, migratedLeagueStats, healedSchedule, backfilledPlayers, teamsWithHealedStaff as any);
  let cleanedHistory = cleanOptionHistory(loaded.history);

  let teamsWithFreshTraining = await refreshTrainingCalendars(loaded, teamsWithHealedStaff as any);
  let playersWithAISetup = await applyTrainingAiSetup(loaded, backfilledPlayers, teamsWithFreshTraining as any);
  if (migratedLeagueStats?.uiMode === 'pba_isolated') {
    playersWithAISetup = applyPbaAwardsToPlayers(playersWithAISetup, buildPbaHistoricalAwards(currentSeasonYear));
  }

  if (loaded.leagueType === 'fictional' && loaded.staff?.referees?.length) {
    setRefereeData(loaded.staff.referees);
    console.log(`[LOAD_GAME] Restored ${loaded.staff.referees.length} fictional referees.`);
  }

  const healedFollowedHandles = healFollowedHandles(loaded);
  let healedOffseasonChecklist = healOffseasonChecklist(loaded);
  let healedStaff = loaded.staff;
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
    const pbaLifecyclePatch = applyPbaConferenceLifecycle({
      ...loaded,
      leagueStats: migratedLeagueStats,
      nonNBATeams: healedNonNBATeams,
      schedule: healedSchedule,
      boxScores: loaded.boxScores ?? [],
    } as GameState);
    if (pbaLifecyclePatch.schedule) healedSchedule = pbaLifecyclePatch.schedule;
    if (pbaLifecyclePatch.leagueStats) migratedLeagueStats = pbaLifecyclePatch.leagueStats as any;
    if (pbaLifecyclePatch.offseasonChecklist !== undefined) healedOffseasonChecklist = pbaLifecyclePatch.offseasonChecklist as any;
    if (pbaLifecyclePatch.history) cleanedHistory = pbaLifecyclePatch.history as any;
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
    players: playersWithAISetup,
    teams: teamsWithFreshTraining as any,
    staff: healedStaff,
    staffFreeAgents: healedStaffFreeAgents,
    draftPicks: healedDraftPicks,
    euroSetupSeed: healedEuroSetupSeed,
    history: cleanedHistory,
    faBidding: { markets: cleanedFAMarkets },
    followedHandles: healedFollowedHandles ?? initialState.followedHandles,
    offseasonChecklist: healedOffseasonChecklist,
    isProcessing: false,
    historicalAwards: migratedLeagueStats?.uiMode === 'pba_isolated'
      ? (() => {
          const pbaAwards = buildPbaHistoricalAwards(currentSeasonYear);
          const existing = Array.isArray(loaded.historicalAwards) ? loaded.historicalAwards : [];
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
