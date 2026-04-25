import { GameState, UserAction } from '../../types';
import { calculateOutcome } from '../../services/logic/outcomeDecider';
import { advanceDay, sendDirectMessage } from '../../services/llm/llm';
import { generateFreeAgentSigningReactions } from '../../services/llm/services/freeAgentService';
import { executeExecutiveTrade } from '../../services/tradeService';
import { calculateSocialEngagement, getGamePhase, normalizeDate } from '../../utils/helpers';
import { computeMoodScore, dramaProbability, moodToStoryType } from '../../utils/mood';
import * as StoryGenerators from '../../services/storyGenerators';
import { handleTransferFunds, handleGiveMoney, handleFinePerson, handleBribePerson, handleAdjustFinancials } from './actions/financeActions';
import { handleExecutiveTrade, handleForceTrade } from './actions/tradeActions';
import { handleSignFreeAgent, handleSuspendPlayer, handleSabotagePlayer, handleDrugTestPerson, handleWaivePlayer, handleFirePersonnel, handleExerciseTeamOption, handleDeclineTeamOption, handleConvertContractType } from './actions/playerActions';
import { handleInvitePerformance, handleGlobalGames, handleRigLottery, handleHypnotize, handleHypnoticBroadcast, handleVisitNonNbaTeam, handleTravel, handleInviteDinner } from './actions/eventActions';
import { handleGoToClub } from './actions/clubActions';
import { handleEndorseHof } from './actions/hofActions';

