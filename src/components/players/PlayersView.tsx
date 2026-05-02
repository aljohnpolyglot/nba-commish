import React, { useState } from 'react';
import { useGame } from '../../store/GameContext';
import { UniversalPlayerSearcher } from '../central/view/UniversalPlayerSearcher';
import { NBAPlayer, Contact } from '../../types';
import { PlayerActionsModal } from '../central/view/PlayerActionsModal';
import { PlayerBioView } from '../central/view/PlayerBioView';
import { PlayerRatingsModal } from '../modals/PlayerRatingsModal';
import ContactModal from '../ContactModal';
import { PersonSelectorModal } from '../modals/PersonSelectorModal';
import { usePlayerQuickActions } from '../../hooks/usePlayerQuickActions';

export const PlayersView: React.FC = () => {
  const { state, dispatchAction, navigateToTeam, healPlayer } = useGame();

  // Modals State
  const [selectedPlayerForActions, setSelectedPlayerForActions] = useState<NBAPlayer | null>(null);
  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);
  const [viewingRatingsPlayer, setViewingRatingsPlayer] = useState<NBAPlayer | null>(null);
  const [selectedPlayerContact, setSelectedPlayerContact] = useState<Contact | null>(null);
  
  const [personSelectorOpen, setPersonSelectorOpen] = useState(false);
  const [personSelectorType, setPersonSelectorType] = useState<'suspension' | 'drug_test' | 'dinner' | 'general' | 'fine' | 'bribe' | 'movie' | 'leak_scandal' | 'give_money' | 'sabotage' | 'club' | 'endorse_hof' | 'waive' | 'fire'>('general');

  // Sign / re-sign / waive are delegated to the shared quick-actions hook.
  const quick = usePlayerQuickActions();

  const handlePlayerClick = (player: NBAPlayer) => {
    setSelectedPlayerForActions(player);
  };

  const getContactFromPlayer = (player: NBAPlayer): Contact => {
    const isNBA = !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || '');
    const playerTeam = isNBA ? state.teams.find(t => t.id === player.tid) : null;
    const nonNBATeam = !isNBA ? state.nonNBATeams.find(t => t.tid === player.tid && t.league === player.status) : null;
    
    let org = 'Free Agent';
    if (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') {
      org = 'Draft Prospect';
    } else if (playerTeam) {
      org = playerTeam.name;
    } else if (nonNBATeam) {
      org = nonNBATeam.name;
    }

    return {
      id: player.internalId,
      name: player.name,
      title: 'Player',
      organization: org,
      type: 'player',
      playerPortraitUrl: player.imgURL
    };
  };

  const handleActionSelect = (actionType: string) => {
    if (!selectedPlayerForActions) return;

    if (actionType === 'view_bio') {
      setViewingBioPlayer(selectedPlayerForActions);
      setSelectedPlayerForActions(null);
      return;
    }

    if (actionType === 'view_ratings') {
      setViewingRatingsPlayer(selectedPlayerForActions);
      setSelectedPlayerForActions(null);
      return;
    }

    // Sign / re-sign / waive → delegated to the shared hook.
    if (quick.handle(selectedPlayerForActions, actionType)) {
      setSelectedPlayerForActions(null);
      return;
    }

    const contact = getContactFromPlayer(selectedPlayerForActions);
    setSelectedPlayerForActions(null); // Close actions modal

    if (actionType === 'contact') {
      setSelectedPlayerContact(contact);
    } else {
      setPersonSelectorType(actionType as typeof personSelectorType);
      setSelectedPlayerContact(contact); // Temporarily store to pass as preSelected
      setPersonSelectorOpen(true);
    }
  };

  const handleSendMessage = async (params: { message: string }) => {
    if (selectedPlayerContact) {
      const chat = state.chats.find(c => c.participants.includes(selectedPlayerContact.id));
      await dispatchAction({
        type: 'SEND_CHAT_MESSAGE',
        payload: {
          chatId: chat?.id,
          text: params.message,
          targetId: selectedPlayerContact.id,
          targetName: selectedPlayerContact.name,
          targetRole: selectedPlayerContact.title,
          targetOrg: selectedPlayerContact.organization,
          targetPortraitUrl: selectedPlayerContact.playerPortraitUrl
        }
      });
      setSelectedPlayerContact(null);
    }
  };

  const handlePersonSelected = async (contacts: Contact[], reason?: string, amount?: number, location?: string, duration?: string) => {
    setPersonSelectorOpen(false);
    setSelectedPlayerContact(null);

    let actionType = '';
    if (personSelectorType === 'suspension') actionType = 'SUSPEND_PLAYER';
    if (personSelectorType === 'drug_test') actionType = 'DRUG_TEST_PERSON';
    if (personSelectorType === 'dinner') actionType = 'INVITE_DINNER';
    if (personSelectorType === 'movie') actionType = 'INVITE_DINNER';
    if (personSelectorType === 'fine') actionType = 'FINE_PERSON';
    if (personSelectorType === 'bribe') actionType = 'BRIBE_PERSON';
    if (personSelectorType === 'leak_scandal') actionType = 'LEAK_SCANDAL';
    if (personSelectorType === 'give_money') actionType = 'GIVE_MONEY';
    if (personSelectorType === 'sabotage') actionType = 'SABOTAGE_PLAYER';
    if (personSelectorType === 'club') actionType = 'GO_TO_CLUB';
    if (personSelectorType === 'endorse_hof') actionType = 'ENDORSE_HOF';
    if (personSelectorType === 'waive') actionType = 'WAIVE_PLAYER';
    if (personSelectorType === 'fire') actionType = 'FIRE_PERSONNEL';

    await dispatchAction({
      type: actionType as any,
      payload: {
        targetName: contacts.map(c => c.name).join(', '),
        targetRole: contacts.map(c => c.title).join(', '),
        targetId: contacts.map(c => c.id).join(','),
        reason,
        amount,
        duration,
        location,
        count: contacts.length,
        contacts,
      },
    });
  };

  if (viewingBioPlayer) {
    return (
      <PlayerBioView 
        player={viewingBioPlayer} 
        onBack={() => setViewingBioPlayer(null)} 
      />
    );
  }

  return (
    <div className="h-full overflow-hidden p-4 md:p-8 flex flex-col relative">
      <div className="mb-8">
        <h2 className="text-3xl font-black text-white uppercase tracking-tight">Players</h2>
        <p className="text-slate-500 font-medium">Search and filter all players in the database</p>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <UniversalPlayerSearcher
          players={state.players}
          teams={state.teams}
          nonNBATeams={state.nonNBATeams}
          onActionClick={handlePlayerClick}
          onTeamClick={navigateToTeam}
        />
      </div>

      {selectedPlayerForActions && (
        <PlayerActionsModal
          player={selectedPlayerForActions}
          onClose={() => setSelectedPlayerForActions(null)}
          onActionSelect={handleActionSelect}
          onHeal={() => { healPlayer(selectedPlayerForActions.internalId); setSelectedPlayerForActions(null); }}
        />
      )}

      {quick.portals}

      {selectedPlayerContact && !personSelectorOpen && (
        <ContactModal 
          contact={selectedPlayerContact}
          onClose={() => {
            setSelectedPlayerContact(null);
          }}
          onSend={handleSendMessage}
          isLoading={state.isProcessing}
        />
      )}

      {personSelectorOpen && (
        <PersonSelectorModal
          title=""
          actionType={personSelectorType}
          onSelect={handlePersonSelected}
          onClose={() => {
            setPersonSelectorOpen(false);
            setSelectedPlayerContact(null);
          }}
          preSelectedContact={selectedPlayerContact || undefined}
        />
      )}

      {viewingRatingsPlayer && (
        <PlayerRatingsModal
          player={viewingRatingsPlayer}
          season={state.leagueStats?.year ?? 2026}
          onClose={() => setViewingRatingsPlayer(null)}
        />
      )}
    </div>
  );
};
