import { GameState } from "../../../types";
import { SettingsManager } from "../../SettingsManager";

export const generateAdvanceDayPrompt = (
    currentState: GameState,
    gamePhase: string,
    leagueContext: string,
    action: any,
    storySeeds: string[] = [],
    relevantHistory: string[] = [],
    dailyResults: any[] = [],
    generateSponsorMessage: boolean = false,
    pendingHypnosis: { targetName: string; command: string }[] = [],
    recentDMs: any[] = [],
    leagueSummaryContext: string = ""
): string => {
    const actionDescription = action ? JSON.stringify(action) : "None (Just advanced the day)";
    const isSpecificEvent = action?.payload?.isSpecificEvent;
    const commissionerName = currentState.commissionerName || "The Commissioner";

    let hypnosisContext = "";
    if (pendingHypnosis && pendingHypnosis.length > 0) {
        hypnosisContext = `
        PENDING SUBJECT ACTIONS (INFLUENCED):
        The following individuals have decided to take specific actions today. 
        CRITICAL: These actions MUST be framed as if they were the subject's own idea/decision. 
        - DO NOT mention "Executive Overrides", "League Directives", "Hypnosis", or the "Commissioner's Influence".
        - Frame them as "Sudden Trade Requests", "Shock Retirements", "Unexpected Firings", or "Personal Decisions".
        - Only link it to the Commissioner if it's a massive league-altering event that requires a statement, but even then, the subject's motivation should seem internal.
        
        Subjects and their intended actions:
        ${pendingHypnosis.map(h => `- ${h.targetName}: ${h.command}`).join('\n')}
        
        CRITICAL: You MUST generate the consequences for these actions. 
        - Generate 4-6 social posts and 1-2 news items per action.
        - Media should be confused, shocked, or analyzing the subject's "sudden change of heart" or "bold move".
        `;
    }

    let gameResultContext = "";
    if (action && action.payload && action.payload.gameResult) {
        const gr = action.payload.gameResult;
        const homeTeam = currentState.teams.find(t => t.id === gr.homeTeamId);
        const awayTeam = currentState.teams.find(t => t.id === gr.awayTeamId);
        const winner = currentState.teams.find(t => t.id === gr.winnerId);
        gameResultContext = `
        Game Result Context (Watched Game):
        Home Team: ${homeTeam?.name || gr.homeTeamId}
        Away Team: ${awayTeam?.name || gr.awayTeamId}
        Score: ${gr.homeScore} - ${gr.awayScore}
        Winner: ${winner?.name || gr.winnerId}
        Stats: ${JSON.stringify(gr.homeStats)} (Home), ${JSON.stringify(gr.awayStats)} (Away)
        `;
    }

    let dailyGamesContext = "";
    if (dailyResults && dailyResults.length > 0) {
        const days = new Set(dailyResults.map(r => r.date)).size;
        dailyGamesContext = `
        GAMES PLAYED DURING THIS PERIOD (${days} days):
        ${dailyResults.map(r => {
            const home = currentState.teams.find(t => t.id === r.homeTeamId);
            const away = currentState.teams.find(t => t.id === r.awayTeamId);
            const winner = r.homeScore > r.awayScore ? home : away;
            const loser = r.homeScore > r.awayScore ? away : home;
            const topPerformer = r.homeStats.concat(r.awayStats).sort((a: any, b: any) => b.gameScore - a.gameScore)[0];
            const statLine = [
                `${topPerformer?.pts} PTS`,
                topPerformer?.reb >= 8 ? `${topPerformer.reb} REB` : null,
                topPerformer?.ast >= 8 ? `${topPerformer.ast} AST` : null,
                topPerformer?.blk >= 3 ? `${topPerformer.blk} BLK` : null,
                topPerformer?.stl >= 3 ? `${topPerformer.stl} STL` : null,
            ].filter(Boolean).join(', ');
            return `- [${r.date}] ${winner?.abbrev} def. ${loser?.abbrev} (${r.homeScore}-${r.awayScore}). Top Performer: ${topPerformer?.name} (${statLine})`;
        }).join('\n')}
        `;
    }

    const _cm = SettingsManager.getContentMultiplier();
    // Scaled volume targets (always at least 1 item)
    const singleDayMin  = Math.max(1,  Math.round(10 * _cm));
    const singleDayMax  = Math.max(2,  Math.round(20 * _cm));
    const newsMax       = Math.max(1,  Math.round(5  * _cm));

    let multiDayInstruction = `
    CRITICAL - VOLUME:
    Generate ${singleDayMin}-${singleDayMax} narrative, story-driven tweets for this day. The feed is too full of stats, so focus heavily on narratives, drama, rumors, and fan reactions!
    `;

    if (dailyResults && dailyResults.length > 0) {
        const uniqueDates = Array.from(new Set(dailyResults.map(r => r.date)));
        if (uniqueDates.length > 1) {
            const multiMin = Math.max(2, Math.round(uniqueDates.length * 4 * _cm));
            const multiMax = Math.max(4, Math.round(Math.min(60, uniqueDates.length * 12) * _cm));
            const perDay   = Math.max(1, Math.round(10 * _cm));
            multiDayInstruction = `
            CRITICAL - MULTI-DAY SIMULATION MODE:
            The user has simulated ${uniqueDates.length} days.
            Your output MUST reflect the entire period, not just the last day.

            1. **CHRONOLOGICAL NEWS:** Generate headlines that cover different days within this period.
               - For example, if Day 1 had a massive upset and Day 3 had a 50-point game, generate headlines for BOTH.
               - You MUST include a 'date' field in the news item JSON if it refers to a specific day in the past (e.g. "Oct 24, 2025").
            2. **SOCIAL MEDIA SPREAD:** Posts should react to events across the whole period.
               - You can include a 'date' field (ISO string or relative like "2 days ago") to place it correctly in time.
            3. **VOLUME:** Increase the number of news items to 3-${Math.max(3, newsMax)} and social posts to AT LEAST ${multiMin} (target ${multiMax}) to cover the span of time. Generate around ${perDay}-${perDay + 5} narrative, story-driven tweets per day simulated. The feed is too full of stats, so focus heavily on narratives, drama, rumors, and fan reactions!
            `;
        }
    }

    let specificInstructions = "";
    if (isSpecificEvent) {
        specificInstructions = `
        CRITICAL - SPECIFIC EVENT FOCUS (STRICT MODE):
        The user has performed a specific action (e.g., watching a game, visiting a team).
        Your output MUST focus almost entirely on this specific event.
        
        1. **HEADLINES:** The headlines MUST be about this specific game or visit. Do NOT create headlines about other random league events.
        2. **SOCIAL MEDIA:** The social media posts MUST be reactions to this specific game/visit (e.g., fans reacting to the score, the Commissioner's presence, or player performances in THIS game).
        3. **EMAILS:** Any emails should be related to this event (e.g., the owner thanking the Commissioner for visiting).
        
        - Do NOT generate generic "league-wide" news.
        - Do NOT hallucinate other major events happening simultaneously unless they are in 'GAMES PLAYED DURING THIS PERIOD'.
        - The 'outcomeText' provided in the action payload is the primary source of truth. Expand on it, but do not deviate.
        `;
    }

    let sponsorInstruction = "";
    if (generateSponsorMessage) {
        sponsorInstruction = `
        - **SPONSOR MESSAGE:** Generate a realistic email from a major brand (e.g., Nike, Gatorade, State Farm, Crypto.com) discussing a sponsorship opportunity, a complaint about a player's behavior reflecting poorly on the brand, or a request for a collaboration.
        `;
    }

    let recentDMsContext = "";
    if (recentDMs && recentDMs.length > 0) {
        recentDMsContext = `
        RECENT DIRECT MESSAGES (DMs) FROM TODAY:
        The Commissioner had the following private conversations today:
        ${recentDMs.map(dm => `- Chat with ${dm.targetName} (${dm.targetRole}):
${dm.messages.map((m: any) => `  [${m.senderName}]: ${m.text}`).join('\n')}`).join('\n')}
        
        CRITICAL: DMs are inherently PRIVATE. 
        - For most cases, IGNORE these DMs in the public news and social media.
        - HOWEVER, if the Commissioner said something extremely aggressive, controversial, or "crazy" to a player or staff member, it MIGHT leak.
        - LEAK SOURCES:
            1. **The Recipient Speaks Out**: The player or staff member might post a cryptic or direct tweet (e.g., "Can't believe what I just read in my DMs..."), talk to a news outlet, or mention it in a podcast interview.
            2. **Insider Leaks**: A "puppetmaster" or insider (like @wojespn, @ShamsCharania, or a burner account) might report on it (e.g., "Sources say the Commissioner slid into [Player]'s DMs today with a wild threat...").
        - The more "out of pocket" the Commissioner's message, the higher the chance of a leak.
        `;
    }

    return `
CRITICAL FORMATTING RULE: Respond with ONLY raw JSON. No markdown, no backticks, no headers, no bullet points. Start your response with { and end with }. Nothing else.

${leagueContext}
${leagueSummaryContext}

Current Game State:
Date: ${currentState.date} (${gamePhase})
Commissioner Name: ${commissionerName}
Stats: Public(${currentState.stats.publicApproval}%), Owners(${currentState.stats.ownerApproval}%), Players(${currentState.stats.playerApproval}%), Legacy(${currentState.stats.legacy}%)

Relevant History:
${relevantHistory.length > 0 ? relevantHistory.join('\n') : "No significant recent events."}

User Action Taken:
${actionDescription}
${gameResultContext}
${dailyGamesContext}
${hypnosisContext}
${recentDMsContext}

${multiDayInstruction}
${specificInstructions}

CRITICAL INSTRUCTIONS TO PREVENT HALLUCINATIONS:
1. **COMMISSIONER IDENTITY:** The Commissioner's name is "${commissionerName}". NEVER use placeholders like "[Your Name]" or "[Commissioner Name]". Always use "${commissionerName}" or "Commissioner ${commissionerName.split(' ').pop()}".
2. **NARRATIVE GENERATION:** If the User Action Taken contains an 'outcomeText', use it as the ABSOLUTE SOURCE OF TRUTH. Rewrite it into engaging news headlines and social media posts, but DO NOT deviate from the facts. Everyone (news, social media, emails) MUST react to the EXACT SAME event with the exact same details.
3. **DO NOT HALLUCINATE TRADES, SIGNINGS, OR ROSTER MOVES** unless they are explicitly described in the 'User Action Taken' or 'outcomeText'. 
   - If the action is "Watching a game" or "Visiting a team", the output MUST focus ONLY on the game, the atmosphere, the players' performance in that specific game, or the meeting details. 
   - Do NOT invent "blockbuster deals", "shockwaves", or rumors about players moving teams if no trade action occurred.
   - If a player is mentioned, use their current team from the League Context. DO NOT place them on a different team unless the action explicitly moves them.
4. **DO NOT INVENT MAJOR SCANDALS, ARRESTS, OR SUSPENSIONS:** NEVER hallucinate off-court crimes, domestic violence, arrests, or indefinite suspensions unless explicitly provided in the 'User Action Taken'. Keep the drama strictly focused on basketball (e.g., rivalries, bad performances, coaching hot seats, on-court beefs, or trade rumors).
5. If it's a trade, describe the specific assets moved in that outcomeText and populate the 'forcedTrade' object if applicable.
6. If 'Game Result Context' is provided, you MUST use it as the source of truth for the game outcome, stats, and player performances. DO NOT invent different scores or stats.
7. **DATES:** You MUST provide the exact date for every news item and social post in the \`date\` field. Use the 'Date' provided in the 'Current Game State' or the dates from the 'Daily Game Results' to ensure the timestamps align perfectly with the events being discussed.

Potential Storylines (Use these to generate 'newEmails'):
${storySeeds.length > 0 ? storySeeds.map((s, i) => `${i + 1}. ${s}`).join('\n') : "None provided. Focus on the daily game results and general basketball narratives (e.g., winning streaks, slumps, rivalries). DO NOT invent major scandals."}

Generate the outcome for the next day.
1. 1-${newsMax} News headlines summarizing the events.
2. ${singleDayMin}-${singleDayMax} Social media posts reacting to the events.
   - **DIVERSITY:** Include heated debates, long-form discussion threads, controversial takes, and analysts arguing about the league's direction.
   - **BEYOND THE NEWS:** While many posts should react to the daily results, also include general league chatter, fan culture, historical comparisons, and "around the league" talk that isn't directly tied to the day's main headlines.
   - **NARRATIVES:** Focus heavily on league-wide narratives, drama, rumors, and how the Commissioner's decisions are being received.
   - **USE THE LEAGUE SUMMARY:** You MUST reference the 'LEAGUE SUMMARY' provided above. Talk about teams on winning/losing streaks, players leading the league in stats, or recent crazy box scores. Weave these real stats into the narratives and debates!
   - **FORMAT:** Use a mix of short takes and multi-post "threads" or "debates" between different handles.
   - **BREAKING NEWS:** If a major transaction occurred (signing, trade, suspension), at least one post MUST be from @wojespn or @ShamsCharania breaking the news.
3. 1-3 Emails arising from the events.
   - **FORMAL BUSINESS:** Ensure at least one email is a formal business communication (e.g., from a Sponsor, Media Executive, or League Official) that would appear in a professional Inbox.
   - **ISSUES & SCANDALS:** If a player has low morale, is unhappy, or has been involved in a controversy (check 'Relevant History'), generate an email from their agent, a team owner, or the player themselves complaining or demanding action.
   - **DISCIPLINE:** If a player was suspended or fined, generate an email from the player's agent appealing the decision or the team owner reacting to it.
   - **ORGANIZATION:** Make sure to include the 'organization' field in the email schema (e.g., "Spotify", "Nike", "NBPA", "Los Angeles Lakers") so the correct email domain can be generated.
   ${sponsorInstruction}

CRITICAL: NEVER mention numerical ratings (e.g., "80-rated", "71 OIQ") or "gamified" terminology in the output. Use descriptive language instead.

CRITICAL: Use EXACTLY these field names in your JSON response:
- newNews (array) with each item having: headline, content, date, type
- newSocialPosts (array) with each item having: author, handle, content, likes, retweets, source
- newEmails (array) with each item having: sender, senderRole, subject, body
- narrative (string) - the main outcome text
- statChanges (object) - approval/fund changes
Do NOT use: title, article, posts, tweets, inbox, story, outcome
`;
};

