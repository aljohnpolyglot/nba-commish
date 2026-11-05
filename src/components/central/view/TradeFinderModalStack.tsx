import React from 'react';
import { TradeMachineModal } from '../../modals/TradeMachineModal';
import type { NBATeam } from '../../../types';
import { TradeFinderRejectionModal } from './TradeFinderOverlays';
import type { ManageTradeState, TradeItem } from './TradeFinderTypes';

export const TradeFinderModalStack: React.FC<{
  manageTrade: ManageTradeState | null;
  onCloseManageTrade: () => void;
  onConfirmTrade: (payload: any) => void;
  selectedTeam?: NBATeam;
  rejectionOpen: boolean;
  basket: TradeItem[];
  onCloseRejection: () => void;
}> = ({
  manageTrade,
  onCloseManageTrade,
  onConfirmTrade,
  selectedTeam,
  rejectionOpen,
  basket,
  onCloseRejection,
}) => (
  <>
    {manageTrade && (
      <TradeMachineModal
        onClose={onCloseManageTrade}
        onConfirm={onConfirmTrade}
        initialTeamAId={manageTrade.teamAId}
        initialTeamBId={manageTrade.teamBId}
        initialTeamAPlayerIds={manageTrade.teamAPlayerIds}
        initialTeamBPlayerIds={manageTrade.teamBPlayerIds}
        initialTeamAPickDpids={manageTrade.teamAPickDpids}
        initialTeamBPickDpids={manageTrade.teamBPickDpids}
        initialPreAccepted={manageTrade.preAccepted}
      />
    )}

    <TradeFinderRejectionModal
      open={rejectionOpen}
      selectedTeam={selectedTeam}
      basket={basket}
      onClose={onCloseRejection}
    />
  </>
);
