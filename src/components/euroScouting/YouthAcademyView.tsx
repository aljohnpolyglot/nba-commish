import React from 'react';
import { Building2, Shield } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { getEuroUserTeam } from '../../services/euroScouting/engine';
import { getTeamFullName } from '../../utils/teamNames';
import { isEuroIsolatedMode } from '../../utils/uiMode';
import { YouthAcademyTab } from './YouthAcademyTab';

export const YouthAcademyView: React.FC = () => {
  const { state, setCurrentView } = useGame();
  const team = getEuroUserTeam(state);

  if (!isEuroIsolatedMode(state) || state.gameMode !== 'gm' || !team) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-8 text-center">
          <Shield size={38} className="mx-auto text-slate-600" />
          <h2 className="mt-4 text-xl font-black text-white">Euro Club Access Only</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">The youth academy belongs to your Euro club office.</p>
          <button onClick={() => setCurrentView('Schedule')} className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white">Back to Schedule</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-950 pb-6 text-slate-200">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/95 px-3 backdrop-blur md:px-6">
        <div className="flex min-h-16 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
            {team.logoUrl ? <img src={team.logoUrl} alt="" className="h-full w-full object-contain p-1" /> : <Building2 size={18} className="text-emerald-400" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{getTeamFullName(team)}</p>
            <h1 className="truncate text-sm font-black text-white sm:text-base">Youth Academy</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] p-3 md:p-6">
        <YouthAcademyTab />
      </main>
    </div>
  );
};
