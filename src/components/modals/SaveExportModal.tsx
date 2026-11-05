import React, { useState } from 'react';
import { Check, Download, HardDrive, Loader2, Save, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { SaveManager } from '../../services/SaveManager';
import {
  DEFAULT_LEAGUE_EXPORT_OPTIONS,
  LEAGUE_EXPORT_PRESETS,
  buildPersistableGameState,
  type LeagueExportOptions,
} from '../../services/saveExport';

interface SaveExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ToggleRowProps {
  checked: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  inset?: boolean;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  checked,
  label,
  description,
  onChange,
  disabled,
  inset,
}) => (
  <label className={`flex cursor-pointer items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-white/[0.04] ${inset ? 'ml-6' : ''} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={event => onChange(event.target.checked)}
      className="peer sr-only"
    />
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-slate-600 bg-slate-950 text-transparent transition-colors peer-checked:border-indigo-500 peer-checked:bg-indigo-500 peer-checked:text-white">
      <Check size={14} strokeWidth={3} />
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-bold text-white">{label}</span>
      <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{description}</span>
    </span>
  </label>
);

const defaultSaveName = (leagueName: string | undefined, commissionerName: string): string =>
  leagueName?.trim() || `${commissionerName}'s League`;

export const SaveExportModal: React.FC<SaveExportModalProps> = ({ isOpen, onClose }) => {
  const { state, dispatchAction } = useGame();
  const [options, setOptions] = useState<LeagueExportOptions>(DEFAULT_LEAGUE_EXPORT_OPTIONS);
  const [saveName, setSaveName] = useState(() => defaultSaveName(state.leagueStats?.leagueName, state.commissionerName));
  const [busy, setBusy] = useState<'browser' | 'download' | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const update = <K extends keyof LeagueExportOptions,>(key: K, value: LeagueExportOptions[K]) => {
    setOptions(current => ({ ...current, [key]: value }));
  };
  const selectPreset = (preset: keyof typeof LEAGUE_EXPORT_PRESETS) => {
    setOptions({ ...LEAGUE_EXPORT_PRESETS[preset] });
    setStatus(null);
  };
  const browserSave = async () => {
    setBusy('browser');
    setStatus(null);
    try {
      const saved = await SaveManager.saveGameDetailed(buildPersistableGameState(state), saveName.trim() || defaultSaveName(state.leagueStats?.leagueName, state.commissionerName));
      await dispatchAction({
        type: 'UPDATE_STATE',
        payload: {
          saveId: saved.id,
          saveRevision: saved.saveRevision,
          durableSavePending: false,
          lastDurableSaveError: undefined,
        },
      } as any);
      setStatus('Saved in this browser.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The league could not be saved.');
    } finally {
      setBusy(null);
    }
  };
  const download = async () => {
    setBusy('download');
    setStatus(null);
    try {
      const resolvedName = saveName.trim() || defaultSaveName(state.leagueStats?.leagueName, state.commissionerName);
      await SaveManager.exportState(state, resolvedName, options);
      setStatus('League file prepared for download.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The league file could not be created.');
    } finally {
      setBusy(null);
    }
  };

  const isBusy = busy !== null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-2 sm:p-5">
      <button className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onClick={onClose} aria-label="Close save window" />
      <section className="relative flex max-h-[calc(100vh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl sm:max-h-[calc(100vh-2.5rem)] sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-indigo-300">
              <Save size={18} />
              <span className="text-[10px] font-black uppercase tracking-[0.28em]">Save & Export</span>
            </div>
            <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">Create a portable league file</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400 sm:text-sm">
              Your full league autosaves in this browser. Choose what belongs in the file you keep, move to another device, or use as a custom league.
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white" title="Close">
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 custom-scrollbar sm:px-6">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">League file name</span>
              <input
                value={saveName}
                onChange={event => setSaveName(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-indigo-500"
                maxLength={80}
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['default', 'Default'],
                ['none', 'None'],
                ['all', 'All'],
                ['teams', 'Teams Only'],
                ['settings', 'Settings Only'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => selectPreset(key)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] font-bold text-slate-300 transition-colors hover:border-indigo-500 hover:text-white"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-x-6 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <ToggleRow checked={options.players} label="Players" description="Player profiles, ratings, contracts, options, stats, awards, injuries, and career data." onChange={value => update('players', value)} />
              <ToggleRow checked={options.includeGameHighs} disabled={!options.players} inset label="Include game highs" description="Keeps every stored single-game high inside player season records." onChange={value => update('includeGameHighs', value)} />
              <ToggleRow checked={options.draftPicks} label="Draft picks" description="Current ownership plus future picks and imported pick history." onChange={value => update('draftPicks', value)} />
              <ToggleRow checked={options.transactionHistory} label="Transactions" description="Trades, Draft results, signings, waivers, options, and contract history." onChange={value => update('transactionHistory', value)} />
              <ToggleRow checked={options.boxScores} label="Box scores" description="Detailed played-game results. This can be one of the largest parts of a long-running save." onChange={value => update('boxScores', value)} />
            </div>

            <div>
              <ToggleRow checked={options.teams !== 'none'} label="Basic team data" description="Names, regions, abbreviations, conferences, colors, and logos." onChange={value => update('teams', value ? 'basic' : 'none')} />
              <ToggleRow checked={options.teams === 'all'} disabled={options.teams === 'none'} inset label="All team data" description="Season history, finances, facilities, staff, strategy, jerseys, records, and mode-specific club data." onChange={value => update('teams', value ? 'all' : 'basic')} />
              <ToggleRow checked={options.leagueSettings} label="League settings" description="Competition format, calendar, economy, rules, awards, and Commissioner settings." onChange={value => update('leagueSettings', value)} />
              <ToggleRow checked={options.otherNews} label="News and league history" description="News, inbox, conversations, social history, and league events." onChange={value => update('otherNews', value)} />
              <ToggleRow checked={options.headToHead} label="Head-to-head data" description="Saved regular-season tiebreaker records between clubs." onChange={value => update('headToHead', value)} />
            </div>

            <div>
              <ToggleRow checked={options.schedule} label="Schedule" description="Current and historical fixtures, Playoffs, Cup state, special games, and results timeline." onChange={value => update('schedule', value)} />
              <ToggleRow checked={options.gameState} label="Complete game state" description="Staff, player options, finances, Academy, competitions, tasks, mode lifecycle, and every additional native save field." onChange={value => update('gameState', value)} />
              <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">File options</p>
                <ToggleRow checked={options.compact} label="Compress JSON" description="Removes extra whitespace before creating the file." onChange={value => update('compact', value)} />
                <ToggleRow checked={options.gzip} label="Compress with gzip" description="Produces a much smaller .json.gz league file." onChange={value => update('gzip', value)} />
                <ToggleRow checked={options.streaming} label="Streaming download" description="Uses the browser file picker when available, with a normal download fallback." onChange={value => update('streaming', value)} />
              </div>
            </div>
          </div>

          {status && (
            <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-sm font-semibold text-indigo-100">
              {status}
            </div>
          )}
        </div>

        <footer className="grid gap-2 border-t border-slate-800 bg-slate-950/60 p-3 sm:flex sm:items-center sm:justify-end sm:p-4">
          <button
            onClick={browserSave}
            disabled={isBusy}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === 'browser' ? <Loader2 className="animate-spin" size={17} /> : <HardDrive size={17} />}
            Save in Browser
          </button>
          <button
            onClick={download}
            disabled={isBusy}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 text-sm font-black text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {busy === 'download' ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} />}
            Save & Download File
          </button>
        </footer>
      </section>
    </div>
  );
};
