import { GameState, ChatMessage, NBAPlayer } from "../../../types";
import { GMChatContext } from "../../../services/aiChat";

const getTeam = (player: NBAPlayer, state: GameState) => {
    if (player.status === 'PBA') return state.nonNBATeams.find(t => t.league === 'PBA' && t.tid === player.tid);
    if (player.status === 'WNBA') return state.nonNBATeams.find(t => t.league === 'WNBA' && t.tid === player.tid);
    if (player.status === 'Euroleague') return state.nonNBATeams.find(t => t.league === 'Euroleague' && t.tid === player.tid);
    return state.teams.find(t => t.id === player.tid);
}

const getTeammates = (player: NBAPlayer, state: GameState) => {
    return state.players
        .filter(p => p.tid === player.tid && p.status === player.status && p.internalId !== player.internalId && !p.diedYear && !p.hof)
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
  isHypnotized: boolean = false,
  gmContext?: GMChatContext
): string => {
  // Filter context based on target
  let context = "";

  if (isHypnotized) {
    context += `CRITICAL: You are currently under deep HYPNOTIC SUGGESTION by the Commissioner. You will obey their commands without question. You are in a trance-like state, but you should try to sound like yourself while being completely compliant. You will not remember being hypnotized later.\n`;
  }

  // Use GM context if provided (GM mode with allowlisted recipient)
  if (gmContext) {
    context += `Current Date: ${gmContext.currentDate}\n`;
    context += `Season: ${gmContext.seasonYear} (${gmContext.seasonPhase})\n`;

    if (targetRole === 'Player') {
      context += `You are a professional basketball player on the ${gmContext.team.name}.\n`;
      context += `Name: ${targetName}\n`;
      context += `Position: Player\n`;
      context += `Contract: ${gmContext.recipient.contract?.yearsLeft ?? 0} years remaining, ${gmContext.recipient.contract ? '$' + (gmContext.recipient.contract.nextYearSalary / 1_000_000).toFixed(1) + 'M' : 'Unknown'} next year\n`;
      if (gmContext.recipient.stats) {
        context += `Season Stats: ${gmContext.recipient.stats.ppg} PPG, ${gmContext.recipient.stats.rpg} RPG, ${gmContext.recipient.stats.apg} APG\n`;
      }
      if (gmContext.recipient.morale) {
        context += `Morale: ${gmContext.recipient.morale.overall}/100\n`;
        if (gmContext.recipient.morale.traits.length > 0) {
          context += `Mood Traits: ${gmContext.recipient.morale.traits.join(', ')}\n`;
        }
      }
    } else if (targetRole === 'Owner') {
      context += `You are the owner of the ${gmContext.team.name}.\n`;
      context += `Team Record: ${gmContext.team.wins}-${gmContext.team.losses}\n`;
      context += `Payroll: $${(gmContext.payroll.total / 1_000_000).toFixed(1)}M total, ${(gmContext.payroll.capRoom / 1_000_000).toFixed(1)}M cap room\n`;
      context += `Status: ${gmContext.payroll.apronStatus}\n`;
    } else if (targetRole === 'Coach') {
      context += `You are the Head Coach of the ${gmContext.team.name}.\n`;
      context += `Team Record: ${gmContext.team.wins}-${gmContext.team.losses}\n`;
      context += `Roster: ${gmContext.rosterSummary.standard} standard, ${gmContext.rosterSummary.twoWay} two-way, ${gmContext.rosterSummary.ng} non-guaranteed players\n`;
      context += `Avg Overall Rating: ${gmContext.rosterSummary.avgOVR}\n`;
      if (gmContext.rosterSummary.topPlayers.length > 0) {
        context += `Top Players: ${gmContext.rosterSummary.topPlayers.join(', ')}\n`;
      }
      if (gmContext.teamIntel.needPositions.length > 0) {
        context += `Positions That Need Help: ${gmContext.teamIntel.needPositions.join(', ')}\n`;
      }
    }

    if (gmContext.daysUntilTradeDeadline !== null) {
      context += `Days until Trade Deadline: ${gmContext.daysUntilTradeDeadline}\n`;
    }
    if (gmContext.recentResults.length > 0) {
      context += `Recent Results: ${gmContext.recentResults.slice(0, 3).map(r => `${r.opponent} (${r.score}) - ${r.win ? 'W' : 'L'}`).join(', ')}\n`;
    }

    // Include full roster context for richer LLM awareness
    if (gmContext.roster && gmContext.roster.length > 0) {
      context += `\nFull Roster (sorted by overall rating):\n`;
      for (const p of gmContext.roster) {
        const marketLabel = p.marketStatus === 'untouchable' ? ' [UNTOUCHABLE]' : p.marketStatus === 'on-block' ? ' [ON BLOCK]' : '';
        context += `• ${p.name} (${p.pos}, ${p.k2} OVR, ${p.status}${marketLabel}): ${p.stats.ppg} PPG, ${p.stats.rpg} RPG, ${p.stats.apg} APG, ${p.salary}, ${p.contract.yearsLeft}yr contract${p.contract.expiring ? ' [EXPIRING]' : ''}`;
        if (p.injury) {
          context += ` [OUT ${p.injury.gamesRemaining} games - ${p.injury.type}]`;
        }
        context += '\n';
      }
    }
  } else {
    // Standard context (Commissioner mode)
    if (targetRole === 'Player') {
      const player = state.players.find(p => p.name === targetName);
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
