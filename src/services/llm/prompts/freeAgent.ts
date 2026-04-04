import { NBAPlayer, NBATeam } from "../../../types";
import { formatHeight } from "../../../utils/helpers";

export const generateFreeAgentSigningPrompt = (
    player: NBAPlayer,
    team: NBATeam,
    previousTeamName: string | null,
    previousLeague: string | null,
    leagueContext: string,
    teammates: NBAPlayer[]
): string => {
    const age = player.born?.year ? new Date().getFullYear() - player.born.year : 25;
    const teammateDetails = teammates.slice(0, 10).map(p => `${p.name} (#${p.jerseyNumber || '?'})`).join(', ');
    const height = player.hgt ? formatHeight(player.hgt) : 'Unknown';
    
    return `
${leagueContext}

A free agent has been signed:
Player: ${player.name} (Pos: ${player.pos}, Height: ${height}, Age: ${age}, Overall Rating: ${player.overallRating}, Preferred/Previous Number: #${player.jerseyNumber || '?'})
New Team: ${team.name} (Team Strength: ${team.strength})
Current Roster (Key Players & Numbers): ${teammateDetails}
Previous Team: ${previousTeamName || "None"}
Previous League: ${previousLeague || "None"}

INTERNAL SCOUTING REPORT (Context Only):
- Overall Rating: This is a 2K-style rating (60-99) representing the player's current standing and impact relative to the NBA.
- Raw Attributes: ${JSON.stringify(player.ratings[player.ratings.length - 1])}
  (Note: These use a Basketball GM scale where 50 is average and 60+ is elite. Use the Archetype Guide in your system instructions to interpret these).

SITUATIONAL AWARENESS RULES:
- Team Strength 94+ = Contending / Title Favorite.
- Team Strength 85- = Tanking / Rebuilding.
- Use the "Key Teammates" to understand how the player fits into the depth chart.

Generate:
1. 1-2 News headlines about this signing.
2. 3-5 Social media posts reacting to it.
   - CRITICAL: At least one post MUST be from @ShamsCharania breaking the news of this specific signing.
3. 1-2 Emails reacting to the signing (e.g., from the GM, Head Coach, or the player's agent).
   - **ORGANIZATION:** Make sure to include the 'organization' field in the email schema (e.g., "Klutch Sports", "Los Angeles Lakers") so the correct email domain can be generated.
4. If the player is international, include reactions from their home country.

REAL-WORLD PLAYER KNOWLEDGE (CRITICAL):
Use your training knowledge to enrich coverage of this signing. If you know this player from real-world basketball:
- Mention their most notable career achievements (FIBA World Cup, Olympic Games, Euroleague titles, All-Star appearances, etc.)
- If they are an international star known for a specific tournament performance (e.g., helped their national team beat the USA, won a FIBA title, starred at the Olympics), that backstory MUST be included in at least one news item and one social post
- Example: A German player known for the 2023 FIBA World Cup → reference the World Cup, Germany's run, his role in it
- Example: A Euroleague MVP → reference his Euroleague dominance
- If you know nothing specific about the player, use the Scouting Report attributes to describe their game style instead

CRITICAL INSTRUCTIONS TO PREVENT HALLUCINATIONS:
- You MUST use the provided signing details as the ABSOLUTE SOURCE OF TRUTH.
- DO NOT invent, hallucinate, or assume any other trades, signings, injuries, or roster moves that are not explicitly stated.
- Everyone (news, social media, emails) MUST react to the EXACT SAME event with the exact same details. Do not create conflicting reports.
- NEVER mention numerical ratings (e.g., "80-rated", "71 OIQ", "99 overall") or "gamified" terminology in the public-facing text. Use descriptive language instead (e.g., "elite shooter," "high-IQ playmaker," "generational talent," "bench depth").
- Do NOT assume the player is a "young prospect" or on a "two-way contract" unless their age and ratings clearly suggest it.
- Only refer to a player as a "veteran" if they are 32 years old or older.
- If you have adequate data for the player (e.g., they are a well-known star or veteran), treat the signing as a standard basketball move.
- Shams should sound professional and focused on the basketball fit.
`;
};
