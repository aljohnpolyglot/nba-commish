import { GameState } from "../../../types";

export const generateDirectMessagePrompt = (
    targetName: string,
    targetRole: string,
    message: string,
    currentState: GameState,
    leagueContext: string,
    relevantHistory: string[]
): string => {
    return `
${leagueContext}

Current Game State:
Date: ${currentState.date}
Stats: Public(${currentState.stats.publicApproval}%), Owners(${currentState.stats.ownerApproval}%), Players(${currentState.stats.playerApproval}%), Legacy(${currentState.stats.legacy}%)

Relevant History with ${targetName}:
${relevantHistory.length > 0 ? relevantHistory.join('\n') : "No significant recent events."}

The Commissioner (${currentState.commissionerName}) is sending a message to:
Name: ${targetName}
Role: ${targetRole}
Message: "${message}"

React realistically as the target. If the message is controversial, threatening, or highly newsworthy, the target might leak it to the press, post about it on social media, or talk about it on a podcast. Feel free to generate news articles or social media posts reflecting this leak if appropriate.

If generating emails, make sure to include the 'organization' field in the email schema (e.g., "Spotify", "Nike", "NBPA", "Los Angeles Lakers") so the correct email domain can be generated.
`;
};
