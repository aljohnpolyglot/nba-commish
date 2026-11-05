import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, UserPlus, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import {
  getAllStarReplacementCandidateItems,
  getOutstandingAllStarInjuries,
} from '../../../services/allStar/allStarInjuryReplacements';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { PlayerSelectorGrid } from '../../shared/PlayerSelectorGrid';

interface AllStarReplacementModalProps {
  onClose: () => void;
  onConfirm: (
    injuredId: string,
    injuredName: string,
    replacementId: string,
    replacementName: string,
    conference: string,
  ) => void | Promise<void>;
  initialInjuredPlayerId?: string;
}

export const AllStarReplacementModal: React.FC<AllStarReplacementModalProps> = ({
  onClose,
  onConfirm,
  initialInjuredPlayerId,
}) => {
  const { state } = useGame();
  const outstanding = getOutstandingAllStarInjuries(state);
  const [pickerForId, setPickerForId] = useState<string | null>(() =>
    outstanding.some(item => item.entry.playerId === initialInjuredPlayerId)
      ? initialInjuredPlayerId ?? null
      : null,
  );
  const selected = outstanding.find(item => item.entry.playerId === pickerForId);
  const candidates = useMemo(
    () => getAllStarReplacementCandidateItems(state, selected?.entry.conference),
    [selected?.entry.conference, state],
  );

  useEffect(() => {
    if (pickerForId && !outstanding.some(item => item.entry.playerId === pickerForId)) {
      setPickerForId(null);
    }
  }, [outstanding, pickerForId]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-[2rem]"
      >
        <div className="flex items-center gap-3 border-b border-slate-800 p-4 sm:p-6">
          {selected && (
            <button
              onClick={() => setPickerForId(null)}
              className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white"
              aria-label="Back to injured All-Stars"
            >
              <ArrowLeft size={17} />
            </button>
          )}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
            <UserPlus size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-rose-300">League Office</p>
            <h3 className="truncate text-lg font-black uppercase tracking-tight text-white sm:text-xl">
              {selected ? `Replace ${selected.entry.playerName}` : 'All-Star Injury Replacements'}
            </h3>
            <p className="text-xs text-slate-500">
              {selected
                ? 'Choose an eligible NBA player who is not already an All-Star.'
                : 'Only injured, announced All-Stars require action.'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-900 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-4 sm:p-6">
          {selected ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-3">
                <PlayerPortrait
                  imgUrl={selected.player.imgURL}
                  face={selected.player.face}
                  playerName={selected.player.name}
                  teamLogoUrl={state.teams.find(team => team.id === selected.player.tid)?.logoUrl}
                  overallRating={selected.player.overallRating}
                  size={48}
                />
                <div className="min-w-0">
                  <p className="truncate font-black text-white">{selected.entry.playerName}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-300">
                    Injured · {selected.entry.conference} · {selected.entry.isStarter ? 'Starter' : 'Reserve'}
                  </p>
                </div>
              </div>
              <PlayerSelectorGrid
                items={candidates}
                teams={state.teams}
                selectedIds={new Set<string>()}
                onToggle={async replacementId => {
                  const replacement = state.players.find(player => player.internalId === replacementId);
                  if (!replacement) return;
                  await onConfirm(
                    selected.entry.playerId,
                    selected.entry.playerName,
                    replacement.internalId,
                    replacement.name,
                    selected.entry.conference,
                  );
                  setPickerForId(null);
                }}
                maxSelections={1}
                replaceSelectionAtLimit
                accentColor="red"
                defaultVisible={30}
                searchPlaceholder="Search non-All-Stars..."
              />
            </div>
          ) : outstanding.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-300">
                <AlertTriangle size={13} />
                {outstanding.length} replacement{outstanding.length === 1 ? '' : 's'} required
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {outstanding.map(({ entry, player }) => {
                  const team = state.teams.find(candidate => candidate.id === player.tid);
                  return (
                    <button
                      key={entry.playerId}
                      onClick={() => setPickerForId(entry.playerId)}
                      className="flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-3 text-left transition hover:border-rose-400/50 hover:bg-rose-500/10"
                    >
                      <PlayerPortrait
                        imgUrl={player.imgURL}
                        face={player.face}
                        playerName={player.name}
                        teamLogoUrl={team?.logoUrl}
                        overallRating={player.overallRating}
                        size={48}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-black text-white">{entry.playerName}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          {team?.abbrev ?? entry.teamAbbrev} · {player.injury?.type ?? 'Injured'}
                        </p>
                      </div>
                      <span className="rounded-lg bg-rose-500 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white">
                        Replace
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">✓</div>
              <h4 className="text-lg font-black text-white">All replacements are set</h4>
              <p className="mt-1 text-sm text-slate-500">There are no injured All-Stars waiting for a replacement.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-800 p-4 sm:p-5">
          <button onClick={onClose} className="w-full rounded-xl bg-slate-800 px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-slate-700 sm:w-auto">
            {outstanding.length > 0 ? 'Close' : 'Done'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
