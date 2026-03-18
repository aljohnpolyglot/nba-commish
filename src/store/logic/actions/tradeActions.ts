import { GameState, UserAction } from '../../../types';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { advanceDay } from '../../../services/llm/llm';
import { executeExecutiveTrade } from '../../../services/tradeService';

export const handleExecutiveTrade = async (stateWithSim: GameState, action: UserAction, executiveTradeTransactionRef: { current: any }, simResults: any[], recentDMs: any[]) => {
    const tradeResult = executeExecutiveTrade(action.payload, stateWithSim.players, stateWithSim.teams, stateWithSim.draftPicks);
    executiveTradeTransactionRef.current = tradeResult.transaction;
    const teamA = stateWithSim.teams.find(t => t.id === action.payload.teamAId);
    const teamB = stateWithSim.teams.find(t => t.id === action.payload.teamBId);
    
    const playersA = stateWithSim.players.filter(p => action.payload.teamAPlayers.includes(p.internalId)).map(p => p.name);
    const playersB = stateWithSim.players.filter(p => action.payload.teamBPlayers.includes(p.internalId)).map(p => p.name);
    const picksA = stateWithSim.draftPicks.filter(p => action.payload.teamAPicks.includes(p.dpid)).map(p => `${p.season} ${p.round === 1 ? '1st' : '2nd'} Rd`);
    const picksB = stateWithSim.draftPicks.filter(p => action.payload.teamBPicks.includes(p.dpid)).map(p => `${p.season} ${p.round === 1 ? '1st' : '2nd'} Rd`);

    const assetsA = [...playersA, ...picksA].join(', ') || 'None';
    const assetsB = [...playersB, ...picksB].join(', ') || 'None';

    return await advanceDay(stateWithSim, {
        type: 'EXECUTIVE_TRADE',
        payload: {
            teamAId: action.payload.teamAId,
            teamBId: action.payload.teamBId,
            outcomeText: `A trade has been finalized between the ${teamA?.name} and ${teamB?.name}. ${assetsA} have been moved to the ${teamB?.abbrev}, while ${assetsB} have been sent to the ${teamA?.abbrev}.`,
            transaction: tradeResult.transaction,
            announcements: tradeResult.announcements
        }
    } as any, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
};

export const handleForceTrade = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const outcome = calculateOutcome('FORCE_TRADE', action.payload, stateWithSim);
    const result = await advanceDay(stateWithSim, action, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.consequence = result.consequence || {};
    result.consequence.statChanges = result.consequence.statChanges || {};
    result.consequence.statChanges.viewership = (result.consequence.statChanges.viewership || 0) + (outcome.viewership || 0);
    result.consequence.statChanges.morale = result.consequence.statChanges.morale || { fans: 0, players: 0, owners: 0 };
    result.consequence.statChanges.morale.players = (result.consequence.statChanges.morale.players || 0) + (outcome.morale || 0);
    result.consequence.statChanges.morale.fans = (result.consequence.statChanges.morale.fans || 0) + (outcome.morale || 0);
    result.consequence.statChanges.morale.owners = (result.consequence.statChanges.morale.owners || 0) + (outcome.morale || 0);
    return result;
};
