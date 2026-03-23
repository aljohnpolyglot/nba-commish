import { generateContentWithRetry, ThinkingLevel } from "../utils/api";
import { GameState, SocialPost, ChatMessage } from "../../../types";
import { getRelevantHistory } from "../../../utils/helpers";
import { 
  SYSTEM_PROMPT, 
  generateDirectMessagePrompt, 
  generateSocialThreadPrompt,
  generateLeagueContext,
  generateChatPrompt
} from "../prompts";
import { OUTCOME_SCHEMA, SOCIAL_THREAD_SCHEMA } from "../../schemas";
import { fetchAvatarData, getAvatarByHandle, getAvatarByName } from "../../avatarService";
import { SettingsManager } from "../../SettingsManager";

function cleanLLMJson(raw: string): string {
  return raw
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/im, '')
    .replace(/^#+\s+.+$/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .trim();
}

export async function sendChatMessage(
  state: GameState,
  targetName: string,
  targetRole: string,
  targetOrg: string,
  history: ChatMessage[],
  isHypnotized: boolean = false
): Promise<string> {
  const prompt = generateChatPrompt(targetName, targetRole, targetOrg, history, state, isHypnotized);

  let contents: any = prompt;
  
  // Check if the last message has an image
  const lastMessage = history[history.length - 1];
  if (lastMessage && lastMessage.imageUrl) {
    try {
      const base64Data = lastMessage.imageUrl.split(',')[1];
      const mimeType = lastMessage.imageUrl.split(';')[0].split(':')[1];
      
      contents = {
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          }
        ]
      };
    } catch (e) {
      console.error("Failed to parse image data", e);
    }
  }

  try {
    const response = await generateContentWithRetry({
      model: SettingsManager.getModelForTask('interaction'),
      contents: contents,
      config: {
        systemInstruction: "You are a realistic NBA personality chatting with the Commissioner. Be concise and conversational.",
      },
    }, 2, 800, true); // bypass enableLLM — chat always works

    return response.text || "";
  } catch (error) {
    console.error("Error generating chat response:", error);
    return "";
  }
}

export async function sendDirectMessage(
  currentState: GameState,
  targetName: string,
  targetRole: string,
  message: string
): Promise<any> {
  const settings = SettingsManager.getSettings();
  if (!settings.enableLLM) {
    return {
      outcomeText: `Message sent to ${targetName}.`,
      statChanges: {
        publicApproval: 0,
        ownerApproval: 0,
        playerApproval: 0,
        leagueFunds: 0,
        personalWealth: 0,
        legacy: 0
      },
      newEmails: [],
      newNews: [],
      newSocialPosts: []
    };
  }

  const relevantHistory = getRelevantHistory(currentState.history, [targetName]);
  const leagueContext = generateLeagueContext(currentState.players, currentState.teams, currentState.staff!, currentState.commissionerName);
  const prompt = generateDirectMessagePrompt(targetName, targetRole, message, currentState, leagueContext, relevantHistory);

  try {
    const response = await generateContentWithRetry({
      model: SettingsManager.getModelForTask('interaction'),
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: OUTCOME_SCHEMA as any,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from LLM");
    const cleaned = cleanLLMJson(text);
    const data = JSON.parse(cleaned);

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
    console.error("Error calling Gemini API:", error);
    throw error;
  }
}

export async function generateSocialThread(originalPost: SocialPost, state: GameState): Promise<SocialPost[]> {
  console.log('[generateSocialThread] called for post:', originalPost.id, originalPost.handle, originalPost.content?.slice(0, 60));
  const settings = SettingsManager.getSettings();
  if (!settings.enableLLM) {
    return [];
  }

  const prompt = generateSocialThreadPrompt(originalPost, state);

  try {
    const response = await generateContentWithRetry({
      model: SettingsManager.getModelForTask('interaction'),
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: SOCIAL_THREAD_SCHEMA as any,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from LLM");
    const cleaned = cleanLLMJson(text);
    const data = JSON.parse(cleaned);

    const avatars = await fetchAvatarData();

    const replies = data.replies.map((reply: any) => ({
        id: self.crypto.randomUUID(),
        author: reply.author,
        handle: reply.handle,
        content: reply.content,
        source: originalPost.source,
        date: new Date().toISOString(),
        likes: Math.floor(Math.random() * 500),
        retweets: Math.floor(Math.random() * 50),
        isReply: true,
        playerPortraitUrl: getAvatarByHandle(reply.handle, avatars) || getAvatarByName(reply.author, avatars)
    }));
    console.log('[generateSocialThread] returning', replies.length, 'replies');
    return replies;

  } catch (error) {
    console.error('[generateSocialThread] FAILED:', error);
    return [];
  }
}
