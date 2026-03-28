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
        !['WNBA', 'Euroleague', 'PBA', 'B-League'].includes(p.status || '')
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
                maxOutputTokens: SettingsManager.getMaxTokens(8192),
            },
        });

        const text = response.text;
        if (!text) throw new Error("No response from LLM");
        const data = JSON.parse(text);

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
