import { generateContentWithRetry, ThinkingLevel } from "../utils/api";
import { GameState, SocialPost, ChatMessage } from "../../../types";
import { getRelevantHistory } from "../../../utils/helpers";
import {
  SYSTEM_PROMPT,
  generateDirectMessagePrompt,
  generateSocialThreadPrompt,
  generateLeagueContext,
  generateChatPrompt,
  sanitizeChatReply,
} from "../prompts";
import { OUTCOME_SCHEMA, SOCIAL_THREAD_SCHEMA } from "../../schemas";
import { fetchAvatarData, getAvatarByHandle, getAvatarByName } from "../../avatarService";
import { SettingsManager } from "../../SettingsManager";
import { buildGMChatContext } from "../../aiChat";
import {
  buildManagedStaffChatContext,
  findManagedStaffMember,
  getManagedStaffFallbackReply,
} from "../staffChatContext";
import {
  buildPlayerChatContext,
  findChatPlayer,
  findManagedChatPlayer,
} from "../playerChatContext";
import {
  buildFreeAgentAgentChatContext,
  buildFreeAgentAgentGMSystemInstruction,
  appendFreeAgentAgentGrounding,
  findFreeAgentForAgentChat,
  getFreeAgentAgentFactualReply,
} from "../freeAgentAgentChatContext";

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

function needsFactualStaffFallback(message: string, reply: string): boolean {
  if (!/\?|who|what|where|when|how|report|assignment|mission|available|injur|medical|academy|youth|roster|fixture|schedule|result|status|focus|develop/i.test(message)) return false;
  return /^(?:thanks(?: for (?:the|your) message)?|thank you|i appreciate that|message received|got it)[.!]*$/i.test(reply.trim());
}

export function isGenericAcknowledgement(reply: string): boolean {
  return /^(?:thanks(?: for (?:the|your) message| for reaching out)?|thank you|i appreciate that|message received|got it)[.!]*$/i.test(reply.trim());
}

function normalizeChatRole(role: string): string {
  const label = role.split('•', 1)[0].trim();
  if (/^(?:player|retired player|hall of famer|prospect)$/i.test(label)) return 'Player';
  if (/coach$/i.test(label)) return 'Coach';
  if (/^owner$/i.test(label)) return 'Owner';
  if (/^(?:referee|league referee|league official)$/i.test(label)) return 'Referee';
  return label;
}

export async function sendChatMessage(
  state: GameState,
  targetName: string,
  targetRole: string,
  targetOrg: string,
  history: ChatMessage[],
  isHypnotized: boolean = false,
  recipientId?: string
): Promise<string> {
  const canonicalRole = normalizeChatRole(targetRole);
  const freeAgentPlayer = findFreeAgentForAgentChat(state, recipientId);
  const factualAgentReply = freeAgentPlayer
    ? getFreeAgentAgentFactualReply(freeAgentPlayer, history.at(-1)?.text ?? '')
    : null;
  if (factualAgentReply) return factualAgentReply;

  if (state.gameMode === 'gm' && recipientId) {
    const managedStaff = canonicalRole === 'Player'
      ? undefined
      : findManagedStaffMember(state, recipientId, targetName);
    const managedPlayer = canonicalRole === 'Player'
      ? findManagedChatPlayer(state, recipientId, targetName)
      : null;
    try {
      const contextRecipientId = managedPlayer?.internalId ?? freeAgentPlayer?.internalId ?? recipientId;
      const hasNativeUserTeam = state.teams.some(team => team.id === state.userTeamId);
      const gmContext = managedStaff || managedPlayer || !hasNativeUserTeam
        ? undefined
        : buildGMChatContext(state, contextRecipientId);
      const roleContext = managedStaff
        ? buildManagedStaffChatContext(state, managedStaff)
        : freeAgentPlayer
          ? buildFreeAgentAgentChatContext(state, freeAgentPlayer)
        : managedPlayer
          ? buildPlayerChatContext(state, managedPlayer)
          : undefined;
      const basePrompt = generateChatPrompt(targetName, canonicalRole, targetOrg, history, state, isHypnotized, gmContext, roleContext);
      const prompt = freeAgentPlayer && roleContext
        ? appendFreeAgentAgentGrounding(basePrompt, roleContext)
        : basePrompt;

      let contents: any = prompt;

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

      const gmName = state.commissionerName || 'the GM';
      const response = await generateContentWithRetry({
        model: SettingsManager.getModelForTask('interaction'),
        contents: contents,
        config: {
          systemInstruction: freeAgentPlayer
            ? buildFreeAgentAgentGMSystemInstruction(state, freeAgentPlayer, gmName)
            : `You are a realistic basketball personality chatting with ${gmName}, the managed club's General Manager. Do not call them Commissioner. Be concise and conversational. Use only the provided facts for informed, specific replies, and never mention numerical ratings, OVR, POT, rating scales, game mechanics, or simulation terminology.`,
        },
      }, 2, 800, true);

      const latestMessage = history.at(-1)?.text ?? '';
      const reply = sanitizeChatReply(response.text ?? '');
      const groundedReply = managedStaff && needsFactualStaffFallback(latestMessage, reply)
        ? sanitizeChatReply(getManagedStaffFallbackReply(state, managedStaff, latestMessage))
        : reply;
      return isGenericAcknowledgement(groundedReply) ? '' : groundedReply;
    } catch (error) {
      console.error("Error generating GM chat response:", error);
      const latestMessage = history.at(-1)?.text ?? '';
      if (managedStaff) return sanitizeChatReply(getManagedStaffFallbackReply(state, managedStaff, latestMessage));
      return '';
    }
  }

  // Commissioner mode: original flow
  const player = canonicalRole === 'Player' ? findChatPlayer(state, recipientId, targetName) : null;
  const roleContext = freeAgentPlayer
    ? buildFreeAgentAgentChatContext(state, freeAgentPlayer)
    : player
      ? buildPlayerChatContext(state, player)
      : undefined;
  const prompt = generateChatPrompt(targetName, canonicalRole, targetOrg, history, state, isHypnotized, undefined, roleContext);

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
        systemInstruction: freeAgentPlayer
          ? `You are ${freeAgentPlayer.name}'s professional basketball agent chatting with the league Commissioner. The Commissioner is a neutral league official, not a General Manager, team owner, or club representative. Do not solicit, negotiate, accept, or counter a contract offer with them; club negotiations belong with team front offices. Be concise and conversational. Use normal basketball language and never mention numerical ratings, OVR, POT, rating scales, game mechanics, or simulation terminology. The supplied facts are authoritative and your words cannot create a transaction.`
          : "You are a realistic basketball personality chatting with the league Commissioner, who represents the league office rather than a club. Never treat them as a General Manager or team representative. Be concise and conversational, and never mention numerical ratings, OVR, POT, rating scales, game mechanics, or simulation terminology.",
      },
    }, 2, 800, true); // bypass enableLLM — chat always works

    const reply = sanitizeChatReply(response.text || "");
    return isGenericAcknowledgement(reply) ? '' : reply;
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
