import React, { useState } from 'react';
import { useGame } from '../../store/GameContext';
import { UniversalPlayerSearcher } from '../central/view/UniversalPlayerSearcher';
import { NBAPlayer, Contact } from '../../types';
import { PlayerActionsModal } from '../central/view/PlayerActionsModal';
import { PlayerBioView } from '../central/view/PlayerBioView';
import { PlayerRatingsModal } from '../modals/PlayerRatingsModal';
import { PersonSelectorModal } from '../modals/PersonSelectorModal';
import { usePlayerQuickActions } from '../../hooks/usePlayerQuickActions';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getPreloadedExternalPlayers, getPreloadedExternalTeams } from '../../services/playerBioPreload';

export const PlayersView: React.FC = () => {
  const { state, dispatchAction, navigateToTeam, navigateToPlayer, healPlayer } = useGame();
  const euroMode = state.leagueStats?.uiMode === 'euro_isolated';
  const externalReferencePlayers = euroMode ? getPreloadedExternalPlayers(state.saveId) : [];
  const externalReferenceTeams = euroMode ? getPreloadedExternalTeams(state.saveId) : [];

  // Modals State
  const [selectedPlayerForActions, setSelectedPlayerForActions] = useState<NBAPlayer | null>(null);
  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);
  const [viewingRatingsPlayer, setViewingRatingsPlayer] = useState<NBAPlayer | null>(null);
  const [selectedPlayerContact, setSelectedPlayerContact] = useState<Contact | null>(null);
  
  const [personSelectorOpen, setPersonSelectorOpen] = useState(false);
  const [personSelectorType, setPersonSelectorType] = useState<'suspension' | 'drug_test' | 'dinner' | 'general' | 'fine' | 'movie' | 'give_money' | 'sabotage' | 'club' | 'endorse_hof' | 'waive' | 'fire'>('general');

  // Sign / re-sign / waive are delegated to the shared quick-actions hook.
  const quick = usePlayerQuickActions();

  const handlePlayerClick = (player: NBAPlayer) => {
    if ((player as any).externalArchiveOnly === true) {
      setViewingBioPlayer(player);
      return;
    }
    setSelectedPlayerForActions(player);
  };

  const getContactFromPlayer = (player: NBAPlayer): Contact => {
    const playerTeam = player.tid >= 0
      ? resolveAnyTeam(player.tid, state.teams, state.nonNBATeams ?? [])
      : null;
    
    let org = 'Free Agent';
    if (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') {
      org = 'Draft Prospect';
    } else if (playerTeam) {
      org = playerTeam.name;
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
      navigateToPlayer(selectedPlayerForActions);
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

    setPersonSelectorType(actionType as typeof personSelectorType);
    setSelectedPlayerContact(contact);
    setPersonSelectorOpen(true);
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
        subType: personSelectorType,
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
          players={[...state.players, ...externalReferencePlayers]}
          teams={[...state.teams, ...externalReferenceTeams]}
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
          onHeal={() => healPlayer(selectedPlayerForActions.internalId)}
        />
      )}

      {quick.portals}

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
          skipPersonSelection={!!selectedPlayerContact && personSelectorType !== 'dinner' && personSelectorType !== 'movie'}
          showInviteMorePrompt={personSelectorType === 'dinner' || personSelectorType === 'movie'}
        />
      )}

      {viewingRatingsPlayer && (
        <PlayerRatingsModal
          player={viewingRatingsPlayer}
          season={state.leagueStats?.year ?? new Date().getFullYear()}
          onClose={() => setViewingRatingsPlayer(null)}
        />
      )}
    </div>
  );
};
