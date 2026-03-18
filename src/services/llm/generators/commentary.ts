import { generateContentWithRetry } from "../utils/api";
import { SettingsManager } from "../../SettingsManager";
import { SYSTEM_PROMPT } from "../prompts";

export interface PlayContext {
  type: string;
  player: string;
  pts?: number;
  is3?: boolean;
  astPlayer?: string;
  stealer?: string;
  blocker?: string;
  rebounder?: string;
  isOffReb?: boolean;
  isMake?: boolean;
  lineup?: string[];
}

export async function generateAICommentary(play: PlayContext): Promise<string> {
  const settings = SettingsManager.getSettings();
  if (!settings.enableLLM) return "";

  const prompt = `
    Generate a short, exciting, and realistic NBA play-by-play commentary for the following play:
    ${JSON.stringify(play)}
    
    CRITICAL: 
    - Keep it under 15 words.
    - Be creative and use basketball terminology.
    - Focus on the action and the players involved.
    - Do NOT include any meta-commentary or JSON.
  `;

  try {
    const response = await generateContentWithRetry({
      model: SettingsManager.getModelForTask('simulation'),
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 50,
      },
    });

    return response.text?.trim() || "";
  } catch (error) {
    console.error("Error generating AI commentary:", error);
    return "";
  }
}

export async function generateGameAnalysis(
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  quarter: number,
  clock: string,
  recentPlays: string[]
): Promise<string> {
  const settings = SettingsManager.getSettings();
  if (!settings.enableLLM) return "AI Analysis is disabled in settings.";

  const prompt = `
    You are an expert NBA color commentator. Provide a brief (2-3 sentence) analysis of the current game state:
    
    Matchup: ${awayTeam} at ${homeTeam}
    Score: ${awayTeam} ${awayScore} - ${homeTeam} ${homeScore}
    Time: ${quarter}Q ${clock}
    
    Recent Action:
    ${recentPlays.join('\n')}
    
    CRITICAL:
    - Be insightful and energetic.
    - Focus on momentum, key performers, or tactical adjustments.
    - Do NOT include JSON or meta-commentary.
  `;

  try {
    const response = await generateContentWithRetry({
      model: SettingsManager.getModelForTask('simulation'),
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 150,
      },
    });

    return response.text?.trim() || "Unable to generate analysis at this time.";
  } catch (error) {
    console.error("Error generating game analysis:", error);
    return "AI Analysis unavailable.";
  }
}
