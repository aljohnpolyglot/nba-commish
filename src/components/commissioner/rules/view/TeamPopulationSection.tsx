// Pro-Team Population-Editor. Population (Marktgröße in Millionen) treibt
// Revenue, FA-Desirability und Sponsorship-Math. Default kommt aus
// staticNbaTeams.ts / fictionalTeams.ts; expansion-Teams haben ihren eigenen
// Pop-Wert aus dem Setup-Modal.
//
// Reducer-Action: UPDATE_TEAM_POP { tid, pop }

import React, { useState, useMemo } from 'react';
import { Globe2, Search } from 'lucide-react';
import { useGame } from '../../../../store/GameContext';

export const TeamPopulationSection: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const [search, setSearch] = useState('');

  const teams = useMemo(() => {
    const all = (state.teams ?? []) as any[];
    const filtered = search.trim()
      ? all.filter(t =>
          (t.region ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (t.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (t.abbrev ?? '').toLowerCase().includes(search.toLowerCase())
        )
      : all;
    return [...filtered].sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
  }, [state.teams, search]);

  const handleChange = (tid: number, value: string) => {
    const pop = parseFloat(value);
    if (Number.isNaN(pop) || pop < 0) return;
    dispatchAction({ type: 'UPDATE_TEAM_POP', payload: { tid, pop } } as any);
  };

  return (
    <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-800/50 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe2 size={16} className="text-sky-400" />
          <h2 className="text-lg font-black text-white uppercase tracking-tight">Team Population</h2>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter…"
            className="bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-2 py-1 text-xs text-white w-32 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <p className="text-[10px] text-slate-400 leading-relaxed">
        Population in millions. Drives revenue, FA desirability, sponsorship math.
        Sorted by current value (largest market first).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-[60vh] overflow-y-auto pr-1">
        {teams.map(team => {
          const tid = team.id ?? team.tid;
          if (tid == null || tid < 0) return null;
          return (
            <div key={tid} className="flex items-center gap-2 px-2 py-1.5 bg-slate-900/40 rounded-lg border border-slate-800">
              <div className="text-[10px] font-mono text-slate-500 w-10">{team.abbrev}</div>
              <div className="flex-1 text-xs text-white truncate">
                {team.region} {team.name}
              </div>
              <input
                type="number"
                step="0.1"
                min="0"
                defaultValue={team.pop ?? 2.0}
                onBlur={(e) => handleChange(tid, e.target.value)}
                className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[9px] text-slate-500 w-3">M</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
