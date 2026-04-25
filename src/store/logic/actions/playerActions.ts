import { GameState, UserAction } from '../../../types';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { advanceDay } from '../../../services/llm/llm';
import { generateFreeAgentSigningReactions } from '../../../services/llm/services/freeAgentService';
import { calculateSocialEngagement } from '../../../utils/helpers';
import { buildShamsSigningPost } from '../../../services/social/templates/charania';
import { NewsGenerator } from '../../../services/news/NewsGenerator';
import { SettingsManager } from '../../../services/SettingsManager';
import { normalizeTeamJerseyNumbers } from '../../../utils/jerseyUtils';
import { buildStretchedSchedule, seasonLabelToYear } from '../../../utils/salaryUtils';

export const handleSignFreeAgent = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { playerId, teamId, playerName, teamName, salary, years: negotiatedYears, option, twoWay: signedAsTwoWay, nonGuaranteed: signedAsNG, mleType: signedMleType } = action.payload;
    const player = stateWithSim.players.find(p => p.internalId === playerId);
    const team = stateWithSim.teams.find(t => t.id === teamId);
    
    if (!player || !team) return { isProcessing: false };

    if (player.status !== 'Active' && player.status !== 'Free Agent' && !['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || '')) {
        return { isProcessing: false };
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
        const leagueYear = stateWithSim.leagueStats?.year ?? 2026;
        const existingPlayerForMerge: any = stateWithSim.players.find(p => p.internalId === playerId);
        // Re-signs (player already on this team) start next season; fresh FA signings start current season.
        const isResignAction = existingPlayerForMerge?.tid === teamId;
        const signYear = isResignAction ? leagueYear + 1 : leagueYear;
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

        // Match AI signing/re-signing template so the transaction log + news
        // get full contract details (salary, years, option, contract type).
        const annualM = Math.round(baseSalaryUSD / 100_000) / 10;
        const totalRaw = annualM * totalYears;
        const totalStr = totalRaw < 1 ? totalRaw.toFixed(1) : Math.round(totalRaw).toString();
        const optTag = option === 'PLAYER' ? ' (player option)' : option === 'TEAM' ? ' (team option)' : '';
        const twoWayTag = signedAsTwoWay ? ' (two-way)' : '';
        const ngTag = signedAsNG ? ' (non-guaranteed)' : '';
        const mleTag = signedMleType && !signedAsTwoWay && !signedAsNG
            ? (signedMleType === 'taxpayer' ? ' (taxpayer MLE)' : signedMleType === 'room' ? ' (room MLE)' : ' (MLE)')
            : '';
        const contractDetails = `: $${totalStr}M/${totalYears}yr${optTag}${twoWayTag}${ngTag}${mleTag}`;
        const signingOutcomeText = isResignAction
            ? `${playerName} re-signs with ${teamName}${contractDetails}`
            : `${playerName} signs with the ${teamName}${contractDetails}${returnContext}`;

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

        // Auto news item for the signing (fires regardless of LLM). Override
        // the generic template so the headline + content carry the full
        // contract details — matches the AI-signing news style.
        const signingNewsItem = NewsGenerator.generate('signing_confirmed', stateWithSim.date, {
            playerName: player.name,
            teamName: team.name,
        }, team.logoUrl);
        if (signingNewsItem) {
            const verbHeadline = isResignAction ? 'Re-Signs With' : 'Signs With';
            (signingNewsItem as any).headline = `${player.name} ${verbHeadline} ${team.name} — $${totalStr}M/${totalYears}yr${optTag}${twoWayTag}${ngTag}${mleTag}`;
            (signingNewsItem as any).content = `${signingOutcomeText}. The ${totalYears}-year deal carries an annual value of $${annualM.toFixed(1)}M${optTag ? `, with a${optTag.startsWith(' (player') ? ' player' : ' team'} option in the final year` : ''}.`;
            newNews.unshift(signingNewsItem);
        }

        result.newEmails = [...newEmails, ...(result.newEmails || [])];
        result.newNews = [...newNews, ...(result.newNews || [])];
        result.newSocialPosts = [...newSocial, ...(result.newSocialPosts || [])];
        result.consequence = result.consequence || {};
        result.consequence.statChanges = result.consequence.statChanges || {};
        result.consequence.statChanges.revenue = (result.consequence.statChanges.revenue || 0) + (outcome.revenue || 0);
        result.consequence.statChanges.viewership = (result.consequence.statChanges.viewership || 0) + (outcome.viewership || 0);
        result.players = normalizeTeamJerseyNumbers((result.players || stateWithSim.players) as any, stateWithSim.teams as any, stateWithSim.leagueStats?.year ?? 2026, {
            history: stateWithSim.history,
            targetTeamIds: [teamId],
        }) as any;
        
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
    const { contacts, stretch } = action.payload as { contacts: any[]; stretch?: boolean };
    if (!contacts || contacts.length === 0) return { isProcessing: false };

    const player = contacts[0];
    const playerRecord = stateWithSim.players.find((p: any) => p.internalId === (player.id || player.internalId)) as any;
    const team = playerRecord ? stateWithSim.teams.find(t => t.id === playerRecord.tid) : undefined;
    const teamName = team?.name || player.organization || 'their team';

    // ─── Dead money calculation ───────────────────────────────────────────
    // Compute remaining guaranteed obligation from contractYears. NG contracts
    // before the auto-guarantee deadline = free release. Otherwise stretch is
    // optional (spreads over 2N+1 years, configurable). Two-way contracts
    // never produce dead money — $625K is min-day-rate paid only for days on
    // roster, real-NBA convention.
    const ls = stateWithSim.leagueStats as any;
    const deadMoneyEnabled = ls.deadMoneyEnabled ?? true;
    const wasNG = !!playerRecord?.nonGuaranteed;
    const wasTwoWay = !!playerRecord?.twoWay;
    const currentSeasonYear: number = ls.year ?? new Date(stateWithSim.date ?? Date.now()).getUTCFullYear();
    const guaranteeMonth = ls.ngGuaranteeDeadlineMonth ?? 1;
    const guaranteeDay = ls.ngGuaranteeDeadlineDay ?? 10;
    const today = stateWithSim.date ? new Date(stateWithSim.date) : new Date();
    const ngDeadline = new Date(currentSeasonYear, guaranteeMonth - 1, guaranteeDay);
    const ngFreeRelease = wasNG && today < ngDeadline;

    let updatedTeams = stateWithSim.teams;
    let deadMoneyAdded: import('../../../types').DeadMoneyEntry | null = null;

    if (deadMoneyEnabled && !wasTwoWay && !ngFreeRelease && playerRecord && team) {
        const allContractYears: Array<{ season: string; guaranteed: number; option?: string }> =
            Array.isArray(playerRecord.contractYears) ? playerRecord.contractYears : [];
        // Only future obligations — past seasons are already paid out.
        const remaining = allContractYears
            .filter(cy => {
                const yr = parseInt(cy.season.split('-')[0], 10) + 1;
                return yr >= currentSeasonYear && cy.option !== 'team' && cy.option !== 'player';
            })
            .map(cy => ({ season: cy.season, amountUSD: cy.guaranteed }));
        if (remaining.length === 0 && playerRecord.contract?.amount) {
            // Fallback: legacy player without contractYears — use flat contract.amount × years to exp.
            const exp = playerRecord.contract.exp ?? currentSeasonYear;
            const amountUSD = (playerRecord.contract.amount || 0) * 1_000;
            for (let yr = currentSeasonYear; yr <= exp; yr++) {
                remaining.push({ season: `${yr - 1}-${String(yr).slice(-2)}`, amountUSD });
            }
        }
        if (remaining.length > 0) {
            const stretchEnabled = ls.stretchProvisionEnabled ?? true;
            const wantStretch = !!stretch && stretchEnabled;
            const stretchMult = ls.stretchProvisionMultiplier ?? 2;
            const finalSchedule = wantStretch
                ? buildStretchedSchedule(remaining, stretchMult)
                : remaining;
            deadMoneyAdded = {
                playerId: playerRecord.internalId,
                playerName: playerRecord.name,
                remainingByYear: finalSchedule,
                stretched: wantStretch,
                waivedDate: stateWithSim.date ?? today.toISOString().slice(0, 10),
                originalExpYear: playerRecord.contract?.exp ?? currentSeasonYear,
            };
            updatedTeams = stateWithSim.teams.map(t =>
                t.id === team.id
                    ? { ...t, deadMoney: [...(t.deadMoney ?? []), deadMoneyAdded!] }
                    : t,
            );
        }
    }

    // ─── Player record update ─────────────────────────────────────────────
    const players = stateWithSim.players.map((p: any) =>
        p.internalId === (player.id || player.internalId)
            ? {
                ...p,
                tid: -1,
                status: 'Free Agent',
                twoWay: undefined,
                nonGuaranteed: false,
                gLeagueAssigned: false,
                mleSignedVia: undefined,
                hasBirdRights: false,
                yearsWithTeam: 0,
            }
            : p
    );

    const deadMoneyThisSeason = deadMoneyAdded
        ? (deadMoneyAdded.remainingByYear.find(y => seasonLabelToYear(y.season) === currentSeasonYear)?.amountUSD ?? 0)
        : 0;
    const totalDead = deadMoneyAdded?.remainingByYear.reduce((s, y) => s + y.amountUSD, 0) ?? 0;

    // Verb choice mirrors how the move would actually be reported:
    // - Two-way release / NG pre-deadline release: "released" (no dead money)
    // - Guaranteed waive: "waived" (with or without stretch — that detail lives in finances UI, not the headline)
    const releaseVerb = (wasTwoWay || ngFreeRelease) ? 'released' : 'waived';
    const releaseSuffix = wasTwoWay
        ? ' from his two-way contract'
        : ngFreeRelease
            ? ' (non-guaranteed)'
            : '';

    // News card stays detailed — finance fans want the dollar context.
    const stretchTag = deadMoneyAdded?.stretched
        ? ` Payment stretched over ${deadMoneyAdded.remainingByYear.length} seasons (~$${(deadMoneyThisSeason / 1_000_000).toFixed(1)}M/yr).`
        : '';
    const newsDeadTag = totalDead > 0
        ? ` Dead money: $${(totalDead / 1_000_000).toFixed(1)}M total ($${(deadMoneyThisSeason / 1_000_000).toFixed(1)}M this season).${stretchTag}`
        : ngFreeRelease
            ? ' Contract was non-guaranteed — no dead money.'
            : '';

    const waiveNewsItem = {
        id: `waive-news-${Date.now()}`,
        headline: `${player.name} ${releaseVerb === 'waived' ? 'Waived' : 'Released'}`,
        content: `${teamName} have ${releaseVerb} ${player.name}${releaseSuffix}.${newsDeadTag} ${player.name} is now a free agent.`,
        date: stateWithSim.date,
        isNew: true,
        image: team?.logoUrl,
        newsType: 'daily' as const,
    };

    // History entry text — gameLogic.ts:876 picks this up and stamps type 'Waive'.
    // NBA.com style: short and clean. No salary numbers in the transactions feed —
    // those belong on the team finances page.
    const outcomeText = `${player.name} ${releaseVerb} by the ${teamName}${releaseSuffix}.`;

    return {
        players,
        teams: updatedTeams,
        newNews: [waiveNewsItem],
        outcomeText,
        statChanges: { playerApproval: -2 },
        isProcessing: false,
    };
};

export const handleExerciseTeamOption = async (stateWithSim: GameState, action: UserAction) => {
    const { playerId } = action.payload;
    const player = stateWithSim.players.find((p: any) => p.internalId === playerId) as any;
    if (!player) return { isProcessing: false };
    const team = stateWithSim.teams.find(t => t.id === player.tid);

    const players = stateWithSim.players.map((p: any) =>
        p.internalId === playerId
            ? {
                ...p,
                contract: { ...p.contract, hasTeamOption: false, teamOptionExp: undefined },
                contractYears: Array.isArray(p.contractYears)
                    ? p.contractYears.map((cy: any, i: number) =>
                        i === p.contractYears.length - 1 && (cy.option ?? '').toLowerCase().includes('team')
                            ? { ...cy, option: '' }
                            : cy
                    )
                    : p.contractYears,
            }
            : p
    );

    return {
        players,
        outcomeText: `The ${team?.name ?? 'team'} exercised their team option on ${player.name}.`,
        isProcessing: false,
    };
};

export const handleDeclineTeamOption = async (stateWithSim: GameState, action: UserAction) => {
    const { playerId } = action.payload;
    const player = stateWithSim.players.find((p: any) => p.internalId === playerId) as any;
    if (!player) return { isProcessing: false };
    const team = stateWithSim.teams.find(t => t.id === player.tid);

    const priorContractYears = Array.isArray(player.contractYears) ? player.contractYears : [];
    const trimmedContractYears = priorContractYears.slice(0, -1);
    const newExp = Math.max((player.contract?.exp ?? 0) - 1, (stateWithSim.leagueStats?.year ?? 2026) - 1);

    const players = stateWithSim.players.map((p: any) =>
        p.internalId === playerId
            ? {
                ...p,
                tid: -1,
                status: 'Free Agent',
                contract: { ...p.contract, exp: newExp, hasTeamOption: false, teamOptionExp: undefined },
                contractYears: trimmedContractYears,
                twoWay: undefined,
                nonGuaranteed: false,
                hasBirdRights: false,
                yearsWithTeam: 0,
            }
            : p
    );

    return {
        players,
        outcomeText: `The ${team?.name ?? 'team'} declined their team option on ${player.name}. ${player.name} is now a free agent.`,
        isProcessing: false,
    };
};

/**
 * Convert a non-guaranteed contract on the fly.
 *  - to:'GUARANTEED' just clears the `nonGuaranteed` flag (existing salary stays).
 *  - to:'TWO_WAY' collapses the deal to a 1-year, $625K two-way (real-NBA scale).
 * Mirrors the AI Jan 10 auto-guarantee path but lets the user pull the trigger
 * any time before the deadline.
 */
export const handleConvertContractType = async (stateWithSim: GameState, action: UserAction) => {
    const { playerId, to } = action.payload as { playerId: string; to: 'GUARANTEED' | 'TWO_WAY' };
    const player = stateWithSim.players.find((p: any) => p.internalId === playerId) as any;
    if (!player || !(player as any).nonGuaranteed) return { isProcessing: false };
    const team = stateWithSim.teams.find(t => t.id === player.tid);
    const teamName = team?.name ?? 'team';

    let players: any[];
    let outcomeText: string;
    if (to === 'GUARANTEED') {
        players = stateWithSim.players.map((p: any) =>
            p.internalId === playerId
                ? { ...p, nonGuaranteed: undefined }
                : p
        );
        outcomeText = `${player.name}'s contract was guaranteed by the ${teamName}.`;
    } else {
        // Two-way scale: $625K, 1 year. Replace current-season contractYears entry,
        // preserve any historical (pre-current-season) salary rows.
        const TWO_WAY_THOUSANDS = 625;
        const TWO_WAY_USD = 625_000;
        const leagueYear = stateWithSim.leagueStats?.year ?? new Date().getUTCFullYear();
        const seasonLabel = `${leagueYear - 1}-${String(leagueYear).slice(-2)}`;
        const priorYears: Array<{ season: string; guaranteed: number; option?: string }> =
            Array.isArray(player.contractYears) ? player.contractYears : [];
        const historical = priorYears.filter(cy => {
            const yr = parseInt(cy.season.split('-')[0], 10) + 1;
            return yr < leagueYear;
        });
        const newContractYears = [
            ...historical,
            { season: seasonLabel, guaranteed: TWO_WAY_USD, option: '' },
        ];
        players = stateWithSim.players.map((p: any) =>
            p.internalId === playerId
                ? {
                    ...p,
                    nonGuaranteed: undefined,
                    twoWay: true,
                    contract: { ...(p.contract ?? {}), amount: TWO_WAY_THOUSANDS, exp: leagueYear },
                    contractYears: newContractYears,
                }
                : p
        );
        outcomeText = `${player.name} was converted to a two-way contract by the ${teamName}.`;
    }

    const historyEntry = {
        text: outcomeText,
        date: stateWithSim.date,
        type: to === 'GUARANTEED' ? 'NG Guaranteed' : 'NG → Two-Way',
        playerIds: [playerId],
    };

    return {
        players,
        history: [...(stateWithSim.history ?? []), historyEntry],
        outcomeText,
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
