import React, { useState, useEffect } from 'react';
import { useGame } from '../store/GameContext';
import { AnimatePresence } from 'motion/react';
import { fetchAvatarData, getAvatarByName } from '../services/avatarService';
import { EmailList } from './inbox/EmailList';
import { EmailEmptyState } from './inbox/EmailEmptyState';
import { EmailContent } from './inbox/EmailContent';

export const Inbox: React.FC = () => {
  const { state, dispatchAction, markEmailRead } = useGame();
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [avatars, setAvatars] = useState<any[]>([]);

  useEffect(() => {
    fetchAvatarData().then(setAvatars);
  }, []);

  const selectedEmail = state.inbox.find(e => e.id === selectedEmailId);
  const filteredEmails = state.inbox.filter(e => 
    (e.sender && e.sender.toLowerCase().includes((searchTerm || '').toLowerCase())) || 
    (e.subject && e.subject.toLowerCase().includes((searchTerm || '').toLowerCase()))
  );

  const handleSelect = (id: string) => {
    setSelectedEmailId(id);
    markEmailRead(id);
    setReplyText('');
  };

  const handleReply = () => {
    if (!replyText.trim() || !selectedEmail) return;
    dispatchAction({
      type: 'REPLY_EMAIL',
      payload: { emailId: selectedEmail.id, replyText }
    });
    setReplyText('');
  };

  const getSenderPhoto = (email: any) => {
    // Check for NBA prefix
    if (email.sender && email.sender.toUpperCase().startsWith('NBA')) {
      return "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/National_Basketball_Association_logo.svg/250px-National_Basketball_Association_logo.svg.png";
    }

    if (email.playerPortraitUrl) return email.playerPortraitUrl;
    
    // Check if sender is a player in the roster
    const playerMatch = state.players.find(p => p.name && email.sender && p.name.toLowerCase() === email.sender.toLowerCase());
    if (playerMatch) return playerMatch.imgURL;

    const avatar = getAvatarByName(email.sender || '', avatars);
    if (avatar) return avatar;
    
    // If no avatar, check if the sender is associated with a team
    if (email.teamLogoUrl) return email.teamLogoUrl;

    // Check staff lists for team affiliation
    if (state.staff) {
        const staffMember = [...state.staff.gms, ...state.staff.owners, ...state.staff.coaches].find(s => s.name === email.sender);
        if (staffMember && staffMember.team) {
             const staffTeam = state.teams.find(t => t.name === staffMember.team);
             if (staffTeam) return staffTeam.logoUrl;
        }
    }

    const team = state.teams.find(t => 
      (email.sender && email.sender.toLowerCase().includes(t.name.toLowerCase())) || 
      (email.senderRole && email.senderRole.toLowerCase().includes(t.name.toLowerCase())) ||
      (email.organization && email.organization.toLowerCase().includes(t.name.toLowerCase()))
    );
    if (team) return team.logoUrl;
    
    return null;
  };

  return (
    <div className="flex h-full bg-slate-950 text-slate-300 overflow-hidden rounded-[2.5rem] border border-slate-800 shadow-2xl">
      <EmailList 
        emails={filteredEmails}
        selectedEmailId={selectedEmailId}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onSelect={handleSelect}
        unreadCount={state.inbox.filter(e => !e.read).length}
        gameDate={state.date}
      />

      {/* Email Content */}
      <div className={`flex-1 flex-col bg-slate-950 relative overflow-hidden ${!selectedEmailId ? 'hidden md:flex' : 'flex'}`}>
        {selectedEmail ? (
          <AnimatePresence mode="wait">
            <EmailContent 
              email={selectedEmail}
              replyText={replyText}
              setReplyText={setReplyText}
              onReply={handleReply}
              onBack={() => setSelectedEmailId(null)}
              isProcessing={state.isProcessing}
              getSenderPhoto={getSenderPhoto}
            />
          </AnimatePresence>
        ) : (
          <EmailEmptyState />
        )}
      </div>
    </div>
  );
};
