import React from 'react';
import { Chat } from '../../types';
import { useGame } from '../../store/GameContext';
import { formatGameRelativeDate } from '../../utils/helpers';
import { ContactAvatar } from '../common/ContactAvatar';
import { AVATAR_DATA } from '../../data/avatars';
import { getAvatarByName } from '../../services/avatarService';
import { resolveChatStaffContact } from '../../utils/chatStaffContact';
import { sanitizeChatReply } from '../../services/llm/prompts/chat';
import { displayStaffRole } from '../../services/staff/staffCareerRows';
import { resolveChatPlayerIdentity } from '../../services/messages/chatPlayerIdentity';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import type { NBAPlayer } from '../../types';

interface ChatListProps {
  chats: Chat[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  searchTerm: string;
}

export const ChatList: React.FC<ChatListProps> = ({ chats, selectedChatId, onSelectChat, searchTerm }) => {
  const { state } = useGame();

  const allContacts = React.useMemo(() => {
    const contacts: { id: string; name: string; avatarUrl?: string; teamLogoUrl?: string; role: string; isChat?: boolean; chatId?: string; portraitPlayer?: NBAPlayer }[] = [];
    
    // Add existing chats
    chats.forEach(chat => {
      const participant = chat.participantDetails.find(p => p.id !== 'commissioner');
      if (participant) {
        let avatarUrl: string | undefined = participant.avatarUrl;
        let teamLogoUrl: string | undefined = participant.teamLogoUrl;
        let role = participant.role;

        // Always look up player/staff to get portrait + team logo
        const player = resolveChatPlayerIdentity(state.players, participant);
        if (player) {
          if (player.status === 'Retired' || player.tid === -3) {
            role = player.hof ? 'Retired • Hall of Famer' : 'Retired • Retired Player';
          }
          avatarUrl = player.imgURL;
          const team = state.teams.find(item => item.id === player.tid)
            ?? state.nonNBATeams.find(item => item.tid === player.tid);
          if (team) teamLogoUrl = 'tid' in team ? team.imgURL : team.logoUrl;
        } else {
          const staff = resolveChatStaffContact(state, participant);
          if (staff) {
            avatarUrl = staff.portraitUrl;
            teamLogoUrl = staff.teamLogoUrl;
            role = staff.role;
          }
        }

        // Override portrait with generated avatar if found (AVATAR_DATA lookup)
        const generatedAvatar = getAvatarByName(participant.name, AVATAR_DATA);
        if (!avatarUrl && generatedAvatar) avatarUrl = generatedAvatar;

        // Apply NBA logo fallback
        if (!avatarUrl && participant.name.toUpperCase().startsWith('NBA')) {
          avatarUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/National_Basketball_Association_logo.svg/250px-National_Basketball_Association_logo.svg.png";
        }

        contacts.push({
          ...participant,
          role,
          avatarUrl,
          teamLogoUrl,
          isChat: true,
          chatId: chat.id,
          portraitPlayer: player ?? undefined,
        });
      }
    });

    return contacts.filter(c => c.name && c.name.toLowerCase().includes((searchTerm || '').toLowerCase()));
  }, [chats, state.nonNBATeams, state.players, state.staff, state.teams, searchTerm]);

  return (
    <div className="space-y-1">
      {allContacts.map(contact => {
        const chat = contact.isChat ? chats.find(c => c.id === contact.chatId) : null;
        const isSelected = selectedChatId === (contact.chatId || `new-${contact.id}`);
        const lastMessage = chat?.lastMessage;

        return (
          <button
            key={contact.chatId || contact.id}
            onClick={() => onSelectChat(contact.chatId || `new-${contact.id}`)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
              isSelected ? 'bg-indigo-600/20 border-l-4 border-indigo-500' : 'hover:bg-slate-800/50 border-l-4 border-transparent'
            }`}
          >
            <div className="relative shrink-0">
              {contact.portraitPlayer ? (
                <PlayerPortrait
                  imgUrl={contact.portraitPlayer.imgURL || contact.avatarUrl}
                  face={(contact.portraitPlayer as any).face}
                  playerName={contact.portraitPlayer.name}
                  portraitSeason={state.leagueStats?.year}
                  teamLogoUrl={contact.teamLogoUrl}
                  size={40}
                />
              ) : (
                <ContactAvatar
                  name={contact.name}
                  portraitUrl={contact.avatarUrl}
                  teamLogoUrl={contact.teamLogoUrl}
                />
              )}
              {chat && chat.unreadCount > 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-slate-950 flex items-center justify-center text-[10px] font-bold text-white z-10">
                  {chat.unreadCount}
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0 text-left">
              <div className="flex justify-between items-baseline mb-1">
                <span className={`text-sm font-bold truncate ${isSelected ? 'text-indigo-400' : 'text-slate-200'}`}>
                  {contact.name}
                </span>
                {lastMessage && (
                  <span className="text-[10px] text-slate-500 shrink-0 ml-2">
                    {formatGameRelativeDate(lastMessage.timestamp, state.date)}
                  </span>
                )}
              </div>
              <p className={`text-xs truncate ${chat && chat.unreadCount > 0 ? 'text-slate-300 font-medium' : 'text-slate-500'}`}>
                {chat?.isTyping ? (
                  <span className="italic text-indigo-400">typing...</span>
                ) : (
                  lastMessage ? (
                    `${lastMessage.senderId === 'commissioner' ? 'You: ' : ''}${
                      lastMessage.senderId === 'commissioner' ? lastMessage.text : sanitizeChatReply(lastMessage.text)
                    }`
                  ) : (
                    contact.isChat ? 'Start a conversation' : `Start chat with ${displayStaffRole(contact.role)}`
                  )
                )}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
};
