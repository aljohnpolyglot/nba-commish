import React from 'react';
import { PlayerCreatorModal } from '../../modals/PlayerCreatorModal';
import { useGame } from '../../../store/GameContext';

export const PlayerCreatorView: React.FC = () => {
  const { setCurrentView } = useGame();
  return <PlayerCreatorModal isOpen onClose={() => setCurrentView('League Office')} />;
};
