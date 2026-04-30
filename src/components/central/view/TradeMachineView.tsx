import React from 'react';
import { useGame } from '../../../store/GameContext';
import { TradeMachineModal } from '../../modals/TradeMachineModal';
import { Tab } from '../../../types';

interface TradeMachineViewProps {
  onViewChange: (view: Tab) => void;
}

export const TradeMachineView: React.FC<TradeMachineViewProps> = ({ onViewChange }) => {
  const { dispatchAction } = useGame();

  const handleClose = () => {
    onViewChange('NBA Central');
  };

  const handleConfirm = (payload: {
    teamAId: number,
    teamBId: number,
    teamAPlayers: string[],
    teamBPlayers: string[],
    teamAPicks: number[],
    teamBPicks: number[],
    teamACashUSD?: number,
    teamBCashUSD?: number,
    commissionerForced?: boolean
  }) => {
    dispatchAction({ type: 'EXECUTIVE_TRADE', payload } as any);
    onViewChange('NBA Central');
  };

  return (
    <div className="w-full h-full relative bg-black">
      <TradeMachineModal 
        onClose={handleClose} 
        onConfirm={handleConfirm} 
      />
    </div>
  );
};