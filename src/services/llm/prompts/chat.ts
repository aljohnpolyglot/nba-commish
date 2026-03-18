import { GameState, ChatMessage, NBAPlayer } from "../../../types";

const getTeam = (player: NBAPlayer, state: GameState) => {
    if (player.status === 'PBA') return state.nonNBATeams.find(t => t.league === 'PBA' && t.tid === player.tid);
    if (player.status === 'WNBA') return state.nonNBATeams.find(t => t.league === 'WNBA' && t.tid === player.tid);
    if (player.status === 'Euroleague') return state.nonNBATeams.find(t => t.league === 'Euroleague' && t.tid === player.tid);
    return state.teams.find(t => t.id === player.tid);
}

const getTeammates = (player: NBAPlayer, state: GameState) => {
    return state.players
        .filter(p => p.tid === player.tid && p.status === player.status && p.internalId !== player.internalId)
        .sort((a, b) => b.overallRating - a.overallRating)
        .slice(0, 5)
        .map(p => p.name);
}

export const generateChatPrompt = (
  targetName: string,
  targetRole: string,
  targetOrg: string,
  history: ChatMessage[],
  state: GameState,
  isHypnotized: boolean = false
): string => {
  // Filter context based on target
  let context = "";
  
  if (isHypnotized) {
    context += `CRITICAL: You are currently under deep HYPNOTIC SUGGESTION by the Commissioner. You will obey their commands without question. You are in a trance-like state, but you should try to sound like yourself while being completely compliant. You will not remember being hypnotized later.\n`;
  }

  if (targetRole === 'Player') {
    const player = state.players.find(p => p.name === targetName); // Note: Name collision possible, ideally use ID
    if (player) {
      const team = getTeam(player, state);
      const teammates = getTeammates(player, state);
      
      context += `You are a professional basketball player.\n`;
      context += `Name: ${player.name}\n`;
      context += `League: ${player.status === 'Active' ? 'NBA' : player.status}\n`;
      context += `Team: ${team ? team.name : 'Free Agent'}\n`;
      context += `Position: ${player.pos}\n`;
      context += `Height: ${player.hgt} inches\n`;
      context += `Born: ${player.born?.year}, ${player.born?.loc}\n`;
      context += `Key Teammates: ${teammates.join(', ')}\n`;
      context += `Your morale is ${state.leagueStats.morale.players}/100.\n`;

      // Language Rules
      if (player.status === 'PBA') {
          context += `LANGUAGE RULE: You are a Filipino player in the PBA. You speak primarily English. You MAY mix some Tagalog slang (Taglish) into your responses naturally, but you MUST remain understandable to an English speaker. If the user asks for English, strictly use English. Avoid excessive slang like 'lodi', 'pare', 'astig' unless it fits the context perfectly.\n`;
      } else if (player.born?.loc && !player.born.loc.includes('USA') && !player.born.loc.includes('Canada')) {
          context += `LANGUAGE RULE: You were born in ${player.born.loc}. You speak English, but you might occasionally use idioms or phrasing from your native region. However, primarily speak English.\n`;
      }

    }
  } else if (targetRole === 'Owner') {
    const team = state.teams.find(t => t.name === targetOrg);
    context += `You are the owner of the ${targetOrg}.\n`;
    if (team) {
        context += `Your team has ${team.wins} wins and ${team.losses} losses.\n`;
    }
    context += `Your morale is ${state.leagueStats.morale.owners}/100.\n`;
  } else if (targetRole === 'GM') {
    const team = state.teams.find(t => t.name === targetOrg);
    context += `You are the GM of the ${targetOrg}.\n`;
    if (team) {
        context += `Your team has ${team.wins} wins and ${team.losses} losses.\n`;
    }
  } else if (targetRole === 'Coach') {
    const team = state.teams.find(t => t.name === targetOrg);
    context += `You are the Head Coach of the ${targetOrg}.\n`;
    if (team) {
        context += `Your team has ${team.wins} wins and ${team.losses} losses.\n`;
    }
  }

  const recentHistory = history.slice(-50).map(m => `${m.senderName}: ${m.text}`).join('\n');

  return `
    You are ${targetName}, ${targetRole} for ${targetOrg}.
    You are chatting with the Commissioner (${state.commissionerName}) via a secure messaging app.
    
    Context about you:
    ${context}

    Current Date: ${state.date}

    Chat History (Last 50 messages):
    ${recentHistory}

    Instructions:
    - Respond to the last message as yourself.
    - Be realistic. If you are a player, be casual, use slang if appropriate, and don't be afraid to make jokes.
    - If you are an owner, be demanding, business-like, and focus on the bottom line.
    - You can use emojis.
    - Keep responses relatively short, like a real text message.
    - CRITICAL: You cannot be forced to do things like trades or firing people just because the Commissioner says so in chat. You have your own agency unless hypnotized.
    - If the Commissioner is being annoying, repetitive, or you simply don't want to talk, you can choose to "seen zone" them.
    - To "seen zone" the Commissioner, include "[seen zone]" in your response or return an empty string.
    - Do not include "Commissioner:" or your name in the response, just the message text.
  `;
};