export const processAction = async (stateWithSim: GameState, action: UserAction, executiveTradeTransactionRef: { current: any }, simResults: any[] = [], daysToSimulate: number = 1) => {
    let result;

    const currentDateString = new Date(stateWithSim.date).toDateString();
    const normalizedCurrentDate = normalizeDate(stateWithSim.date);
    const recentDMs = stateWithSim.chats.map(chat => {
        const todayMessages = chat.messages.filter(m => new Date(m.timestamp).toDateString() === currentDateString);
        if (todayMessages.length > 0) {
            const target = chat.participantDetails.find(p => p.id !== 'commissioner');
            return {
                targetName: target?.name || 'Unknown',
                targetRole: target?.role || 'Unknown',
                messages: todayMessages
            };
        }
        return null;
    }).filter(Boolean);

    let scheduledEventsToday = [];
    if (stateWithSim.scheduledEvents) {
        scheduledEventsToday = stateWithSim.scheduledEvents.filter(e => normalizeDate(e.date) === normalizedCurrentDate);
    }
    
    // If there's no specific user action (just advancing the day) and we have a scheduled event,
    // we can treat the scheduled event as the primary action for the day's news.
    let effectiveAction = action;
    if ((!action || action.type === 'ADVANCE_DAY') && scheduledEventsToday.length > 0) {
        const event = scheduledEventsToday[0];
        if (event.type === 'PERFORMANCE_DAY') {
            const { artists, event: eventName, homeTeamName, awayTeamName, gameId } = event.payload;
            const artistsList = artists.join(', ');
            
            let gameResult = undefined;
            if (gameId) {
                const game = stateWithSim.schedule.find(g => g.gid === gameId);
                if (game) {
                    gameResult = simResults.find(r => r.homeTeamId === game.homeTid && r.awayTeamId === game.awayTid);
                }
            }

            effectiveAction = {
                type: 'SCHEDULED_EVENT',
                payload: {
                    outcomeText: `Today, ${artistsList} performed live at the ${eventName || 'game'} between the ${homeTeamName} and ${awayTeamName}. Fans and media are reacting to the highly anticipated performance.`,
                    isSpecificEvent: true,
                    gameResult,
                    ...event.payload
                }
            } as any;
        }
    }

    if (action.type === 'DIRECT_MESSAGE' || action.type === 'SEND_MESSAGE') {
        const { targetName, targetRole, message } = action.payload;
        result = await sendDirectMessage(stateWithSim, targetName, targetRole, message);
    } else if (action.type === 'REPLY_EMAIL') {
        const { emailId, replyText } = action.payload;
        const email = stateWithSim.inbox.find(e => e.id === emailId);
        
        if (email) {
            const thread = email.thread || [{sender: email.sender, text: email.body}];
            const updatedThread = [...thread, {sender: 'Commissioner', text: replyText}];
            const threadDescription = updatedThread.map(t => `${t.sender}: "${t.text}"`).join('\n');
            
            const customAction = {
                type: 'REPLY_EMAIL',
                description: `The Commissioner replied to an email from ${email.sender} (${email.senderRole}).
                Subject: "${email.subject}"
                Thread History:
                ${threadDescription}`
            };
            const replyStorySeed = `The league and media react to the Commissioner's response to ${email.sender} regarding "${email.subject}".`;
            result = await advanceDay(stateWithSim, customAction as any, [replyStorySeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
        } else {
            throw new Error("Email not found");
        }
    } else if (action.type === 'EXECUTIVE_TRADE') {
        result = await handleExecutiveTrade(stateWithSim, action, executiveTradeTransactionRef, simResults, recentDMs);
    } else if (action.type === 'SIGN_FREE_AGENT') {
        result = await handleSignFreeAgent(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'FORCE_TRADE') {
        result = await handleForceTrade(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'ADJUST_FINANCIALS') {
        result = await handleAdjustFinancials(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'SUSPEND_PLAYER') {
        result = await handleSuspendPlayer(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'DRUG_TEST_PERSON') {
        result = await handleDrugTestPerson(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'WAIVE_PLAYER') {
        result = await handleWaivePlayer(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'EXERCISE_TEAM_OPTION') {
        result = await handleExerciseTeamOption(stateWithSim, action);
    } else if (action.type === 'DECLINE_TEAM_OPTION') {
        result = await handleDeclineTeamOption(stateWithSim, action);
    } else if (action.type === 'CONVERT_CONTRACT_TYPE') {
        result = await handleConvertContractType(stateWithSim, action);
    } else if (action.type === 'FIRE_PERSONNEL') {
        result = await handleFirePersonnel(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'SABOTAGE_PLAYER') {
        result = await handleSabotagePlayer(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'LEAK_SCANDAL') {
        const names = (action.payload?.contacts || []).map((c: any) => c.name).join(', ') || action.payload?.targetName || 'Unknown';
        const reason = action.payload?.reason || 'damaging personal information';
        const leakOutcomeText = `Commissioner ${stateWithSim.commissionerName} anonymously leaked damaging information about ${names}. The leak: ${reason}. Sources close to the league say the information is spreading fast through insider circles.`;
        const leakSeed = `BREAKING SCANDAL: Damaging information about ${names} has been anonymously leaked to NBA insiders. The details: ${reason}. Media and social media are erupting with reactions. Generate 4-6 social posts — shocked reactions, insider reports, speculation about who leaked it, and a news headline. NEVER attribute the leak to the Commissioner.`;
        result = await advanceDay(stateWithSim, {
            type: 'LEAK_SCANDAL',
            payload: { ...action.payload, outcomeText: leakOutcomeText }
        } as any, [leakSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    } else if (action.type === 'FINE_PERSON') {
        result = await handleFinePerson(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'GIVE_MONEY') {
        result = await handleGiveMoney(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'BRIBE_PERSON') {
        result = await handleBribePerson(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'VISIT_NON_NBA_TEAM') {
        result = await handleVisitNonNbaTeam(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'INVITE_PERFORMANCE') {
        result = await handleInvitePerformance(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'TRAVEL') {
        result = await handleTravel(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'INVITE_DINNER') {
        result = await handleInviteDinner(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'GO_TO_CLUB') {
        result = await handleGoToClub(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'ENDORSE_HOF') {
        result = await handleEndorseHof(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'GLOBAL_GAMES') {
        result = await handleGlobalGames(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'RIG_LOTTERY') {
        result = await handleRigLottery(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'HYPNOTIZE') {
        result = await handleHypnotize(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'HYPNOTIC_BROADCAST') {
        result = await handleHypnoticBroadcast(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'TRANSFER_FUNDS') {
        result = await handleTransferFunds(stateWithSim, action, simResults, recentDMs);
    } else if (action.type === 'SET_CHRISTMAS_GAMES') {
        const { games } = action.payload;
        const gameDescriptions = games.map((g: any) => {
            const home = stateWithSim.teams.find(t => t.id === g.homeTid)?.name;
            const away = stateWithSim.teams.find(t => t.id === g.awayTid)?.name;
            return `${away} @ ${home}`;
        }).join(', ');

        const customAction = {
            type: 'SET_CHRISTMAS_GAMES',
            description: `The Commissioner has finalized the Christmas Day schedule: ${gameDescriptions}.`
        };
        const storySeed = `The NBA has announced its marquee Christmas Day slate: ${gameDescriptions}. Fans and media are analyzing the matchups.`;
        result = await advanceDay(stateWithSim, customAction as any, [storySeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
        result.christmasGames = games;
    } else if (action.type === 'CELEBRITY_ROSTER') {
        const { roster } = action.payload;
        const customAction = {
            type: 'CELEBRITY_ROSTER',
            description: `The Commissioner has personally selected the 20 participants for this year's Celebrity Game: ${roster}.`
        };
        const storySeed = `The NBA has announced the Celebrity Game Roster: ${roster}. Fans and media are reacting to the selections.`;
        result = await advanceDay(stateWithSim, customAction as any, [storySeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
        
        // Add news item
        const newsItem = {
            id: `celeb-roster-manual-${Date.now()}`,
            headline: 'Commissioner Announces Celebrity Game Roster',
            content: `${stateWithSim.commissionerName} has personally selected the 20 participants for this year's Celebrity Game.`,
            date: stateWithSim.date,
            type: 'league',
            read: false
        };
        result.newNews = [...(result.newNews || []), newsItem];
    } else {
        const storySeeds: string[] = [];
        const numToGen = Math.random() > 0.7 ? 2 : Math.random() > 0.3 ? 1 : 0;
        
        if (Math.random() < 0.15) {
            const sponsorStory = await StoryGenerators.generateSponsorProposalStory(2025);
            if (sponsorStory) storySeeds.push(`From: ${sponsorStory.sender.name} (${sponsorStory.sender.title}, ${sponsorStory.sender.organization}) - ${sponsorStory.story}`);
        }

        // ── Mood-weighted player story routing (Section 6 of moodtodo.md) ──────
        // Pre-compute mood scores for all active players once
        const activePlayers = stateWithSim.players.filter(
            p => p.overallRating >= 58 && p.tid >= 0 && p.status === 'Active' // BBGM 58+ = starter tier
        );
        const moodMap = new Map(activePlayers.map(p => {
            const team = stateWithSim.teams.find(t => t.id === p.tid);
            const endorsed = (stateWithSim.endorsedPlayers ?? []).includes(p.internalId);
            const { score } = computeMoodScore(p, team, stateWithSim.date, endorsed, false, false, activePlayers);
            return [p.internalId, score];
        }));

        for (let i = 0; i < numToGen; i++) {
            const rand = Math.random();
            let storyResult = null;

            if (rand < 0.10) {
                storyResult = await StoryGenerators.generateSponsorProposalStory(2025);
            } else if (rand < 0.25) {
                storyResult = StoryGenerators.generateGmConcernStory(stateWithSim.teams, stateWithSim.players, stateWithSim.staff, [], 2025);
            } else if (rand < 0.40) {
                storyResult = StoryGenerators.generateMediaInquiryStory(2025);
            } else if (rand < 0.55) {
                storyResult = StoryGenerators.generateOwnerDemandStory(stateWithSim.teams, stateWithSim.staff, [], 2025);
            } else {
                // Mood-based player story: pick player by dramaProbability weight, route by mood
                const weights = activePlayers.map(p => {
                    const mood = moodMap.get(p.internalId) ?? 0;
                    return dramaProbability(mood, p.moodTraits ?? []);
                });
                const total = weights.reduce((a, b) => a + b, 0);
                let pick = Math.random() * total;
                let chosenPlayer = activePlayers[activePlayers.length - 1];
                for (let j = 0; j < activePlayers.length; j++) {
                    pick -= weights[j];
                    if (pick <= 0) { chosenPlayer = activePlayers[j]; break; }
                }
                const chosenMood = moodMap.get(chosenPlayer.internalId) ?? 0;
                const storyType = moodToStoryType(chosenMood);

                if (storyType === 'appeal') {
                    // Mood 0 to +3 — positive outreach; filter to happy players
                    const happyPlayers = activePlayers.filter(p => (moodMap.get(p.internalId) ?? 0) >= 0);
                    storyResult = StoryGenerators.generatePlayerAppealStory(happyPlayers.length > 0 ? happyPlayers : stateWithSim.players);
                } else if (storyType === 'agitation') {
                    // Mood −3 to 0 — restless; filter to restless players for agent agitation
                    const restlessPlayers = activePlayers.filter(p => {
                        const m = moodMap.get(p.internalId) ?? 0;
                        return m >= -3 && m < 0;
                    });
                    storyResult = StoryGenerators.generateAgentAgitationStory(
                        restlessPlayers.length > 0 ? restlessPlayers : stateWithSim.players,
                        2025
                    );
                } else {
                    // Mood −6 and below — discipline (fine/warn or suspend tier already handled inside)
                    storyResult = StoryGenerators.generatePlayerDisciplineStory(
                        stateWithSim.players, stateWithSim.teams, stateWithSim.date, stateWithSim.endorsedPlayers
                    );
                    // Disgruntled players (−10 to −7): append trade demand seed
                    if (storyType === 'discipline_suspend' && chosenMood <= -7) {
                        const team = stateWithSim.teams.find(t => t.id === chosenPlayer.tid);
                        storySeeds.push(
                            `TRADE DEMAND SIGNAL: ${chosenPlayer.name} of the ${team?.name ?? 'Unknown'} is reportedly disgruntled and has privately asked for a trade. ` +
                            `His mood is at an all-time low. Agents and insiders are buzzing. Include this tension in social/news coverage.`
                        );
                    }
                }
            }

            if (storyResult) {
                storySeeds.push(`From: ${storyResult.sender.name} (${storyResult.sender.title}, ${storyResult.sender.organization}) - ${storyResult.story}`);
            }
        }

        if (action.payload?.watchedGameResult) {
            const r = action.payload.watchedGameResult;
            const homeTeam = stateWithSim.teams.find(t => t.id === r.homeTeamId);
            const awayTeam = stateWithSim.teams.find(t => t.id === r.awayTeamId);
            const winner = r.winnerId === r.homeTeamId ? homeTeam?.name : awayTeam?.name;
            storySeeds.push(
                `IMPORTANT: The Commissioner attended tonight's game in person — ` +
                `${awayTeam?.name} @ ${homeTeam?.name}, final score ${r.awayScore}-${r.homeScore}. ` +
                `${winner} won. The Commissioner was visible courtside. ` +
                `Players, coaches and media noticed and reacted to the Commissioner being there live. ` +
                `Include this in the news and social posts — the Commissioner watched this game personally.`
            );
        }

        // Inject any in-game fight stories from today's simulated games
        for (const gameRes of simResults) {
            if (gameRes.fight) {
                const f = gameRes.fight;
                const homeTeam = stateWithSim.teams.find(t => t.id === gameRes.homeTeamId);
                const awayTeam = stateWithSim.teams.find(t => t.id === gameRes.awayTeamId);
                const matchup = `${awayTeam?.name ?? 'Away'} @ ${homeTeam?.name ?? 'Home'}`;

                if (f.severity === 'scuffle') {
                    // Minor — just news + social coverage
                    storySeeds.unshift(
                        `BREAKING — IN-GAME SCUFFLE (${matchup}): ${f.description} ` +
                        `Both players remained in the game. Cover this in news and social posts.`
                    );
                } else {
                    // Ejection or brawl — also generate a formal email to the Commissioner requesting a decision
                    const sevLabel = f.severity === 'brawl' ? 'BRAWL' : 'ALTERCATION';
                    storySeeds.unshift(
                        `BREAKING — IN-GAME ${sevLabel} REQUIRING COMMISSIONER DECISION (${matchup}): ${f.description} ` +
                        `Both players involved (${f.player1Name} of ${homeTeam?.name ?? 'Unknown'} and ${f.player2Name} of ${awayTeam?.name ?? 'Unknown'}) are from the SAME game — do NOT invent other opponents. ` +
                        `REQUIRED: Generate a formal email from Joe Dumars (Executive VP, Head of Basketball Operations, NBA League Office) to the Commissioner with subject "Incident Report: ${f.player1Name} vs ${f.player2Name}" asking for a suspension/fine ruling. ` +
                        `Set senderRole to "league_office" so it routes to Inbox. Include 2–3 social posts and a news headline about the incident.`
                    );
                }
            }
        }

        result = await advanceDay(stateWithSim, effectiveAction, storySeeds, simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    }
    
    return result;
};
