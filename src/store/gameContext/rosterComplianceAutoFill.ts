import type { GameState, NBAPlayer } from '../../types';
import { getActiveNativeTeamIds } from '../../services/backgroundUniverse/backgroundSeasonGenerator';
import { handleSignFreeAgent } from '../logic/actions/signFreeAgentActions';
import { getDisplayOverall } from '../../utils/playerRatings';
import { isPlayerInLeagueScope, type PlayerLeagueScope } from '../../utils/playerLeagueScope';
import { getContractLimits } from '../../utils/salaryUtils';
import { areTwoWayContractsEnabled, isTwoWayContract } from '../../utils/contractTypes';
import { isOnRoster, resolveAnyTeam } from '../../utils/teamLookup';
import { getTwoWayRosterLimit } from '../../utils/rosterLimits';
import { isPbaIsolatedMode, isWnbaIsolatedMode } from '../../utils/uiMode';
import { isPbaRosterLocal } from '../../services/pba/importManager';
import { isUnavailableInternationalTournamentPlayer } from '../../utils/prospectUtils';

function playerScope(state: GameState): PlayerLeagueScope {
  if (isPbaIsolatedMode(state)) return 'pba';
  if (isWnbaIsolatedMode(state)) return 'wnba';
  return state.leagueType === 'fictional' ? 'fictional' : 'nba';
}

function standardRosterCount(state: GameState, teamId: number): number {
  const twoWayEnabled = getTwoWayRosterLimit(state.leagueStats) > 0
    && areTwoWayContractsEnabled(state.leagueStats);
  return state.players.filter(player => (
    player.tid === teamId
    && isOnRoster(player)
    && (!twoWayEnabled || !isTwoWayContract(player, state.leagueStats))
  )).length;
}

export function getRosterComplianceAutoFillCandidates(
  state: GameState,
  slotsNeeded: number,
): NBAPlayer[] {
  const scope = playerScope(state);
  const teamIds = getActiveNativeTeamIds(state);
  return state.players
    .filter(player => (
      player.tid === -1
      && player.status === 'Free Agent'
      && !isUnavailableInternationalTournamentPlayer(player)
      && isPlayerInLeagueScope(player, scope, teamIds)
      && (scope !== 'pba' || isPbaRosterLocal(player, state.leagueStats))
    ))
    .sort((a, b) => getDisplayOverall(b) - getDisplayOverall(a))
    .slice(0, Math.max(0, slotsNeeded));
}

export async function applyRosterComplianceAutoFill(
  state: GameState,
  teamId: number,
  requestedPlayerIds: readonly string[],
): Promise<GameState> {
  if (state.gameMode !== 'gm' || state.userTeamId !== teamId) return state;
  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  if (!team) return state;

  const minRoster = isPbaIsolatedMode(state)
    ? 10
    : (state.leagueStats?.minPlayersPerTeam ?? 14);
  const slotsNeeded = Math.max(0, minRoster - standardRosterCount(state, teamId));
  const allowedIds = new Set(
    getRosterComplianceAutoFillCandidates(state, slotsNeeded).map(player => player.internalId),
  );
  const requestedIds = [...new Set(requestedPlayerIds)].filter(id => allowedIds.has(id)).slice(0, slotsNeeded);

  let next = state;
  let signedCount = 0;
  for (const playerId of requestedIds) {
    const player = next.players.find(candidate => candidate.internalId === playerId);
    if (!player
      || player.tid !== -1
      || player.status !== 'Free Agent'
      || isUnavailableInternationalTournamentPlayer(player)) continue;
    const salary = getContractLimits(player, next.leagueStats).minSalaryUSD;
    const result: any = await handleSignFreeAgent(next, {
      type: 'SIGN_FREE_AGENT',
      payload: {
        playerId,
        teamId,
        playerName: player.name,
        teamName: team.name,
        salary,
        years: 1,
        option: 'NONE',
        twoWay: false,
        nonGuaranteed: false,
        mleType: null,
        rosterComplianceAutoFill: true,
      },
    }, [], []);
    const signed = result.players?.find((candidate: NBAPlayer) => candidate.internalId === playerId);
    if (!signed || signed.tid !== teamId) continue;
    next = {
      ...next,
      players: result.players,
      teams: result.teams ?? next.teams,
      nonNBATeams: result.nonNBATeams ?? next.nonNBATeams,
      leagueStats: result.leagueStats ?? next.leagueStats,
    };
    signedCount += 1;
  }

  return signedCount > 0
    ? { ...next, isProcessing: false, lastOutcome: `Auto-signed ${signedCount} player${signedCount === 1 ? '' : 's'} to meet the roster minimum.` }
    : { ...next, isProcessing: false, lastOutcome: 'No eligible free agent could be auto-signed for this league.' };
}
