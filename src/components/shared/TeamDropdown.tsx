import React from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';

export interface TeamDropdownProps {
  label: string;
  selectedTeamId: number | null;
  onSelect: (id: number) => void;
  teams: (NBATeam & { wins: number; losses: number })[];
  otherTeamId?: number | null;
  isOpen: boolean;
  onToggle: () => void;
  /** Compact mode: matches h-7 height of adjacent filter chips */
  compact?: boolean;
  /** Placeholder shown when no team is selected */
  placeholder?: string;
}

export const TeamDropdown: React.FC<TeamDropdownProps> = ({
  label,
  selectedTeamId,
  onSelect,
  teams,
  otherTeamId,
  isOpen,
  onToggle,
  compact = false,
  placeholder = 'Select team...',
}) => {
  const selectedTeam = teams.find(t => t.id === selectedTeamId);
  const visibleTeams = teams.filter(t => t.id !== otherTeamId);
  const sortTeams = (a: NBATeam & { wins: number; losses: number }, b: NBATeam & { wins: number; losses: number }) => {
    const ga = (a.wins ?? 0) + (a.losses ?? 0);
    const gb = (b.wins ?? 0) + (b.losses ?? 0);
    const pa = ga > 0 ? (a.wins ?? 0) / ga : 0;
    const pb = gb > 0 ? (b.wins ?? 0) / gb : 0;
    return pb - pa || (b.wins ?? 0) - (a.wins ?? 0);
  };
  const conferenceGroups = (() => {
    const uniqueConfs = Array.from(new Set(
      visibleTeams
        .map(t => (t.conference ?? '').trim())
        .filter(Boolean),
    ));
    if (uniqueConfs.length === 0) {
      return [{ key: 'all', label: 'Teams', teams: [...visibleTeams].sort(sortTeams) }];
    }
    const isStandardNbaSplit = uniqueConfs.length === 2 && uniqueConfs.includes('East') && uniqueConfs.includes('West');
    if (isStandardNbaSplit) {
      return ['East', 'West'].map(conf => ({
        key: conf,
        label: conf === 'East' ? 'Eastern Conference' : 'Western Conference',
        teams: visibleTeams.filter(t => t.conference === conf).sort(sortTeams),
      }));
    }
    return uniqueConfs.map(conf => ({
      key: conf,
      label: uniqueConfs.length === 1 ? `${conf} Teams` : conf,
      teams: visibleTeams.filter(t => (t.conference ?? '').trim() === conf).sort(sortTeams),
    }));
  })();

  return (
    <div className="relative flex-1 min-w-0">
      {label && <div className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1.5 ml-1">{label}</div>}
      <button
        onClick={onToggle}
        className={compact
          ? 'w-full h-7 bg-slate-900 border-y border-slate-700 text-white text-xs px-1.5 outline-none flex items-center justify-between hover:border-slate-500 transition-colors'
          : 'w-full bg-[#161616] border border-slate-700/50 rounded-lg text-sm text-white p-2.5 outline-none flex items-center justify-between hover:border-slate-500 hover:bg-[#222] transition-all'
        }
      >
        <div className={`flex items-center truncate ${compact ? 'gap-1.5' : 'gap-3'}`}>
          {selectedTeam ? (
            <>
              <img src={selectedTeam.logoUrl} alt="" className={compact ? 'w-4 h-4 object-contain' : 'w-6 h-6 object-contain'} />
              <span className={`font-black uppercase tracking-tight truncate ${compact ? 'text-xs' : ''}`}>
                {compact ? selectedTeam.abbrev : getTeamFullName(selectedTeam)}
              </span>
            </>
          ) : (
            <span className={`font-bold italic ${compact ? 'text-slate-400 text-xs' : 'text-slate-600'}`}>{placeholder}</span>
          )}
        </div>
        <ChevronDown size={compact ? 12 : 18} className={`text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[70]" onClick={onToggle} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className={`absolute top-full left-0 mt-2 bg-[#1a1a1a] border border-slate-700 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[80] max-h-[60vh] overflow-hidden flex flex-col ${compact ? 'w-72' : 'right-0'}`}
            >
              <div className="overflow-y-auto custom-scrollbar flex-1">
                {conferenceGroups.map(group => (
                  <div key={group.key}>
                    <div className="bg-[#111] px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] sticky top-0 border-b border-slate-800 z-10 flex justify-between items-center">
                      <span>{group.label}</span>
                      <span className="text-[8px] opacity-50">W-L</span>
                    </div>
                    {group.teams.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { onSelect(t.id); onToggle(); }}
                          className={`w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800 transition-all border-b border-slate-800/50 last:border-0 ${selectedTeamId === t.id ? 'bg-indigo-600/20 text-indigo-400' : ''}`}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <img src={t.logoUrl} alt="" className="w-8 h-8 object-contain" />
                            <div className="text-left truncate">
                              <div className="text-sm font-black uppercase tracking-tight truncate">{t.abbrev}</div>
                              <div className="text-[10px] font-bold text-slate-500 truncate">{getTeamFullName(t)}</div>
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
