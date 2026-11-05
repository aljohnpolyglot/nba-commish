import type { Chat, ChatMessage, GameState, NBAPlayer } from '../../types';
import { daysBetweenGameDates, parseGameDate } from '../../utils/dateUtils';
import { normalizeMoodTraits, computeMoodScore } from '../../utils/mood/moodScore';
import { getPlayerImage } from '../../utils/playerImage';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getLeagueCalendarDates } from '../leagueCalendar';
import { getSimulationSeed } from '../saveIdentity';
import { createDeterministicRandom } from '../simulation/deterministicRandom';
import { getEffectiveContractExpiryYear } from './expiringContractBoard';
import { classifyResignIntent } from './resignIntent';

const OUTREACH_WINDOW_START = 21;
const OUTREACH_WINDOW_END = 5;
const MAX_OUTREACH_PER_TEAM_SEASON = 3;

const messageTemplates = [
  `I've been thinking about what comes next. If you want me here, let's sit down and work on a deal before the season ends.`,
  `I don't want this hanging over the summer. I'm open to staying—let's see if we can get something done now.`,
  `My preference is to keep building this with you. If the front office is ready, I'm ready to talk numbers.`,
  `I wanted you to hear it from me first: I'm willing to stay. Let's find time and see if a deal makes sense for both sides.`,
  `We've got something worth continuing here. I'd rather talk with you now than let this drift into free agency.`,
  `I'm comfortable here, and my family is too. If the team sees a future together, let's start that conversation.`,
  `The year isn't over, but I know the contract question is coming. I'm open to handling it early if you are.`,
  `I like my role and I like this group. Tell my agent to expect a call if you want to work something out.`,
  `No need for a big public thing—I just wanted to say I'm open to a new deal. Let's talk when you're ready.`,
  `I want to keep the focus on basketball, so let's get ahead of the contract situation. I'm willing to negotiate.`,
  `This has felt like home. I'd like to give us a real chance to keep it that way before the market opens.`,
  `I'm not making promises without seeing the offer, but I do want to talk. Let's try to find common ground now.`,
] as const;

function alreadySent(state: GameState, playerId: string, season: number): boolean {
  const messageId = `expiring-outreach:${season}:${playerId}`;
  return state.chats.some(chat => chat.messages.some(message => message.id === messageId));
}

function appendPlayerMessage(
  state: GameState,
  player: NBAPlayer,
  teamName: string,
  teamLogoUrl: string | undefined,
  season: number,
  text: string,
): GameState {
  const message: ChatMessage = {
    id: `expiring-outreach:${season}:${player.internalId}`,
    senderId: player.internalId,
    senderName: player.name,
    text,
    timestamp: parseGameDate(state.date).toISOString(),
    read: false,
    seen: false,
    type: 'text',
  };
  const chats = [...state.chats];
  const existingIndex = chats.findIndex(chat => (
    chat.participants.includes('commissioner') && chat.participants.includes(player.internalId)
  ));
  let chat: Chat;
  if (existingIndex >= 0) {
    const existing = chats[existingIndex];
    chat = {
      ...existing,
      messages: [...existing.messages, message].slice(-100),
      lastMessage: message,
      unreadCount: (existing.unreadCount ?? 0) + 1,
      isTyping: false,
    };
    chats.splice(existingIndex, 1);
  } else {
    chat = {
      id: `chat-player-${player.internalId}`,
      participants: ['commissioner', player.internalId],
      participantDetails: [
        { id: 'commissioner', name: state.commissionerName, role: 'General Manager' },
        {
          id: player.internalId,
          name: player.name,
          role: `Player • ${teamName}`,
          organization: teamName,
          avatarUrl: getPlayerImage(player, { portraitSeason: season }),
          teamLogoUrl,
        },
      ],
      messages: [message],
      lastMessage: message,
      unreadCount: 1,
      isTyping: false,
    };
  }
  chats.unshift(chat);
  return { ...state, chats };
}

/**
 * Some willing expiring players privately open extension talks near the end of
 * the regular season. The schedule and copy are save-seeded so long sim,
 * reload, and one-day simulation produce the same outreach.
 */
export function applyExpiringPlayerOutreach(state: GameState): GameState {
  if (state.gameMode !== 'gm' || state.userTeamId == null) return state;
  const season = Number(state.leagueStats?.year);
  if (!Number.isFinite(season)) return state;
  const currentDate = parseGameDate(state.date);
  const calendar = getLeagueCalendarDates(season, state.leagueStats);
  const daysBeforeEnd = Math.round(daysBetweenGameDates(currentDate, calendar.regularSeasonEnd));
  if (daysBeforeEnd < OUTREACH_WINDOW_END || daysBeforeEnd > OUTREACH_WINDOW_START) return state;

  const team = resolveAnyTeam(state.userTeamId, state.teams, state.nonNBATeams ?? []);
  if (!team) return state;
  const teamName = getTeamFullName(team) || 'the team';
  const teamPlayers = state.players.filter(player => player.tid === state.userTeamId);
  const gamesPlayed = Number(team.wins ?? 0) + Number(team.losses ?? 0);
  const winPct = gamesPlayed > 0 ? Number(team.wins ?? 0) / gamesPlayed : 0.5;
  const saveSeed = getSimulationSeed(state);
  let nextState = state;
  let seasonOutreachCount = state.chats
    .flatMap(chat => chat.messages)
    .filter(message => message.id.startsWith(`expiring-outreach:${season}:`))
    .length;
  if (seasonOutreachCount >= MAX_OUTREACH_PER_TEAM_SEASON) return state;

  const candidates = teamPlayers
    .filter(player => getEffectiveContractExpiryYear(player, season + 1) === season)
    .filter(player => player.status !== 'Retired' && !player.diedYear)
    .sort((left, right) => left.internalId.localeCompare(right.internalId));

  for (const player of candidates) {
    if (seasonOutreachCount >= MAX_OUTREACH_PER_TEAM_SEASON) break;
    if (alreadySent(nextState, player.internalId, season)) continue;
    const traits = normalizeMoodTraits(player.moodTraits ?? []);
    const mood = computeMoodScore(player, team, state.date, false, false, false, teamPlayers, season).score;
    const intent = classifyResignIntent(player, traits, mood, season, winPct);
    if (intent !== 'ready_to_extend' && intent !== 'open') continue;

    const scheduleRandom = createDeterministicRandom(`${saveSeed}:${season}:${player.internalId}:extension-outreach`);
    const triggerDay = OUTREACH_WINDOW_END
      + Math.floor(scheduleRandom() * (OUTREACH_WINDOW_START - OUTREACH_WINDOW_END + 1));
    const selectionChance = intent === 'ready_to_extend' ? 0.72 : 0.38;
    if (scheduleRandom() >= selectionChance || daysBeforeEnd !== triggerDay) continue;
    const templateIndex = Math.floor(scheduleRandom() * messageTemplates.length) % messageTemplates.length;
    nextState = appendPlayerMessage(
      nextState,
      player,
      teamName,
      (team as { logoUrl?: string; imgURL?: string; imgURLSmall?: string }).logoUrl
        ?? (team as { imgURL?: string }).imgURL
        ?? (team as { imgURLSmall?: string }).imgURLSmall,
      season,
      messageTemplates[templateIndex],
    );
    seasonOutreachCount += 1;
  }
  return nextState;
}
