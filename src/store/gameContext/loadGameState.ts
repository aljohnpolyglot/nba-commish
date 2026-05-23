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
  healFollowedHandles,
  healOffseasonChecklist,
  healSchedule,
  migrateLeagueStats,
  migrateLoadedPlayers,
  refreshTrainingCalendars,
} from './loadGameStateHealers';
import { applyEuroLoadHeals, ensureStandardStaffPool } from './loadGameStateEuro';

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

  const migratedLeagueStats = migrateLeagueStats(loaded);
  const healedSchedule = healSchedule(loaded.schedule, migratedLeagueStats);
  const teamsWithCleanDeadMoney = cleanDeadMoneyTeams(loaded.teams);
  const cleanedFAMarkets = cleanFaMarkets(loaded, migratedLeagueStats, healedSchedule, backfilledPlayers, teamsWithCleanDeadMoney as any);
  const cleanedHistory = cleanOptionHistory(loaded.history);

  let teamsWithFreshTraining = await refreshTrainingCalendars(loaded, teamsWithCleanDeadMoney as any);
  let playersWithAISetup = await applyTrainingAiSetup(loaded, backfilledPlayers, teamsWithFreshTraining as any);

  if (loaded.leagueType === 'fictional' && loaded.staff?.referees?.length) {
    setRefereeData(loaded.staff.referees);
    console.log(`[LOAD_GAME] Restored ${loaded.staff.referees.length} fictional referees.`);
  }

  const healedFollowedHandles = healFollowedHandles(loaded);
  let healedOffseasonChecklist = healOffseasonChecklist(loaded);
  let healedStaff = loaded.staff;
  let healedNonNBATeams = (loaded.nonNBATeams ?? []).map(normalizeEndesaTeam);
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
    leagueStats: migratedLeagueStats,
    userTeamId: healedUserTeamId,
    nonNBATeams: healedNonNBATeams,
    schedule: healedSchedule,
    players: playersWithAISetup,
    teams: teamsWithFreshTraining as any,
    staff: healedStaff,
    staffFreeAgents: healedStaffFreeAgents,
    euroSetupSeed: healedEuroSetupSeed,
    history: cleanedHistory,
    faBidding: { markets: cleanedFAMarkets },
    followedHandles: healedFollowedHandles ?? initialState.followedHandles,
    offseasonChecklist: healedOffseasonChecklist,
    isProcessing: false,
  } as GameState;

  return {
    nextState,
    imageCachePlayers: finalPlayers,
  };
}
