import React, { useMemo, useState } from 'react';
import { BriefcaseBusiness, CheckCircle2, MapPin, Plus, Star, Telescope, User, Users } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { getAcademyDirector, getEuroUserTeam } from '../../services/euroScouting/engine';
import type { EuroScoutingAssignment } from '../../services/euroScouting/types';
import { CountryFlag } from '../shared/CountryFlag';
import { ScoutingReportModal } from './ScoutingReportModal';
import { getStaffImageUrl, resolveStaffImageId } from '../../utils/staffPortrait';
import { buildScoutingPipeline, filterScoutingPipeline, type ScoutingPipelineStage } from '../../services/euroScouting/pipeline';
import { ScoutingPipelineModal } from './ScoutingPipelineModal';

const regionalRoles = ['Regional Scout', 'Regional Scout 2', 'Regional Scout 3', 'Regional Scout 4'];

export const ScoutingDepartmentTab: React.FC = () => {
  const { state, setCurrentView } = useGame();
  const [report, setReport] = useState<EuroScoutingAssignment | null>(null);
  const [pipelineStage, setPipelineStage] = useState<ScoutingPipelineStage | null>(null);
  const team = getEuroUserTeam(state);
  const staff = team?.tycoon?.staffMembers ?? [];
  const assignments = (state.euroScouting?.assignments ?? []).filter(item => item.status !== 'finalized');
  const archivedReports = (state.euroScouting?.assignments ?? []).filter(item => item.status === 'finalized').slice(-8).reverse();
  const chiefScout = staff.find(member => member.role === 'Chief Scout');
  const director = getAcademyDirector(team);
  const directorPortrait = director ? director.playerPortraitUrl ?? getStaffImageUrl(resolveStaffImageId(director)) : null;
  const regionalScouts = regionalRoles.map(role => staff.find(member => member.role === role));
  const pipelineRecords = useMemo(() => buildScoutingPipeline(state), [state]);
  const openStaff = () => setCurrentView('Front Office Staff');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">International Network</p><h2 className="mt-1 text-2xl font-black text-white md:text-3xl">Scouting Department</h2><p className="mt-2 max-w-2xl text-sm text-slate-500">Deploy your regional scouts, follow their trips, and review every player they discover.</p></div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-center"><p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Available</p><p className="mt-1 text-xl font-black text-emerald-300">{regionalScouts.filter(Boolean).length - assignments.filter(item => item.status === 'active').length}<span className="text-sm text-slate-600">/{regionalScouts.filter(Boolean).length}</span></p></div>
          <button onClick={openStaff} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-black text-white hover:border-blue-500">Manage Staff</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {regionalRoles.map((role, index) => {
          const member = regionalScouts[index];
          const assignment = member ? assignments.find(item => item.scoutId === member.id) : undefined;
          const portrait = member ? member.playerPortraitUrl ?? getStaffImageUrl(resolveStaffImageId(member)) : null;
          return (
            <article key={role} className={`overflow-hidden rounded-2xl border ${member ? 'border-slate-800 bg-slate-900/75' : 'border-dashed border-slate-700 bg-slate-950/35'}`}>
              {member ? <>
                <div className="relative border-b border-slate-800 bg-slate-800/25 p-5 text-center">
                  {assignment?.status === 'active' && <span className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]" />}
                  <button onClick={openStaff} className="relative mx-auto block" title="Open staff profile">
                    <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-slate-700 bg-slate-800">{portrait ? <img src={portrait} alt={member.name} className="h-full w-full object-cover" /> : <User size={30} className="text-slate-500" />}</span>
                    <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-900 bg-emerald-600 text-xs font-black text-white">{Math.round(member.rating ?? 60)}</span>
                  </button>
                  <h3 className="mt-4 truncate text-base font-black text-white">{member.name}</h3><p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{role}</p>
                  <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black ${assignment ? 'border-blue-500/25 bg-blue-500/10 text-blue-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'}`}>{assignment ? 'On Assignment' : 'Available for Deployment'}</span>
                </div>
                <div className="flex min-h-48 flex-col p-4">
                  {assignment ? <>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Current Location</p><div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/55 p-3"><CountryFlag country={assignment.countryName} className="inline-flex h-4 w-6 rounded-sm" /><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{assignment.countryName}</p><p className="text-[10px] text-blue-400">{assignment.status === 'ready' ? 'Report ready' : 'Scouting active'}</p></div></div>
                    <div className="mt-auto pt-4"><div className="flex items-center justify-between text-[10px] text-slate-500"><span>{assignment.prospects.length} prospects found</span><span>{assignment.durationDays} days</span></div><button onClick={() => setReport(assignment)} className="mt-3 w-full rounded-lg border border-blue-500/25 bg-blue-500/10 py-2 text-xs font-black text-blue-300 hover:bg-blue-500/20">View Report</button></div>
                  </> : <div className="flex flex-1 flex-col items-center justify-center text-center"><MapPin size={28} className="text-slate-700" /><p className="mt-3 text-sm font-black text-slate-300">Waiting for Orders</p><p className="mt-1 max-w-44 text-xs text-slate-600">Choose a country from the World Map to begin a trip.</p></div>}
                </div>
              </> : <button onClick={openStaff} className="flex min-h-[360px] w-full flex-col items-center justify-center p-6 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-700 text-slate-500"><Plus size={22} /></span><p className="mt-4 font-black text-white">Regional Scout {index + 1}</p><p className="mt-1 text-xs text-slate-600">Fill this position in Team Office</p></button>}
            </article>
          );
        })}
      </div>

      {archivedReports.length > 0 && <section><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Scouting Department</p><h3 className="mt-1 text-lg font-black text-white">Report Archive</h3></div><span className="text-xs font-bold text-slate-500">{archivedReports.length} recent</span></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{archivedReports.map(assignment => <button key={assignment.id} onClick={() => setReport(assignment)} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-left hover:border-blue-500/40"><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><CountryFlag country={assignment.countryName} className="inline-flex h-4 w-6 shrink-0 rounded-sm" /><p className="truncate text-sm font-black text-white">{assignment.countryName}</p></div><span className="text-[10px] font-black text-blue-300">Open</span></div><p className="mt-1 truncate text-[10px] text-slate-500">{assignment.scoutName} · {assignment.assignedProspectIds.length} retained · {assignment.prospects.length} reported</p></button>)}</div></section>}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Department Record</p><h3 className="mt-1 text-lg font-black text-white">Scouting Pipeline</h3><p className="mt-1 text-xs text-slate-500">Follow every saved report from first identification to the senior team.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-3">{([['reported', 'Reported'], ['academy', 'Joined Academy'], ['senior', 'Reached Senior']] as Array<[ScoutingPipelineStage, string]>).map(([stage, label]) => { const count = filterScoutingPipeline(pipelineRecords, stage).length; return <button type="button" key={stage} onClick={() => setPipelineStage(stage)} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-left transition hover:border-violet-400/40"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p><div className="mt-2 flex items-end justify-between"><span className="text-3xl font-black text-white">{count}</span><span className="text-[10px] font-black text-violet-300">View players</span></div></button>; })}</div></section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-emerald-500/10 via-slate-900 to-slate-900 p-5"><div className="flex items-start gap-4">{director && <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-500/25 bg-slate-800">{directorPortrait ? <img src={directorPortrait} alt={director.name} className="h-full w-full object-cover" /> : <User size={28} className="text-slate-500" />}</div>}<div className="min-w-0 flex-1"><BriefcaseBusiness size={19} className="text-emerald-400" /><p className="mt-3 text-[10px] font-black uppercase tracking-widest text-emerald-300">Head of Academy</p><h3 className="mt-1 truncate text-lg font-black text-white">{director?.name ?? 'Position Vacant'}</h3><p className="mt-2 max-w-md text-xs leading-relaxed text-slate-400">Leads daily development for every player in your youth academy.</p></div>{director && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center"><Star size={14} className="mx-auto text-emerald-300" /><p className="mt-1 text-lg font-black text-emerald-200">{Math.round(director.rating ?? 60)}</p></div>}</div>{!director && <button onClick={openStaff} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white">Fill Position</button>}</div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex items-center gap-2"><Telescope size={17} className="text-blue-400" /><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Department Lead</p></div><h3 className="mt-3 text-lg font-black text-white">{chiefScout?.name ?? 'Chief Scout Vacant'}</h3><p className="mt-2 text-xs leading-relaxed text-slate-500">Sets the evaluation standard used across every report.</p><div className="mt-4 flex items-center gap-2 text-xs text-slate-400"><CheckCircle2 size={14} className="text-emerald-400" />{(state.euroScouting?.assignments ?? []).filter(item => item.status === 'finalized').length} reports completed</div></div>
      </section>

      {report && <ScoutingReportModal assignment={state.euroScouting?.assignments.find(item => item.id === report.id) ?? report} onClose={() => setReport(null)} />}
      {pipelineStage && <ScoutingPipelineModal stage={pipelineStage} records={pipelineRecords} onClose={() => setPipelineStage(null)} />}
    </div>
  );
};
