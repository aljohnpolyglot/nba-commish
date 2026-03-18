import { GameState, UserAction } from '../../../types';
import { advanceDay } from '../../../services/llm/llm';
import { calculateOutcome } from '../../../services/logic/outcomeDecider';
import { CLUB_DATA } from '../../../data/clubs';

const EMAIL_SUBJECTS = [
    "Last Night",
    "That Was Fun 😄",
    "About Last Night...",
    "You Left Something",
    "Hey You",
    "Great Time Last Night!",
    "Miss You Already",
    "We Should Do That Again",
    "Still Smiling 😊",
    "Quick Question",
];

export const handleGoToClub = async (state: GameState, action: UserAction, simResults: any[], recentDMs: any[]) => {
    const { location, contacts } = action.payload;
    const guestNames = contacts.length > 0
        ? `with ${contacts.map((c: any) => c.name).join(', ')}`
        : "alone";

    const customAction = {
        type: 'GO_TO_CLUB',
        description: `The Commissioner visited ${location} for a night out ${guestNames}. The club was packed, the music was loud, and the atmosphere was electric.`
    };

    const storySeed = contacts.length > 0
        ? `The Commissioner was spotted at ${location} last night with a group including ${contacts.map((c: any) => c.name).join(', ')}. Photos are circulating on social media of the high-energy night out.`
        : `The Commissioner was seen flying solo at ${location} last night. Witnesses say the league's top executive seemed to be enjoying the music and the vibe in a more low-key fashion.`;

    const result = await advanceDay(state, customAction as any, [storySeed], simResults, state.pendingHypnosis || [], recentDMs);

    // Calculate outcome and merge stat changes
    const outcomeChanges = calculateOutcome('GO_TO_CLUB', action.payload, state);
    result.statChanges = {
        ...result.statChanges,
        personalWealth: (result.statChanges?.personalWealth || 0) - 0.02,
        publicApproval: (result.statChanges?.publicApproval || 0) + outcomeChanges.publicApproval,
        morale: (result.statChanges?.morale || 0) + outcomeChanges.morale,
    };

    // Build pendingClubDebuff from player contacts based on club rank
    const clubInfo = CLUB_DATA.find(c => c.name === location);
    const clubRank = clubInfo?.rank ?? 99;
    const severity: 'heavy' | 'moderate' | 'mild' = clubRank <= 5 ? 'heavy' : clubRank <= 15 ? 'moderate' : 'mild';

    const playerContacts = contacts.filter((c: any) => c.type === 'player' || !c.type);
    const newDebuffs = playerContacts.map((c: any) => ({
        playerId: String(c.id),
        playerName: c.name,
        severity,
        clubName: location,
    }));

    // Merge with any existing debuffs (overwrite if same player)
    const existingDebuffs = state.pendingClubDebuff || [];
    const mergedDebuffs = [
        ...existingDebuffs.filter((d: any) => !newDebuffs.some((nd: any) => nd.playerId === d.playerId)),
        ...newDebuffs,
    ];
    result.pendingClubDebuff = mergedDebuffs;

    // 50% chance of a DM from a girl
    if (Math.random() < 0.5) {
        const girlNames = ["Tiffany", "Brittany", "Ashley", "Jessica", "Chloe", "Madison", "Alexis", "Sasha"];
        const girlName = girlNames[Math.floor(Math.random() * girlNames.length)];
        const messages = [
            "Hey... remember last night? 😉",
            "That was a wild night at the club! Hope you're feeling okay today lol",
            "You were definitely the life of the party last night!",
            "Had so much fun with you at the club. We should do it again sometime.",
            "Still thinking about that dance last night... call me?",
            "You left your sunglasses at the table last night! I have them if you want to meet up."
        ];
        const message = messages[Math.floor(Math.random() * messages.length)];
        const subject = EMAIL_SUBJECTS[Math.floor(Math.random() * EMAIL_SUBJECTS.length)];

        if (!result.newEmails) result.newEmails = [];
        result.newEmails.push({
            id: `club-dm-${Date.now()}`,
            sender: girlName,
            senderRole: "Someone you met last night",
            subject,
            body: message,
            date: result.date,
            read: false,
            replied: false
        });
    }

    // Ensure isClubbing is set to false in the new state
    result.isClubbing = false;

    return result;
};
