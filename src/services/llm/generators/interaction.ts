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

export async function sendChatMessage(
  state: GameState,
  targetName: string,
  targetRole: string,
  targetOrg: string,
  history: ChatMessage[],
  isHypnotized: boolean = false
): Promise<string> {
  const settings = SettingsManager.getSettings();
  if (!settings.enableLLM) {
    return "I'm sorry, I cannot respond right now as the league's AI systems are currently offline.";
  }

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
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      },
    });

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
    console.error("Error calling Gemini API:", error);
    throw error;
  }
}

export async function generateSocialThread(originalPost: SocialPost, state: GameState): Promise<SocialPost[]> {
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
    const data = JSON.parse(text);
    
    const avatars = await fetchAvatarData();
    
    return data.replies.map((reply: any) => ({
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

  } catch (error) {
    console.error("Error generating social thread:", error);
    return [];
  }
}
