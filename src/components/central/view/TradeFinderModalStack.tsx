import React from 'react';
import { TradeMachineModal } from '../../modals/TradeMachineModal';
import type { NBATeam } from '../../../types';
import { TradeFinderOwnerWarningModal, TradeFinderRejectionModal } from './TradeFinderOverlays';
import type { ManageTradeState, TradeItem } from './TradeFinderTypes';

export const TradeFinderModalStack: React.FC<{
  manageTrade: ManageTradeState | null;
  onCloseManageTrade: () => void;
  onConfirmTrade: (payload: any) => void;
  ownerWarningOpen: boolean;
  selectedTeam?: NBATeam;
  ownerWarningLifer: string | null;
  ownerWarningMode: 'reverse' | 'own';
  onCloseOwnerWarning: () => void;
  onIgnoreOwnerWarning: () => void;
  rejectionOpen: boolean;
  basket: TradeItem[];
  onCloseRejection: () => void;
}> = ({
  manageTrade,
  onCloseManageTrade,
  onConfirmTrade,
  ownerWarningOpen,
  selectedTeam,
  ownerWarningLifer,
  ownerWarningMode,
  onCloseOwnerWarning,
  onIgnoreOwnerWarning,
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

    <TradeFinderOwnerWarningModal
      open={ownerWarningOpen}
      selectedTeam={selectedTeam}
      ownerWarningLifer={ownerWarningLifer}
      ownerWarningMode={ownerWarningMode}
      onClose={onCloseOwnerWarning}
      onIgnore={onIgnoreOwnerWarning}
    />

    <TradeFinderRejectionModal
      open={rejectionOpen}
      selectedTeam={selectedTeam}
      basket={basket}
      onClose={onCloseRejection}
    />
  </>
);
