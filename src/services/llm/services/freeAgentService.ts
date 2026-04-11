import { generateContentWithRetry } from "../utils/api";
import { GameState, NBAPlayer, NBATeam } from "../../../types";
import { SYSTEM_PROMPT } from "../prompts/system";
import { generateLeagueContext } from "../prompts/context";
import { generateFreeAgentSigningPrompt } from "../prompts/freeAgent";
import { OUTCOME_SCHEMA } from "../../schemas";
import { fetchAvatarData, getAvatarByHandle } from "../../avatarService";
import { SettingsManager } from "../../SettingsManager";

export async function generateFreeAgentSigningReactions(
    player: NBAPlayer,
    team: NBATeam,
    previousTeamName: string | null,
    previousLeague: string | null,
    currentState: GameState
): Promise<any> {
    const leagueContext = generateLeagueContext(currentState.players, currentState.teams, currentState.staff!);
    const teammates = currentState.players.filter(p => 
        p.tid === team.id && 
        p.internalId !== player.internalId &&
        !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa'].includes(p.status || '')
    );
    const prompt = generateFreeAgentSigningPrompt(player, team, previousTeamName, previousLeague, leagueContext, teammates);

    try {
        const response = await generateContentWithRetry({
            model: SettingsManager.getModelForTask('content'),
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                responseMimeType: "application/json",
                responseSchema: OUTCOME_SCHEMA as any,
                maxOutputTokens: SettingsManager.getMaxTokens(4096),
            },
        });

        const text = response.text;
        if (!text) throw new Error("No response from LLM");
        // Strip markdown wrappers and repair truncated JSON (same approach as simulation.ts)
        const cleaned = text
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/```\s*$/im, '')
            .trim();
        let repaired = cleaned;
        // Close any unclosed braces/brackets
        let ob = 0, ob2 = 0, inStr = false, esc = false;
        for (const c of repaired) {
            if (esc) { esc = false; continue; }
            if (c === '\\' && inStr) { esc = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (c === '{') ob++; if (c === '}') ob--;
            if (c === '[') ob2++; if (c === ']') ob2--;
        }
        if (inStr) repaired += '"';
        while (ob2 > 0) { repaired += ']'; ob2--; }
        while (ob > 0) { repaired += '}'; ob--; }
        const data = JSON.parse(repaired);

        // Post-process avatars
        const avatars = await fetchAvatarData();
        if (data.newSocialPosts) {
            data.newSocialPosts = data.newSocialPosts.map((post: any) => ({
                ...post,
                playerPortraitUrl: getAvatarByHandle(post.handle, avatars) || post.playerPortraitUrl
            }));
        }
        if (data.newEmails) {
            data.newEmails = data.newEmails.map((email: any) => ({
                ...email,
                playerPortraitUrl: email.playerPortraitUrl || getAvatarByHandle(email.sender, avatars)
            }));
        }

        return data;
    } catch (error) {
        console.error("Error generating free agent signing reactions:", error);
        return { newEmails: [], newNews: [], newSocialPosts: [] };
    }
}
