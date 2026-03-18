import { GameState, UserAction } from '../../../types';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { advanceDay } from '../../../services/llm/llm';

export const handleTransferFunds = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { from, amount } = action.payload;
    const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
    const sourceText = from === 'league' ? "from League Funds to Personal Wealth" : "from Personal Wealth to League Funds";
    
    const outcomeText = `The Commissioner has transferred ${formattedAmount} ${sourceText}. While technically within their authority, such movements of capital often draw scrutiny from league auditors and the media.`;

    const result = await advanceDay(stateWithSim, {
        type: 'TRANSFER_FUNDS',
        payload: {
            ...action.payload,
            outcomeText
        }
    } as any, [`The media is questioning the Commissioner's recent movement of funds.`], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    
    result.statChanges = result.statChanges || {};
    if (amount > 1000000) {
        result.statChanges.legacy = (result.statChanges.legacy || 0) - 1;
        result.statChanges.ownerApproval = (result.statChanges.ownerApproval || 0) - 1;
    }
    return result;
};

export const handleGiveMoney = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const outcome = calculateOutcome('GIVE_MONEY', action.payload, stateWithSim);
    const result = await advanceDay(stateWithSim, action, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.ownerApproval = (result.statChanges.ownerApproval || 0) + (outcome.ownerApproval || 0);
    result.statChanges.playerApproval = (result.statChanges.playerApproval || 0) + (outcome.playerApproval || 0);
    return result;
};

export const handleFinePerson = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const outcome = calculateOutcome('FINE_PERSON', action.payload, stateWithSim);
    const result = await advanceDay(stateWithSim, action, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.ownerApproval = (result.statChanges.ownerApproval || 0) + (outcome.ownerApproval || 0);
    result.statChanges.playerApproval = (result.statChanges.playerApproval || 0) + (outcome.playerApproval || 0);
    return result;
};

export const handleAdjustFinancials = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const outcome = calculateOutcome('ADJUST_FINANCIALS', action.payload, stateWithSim);
    const result = await advanceDay(stateWithSim, action, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.statChanges = result.statChanges || {};
    result.statChanges.ownerApproval = (result.statChanges.ownerApproval || 0) + (outcome.ownerApproval || 0);
    result.statChanges.playerApproval = (result.statChanges.playerApproval || 0) + (outcome.playerApproval || 0);
    result.consequence = result.consequence || {};
    result.consequence.statChanges = result.consequence.statChanges || {};
    result.consequence.statChanges.morale = result.consequence.statChanges.morale || { fans: 0, players: 0, owners: 0 };
    result.consequence.statChanges.morale.players = (result.consequence.statChanges.morale.players || 0) + (outcome.morale || 0);
    result.consequence.statChanges.morale.fans = (result.consequence.statChanges.morale.fans || 0) + (outcome.morale || 0);
    result.consequence.statChanges.morale.owners = (result.consequence.statChanges.morale.owners || 0) + (outcome.morale || 0);
    return result;
};

export const handleBribePerson = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const outcome = calculateOutcome('BRIBE_PERSON', action.payload, stateWithSim);
    const result = await advanceDay(stateWithSim, action, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.ownerApproval = (result.statChanges.ownerApproval || 0) + (outcome.ownerApproval || 0);
    result.statChanges.playerApproval = (result.statChanges.playerApproval || 0) + (outcome.playerApproval || 0);
    return result;
};
