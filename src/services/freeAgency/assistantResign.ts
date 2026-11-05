import type { GameState } from '../../types';
import { handleSignFreeAgent } from '../../store/logic/actions/signFreeAgentActions';
import { resolveAnyTeam } from '../../utils/teamLookup';
import {
  isReSignDecision,
  resolveOffseasonContractDecision,
} from './offseasonContractDecision';

export type AssistantResignOffer = {
  playerId: string;
  salaryUSD: number;
  years: number;
};

export async function applyAssistantResignOffers(
  state: GameState,
  teamId: number,
  offers: readonly AssistantResignOffer[],
): Promise<GameState> {
  if (state.gameMode !== 'gm' || Number(state.userTeamId) !== teamId) return state;
  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  if (!team) return state;

  let next = state;
  let signedCount = 0;
  for (const offer of offers) {
    const player = next.players.find(candidate => candidate.internalId === offer.playerId);
    if (!player || player.status === 'Retired') continue;
    const decision = resolveOffseasonContractDecision(player, next);
    if (decision.teamId !== teamId || !isReSignDecision(decision.kind)) continue;
    const result: any = await handleSignFreeAgent(next, {
      type: 'SIGN_FREE_AGENT',
      payload: {
        playerId: player.internalId,
        teamId,
        playerName: player.name,
        teamName: team.name,
        salary: offer.salaryUSD,
        years: offer.years,
        option: 'NONE',
        twoWay: false,
        nonGuaranteed: false,
        mleType: null,
        automatedNativeSigning: true,
      },
    }, [], []);
    const signed = result.players?.find((candidate: any) => candidate.internalId === player.internalId);
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

  return {
    ...next,
    isProcessing: false,
    lastOutcome: signedCount > 0
      ? `Assistant GM completed ${signedCount} contract extension${signedCount === 1 ? '' : 's'}.`
      : 'Assistant GM completed the contract review without a new extension.',
  };
}
