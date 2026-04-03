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
    const { contacts, reason, amount } = action.payload;
    const names = contacts?.length > 0 ? contacts.map((c: any) => c.name).join(', ') : (action.payload.targetName || 'the recipient');
    const formattedAmount = amount
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
        : 'an undisclosed amount';
    const outcomeText = `Commissioner ${stateWithSim.commissionerName} disbursed ${formattedAmount} to ${names}. Reason: ${reason || 'undisclosed'}.`;
    const outcome = calculateOutcome('GIVE_MONEY', action.payload, stateWithSim);
    const giveSeed = `The NBA Commissioner just cut a ${formattedAmount} check to ${names}. Reason given: ${reason || 'undisclosed'}. ` +
        `Generate reactions — one reporter questioning the optics and whether this is an abuse of power, ` +
        `one fan praising it or mocking it depending on the reason, ` +
        `one financial analyst or league observer commenting on what this means for the NBA's bottom line or credibility. ` +
        `Make posts feel like real reactions to real money being spent — specific and opinionated.`;
    const result = await advanceDay(stateWithSim, {
        type: 'GIVE_MONEY',
        payload: { ...action.payload, outcomeText }
    } as any, [giveSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.ownerApproval = (result.statChanges.ownerApproval || 0) + (outcome.ownerApproval || 0);
    result.statChanges.playerApproval = (result.statChanges.playerApproval || 0) + (outcome.playerApproval || 0);
    return result;
};

export const handleFinePerson = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts, reason, amount } = action.payload;
    const names = contacts?.length > 0 ? contacts.map((c: any) => c.name).join(', ') : (action.payload.targetName || 'the subject');
    const formattedAmount = amount
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
        : 'an undisclosed amount';
    const outcomeText = `Commissioner ${stateWithSim.commissionerName} has issued a fine of ${formattedAmount} to ${names}. Reason: ${reason || 'conduct detrimental to the league'}.`;
    const fineSeed = `BREAKING: The NBA Commissioner just dropped a ${formattedAmount} fine on ${names}. Reason: ${reason || 'conduct detrimental to the league'}. ` +
        `@ShamsCharania breaks it first. Then: one furious fan defending ${names.split(',')[0]}, one fan saying they deserved worse, ` +
        `one analyst debating whether the fine is too light or too heavy given the reason, and a reaction from a player rep or agent. ` +
        `Make the posts feel like real Twitter — specific opinions, not vague reactions.`;
    const outcome = calculateOutcome('FINE_PERSON', action.payload, stateWithSim);
    const result = await advanceDay(stateWithSim, {
        type: 'FINE_PERSON',
        payload: { ...action.payload, outcomeText }
    } as any, [fineSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.ownerApproval = (result.statChanges.ownerApproval || 0) + (outcome.ownerApproval || 0);
    result.statChanges.playerApproval = (result.statChanges.playerApproval || 0) + (outcome.playerApproval || 0);
    return result;
};

export const handleAdjustFinancials = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { type: adjustType, teamName, amount, reason } = action.payload || {};
    const formattedAmount = amount
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(amount))
        : 'funds';
    const adjustTarget = teamName || 'a team';
    const direction = amount > 0 ? 'injected' : 'deducted';
    const outcomeText = `Commissioner ${stateWithSim.commissionerName} ${direction} ${formattedAmount} ${amount > 0 ? 'into' : 'from'} ${adjustTarget}'s finances. ${reason ? `Reason: ${reason}.` : ''}`;
    const adjustSeed = `The NBA just made a financial adjustment — ${formattedAmount} ${direction} for ${adjustTarget}. ${reason ? `Reason: ${reason}.` : ''} ` +
        `Generate reactions: one owner/exec reacting to the impact, one reporter noting what this means for their payroll or spending, ` +
        `one fan either hyped or worried about their team's financial situation. Be specific — not generic.`;
    const outcome = calculateOutcome('ADJUST_FINANCIALS', action.payload, stateWithSim);
    const result = await advanceDay(stateWithSim, {
        ...action,
        payload: { ...action.payload, outcomeText }
    } as any, [adjustSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
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
    const { contacts, reason, amount } = action.payload;
    const names = contacts?.length > 0 ? contacts.map((c: any) => c.name).join(', ') : (action.payload.targetName || 'the target');
    const formattedAmount = amount
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
        : 'an undisclosed sum';
    const outcomeText = `Commissioner ${stateWithSim.commissionerName} covertly offered ${formattedAmount} to ${names}. Purpose: ${reason || 'undisclosed'}.`;
    // Bribe is covert — generate rumors/suspicion without exposing the Commissioner
    const bribeSeed = `Unverified insider chatter is circulating in NBA circles. Something smells off — sources hint that ${names} may have received an unusual financial arrangement. ` +
        `Generate: 2-3 conspiracy tweets from reporters and fans speculating something shady happened, one insider journalist hinting they're "looking into something" regarding ${names}, ` +
        `one league official or rep firmly denying any wrongdoing. NEVER name the Commissioner as the source. Keep it murky and dramatic.`;
    const outcome = calculateOutcome('BRIBE_PERSON', action.payload, stateWithSim);
    const result = await advanceDay(stateWithSim, {
        type: 'BRIBE_PERSON',
        payload: { ...action.payload, outcomeText }
    } as any, [bribeSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.ownerApproval = (result.statChanges.ownerApproval || 0) + (outcome.ownerApproval || 0);
    result.statChanges.playerApproval = (result.statChanges.playerApproval || 0) + (outcome.playerApproval || 0);
    return result;
};
