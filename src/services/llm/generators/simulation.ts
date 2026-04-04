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
import { generateLeagueSummaryContext, generateStaffContext } from "../context/leagueSummaryService";
import { SettingsManager } from "../../SettingsManager";

function normalizeResult(parsed: any): any {
  // News normalization
  const rawNews = parsed.newNews || parsed.news || parsed.newsItems || [];
  parsed.newNews = rawNews.map((n: any) => ({
    ...n,
    headline: n.headline || n.title || n.header || 'League Update',
    content: n.content || n.article || n.body || n.text || n.summary || '',
    date: n.date || '',
    type: n.type || 'league',
    read: false,
    isNew: true,
  }));

  // Social posts normalization
  const rawPosts = parsed.newSocialPosts || parsed.socialPosts ||
                   parsed.posts || parsed.tweets || parsed.social || [];
  parsed.newSocialPosts = rawPosts.map((p: any) => ({
    ...p,
    author: p.author || p.name || p.handle || 'NBA',
    handle: p.handle || p.username || p.author || '@NBA',
    content: p.content || p.text || p.tweet || p.message || '',
    likes: p.likes || Math.floor(Math.random() * 5000),
    retweets: p.retweets || Math.floor(Math.random() * 1000),
    source: p.source || 'TwitterX',
    isNew: true,
  }));

  // Emails normalization
  const rawEmails = parsed.newEmails || parsed.emails ||
                    parsed.inbox || parsed.messages || [];
  parsed.newEmails = rawEmails.map((e: any) => ({
    ...e,
    sender: e.sender || e.from || e.name || 'NBA Office',
    senderRole: e.senderRole || e.role || e.title || 'Executive',
    subject: e.subject || e.title || e.headline || 'League Update',
    body: e.body || e.content || e.text || e.message || '',
    read: false,
    replied: false,
  }));

  // Outcome/narrative normalization
  parsed.narrative = parsed.narrative || parsed.outcome ||
                     parsed.story || parsed.summary ||
                     parsed.result || '';

  // Stat changes normalization
  parsed.statChanges = parsed.statChanges || parsed.stats ||
                       parsed.changes || {};

  const sc = parsed.statChanges;
  parsed.statChanges = {
    publicApproval: sc.publicApproval ?? sc.public ?? sc.fanApproval ?? sc.fans ?? 0,
    ownerApproval:  sc.ownerApproval  ?? sc.owners ?? sc.owner ?? 0,
    playerApproval: sc.playerApproval ?? sc.players ?? sc.player ?? 0,
    leagueFunds:    sc.leagueFunds    ?? sc.funds ?? sc.revenue ?? sc.money ?? 0,
    personalWealth: sc.personalWealth ?? sc.wealth ?? sc.personal ?? 0,
    legacy:         sc.legacy         ?? sc.rep ?? sc.reputation ?? 0,
  };

  return parsed;
}

function repairTruncatedJson(str: string): string {
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && inString) { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') openBraces++;
    if (c === '}') openBraces--;
    if (c === '[') openBrackets++;
    if (c === ']') openBrackets--;
  }

  if (inString) str += '"';
  while (openBrackets > 0) { str += ']'; openBrackets--; }
  while (openBraces > 0) { str += '}'; openBraces--; }

  return str;
}

function cleanLLMJson(raw: string): string {
  if (!raw || typeof raw !== 'string') return '{}';
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')  // strip thinking tags
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/im, '')
    .replace(/^#+\s+.+$/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .trim();
}

const getModelForAction = (actionType?: string): string => {
    return SettingsManager.getModelForTask('simulation');
};

