import React, { useState, useEffect } from 'react';
import { X, Settings2, Zap, Cpu, Layers, Gamepad2, Bot, Database } from 'lucide-react';
import { SettingsManager, GameSettings } from '../../services/SettingsManager';

const GAME_MODE_OPTIONS = [
  { value: 1 as const, label: '⚡ Fast',     description: 'Lean feeds, quick turns.' },
  { value: 2 as const, label: '⚖️ Balanced', description: 'Good mix of speed and detail.' },
  { value: 3 as const, label: '🧠 Best',     description: 'Full narrative, max detail.' },
];

type Tab = 'ai' | 'gameplay' | 'performance';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<GameSettings>(SettingsManager.getSettings());
  const [activeTab, setActiveTab] = useState<Tab>('ai');

  useEffect(() => {
    if (isOpen) {
      setSettings(SettingsManager.getSettings());
    }
  }, [isOpen]);

  const handleSave = () => {
    SettingsManager.saveSettings(settings);
    onClose();
  };

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'ai',          label: 'AI',          icon: <Bot size={14} /> },
    { id: 'gameplay',    label: 'Gameplay',     icon: <Gamepad2 size={14} /> },
    { id: 'performance', label: 'Performance',  icon: <Zap size={14} /> },
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
                  <p className="text-xs text-slate-400 leading-relaxed">
                    How aggressively AI teams trade. 0 = no trades. 50 = default cadence (7d/3d/daily near deadline). 100 = maximum activity.
                  </p>
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
