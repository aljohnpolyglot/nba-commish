import { useRef, useState } from 'react';
import { useGame } from '../../store/GameContext';
import { hasPreparedExpansionDraft } from '../../services/expansion/expansionDraftFlow';
import { ExpansionDraftView } from '../expansion/ExpansionDraftView';
import { PlayerProtectionModal } from '../expansion/PlayerProtectionModal';

interface Props {
  onClose: () => void;
}

export function ExpansionDraftTaskFlow({ onClose }: Props) {
  const { state, dispatchAction } = useGame();
  const resumeDraft = useRef(hasPreparedExpansionDraft(state));
  const [draftOpen, setDraftOpen] = useState(resumeDraft.current);

  if (draftOpen) {
    return <ExpansionDraftView onClose={onClose} />;
  }

  return (
    <PlayerProtectionModal
      onClose={onClose}
      onConfirm={async protections => {
        await dispatchAction({ type: 'SET_EXPANSION_PROTECTIONS', payload: { protections } } as any);
        await dispatchAction({ type: 'APPLY_EXPANSION_REALIGNMENT' } as any);
        setDraftOpen(true);
      }}
    />
  );
}

export const CommissionerExpansionDraftFlow = ExpansionDraftTaskFlow;
