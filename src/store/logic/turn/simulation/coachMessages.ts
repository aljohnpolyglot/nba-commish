import { GameState } from '../../../../types';
import { parseGameDate } from '../../../../utils/dateUtils';

export function pushCoachMessage(state: GameState, messageText: string): GameState {
    if (state.gameMode !== 'gm' || !state.userTeamId) return state;

    const userTeam = state.teams.find(t => t.id === state.userTeamId);
    const coach = state.staff?.coaches.find(c => c.team === userTeam?.name);

    if (!coach) return state;

    const newChats = [...(state.chats || [])];
    const chatIndex = newChats.findIndex(
        c => c.participants.includes('commissioner') && c.participants.includes(coach.name),
    );

    const gameDate = parseGameDate(state.date);
    const timestamp = gameDate.toISOString();

    const coachMessage = {
        id: `msg-${Date.now()}`,
        senderId: coach.name,
        senderName: coach.name,
        text: messageText,
        timestamp,
        read: false,
        seen: false,
        type: 'text' as const,
    };

    if (chatIndex === -1) {
        const newChat = {
            id: `chat-coach-${state.date}`,
            participants: ['commissioner', coach.name],
            participantDetails: [
                { id: 'commissioner', name: state.commissionerName, role: 'Commissioner' },
                { id: coach.name, name: coach.name, role: 'Coach', avatarUrl: coach.playerPortraitUrl },
            ],
            messages: [coachMessage],
            lastMessage: coachMessage,
            unreadCount: 1,
            isTyping: false,
        };
        newChats.unshift(newChat);
    } else {
        const chat = { ...newChats[chatIndex] };
        chat.messages = [...chat.messages, coachMessage];
        chat.lastMessage = coachMessage;
        chat.unreadCount = (chat.unreadCount ?? 0) + 1;
        newChats.splice(chatIndex, 1);
        newChats.unshift(chat);
    }

    return { ...state, chats: newChats };
}
