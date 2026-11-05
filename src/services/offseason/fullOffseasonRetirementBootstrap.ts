import type { GameState } from '../../types';
import { runRetirementChecks } from '../playerDevelopment/retirementChecker';
import { processStaffRetirementsForTeams } from '../staff/staffRetirement';
import { isPlayerInLeagueScope } from '../../utils/playerLeagueScope';

export const FULL_OFFSEASON_RETIREMENT_BOOTSTRAP_VERSION = 1;

function isUnresolved(status: unknown): boolean {
  return status === 'pending' || status === 'in-progress';
}

export function needsFullOffseasonRetirementBootstrap(state: GameState): boolean {
  if (state.nbaGmStartMode !== 'full_offseason') return false;
  if (state.leagueType !== 'modded' || state.moddedLeagueBase !== 'nba') return false;
  if (state.leagueStats?.uiMode && state.leagueStats.uiMode !== 'nba') return false;
  if (!(state.leagueStats as any)?.nbaGMStaffSeeded) return false;
  const year = Number(state.leagueStats?.year);
  if (!Number.isFinite(year) || Number(state.nbaStartYear ?? year) !== year) return false;
  return Number((state.leagueStats as any)?.fullOffseasonRetirementBootstrapVersion ?? 0)
    < FULL_OFFSEASON_RETIREMENT_BOOTSTRAP_VERSION;
}

export function bootstrapFullOffseasonRetirements(state: GameState): GameState {
  if (!needsFullOffseasonRetirementBootstrap(state)) return state;
  const year = Number(state.leagueStats.year);
  const playerReviewOpen = isUnresolved(state.offseasonChecklist?.retiredPlayersReview);
  const staffReviewOpen = isUnresolved(state.offseasonChecklist?.staffRetirements);
  const nbaTeamIds = new Set(state.teams.map(team => Number(team.id)).filter(Number.isFinite));
  const excludedPlayerIds = new Set(
    state.players
      .filter(player => !isPlayerInLeagueScope(player, 'nba', nbaTeamIds))
      .map(player => player.internalId),
  );
  const playerPass = playerReviewOpen
    ? runRetirementChecks(state.players, year, { excludedPlayerIds })
    : { players: state.players, newRetirees: [] };
  const staffPass = staffReviewOpen
    ? processStaffRetirementsForTeams(state.teams, year, state.date)
    : { teams: state.teams, retirements: [], historyEntries: [] };
  const priorPlayerIds = new Set((state.retirementAnnouncements ?? []).map(record => record.playerId));
  const priorStaffIds = new Set((state.staffRetirementAnnouncements ?? []).map(record => record.id));

  return {
    ...state,
    players: playerPass.players,
    teams: staffPass.teams,
    retirementAnnouncements: [
      ...(state.retirementAnnouncements ?? []),
      ...playerPass.newRetirees.filter(record => !priorPlayerIds.has(record.playerId)),
    ],
    staffRetirementAnnouncements: [
      ...(state.staffRetirementAnnouncements ?? []),
      ...staffPass.retirements.filter(record => !priorStaffIds.has(record.id)),
    ],
    history: [...(state.history ?? []), ...staffPass.historyEntries],
    leagueStats: {
      ...state.leagueStats,
      fullOffseasonRetirementBootstrapVersion: FULL_OFFSEASON_RETIREMENT_BOOTSTRAP_VERSION,
      fullOffseasonRetirementBootstrapYear: year,
    } as any,
  };
}
