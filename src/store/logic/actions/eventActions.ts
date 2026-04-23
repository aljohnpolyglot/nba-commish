import { GameState, UserAction } from '../../../types';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { advanceDay } from '../../../services/llm/llm';
import { convertTo2KRating } from '../../../utils/helpers';
import { LOTTERY_PRESETS, DEFAULT_DRAFT_TYPE, computeTopKOdds } from '../../../lib/lotteryPresets';

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

    const commish = stateWithSim.commissionerName || 'The Commissioner';

    if (type === 'performance') {
        if (event === 'Regular Season Halftime' && teamId) {
            const team = stateWithSim.teams.find(t => t.id === teamId);
            if (team) homeTeamName = team.name;
            outcomeText = `Commissioner ${commish} personally booked ${artistsList} for a halftime show at the ${team?.name} home game${gameText}. The booking was finalized today — insiders say the Commissioner pushed hard for this act specifically. Ticket demand is already spiking and social media is buzzing.`;
        } else if (event === 'NBA Finals Halftime' || event?.toLowerCase().includes('finals')) {
            outcomeText = `Commissioner ${commish} has locked in ${artistsList} for the NBA Finals Halftime Show — one of the most-watched entertainment moments of the year. Sources say negotiations were intense and the Commissioner personally sealed the deal. Expect massive viewership and a cultural moment.`;
        } else if (event === 'All-Star Halftime' || event?.toLowerCase().includes('all-star')) {
            outcomeText = `Commissioner ${commish} has booked ${artistsList} for the All-Star Weekend Halftime Show. The announcement is already generating huge buzz online — fans are stoked. This is expected to be one of the most-streamed All-Star performances ever.`;
        } else {
            outcomeText = `Commissioner ${commish} officially booked ${artistsList} to perform at the ${event}. The Commissioner personally selected this act — insiders say it was a calculated move to maximize viewership and cultural impact. Fans are reacting loudly on social media.`;
        }
    } else {
        const team = stateWithSim.teams.find(t => t.id === teamId);
        if (team) homeTeamName = team.name;
        outcomeText = `Commissioner ${commish} personally invited ${artistsList} to perform the National Anthem at the ${team?.name} home game${gameText}. It's a high-profile pick that's getting fans talking ahead of tip-off.`;
    }

    // Build story seed for rich LLM output
    const performanceSeed = type === 'performance'
        ? `COMMISSIONER BOOKING: Commissioner ${commish} just personally booked ${artistsList} for ${event === 'Regular Season Halftime' ? `a halftime show at the ${homeTeamName} game${gameText}` : `the ${event}`}. This is a CONFIRMED booking — the Commissioner made it happen. Generate: 4-6 social posts with fan excitement, music fans hyping it up, sports fans reacting, @ShamsCharania or @wojespn breaking the news. 1-2 news headlines. Make it feel like a real celebrity booking announcement.`
        : `NATIONAL ANTHEM BOOKING: ${artistsList} will perform the National Anthem at the ${homeTeamName} game. Generate 2-3 social posts and a news headline covering this.`;

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
    } as any, [performanceSeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);
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
    const { riggedTid } = action.payload ?? {};
    const riggedTeamName = riggedTid != null
        ? stateWithSim.teams.find(t => t.id === riggedTid)?.name ?? 'Unknown'
        : 'Unknown';

    const result = await advanceDay(stateWithSim, {
        type: 'RIG_LOTTERY',
        payload: {
            outcomeText: `Quiet whispers have begun circulating in league circles about the integrity of the ${stateWithSim.leagueStats.year} Draft Lottery. Nothing confirmed. Nothing traceable.`,
        },
    } as any, [], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

    // Covert action — suppress any emails/DMs that could tip off teams
    result.newEmails = [];
    result.newDMs = [];
    result.statChanges = result.statChanges || {};
    result.statChanges.publicApproval = (result.statChanges.publicApproval || 0) + (outcome.publicApproval || 0);
    result.statChanges.ownerApproval = (result.statChanges.ownerApproval || 0) + (outcome.ownerApproval || 0);

    if (riggedTid != null) {
        const preset = LOTTERY_PRESETS[stateWithSim.leagueStats?.draftType ?? DEFAULT_DRAFT_TYPE] ?? LOTTERY_PRESETS[DEFAULT_DRAFT_TYPE];
        const poolSize = Math.min(14, preset.chances.length);
        const sorted = [...stateWithSim.teams]
            .filter(t => t.id > 0)
            .sort((a, b) => (a.wins / Math.max(1, a.wins + a.losses)) - (b.wins / Math.max(1, b.wins + b.losses)))
            .slice(0, poolSize);

        const lotteryTeams = sorted.map((t, i) => {
            const chance = preset.chances[i] ?? 0;
            const gp = t.wins + t.losses;
            return {
                id: String(t.id),
                tid: t.id,
                name: t.name,
                city: (t as any).region ?? t.name,
                logoUrl: (t as any).logoUrl ?? '',
                record: `${t.wins}-${t.losses}`,
                winPct: gp > 0 ? (t.wins / gp).toFixed(3) : '.000',
                odds1st: parseFloat(((chance / preset.total) * 100).toFixed(1)),
                oddsTopN: parseFloat((computeTopKOdds(preset.chances, i, preset.numToPick) * 100).toFixed(1)),
                color: (t as any).colors?.[0] ?? '#333333',
                originalSeed: i + 1,
            };
        });

        const riggedTeam = lotteryTeams.find(t => t.tid === riggedTid);
        if (riggedTeam) {
            const rest = lotteryTeams
                .filter(t => t.tid !== riggedTid)
                .sort((a, b) => a.originalSeed - b.originalSeed);
            const draftLotteryResult = [
                { pick: 1, team: riggedTeam, change: riggedTeam.originalSeed - 1 },
                ...rest.map((t, idx) => ({ pick: idx + 2, team: t, change: t.originalSeed - (idx + 2) })),
            ];
            (result as any).draftLotteryResult = draftLotteryResult;
        }
    }

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

    const storySeeds: string[] = [];
    if (action.payload.reason === 'organizational review') {
        const teamName = action.payload.city;
        storySeeds.push(
            `The Commissioner made an unannounced organizational visit to the ${teamName} franchise today. ` +
            `They toured the facility, observed practice, held closed-door meetings with the coaching staff, ` +
            `GM, and ownership, and spoke privately with key players. ` +
            `League sources say the Commissioner was evaluating the franchise's direction. ` +
            `React as players, media, coaches and fans would to a surprise commissioner visit.`
        );
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
    } as any, storySeeds, simResults, stateWithSim.pendingHypnosis || [], recentDMs);
    
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

