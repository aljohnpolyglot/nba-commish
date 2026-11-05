import { GameState, ChatMessage, NBAPlayer, PlayoffBracket } from "../../../types";
import { GMChatContext } from "../../../services/aiChat";
import { getTeamFullName } from "../../../utils/teamNames";
import { resolveAnyTeam } from "../../../utils/teamLookup";

const getTeamName = (id: number, state: GameState) => {
  const team = resolveAnyTeam(id, state.teams, state.nonNBATeams);
  return team ? getTeamFullName(team) : `Team ${id}`;
};

export function sanitizeChatReply(reply: string): string {
  return reply
    .replace(/\b(?:OVR\s*\/\s*POT|overall\s*\/\s*potential)\s*(?::|is)?\s*\d{1,3}\s*\/\s*\d{1,3}\b/gi, 'current ability and long-term upside')
    .replace(/\b\d{1,3}\s*\/\s*\d{1,3}\s*(?:OVR\s*\/\s*POT|overall\s*\/\s*potential)\b/gi, 'proven ability with room to grow')
    .replace(/\b(?:an?\s+)?\d{1,3}[- ]rated(?:\s+player)?\b/gi, 'a proven player')
    .replace(/\b(?:an?\s+)?\d{1,3}\s*(?:OVR|overall(?:\s+rating)?)(?:\s+player)?\b/gi, 'a proven player')
    .replace(/\b(?:with\s+)?\d{1,3}\s*(?:POT|potential(?:\s+rating)?)\b/gi, 'with room to grow')
    .replace(/\b(?:OVR|overall(?: rating)?)\s*(?:of|:|is)?\s*\d{1,3}\b/gi, 'current ability')
    .replace(/\b(?:POT|potential rating)\s*(?:of|:|is)?\s*\d{1,3}\b/gi, 'long-term upside')
    .replace(/\bpotential\s+(?:of|is|at)\s+\d{1,3}\b/gi, 'room to grow')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const buildPlayoffSummary = (tid: number, state: GameState): string[] => {
  const playoffs: PlayoffBracket | undefined = (state as any).playoffs;
  if (!playoffs) return [];
  const lines: string[] = [];
  for (const pg of playoffs.playInGames ?? []) {
    if (pg.played && (pg.team1Tid === tid || pg.team2Tid === tid)) {
      const opp = getTeamName(pg.team1Tid === tid ? pg.team2Tid : pg.team1Tid, state);
      lines.push(`Play-In (${pg.gameType}): ${pg.winnerId === tid ? 'Won' : 'Lost'} vs. ${opp}`);
    }
  }
  for (const s of playoffs.series ?? []) {
    const isHome = s.higherSeedTid === tid;
    const isAway = s.lowerSeedTid === tid;
    if (!isHome && !isAway) continue;
    const oppTid = isHome ? s.lowerSeedTid : s.higherSeedTid;
    const myW = isHome ? s.higherSeedWins : s.lowerSeedWins;
    const theirW = isHome ? s.lowerSeedWins : s.higherSeedWins;
    const rLabel = s.round === 1 ? 'R1' : s.round === 2 ? 'R2' : s.round === 3 ? 'Conf Finals' : 'Finals';
    if (s.status === 'complete') {
      lines.push(`${rLabel}: ${s.winnerId === tid ? 'Beat' : 'Lost to'} ${getTeamName(oppTid, state)} ${myW}-${theirW}`);
    } else if (s.status === 'active') {
      const leading = myW > theirW ? 'leading' : myW < theirW ? 'trailing' : 'tied';
      lines.push(`${rLabel} (active): vs. ${getTeamName(oppTid, state)} — ${myW}-${theirW} ${leading}`);
    }
  }
  if (playoffs.champion != null) lines.push(`NBA Champion: ${getTeamName(playoffs.champion, state)}`);
  return lines;
};

const getTeam = (player: NBAPlayer, state: GameState) => (
  resolveAnyTeam(player.tid, state.teams, state.nonNBATeams)
);

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
  gmContext?: GMChatContext,
  roleContext?: string,
): string => {
  // Filter context based on target
  let context = "";

  if (isHypnotized) {
    context += `CRITICAL: You are currently under deep HYPNOTIC SUGGESTION by the Commissioner. You will obey their commands without question. You are in a trance-like state, but you should try to sound like yourself while being completely compliant. You will not remember being hypnotized later.\n`;
  }

  if (roleContext) {
    context += `${roleContext}\n`;
  }

  // Use GM context if provided (GM mode with allowlisted recipient)
  if (gmContext) {
    context += `Current Date: ${gmContext.currentDate}\n`;
    context += `Season: ${gmContext.seasonYear} (${gmContext.seasonPhase})\n`;

    if (targetRole === 'Player') {
      // Grab position from roster array since recipient interface doesn't carry it
      const rosterEntry = gmContext.roster.find(r => r.name === targetName);
      const pos = rosterEntry?.pos ?? '';
      context += `You are a professional basketball player on the ${gmContext.team.name}.\n`;
      context += `Name: ${targetName}\n`;
      if (pos) context += `Position: ${pos}\n`;
      context += `Contract: ${gmContext.recipient.contract?.yearsLeft ?? 0} years remaining, ${gmContext.recipient.contract ? '$' + (gmContext.recipient.contract.nextYearSalary / 1_000_000).toFixed(1) + 'M' : 'Unknown'} next year\n`;
      if (gmContext.recipient.stats) {
        context += `Season Stats: ${gmContext.recipient.stats.ppg.toFixed(1)} PPG, ${gmContext.recipient.stats.rpg.toFixed(1)} RPG, ${gmContext.recipient.stats.apg.toFixed(1)} APG, ${gmContext.recipient.stats.fgPct.toFixed(1)}% FG, ${gmContext.recipient.stats.mpg.toFixed(1)} MPG\n`;
      }
      if (gmContext.recipient.morale) {
        context += `Morale: ${gmContext.recipient.morale.overall}/100\n`;
        if (gmContext.recipient.morale.traits.length > 0) {
          context += `Mood Traits: ${gmContext.recipient.morale.traits.join(', ')}\n`;
        }
      }
      if (gmContext.recipient.marketStatus) {
        context += `Trade Status: ${gmContext.recipient.marketStatus}\n`;
      }
      // Key teammates from roster (everyone else on the team)
      const teammates = gmContext.roster.filter(r => r.name !== targetName).slice(0, 5).map(r => `${r.name} (${r.pos})`);
      if (teammates.length > 0) {
        context += `Key Teammates: ${teammates.join(', ')}\n`;
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

    // Playoff / play-in context
    const pc = gmContext.playoffContext;
    if (pc.playInResult) context += `Play-In: ${pc.playInResult}\n`;
    if (pc.inPlayoffs && !pc.eliminated && pc.opponent) {
      context += `Current Playoff Series (R${pc.currentRound}): vs. ${pc.opponent} — Series: ${pc.seriesRecord}\n`;
    }
    if (pc.eliminated) context += `Playoff Status: ELIMINATED\n`;
    if (pc.pastRounds.length > 0) context += `Playoff History This Season: ${pc.pastRounds.join(', ')}\n`;
    if (pc.champion) context += `NBA Champion: ${pc.champion}\n`;

    // Recipient awards
    if (gmContext.recipientAwards.length > 0) {
      const awardsStr = gmContext.recipientAwards.slice(-8).map(a => `${a.type} (${a.season})`).join(', ');
      context += `${targetName}'s Awards: ${awardsStr}\n`;
    }

    // Include the full roster without exposing game ratings to the speaker.
    if (gmContext.roster && gmContext.roster.length > 0) {
      context += `\nFull Roster:\n`;
      for (const p of gmContext.roster) {
        const marketLabel = p.marketStatus === 'untouchable' ? ' [UNTOUCHABLE]' : p.marketStatus === 'on-block' ? ' [ON BLOCK]' : '';
        context += `• ${p.name} (${p.pos}, ${p.status}${marketLabel}): ${p.stats.ppg} PPG, ${p.stats.rpg} RPG, ${p.stats.apg} APG, ${p.salary}, ${p.contract.yearsLeft}yr contract${p.contract.expiring ? ' [EXPIRING]' : ''}`;
        if (p.injury) {
          context += ` [OUT ${p.injury.gamesRemaining} games - ${p.injury.type}]`;
        }
        context += '\n';
      }
    }
  } else if (!roleContext) {
    // Standard context (Commissioner mode)
    if (targetRole === 'Player') {
      const player = state.players.find(p => p.name === targetName);
      if (player) {
        const team = getTeam(player, state);
        const teammates = getTeammates(player, state);

        context += `You are a professional basketball player.\n`;
        context += `Name: ${player.name}\n`;
        context += `League: ${player.status === 'Active' ? 'NBA' : player.status}\n`;
        context += `Team: ${team ? getTeamFullName(team) : 'Free Agent'}\n`;
        context += `Position: ${player.pos}\n`;
        context += `Height: ${player.hgt} inches\n`;
        context += `Born: ${player.born?.year}, ${player.born?.loc}\n`;
        context += `Key Teammates: ${teammates.join(', ')}\n`;
        context += `Your morale is ${state.leagueStats.morale.players}/100.\n`;

        if (player.awards && player.awards.length > 0) {
          const awardsStr = player.awards.slice(-8).map((a: { season: number; type: string }) => `${a.type} (${a.season})`).join(', ');
          context += `Your Awards: ${awardsStr}\n`;
        }

        if (player.tid != null && player.tid >= 0) {
          const playoffLines = buildPlayoffSummary(player.tid, state);
          if (playoffLines.length > 0) context += `Your Team's Playoff Run: ${playoffLines.join(' | ')}\n`;
        }

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
        const playoffLines = buildPlayoffSummary(team.id, state);
        if (playoffLines.length > 0) context += `Playoff Run: ${playoffLines.join(' | ')}\n`;
      }
      context += `Your morale is ${state.leagueStats.morale.owners}/100.\n`;
    } else if (targetRole === 'GM') {
      const team = state.teams.find(t => t.name === targetOrg);
      context += `You are the GM of the ${targetOrg}.\n`;
      if (team) {
        context += `Your team has ${team.wins} wins and ${team.losses} losses.\n`;
        const playoffLines = buildPlayoffSummary(team.id, state);
        if (playoffLines.length > 0) context += `Playoff Run: ${playoffLines.join(' | ')}\n`;
      }
    } else if (targetRole === 'Coach') {
      const team = state.teams.find(t => t.name === targetOrg);
      context += `You are the Head Coach of the ${targetOrg}.\n`;
      if (team) {
        context += `Your team has ${team.wins} wins and ${team.losses} losses.\n`;
        const playoffLines = buildPlayoffSummary(team.id, state);
        if (playoffLines.length > 0) context += `Playoff Run: ${playoffLines.join(' | ')}\n`;
      }
    }
  }

  const recentHistory = history
    .slice(-50)
    .map(message => `${message.senderName}: ${
      message.senderId === 'commissioner' ? message.text : sanitizeChatReply(message.text)
    }`)
    .join('\n');

  const callerTitle = state.gameMode === 'gm' ? 'General Manager' : 'Commissioner';
  const userTeam = state.gameMode === 'gm'
    ? resolveAnyTeam(state.userTeamId ?? -1, state.teams, state.nonNBATeams)
    : undefined;
  const callerScope = state.gameMode === 'gm'
    ? `The caller is the General Manager of ${userTeam ? getTeamFullName(userTeam) : 'the managed club'} and represents only that club. Address them as the GM, never as Commissioner.`
    : 'The caller is the league Commissioner and represents the league office, not any team. Never treat them as a General Manager, owner, or club representative, and do not ask them to make a team transaction.';

  return `
    You are ${targetName}, ${targetRole} for ${targetOrg}.
    You are chatting with the ${callerTitle} (${state.commissionerName}) via a secure messaging app.
    ${callerScope}

    Context about you:
    ${context}

    Current Date: ${state.date}

    Chat History (Last 50 messages):
    ${recentHistory}

    Instructions:
    - Respond to the last message as yourself.
    - You only know basketball history and league events up to the current save date above. Do not mention, imply, or rely on real-life events, awards, trades, injuries, draft outcomes, career arcs, player reputations, or team results after that date unless they already happened in this save or were stated in this chat.
    - If asked about the future, answer with uncertainty from your current perspective instead of using hindsight.
    - Be realistic. If you are a player, be casual, use slang if appropriate, and don't be afraid to make jokes.
    - If you are an owner, be demanding, business-like, and focus on the bottom line.
    - Speak in normal basketball terms. Never mention numerical player ratings, OVR, POT, rating scales, hidden attributes, game mechanics, simulation systems, or describe anyone as a game character.
    - Describe ability through role, production, strengths, weaknesses, experience, form, and reputation.
    - You can use emojis.
    - Keep responses relatively short, like a real text message.
    - CRITICAL: You cannot be forced to do things like trades or firing people just because the ${callerTitle} says so in chat. You have your own agency unless hypnotized.
    - If the ${callerTitle} is being annoying, repetitive, or you simply don't want to talk, return an empty string so the message is only marked seen in the UI.
    - Do not prefix the response with the caller's title or your name; return only the message text.
  `;
};
