import { GameState, UserAction } from '../../../types';
import { advanceDay } from '../../../services/llm/llm';
import { convertTo2KRating } from '../../../utils/helpers';

export const handleEndorseHof = async (stateWithSim: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { contacts } = action.payload;
    if (!contacts || contacts.length === 0) return { isProcessing: false };

    const playerNames = contacts.map((p: any) => p.name).join(', ');
    const playerIds = contacts.map((p: any) => p.id || p.internalId);

    // Build player-specific career context for each endorsed player
    const playerContextLines = contacts.map((c: any) => {
        const player = stateWithSim.players.find((p: any) => p.internalId === (c.id || c.internalId));
        if (!player) return `${c.name} (retired legend)`;
        const age = player.born?.year ? new Date(stateWithSim.date).getFullYear() - player.born.year : null;
        const peak = convertTo2KRating(player.overallRating || 0, player.ratings?.[player.ratings.length - 1]?.hgt ?? 50, player.ratings?.[player.ratings.length - 1]?.tp);
        const lastTeam = stateWithSim.teams.find(t => t.id === player.tid)?.name || 'multiple franchises';
        return `${c.name} — ${player.pos || 'F'}${age ? `, age ${age}` : ''}, peak skill level ${peak}, career with ${lastTeam}`;
    }).join('\n');

    const outcomeText = `Commissioner ${stateWithSim.commissionerName} formally endorsed ${playerNames} for the Basketball Hall of Fame.\nPlayer profiles:\n${playerContextLines}`;

    const storySeed =
        `HOF ENDORSEMENT: Commissioner ${stateWithSim.commissionerName} endorsed ${playerNames} for the Hall of Fame. ` +
        `REQUIRED: Generate a news article that SPECIFICALLY recaps ${playerNames}'s career accomplishments — ` +
        `All-Star selections, championship runs, franchise records, iconic moments, legacy impact. ` +
        `DO NOT write generic "debate about HOF criteria." Write about THIS specific player's career. ` +
        `Include 2-4 social posts from fans, former teammates, or analysts reacting to the endorsement with specific career references.`;

    const result = await advanceDay(stateWithSim, {
        type: 'ENDORSE_HOF',
        payload: {
            outcomeText,
            players: contacts
        }
    } as any, [storySeed], simResults, stateWithSim.pendingHypnosis || [], recentDMs);

    result.endorsedPlayers = [...(result.endorsedPlayers || stateWithSim.endorsedPlayers), ...playerIds];

    result.statChanges = result.statChanges || {};
    result.statChanges.legacy = (result.statChanges.legacy || 0) + (10 * contacts.length);
    result.statChanges.relationship = (result.statChanges.relationship || 0) + (5 * contacts.length);

    return result;
};
