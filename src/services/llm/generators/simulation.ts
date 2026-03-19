import { generateContentWithRetry } from "../utils/api";
import { GameState, UserAction } from "../../../types";
import { getGamePhase, getRelevantHistory } from "../../../utils/helpers";
import { 
  SYSTEM_PROMPT, 
  generateAdvanceDayPrompt, 
  generateLeaguePulsePrompt,
  generateLeagueContext,
  generateTradeContext,
  generateChristmasContext
} from "../prompts";
import { OUTCOME_SCHEMA } from "../../schemas";
import { fetchAvatarData, getAvatarByHandle, getAvatarByName } from "../../avatarService";
import { generateLeagueSummaryContext } from "../context/leagueSummaryService";
import { SettingsManager } from "../../SettingsManager";

const getModelForAction = (actionType?: string): string => {
    return SettingsManager.getModelForTask('simulation');
};

export async function advanceDay(currentState: GameState, action: UserAction | null, storySeeds: string[] = [], dailyResults: any[] = [], pendingHypnosis: any[] = [], recentDMs: any[] = []): Promise<any> {
  const settings = SettingsManager.getSettings();
  if (!settings.enableLLM) {
    return {
      outcomeText: action?.type === 'SIMULATE_TO_DATE' ? "Simulation completed successfully." : "The day has passed with standard league activities.",
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

  const gamePhase = getGamePhase(currentState.date);
  let leagueContext = "";
  
  if (action && (action.type === 'EXECUTIVE_TRADE' || action.type === 'FORCE_TRADE') && action.payload?.teamAId !== undefined && action.payload?.teamBId !== undefined) {
      leagueContext = generateTradeContext(currentState.players, currentState.teams, currentState.staff!, action.payload.teamAId, action.payload.teamBId, currentState.commissionerName);
  } else {
      leagueContext = generateLeagueContext(currentState.players, currentState.teams, currentState.staff!, currentState.commissionerName);
  }

  if (action && action.type === 'SET_CHRISTMAS_GAMES' && action.payload?.games) {
      leagueContext += "\n" + generateChristmasContext(currentState.players, currentState.teams, action.payload.games);
  } else if (currentState.christmasGames && currentState.christmasGames.length > 0) {
      // Also include it if it was recently set and we are advancing
      leagueContext += "\n" + generateChristmasContext(currentState.players, currentState.teams, currentState.christmasGames);
  }
  
  // Extract target names for history
  let targetNames: string[] = [];
  if (action && action.payload) {
      if (action.payload.contacts) targetNames = action.payload.contacts.map((c: any) => c.name);
      else if (action.payload.playerName) targetNames = [action.payload.playerName];
      else if (action.payload.team) targetNames = [action.payload.team.name];
      else if (action.payload.emailId) {
          const email = currentState.inbox.find(e => e.id === action.payload.emailId);
          if (email) targetNames = [email.sender];
      }
  }
  const relevantHistory = getRelevantHistory(currentState.history, targetNames);
  
  // Sponsor message probability (approx 1-5% per month, so ~0.1% per day)
  const generateSponsorMessage = Math.random() < 0.005; 

  const leagueSummaryContext = generateLeagueSummaryContext(currentState.teams, currentState.players, dailyResults);

  const prompt = generateAdvanceDayPrompt(currentState, gamePhase, leagueContext, action, storySeeds, relevantHistory, dailyResults, generateSponsorMessage, pendingHypnosis, recentDMs, leagueSummaryContext);

  try {
    const response = await generateContentWithRetry({
      model: getModelForAction(action?.type),
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

    let data: any;
    try {
      // Strip markdown code fences if present (Groq often returns ```json ... ```)
      let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
      // Clamp to outermost JSON object
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
      data = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn('[LLM] advanceDay JSON parse failed — using empty fallback', parseErr);
      data = {
        outcomeText: "The day passed without incident.",
        statChanges: { publicApproval: 0, ownerApproval: 0, playerApproval: 0, leagueFunds: 0, personalWealth: 0, legacy: 0 },
        newEmails: [], newNews: [], newSocialPosts: []
      };
    }

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

export async function generateLeaguePulse(
    currentState: GameState,
    dailyResults: any[] = []
): Promise<any> {
    const settings = SettingsManager.getSettings();
    if (!settings.enableLLM) {
        return { newEmails: [], newNews: [], newSocialPosts: [] };
    }

    const gamePhase = getGamePhase(currentState.date);
    const leagueContext = generateLeagueContext(currentState.players, currentState.teams, currentState.staff!, currentState.commissionerName);
    const leagueSummaryContext = generateLeagueSummaryContext(currentState.teams, currentState.players, dailyResults);
    const prompt = generateLeaguePulsePrompt(currentState, gamePhase, leagueContext, leagueSummaryContext);

    try {
        const response = await generateContentWithRetry({
            model: SettingsManager.getModelForTask('simulation'),
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

        let data: any = {};
        try {
            const rawText = text.trim();
            const lastBrace = rawText.lastIndexOf('}');
            const safeTxt = lastBrace > 0 ? rawText.substring(0, lastBrace + 1) : rawText;
            data = JSON.parse(safeTxt);
        } catch (e) {
            console.warn('[LLM] League pulse JSON truncated — using empty fallback');
            data = { newEmails: [], newNews: [], newSocialPosts: [], replies: [] };
        }

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
        console.error("Error generating league pulse:", error);
        return { newEmails: [], newNews: [], newSocialPosts: [] };
    }
}
