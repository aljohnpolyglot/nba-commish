import React from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NBATeam } from '../../types';

export interface TeamDropdownProps {
  label: string;
  selectedTeamId: number | null;
  onSelect: (id: number) => void;
  teams: (NBATeam & { wins: number; losses: number })[];
  otherTeamId?: number | null;
  isOpen: boolean;
  onToggle: () => void;
}

export const TeamDropdown: React.FC<TeamDropdownProps> = ({
  label,
  selectedTeamId,
  onSelect,
  teams,
  otherTeamId,
  isOpen,
  onToggle,
}) => {
  const selectedTeam = teams.find(t => t.id === selectedTeamId);

  return (
    <div className="relative flex-1 min-w-0">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1.5 ml-1">{label}</div>
      <button
        onClick={onToggle}
        className="w-full bg-[#161616] border border-slate-700/50 rounded-lg text-sm text-white p-2.5 outline-none flex items-center justify-between hover:border-slate-500 hover:bg-[#222] transition-all"
      >
        <div className="flex items-center gap-3 truncate">
          {selectedTeam ? (
            <>
              <img src={selectedTeam.logoUrl} alt="" className="w-6 h-6 object-contain" />
              <span className="font-black uppercase tracking-tight truncate">{selectedTeam.name}</span>
            </>
          ) : (
            <span className="text-slate-600 font-bold italic">Select team...</span>
          )}
        </div>
        <ChevronDown size={18} className={`text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[70]" onClick={onToggle} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-slate-700 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[80] max-h-[60vh] overflow-hidden flex flex-col"
            >
              <div className="overflow-y-auto custom-scrollbar flex-1">
                {['East', 'West'].map(conf => (
                  <div key={conf}>
                    <div className="bg-[#111] px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] sticky top-0 border-b border-slate-800 z-10 flex justify-between items-center">
                      <span>{conf}ern Conference</span>
                      <span className="text-[8px] opacity-50">W-L</span>
                    </div>
                    {teams
                      .filter(t => t.conference === conf && t.id !== otherTeamId)
                      .map(t => (
                        <button
                          key={t.id}
                          onClick={() => { onSelect(t.id); onToggle(); }}
                          className={`w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800 transition-all border-b border-slate-800/50 last:border-0 ${selectedTeamId === t.id ? 'bg-indigo-600/20 text-indigo-400' : ''}`}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <img src={t.logoUrl} alt="" className="w-8 h-8 object-contain" />
                            <div className="text-left truncate">
                              <div className="text-sm font-black uppercase tracking-tight truncate">{t.abbrev}</div>
                              <div className="text-[10px] font-bold text-slate-500 truncate">{t.region} {t.name}</div>
                            </div>
                          </div>
                          <div className="text-xs font-mono font-black text-slate-400">
                            {t.wins}-{t.losses}
                          </div>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
