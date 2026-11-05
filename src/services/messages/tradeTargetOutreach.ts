import type { Chat, ChatMessage, GameState, NBATeam } from '../../types';
import { getTradingBlock } from '../../store/tradingBlockStore';
import { parseGameDate } from '../../utils/dateUtils';
import { getPlayerImage } from '../../utils/playerImage';
import { getTeamFullName } from '../../utils/teamNames';
import { getActiveLeagueTeams } from '../../utils/teamLookup';

const MAX_PER_DAY = 2;
const MAX_PER_SEASON = 6;
const TEMPLATES = [
  (player: string) => `Just reaching out—${player} is someone we like. No formal offer yet, but we'd be interested in talking if you're open to it.`,
  (player: string) => `We've had some internal conversations about ${player}. If you ever decide to listen, give me a call.`,
  (player: string) => `${player} would fit what we're building. Nothing official—just wanted you to know there's interest on our side.`,
  (player: string) => `Friendly heads-up: ${player} is on our radar. We're happy to talk whenever it makes sense for you.`,
] as const;

const sameTeam = (value: unknown, team: NBATeam) => {
  const key = String(value ?? '').trim().toLowerCase();
  return key === String(team.name ?? '').trim().toLowerCase()
    || key === String(team.abbrev ?? '').trim().toLowerCase()
    || key === getTeamFullName(team).trim().toLowerCase();
};

/** Adds informational GM interest DMs from already-saved target lists only. */
export function applyTradeTargetOutreach(state: GameState): GameState {
  if (state.userTeamId == null || state.leagueStats?.tradesAllowed === false) return state;
  const season = Number(state.leagueStats?.year);
  if (!Number.isFinite(season)) return state;

  const prior = (state.chats ?? []).flatMap(chat => chat.messages)
    .filter(message => message.id.startsWith(`gm-trade-interest:${season}:`));
  if (prior.length >= MAX_PER_SEASON) return state;

  const userPlayers = new Map(state.players
    .filter(player => player.tid === state.userTeamId && player.status !== 'Retired' && !player.diedYear)
    .map(player => [player.internalId, player]));
  if (userPlayers.size === 0) return state;

  const teams = getActiveLeagueTeams(state)
    .filter(team => team.id !== state.userTeamId)
    .sort((left, right) => left.id - right.id);
  let next = state;
  let added = 0;

  for (const team of teams) {
    if (added >= MAX_PER_DAY || prior.length + added >= MAX_PER_SEASON) break;
    const target = getTradingBlock(team.id)?.targetIds
      .map(id => userPlayers.get(id))
      .find(Boolean);
    if (!target) continue;
    const messageId = `gm-trade-interest:${season}:${team.id}:${target.internalId}`;
    if ((next.chats ?? []).some(chat => chat.messages.some(message => message.id === messageId))) continue;

    const gm = next.staff?.gms?.find(member => sameTeam(member.team, team));
    const senderId = gm?.id ?? gm?.executiveId ?? `gm-${team.id}`;
    const senderName = gm?.name ?? `${getTeamFullName(team)} GM`;
    const message: ChatMessage = {
      id: messageId,
      senderId,
      senderName,
      text: TEMPLATES[(team.id + season) % TEMPLATES.length](target.name),
      timestamp: parseGameDate(next.date).toISOString(),
      read: false,
      seen: false,
      type: 'text',
    };
    const chats = [...(next.chats ?? [])];
    const chatIndex = chats.findIndex(chat => chat.participants.includes('commissioner') && chat.participants.includes(senderId));
    if (chatIndex >= 0) {
      const chat = chats[chatIndex];
      const updated = {
        ...chat,
        messages: [...chat.messages, message].slice(-100),
        lastMessage: message,
        unreadCount: (chat.unreadCount ?? 0) + 1,
        isTyping: false,
      };
      chats.splice(chatIndex, 1);
      chats.unshift(updated);
    } else {
      const chat: Chat = {
        id: `chat-gm-${team.id}`,
        participants: ['commissioner', senderId],
        participantDetails: [
          { id: 'commissioner', name: next.commissionerName, role: next.gameMode === 'gm' ? 'General Manager' : 'Commissioner' },
          {
            id: senderId,
            name: senderName,
            role: 'General Manager',
            organization: getTeamFullName(team),
            avatarUrl: gm?.playerPortraitUrl,
            teamLogoUrl: team.logoUrl,
          },
        ],
        messages: [message],
        lastMessage: message,
        unreadCount: 1,
        isTyping: false,
      };
      chats.unshift(chat);
    }
    next = { ...next, chats };
    added += 1;
  }

  return next;
}
