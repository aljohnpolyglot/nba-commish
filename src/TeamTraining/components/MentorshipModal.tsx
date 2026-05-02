import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, GraduationCap, Users, Search, Check } from 'lucide-react';
import { Player, Team } from '../types';
import { PlayerPortrait } from '../../components/shared/PlayerPortrait';
import { formatMentorExp } from '../../services/training/mentorScore';

interface MentorshipModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player | null;
  roster: Player[];
  teams: Team[];
  onSelectMentor: (playerId: string, mentorId: string | null) => void;
}

export const MentorshipModal: React.FC<MentorshipModalProps> = ({
  isOpen,
  onClose,
  player,
  roster,
  onSelectMentor,
}) => {
  // Hooks MUST run unconditionally on every render — early-return below
  // can't come before them or React throws "Rendered more hooks than during
  // the previous render". useMemos guard their own null cases.
  const [search, setSearch] = useState('');

  const potentialMentors = useMemo(() => {
    if (!player) return [] as { player: Player; exp: number; mentoringName?: string }[];
    // Build "who is each mentor currently mentoring" map so we can flag taken vets.
    // One mentor per player (docs/mentorship.md §1).
    const mentoringMap = new Map<string, string>();
    for (const r of roster) {
      if (r.mentorId && r.id !== player.id) mentoringMap.set(r.mentorId, r.name);
    }
    return roster
      .filter(p => p.id !== player.id && p.exp >= 5)
      .map(p => ({
        player: p,
        exp: p.mentorExp ?? 0,
        mentoringName: mentoringMap.get(p.id),
      }))
      .sort((a, b) => b.exp - a.exp);
  }, [roster, player?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return potentialMentors;
    return potentialMentors.filter(m => m.player.name.toLowerCase().includes(q));
  }, [potentialMentors, search]);

  if (!player) return null;

  const handleCardClick = (mentorId: string) => {
    // Click-to-toggle — clicking the current mentor card removes them (null).
    if (player.mentorId === mentorId) {
      onSelectMentor(player.id, null);
    } else {
      onSelectMentor(player.id, mentorId);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between gap-4 flex-shrink-0">
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 shrink-0">
                  <GraduationCap size={22} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base md:text-xl font-black text-white uppercase tracking-tight truncate">Mentorship Program</h3>
                  <p className="text-[10px] md:text-xs text-slate-400 truncate">
                    Pick a vet for <span className="text-white font-bold">{player.name}</span> · Click selected card to remove
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search + counter */}
            <div className="px-6 pt-4 pb-2 flex items-center gap-3 flex-shrink-0">
              <div className="relative flex-1 max-w-sm">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search veterans..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-slate-600 placeholder-slate-500"
                />
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <Users size={12} />
                {filtered.length} eligible
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-3">
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-slate-500 italic text-sm">
                  {potentialMentors.length === 0
                    ? 'No veterans with 5+ NBA seasons on your roster.'
                    : 'No veterans match your search.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtered.map(({ player: m, exp, mentoringName }) => {
                    const isSelected = player.mentorId === m.id;
                    const isTaken = !!mentoringName && !isSelected;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleCardClick(m.id)}
                        disabled={isTaken}
                        className={`group relative p-4 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'bg-indigo-500/15 border-indigo-500 shadow-lg shadow-indigo-500/10'
                            : isTaken
                              ? 'bg-slate-950/40 border-slate-900 opacity-50 cursor-not-allowed'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-600 hover:bg-slate-900'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-indigo-500 border-2 border-slate-900 flex items-center justify-center shadow-lg">
                            <Check size={12} className="text-white" strokeWidth={3} />
                          </div>
                        )}

                        <div className="flex items-start gap-3 mb-3">
                          <PlayerPortrait
                            imgUrl={m.imgURL}
                            playerName={m.name}
                            size={44}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-black text-white truncate">{m.name}</div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                              {m.pos}
                            </div>
                          </div>
                        </div>

                        {/* EXP only — RS/PO + traits intentionally hidden so the user
                            judges the mentor by the headline number alone. */}
                        <div className="flex items-baseline justify-between">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">EXP</span>
                          <span className={`text-3xl font-black tabular-nums ${isSelected ? 'text-indigo-300' : 'text-white'}`}>
                            {formatMentorExp(exp)}
                          </span>
                        </div>

                        {isTaken && (
                          <div className="mt-2 pt-2 border-t border-slate-800/60 text-[9px] font-bold text-rose-400 uppercase tracking-widest truncate">
                            Mentoring {mentoringName}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950/50 border-t border-slate-800 flex justify-between items-center flex-shrink-0">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest hidden md:block">
                Click selected mentor to remove · Higher EXP = better mentor
              </span>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
