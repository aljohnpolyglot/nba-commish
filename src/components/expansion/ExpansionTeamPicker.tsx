import React, { useEffect, useState } from 'react';
import { ImagePlus, Landmark, LayoutGrid, X } from 'lucide-react';
import { ZENGM_EXPANSION_POOL } from '../../data/expansionTeamPool';
import type { ExpansionTeamSpec } from '../../types';
import {
  generatedCatalogTeamToExpansion,
  loadGeneratedTeamCatalog,
  type GeneratedTeamCatalogEntry,
} from '../../services/generatedTeamCatalog';
import { TemplateTeamPicker } from '../setup/FictionalTeamDialogs';

type PickerScreen = 'source' | 'templates' | 'nba';

interface Props {
  onPick: (spec: ExpansionTeamSpec) => void;
  onClose: () => void;
}

function blankTeam(): ExpansionTeamSpec {
  return {
    region: '',
    name: '',
    abbrev: '',
    pop: 2,
    stadiumCapacity: 18_000,
    colors: ['#1d428a', '#c8102e', '#ffffff'],
    conference: 'West',
    cid: 1,
    did: 5,
  };
}

export const ExpansionTeamPicker: React.FC<Props> = ({ onPick, onClose }) => {
  const [screen, setScreen] = useState<PickerScreen>('source');
  const [catalog, setCatalog] = useState<GeneratedTeamCatalogEntry[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);

  useEffect(() => {
    loadGeneratedTeamCatalog()
      .then(teams => {
        setCatalog(teams);
        setCatalogFailed(teams.length === 0);
      })
      .catch(() => setCatalogFailed(true));
  }, []);

  if (screen === 'templates') {
    return (
      <TemplateTeamPicker
        teams={catalog}
        onSelect={team => onPick(generatedCatalogTeamToExpansion(team))}
        onClose={onClose}
      />
    );
  }

  if (screen === 'nba') {
    return (
      <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
        <div className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden border border-zinc-700 bg-zinc-900 sm:h-auto sm:max-h-[80dvh] sm:rounded-lg" onClick={event => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <h3 className="text-lg font-bold text-white">Select NBA Franchise</h3>
            <button onClick={onClose} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Close team picker"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
            {ZENGM_EXPANSION_POOL.map(team => (
              <button
                key={team.abbrev}
                onClick={() => onPick({ ...team, stadiumCapacity: team.stadiumCapacity ?? 18_000 })}
                className="flex min-h-24 items-center gap-4 rounded border border-zinc-700 bg-black/40 p-4 text-left transition-colors hover:border-red-500"
              >
                <img src={team.imgURL} alt="" loading="lazy" className="h-16 w-16 shrink-0 object-contain" />
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase text-red-500">{team.region}</div>
                  <div className="font-black uppercase text-white">{team.name}</div>
                  <div className="mt-2 text-[10px] font-bold text-zinc-400">POP: {team.pop}M</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h3 className="text-lg font-bold text-white">Add Expansion Team</h3>
          <button onClick={onClose} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Close team picker"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <button
            onClick={() => setScreen('templates')}
            disabled={catalog.length === 0}
            className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-zinc-700 bg-black/40 p-4 text-center transition-colors hover:border-red-500 disabled:cursor-wait disabled:opacity-50"
          >
            <LayoutGrid className="mb-3 h-7 w-7 text-red-500" />
            <span className="font-black uppercase text-white">Template Team</span>
            <span className="mt-1 text-xs text-zinc-400">{catalogFailed ? 'Unavailable' : catalog.length > 0 ? `${catalog.length} teams` : 'Loading...'}</span>
          </button>
          <button
            onClick={() => setScreen('nba')}
            className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-zinc-700 bg-black/40 p-4 text-center transition-colors hover:border-red-500"
          >
            <Landmark className="mb-3 h-7 w-7 text-red-500" />
            <span className="font-black uppercase text-white">NBA Franchise</span>
            <span className="mt-1 text-xs text-zinc-400">{ZENGM_EXPANSION_POOL.length} teams</span>
          </button>
          <button
            onClick={() => onPick(blankTeam())}
            className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-zinc-700 bg-black/40 p-4 text-center transition-colors hover:border-red-500"
          >
            <ImagePlus className="mb-3 h-7 w-7 text-red-500" />
            <span className="font-black uppercase text-white">Custom Team</span>
            <span className="mt-1 text-xs text-zinc-400">Blank franchise</span>
          </button>
        </div>
      </div>
    </div>
  );
};
