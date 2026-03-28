import React from 'react';
import { Chat } from '../../types';
import { useGame } from '../../store/GameContext';
import { formatGameRelativeDate } from '../../utils/helpers';
import { ContactAvatar } from '../common/ContactAvatar';
import { AVATAR_DATA } from '../../data/avatars';
import { getAvatarByName } from '../../services/avatarService';

interface ChatListProps {
  chats: Chat[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  searchTerm: string;
}

export const ChatList: React.FC<ChatListProps> = ({ chats, selectedChatId, onSelectChat, searchTerm }) => {
  const { state } = useGame();

  const allContacts = React.useMemo(() => {
    const contacts: { id: string; name: string; avatarUrl?: string; teamLogoUrl?: string; role: string; isChat?: boolean; chatId?: string }[] = [];
    
    // Add existing chats
    chats.forEach(chat => {
      const participant = chat.participantDetails.find(p => p.id !== 'commissioner');
      if (participant) {
        let avatarUrl: string | undefined = undefined;
        let teamLogoUrl: string | undefined = undefined;

        // Always look up player/staff to get portrait + team logo
        const player = state.players.find(p => p.internalId === participant.id || (p.name && participant.name && p.name.toLowerCase() === participant.name.toLowerCase()));
        if (player) {
          if (player.status === 'Retired' || player.tid === -3) {
            participant.role = player.hof ? 'Retired • Hall of Famer' : 'Retired • Retired Player';
          }
          avatarUrl = player.imgURL;
          if (player.tid !== undefined && player.tid >= 0) {
            const team = state.teams.find(t => t.id === player.tid);
            if (team) teamLogoUrl = team.logoUrl;
          } else if (player.status === 'PBA' || player.status === 'WNBA' || player.status === 'Euroleague' || player.status === 'B-League') {
            const team = state.nonNBATeams.find(t => t.league === player.status && t.tid === player.tid);
            if (team) teamLogoUrl = team.imgURL;
          }
        } else {
          const allStaff = [
            ...(state.staff?.owners || []),
            ...(state.staff?.gms || []),
            ...(state.staff?.coaches || []),
            ...(state.staff?.leagueOffice || [])
          ];
          const staff = allStaff.find(s => s.name && participant.name && s.name.toLowerCase() === participant.name.toLowerCase());
          if (staff) {
            avatarUrl = staff.playerPortraitUrl;
            if (staff.team) {
              const team = state.teams.find(t => t.name === staff.team);
              if (team) teamLogoUrl = team.logoUrl;
            }
          }
        }

        // Override portrait with generated avatar if found (AVATAR_DATA lookup)
        const generatedAvatar = getAvatarByName(participant.name, AVATAR_DATA);
        if (generatedAvatar) avatarUrl = generatedAvatar;

        // Apply NBA logo fallback
        if (!avatarUrl && participant.name.toUpperCase().startsWith('NBA')) {
          avatarUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/National_Basketball_Association_logo.svg/250px-National_Basketball_Association_logo.svg.png";
        }

        contacts.push({
          ...participant,
          avatarUrl,
          teamLogoUrl,
          isChat: true,
          chatId: chat.id
        });
      }
    });

    return contacts.filter(c => c.name && c.name.toLowerCase().includes((searchTerm || '').toLowerCase()));
  }, [chats, state.players, state.staff, searchTerm]);

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
              <ContactAvatar 
                name={contact.name} 
                portraitUrl={contact.avatarUrl} 
                teamLogoUrl={contact.teamLogoUrl} 
              />
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
                    `${lastMessage.senderId === 'commissioner' ? 'You: ' : ''}${lastMessage.text}`
                  ) : (
                    contact.isChat ? 'Start a conversation' : `Start chat with ${contact.role}`
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
