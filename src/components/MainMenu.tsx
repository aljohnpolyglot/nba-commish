import React, { useState, useEffect } from 'react';
import { SaveManager, SaveMetadata } from '../services/SaveManager';
import { Play, Upload, Download, Trash2, FolderOpen, Plus, Settings2, Trophy, Zap } from 'lucide-react';
import { useGame } from '../store/GameContext';
import { SettingsModal } from './modals/SettingsModal';

interface MainMenuProps {
  onStartNew: () => void;
  onLoadSave: (state: any) => void;
  onPlayMiniGame?: (game: 'throne' | 'dunk' | '3point') => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStartNew, onLoadSave, onPlayMiniGame }) => {
  const [saves, setSaves] = useState<SaveMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const handleLoad = async (id: string) => {
    setIsLoading(true);
    try {
      const state = await SaveManager.loadGame(id);
      if (state) {
        onLoadSave(state);
      } else {
        setError('Save file corrupted or missing.');
      }
    } catch (err) {
      setError('Failed to load save.');
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
    await SaveManager.exportSave(id);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsLoading(true);
      try {
        await SaveManager.importSave(file);
        await loadMetadata();
      } catch (err: any) {
        setError(err?.message ?? 'Failed to import save.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-200">
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Settings button — top right */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="fixed top-4 right-4 p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-600 text-slate-500 hover:text-white transition-all"
        title="Settings"
      >
        <Settings2 size={18} />
      </button>

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

            <label className="w-full flex items-center justify-between p-6 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 rounded-2xl transition-all cursor-pointer group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-800 group-hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors">
                  <Upload size={24} className="text-slate-400 group-hover:text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-xl font-bold text-white">Import Save</h3>
                  <p className="text-slate-400 text-sm">Load a save file from your device</p>
                </div>
              </div>
              <input type="file" accept=".json,.gz" className="hidden" onChange={handleImport} />
            </label>

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
            </div>

          </div>

          {/* Load Game */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <FolderOpen size={24} />
              Load Game
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
                  <div key={save.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-colors group">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold text-white text-lg">{save.name}</h3>
                        <p className="text-sm text-slate-400">Commish: {save.commissionerName}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono text-slate-500 bg-slate-950 px-2 py-1 rounded-md">
                          Day {save.day}
                        </span>
                        <p className="text-xs text-slate-500 mt-1">{save.gameDate}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800/50">
                      <button
                        onClick={() => handleLoad(save.id)}
                        className="flex-1 bg-white hover:bg-slate-200 text-slate-950 font-semibold py-2 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                      >
                        <Play size={16} />
                        Load
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
