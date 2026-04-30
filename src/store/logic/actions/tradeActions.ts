import { GameState, UserAction } from '../../../types';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { advanceDay } from '../../../services/llm/llm';
import { executeExecutiveTrade } from '../../../services/tradeService';
import { buildShamsTradePost } from '../../../services/social/templates/charania';
import { calculateSocialEngagement } from '../../../utils/helpers';
import { NewsGenerator } from '../../../services/news/NewsGenerator';
import { buildFullDraftSlotMap, formatPickLabel } from '../../../services/draft/draftClassStrength';

export const handleExecutiveTrade = async (stateWithSim: GameState, action: UserAction, executiveTradeTransactionRef: { current: any }, simResults: any[], recentDMs: any[]) => {
    const currentYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
    const lotterySlotByTid = buildFullDraftSlotMap((stateWithSim as any).draftLotteryResult, stateWithSim.teams);
    const tradeResult = executeExecutiveTrade(action.payload, stateWithSim.players, stateWithSim.teams, stateWithSim.draftPicks, currentYear, lotterySlotByTid);
    executiveTradeTransactionRef.current = tradeResult.transaction;
    const teamA = stateWithSim.teams.find(t => t.id === action.payload.teamAId);
    const teamB = stateWithSim.teams.find(t => t.id === action.payload.teamBId);
    
    const playersA = stateWithSim.players.filter(p => action.payload.teamAPlayers.includes(p.internalId)).map(p => p.name);
    const playersB = stateWithSim.players.filter(p => action.payload.teamBPlayers.includes(p.internalId)).map(p => p.name);
    // Pick labels include the original-owner abbrev — TradeDetailView's parser
    // uses " + " to separate the player CSV from the pick CSV, and downstream
    // pick UI (PickRow, Shams social posts) rely on the "(ABBR)" suffix.
    const pickLabel = (dpid: number): string => {
        const pk = stateWithSim.draftPicks.find(p => p.dpid === dpid);
        if (!pk) return 'pick';
        const orig = stateWithSim.teams.find(t => t.id === pk.originalTid);
        return `${formatPickLabel(pk, currentYear, lotterySlotByTid, true)} (${orig?.abbrev ?? '?'})`;
    };
    const picksA = (action.payload.teamAPicks ?? []).map(pickLabel);
    const picksB = (action.payload.teamBPicks ?? []).map(pickLabel);

    const cashA: number = action.payload.teamACashUSD ?? 0;
    const cashB: number = action.payload.teamBCashUSD ?? 0;
    const fmtCash = (usd: number) => `$${(usd / 1_000_000).toFixed(1)}M cash`;
    const joinAssets = (players: string[], picks: string[], cashUSD: number): string => {
        const parts: string[] = [];
        if (players.length > 0) parts.push(players.join(', '));
        if (picks.length > 0) parts.push(picks.join(', '));
        if (cashUSD > 0) parts.push(fmtCash(cashUSD));
        return parts.length === 0 ? 'None' : parts.join(' + ');
    };
    const assetsA = joinAssets(playersA, picksA, cashA);
    const assetsB = joinAssets(playersB, picksB, cashB);

    const isCommishForced = !!action.payload.commissionerForced;
    const tradeSeed = isCommishForced
        ? `COMMISSIONER-FORCED TRADE: ${stateWithSim.commissionerName} has overridden cap rules to push through a deal between the ${teamA?.name} and ${teamB?.name}. ` +
          `${teamB?.name} receive: ${assetsA}. ${teamA?.name} receive: ${assetsB}. ` +
          `This is controversial — owners are furious, players feel like pawns, the union is making noise. ` +
          `Generate shocked insider tweets (@ShamsCharania, @wojespn), outraged owner/player reactions, and analysts questioning the commissioner's power.`
        : `BREAKING TRADE: The ${teamA?.name} and ${teamB?.name} have completed a trade. ` +
          `${teamB?.name} receive: ${assetsA}. ${teamA?.name} receive: ${assetsB}. ` +
          `Generate immediate reactions — insider tweets breaking the trade, fan reactions, ` +
          `analysts debating the winners and losers, and at least one post from @ShamsCharania or @wojespn.`;

    const result = await advanceDay(stateWithSim, {
        type: 'EXECUTIVE_TRADE',
        payload: {
            teamAId: action.payload.teamAId,
            teamBId: action.payload.teamBId,
            commissionerForced: isCommishForced,
            outcomeText: isCommishForced
                ? `Commissioner ${stateWithSim.commissionerName} has forced a trade between the ${teamA?.name} and ${teamB?.name}, overriding league cap rules. ${assetsA} are headed to ${teamB?.abbrev}; ${assetsB} to ${teamA?.abbrev}. The move is already drawing backlash.`
                : `A trade has been finalized between the ${teamA?.name} and ${teamB?.name}. ${assetsA} have been moved to the ${teamB?.abbrev}, while ${assetsB} have been sent to the ${teamA?.abbrev}.`,
        }
    } as any, [tradeSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

    // Ensure outcomeText is always rich (LLM may return empty string when it fails)
    if (!result.outcomeText) {
        result.outcomeText = isCommishForced
            ? `${stateWithSim.commissionerName} forces a trade — ${teamA?.abbrev} and ${teamB?.abbrev} swap assets under commissioner override. Backlash expected.`
            : `${teamA?.name} and ${teamB?.name} complete a trade. ${teamB?.abbrev} receive: ${assetsA}. ${teamA?.abbrev} receive: ${assetsB}.`;
    }

    // Commissioner-forced trades carry morale/approval hits — magnitude scales with the
    // biggest star moved. Mirrors outcomeDecider's FORCE_TRADE case.
    if (isCommishForced) {
        const maxOVR = Math.max(
            ...stateWithSim.players.filter(p => action.payload.teamAPlayers.includes(p.internalId) || action.payload.teamBPlayers.includes(p.internalId)).map(p => p.overallRating ?? 0),
            0
        );
        const isSuperstar = maxOVR >= 68;
        result.consequence = result.consequence || {};
        result.consequence.statChanges = result.consequence.statChanges || {};
        const sc = result.consequence.statChanges;
        sc.morale = sc.morale || { fans: 0, players: 0, owners: 0 };
        const moraleHit = isSuperstar ? -10 : -4;
        sc.morale.players = (sc.morale.players || 0) + moraleHit;
        sc.morale.owners = (sc.morale.owners || 0) + moraleHit;
        sc.playerApproval = (sc.playerApproval || 0) + (isSuperstar ? -5 : -2);
        sc.viewership = (sc.viewership || 0) + 3; // controversy = eyeballs
    }

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
    const forceSeed = action.payload?.outcomeText
        ? `COMMISSIONER-FORCED TRADE: ${action.payload.outcomeText} This is a controversial move — generate shocked reactions, insider tweets, and owner/player responses.`
        : `COMMISSIONER-FORCED TRADE just occurred. Generate shocked reactions, insider tweets, and controversy.`;
    const result = await advanceDay(stateWithSim, action, [forceSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.consequence = result.consequence || {};
    result.consequence.statChanges = result.consequence.statChanges || {};
    result.consequence.statChanges.viewership = (result.consequence.statChanges.viewership || 0) + (outcome.viewership || 0);
    result.consequence.statChanges.morale = result.consequence.statChanges.morale || { fans: 0, players: 0, owners: 0 };
    result.consequence.statChanges.morale.players = (result.consequence.statChanges.morale.players || 0) + (outcome.morale || 0);
    result.consequence.statChanges.morale.fans = (result.consequence.statChanges.morale.fans || 0) + (outcome.morale || 0);
    result.consequence.statChanges.morale.owners = (result.consequence.statChanges.morale.owners || 0) + (outcome.morale || 0);
    return result;
};
