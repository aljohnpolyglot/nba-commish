import React, { useState } from 'react';
import { Activity, Building2, Map, Shield, Telescope, UserCheck, Users } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { isEuroIsolatedMode } from '../../utils/uiMode';
import { getTeamFullName } from '../../utils/teamNames';
import { getEuroUserTeam, getRegionalScouts } from '../../services/euroScouting/engine';
import { WorldScoutingTab } from './WorldScoutingTab';
import { ScoutingDepartmentTab } from './ScoutingDepartmentTab';

type EuroScoutingTab = 'world' | 'department';

export const EuroScoutingView: React.FC = () => {
  const { state, setCurrentView } = useGame();
  const [tab, setTab] = useState<EuroScoutingTab>('world');
  const team = getEuroUserTeam(state);

  if (!isEuroIsolatedMode(state) || state.gameMode !== 'gm' || !team) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-8 text-center"><Shield size={38} className="mx-auto text-slate-600" /><h2 className="mt-4 text-xl font-black text-white">Euro Club Access Only</h2><p className="mt-2 text-sm leading-relaxed text-slate-500">World scouting and the youth academy belong to your Euro club office.</p><button onClick={() => setCurrentView('Schedule')} className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white">Back to Schedule</button></div>
      </div>
    );
  }

  const assignments = (state.euroScouting?.assignments ?? []).filter(item => item.status !== 'finalized');
  const scouts = getRegionalScouts(team, assignments);
  const available = scouts.filter(scout => !scout.activeAssignmentId).length;
  const teamName = getTeamFullName(team);

  return (
    <div className="min-h-full bg-slate-950 pb-20 text-slate-200 md:pb-6">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/95 px-3 backdrop-blur md:px-6">
        <div className="flex min-h-16 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 md:gap-7">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
                {team.logoUrl ? <img src={team.logoUrl} alt="" className="h-full w-full object-contain p-1" /> : <Building2 size={18} className="text-emerald-400" />}
              </div>
              <div className="min-w-0"><p className="truncate text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{teamName}</p><h1 className="truncate text-sm font-black text-white sm:text-base">Global Scouting</h1></div>
            </div>

            <nav className="flex shrink-0 rounded-lg border border-slate-800 bg-slate-950 p-1">
              <button onClick={() => setTab('world')} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-black sm:px-4 ${tab === 'world' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'}`}><Map size={15} /><span className="hidden sm:inline">World Map</span></button>
              <button onClick={() => setTab('department')} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-black sm:px-4 ${tab === 'department' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'}`}><Users size={15} /><span className="hidden sm:inline">Department</span></button>
            </nav>
          </div>

          <div className="hidden items-center gap-5 lg:flex">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><UserCheck size={16} /><span><strong className="text-white">{available}</strong> / {scouts.length} Scouts</span></div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400"><Activity size={16} /><span><strong className="text-white">{assignments.length}</strong> Active Missions</span></div>
          </div>
        </div>
      </header>

      <main className={tab === 'world' ? 'md:p-4' : 'mx-auto max-w-[1500px] p-3 md:p-6'}>
        {tab === 'world' && <WorldScoutingTab />}
        {tab === 'department' && <ScoutingDepartmentTab />}
      </main>

      <div className="fixed bottom-4 left-4 z-[65] flex rounded-xl border border-slate-700 bg-slate-900/95 p-1 shadow-xl backdrop-blur lg:hidden">
        <button onClick={() => setTab('world')} className={`rounded-lg p-2.5 ${tab === 'world' ? 'bg-blue-600 text-white' : 'text-slate-500'}`} title="World Map"><Map size={17} /></button>
        <button onClick={() => setTab('department')} className={`rounded-lg p-2.5 ${tab === 'department' ? 'bg-blue-600 text-white' : 'text-slate-500'}`} title="Department"><Telescope size={17} /></button>
      </div>
    </div>
  );
};