export async function advanceDay(currentState: GameState, action: UserAction | null, storySeeds: string[] = [], dailyResults: any[] = [], pendingHypnosis: any[] = [], recentDMs: any[] = []): Promise<any> {
  const settings = SettingsManager.getSettings();
  if (!settings.enableLLM) {
    let outcomeText = "The day has passed with standard league activities.";
    if (action?.type === 'SIMULATE_TO_DATE') {
      // Build a rich summary from dailyResults
      if (dailyResults && dailyResults.length > 0) {
        const gameCount = dailyResults.length;
        const otGames = dailyResults.filter((g: any) => g.isOT).length;
        const blowouts = dailyResults.filter((g: any) => Math.abs((g.homeScore || 0) - (g.awayScore || 0)) >= 25).length;
        const uniqueDays = new Set(dailyResults.map((g: any) => g.date)).size;

        const highlights: string[] = [];
        dailyResults.forEach((game: any) => {
          const allStats = [...(game.homeStats || []), ...(game.awayStats || [])];
          allStats.forEach((s: any) => {
            const pts = s.pts || 0;
            const reb = s.reb || 0;
            const ast = s.ast || 0;
            const isTriple = [pts, reb, ast].filter(v => v >= 10).length >= 3;
            if (pts >= 45) highlights.push(`${s.name} dropped ${pts} pts`);
            else if (isTriple) highlights.push(`${s.name} had a triple-double (${pts}/${reb}/${ast})`);
            else if (pts >= 40) highlights.push(`${s.name} scored ${pts} pts`);
            else if (reb >= 18) highlights.push(`${s.name} grabbed ${reb} rebounds`);
            else if (ast >= 15) highlights.push(`${s.name} dished ${ast} assists`);
          });
        });

        const parts: string[] = [];
        if (otGames > 0) parts.push(`${otGames} OT`);
        if (blowouts > 0) parts.push(`${blowouts} blowout${blowouts > 1 ? 's' : ''}`);
        const extra = parts.length > 0 ? ` (${parts.join(', ')})` : '';

        outcomeText = `Simulated ${uniqueDays} day${uniqueDays > 1 ? 's' : ''} — ${gameCount} game${gameCount > 1 ? 's' : ''}${extra}.`;
        if (highlights.length > 0) {
          outcomeText += ` Highlights: ${highlights.slice(0, 4).join('; ')}.`;
        }
      } else {
        outcomeText = "Simulated to target date. No games were played during this period.";
      }
    } else if (action?.payload?.outcomeText) {
      outcomeText = action.payload.outcomeText;
    } else if ((action as any)?.description) {
      outcomeText = (action as any).description;
    } else if (dailyResults && dailyResults.length > 0) {
      const gameCount = dailyResults.length;
      const otGames = dailyResults.filter((g: any) => g.isOT).length;
      const blowouts = dailyResults.filter((g: any) => Math.abs((g.homeScore || 0) - (g.awayScore || 0)) >= 20).length;
      const otNote = otGames > 0 ? ` (${otGames} OT)` : '';
      const blowoutNote = blowouts > 0 ? ` — ${blowouts} blowout${blowouts > 1 ? 's' : ''}` : '';
      outcomeText = `${gameCount} game${gameCount > 1 ? 's' : ''} played today${otNote}${blowoutNote}.`;
    }
    return {
      outcomeText,
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
      // Only include Christmas context if Christmas Day (Dec 25) is still upcoming
      const now = new Date(currentState.date);
      const isBeforeChristmas = now.getMonth() < 11 || (now.getMonth() === 11 && now.getDate() <= 25);
      if (isBeforeChristmas) {
          leagueContext += "\n" + generateChristmasContext(currentState.players, currentState.teams, currentState.christmasGames);
      }
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

  const leagueSummaryContext = generateLeagueSummaryContext(currentState.teams, currentState.players, dailyResults)
      + "\n\n" + generateStaffContext(currentState);

  // Merge any queued narratives (e.g. from healPlayer) into this turn's storySeeds
  const allStorySeeds = [...storySeeds, ...(currentState.pendingNarratives || [])];

  const prompt = generateAdvanceDayPrompt(currentState, gamePhase, leagueContext, action, allStorySeeds, relevantHistory, dailyResults, generateSponsorMessage, pendingHypnosis, recentDMs, leagueSummaryContext);

  try {
    const response = await generateContentWithRetry({
      model: getModelForAction(action?.type),
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: OUTCOME_SCHEMA as any,
        maxOutputTokens: SettingsManager.getMaxTokens(7000),
      },
    });

    const text = response.text;
    if (!text) {
      console.warn('[LLM] Empty response — using fallback');
      return {
        outcomeText: "The action was carried out quietly behind closed doors.",
        narrative: "The Commissioner's decision was made discreetly.",
        statChanges: { publicApproval: 0, ownerApproval: 0, playerApproval: 0, legacy: 0 },
        newEmails: [], newNews: [], newSocialPosts: []
      };
    }

    let data: any;
    try {
      const cleaned = cleanLLMJson(text);
      console.log('[LLM] Raw response preview:', cleaned.substring(0, 200));
      const repaired = repairTruncatedJson(cleaned);
      data = normalizeResult(JSON.parse(repaired));
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

    // Clear consumed pendingNarratives so they don't replay next turn
    if ((currentState.pendingNarratives || []).length > 0) {
      data.pendingNarratives = [];
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
                maxOutputTokens: SettingsManager.getMaxTokens(6000),
            },
        });

        const text = response.text;
        if (!text) {
            console.warn('[LLM] Empty response — using fallback');
            return { newEmails: [], newNews: [], newSocialPosts: [], replies: [] };
        }

        let data: any = {};
        try {
            const cleaned = cleanLLMJson(text);
            const repaired = repairTruncatedJson(cleaned);
            data = normalizeResult(JSON.parse(repaired));
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
