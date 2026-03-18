import { GameState, UserAction } from '../../../types';
import { advanceDay } from '../../../services/llm/llm';

export const handleEndorseHof = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts } = action.payload;
    if (!contacts || contacts.length === 0) return { isProcessing: false };
    
    const playerNames = contacts.map((p: any) => p.name).join(', ');
    const playerIds = contacts.map((p: any) => p.id || p.internalId);
    
    const outcomeText = `You have formally endorsed ${playerNames} for the Hall of Fame. Your email has been sent to the board.`;
    
    const result = await advanceDay(stateWithSim, {
        type: 'ENDORSE_HOF',
        payload: {
            outcomeText,
            players: contacts
        }
    } as any, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    
    // Update endorsed players in state
    result.endorsedPlayers = [...(result.endorsedPlayers || stateWithSim.endorsedPlayers), ...playerIds];
    
    // Add positive legacy/relationship impact
    result.statChanges = result.statChanges || {};
    result.statChanges.legacy = (result.statChanges.legacy || 0) + (10 * contacts.length);
    result.statChanges.relationship = (result.statChanges.relationship || 0) + (5 * contacts.length);
    
    return result;
};
