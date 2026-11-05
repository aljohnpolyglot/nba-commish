import React, { useMemo, useState } from 'react';
import { Check, Film } from 'lucide-react';
import type { MediaProjectInboxAction } from '../../types';
import { useGame } from '../../store/GameContext';
import { getMediaProjectPlayerCandidates } from '../../services/mediaProjects';
import { getScoutedDisplayOverall } from '../../utils/scoutingFuzz';
import { ActionModalShell } from '../shared/actions/ActionModalShell';
import { PlayerSelectorGrid } from '../shared/PlayerSelectorGrid';

type Props = {
  action: MediaProjectInboxAction;
  onClose: () => void;
  onConfirm: (playerIds: string[]) => void;
};

export const MediaProjectPlayerPickerModal: React.FC<Props> = ({ action, onClose, onConfirm }) => {
  const { state } = useGame();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const items = useMemo(() => getMediaProjectPlayerCandidates(state).map(player => {
    const displayOverall = getScoutedDisplayOverall(state, player, state.leagueStats.year);
    return {
      player,
      score: displayOverall,
      ovrLabel: String(displayOverall),
    };
  }), [state]);

  const toggle = (playerId: string) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else if (next.size < action.castSize) next.add(playerId);
      return next;
    });
  };

  return (
    <ActionModalShell
      title={`Cast ${action.projectTitle}`}
      description={`Choose exactly ${action.castSize} active NBA players to lead the documentary series.`}
      icon={<img src={action.brandLogoUrl} alt={action.studioName} className="h-10 w-10 rounded-lg object-contain" />}
      accent="violet"
      wide
      elevated
      onClose={onClose}
      selectedCount={selectedIds.size}
      primaryLabel={`Approve ${action.projectTitle}`}
      primaryDisabled={selectedIds.size !== action.castSize}
      primaryIcon={<Check size={17} />}
      onPrimary={() => onConfirm([...selectedIds])}
      secondaryLabel="Back to Inbox"
      onSecondary={onClose}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <Film size={20} className="mt-0.5 shrink-0 text-red-400" />
          <div>
            <p className="font-black text-white">Build a five-player cast</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Players may come from any NBA team. Each selection becomes part of the confirmed project lineup.
            </p>
          </div>
        </div>
        <PlayerSelectorGrid
          items={items}
          teams={state.teams}
          selectedIds={selectedIds}
          onToggle={toggle}
          maxSelections={action.castSize}
          accentColor="red"
          defaultVisible={30}
          searchPlaceholder="Search active NBA players..."
        />
      </div>
    </ActionModalShell>
  );
};
