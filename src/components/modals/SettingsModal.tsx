import React, { useState, useEffect } from 'react';
import { X, Settings2, Zap, Brain, Cpu } from 'lucide-react';
import { SettingsManager, GameSettings } from '../../services/SettingsManager';

const AI_SPEED_OPTIONS = [
  {
    value: 1 as const,
    label: '⚡ Fast',
    model: 'Gemini 2.5 Flash-Lite',
    description: 'Quickest responses, great for casual play. Best for low-end devices.',
  },
  {
    value: 2 as const,
    label: '⚖️ Balanced',
    model: 'Gemini 2.5 Flash',
    description: 'Best mix of speed and quality. Recommended for most players.',
  },
  {
    value: 3 as const,
    label: '🧠 Best',
    model: 'Gemini 2.5 Pro',
    description: 'Richest narratives and most detailed outcomes. Slower but premium.',
  },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<GameSettings>(SettingsManager.getSettings());

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

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings2 className="text-indigo-500" />
            Game Settings
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
          {/* AI Model Quality — 3-card picker */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-white flex items-center gap-2">
              <Brain size={16} className="text-indigo-400" />
              AI Model Quality
            </label>
            <div className="grid grid-cols-3 gap-2">
              {AI_SPEED_OPTIONS.map(opt => {
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
                    <span className={`text-[10px] font-bold ${isSelected ? 'text-indigo-300' : 'text-slate-500'}`}>
                      {opt.model}
                    </span>
                    <span className="text-[10px] leading-tight text-slate-500">{opt.description}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">
              💬 Chat messages always use Fast mode regardless of this setting.
            </p>
          </div>

          {/* Game Speed Slider */}
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
              Controls the delay between simulated days and UI animations. Higher values make the game run faster.
            </p>
            <input
              type="range"
              min="1"
              max="10"
              value={settings.gameSpeed}
              onChange={(e) => setSettings({ ...settings, gameSpeed: parseInt(e.target.value) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-medium uppercase tracking-wider">
              <span>Slow</span>
              <span>Fast</span>
            </div>
          </div>

          {/* Enable LLM Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="space-y-1">
              <label className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu size={16} className={settings.enableLLM ? "text-emerald-400" : "text-rose-400"} />
                Enable AI Features
              </label>
              <p className="text-xs text-slate-400">
                Turn off to bypass LLM generation entirely (uses fallback text).
              </p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, enableLLM: !settings.enableLLM })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.enableLLM ? 'bg-indigo-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.enableLLM ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

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
