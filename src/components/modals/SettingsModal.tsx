import React, { useState, useEffect } from 'react';
import { X, Settings2, Zap, Cpu, Layers, Gamepad2, Bot, Database, HardDrive, Crown, User, ArrowLeftRight, Trophy, FolderOpen, PenLine } from 'lucide-react';
import { clearImageCache } from '../../services/imageCache';
import { SettingsManager, GameSettings } from '../../services/SettingsManager';
import { SaveManager, hasFSAccess } from '../../services/SaveManager';
import { useGame } from '../../store/GameContext';
import { InflationEditor } from '../shared/InflationEditor';

const GAME_MODE_OPTIONS = [
  { value: 1 as const, label: '⚡ Fast',     description: 'Lean feeds, quick turns.' },
  { value: 2 as const, label: '⚖️ Balanced', description: 'Good mix of speed and detail.' },
  { value: 3 as const, label: '🧠 Best',     description: 'Full narrative, max detail.' },
];

type Tab = 'ai' | 'gameplay' | 'performance' | 'gm' | 'storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<GameSettings>(SettingsManager.getSettings());
  const { state, dispatchAction } = useGame();
  const isGM = state.gameMode === 'gm';
  const isGameLoaded = !!state.isDataLoaded;
  const [activeTab, setActiveTab] = useState<Tab>(isGameLoaded ? 'ai' : 'storage');
  const [cacheClearing, setCacheClearing] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [persistentStorage, setPersistentStorage] = useState<boolean | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSettings(SettingsManager.getSettings());
      setActiveTab(isGameLoaded ? 'ai' : 'storage');
      SaveManager.getSaveFolder().then(h => setFolderName(h ? (h as any).name ?? 'Saves Folder' : null));
      navigator.storage.persisted().then(setPersistentStorage);
    }
  }, [isOpen, isGameLoaded]);

  const handleSave = () => {
    SettingsManager.saveSettings(settings);
    onClose();
  };

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    // Storage is always available — even before a game is loaded
    { id: 'storage',     label: 'Storage',      icon: <HardDrive size={14} /> },
    // Gameplay tabs only when a game is loaded
    ...(isGameLoaded ? [
      { id: 'ai' as const,          label: 'AI',          icon: <Bot size={14} /> },
      { id: 'gameplay' as const,    label: 'Gameplay',    icon: <Gamepad2 size={14} /> },
      ...(isGM ? [{ id: 'gm' as const, label: 'GM Mode', icon: <User size={14} /> }] : []),
      { id: 'performance' as const, label: 'Performance', icon: <Zap size={14} /> },
    ] : []),
  ];

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings2 className="text-indigo-500" />
            Game Settings
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-800 bg-slate-900/30">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                activeTab === tab.id
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">

          {/* ── Storage ────────────────────────────────────────────────── */}
          {activeTab === 'storage' && (
            <>
              {/* External Save Folder */}
              {hasFSAccess() && (
                <div className="space-y-3">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <FolderOpen size={16} className="text-emerald-400" />
                    External Save Folder
                  </label>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Auto-mirrors every save as a compressed .json.gz file to a folder on your disk — no browser storage limit worries.
                  </p>
                  {folderName ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs px-3 py-2 rounded-xl font-mono truncate">
                        <FolderOpen size={13} />
                        <span className="truncate">{folderName}</span>
                      </div>
                      <button
                        onClick={async () => { await SaveManager.clearSaveFolder(); setFolderName(null); }}
                        className="px-3 py-2 text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors flex-shrink-0 border border-rose-500/20"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        const result = await SaveManager.chooseSaveFolder();
                        if (result) setFolderName(result.name);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-300 text-sm font-medium rounded-xl transition-all"
                    >
                      <FolderOpen size={15} />
                      Choose Folder
                    </button>
                  )}
                </div>
              )}

              {/* Persistent Storage */}
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="space-y-1 flex-1 mr-3">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <Database size={16} className={persistentStorage ? 'text-emerald-400' : 'text-slate-500'} />
                    Persistent Storage
                  </label>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Protects your saves from being silently cleared by the browser when disk space runs low. Strongly recommended.
                  </p>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${persistentStorage ? 'text-emerald-400' : 'text-amber-400'}`}>
                    Status: {persistentStorage === null ? 'checking…' : persistentStorage ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                {!persistentStorage && (
                  <button
                    onClick={async () => {
                      const granted = await navigator.storage.persist();
                      setPersistentStorage(granted);
                    }}
                    className="px-3 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors flex-shrink-0"
                  >
                    Enable
                  </button>
                )}
                {persistentStorage && (
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>

              {/* Image Cache */}
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="space-y-1 flex-1 mr-3">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <HardDrive size={16} className={settings.enableImageCache ? 'text-teal-400' : 'text-slate-500'} />
                    Image Caching
                  </label>
                  <p className="text-xs text-slate-400">
                    Auto-downloads player photos for faster loading. Disable to save storage.
                  </p>
                  <button
                    onClick={async () => { setCacheClearing(true); await clearImageCache(); setCacheClearing(false); }}
                    disabled={cacheClearing}
                    className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors disabled:text-slate-600"
                  >
                    {cacheClearing ? 'Clearing...' : 'Clear Cache'}
                  </button>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, enableImageCache: !settings.enableImageCache })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.enableImageCache ? 'bg-teal-500' : 'bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.enableImageCache ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </>
          )}

          {/* ── AI & Narrative ─────────────────────────────────────────── */}
          {activeTab === 'ai' && (
            <>
              {/* Enable AI Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <Cpu size={16} className={settings.enableLLM ? 'text-emerald-400' : 'text-slate-500'} />
                    AI Commentary &amp; Narratives
                  </label>
                  <p className="text-xs text-slate-400">
                    Powers news, social posts, DMs &amp; reactions. Off = fast offline play.
                  </p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, enableLLM: !settings.enableLLM })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.enableLLM ? 'bg-indigo-500' : 'bg-slate-600'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enableLLM ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Executive Outcome panel */}
              {settings.enableLLM && (
                <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-white flex items-center gap-2">
                      <Cpu size={16} className={settings.showExecutiveOutcome ? 'text-amber-400' : 'text-slate-500'} />
                      Executive Outcome Panel
                    </label>
                    <p className="text-xs text-slate-400">
                      Shows the AI narrative summary after each simulated day. Turn off to skip it entirely.
                    </p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, showExecutiveOutcome: !(settings.showExecutiveOutcome ?? true) })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      (settings.showExecutiveOutcome ?? true) ? 'bg-amber-500' : 'bg-slate-600'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      (settings.showExecutiveOutcome ?? true) ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              )}

              {/* Game Mode */}
              {settings.enableLLM && (
                <div className="space-y-3">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <Cpu size={16} className="text-indigo-400" />
                    Game Mode
                  </label>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Sets the content volume and model tier. Fast generates the leanest output; Best goes all-out.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {GAME_MODE_OPTIONS.map(opt => {
                      const isSelected = settings.llmPerformance === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setSettings({ ...settings, llmPerformance: opt.value })}
                          className={`flex flex-col gap-1.5 p-3 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-500/10 text-white'
                              : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                          }`}
                        >
                          <span className="text-sm font-black">{opt.label}</span>
                          <span className="text-[10px] leading-tight text-slate-500">{opt.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Simulation Depth */}
              {settings.enableLLM && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-white flex items-center gap-2">
                      <Layers size={16} className="text-violet-400" />
                      Simulation Depth
                    </label>
                    <span className="text-xs font-mono text-violet-400 bg-violet-500/10 px-2 py-1 rounded">
                      {settings.simulationDepth}/10
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Scales how much context is packed into each prompt. Lower = faster; higher = richer.
                  </p>
                  <input
                    type="range" min="1" max="10"
                    value={settings.simulationDepth}
                    onChange={e => setSettings({ ...settings, simulationDepth: parseInt(e.target.value) })}
                    className="w-full accent-violet-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    <span>Lean</span>
                    <span>Rich</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Gameplay ───────────────────────────────────────────────── */}
          {activeTab === 'gameplay' && (
            <>
              {/* Game Mode Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    {isGM ? <User size={16} className="text-emerald-400" /> : <Crown size={16} className="text-indigo-400" />}
                    {isGM ? 'GM Mode' : 'Commissioner Mode'}
                  </label>
                  <p className="text-xs text-slate-400">
                    {isGM ? 'Manage one team. Switch to Commissioner for full league control.' : 'Control the entire league. Switch to GM for single-team management.'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newMode = isGM ? 'commissioner' : 'gm';
                    // Preserve userTeamId across switches so flipping GM → Commissioner → GM lands you back on your franchise
                    // instead of the alphabetically-first team. Mode-aware consumers (AI handlers, helpers) gate on gameMode,
                    // so leaving userTeamId set during commissioner mode is safe.
                    const nextUserTeamId = newMode === 'gm'
                      ? (state.userTeamId ?? state.teams[0]?.id)
                      : state.userTeamId;
                    dispatchAction({ type: 'UPDATE_STATE', payload: {
                      gameMode: newMode,
                      userTeamId: nextUserTeamId,
                    }} as any);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                    isGM
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  Switch to {isGM ? 'Commissioner' : 'GM'}
                </button>
              </div>

              {/* Advance Day on Transaction */}
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <Gamepad2 size={16} className={settings.advanceDayOnTransaction ? 'text-amber-400' : 'text-slate-500'} />
                    Advance Day on Transactions
                  </label>
                  <p className="text-xs text-slate-400">
                    Signing or trading advances the sim day. Turn off for instant transactions.
                  </p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, advanceDayOnTransaction: !settings.advanceDayOnTransaction })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.advanceDayOnTransaction ? 'bg-amber-500' : 'bg-slate-600'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.advanceDayOnTransaction ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Allow AI Trades */}
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <Bot size={16} className={settings.allowAITrades ? 'text-blue-400' : 'text-slate-500'} />
                    AI Trades
                  </label>
                  <p className="text-xs text-slate-400">
                    AI teams propose and execute trades autonomously during the season.
                  </p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, allowAITrades: !settings.allowAITrades })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.allowAITrades ? 'bg-blue-500' : 'bg-slate-600'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.allowAITrades ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Allow AI Free Agency */}
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <Bot size={16} className={settings.allowAIFreeAgency ? 'text-emerald-400' : 'text-slate-500'} />
                    AI Free Agency &amp; Extensions
                  </label>
                  <p className="text-xs text-slate-400">
                    AI teams sign free agents and offer mid-season extensions autonomously.
                  </p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, allowAIFreeAgency: !settings.allowAIFreeAgency })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.allowAIFreeAgency ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.allowAIFreeAgency ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* AI Trade Frequency */}
              {settings.allowAITrades && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-white flex items-center gap-2">
                      <Bot size={16} className="text-blue-400" />
                      AI Trade Frequency
                    </label>
                    <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
                      {(settings.aiTradeFrequency ?? 50) === 0
                        ? 'Off'
                        : (settings.aiTradeFrequency ?? 50) <= 30
                          ? 'Quiet'
                          : (settings.aiTradeFrequency ?? 50) <= 70
                            ? 'Default'
                            : 'Active'}
                    </span>
                  </div>
                  <input
                    type="range" min="0" max="100" step="10"
                    value={settings.aiTradeFrequency ?? 50}
                    onChange={e => setSettings({ ...settings, aiTradeFrequency: parseInt(e.target.value) })}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    <span>Never</span>
                    <span>Default</span>
                    <span>Chaos</span>
                  </div>
                </div>
              )}

              {/* Cap Inflation — Commissioner only */}
              {!isGM && <InflationEditor compact />}

              {/* Hall of Fame Threshold — Commissioner only */}
              {!isGM && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-white flex items-center gap-2">
                      <Trophy size={16} className="text-yellow-400" />
                      Hall of Fame Threshold
                    </label>
                    <span className="text-xs font-mono text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded">
                      {settings.hofWSThreshold ?? 50} WS
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Career Win Shares needed for HOF induction. Lower = more inductees, higher = exclusive. Real NBA benchmark is ~100; default 50 makes the hall accessible. Inductions happen 3 seasons after retirement.
                  </p>
                  <input
                    type="range" min="20" max="150" step="5"
                    value={settings.hofWSThreshold ?? 50}
                    onChange={e => setSettings({ ...settings, hofWSThreshold: parseInt(e.target.value) })}
                    className="w-full accent-yellow-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    <span>Generous (20)</span>
                    <span>Default (50)</span>
                    <span>Elite (150)</span>
                  </div>
                </div>
              )}

              {/* Max Box Score Years */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <Database size={16} className="text-amber-400" />
                    Box Score History
                  </label>
                  <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                    {settings.maxBoxScoreYears} {settings.maxBoxScoreYears === 1 ? 'season' : 'seasons'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  How many seasons of box scores to keep. Older games are pruned at each season rollover to save memory. Higher = more game log history available.
                </p>
                <input
                  type="range" min="1" max="5"
                  value={settings.maxBoxScoreYears}
                  onChange={e => setSettings({ ...settings, maxBoxScoreYears: parseInt(e.target.value) })}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                  <span>1 season</span>
                  <span>5 seasons</span>
                </div>
              </div>
            </>
          )}

          {/* ── GM Mode ────────────────────────────────────────────────── */}
          {activeTab === 'gm' && isGM && (
            <>
              {/* Trade Difficulty */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <ArrowLeftRight size={16} className="text-rose-400" />
                    Trade Difficulty
                  </label>
                  <span className="text-xs font-mono text-rose-400 bg-rose-500/10 px-2 py-1 rounded">
                    {(() => {
                      const d = settings.tradeDifficulty ?? 50;
                      if (d <= 15) return 'Easy';
                      if (d <= 40) return 'Generous';
                      if (d <= 60) return 'Default';
                      if (d <= 85) return 'Tough';
                      return 'Brutal';
                    })()}
                  </span>
                </div>
                <input
                  type="range" min="0" max="100" step="5"
                  value={settings.tradeDifficulty ?? 50}
                  onChange={e => setSettings({ ...settings, tradeDifficulty: parseInt(e.target.value) })}
                  className="w-full accent-rose-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                  <span>Easy</span>
                  <span>Default</span>
                  <span>Brutal</span>
                </div>
              </div>

              {/* Signing Difficulty */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <PenLine size={16} className="text-emerald-400" />
                    Signing Difficulty
                  </label>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                    {(() => {
                      const d = settings.signingDifficulty ?? 50;
                      if (d <= 15) return 'Easy';
                      if (d <= 40) return 'Generous';
                      if (d <= 60) return 'Default';
                      if (d <= 85) return 'Tough';
                      return 'Brutal';
                    })()}
                  </span>
                </div>
                <input
                  type="range" min="0" max="100" step="5"
                  value={settings.signingDifficulty ?? 50}
                  onChange={e => setSettings({ ...settings, signingDifficulty: parseInt(e.target.value) })}
                  className="w-full accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                  <span>Easy</span>
                  <span>Default</span>
                  <span>Brutal</span>
                </div>
              </div>
            </>
          )}

          {/* ── Performance ────────────────────────────────────────────── */}
          {activeTab === 'performance' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap size={16} className="text-amber-400" />
                  Game Speed
                </label>
                <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                  {settings.gameSpeed}/10
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Controls the delay between simulated days and UI animations.
              </p>
              <input
                type="range" min="1" max="10"
                value={settings.gameSpeed}
                onChange={e => setSettings({ ...settings, gameSpeed: parseInt(e.target.value) })}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                <span>Slow</span>
                <span>Fast</span>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
