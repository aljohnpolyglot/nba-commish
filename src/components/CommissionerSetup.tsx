import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User, ArrowRight, Crown, ArrowLeft, Settings, ChevronDown, ChevronUp, Bot } from 'lucide-react';
import { SettingsManager } from '../services/SettingsManager';
import { INITIAL_LEAGUE_STATS } from '../constants';
import { getSeasonSimStartDate, toISODateString } from '../utils/dateUtils';

const SIM_START_DATE = toISODateString(getSeasonSimStartDate(INITIAL_LEAGUE_STATS.year)); // e.g. '2025-08-06'
import { StartDateTimeline } from './setup/StartDateTimeline';
import { JumpReviewScreen } from './setup/JumpReviewScreen';

interface CommissionerSetupProps {
  onStart: (payload: {
    name: string;
    startScenario: string;
    skipLLM?: boolean;
    startDate: string;
    jumpRequired: boolean;
    gameMode?: 'commissioner' | 'gm';
    userTeamId?: number;
  }) => void;
  onBack: () => void;
}

type Step = 'mode' | 'name' | 'timeline' | 'review';

export const CommissionerSetup: React.FC<CommissionerSetupProps> = ({ onStart, onBack }) => {
  const [step, setStep] = useState<Step>('mode');
  const [gameMode, setGameMode] = useState<'commissioner' | 'gm'>('commissioner');
  const [userTeamId, setUserTeamId] = useState<number>(0); // default first team
  const [name, setName] = useState('');
  const [chosenDate, setChosenDate] = useState<string>(SIM_START_DATE);
  const [showSettings, setShowSettings] = useState(true);
  const [settings, setSettings] = useState(() => SettingsManager.getSettings());

  const updateSetting = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    SettingsManager.saveSettings(updated);
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) setStep('timeline');
  };

  const handleStart = (overrideDate?: string) => {
    // Always reset to Fast mode when starting a new game
    SettingsManager.updateSettings({ llmPerformance: 1 });
    const nameCase = name.trim()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    const date = overrideDate ?? chosenDate;
    onStart({
      name: nameCase,
      startScenario: 'regular_season',
      skipLLM: !settings.enableLLM,
      startDate: date,
      jumpRequired: date > SIM_START_DATE,
      gameMode,
      userTeamId: gameMode === 'gm' ? userTeamId : undefined,
    });
  };

  const handleDateSelected = (date: string) => {
    setChosenDate(date);
    if (date === SIM_START_DATE) {
      handleStart(date);
    } else {
      setStep('review');
    }
  };

  const handleBack = () => {
    if (step === 'review') {
      setStep('timeline');
    } else if (step === 'timeline') {
      setStep('name');
    } else if (step === 'name') {
      setStep('mode');
    } else {
      onBack();
    }
  };

  // ── Mode Picker (first screen) ────────────────────────────────────────────
  if (step === 'mode') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
        <button
          onClick={onBack}
          className="absolute top-8 left-8 text-slate-400 hover:text-white flex items-center gap-2 transition-colors z-20"
        >
          <ArrowLeft size={20} /> Back to Menu
        </button>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-2xl">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-3">Choose Your Role</h1>
            <p className="text-slate-400 text-sm">How do you want to experience the NBA?</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Commissioner Card */}
            <button
              onClick={() => { setGameMode('commissioner'); setStep('name'); }}
              className={`group relative p-6 rounded-2xl border-2 transition-all text-left ${
                gameMode === 'commissioner'
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <Crown size={24} className="text-indigo-400" />
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Commissioner</h3>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Control the <span className="text-white font-bold">entire league</span>. Set rules, suspend players, force trades, manage finances, and shape the narrative.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {['Rules', 'Suspensions', 'Economy', 'LLM Narrative', 'All Teams'].map(tag => (
                  <span key={tag} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded">{tag}</span>
                ))}
              </div>
            </button>

            {/* GM Card */}
            <button
              onClick={() => { setGameMode('gm'); setStep('name'); }}
              className={`group relative p-6 rounded-2xl border-2 transition-all text-left ${
                gameMode === 'gm'
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <User size={24} className="text-emerald-400" />
                <h3 className="text-xl font-black text-white uppercase tracking-tight">General Manager</h3>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Manage <span className="text-white font-bold">one team</span>. Build your roster through trades, free agency, and the draft. Compete for a championship.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {['Trades', 'Free Agency', 'Draft', 'Roster', 'Your Team'].map(tag => (
                  <span key={tag} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded">{tag}</span>
                ))}
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Timeline and review are full-screen, handled separately
  if (step === 'timeline') {
    return (
      <StartDateTimeline
        onSelect={handleDateSelected}
        onBack={() => setStep('name')}
      />
    );
  }

  if (step === 'review') {
    return (
      <JumpReviewScreen
        chosenDate={chosenDate}
        onContinue={() => handleStart()}
        onBack={() => setStep('timeline')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-20" />

      <button
        onClick={handleBack}
        className="absolute top-8 left-8 text-slate-400 hover:text-white flex items-center gap-2 transition-colors z-20"
      >
        <ArrowLeft size={20} />
        Back to Menu
      </button>

      <motion.div
        key={step}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="relative z-10 max-w-xl w-full"
      >
        <div className="max-w-md mx-auto">
          <div className="text-center mb-10">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }}
              className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-2xl shadow-indigo-500/30"
            >
              <Crown size={40} className="text-white" />
            </motion.div>
            <h1 className="text-4xl font-black text-white tracking-tight mb-2">
              Welcome, Commissioner
            </h1>
            <p className="text-slate-400 text-lg">
              The league is waiting for your leadership.
            </p>
          </div>

          <form onSubmit={handleNameSubmit} className="space-y-6">
            <div className="space-y-3">
              <label htmlFor="name" className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                Enter Your Name
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                </div>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={20}
                  className="block w-full pl-12 pr-4 py-4 bg-slate-900/50 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-slate-900 transition-all outline-none font-medium text-lg"
                  placeholder="e.g. Adam Silver"
                  autoFocus
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Game Settings — always visible */}
            <div className="border border-slate-800 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSettings(s => !s)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/50 hover:bg-slate-800/50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                  <Settings size={15} />
                  Game Settings
                </div>
                {showSettings ? <ChevronUp size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
              </button>

              {showSettings && (
                <div className="px-4 pb-4 pt-2 space-y-4 bg-slate-900/30">
                  {/* AI toggle — top of settings */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-1.5 text-white text-sm font-semibold">
                        <Bot size={14} className="text-violet-400" />
                        AI Commentary &amp; Narratives
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Powers news, social posts, DMs &amp; reactions. Off = fast offline play.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSetting('enableLLM', !settings.enableLLM)}
                      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${settings.enableLLM ? 'bg-violet-600' : 'bg-slate-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${settings.enableLLM ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full group relative flex items-center justify-center gap-3 py-4 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-2xl transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 disabled:shadow-none overflow-hidden"
            >
              <span className="relative z-10">Choose Start Date</span>
              <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          </form>
        </div>

        <p className="mt-10 text-center text-xs text-slate-600 font-medium max-w-md mx-auto">
          By taking office, you agree to handle all league crises, scandals, and draft lotteries with "integrity".
        </p>
      </motion.div>
    </div>
  );
};
