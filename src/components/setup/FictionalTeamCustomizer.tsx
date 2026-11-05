import React, { useMemo, useRef, useState } from 'react';
import { Dices, Edit2, Plus, Trash2 } from 'lucide-react';
import type { BuilderConference, BuilderTeam, GeneratedTeamCatalogEntry } from './fictionalLeagueBuilderTypes';
import { catalogTeamToBuilder, validateBuilder } from './fictionalLeagueBuilderTypes';
import { AddTeamChoice, DeleteStructureDialog, RenameStructureDialog, TemplateTeamPicker } from './FictionalTeamDialogs';
import { FictionalTeamEditor } from './FictionalTeamEditor';

type StructureTarget = { type: 'conference' | 'division'; confId: string; divId?: string; name: string };
type DivisionTarget = { confId: string; divId: string };

export function FictionalTeamCustomizer({ conferences, catalog, onChange, onProceed }: {
  conferences: BuilderConference[];
  catalog: GeneratedTeamCatalogEntry[];
  onChange: React.Dispatch<React.SetStateAction<BuilderConference[]>>;
  onProceed: () => void;
}) {
  const nextTeamId = useRef(Math.max(100, ...conferences.flatMap(conference => conference.divisions.flatMap(division => division.teams.map(team => team.id + 1)))));
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [editingTeam, setEditingTeam] = useState<BuilderTeam | null>(null);
  const [newTeamDivisionId, setNewTeamDivisionId] = useState<string | undefined>();
  const [addTarget, setAddTarget] = useState<DivisionTarget | null>(null);
  const [templateTarget, setTemplateTarget] = useState<DivisionTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<StructureTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StructureTarget | null>(null);
  const validationError = useMemo(() => validateBuilder(conferences), [conferences]);

  const randomize = () => {
    if (catalog.length === 0) return;
    const available = [...catalog].sort(() => Math.random() - 0.5);
    onChange(previous => previous.map(conference => ({
      ...conference,
      divisions: conference.divisions.map(division => ({
        ...division,
        teams: division.teams.map(existing => catalogTeamToBuilder(available.pop() ?? {}, existing.id)),
      })),
    })));
  };

  const addConference = () => {
    onChange(previous => {
      const cid = Math.max(-1, ...previous.map(conference => conference.cid)) + 1;
      return [...previous, { id: `conf-${Date.now()}`, cid, name: 'NEW CONFERENCE', divisions: [] }];
    });
  };

  const addDivision = (confId: string) => {
    onChange(previous => {
      const nextDid = Math.max(-1, ...previous.flatMap(conference => conference.divisions.map(division => division.did))) + 1;
      return previous.map(conference => conference.id === confId
        ? { ...conference, divisions: [...conference.divisions, { id: `div-${Date.now()}`, did: nextDid, name: 'New Division', teams: [] }] }
        : conference);
    });
  };

  const saveTeam = (team: BuilderTeam, divisionId: string) => {
    onChange(previous => previous.map(conference => ({
      ...conference,
      divisions: conference.divisions.map(division => ({
        ...division,
        teams: [
          ...division.teams.filter(entry => entry.id !== team.id),
          ...(division.id === divisionId ? [team] : []),
        ],
      })),
    })));
    setEditingTeam(null);
    setNewTeamDivisionId(undefined);
    setSelectedTeamId(team.id);
  };

  const removeTeam = (teamId: number) => {
    onChange(previous => previous.map(conference => ({
      ...conference,
      divisions: conference.divisions.map(division => ({ ...division, teams: division.teams.filter(team => team.id !== teamId) })),
    })));
    setEditingTeam(null);
    setNewTeamDivisionId(undefined);
    if (selectedTeamId === teamId) setSelectedTeamId(null);
  };

  const renameStructure = (name: string) => {
    if (!renameTarget) return;
    onChange(previous => previous.map(conference => {
      if (conference.id !== renameTarget.confId) return conference;
      if (renameTarget.type === 'conference') return { ...conference, name };
      return { ...conference, divisions: conference.divisions.map(division => division.id === renameTarget.divId ? { ...division, name } : division) };
    }));
    setRenameTarget(null);
  };

  const deleteStructure = () => {
    if (!deleteTarget) return;
    onChange(previous => deleteTarget.type === 'conference'
      ? previous.filter(conference => conference.id !== deleteTarget.confId)
      : previous.map(conference => conference.id === deleteTarget.confId
        ? { ...conference, divisions: conference.divisions.filter(division => division.id !== deleteTarget.divId) }
        : conference));
    setDeleteTarget(null);
  };

  const addCustomTeam = () => {
    if (!addTarget) return;
    const id = nextTeamId.current++;
    setEditingTeam({ id, region: '', name: '', abbrev: '', population: '', stadiumCapacity: '', colors: ['#000000', '#ffffff', '#aaaaaa'], jerseyType: 'Bordered' });
    setNewTeamDivisionId(addTarget.divId);
    setAddTarget(null);
  };

  const addTemplateTeam = (entry: GeneratedTeamCatalogEntry) => {
    if (!templateTarget) return;
    const team = catalogTeamToBuilder(entry, nextTeamId.current++);
    onChange(previous => previous.map(conference => conference.id === templateTarget.confId
      ? { ...conference, divisions: conference.divisions.map(division => division.id === templateTarget.divId ? { ...division, teams: [...division.teams, team] } : division) }
      : conference));
    setTemplateTarget(null);
  };

  return (
    <div className="relative z-10 mx-auto flex h-screen w-full max-w-[1400px] flex-col px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="origin-bottom-left skew-x-[-15deg] bg-red-600 px-4 py-1 text-white shadow-lg"><div className="flex skew-x-[15deg] items-center gap-2"><div className="flex h-6 w-4 overflow-hidden rounded bg-white"><div className="h-full w-1/2 bg-blue-700" /><div className="relative h-full w-1/2 bg-red-600"><div className="absolute -left-1 top-1 h-4 w-2 rounded-full bg-white" /></div></div><span className="text-base font-bold uppercase tracking-wide sm:text-lg">Association <span className="font-normal text-gray-200">: Customize League</span></span></div></div>
        <div className="flex items-center justify-end gap-3">
          <button onClick={randomize} disabled={catalog.length === 0} title="Randomize All Teams" className="group flex items-center gap-2 rounded border border-red-500 bg-red-700 p-2 shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all hover:bg-red-600 disabled:opacity-40"><Dices size={20} className="text-white transition-transform group-hover:rotate-12" /><span className="text-sm font-black uppercase tracking-wider text-white">Randomize</span></button>
          <button onClick={onProceed} disabled={!!validationError} title={validationError ?? 'Proceed'} className="flex items-center rounded border border-red-500 bg-red-600 p-2 text-sm font-black uppercase tracking-wider text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">Proceed</button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-[3px] border-gray-400 bg-gray-900/80 shadow-2xl backdrop-blur-sm">
        <div className="relative shrink-0 overflow-hidden border-b-2 border-white/20"><div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1449844908441-8829872d2607?q=80&w=1200&auto=format&fit=crop')] bg-cover bg-center opacity-20" /><div className="relative flex items-center justify-center px-6 py-2"><h1 className="text-2xl font-bold tracking-wider text-white drop-shadow-md sm:text-4xl">CUSTOMIZE LEAGUE</h1></div></div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-x-auto md:overflow-y-hidden">
          {conferences.map(conference => (
            <div key={conference.id} className="flex min-h-0 flex-1 flex-col border-b border-white/30 last:border-b-0 md:min-w-[400px] md:border-b-0 md:border-r md:last:border-r-0">
              <div className="group flex shrink-0 items-center justify-center gap-2 border-b-2 border-white/30 bg-black py-1.5">
                <h2 className="text-xl font-bold uppercase tracking-widest text-white">{conference.name}</h2>
                <button onClick={() => setRenameTarget({ type: 'conference', confId: conference.id, name: conference.name })} className="rounded bg-white/10 p-1 text-gray-400 opacity-100 hover:text-white md:opacity-0 md:group-hover:opacity-100" aria-label="Rename conference"><Edit2 size={14} /></button>
                <button onClick={() => addDivision(conference.id)} className="rounded bg-green-400/10 p-1 text-green-400 opacity-100 hover:text-green-300 md:opacity-0 md:group-hover:opacity-100" title="Add Division"><Plus size={14} /></button>
                <button onClick={() => setDeleteTarget({ type: 'conference', confId: conference.id, name: conference.name })} className="rounded bg-red-400/10 p-1 text-red-400 opacity-100 hover:text-red-300 md:opacity-0 md:group-hover:opacity-100" title="Delete Conference"><Trash2 size={14} /></button>
              </div>
              <div className="flex-1 overflow-visible md:overflow-y-auto">
                {conference.divisions.map(division => (
                  <div key={division.id} className="flex flex-col border-b border-gray-500/50 last:border-b-0">
                    <div className="group/div flex items-center justify-center gap-2 bg-gray-300 py-0.5 text-center text-sm font-bold tracking-wider text-black"><span className="uppercase">{division.name}</span><button onClick={() => setRenameTarget({ type: 'division', confId: conference.id, divId: division.id, name: division.name })} className="rounded bg-black/10 p-0.5 text-gray-600 opacity-100 hover:text-black md:opacity-0 md:group-hover/div:opacity-100" aria-label="Rename division"><Edit2 size={12} /></button><button onClick={() => setDeleteTarget({ type: 'division', confId: conference.id, divId: division.id, name: division.name })} className="rounded bg-red-500/20 p-0.5 text-red-600 opacity-100 hover:text-red-500 md:opacity-0 md:group-hover/div:opacity-100" title="Delete Division"><Trash2 size={12} /></button></div>
                    <div className="flex min-h-[90px] flex-wrap justify-around gap-y-2 bg-black/60 p-1.5">
                      {division.teams.map(team => <button key={team.id} onClick={() => { setSelectedTeamId(team.id); setEditingTeam(team); setNewTeamDivisionId(division.id); }} className={`flex h-[76px] w-16 flex-col items-center justify-center transition-colors ${selectedTeamId === team.id ? 'bg-yellow-400 text-black' : 'text-white hover:bg-white/10'}`}><div className="mt-1 w-full truncate text-center text-[10px] font-semibold leading-tight tracking-tighter">{team.region.toUpperCase()}</div><div className="-mt-0.5 w-full truncate text-center text-[10px] font-bold leading-tight tracking-tight">{team.name.toUpperCase()}</div><div className="mb-1 mt-0.5 flex w-full flex-1 items-center justify-center">{team.logoUrl ? <img src={team.logoUrl} alt={team.name} loading="lazy" className="h-10 w-10 object-contain drop-shadow-md" /> : <span className="text-xs font-black">{team.abbrev}</span>}</div></button>)}
                      <button onClick={() => setAddTarget({ confId: conference.id, divId: division.id })} className="flex h-[76px] w-16 flex-col items-center justify-center border border-dashed border-gray-600 text-gray-500 transition-colors hover:bg-white/10 hover:text-white" aria-label="Add team"><Plus size={24} /></button>
                      {Array.from({ length: Math.max(0, 5 - division.teams.length) }).map((_, index) => <div key={`empty-${index}`} className="hidden h-[76px] w-16 sm:block" />)}
                    </div>
                  </div>
                ))}
                {conference.divisions.length === 0 && <div className="p-8 text-center text-gray-500">No divisions yet.</div>}
              </div>
            </div>
          ))}
          <button onClick={addConference} className="flex min-h-14 shrink-0 items-center justify-center border-t border-white/20 bg-black/40 transition-colors hover:bg-black/60 md:min-h-0 md:min-w-[60px] md:border-l md:border-t-0" aria-label="Add conference"><Plus size={32} className="text-gray-400" /></button>
        </div>
        <div className={`shrink-0 border-t-2 border-white/20 px-4 py-2 text-center ${validationError ? 'bg-red-950/90' : 'bg-slate-800/90'}`}><p className="text-sm font-bold tracking-widest text-white sm:text-base">{validationError?.toUpperCase() ?? 'ADD, REMOVE OR SWAP TEAMS. ALL DIVISIONS NEED AT LEAST TWO TEAMS.'}</p></div>
      </div>
      {addTarget && <AddTeamChoice onTemplate={() => { setTemplateTarget(addTarget); setAddTarget(null); }} onCustom={addCustomTeam} onClose={() => setAddTarget(null)} />}
      {templateTarget && <TemplateTeamPicker teams={catalog} onSelect={addTemplateTeam} onClose={() => setTemplateTarget(null)} />}
      {renameTarget && <RenameStructureDialog type={renameTarget.type} initialName={renameTarget.name} onSave={renameStructure} onClose={() => setRenameTarget(null)} />}
      {deleteTarget && <DeleteStructureDialog type={deleteTarget.type} name={deleteTarget.name} onDelete={deleteStructure} onClose={() => setDeleteTarget(null)} />}
      {editingTeam && <FictionalTeamEditor team={editingTeam} conferences={conferences} initialDivisionId={newTeamDivisionId} onSave={saveTeam} onDelete={() => removeTeam(editingTeam.id)} onClose={() => { setEditingTeam(null); setNewTeamDivisionId(undefined); }} />}
    </div>
  );
}
