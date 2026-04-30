import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Star, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import {
  explainJerseyRetirementCandidates,
  deriveLeagueStartYearFromHistory,
  type JerseyRetirementDebugRow,
} from '../../services/playerDevelopment/jerseyRetirementChecker';
import type { RetiredJerseyRecord } from '../../types';

interface Props {
  teamId: number;
  isOpen: boolean;
  onClose: () => void;
  accent: string;
  findPlayerImg: (name: string) => string;
}

function tierLabel(tier: RetiredJerseyRecord['tier']): string {
  if (tier === 'automatic') return 'Franchise Icon';
  if (tier === 'fast_track') return 'Title Core';
  if (tier === 'standard') return 'Loyal Star';
  return 'Honorary';
}

export const JerseyRetirementModal: React.FC<Props> = ({
  teamId, isOpen, onClose, accent, findPlayerImg,
}) => {
  const { state, dispatchAction } = useGame();
  const [showIneligible, setShowIneligible] = useState(false);

  const isGM = state.gameMode === 'gm';
  const canAct = !isGM || teamId === (state as any).userTeamId;

  const currentYear = state.leagueStats?.year ?? new Date(state.date).getFullYear();
  const leagueStartYear = useMemo(
    () => deriveLeagueStartYearFromHistory(state.history as any, currentYear),
    [state.history, currentYear],
  );

  const candidates = useMemo(() => {
    if (!isOpen) return [] as JerseyRetirementDebugRow[];
    return explainJerseyRetirementCandidates(
      state.players, state.teams, currentYear, { leagueStartYear },
    ).filter(r => r.teamId === teamId);
  }, [isOpen, state.players, state.teams, currentYear, leagueStartYear, teamId]);

  const ready      = candidates.filter(r => r.outcome === 'candidate');
  const scheduled  = candidates.filter(r => r.outcome === 'skip_not_due');
  const ineligible = candidates.filter(r =>
    r.outcome === 'skip_not_qualified' || r.outcome === 'skip_missing_number',
  );

  const retire = (r: JerseyRetirementDebugRow) => {
    dispatchAction({
      type: 'RETIRE_JERSEY_NUMBER',
      payload: {
        teamId,
        playerId: r.playerId ?? '',
        number: r.number ?? '',
        playerName: r.name,
        seasonsWithTeam: r.seasonsWithTeam ?? 0,
        gamesWithTeam: r.gamesWithTeam ?? 0,
        allStarAppearances: r.allStarAppearances ?? 0,
        championships: r.championships ?? 0,
        tier: r.tier!,
        reason: r.reason!,
      },
    } as any);
    onClose();
  };

  const PlayerRow = ({ r, showButton }: { r: JerseyRetirementDebugRow; showButton: boolean }) => (
    <div className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
      <img
        src={findPlayerImg(r.name)}
        alt={r.name}
        className="w-11 h-11 rounded-full object-cover object-top border border-zinc-700 shrink-0"
        referrerPolicy="no-referrer"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-sm text-zinc-100">{r.name}</span>
          {r.number && <span className="text-sm font-black" style={{ color: accent }}>#{r.number}</span>}
          {r.tier && (
            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 tracking-wider">
              {tierLabel(r.tier)}
            </span>
          )}
        </div>
        <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
          {r.seasonsWithTeam}y · {r.gamesWithTeam}g
          {(r.allStarAppearances ?? 0) > 0 && ` · ${r.allStarAppearances}× All-Star`}
          {(r.championships ?? 0) > 0 && ` · ${r.championships}× Champ`}
        </div>
      </div>
      <div className="shrink-0">
        {showButton ? (
          <button
            onClick={() => retire(r)}
            disabled={!canAct || !r.number || !r.tier}
            className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={canAct ? { backgroundColor: accent, color: '#09090b' } : { backgroundColor: '#27272a', color: '#71717a' }}
          >
            Retire #{r.number}
          </button>
        ) : (
          <div className="flex items-center gap-1 px-2 py-1 bg-zinc-800 rounded-lg">
            <Clock className="w-3 h-3 text-zinc-500" />
            <span className="text-[10px] font-black text-zinc-400">{r.scheduledYear}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4 font-sans"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <div>
                <h2 className="text-base font-black uppercase tracking-widest" style={{ color: accent }}>
                  Retire a Number
                </h2>
                <p className="text-[10px] text-zinc-500 font-mono uppercase mt-0.5">
                  Ceremony happens immediately · {currentYear}
                </p>
              </div>
              <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-5">
              {ready.length > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Star className="w-3.5 h-3.5" style={{ color: accent }} fill={accent} />
                    <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: accent }}>
                      Ready to Retire
                    </span>
                  </div>
                  <div className="space-y-2">
                    {ready.map(r => <PlayerRow key={r.playerId ?? r.name} r={r} showButton />)}
                  </div>
                </section>
              )}

              {scheduled.length > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500">
                      Scheduled Ceremonies
                    </span>
                  </div>
                  <div className="space-y-2">
                    {scheduled.map(r => <PlayerRow key={r.playerId ?? r.name} r={r} showButton={false} />)}
                  </div>
                </section>
              )}

              {ready.length === 0 && scheduled.length === 0 && (
                <p className="text-zinc-600 text-sm italic py-6 text-center">
                  No candidates found for this franchise yet.
                </p>
              )}

              {ineligible.length > 0 && (
                <section>
                  <button
                    onClick={() => setShowIneligible(s => !s)}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    {showIneligible ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Not Eligible ({ineligible.length})
                  </button>
                  {showIneligible && (
                    <div className="mt-2 space-y-1">
                      {ineligible.map(r => (
                        <div key={r.playerId ?? r.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/30 border border-zinc-800/50">
                          <span className="text-xs text-zinc-500 flex-1">{r.name}</span>
                          <span className="text-[10px] text-zinc-700 font-mono">
                            {r.outcome === 'skip_missing_number' ? 'No # on record' : 'Score too low'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
