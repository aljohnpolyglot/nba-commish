import { generateContentWithRetry } from "../utils/api";
import { GameState, StaffData } from "../../../types";
import { getRelevantHistory } from "../../../utils/helpers";
import { 
  SYSTEM_PROMPT, 
  generateInitialStoryPrompt,
  generateReactionPrompt,
  generateLeagueContext
} from "../prompts";
import { OUTCOME_SCHEMA } from "../../schemas";
import { fetchAvatarData, getAvatarByHandle, getAvatarByName } from "../../avatarService";
import { SettingsManager } from "../../SettingsManager";

export async function generateInitialContent(
    date: string,
    commissionerName: string,
    players: any[],
    teams: any[],
    staff: StaffData
): Promise<any> {
    const settings = SettingsManager.getSettings();
    if (!settings.enableLLM) {
        return { newEmails: [], newNews: [], newSocialPosts: [] };
    }

    const leagueContext = generateLeagueContext(players, teams, staff, commissionerName);
    const prompt = generateInitialStoryPrompt(date, commissionerName, leagueContext);

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
                playerPortraitUrl: getAvatarByHandle(post.handle, avatars) || getAvatarByName(post.author, avatars) || post.playerPortraitUrl
            }));
        }
        if (data.newEmails) {
            data.newEmails = data.newEmails.map((email: any) => ({
                ...email,
                playerPortraitUrl: email.playerPortraitUrl || getAvatarByHandle(email.sender, avatars) || getAvatarByName(email.sender, avatars)
            }));
        }

        return data;
    } catch (error) {
        console.error("Error generating initial content:", error);
        return { newEmails: [], newNews: [], newSocialPosts: [] };
    }
}

export async function generateReactions(
    currentState: GameState,
    actionDescription: string,
    statUpdates?: any
): Promise<any> {
    const settings = SettingsManager.getSettings();
    if (!settings.enableLLM) {
        return { newEmails: [], newNews: [], newSocialPosts: [] };
    }

    const relevantHistory = getRelevantHistory(currentState.history, [actionDescription]);
    const leagueContext = generateLeagueContext(currentState.players, currentState.teams, currentState.staff!, currentState.commissionerName);
    const prompt = generateReactionPrompt(currentState, actionDescription, leagueContext, statUpdates, relevantHistory);

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
                playerPortraitUrl: getAvatarByHandle(post.handle, avatars) || getAvatarByName(post.author, avatars) || post.playerPortraitUrl
            }));
        }
        if (data.newEmails) {
            data.newEmails = data.newEmails.map((email: any) => ({
                ...email,
                playerPortraitUrl: email.playerPortraitUrl || getAvatarByHandle(email.sender, avatars) || getAvatarByName(email.sender, avatars)
            }));
        }

        return data;
    } catch (error) {
        console.error("Error generating reactions:", error);
        return { newEmails: [], newNews: [], newSocialPosts: [] };
    }
}
