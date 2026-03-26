import { GameState, UserAction } from '../../../types';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { advanceDay } from '../../../services/llm/llm';
import { generateFreeAgentSigningReactions } from '../../../services/llm/services/freeAgentService';
import { calculateSocialEngagement } from '../../../utils/helpers';

export const handleSignFreeAgent = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { playerId, teamId, playerName, teamName } = action.payload;
    const player = stateWithSim.players.find(p => p.internalId === playerId);
    const team = stateWithSim.teams.find(t => t.id === teamId);
    
    if (!player || !team) return { isProcessing: false };

    if (player.status !== 'Active' && player.status !== 'Free Agent' && player.status !== 'Euroleague' && player.status !== 'PBA') {
        return await advanceDay(stateWithSim, action, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    } else {
        const gmPlayer = player as any;
        const previousTeamId = gmPlayer?.transactions && gmPlayer.transactions.length > 0 
            ? gmPlayer.transactions[gmPlayer.transactions.length - 1].tid 
            : null;
        const previousTeam = previousTeamId ? stateWithSim.teams.find(t => t.id === previousTeamId) : null;
        const previousTeamName = previousTeam ? previousTeam.name : null;
        const previousLeague = player?.status || null;

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

        // Minimum contract in BBGM units (thousands) = $1,300,000
        const MIN_CONTRACT_AMOUNT = 1300;

        const result = await advanceDay(stateWithSim, {
            type: 'SIGN_FREE_AGENT',
            payload: {
                outcomeText: `The ${teamName} have signed free agent ${playerName}.`,
                playerId,
                teamId,
                announcements: [...newEmails, ...newNews, ...newSocial]
            }
        } as any, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

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
                            amount: MIN_CONTRACT_AMOUNT,
                            exp: stateWithSim.leagueStats.year + 1,
                            rookie: false
                        }
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
                            amount: MIN_CONTRACT_AMOUNT,
                            exp: stateWithSim.leagueStats.year + 1,
                            rookie: false
                        }
                    }
                    : p
            );
        }

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
    
    const outcome = calculateOutcome('SUSPEND_PLAYER', action.payload, stateWithSim);
    
    const result = await advanceDay(stateWithSim, {
        type: 'SUSPEND_PLAYER',
        payload: {
            outcomeText,
            players,
            reason,
            games
        }
    } as any, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    
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
    
    const result = await advanceDay(stateWithSim, {
        type: 'DRUG_TEST_PERSON',
        payload: {
            outcomeText,
            player,
            reason,
            failed,
            games
        }
    } as any, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    
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

export const handleWaivePlayer = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts } = action.payload;
    if (!contacts || contacts.length === 0) return { isProcessing: false };

    const player = contacts[0];
    const team = stateWithSim.teams.find(t => t.name === player.organization);
    const teamName = team?.name || player.organization || 'their team';

    const outcomeText = `The NBA has officially waived ${player.name} from ${teamName}. They are now a free agent.`;
    const storySeed = `${player.name} has just been waived by ${teamName}. Fans, GMs and media react to the sudden roster move.`;

    const result = await advanceDay(stateWithSim, {
        type: 'WAIVE_PLAYER',
        payload: { outcomeText, contacts }
    } as any, [storySeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

    // Update player state: move to free agent
    result.players = (result.players || stateWithSim.players).map((p: any) =>
        p.internalId === (player.id || player.internalId)
            ? { ...p, tid: -1, status: 'Free Agent' }
            : p
    );

    result.statChanges = result.statChanges || {};
    result.statChanges.playerApproval = (result.statChanges.playerApproval || 0) - 2;

    return result;
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
