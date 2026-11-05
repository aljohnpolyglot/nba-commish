import React, { useState, useMemo } from 'react';
import { Search, CheckCircle2 } from 'lucide-react';
import type { NBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';

export interface TeamPickerGridProps {
  teams: NBATeam[];
  selectedIds: number[];
  onToggle: (teamId: number) => void;
  mode?: 'single' | 'multi';
  excludeIds?: Set<number>;
  searchable?: boolean;
  gridClassName?: string;
  accent?: 'sky' | 'emerald' | 'amber' | 'blue';
  getMeta?: (team: NBATeam) => React.ReactNode;
}

const ACCENT_CLASSES = {
  sky:     { ring: 'bg-sky-600/20 border-sky-500/50',         check: 'text-sky-400' },
  emerald: { ring: 'bg-emerald-600/20 border-emerald-500/50', check: 'text-emerald-400' },
  amber:   { ring: 'bg-amber-600/20 border-amber-500/50',     check: 'text-amber-400' },
  blue:    { ring: 'bg-blue-600/20 border-blue-500/50',       check: 'text-blue-400' },
};

export const TeamPickerGrid: React.FC<TeamPickerGridProps> = ({
  teams,
  selectedIds,
  onToggle,
  mode = 'multi',
  excludeIds,
  searchable = true,
  gridClassName = 'grid-cols-1 sm:grid-cols-2',
  accent = 'sky',
  getMeta,
}) => {
  const [query, setQuery] = useState('');
  const accentClasses = ACCENT_CLASSES[accent];

  const displayed = useMemo(() => {
    const filtered = teams.filter(t => !excludeIds?.has(t.id));
    if (!query.trim()) return filtered;
    const q = query.trim().toLowerCase();
    return filtered.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.abbrev?.toLowerCase().includes(q) ||
      (t.region ?? '').toLowerCase().includes(q)
    );
  }, [teams, query, excludeIds]);

  return (
    <div className="flex flex-col gap-3">
      {searchable && (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search teams…"
            className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
      )}
      <div className={`grid ${gridClassName} gap-3`}>
        {displayed.map(team => {
          const selected = selectedIds.includes(team.id);
          return (
            <button
              key={team.id}
              onClick={() => onToggle(team.id)}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                selected
                  ? accentClasses.ring
                  : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800'
              }`}
            >
              {team.logoUrl && (
                <img src={team.logoUrl} alt={team.name} className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-white">{getTeamFullName(team)}</span>
                {getMeta && <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">{getMeta(team)}</span>}
              </span>
              {selected && <CheckCircle2 size={16} className={`ml-auto ${accentClasses.check}`} />}
              {mode === 'single' && selected && <span className="sr-only">selected</span>}
            </button>
          );
        })}
        {displayed.length === 0 && (
          <p className="col-span-full text-center text-slate-500 text-sm py-6">No teams match.</p>
        )}
      </div>
    </div>
  );
};

export default TeamPickerGrid;