export const generateLeaguePulsePrompt = (
    currentState: GameState,
    gamePhase: string,
    leagueContext: string,
    leagueSummaryContext: string = ""
): string => {
    return `
    ${leagueContext}
    ${leagueSummaryContext}

    Current Game State:
    Date: ${currentState.date} (${gamePhase})
    Stats: Public(${currentState.stats.publicApproval}%), Owners(${currentState.stats.ownerApproval}%), Players(${currentState.stats.playerApproval}%), Legacy(${currentState.stats.legacy}%)
    Revenue: $${currentState.leagueStats.revenue}M, Viewership: ${currentState.leagueStats.viewership}M
    
    Generate a "League Pulse" update.
    1. 1-${Math.max(1, Math.round(2 * SettingsManager.getContentMultiplier()))} News headlines summarizing the current state of the league (e.g., financial health, fan sentiment).
    2. ${Math.max(3, Math.round(15 * SettingsManager.getContentMultiplier()))}-${Math.max(5, Math.round(25 * SettingsManager.getContentMultiplier()))} Social media posts from analysts, reporters, and fans.
       - **DIVERSITY:** Include heated debates, long-form discussion threads, controversial takes, and analysts arguing about the league's direction.
       - **BEYOND THE NEWS:** Include general league chatter, fan culture, historical comparisons, and "water cooler" talk that isn't necessarily tied to the main news headlines.
       - **NARRATIVES:** Focus heavily on league-wide narratives, drama, rumors, and how the Commissioner's decisions are being received.
       - **USE THE LEAGUE SUMMARY:** You MUST reference the 'LEAGUE SUMMARY' provided above. Talk about teams on winning/losing streaks, players leading the league in stats, or recent crazy box scores. Weave these real stats into the narratives and debates!
       - **FORMAT:** Use a mix of short takes and multi-post "threads" or "debates" between different handles.
    3. 1-2 Emails from stakeholders (e.g., Media Partners, Sponsors, or League Officials) praising or criticizing the Commissioner's overall performance.
       - **ORGANIZATION:** Make sure to include the 'organization' field in the email schema (e.g., "Spotify", "Nike", "NBPA", "Los Angeles Lakers") so the correct email domain can be generated.

    CRITICAL INSTRUCTIONS TO PREVENT HALLUCINATIONS:
    - DO NOT invent, hallucinate, or assume any specific trades, signings, injuries, or roster moves. Keep the discussion focused on the macro level (revenue, viewership, overall sentiment, commissioner's job performance).
    - SCANDALS & DISCIPLINE: You are allowed to discuss serious off-court incidents (e.g., arrests, investigations, scandals) IF they are provided in the context. However, NEVER assume the Commissioner has already taken action (like a suspension or fine). The discussion should focus on the incident itself and the public's anticipation of the Commissioner's decision.
    - If you mention a player or team, use their current status from the League Context. DO NOT place them on a different team or invent rumors about them moving.
    - NEVER mention numerical ratings (e.g., "80-rated", "71 OIQ") or "gamified" terminology in the output. Use descriptive language instead.
    - **DATES:** You MUST provide the exact date for every news item and social post in the \`date\` field. Use the 'Date' provided in the 'Current Game State' or the dates from the 'LEAGUE SUMMARY' to ensure the timestamps align perfectly with the events being discussed.

    Return a JSON object with this EXACT structure (populate all arrays with real content, do not leave them empty):
    {
      "outcomeText": "One sentence summary.",
      "statChanges": { "publicApproval": 0, "ownerApproval": 0, "playerApproval": 0, "leagueFunds": 0, "personalWealth": 0, "legacy": 0 },
      "newEmails": [
        { "sender": "Full Name", "senderRole": "Player|Owner|GM|Media", "organization": "Team or Brand Name", "subject": "Email subject", "body": "Email body." }
      ],
      "newNews": [
        { "headline": "News headline", "content": "One or two sentence article hook." }
      ],
      "newSocialPosts": [
        { "author": "Display Name", "handle": "@handle", "content": "Post text.", "source": "TwitterX" }
      ]
    }

    CRITICAL: Use EXACTLY these field names — do NOT use: title, article, posts, tweets, inbox, story, outcome.
    `;
};
