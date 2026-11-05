import type { Chat, ChatMessage, GameState } from '../../types';
import { parseGameDate } from '../../utils/dateUtils';
import { getTeamFullName } from '../../utils/teamNames';

const CONCERNS = [
  (player: string) => `I heard you're taking calls on ${player}. Is that true? Before this goes any further, I want to understand what you believe the return would do for this team.`,
  (player: string) => `Word reached me that ${player}'s name is coming up in trade talks. That's a major decision for this franchise. Talk me through what you're considering.`,
  (player: string) => `Are we really exploring the market for ${player}? I'm not closing the door, but a move of that size needs a clear basketball case.`,
];

export function pushOwnerTradeConcern(state: GameState, playerId: string, playerName: string): GameState {
  if (state.gameMode !== 'gm' || state.userTeamId == null) return state;
  const team = state.teams.find(candidate => candidate.id === state.userTeamId);
  if (!team) return state;
  const day = parseGameDate(state.date).toISOString().slice(0, 10);
  const messageId = `owner-trade-concern:${team.id}:${playerId}:${day}`;
  if ((state.chats ?? []).some(chat => chat.messages.some(message => message.id === messageId))) return state;

  const teamName = getTeamFullName(team);
  const owner = state.staff?.owners?.find(candidate =>
    candidate.team === team.name || candidate.team === teamName || candidate.team === team.abbrev,
  ) ?? state.staff?.owners?.[0];
  const ownerId = owner?.name ?? `owner-${team.id}`;
  const priorConcernCount = (state.chats ?? []).flatMap(chat => chat.messages)
    .filter(message => message.id.startsWith(`owner-trade-concern:${team.id}:`)).length;
  const text = CONCERNS[priorConcernCount % CONCERNS.length](playerName);
  const message: ChatMessage = {
    id: messageId,
    senderId: ownerId,
    senderName: owner?.name ?? `${teamName} Ownership`,
    text,
    timestamp: parseGameDate(state.date).toISOString(),
    read: false,
    seen: false,
    type: 'text',
  };
  const chats = [...(state.chats ?? [])];
  const chatIndex = chats.findIndex(chat => chat.participants.includes('commissioner') && chat.participants.includes(ownerId));
  if (chatIndex < 0) {
    const chat: Chat = {
      id: `chat-owner-${team.id}`,
      participants: ['commissioner', ownerId],
      participantDetails: [
        { id: 'commissioner', name: state.commissionerName, role: 'General Manager' },
        {
          id: ownerId,
          name: owner?.name ?? `${teamName} Ownership`,
          role: 'Owner',
          avatarUrl: owner?.playerPortraitUrl,
          teamLogoUrl: team.logoUrl,
          organization: teamName,
        },
      ],
      messages: [message],
      lastMessage: message,
      unreadCount: 1,
      isTyping: false,
    };
    chats.unshift(chat);
  } else {
    const chat = { ...chats[chatIndex] };
    chat.messages = [...chat.messages, message].slice(-100);
    chat.lastMessage = message;
    chat.unreadCount = (chat.unreadCount ?? 0) + 1;
    chats.splice(chatIndex, 1);
    chats.unshift(chat);
  }
  return { ...state, chats };
}