export const handleInviteDinner = async (state: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { reason, location, subType, count, contacts } = action.payload;
    const isMovie = subType === 'movie';
    const actionLabel = isMovie ? 'movie night' : 'private dinner';
    const commish = state.commissionerName || 'The Commissioner';

    const guestNames = contacts?.length > 0
        ? contacts.map((c: any) => c.name).join(', ')
        : action.payload.targetName || 'unknown guest';

    // Strip appended " at [location]" from reason so we get the pure discussion topic
    const rawReason = (reason || '').replace(location ? ` at ${location}` : '', '').trim();
    const discussionTopic = (rawReason && rawReason !== 'No reason provided.' && rawReason !== 'Movie Night')
        ? rawReason
        : (isMovie ? 'casual bonding' : 'general league matters');

    const locationText = location ? ` at ${location}` : '';
    const isGroup = (count || 1) > 1;

    // Build rich player context for HOF/retirement-age players if available
    const guestContextLines = (contacts || []).map((c: any) => {
        const player = state.players.find((p: any) => p.internalId === (c.id || c.internalId));
        if (!player) return null;
        const team = state.teams.find(t => t.id === player.tid);
        const age = player.born?.year ? new Date(state.date).getFullYear() - player.born.year : null;
        const rating = convertTo2KRating(player.overallRating || 0, player.ratings?.[player.ratings.length - 1]?.hgt ?? 50, player.ratings?.[player.ratings.length - 1]?.tp);
        return `${c.name} (${player.pos || 'F'}${age ? `, age ${age}` : ''}, ${team?.name || 'Free Agent'}, skill level ${rating})`;
    }).filter(Boolean);

    const guestContext = guestContextLines.length > 0 ? `\nGuest info: ${guestContextLines.join('; ')}` : '';

    const outcomeText = isMovie
        ? `Commissioner ${commish} took ${guestNames} to a movie${locationText}. Side agenda: ${discussionTopic}.`
        : `Commissioner ${commish} hosted a private ${isGroup ? 'group dinner' : 'one-on-one dinner'} with ${guestNames}${locationText}. ` +
          `The meeting specifically addressed: ${discussionTopic}. Word has leaked to NBA insiders.${guestContext}`;

    // Seed 1: mandatory player DM after the event
    const playerDMSeed =
        `REQUIRED OUTPUT: ${guestNames} MUST send a personal DM/chat to Commissioner ${commish} after this ${actionLabel}. ` +
        `Put it in newEmails with senderRole: 'Player' (routes to CHAT, not inbox). ` +
        `Write it like an iMessage — casual, no formal greeting, no sign-off, use natural speech, emojis OK. ` +
        `The message MUST specifically reference the actual discussion topic: "${discussionTopic}". ` +
        `Show the player's real reaction (hyped, guarded, skeptical, grateful) — not just "thanks for dinner."`;

    // Seed 2: social media coverage with specifics
    const socialSeed = isMovie
        ? `Paparazzi caught Commissioner ${commish} at a movie with ${guestNames}${locationText}. ` +
          `Generate 4-6 social posts — fan jokes, speculation about hidden agenda, meme reactions.`
        : `BREAKING (insider scoop): Commissioner ${commish} had a private dinner with ${guestNames}${locationText}. ` +
          `The meeting was specifically about: "${discussionTopic}". ` +
          `@ShamsCharania should report this as an insider tip. ` +
          `Generate 4-6 varied social posts — some with "inside info" about the topic, fans reacting, one conspiracy take. ` +
          `CRITICAL: Posts MUST reference the actual discussion topic ("${discussionTopic}"). ` +
          `Do NOT write vague "sparking curiosity" or "what could they have discussed" language — insiders KNOW what it was about.`;

    const result = await advanceDay(
        state,
        {
            type: 'INVITE_DINNER',
            payload: {
                outcomeText,
                targetName: guestNames,
                location,
                discussionTopic,
                subType,
                contacts,
            }
        } as any,
        [playerDMSeed, socialSeed],
        simResults,
        state.pendingHypnosis || [],
        recentDMs
    );

    const outcomeChanges = calculateOutcome('INVITE_DINNER', action.payload, state);
    result.statChanges = {
        ...result.statChanges,
        personalWealth: (result.statChanges?.personalWealth || 0) - 0.05,
        playerApproval: (result.statChanges?.playerApproval || 0) + (outcomeChanges.playerApproval || 0),
        morale: (result.statChanges?.morale || 0) + (outcomeChanges.morale || 0),
    };

    return result;
};
