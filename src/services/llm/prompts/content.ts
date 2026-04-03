import { GameState } from "../../../types";
import { ruleChangeService } from "../../RuleChangeService";

const JSON_FORMAT_HINT = `
    Return a JSON object with this EXACT structure (populate all arrays with real content, do not leave them empty):
    {
      "outcomeText": "One sentence summary.",
      "statChanges": { "publicApproval": 2, "ownerApproval": 1, "playerApproval": 1, "leagueFunds": 0, "personalWealth": 0, "legacy": 1 },
      "newEmails": [
        { "sender": "Full Name", "senderRole": "Player|Owner|GM|Media", "organization": "Team or Brand Name", "subject": "Email subject", "body": "Email body." }
      ],
      "newNews": [
        { "headline": "News headline", "content": "One or two sentence article hook." }
      ],
      "newSocialPosts": [
        { "author": "Display Name", "handle": "@handle", "content": "Post text.", "source": "TwitterX" }
      ]
    }`;

export const generateInitialStoryPrompt = (
    date: string,
    commissionerName: string,
    leagueContext: string
): string => {
    return `
    ${leagueContext}

    The user has just started a new game as the NBA Commissioner ("${commissionerName}").
    Date: ${date}

    Generate the initial atmosphere of the league.
    1. A welcome email from a major star player either welcoming them or demanding changes.
       - **ORGANIZATION:** Make sure to include the 'organization' field in the email schema (e.g., "Spotify", "Nike", "NBPA", "Los Angeles Lakers") so the correct email domain can be generated.
    2. A news headline announcing the new Commissioner's arrival with a bit of skepticism or hype.
    3. 2-3 Social media posts reacting to the hiring (mix of optimism and toxicity).

    ${JSON_FORMAT_HINT}
    `;
};

export const generateReactionPrompt = (
    currentState: GameState,
    actionDescription: string,
    leagueContext: string,
    statUpdates?: any,
    relevantHistory: string[] = []
): string => {
    const Commissioner = currentState.commissionerName || "The Commissioner";

    return `
    ${leagueContext}

    Current Game State:
    Date: ${currentState.date}
    Commissioner: ${Commissioner}
    Stats: Public(${currentState.stats.publicApproval}%), Owners(${currentState.stats.ownerApproval}%), Players(${currentState.stats.playerApproval}%)

    ${statUpdates ? `League Statistics Updates: ${JSON.stringify(statUpdates)}` : ''}
    ${statUpdates ? ruleChangeService.getRulesDiff(currentState.leagueStats, statUpdates) : ''}

    Relevant History:
    ${relevantHistory.length > 0 ? relevantHistory.join('\n') : "No significant recent events."}

    The Commissioner has just taken the following action:
    "${actionDescription}"

    Generate immediate reactions:
    1. 1-2 News headlines covering the change.
       - CRITICAL: Rewrite the action description into a realistic news headline and hook. Do NOT just copy it.
    2. 3-5 Social media posts reacting to it.
        - CRITICAL: If the action is a major transaction (signing, trade, suspension, fine), at least one post MUST be from @wojespn or @ShamsCharania breaking the news.
    3. (Optional) An email from a relevant stakeholder (Owner, Player, or GM) if the change is controversial.
       - **ORGANIZATION:** Make sure to include the 'organization' field in the email schema (e.g., "Spotify", "Nike", "NBPA", "Los Angeles Lakers") so the correct email domain can be generated.

    CRITICAL INSTRUCTIONS TO PREVENT HALLUCINATIONS:
    - You MUST use the provided "actionDescription" as the ABSOLUTE SOURCE OF TRUTH.
    - DO NOT invent, hallucinate, or assume any other trades, signings, injuries, or roster moves that are not explicitly stated in the action description.
    - If a player is mentioned, use their current team from the League Context. DO NOT place them on a different team unless the action explicitly moves them.
    - Everyone (news, social media, emails) MUST react to the EXACT SAME event with the exact same details. Do not create conflicting reports.

    CRITICAL: NEVER mention numerical ratings (e.g., "80-rated", "71 OIQ") or "gamified" terminology in the output. Use descriptive language instead.

    ANTI-GENERIC WRITING RULES — MANDATORY:
    - Every social post must have a SPECIFIC TAKE, not a vague reaction. BAD: "Bold move by the Commissioner." GOOD: "Reducing max contract years to 3?? Stars are gonna flee to Europe. This is the NBPA's worst nightmare 💀"
    - BAD phrases to NEVER use: "bold move", "generate buzz", "sends a strong message", "make no mistake", "this will be interesting", "time will tell"
    - Fans must use fan language — slang, memes, hot takes, frustration or hype (not corporate speak)
    - Analysts must argue a specific angle — is this good for small-market teams? does it hurt max-contract stars? does it help parity?
    - If it's a rule change affecting players' money or freedom → NBPA/player reps MUST push back in at least one post
    - If it's a rule change that helps competitive balance → small-market fans cheer, big-market fans whine
    - No two social posts can say the same thing. Each must represent a distinct perspective and emotional register.
    - News articles must include a specific detail, quote angle, or implication — not just restate what happened

    ${JSON_FORMAT_HINT}
    `;
};
