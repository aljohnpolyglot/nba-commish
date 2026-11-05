import React, { useState, useEffect, useRef } from 'react';
import { Chat, NBAPlayer } from '../../types';
import { useGame } from '../../store/GameContext';
import { Send, Image as ImageIcon, MoreVertical, ArrowLeft, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ContactAvatar } from '../common/ContactAvatar';
import { AVATAR_DATA } from '../../data/avatars';
import { getAvatarByName } from '../../services/avatarService';
import { getAllReferees, getRefereePhoto } from '../../data/photos';
import { resolveChatStaffContact } from '../../utils/chatStaffContact';
import type { NewChatContact } from '../../services/messages/newChatContacts';
import { sanitizeChatReply } from '../../services/llm/prompts/chat';
import { displayStaffRole } from '../../services/staff/staffCareerRows';
import { resolveChatPlayerIdentity } from '../../services/messages/chatPlayerIdentity';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { getPlayerChatAffiliation } from '../../services/llm/playerChatContext';
import { formatGameDateSeparator } from '../../utils/helpers';

interface ChatWindowProps {
  chat?: Chat;
  draftContactId?: string;
  draftContact?: NewChatContact;
  onBack: () => void;
  onViewPlayerBio?: (player: NBAPlayer) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  chat,
  draftContactId,
  draftContact,
  onBack,
  onViewPlayerBio,
}) => {
  const { state, dispatchAction } = useGame();
  const [messageText, setMessageText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMessageCount = useRef(chat?.messages.length || 0);
  
  const nonCommParticipant = chat?.participantDetails.find(p => p.id !== 'commissioner');
  let participant = nonCommParticipant ? { ...nonCommParticipant } : null;

  let teamLogoUrl = participant?.teamLogoUrl;
  let org = participant?.organization ?? 'Unknown';
  let bioPlayer: NBAPlayer | null = null;
  let portraitPlayer: NBAPlayer | null = null;
  let playerRoleLabel: string | null = null;

  // Fallback lookup if avatar is missing in chat participant details
  if (participant) {
    const generatedAvatar = getAvatarByName(participant.name, AVATAR_DATA);
    
    // Check for NBA prefix in name or org
    const isNBA = participant.name.toUpperCase().startsWith('NBA') || (org && org.toUpperCase().startsWith('NBA'));
    const nbaLogo = "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/National_Basketball_Association_logo.svg/250px-National_Basketball_Association_logo.svg.png";

    const player = resolveChatPlayerIdentity(state.players, participant);
    if (player) {
      portraitPlayer = player;
      if (!String(participant.id).startsWith('fa-agent:')) bioPlayer = player;
      participant.avatarUrl = participant.avatarUrl || player.imgURL || generatedAvatar;
      const team = state.teams.find(item => item.id === player.tid)
        ?? state.nonNBATeams.find(item => item.tid === player.tid);
      if (team) {
        org = team.name;
        teamLogoUrl = 'tid' in team ? team.imgURL : team.logoUrl;
      } else {
        org = 'Free Agent';
        const affiliation = getPlayerChatAffiliation(state, player);
        if (affiliation.formerTeamName) {
          playerRoleLabel = `Former ${affiliation.formerTeamName} Player`;
          const formerTeam = state.teams.find(item => item.id === affiliation.formerTeamId)
            ?? state.nonNBATeams.find(item => item.tid === affiliation.formerTeamId);
          teamLogoUrl = formerTeam ? ('tid' in formerTeam ? formerTeam.imgURL : formerTeam.logoUrl) : teamLogoUrl;
        }
      }
    } else {
      const staff = resolveChatStaffContact(state, participant);
      if (staff) {
        participant.avatarUrl = participant.avatarUrl || staff.portraitUrl || generatedAvatar;
        participant.role = staff.role || participant.role;
        teamLogoUrl = staff.teamLogoUrl;
        org = staff.organization || org;
      }
    }

    // Apply NBA logo fallback if it's an NBA entity and no avatar found
    if (isNBA && !participant.avatarUrl) {
      participant.avatarUrl = nbaLogo;
    }
    
  }

  if (!participant && draftContact && draftContact.id === draftContactId) {
      participant = {
          id: draftContact.id,
          name: draftContact.name,
          role: draftContact.role,
          avatarUrl: draftContact.avatarUrl,
          teamLogoUrl: draftContact.teamLogoUrl,
          organization: draftContact.org,
      };
      teamLogoUrl = draftContact.teamLogoUrl;
      org = draftContact.org;
      bioPlayer = draftContact.kind === 'agent'
        ? null
        : state.players.find(player => player.internalId === draftContact.id) ?? null;
  }

  if (!participant && draftContactId) {
      const generatedAvatar = getAvatarByName(draftContactId, AVATAR_DATA);
      const nbaLogo = "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/National_Basketball_Association_logo.svg/250px-National_Basketball_Association_logo.svg.png";
      const isNBA = (draftContactId || '').toUpperCase().startsWith('NBA');
      
      // Try to find in players first
      const player = state.players.find(p => `player-${p.internalId}` === draftContactId || String(p.internalId) === draftContactId);
      if (player) {
          bioPlayer = player;
          participant = { 
              id: player.internalId, 
              name: player.name, 
              role: 'Player', 
              avatarUrl: generatedAvatar || player.imgURL 
          };
          const team = state.teams.find(item => item.id === player.tid)
            ?? state.nonNBATeams.find(item => item.tid === player.tid);
          if (team) {
            teamLogoUrl = 'tid' in team ? team.imgURL : team.logoUrl;
            org = team.name;
          } else {
            org = 'Free Agent';
          }
      } else {
          const staff = resolveChatStaffContact(state, { id: draftContactId, name: draftContactId });
          if (staff) {
              participant = {
                  id: staff.staff.id ?? staff.staff.name,
                  name: staff.staff.name,
                  role: staff.role,
                  avatarUrl: staff.portraitUrl || generatedAvatar,
              };
              teamLogoUrl = staff.teamLogoUrl;
              org = staff.organization || org;
          }
      }

      if (!participant) {
          // Try referees
          const allRefs = getAllReferees();
          const ref = allRefs.find(r => `ref-${r.id}` === draftContactId);
          if (ref) {
              participant = {
                  id: `ref-${ref.id}`,
                  name: ref.name,
                  role: 'League Referee',
                  avatarUrl: getRefereePhoto(ref.name) || undefined
              };
              org = 'League Officials';
          }
      }

      if (participant && isNBA && !participant.avatarUrl) {
          participant.avatarUrl = nbaLogo;
      }
  }

  if (participant && !portraitPlayer) {
    portraitPlayer = resolveChatPlayerIdentity(state.players, participant);
  }

  const scrollToBottom = (force = false) => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    const lastMessage = chat?.messages && chat.messages.length > 0 
      ? chat.messages[chat.messages.length - 1] 
      : null;
    const lastMessageIsMe = lastMessage?.senderId === 'commissioner';

    if (force || isNearBottom || lastMessageIsMe) {
      messagesEndRef.current?.scrollIntoView({ behavior: force ? "auto" : "smooth" });
    }
  };

  // Initial scroll on chat change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    lastMessageCount.current = chat?.messages.length || 0;
  }, [chat?.id]);

  useEffect(() => {
    const hasNewMessage = (chat?.messages.length || 0) > lastMessageCount.current;
    
    if (hasNewMessage || chat?.isTyping) {
      scrollToBottom();
    }
    
    lastMessageCount.current = chat?.messages.length || 0;
  }, [chat?.messages, chat?.isTyping]);

  const handleSendMessage = async () => {
    if ((!messageText.trim() && !selectedImage) || !participant) return;

    const text = messageText;
    const imageUrl = selectedImage;
    setMessageText('');
    setSelectedImage(null);

    // Find org
    let targetOrg = org;
    const player = state.players.find(p => p.internalId === participant!.id);
    if (player) {
        const team = state.teams.find(item => item.id === player.tid)
          ?? state.nonNBATeams.find(item => item.tid === player.tid);
        const affiliation = getPlayerChatAffiliation(state, player);
        targetOrg = team ? team.name : affiliation.formerTeamName ? `Free Agent; formerly ${affiliation.formerTeamName}` : 'Free Agent';
    } else {
        const staff = resolveChatStaffContact(state, participant);
        if (staff) targetOrg = staff.organization || targetOrg;
    }

    await dispatchAction({
      type: 'SEND_CHAT_MESSAGE',
      payload: {
        chatId: chat?.id,
        text,
        imageUrl,
        targetId: participant.id,
        targetName: participant.name,
        targetRole: participant.role,
        targetOrg,
        avatarUrl: participant.avatarUrl,
        teamLogoUrl,
      }
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!participant) return (
      <div className="flex items-center justify-center h-full text-slate-500">
          Select a contact to start chatting
      </div>
  );

  const canOpenPlayerBio = !!bioPlayer && !!onViewPlayerBio;
  const profileHeader = (
    <>
      {portraitPlayer ? (
        <PlayerPortrait
          imgUrl={portraitPlayer.imgURL || participant.avatarUrl}
          face={(portraitPlayer as any).face}
          playerName={portraitPlayer.name}
          portraitSeason={state.leagueStats?.year}
          teamLogoUrl={teamLogoUrl}
          size={40}
        />
      ) : (
        <ContactAvatar
          name={participant.name}
          portraitUrl={participant.avatarUrl}
          teamLogoUrl={teamLogoUrl}
        />
      )}
      <div className="min-w-0">
        <h3 className="truncate font-bold text-white">{participant.name}</h3>
        <p className="truncate text-xs text-slate-500">
          {playerRoleLabel ?? displayStaffRole(participant.role).split('•', 1)[0].trim()}
          {org !== 'Unknown' && !participant.role.includes(org) ? ` • ${org}` : ''}
        </p>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="md:hidden text-slate-400 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          {canOpenPlayerBio ? (
            <button
              type="button"
              onClick={() => bioPlayer && onViewPlayerBio?.(bioPlayer)}
              className="-m-1 flex min-w-0 items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title={`Open ${participant.name} bio`}
            >
              {profileHeader}
            </button>
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              {profileHeader}
            </div>
          )}
        </div>
        <button className="text-slate-400 hover:text-white">
          <MoreVertical size={20} />
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
      >
        {chat?.messages.map((msg, index) => {
          const isMe = msg.senderId === 'commissioner';
          const showDate = index === 0 || new Date(msg.timestamp).toDateString() !== new Date(chat.messages[index - 1].timestamp).toDateString();

          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-4">
                  <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded-full">
                    {formatGameDateSeparator(msg.timestamp, state.date)}
                  </span>
                </div>
              )}
              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] p-3 rounded-2xl ${
                  isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none'
                }`}>
                  {msg.imageUrl && (
                    <img src={msg.imageUrl} alt="Uploaded" className="max-w-full rounded-lg mb-2" />
                  )}
                  <p className="text-sm">
                    {(isMe ? msg.text : sanitizeChatReply(msg.text)).replace('[HYPNOTIC COMMAND]: ', '')}
                  </p>
                  <div className={`text-[10px] mt-1 ${isMe ? 'text-indigo-200' : 'text-slate-500'} flex items-center justify-end gap-1`}>
                    {format(new Date(msg.timestamp), 'h:mm a')}
                    {isMe && msg.seen && (
                      <span className="text-[10px] opacity-70 flex items-center gap-0.5" title="Seen">
                        <Eye size={10} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        
        {chat?.isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-800 p-3 rounded-2xl rounded-bl-none flex items-center gap-1">
              <motion.div 
                animate={{ scale: [1, 1.2, 1] }} 
                transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                className="w-2 h-2 bg-slate-500 rounded-full" 
              />
              <motion.div 
                animate={{ scale: [1, 1.2, 1] }} 
                transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                className="w-2 h-2 bg-slate-500 rounded-full" 
              />
              <motion.div 
                animate={{ scale: [1, 1.2, 1] }} 
                transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                className="w-2 h-2 bg-slate-500 rounded-full" 
              />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        {selectedImage && (
          <div className="mb-2 relative inline-block">
            <img src={selectedImage} alt="Preview" className="h-20 rounded-lg border border-slate-700" />
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleImageUpload}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
          >
            <ImageIcon size={20} />
          </button>
          <input 
            type="text" 
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type a message..." 
            className="flex-1 bg-slate-800 text-slate-200 px-4 py-2 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button 
            onClick={handleSendMessage}
            disabled={!messageText.trim() && !selectedImage}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full transition-colors"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
