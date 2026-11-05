import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { GeneratedTeamCatalogEntry } from './fictionalLeagueBuilderTypes';

export function AddTeamChoice({ onTemplate, onCustom, onClose }: { onTemplate: () => void; onCustom: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded border-2 border-red-800 bg-gray-900 p-8 text-center shadow-2xl">
        <div className="pointer-events-none absolute inset-0 z-0 opacity-30"><div className="absolute left-0 top-0 h-1/2 w-full bg-gradient-to-b from-red-600/20 to-transparent" /></div>
        <h3 className="relative z-10 mb-8 text-2xl font-black italic uppercase tracking-wider text-white">Add Team</h3>
        <div className="relative z-10 flex flex-col gap-5">
          <button onClick={onTemplate} className="rounded bg-red-600 py-5 text-lg font-black uppercase tracking-widest text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all hover:bg-red-500">Use Template Team</button>
          <button onClick={onCustom} className="rounded border-2 border-red-800 bg-gray-800 py-5 text-lg font-black uppercase tracking-widest text-white transition-all hover:border-red-600 hover:bg-gray-700">Create Custom Team</button>
        </div>
        <button onClick={onClose} className="relative z-10 mt-8 w-full text-sm font-bold uppercase tracking-widest text-gray-400 transition-colors hover:text-white">Cancel</button>
      </div>
    </div>
  );
}

export function TemplateTeamPicker({ teams, onSelect, onClose }: { teams: GeneratedTeamCatalogEntry[]; onSelect: (team: GeneratedTeamCatalogEntry) => void; onClose: () => void }) {
  const [sortBy, setSortBy] = useState<'alpha' | 'pop'>('alpha');
  const sorted = [...teams].sort((left, right) => sortBy === 'alpha'
    ? String(left.region ?? '').localeCompare(String(right.region ?? ''))
    : Number(right.pop ?? 0) - Number(left.pop ?? 0));
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-4">
      <div className="relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded border-2 border-red-800 bg-gray-900 shadow-2xl sm:h-[85vh]">
        <div className="relative z-10 flex flex-col items-center justify-between gap-4 border-b border-red-800/50 bg-black/50 p-4 sm:flex-row sm:p-6">
          <h3 className="text-2xl font-black italic uppercase tracking-wider text-white drop-shadow sm:text-3xl">Select Template Team</h3>
          <div className="flex items-center gap-3 sm:gap-4">
            <select value={sortBy} onChange={event => setSortBy(event.target.value as 'alpha' | 'pop')} className="rounded border border-gray-700 bg-black px-3 py-2 text-xs font-bold uppercase tracking-wider text-white focus:border-red-500 focus:outline-none sm:px-4 sm:text-sm">
              <option value="alpha">Sort: Alphabetical</option>
              <option value="pop">Sort: Population</option>
            </select>
            <button onClick={onClose} className="rounded bg-white/5 p-2 text-gray-400 hover:text-white" aria-label="Close template picker"><X size={24} /></button>
          </div>
        </div>
        <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {sorted.map((team, index) => (
              <button key={`${team.tid ?? index}-${team.abbrev ?? team.name}`} onClick={() => onSelect(team)} className="group flex flex-col items-center rounded-lg border border-gray-700 bg-black/60 p-3 text-center shadow-lg transition-all hover:-translate-y-1 hover:border-red-500 hover:shadow-[0_0_15px_rgba(220,38,38,0.3)] sm:p-5">
                <img src={team.imgURL ?? team.logos?.primary} alt={String(team.name ?? '')} loading="lazy" className="mb-3 h-16 w-16 object-contain drop-shadow-md transition-transform group-hover:scale-110 sm:mb-4 sm:h-20 sm:w-20" />
                <div className="text-xs font-bold uppercase tracking-widest text-red-500">{team.region}</div>
                <div className="mt-1 text-sm font-black uppercase tracking-wider text-white">{team.name}</div>
                <div className="mt-3 text-[10px] font-bold tracking-tighter text-gray-400">POP: {team.pop}M<br />CAP: {team.stadiumCapacity}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RenameStructureDialog({ type, initialName, onSave, onClose }: { type: 'conference' | 'division'; initialName: string; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initialName);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border-2 border-gray-500 bg-gray-800 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-bold uppercase tracking-wider text-white">Rename {type}</h3><button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24} /></button></div>
        <input value={name} onChange={event => setName(event.target.value)} autoFocus onKeyDown={event => { if (event.key === 'Enter' && name.trim()) onSave(name.trim()); if (event.key === 'Escape') onClose(); }} className="mb-6 w-full rounded border border-gray-600 bg-black px-4 py-2 uppercase text-white focus:border-red-500 focus:outline-none" />
        <div className="flex justify-end gap-3"><button onClick={onClose} className="rounded bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-600">CANCEL</button><button onClick={() => name.trim() && onSave(name.trim())} className="rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-500">SAVE</button></div>
      </div>
    </div>
  );
}

export function DeleteStructureDialog({ type, name, onDelete, onClose }: { type: 'conference' | 'division'; name: string; onDelete: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border-2 border-red-500 bg-gray-800 p-6 text-center shadow-2xl">
        <h3 className="mb-4 text-xl font-bold uppercase tracking-wider text-white">Delete {type}</h3>
        <p className="mb-6 text-gray-300">Are you sure you want to delete <span className="font-bold text-white">{name}</span>? This action cannot be undone.</p>
        <div className="flex justify-center gap-3"><button onClick={onClose} className="rounded bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-600">CANCEL</button><button onClick={onDelete} className="rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-500">DELETE</button></div>
      </div>
    </div>
  );
}
