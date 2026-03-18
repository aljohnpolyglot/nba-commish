import { GameState, UserAction } from '../../../types';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { advanceDay } from '../../../services/llm/llm';

export const handleInvitePerformance = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const outcome = calculateOutcome('INVITE_PERFORMANCE', action.payload, stateWithSim);
    const { type, event, teamId, gameId, artists } = action.payload;
    const artistsList = artists.join(', ');
    let outcomeText = '';
    
    let gameText = '';
    let homeTeamName = '';
    let awayTeamName = '';
    let gameResult = undefined;
    if (gameId) {
        const game = stateWithSim.schedule.find(g => g.gid === gameId);
        if (game) {
            gameResult = simResults.find(r => r.homeTeamId === game.homeTid && r.awayTeamId === game.awayTid);
            const awayTeam = stateWithSim.teams.find(t => t.id === game.awayTid);
            if (awayTeam) {
                awayTeamName = awayTeam.name;
                gameText = ` against the ${awayTeam.name}`;
            }
        }
    }

    if (type === 'performance') {
        if (event === 'Regular Season Halftime' && teamId) {
            const team = stateWithSim.teams.find(t => t.id === teamId);
            if (team) homeTeamName = team.name;
            outcomeText = `The NBA has booked ${artistsList} for a special halftime performance at the ${team?.name} home game${gameText}. This high-profile booking is expected to drive massive viewership and social media engagement.`;
        } else {
            outcomeText = `The NBA has officially booked ${artistsList} to perform at the ${event}. This high-profile booking is expected to drive massive viewership and social media engagement.`;
        }
    } else {
        const team = stateWithSim.teams.find(t => t.id === teamId);
        if (team) homeTeamName = team.name;
        outcomeText = `${artistsList} has been invited to perform the National Anthem at the ${team?.name} home game${gameText}. Fans are already buzzing about the performance.`;
    }

    const result = await advanceDay(stateWithSim, {
        type: 'INVITE_PERFORMANCE',
        payload: {
            outcomeText,
            performanceType: type,
            event,
            teamId,
            homeTeamName,
            gameId,
            awayTeamName,
            artists,
            gameResult,
            isSpecificEvent: true
        }
    } as any, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.statChanges = result.statChanges || {};
    result.statChanges.leagueFunds = (result.statChanges.leagueFunds || 0) + (outcome.revenue || 0);
    result.consequence = result.consequence || {};
    result.consequence.statChanges = result.consequence.statChanges || {};
    result.consequence.statChanges.viewership = (result.consequence.statChanges.viewership || 0) + (outcome.viewership || 0);
    
    // Schedule the event for the future if it's not today
    if (gameId) {
        const game = stateWithSim.schedule.find(g => g.gid === gameId);
        if (game && !gameResult && game.date) {
            result.newScheduledEvents = [{
                date: game.date,
                type: 'PERFORMANCE_DAY',
                payload: {
                    performanceType: type,
                    event,
                    teamId,
                    homeTeamName,
                    gameId,
                    awayTeamName,
                    artists
                }
            }];
        }
    }
    return result;
};

