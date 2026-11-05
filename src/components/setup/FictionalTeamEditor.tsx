import React, { useState } from 'react';
import { Edit2, Plus, Trash2, X } from 'lucide-react';
import type { BuilderConference, BuilderTeam } from './fictionalLeagueBuilderTypes';

export function FictionalTeamEditor({ team, conferences, initialDivisionId, onSave, onDelete, onClose }: {
  team: BuilderTeam;
  conferences: BuilderConference[];
  initialDivisionId?: string;
  onSave: (team: BuilderTeam, divisionId: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(team);
  const [divisionId, setDivisionId] = useState(() => initialDivisionId ?? conferences.flatMap(conference => conference.divisions).find(division => division.teams.some(entry => entry.id === team.id))?.id ?? '');
  const [logoType, setLogoType] = useState<'main' | 'small' | null>(null);
  const [logoUrl, setLogoUrl] = useState('');

  const setColor = (index: number, value: string) => {
    const colors = [...draft.colors] as [string, string, string];
    colors[index] = value;
    setDraft({ ...draft, colors });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-4">
        <div className="relative my-auto flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded border-2 border-red-800 bg-gray-900 font-sans text-white shadow-2xl">
          <div className="pointer-events-none absolute inset-0 z-0 opacity-30"><div className="absolute right-0 top-0 h-full w-1/2 translate-x-32 skew-x-12 bg-gradient-to-bl from-red-600/20 to-transparent" /></div>
          <div className="relative z-10 flex items-center justify-between border-b border-red-800/50 bg-black/60 px-5 py-4 sm:px-6">
            <h3 className="text-xl font-black italic uppercase tracking-wider text-white drop-shadow sm:text-2xl">EDIT TEAM <span className="text-red-500">{draft.abbrev}</span></h3>
            <button onClick={onClose} className="text-gray-400 transition-colors hover:text-white" aria-label="Close team editor"><X size={28} /></button>
          </div>
          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row">
            <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-5 p-5 sm:grid-cols-2 sm:p-6">
              <Field label="Region"><input value={draft.region} onChange={event => setDraft({ ...draft, region: event.target.value })} className={inputClass} /></Field>
              <Field label="Name"><input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className={inputClass} /></Field>
              <Field label="Abbrev"><input value={draft.abbrev} maxLength={5} onChange={event => setDraft({ ...draft, abbrev: event.target.value.toUpperCase() })} className={inputClass} /></Field>
              <Field label="Division">
                <select value={divisionId} onChange={event => setDivisionId(event.target.value)} className={`${inputClass} appearance-none`}>
                  {conferences.flatMap(conference => conference.divisions.map(division => <option key={division.id} value={division.id}>{division.name} ({conference.name})</option>))}
                </select>
              </Field>
              <Field label="Population (M)"><input type="number" step="0.1" min="0.1" value={draft.population} onChange={event => setDraft({ ...draft, population: event.target.value })} className={inputClass} /></Field>
              <Field label="Stadium Cap."><input type="number" min="1" value={draft.stadiumCapacity} onChange={event => setDraft({ ...draft, stadiumCapacity: event.target.value })} className={inputClass} /></Field>
              <div className="mt-2 sm:col-span-2">
                <label className="mb-2 block border-b border-gray-700 pb-1 text-xs font-bold uppercase tracking-widest text-gray-400">Team Identity Palette</label>
                <div className="mt-3 flex items-center gap-4">
                  <div className="flex h-12 w-full max-w-[200px] flex-1 overflow-hidden rounded border-2 border-gray-700 bg-black shadow-inner">
                    {draft.colors.map((color, index) => <input key={index} type="color" value={color} onChange={event => setColor(index, event.target.value)} className="h-[150%] w-1/3 -translate-y-1/4 cursor-pointer border-none p-0" />)}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-row items-center justify-center gap-8 border-t border-red-800/50 bg-black/40 p-6 md:w-64 md:flex-col md:border-l md:border-t-0">
              <LogoControl label="Primary Logo" size="large" src={draft.logoUrl} abbrev={draft.abbrev} onClick={() => { setLogoType('main'); setLogoUrl(draft.logoUrl ?? ''); }} />
              <LogoControl label="Secondary Logo" size="small" src={draft.smallLogoUrl} abbrev={draft.abbrev} onClick={() => { setLogoType('small'); setLogoUrl(draft.smallLogoUrl ?? ''); }} />
            </div>
          </div>
          <div className="relative z-10 flex flex-col gap-3 border-t border-red-800/50 bg-black/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            {onDelete ? <button onClick={onDelete} className="flex items-center justify-center gap-2 rounded border border-red-800 px-4 py-2 text-sm font-bold uppercase tracking-wider text-red-400 hover:bg-red-950"><Trash2 size={16} /> Delete Team</button> : <div />}
            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="rounded border-2 border-gray-600 bg-transparent px-4 py-2 font-bold uppercase tracking-wider text-gray-300 transition-all hover:border-white hover:text-white sm:px-5">Discard</button>
              <button onClick={() => onSave(draft, divisionId)} disabled={!draft.region.trim() || !draft.name.trim() || !draft.abbrev.trim() || !divisionId} className="rounded bg-red-600 px-4 py-2 font-black uppercase tracking-wider text-white shadow-[0_0_15px_rgba(220,38,38,0.5)] transition-all hover:bg-red-500 disabled:opacity-40 sm:px-8">Accept Changes</button>
            </div>
          </div>
        </div>
      </div>
      {logoType && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-lg border-2 border-red-600 bg-gray-900 p-6 shadow-2xl">
            <h4 className="mb-4 text-xl font-bold uppercase tracking-wider text-white">Update {logoType === 'main' ? 'Primary' : 'Secondary'} Logo</h4>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-400">Image URL</label>
            <input value={logoUrl} onChange={event => setLogoUrl(event.target.value)} placeholder="https://..." autoFocus className="mb-6 w-full rounded border border-gray-700 bg-black px-4 py-3 font-mono text-sm text-white focus:border-red-500 focus:outline-none" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setLogoType(null)} className="rounded bg-gray-800 px-4 py-2 text-sm font-bold uppercase text-white hover:bg-gray-700">Cancel</button>
              <button onClick={() => { setDraft(current => logoType === 'main' ? { ...current, logoUrl } : { ...current, smallLogoUrl: logoUrl }); setLogoType(null); }} className="rounded bg-red-600 px-4 py-2 text-sm font-bold uppercase text-white hover:bg-red-500">Set Image</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const inputClass = 'w-full rounded border border-gray-700 bg-black px-3 py-2 font-semibold uppercase text-white transition-colors focus:border-red-500 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-400">{label}</label>{children}</div>;
}

function LogoControl({ label, size, src, abbrev, onClick }: { label: string; size: 'large' | 'small'; src?: string; abbrev: string; onClick: () => void }) {
  const box = size === 'large' ? 'h-32 w-32' : 'h-24 w-24';
  const image = size === 'large' ? 'h-24 w-24' : 'h-16 w-16';
  return (
    <div className="flex flex-col items-center">
      <span className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <button onClick={onClick} className={`group relative flex items-center justify-center rounded-lg border-2 border-gray-600 bg-gray-800/80 transition-all hover:border-red-500 hover:bg-gray-800 ${box}`}>
        {src ? <img src={src} alt="" className={`object-contain drop-shadow-xl transition-transform group-hover:scale-105 ${image}`} /> : <div className="flex flex-col items-center text-gray-500 transition-colors group-hover:text-red-400"><Plus size={24} /><span className="mt-1 text-[10px] font-bold uppercase">{abbrev || 'Add Image'}</span></div>}
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"><Edit2 size={size === 'large' ? 24 : 20} className="text-white" /></div>
      </button>
    </div>
  );
}
