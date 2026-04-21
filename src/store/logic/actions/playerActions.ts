import { GameState, UserAction } from '../../../types';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { advanceDay } from '../../../services/llm/llm';
import { generateFreeAgentSigningReactions } from '../../../services/llm/services/freeAgentService';
import { calculateSocialEngagement } from '../../../utils/helpers';
import { buildShamsSigningPost } from '../../../services/social/templates/charania';
import { NewsGenerator } from '../../../services/news/NewsGenerator';
import { SettingsManager } from '../../../services/SettingsManager';

export const handleSignFreeAgent = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { playerId, teamId, playerName, teamName, salary, years: negotiatedYears, option, twoWay: signedAsTwoWay, nonGuaranteed: signedAsNG, mleType: signedMleType } = action.payload;
    const player = stateWithSim.players.find(p => p.internalId === playerId);
    const team = stateWithSim.teams.find(t => t.id === teamId);
    
    if (!player || !team) return { isProcessing: false };

    if (player.status !== 'Active' && player.status !== 'Free Agent' && !['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || '')) {
        return await advanceDay(stateWithSim, action, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    } else {
        const gmPlayer = player as any;
        const previousTeamId = gmPlayer?.transactions && gmPlayer.transactions.length > 0 
            ? gmPlayer.transactions[gmPlayer.transactions.length - 1].tid 
            : null;
        const previousTeam = previousTeamId ? stateWithSim.teams.find(t => t.id === previousTeamId) : null;
        const previousTeamName = previousTeam ? previousTeam.name : null;
        // Map player status to meaningful league label for the LLM prompt
        const statusToLeague: Record<string, string> = {
            'Euroleague': 'Euroleague',
            'PBA': 'PBA (Philippine Basketball Association)',
            'B-League': 'Japan B.League',
            'WNBA': 'WNBA',
            'G-League': 'NBA G League',
            'Endesa': 'Liga ACB (Spain)',
            'Free Agent': previousTeamName ? 'NBA (previously unsigned)' : 'Free Agency',
            'Active': previousTeamName ? 'NBA' : 'Free Agency',
        };
        const previousLeague = statusToLeague[player?.status || ''] ?? player?.status ?? null;

        const reactions = await generateFreeAgentSigningReactions(player as any, team as any, previousTeamName, previousLeague, stateWithSim);
        
        const outcome = calculateOutcome('SIGN_FREE_AGENT', { playerId: player?.internalId }, stateWithSim);
        
        const newEmails = (reactions.newEmails || []).map((e: any, i: number) => ({
            ...e,
            id: `react-email-${Date.now()}-${i}`,
            read: false,
            replied: false,
            date: stateWithSim.date,
        }));

        const newNews = (reactions.newNews || []).map((n: any, i: number) => ({
            ...n,
            id: `react-news-${Date.now()}-${i}`,
            date: stateWithSim.date,
        }));

        const newSocial = (reactions.newSocialPosts || []).map((s: any, i: number) => {
            const engagement = calculateSocialEngagement(s.handle, s.content, player?.overallRating);
            return {
                ...s,
                id: `react-social-${Date.now()}-${i}`,
                date: stateWithSim.date,
                likes: engagement.likes,
                retweets: engagement.retweets,
                isNew: true
            };
        });

        // Auto Charania post — only when LLM is off (LLM generates its own Shams post)
        const llmEnabled = SettingsManager.getSettings().enableLLM;
        const shamsContent = !llmEnabled ? buildShamsSigningPost(
            player.name,
            team.name,
            team.abbrev,
            player.overallRating ?? 60,
            previousTeamName,
            previousLeague
        ) : null;
        if (shamsContent) {
            const shamsEngagement = calculateSocialEngagement('@ShamsCharania', shamsContent, player?.overallRating);
            newSocial.unshift({
                id: `shams-sign-${Date.now()}`,
                author: 'Shams Charania',
                handle: '@ShamsCharania',
                content: shamsContent,
                date: stateWithSim.date,
                likes: shamsEngagement.likes,
                retweets: shamsEngagement.retweets,
                playerPortraitUrl: player.imgURL,
                source: 'TwitterX',
                isNew: true,
            } as any);
        }

        // Contract terms — honor negotiated salary/years when provided,
        // otherwise fall back to min contract.
        const MIN_CONTRACT_USD = 1_300_000;
        const signYear = stateWithSim.leagueStats?.year ?? 2026;
        const baseSalaryUSD = typeof salary === 'number' && salary > 0 ? salary : MIN_CONTRACT_USD;
        const totalYears = typeof negotiatedYears === 'number' && negotiatedYears > 0 ? negotiatedYears : 1;
        const hasOption = option === 'PLAYER' || option === 'TEAM';
        const totalSeasons = hasOption ? totalYears + 1 : totalYears;
        // BBGM stores contract.amount in thousands of USD; also use the final guaranteed year as exp.
        const contractAmountThousands = Math.round(baseSalaryUSD / 1_000);
        const expYear = signYear + totalSeasons - 1;
        const negotiatedContractYears = Array.from({ length: totalSeasons }).map((_, i) => {
            const seasonYear = signYear + i;
            const escalated = Math.round(baseSalaryUSD * Math.pow(1.05, i));
            const isOptionYear = hasOption && i === totalSeasons - 1;
            return {
                season: `${seasonYear - 1}-${String(seasonYear).slice(-2)}`,
                guaranteed: escalated,
                option: isOptionYear ? (option === 'PLAYER' ? 'player' : 'team') : '',
            };
        });
        // Preserve historical (past + prior in-flight) contractYears entries so
        // PlayerBioContractTab keeps showing the player's existing salary history
        // after a re-sign. Filter out any entries for seasons the new deal covers
        // so the new terms win.
        const existingPlayerForMerge: any = stateWithSim.players.find(p => p.internalId === playerId);
        const priorContractYears: Array<{ season: string; guaranteed: number; option?: string }> =
          Array.isArray(existingPlayerForMerge?.contractYears) ? existingPlayerForMerge.contractYears : [];
        const newSeasonSet = new Set(negotiatedContractYears.map(cy => cy.season));
        const historicalContractYears = priorContractYears.filter(cy => !newSeasonSet.has(cy.season));
        const mergedContractYears = [
            ...historicalContractYears,
            ...negotiatedContractYears,
        ].sort((a, b) => a.season.localeCompare(b.season));

        const returnContext = previousLeague && ['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(previousLeague)
            ? ` ${playerName} is returning to the NBA after playing in the ${previousLeague}.`
            : previousTeamName
                ? ` ${playerName} was previously with the ${previousTeamName}.`
                : '';

        const signingOutcomeText = `The ${teamName} have officially signed ${playerName}.${returnContext} The deal is confirmed, sources say.`;

        const signingSeed = `BREAKING SIGNING: The ${teamName} have signed ${playerName}.${returnContext} ` +
            `REQUIRED: @ShamsCharania MUST break this in a detailed tweet — name the team, the player, any context (returning from abroad, veteran presence, etc.), and what he brings. ` +
            `Then generate 3-4 varied fan and analyst reactions. ` +
            `Do NOT write two identical Shams tweets. One detailed Shams tweet, then fan/analyst reactions only.`;

        const result = await advanceDay(stateWithSim, {
            type: 'SIGN_FREE_AGENT',
            payload: {
                outcomeText: signingOutcomeText,
                playerId,
                teamId,
            }
        } as any, [signingSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

        // Force correct contract amount — LLM generates wrong units
        // Update the player directly in result.players if present
        if (result.players) {
            result.players = result.players.map((p: any) =>
                p.internalId === playerId
                    ? {
                        ...p,
                        tid: teamId,
                        status: 'Active',
                        contract: {
                            amount: contractAmountThousands,
                            exp: expYear,
                            rookie: false
                        },
                        contractYears: mergedContractYears,
                        // Explicitly set/clear twoWay per the signing decision —
                        // otherwise a player who was previously on a two-way deal
                        // keeps the flag via `...p`, so even a GUARANTEED re-signing
                        // ships as a two-way contract.
                        twoWay: !!signedAsTwoWay,
                        nonGuaranteed: !!signedAsNG,
                        // Stamp MLE source so TeamFinancesView can color the
                        // contract cell and leagueStats.mleUsage below accounts
                        // for the draw.
                        ...(signedMleType ? { mleSignedVia: signedMleType } : {}),
                    }
                    : p
            );
        } else {
            // Patch directly onto stateWithSim players via result
            result.players = stateWithSim.players.map((p: any) =>
                p.internalId === playerId
                    ? {
                        ...p,
                        tid: teamId,
                        status: 'Active',
                        contract: {
                            amount: contractAmountThousands,
                            exp: expYear,
                            rookie: false
                        },
                        contractYears: mergedContractYears,
                        // Explicitly set/clear twoWay per the signing decision —
                        // otherwise a player who was previously on a two-way deal
                        // keeps the flag via `...p`, so even a GUARANTEED re-signing
                        // ships as a two-way contract.
                        twoWay: !!signedAsTwoWay,
                        nonGuaranteed: !!signedAsNG,
                        // Stamp MLE source so TeamFinancesView can color the
                        // contract cell and leagueStats.mleUsage below accounts
                        // for the draw.
                        ...(signedMleType ? { mleSignedVia: signedMleType } : {}),
                    }
                    : p
            );
        }

        // Update leagueStats.mleUsage so the FreeAgents MLE chip + future
        // getMLEAvailability checks reflect what this team has already spent.
        // Each team stores { type, usedUSD } — subsequent signings using the
        // same MLE type stack the usedUSD; signings on a different type are
        // blocked by getMLEAvailability's priorType guard.
        if (signedMleType) {
            const prevLS: any = result.leagueStats ?? stateWithSim.leagueStats;
            const prevUsage = (prevLS?.mleUsage ?? {}) as Record<number, { type: string; usedUSD: number }>;
            const prior = prevUsage[teamId];
            const stackedUSD = prior?.type === signedMleType ? (prior.usedUSD ?? 0) + baseSalaryUSD : baseSalaryUSD;
            result.leagueStats = {
                ...(prevLS ?? {}),
                mleUsage: {
                    ...prevUsage,
                    [teamId]: { type: signedMleType, usedUSD: stackedUSD },
                },
            };
        }

        // Auto news item for the signing (fires regardless of LLM)
        const signingNewsItem = NewsGenerator.generate('signing_confirmed', stateWithSim.date, {
            playerName: player.name,
            teamName: team.name,
        }, team.logoUrl);
        if (signingNewsItem) newNews.unshift(signingNewsItem);

        result.newEmails = [...newEmails, ...(result.newEmails || [])];
        result.newNews = [...newNews, ...(result.newNews || [])];
        result.newSocialPosts = [...newSocial, ...(result.newSocialPosts || [])];
        result.consequence = result.consequence || {};
        result.consequence.statChanges = result.consequence.statChanges || {};
        result.consequence.statChanges.revenue = (result.consequence.statChanges.revenue || 0) + (outcome.revenue || 0);
        result.consequence.statChanges.viewership = (result.consequence.statChanges.viewership || 0) + (outcome.viewership || 0);
        
        return result;
    }
};

export const handleSuspendPlayer = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts, reason, duration } = action.payload;
    const players = contacts || (action.payload.player ? [action.payload.player] : []);
    if (players.length === 0) return { isProcessing: false };

    const games = parseInt(duration) || 0;
    const playerNames = players.map((p: any) => p.name).join(', ');
    const outcomeText = `The NBA has suspended ${playerNames} for ${games} games. Reason: ${reason}.`;
    const suspendSeed = `BREAKING: The NBA Commissioner just handed ${playerNames} a ${games}-game suspension. Reason: ${reason}. ` +
        `@ShamsCharania breaks it with a detailed tweet covering the incident, the severity of the punishment, and the league's stance. ` +
        `Then generate: one outraged fan defending ${playerNames.split(',')[0]} ("${games} games is way too much"), ` +
        `one fan saying they deserved it or even worse, ` +
        `one analyst debating whether the punishment fits the crime or sets a dangerous precedent, ` +
        `and a reaction from an NBPA rep or player agent questioning the Commissioner's judgment. ` +
        `Make it feel like a real NBA controversy — specific, heated takes.`;

    const outcome = calculateOutcome('SUSPEND_PLAYER', action.payload, stateWithSim);

    const result = await advanceDay(stateWithSim, {
        type: 'SUSPEND_PLAYER',
        payload: {
            outcomeText,
            players,
            reason,
            games
        }
    } as any, [suspendSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.playerApproval = (result.statChanges.playerApproval || 0) + (outcome.playerApproval || 0);
    
    // Update player suspension in state
    const playerIds = new Set(players.map((p: any) => p.id || p.internalId));
    result.players = (result.players || stateWithSim.players).map(p => 
        playerIds.has(p.internalId) 
            ? { ...p, suspension: { reason, gamesRemaining: games } } 
            : p
    );

    return result;
};

export const handleDrugTestPerson = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts, reason } = action.payload;
    if (!contacts || contacts.length === 0) return { isProcessing: false };
    
    const player = contacts[0];
    const outcome = calculateOutcome('DRUG_TEST_PERSON', action.payload, stateWithSim);
    
    // Randomly decide if they fail or pass based on some logic or just random
    const failed = Math.random() < 0.3; // 30% chance of failing for now
    const games = failed ? Math.floor(Math.random() * 10) + 5 : 0;

    let outcomeText = `Mandatory Drug Test for ${player.name}. Reason: ${reason}. Results: Negative (Passed).`;
    if (failed) {
        outcomeText = `Mandatory Drug Test for ${player.name}. Reason: ${reason}. Results: Positive (Failed). The league has suspended them for ${games} games.`;
    }

    const drugTestSeed = failed
        ? `BREAKING: ${player.name} has tested positive in an NBA-mandated drug test. They will be suspended ${games} games. Reason cited: ${reason}. ` +
          `@ShamsCharania breaks it. Then: one shocked fan reacting ("no way, not ${player.name.split(' ')[0]}"), ` +
          `one fan who's not surprised or has a hot take, one analyst on what this means for their team's season, ` +
          `and a response from the player's camp or agent denying or acknowledging the situation.`
        : `The NBA Commissioner ordered a mandatory drug test on ${player.name}. Reason: ${reason}. Results came back CLEAN — negative. ` +
          `Generate: one reporter noting the test was ordered and the result, fans reacting to the Commissioner ordering the test ` +
          `(some suspicious of why they were singled out, some defending the process), ` +
          `and one take questioning whether the Commissioner's use of drug testing is becoming a power move. ` +
          `Make it feel real — people are paying attention to who gets tested and why.`;

    const result = await advanceDay(stateWithSim, {
        type: 'DRUG_TEST_PERSON',
        payload: {
            outcomeText,
            player,
            reason,
            failed,
            games
        }
    } as any, [drugTestSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.playerApproval = (result.statChanges.playerApproval || 0) + (outcome.playerApproval || 0);
    
    if (failed) {
        // Update player suspension in state
        result.players = (result.players || stateWithSim.players).map(p => 
            p.internalId === (player.internalId || player.id)
                ? { ...p, suspension: { reason: `Failed Drug Test: ${reason}`, gamesRemaining: games } } 
                : p
        );
    }

    return result;
};

export const handleWaivePlayer = async (stateWithSim: GameState, action: UserAction, _simResults: any[], _recentDMs: any[]) => {
    const { contacts } = action.payload;
    if (!contacts || contacts.length === 0) return { isProcessing: false };

    const player = contacts[0];
    // Resolve the player's current team by the player record, not the stale contact.organization string.
    const playerRecord = stateWithSim.players.find((p: any) => p.internalId === (player.id || player.internalId));
    const team = playerRecord ? stateWithSim.teams.find(t => t.id === playerRecord.tid) : undefined;
    const teamName = team?.name || player.organization || 'their team';

    // Waiving is a roster action — apply it immediately without ticking the sim clock.
    const players = stateWithSim.players.map((p: any) =>
        p.internalId === (player.id || player.internalId)
            ? { ...p, tid: -1, status: 'Free Agent' }
            : p
    );

    const waiveNewsItem = {
        id: `waive-news-${Date.now()}`,
        headline: `${player.name} Waived`,
        content: `The Commissioner has officially waived ${player.name} from ${teamName}. ${player.name} is now a free agent and eligible to sign with any team.`,
        date: stateWithSim.date,
        isNew: true,
        image: team?.logoUrl,
        newsType: 'daily' as const,
    };

    return {
        players,
        newNews: [waiveNewsItem],
        statChanges: { playerApproval: -2 },
        isProcessing: false,
    };
};

export const handleFirePersonnel = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts } = action.payload;
    if (!contacts || contacts.length === 0) return { isProcessing: false };

    const person = contacts[0];
    const outcomeText = `${person.name} (${person.title}) has been fired by the NBA Commissioner.`;
    const storySeed = `${person.name}, ${person.title} for ${person.organization}, has been abruptly fired by the Commissioner. The basketball world reacts.`;

    const result = await advanceDay(stateWithSim, {
        type: 'FIRE_PERSONNEL',
        payload: { outcomeText, contacts }
    } as any, [storySeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

    // Update staff state: mark as unemployed
    if (result.staff || stateWithSim.staff) {
        const staff = result.staff || { ...stateWithSim.staff };
        const markUnemployed = (list: any[]) =>
            list.map((s: any) => s.name === person.name ? { ...s, team: 'Unemployed', teamId: -99 } : s);

        result.staff = {
            ...staff,
            gms: markUnemployed(staff.gms || []),
            coaches: markUnemployed(staff.coaches || []),
            owners: markUnemployed(staff.owners || []),
        };
    }

    result.statChanges = result.statChanges || {};
    result.statChanges.ownerApproval = (result.statChanges.ownerApproval || 0) - 3;

    // Always add a League News item for the firing (fires even when LLM is off)
    const fireNewsItem = {
        id: `fire-news-${Date.now()}`,
        headline: `${person.name} Fired`,
        content: `The Commissioner has fired ${person.name} (${person.title}) from ${person.organization}. The basketball world reacts to the sudden front-office shakeup.`,
        date: stateWithSim.date,
        isNew: true,
        newsType: 'daily' as const,
    };
    result.newNews = [fireNewsItem, ...(result.newNews || [])];

    return result;
};

export const handleSabotagePlayer = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts, reason, duration } = action.payload;
    if (!contacts || contacts.length === 0) return { isProcessing: false };
    
    const games = parseInt(duration) || 0;
    const playerNames = contacts.map((p: any) => p.name).join(', ');
    
    const outcomeText = `Covert Action: Sabotaged ${playerNames}. They will be sidelined for ${games} games.`;
    
    // Inject narrative for LLM to interpret next day
    const storySeed = `URGENT NARRATIVE INJECTION: ${playerNames} ${contacts.length > 1 ? 'have' : 'has'} suffered a ${reason}. The media and fans should react as if this happened naturally during practice or a game. They will be out for ${games} games.`;

    const result = await advanceDay(stateWithSim, {
        type: 'SABOTAGE_PLAYER',
        payload: {
            outcomeText,
            contacts,
            reason,
            games
        }
    } as any, [storySeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

    // Update player injury in state
    const playerIds = new Set(contacts.map((p: any) => p.id || p.internalId));
    result.players = (result.players || stateWithSim.players).map(p => 
        playerIds.has(p.internalId) 
            ? { ...p, injury: { type: reason, gamesRemaining: games } } 
            : p
    );

    return result;
};
