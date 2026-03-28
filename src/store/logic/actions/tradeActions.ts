import { GameState, UserAction } from '../../../types';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { advanceDay } from '../../../services/llm/llm';
import { executeExecutiveTrade } from '../../../services/tradeService';
import { buildShamsTradePost } from '../../../services/social/templates/charania';
import { calculateSocialEngagement } from '../../../utils/helpers';
import { NewsGenerator } from '../../../services/news/NewsGenerator';

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

    const result = await advanceDay(stateWithSim, {
        type: 'EXECUTIVE_TRADE',
        payload: {
            teamAId: action.payload.teamAId,
            teamBId: action.payload.teamBId,
            outcomeText: `A trade has been finalized between the ${teamA?.name} and ${teamB?.name}. ${assetsA} have been moved to the ${teamB?.abbrev}, while ${assetsB} have been sent to the ${teamA?.abbrev}.`,
            transaction: tradeResult.transaction,
            announcements: tradeResult.announcements
        }
    } as any, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

    // Auto Charania trade post — injected directly into result.newSocialPosts
    // so it fires even when LLM is off (advanceDay early-return ignores payload.announcements)
    const shamsContent = buildShamsTradePost(
        teamA?.name ?? teamA?.abbrev ?? 'Team A',
        teamA?.abbrev ?? 'TMA',
        teamB?.name ?? teamB?.abbrev ?? 'Team B',
        teamB?.abbrev ?? 'TMB',
        [...playersA, ...picksA],
        [...playersB, ...picksB]
    );
    if (shamsContent) {
        const shamsEngagement = calculateSocialEngagement('@ShamsCharania', shamsContent, 82);
        const shamsPost = {
            id: `shams-trade-${Date.now()}`,
            author: 'Shams Charania',
            handle: '@ShamsCharania',
            content: shamsContent,
            date: stateWithSim.date,
            likes: shamsEngagement.likes,
            retweets: shamsEngagement.retweets,
            source: 'TwitterX',
            isNew: true,
        };
        result.newSocialPosts = [shamsPost, ...(result.newSocialPosts || [])];
    }

    // Auto trade news item (fires regardless of LLM)
    const tradeNewsItem = NewsGenerator.generate('trade_confirmed', stateWithSim.date, {
        teamAName: teamA?.name ?? teamA?.abbrev ?? 'Team A',
        teamBName: teamB?.name ?? teamB?.abbrev ?? 'Team B',
        assetsToB: assetsA,
        assetsToA: assetsB,
    }, teamA?.logoUrl);
    if (tradeNewsItem) result.newNews = [tradeNewsItem, ...(result.newNews || [])];

    return result;
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
