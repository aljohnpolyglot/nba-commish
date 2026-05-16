import React, { useMemo } from 'react';
import { Globe2, UserX } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { isFilipino, getImportRuleForConference } from '../../services/pba/importManager';
import { formatHeight } from '../../utils/helpers';
import type { NBAPlayer } from '../../types';

export const PBAImportTracker: React.FC = () => {
  const { state } = useGame();
  const ls = state.leagueStats as any;
  const conference = ls?.pbaConference ?? 'philippine';
  const rule = getImportRuleForConference(conference);

  const pbaTeams = useMemo(() => {
    return ((state as any).nonNBATeams ?? []).filter((t: any) => t.tid >= 2000 && t.tid < 2100);
  }, [(state as any).nonNBATeams]);

  const imports = useMemo(() => {
    return state.players.filter(p =>
      p.tid >= 2000 && p.tid < 2100 && (p as any).isImport
    );
  }, [state.players]);

  if (rule === 'none') {
    return (
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-6 text-center">
        <UserX className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <h3 className="text-sm font-black text-slate-400 uppercase">No Imports Allowed</h3>
        <p className="text-xs text-slate-600 mt-1">The Philippine Cup is an All-Filipino conference.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Globe2 className="w-4 h-4 text-indigo-400" />
        <h3 className="text-xs font-black text-white uppercase tracking-widest">Import Tracker</h3>
        <span className="text-[10px] text-slate-500 ml-auto">
          {rule === 'one_no_height_limit' ? 'No Height Limit' : "Max 6'5\""}
        </span>
      </div>

      <div className="space-y-2">
        {pbaTeams.map((team: any) => {
          const imp = imports.find(p => p.tid === team.tid);
          return (
            <div
              key={team.tid}
              className="flex items-center gap-3 px-4 py-2.5 bg-slate-900/40 border border-slate-800/30 rounded-xl"
            >
              {team.imgURL && <img src={team.imgURL} alt="" className="w-5 h-5 object-contain flex-shrink-0" />}
              <span className="text-xs font-bold text-slate-300 flex-1 truncate">
                {team.name ?? team.abbrev}
              </span>
              {imp ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{imp.name}</span>
                  <span className="text-[10px] text-slate-500">{formatHeight(imp.hgt)}</span>
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase">
                    Active
                  </span>
                </div>
              ) : (
                <span className="text-[10px] font-bold text-slate-600 uppercase">No Import</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