export const handleGlobalGames = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { games } = action.payload;
    const gameDescriptions = games.map((g: any) => {
        const home = stateWithSim.teams.find(t => t.id === g.homeTid)?.name;
        const away = stateWithSim.teams.find(t => t.id === g.awayTid)?.name;
        return `${away} @ ${home} in ${g.city}, ${g.country}`;
    }).join(', ');

    const customAction = {
        type: 'GLOBAL_GAMES',
        description: `The Commissioner has scheduled the Global Games: ${gameDescriptions}.`
    };
    const storySeed = `The NBA is going international! The Global Games schedule has been announced: ${gameDescriptions}.`;
    
    const outcome = calculateOutcome('GLOBAL_GAMES', action.payload, stateWithSim);
    const result = await advanceDay(stateWithSim, customAction as any, [storySeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.statChanges = result.statChanges || {};
    result.statChanges.legacy = (result.statChanges.legacy || 0) + (outcome.legacy || 0);
    result.consequence = result.consequence || {};
    result.consequence.statChanges = result.consequence.statChanges || {};
    result.consequence.statChanges.viewership = (result.consequence.statChanges.viewership || 0) + (outcome.viewership || 0);
    result.consequence.statChanges.revenue = (result.consequence.statChanges.revenue || 0) + (outcome.revenue || 0);
    result.globalGames = games;
    return result;
};

export const handleRigLottery = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const outcome = calculateOutcome('RIG_LOTTERY', action.payload, stateWithSim);
    const result = await advanceDay(stateWithSim, action, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.ownerApproval = (result.statChanges.ownerApproval || 0) + (outcome.ownerApproval || 0);
    return result;
};

export const handleHypnotize = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts, reason } = action.payload;
    const names = contacts.map((c: any) => c.name).join(', ');
    
    const result = await advanceDay(stateWithSim, {
        type: 'HYPNOTIZE',
        payload: {
            outcomeText: `The Commissioner has covertly influenced ${names} to ${reason}. No direct link to the league office has been established, but whispers of manipulation are circulating in dark corners of the internet.`,
            contacts,
            reason
        }
    } as any, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    
    // CRITICAL: Hypnotize should NOT trigger direct messages/emails from the target
    result.newEmails = [];
    
    result.statChanges = result.statChanges || {};
    result.statChanges.legacy = (result.statChanges.legacy || 0) + 2;
    return result;
};

export const handleHypnoticBroadcast = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const outcome = calculateOutcome('HYPNOTIC_BROADCAST', action.payload, stateWithSim);
    const result = await advanceDay(stateWithSim, action, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.legacy = (result.statChanges.legacy || 0) + (outcome.legacy || 0);
    return result;
};

export const handleTravel = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const outcome = calculateOutcome('TRAVEL', action.payload, stateWithSim);
    const { city, reason, invitees, gameId } = action.payload;
    
    let gameResult = null;
    let specificOutcomeText = '';

    if (gameId !== undefined) {
        const game = stateWithSim.schedule.find(g => g.gid === gameId);
        if (game) {
            gameResult = simResults.find(r => r.homeTeamId === game.homeTid && r.awayTeamId === game.awayTid);
            const homeTeam = stateWithSim.teams.find(t => t.id === game.homeTid);
            const awayTeam = stateWithSim.teams.find(t => t.id === game.awayTid);
            
            specificOutcomeText = `The Commissioner attended the game between the ${awayTeam?.name} and the ${homeTeam?.name} in ${city}.`;
            if (gameResult) {
                 specificOutcomeText += ` Final Score: ${awayTeam?.abbrev} ${gameResult.awayScore} - ${homeTeam?.abbrev} ${gameResult.homeScore}. The Commissioner watched the game courtside to evaluate the atmosphere and officiating.`;
            } else {
                specificOutcomeText += ` The game was a highly anticipated matchup.`;
            }
        }
    } else {
         specificOutcomeText = `The Commissioner traveled to ${city} for ${reason}.`;
         if (invitees && invitees.length > 0) {
             specificOutcomeText += ` Guests included: ${invitees.join(', ')}.`;
         }
    }

    const result = await advanceDay(stateWithSim, {
        type: 'TRAVEL',
        payload: {
            outcomeText: specificOutcomeText,
            city,
            reason,
            invitees,
            gameResult,
            isSpecificEvent: true
        }
    } as any, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.consequence = result.consequence || {};
    result.consequence.statChanges = result.consequence.statChanges || {};
    result.consequence.statChanges.viewership = (result.consequence.statChanges.viewership || 0) + (outcome.viewership || 0);
    return result;
};

export const handleVisitNonNbaTeam = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { team, agenda } = action.payload;
    return await advanceDay(stateWithSim, {
        type: 'VISIT_NON_NBA_TEAM',
        payload: {
            outcomeText: `The Commissioner traveled to ${team.region} to visit the ${team.name} (${team.league}) for a ${agenda}.`,
            team,
            agenda
        }
    } as any, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
};
