import React, { useEffect, useRef, useState } from 'react';
import { SaveManager, SaveMetadata } from '../services/SaveManager';
import { Play, Upload, Download, Trash2, FolderOpen, Plus, Settings2, Trophy, Zap, Target, Sparkles, CircleDot, Medal, FileJson, HardDrive, Music2, Copy } from 'lucide-react';
import { SettingsModal } from './modals/SettingsModal';
import { LazySimLoadingScreen } from './setup/LazySimLoadingScreen';
import type { GameLoadProgress, GameState, LazySimProgress } from '../types';
import { formatGameDateShort } from '../utils/dateUtils';

interface MainMenuProps {
  onStartNew: () => void;
  onLoadSave: (save: SaveMetadata | GameState) => Promise<void>;
  onPlayMiniGame?: (game: 'throne' | 'dunk' | '3point' | 'shooting-stars' | 'skills' | 'horse' | 'olympics' | 'dance') => void;
}

const formatSaveGameDate = (value: string): string => {
  try {
    return formatGameDateShort(value);
  } catch {
    return value;
  }
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes < 1) return 'Stored locally';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const MainMenu: React.FC<MainMenuProps> = ({ onStartNew, onLoadSave, onPlayMiniGame }) => {
  const [saves, setSaves] = useState<SaveMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importProgress, setImportProgress] = useState<LazySimProgress>();
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadMetadata(); }, []);

  const loadMetadata = async () => {
    try {
      const metadata = await SaveManager.getMetadata();
      setSaves(metadata.sort((a, b) => b.dateSaved - a.dateSaved));
    } catch (err) {
      setError('Failed to load saves.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoad = async (save: SaveMetadata) => {
    setError(null);
    setIsLoading(true);
    try {
      await onLoadSave(save);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load save.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this save?')) {
      await SaveManager.deleteSave(id);
      await loadMetadata();
    }
  };

  const handleExport = async (id: string) => {
    setError(null);
    try {
      await SaveManager.exportSave(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export save.');
    }
  };

  const showImportProgress = (progress: GameLoadProgress) => {
    setImportProgress({
      kind: 'save-load',
      currentDate: '',
      targetDate: '',
      daysComplete: progress.stepsComplete,
      daysTotal: progress.stepsTotal,
      currentPhase: progress.currentPhase,
      percentComplete: progress.percentComplete,
    });
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setIsLoading(true);
    try {
      const importedLeague = await SaveManager.importSave(file, showImportProgress);
      await onLoadSave(importedLeague.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import save.');
      await loadMetadata();
    } finally {
      setImportProgress(undefined);
      setIsLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    await importFile(file);
  };

  const handleClone = async (save: SaveMetadata) => {
    setError(null);
    setIsLoading(true);
    try {
      await SaveManager.cloneSave(save.id, `${save.name} Copy`);
      await loadMetadata();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy save.');
    } finally {
      setIsLoading(false);
    }
  };

  if (importProgress) {
    return <LazySimLoadingScreen progress={importProgress} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-200">
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div className="fixed right-4 top-4 z-20 flex items-start gap-2">
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-600 text-slate-500 hover:text-white transition-all"
          title="Settings"
        >
          <Settings2 size={18} />
        </button>
      </div>

      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <img
            src="https://i.imgur.com/66dyyIO.png"
            alt="Basketball Commissioner Simulator"
            className="w-24 h-24 object-contain mx-auto mb-5 drop-shadow-2xl"
            referrerPolicy="no-referrer"
          />
          <h1 className="text-5xl font-black tracking-tighter text-white mb-4">Basketball Commissioner Simulator</h1>
          <p className="text-xl text-slate-400">Manage the league, handle the drama, build your legacy.</p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl mb-8 text-center">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          {/* New Game / Import */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white mb-6">Start</h2>
            
            <button
              onClick={onStartNew}
              className="w-full flex items-center justify-between p-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus size={24} />
                </div>
                <div className="text-left">
                  <h3 className="text-xl font-bold">New Game</h3>
                  <p className="text-indigo-200 text-sm">Start a fresh career as Commissioner</p>
                </div>
              </div>
            </button>

            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setIsDraggingFile(false);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDraggingFile(false);
                void importFile(event.dataTransfer.files?.[0]);
              }}
              className={`w-full rounded-2xl border p-5 transition-all ${
                isDraggingFile
                  ? 'border-indigo-400 bg-indigo-500/10'
                  : 'border-slate-800 bg-slate-900 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800">
                  <FileJson size={24} className={isDraggingFile ? 'text-indigo-300' : 'text-slate-300'} />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <h3 className="text-lg font-bold text-white">Import League</h3>
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => importInputRef.current?.click()}
                        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-400"
                      >
                        <Upload size={16} />
                        Import
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,.gz,.json.gz,application/json,application/gzip"
                className="hidden"
                onChange={handleImport}
              />
            </div>

            <div className="pt-4 border-t border-slate-800">
              <h3 className="text-lg font-bold text-white mb-3">Mini Games</h3>
              <button
                onClick={() => onPlayMiniGame?.('throne')}
                className="w-full flex items-center justify-between p-4 bg-yellow-600/20 border border-yellow-600/30 hover:border-yellow-500 hover:bg-yellow-600/30 rounded-xl transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Trophy size={20} className="text-yellow-500" />
                  <div className="text-left">
                    <h4 className="font-bold text-white text-sm">The Throne</h4>
                    <p className="text-yellow-200/70 text-xs">1v1 tournament</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => onPlayMiniGame?.('dunk')}
                className="w-full flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 hover:border-yellow-600/50 hover:bg-slate-800 rounded-xl transition-all group mt-2"
              >
                <div className="flex items-center gap-3">
                  <Zap size={20} className="text-yellow-600 group-hover:text-yellow-400" />
                  <div className="text-left">
                    <h4 className="font-bold text-white text-sm">Dunk Contest</h4>
                    <p className="text-slate-400 text-xs">Pick your contestants</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => onPlayMiniGame?.('3point')}
                className="w-full flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800 rounded-xl transition-all group mt-2"
              >
                <div className="flex items-center gap-3">
                  <Zap size={20} className="text-indigo-500 group-hover:text-indigo-400" />
                  <div className="text-left">
                    <h4 className="font-bold text-white text-sm">3-Point Contest</h4>
                    <p className="text-slate-400 text-xs">Pick your shooters</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => onPlayMiniGame?.('shooting-stars')}
                className="w-full flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-800 rounded-xl transition-all group mt-2"
              >
                <div className="flex items-center gap-3">
                  <Sparkles size={20} className="text-sky-500 group-hover:text-sky-400" />
                  <div className="text-left">
                    <h4 className="font-bold text-white text-sm">Shooting Stars</h4>
                    <p className="text-slate-400 text-xs">Build your teams</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => onPlayMiniGame?.('skills')}
                className="w-full flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 hover:border-orange-500/50 hover:bg-slate-800 rounded-xl transition-all group mt-2"
              >
                <div className="flex items-center gap-3">
                  <Target size={20} className="text-orange-500 group-hover:text-orange-400" />
                  <div className="text-left">
                    <h4 className="font-bold text-white text-sm">Skills Challenge</h4>
                    <p className="text-slate-400 text-xs">Pick your competitors</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => onPlayMiniGame?.('olympics')}
                className="w-full flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-800 rounded-xl transition-all group mt-2"
              >
                <div className="flex items-center gap-3">
                  <Medal size={20} className="text-amber-500 group-hover:text-amber-400" />
                  <div className="text-left">
                    <h4 className="font-bold text-white text-sm">Olympics</h4>
                    <p className="text-slate-400 text-xs">Track, field, combat, and more</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => onPlayMiniGame?.('horse')}
                className="w-full flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 hover:border-yellow-500/50 hover:bg-slate-800 rounded-xl transition-all group mt-2"
              >
                <div className="flex items-center gap-3">
                  <CircleDot size={20} className="text-yellow-500 group-hover:text-yellow-400" />
                  <div className="text-left">
                    <h4 className="font-bold text-white text-sm">H-O-R-S-E</h4>
                    <p className="text-slate-400 text-xs">Pick your shot-makers</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => onPlayMiniGame?.('dance')}
                className="group mt-2 flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-all hover:border-pink-500/50 hover:bg-slate-800"
              >
                <div className="flex items-center gap-3">
                  <Music2 size={20} className="text-pink-500 group-hover:text-pink-400" />
                  <div className="text-left">
                    <h4 className="text-sm font-bold text-white">Dance Contest</h4>
                    <p className="text-xs text-slate-400">Choose two teams and own the floor</p>
                  </div>
                </div>
              </button>
            </div>

          </div>

          {/* Load Game */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <FolderOpen size={24} />
              Saved Leagues
            </h2>
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {isLoading ? (
                <div className="text-center p-8 text-slate-500">Loading saves...</div>
              ) : saves.length === 0 ? (
                <div className="text-center p-8 bg-slate-900/50 border border-slate-800 rounded-2xl text-slate-500">
                  No saved games found.
                </div>
              ) : (
                saves.map(save => (
                  <div key={save.id} className="group rounded-2xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-indigo-500/40">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-300">
                        {save.gameMode === 'gm' && save.userTeamLogoUrl ? (
                          <img
                            src={save.userTeamLogoUrl}
                            alt=""
                            className="h-8 w-8 object-contain"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <HardDrive size={19} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-bold text-white">{save.name}</h3>
                            <p className="truncate text-sm text-slate-400">
                              {save.leagueName || save.commissionerName}
                            </p>
                          </div>
                          <span className="w-fit shrink-0 rounded-lg bg-slate-950 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                            {save.leagueType || 'League'}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-3">
                          <span>{formatSaveGameDate(save.gameDate)}</span>
                          <span>Day {save.day}</span>
                          <span className="col-span-2 sm:col-span-1 sm:text-right">{formatFileSize(save.sizeBytes)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800/50">
                      <button
                        onClick={() => handleLoad(save)}
                        disabled={isLoading}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-50"
                      >
                        <Play size={16} />
                        Continue
                      </button>
                      <button
                        onClick={() => handleClone(save)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                        title="Copy Save"
                      >
                        <Copy size={18} />
                      </button>
                      <button
                        onClick={() => handleExport(save.id)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                        title="Export Save"
                      >
                        <Download size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(save.id)}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                        title="Delete Save"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
