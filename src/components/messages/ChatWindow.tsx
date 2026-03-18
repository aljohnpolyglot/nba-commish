import React, { useState, useEffect, useRef } from 'react';
import { Chat, ChatMessage } from '../../types';
import { useGame } from '../../store/GameContext';
import { Send, Image as ImageIcon, MoreVertical, ArrowLeft, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ContactAvatar } from '../common/ContactAvatar';
import { AVATAR_DATA } from '../../data/avatars';
import { getAvatarByName } from '../../services/avatarService';

interface ChatWindowProps {
  chat?: Chat;
  draftContactId?: string;
  onBack: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ chat, draftContactId, onBack }) => {
  const { state, dispatchAction } = useGame();
  const [messageText, setMessageText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMessageCount = useRef(chat?.messages.length || 0);
  
  // Helper to find participant if draft
  const findParticipant = (id: string) => {
    const player = state.players.find(p => p.internalId === id);
    if (player) {
        let org = 'Free Agent';
        if (player.status === 'PBA') {
             const team = state.nonNBATeams.find(t => t.league === 'PBA' && t.tid === player.tid);
             if (team) org = team.name;
        } else if (player.status === 'WNBA') {
             const team = state.nonNBATeams.find(t => t.league === 'WNBA' && t.tid === player.tid);
             if (team) org = team.name;
        } else if (player.status === 'Euroleague') {
             const team = state.nonNBATeams.find(t => t.league === 'Euroleague' && t.tid === player.tid);
             if (team) org = team.name;
        } else {
             const team = state.teams.find(t => t.id === player.tid);
             if (team) org = team.name;
        }
        return { id: player.internalId, name: player.name, role: 'Player', avatarUrl: player.imgURL, org };
    }
    
    // Check staff
    if (state.staff) {
        const owner = state.staff.owners.find(o => o.name === id); // ID might be name for staff currently? No, staff doesn't have ID in interface.
        // Assuming ID is name for staff for now or we need to fix staff IDs.
        // The previous code used name as ID for staff in some places.
        // Let's assume draftContactId is the name for staff if not found in players.
        
        // Actually, PersonSelectorModal returns Contact objects which have IDs.
        // For players it's `player-${internalId}`.
        // For staff it's likely just name or similar.
    }
    return null;
  };

  const nonCommParticipant = chat?.participantDetails.find(p => p.id !== 'commissioner');
  let participant = nonCommParticipant ? { ...nonCommParticipant } : null;

  let teamLogoUrl = undefined;
  let org = 'Unknown';

  // Fallback lookup if avatar is missing in chat participant details
  if (participant) {
    const generatedAvatar = getAvatarByName(participant.name, AVATAR_DATA);
    
    // Check for NBA prefix in name or org
    const isNBA = participant.name.toUpperCase().startsWith('NBA') || (org && org.toUpperCase().startsWith('NBA'));
    const nbaLogo = "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/National_Basketball_Association_logo.svg/250px-National_Basketball_Association_logo.svg.png";

    const player = state.players.find(p => p.internalId === participant!.id || (p.name && participant!.name && p.name.toLowerCase() === participant!.name.toLowerCase()));
    if (player) {
      participant.avatarUrl = generatedAvatar || player.imgURL || participant.avatarUrl;
      console.log(`ChatWindow Debug: Found player ${player.name}. Avatar: ${participant.avatarUrl}, imgURL: ${player.imgURL}, generated: ${generatedAvatar}`);
      if (player.tid !== undefined && player.tid >= 0) {
        const team = state.teams.find(t => t.id === player.tid);
        if (team) {
            teamLogoUrl = team.logoUrl;
            org = team.name;
            console.log(`ChatWindow Debug: Found team ${team.name}. Logo: ${teamLogoUrl}`);
        }
      } else if (player.status === 'PBA') {
          const team = state.nonNBATeams.find(t => t.league === 'PBA' && t.tid === player.tid);
          if (team) {
              org = team.name;
              teamLogoUrl = team.imgURL;
          }
      } else if (player.status === 'WNBA') {
          const team = state.nonNBATeams.find(t => t.league === 'WNBA' && t.tid === player.tid);
          if (team) {
              org = team.name;
              teamLogoUrl = team.imgURL;
          }
      } else if (player.status === 'Euroleague') {
          const team = state.nonNBATeams.find(t => t.league === 'Euroleague' && t.tid === player.tid);
          if (team) {
              org = team.name;
              teamLogoUrl = team.imgURL;
          }
      } else {
          org = 'Free Agent';
      }
    } else {
      const allStaff = [
        ...(state.staff?.owners || []),
        ...(state.staff?.gms || []),
        ...(state.staff?.coaches || []),
        ...(state.staff?.leagueOffice || [])
      ];
      const staff = allStaff.find(s => s.name && participant!.name && s.name.toLowerCase() === participant!.name.toLowerCase());
      if (staff) {
        participant.avatarUrl = generatedAvatar || staff.playerPortraitUrl || participant.avatarUrl;
        console.log(`ChatWindow Debug: Found staff ${staff.name}. Avatar: ${participant.avatarUrl}, portrait: ${staff.playerPortraitUrl}`);
        if (staff.team) {
          const team = state.teams.find(t => t.name === staff.team);
          if (team) {
              teamLogoUrl = team.logoUrl;
              org = team.name;
          } else {
              org = staff.team;
          }
        }
      }
    }

    // Apply NBA logo fallback if it's an NBA entity and no avatar found
    if (isNBA && !participant.avatarUrl) {
      participant.avatarUrl = nbaLogo;
    }
    
    console.log(`ChatWindow Debug Final: ${participant.name} -> portraitUrl: ${participant.avatarUrl}, teamLogoUrl: ${teamLogoUrl}`);
  }

  if (!participant && draftContactId) {
      const generatedAvatar = getAvatarByName(draftContactId, AVATAR_DATA);
      const nbaLogo = "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/National_Basketball_Association_logo.svg/250px-National_Basketball_Association_logo.svg.png";
      const isNBA = (draftContactId || '').toUpperCase().startsWith('NBA');
      
      // Try to find in players first
      const player = state.players.find(p => `player-${p.internalId}` === draftContactId || String(p.internalId) === draftContactId);
      if (player) {
          participant = { 
              id: player.internalId, 
              name: player.name, 
              role: 'Player', 
              avatarUrl: generatedAvatar || player.imgURL 
          };
          if (player.tid !== undefined && player.tid >= 0) {
            const team = state.teams.find(t => t.id === player.tid);
            if (team) {
                teamLogoUrl = team.logoUrl;
                org = team.name;
            }
          } else if (player.status === 'PBA') {
              const team = state.nonNBATeams.find(t => t.league === 'PBA' && t.tid === player.tid);
              if (team) org = team.name;
          } else if (player.status === 'WNBA') {
              const team = state.nonNBATeams.find(t => t.league === 'WNBA' && t.tid === player.tid);
              if (team) org = team.name;
          } else if (player.status === 'Euroleague') {
              const team = state.nonNBATeams.find(t => t.league === 'Euroleague' && t.tid === player.tid);
              if (team) org = team.name;
          } else {
              org = 'Free Agent';
          }
      } else {
          // Try staff
          // We need to search all staff
          const allStaff = [
              ...(state.staff?.owners || []),
              ...(state.staff?.gms || []),
              ...(state.staff?.coaches || []),
              ...(state.staff?.leagueOffice || [])
          ];
          const staff = allStaff.find(s => s.name === draftContactId);
          if (staff) {
              participant = {
                  id: staff.name,
                  name: staff.name,
                  role: staff.jobTitle || 'Staff',
                  avatarUrl: generatedAvatar || staff.playerPortraitUrl
              };
              if (staff.team) {
                const team = state.teams.find(t => t.name === staff.team);
                if (team) {
                    teamLogoUrl = team.logoUrl;
                    org = team.name;
                } else {
                    org = staff.team;
                }
              }
          }
      }

      if (participant && isNBA && !participant.avatarUrl) {
          participant.avatarUrl = nbaLogo;
      }
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
    let org = 'Unknown';
    const player = state.players.find(p => p.internalId === participant!.id);
    if (player) {
        if (player.status === 'PBA') {
             const team = state.nonNBATeams.find(t => t.league === 'PBA' && t.tid === player.tid);
             org = team ? team.name : 'PBA Free Agent';
        } else if (player.status === 'WNBA') {
             const team = state.nonNBATeams.find(t => t.league === 'WNBA' && t.tid === player.tid);
             org = team ? team.name : 'WNBA Free Agent';
        } else if (player.status === 'Euroleague') {
             const team = state.nonNBATeams.find(t => t.league === 'Euroleague' && t.tid === player.tid);
             org = team ? team.name : 'Euroleague Free Agent';
        } else {
             const team = state.teams.find(t => t.id === player.tid);
             org = team ? team.name : 'Free Agent';
        }
    } else {
        // Staff org
        const allStaff = [
            ...(state.staff?.owners || []),
            ...(state.staff?.gms || []),
            ...(state.staff?.coaches || [])
        ];
        const staff = allStaff.find(s => s.name === participant!.name);
        if (staff) org = staff.team || 'Unknown';
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
        targetOrg: org,
        avatarUrl: participant.avatarUrl
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="md:hidden text-slate-400 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <ContactAvatar 
            name={participant.name} 
            portraitUrl={participant.avatarUrl} 
            teamLogoUrl={teamLogoUrl} 
          />
          <div>
            <h3 className="font-bold text-white">{participant.name}</h3>
            <p className="text-xs text-slate-500">
              {participant.role}
              {org !== 'Unknown' && !participant.role.includes(org) ? ` • ${org}` : ''}
            </p>
          </div>
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
                    {format(new Date(msg.timestamp), 'MMM d, yyyy')}
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
                  <p className="text-sm">{msg.text.replace('[HYPNOTIC COMMAND]: ', '')}</p>
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
