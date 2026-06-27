import { GameState, NBAPlayer as Player } from '../../../../types';
import { runAIMidSeasonExtensions, runAISeasonEndExtensions } from '../../../../services/AIFreeAgentHandler';
import { buildShamsTransactionPost } from '../../../../services/social/templates/charania';
import { getInsiderHandle } from '../../../../data/social/handles';
import { convertTo2KRating, calculateSocialEngagement } from '../../../../utils/helpers';
import { addGameDays, formatGameDateShort, parseGameDate } from '../../../../utils/dateUtils';
import { formatContractTotalUSD, seasonLabelToYear } from '../../../../utils/salaryUtils';

const releaseDeclinedExtensionPlayer = (player: Player): Player => {
    return { ...player, midSeasonExtensionDeclined: true } as any;
};

export function applyMidSeasonExtensionsPass(
    stateWithSim: GameState,
    isPlayoffDay: boolean,
    extMonth: number,
): GameState {
    const isExtensionWindow = extMonth >= 10 || extMonth <= 2;
    if (isPlayoffDay || !isExtensionWindow || stateWithSim.day % 14 !== 0) {
        return stateWithSim;
    }

    const extensions = runAIMidSeasonExtensions(stateWithSim);
    if (extensions.length === 0) return stateWithSim;

    const acceptedIds = new Set(extensions.filter(e => !e.declined).map(e => e.playerId));
    const declinedIds = new Set(extensions.filter(e => e.declined).map(e => e.playerId));
    const extMap = new Map(extensions.map(e => [e.playerId, e]));

    let nextState: GameState = {
        ...stateWithSim,
        players: stateWithSim.players.map(p => {
            if (acceptedIds.has(p.internalId)) {
                const ext = extMap.get(p.internalId)!;
                const extBaseYear = (stateWithSim.leagueStats?.year ?? new Date().getFullYear()) + 1;
                const annualUSD = ext.newSalaryUSD ?? ext.newAmount * 1_000_000;
                const extContractYears = Array.from({ length: ext.newYears ?? 1 }, (_, i) => {
                    const yr = extBaseYear + i;
                    return {
                        season: `${yr - 1}-${String(yr).slice(-2)}`,
                        guaranteed: Math.round(annualUSD * Math.pow(1.05, i)),
                        option: i === (ext.newYears ?? 1) - 1 && ext.hasPlayerOption ? 'Player' : '',
                    };
                });
                const existingThroughCurrent = ((p as any).contractYears ?? []).filter((cy: any) => {
                    const yr = seasonLabelToYear(cy.season);
                    return yr < extBaseYear;
                });
                return {
                    ...p,
                    contract: { ...p.contract, exp: ext.newExp },
                    contractYears: [...existingThroughCurrent, ...extContractYears],
                    twoWay: false,
                };
            }
            if (declinedIds.has(p.internalId)) return releaseDeclinedExtensionPlayer(p);
            return p;
        }),
    };

    const baseDate = parseGameDate(nextState.date);
    const extHistoryEntries = extensions
        .filter(e => !e.declined)
        .map(e => {
            const totalValue = formatContractTotalUSD(e.newSalaryUSD ?? e.newAmount * 1_000_000, e.newYears ?? 1);
            const optTag = e.hasPlayerOption ? ' (player option)' : '';
            let playerSeed = 0;
            for (let ci = 0; ci < e.playerId.length; ci++) playerSeed += e.playerId.charCodeAt(ci);
            const entryDate = addGameDays(baseDate, -(playerSeed % 14));
            return {
                text: `${e.playerName} has re-signed with the ${e.teamName}: ${totalValue}/${e.newYears ?? 1}yr${optTag}${e.contractLabel ? ` (${e.contractLabel})` : ''}`,
                date: formatGameDateShort(entryDate),
                type: 'Signing',
                playerIds: [e.playerId],
                tid: e.teamId,
            };
        });

    const shamsExtPosts: any[] = [];
    const extInsider = getInsiderHandle(nextState.leagueType);
    for (const e of extensions.filter(ex => !ex.declined)) {
        const player = nextState.players.find(p => p.internalId === e.playerId);
        if (!player) continue;
        const lr = (player as any).ratings?.[(player as any).ratings?.length - 1];
        const k2 = convertTo2KRating(player.overallRating ?? 0, lr?.hgt ?? 50, lr?.tp);
        if (k2 < 78) continue;
        const content = buildShamsTransactionPost({
            type: 'extension',
            playerName: e.playerName,
            teamName: e.teamName,
            amount: (e.newSalaryUSD ?? e.newAmount * 1_000_000) / 1_000_000,
            years: e.newYears ?? 1,
            hasPlayerOption: e.hasPlayerOption,
        });
        if (!content) continue;
        const engagement = calculateSocialEngagement(extInsider.atHandle, content, player.overallRating);
        shamsExtPosts.push({
            id: `shams-ext-${e.playerId}-${Date.now()}-${Math.random()}`,
            author: extInsider.name,
            handle: extInsider.atHandle,
            content,
            date: new Date(nextState.date).toISOString(),
            likes: engagement.likes,
            retweets: engagement.retweets,
            source: 'TwitterX' as const,
            isNew: true,
            playerPortraitUrl: player.imgURL,
        });
    }

    if (extHistoryEntries.length === 0 && shamsExtPosts.length === 0) return nextState;
    return {
        ...nextState,
        history: [...(nextState.history ?? []), ...extHistoryEntries],
        socialFeed: shamsExtPosts.length > 0
            ? [...shamsExtPosts, ...(nextState.socialFeed ?? [])].slice(0, 500)
            : (nextState.socialFeed ?? []),
    };
}

export function applySeasonEndExtensionsPass(
    stateWithSim: GameState,
    isPlayoffDay: boolean,
    extMonth: number,
): GameState {
    const isSeasonEndExtWindow = extMonth === 5 || extMonth === 6;
    if (isPlayoffDay || !isSeasonEndExtWindow || stateWithSim.day % 7 !== 0) {
        return stateWithSim;
    }

    const endExts = runAISeasonEndExtensions(stateWithSim);
    if (endExts.length === 0) return stateWithSim;

    const acceptedIds = new Set(endExts.filter(e => !e.declined).map(e => e.playerId));
    const declinedIds = new Set(endExts.filter(e => e.declined).map(e => e.playerId));
    const extMap = new Map(endExts.map(e => [e.playerId, e]));

    const nextState: GameState = {
        ...stateWithSim,
        players: stateWithSim.players.map(p => {
            if (acceptedIds.has(p.internalId)) {
                const ext = extMap.get(p.internalId)!;
                const extBaseYear = (stateWithSim.leagueStats?.year ?? new Date().getFullYear()) + 1;
                const annualUSD = ext.newSalaryUSD ?? ext.newAmount * 1_000_000;
                const extContractYears = Array.from({ length: ext.newYears ?? 1 }, (_, i) => {
                    const yr = extBaseYear + i;
                    return {
                        season: `${yr - 1}-${String(yr).slice(-2)}`,
                        guaranteed: Math.round(annualUSD * Math.pow(1.05, i)),
                        option: i === (ext.newYears ?? 1) - 1 && ext.hasPlayerOption ? 'Player' : '',
                    };
                });
                const existingThroughCurrent = ((p as any).contractYears ?? []).filter((cy: any) => {
                    const yr = seasonLabelToYear(cy.season);
                    return yr < extBaseYear;
                });
                return {
                    ...p,
                    contract: { ...p.contract, exp: ext.newExp },
                    contractYears: [...existingThroughCurrent, ...extContractYears],
                };
            }
            if (declinedIds.has(p.internalId)) return releaseDeclinedExtensionPlayer(p);
            return p;
        }),
    };

    const eeHistoryEntries = endExts
        .filter(e => !e.declined)
        .map(e => {
            const totalValue = formatContractTotalUSD(e.newSalaryUSD ?? e.newAmount * 1_000_000, e.newYears ?? 1);
            const optTag = e.hasPlayerOption ? ' (player option)' : '';
            return {
                text: `${e.playerName} re-signs with ${e.teamName} before free agency: ${totalValue}/${e.newYears ?? 1}yr${optTag}${e.contractLabel ? ` (${e.contractLabel})` : ''}`,
                date: nextState.date,
                type: 'Signing',
                playerIds: [e.playerId],
                tid: e.teamId,
            };
        });

    if (eeHistoryEntries.length === 0) return nextState;
    return {
        ...nextState,
        history: [...(nextState.history ?? []), ...eeHistoryEntries],
    };
}
