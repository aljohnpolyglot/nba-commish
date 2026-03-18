import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User, ArrowRight, Crown, ArrowLeft, Settings, ChevronDown, ChevronUp, Zap, Bot } from 'lucide-react';
import { SettingsManager } from '../services/SettingsManager';
import { StartDateTimeline } from './setup/StartDateTimeline';
import { JumpReviewScreen } from './setup/JumpReviewScreen';

interface CommissionerSetupProps {
  onStart: (payload: {
    name: string;
    startScenario: string;
    skipLLM?: boolean;
    startDate: string;
    jumpRequired: boolean;
  }) => void;
  onBack: () => void;
}

type Step = 'name' | 'timeline' | 'review' | 'path';

export const CommissionerSetup: React.FC<CommissionerSetupProps> = ({ onStart, onBack }) => {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [chosenDate, setChosenDate] = useState<string>('2025-08-12');
  const [showSettings, setShowSettings] = useState(false);
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

  const handleDateSelected = (date: string) => {
    setChosenDate(date);
    if (date === '2025-08-12') {
      setStep('path');
    } else {
      setStep('review');
    }
  };

  const handleStart = (skipLLM: boolean) => {
    const nameCase = name.trim()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    onStart({
      name: nameCase,
      startScenario: 'regular_season',
      skipLLM,
      startDate: chosenDate,
      jumpRequired: chosenDate > '2025-08-12',
    });
  };

  const handleBack = () => {
    if (step === 'path') {
      // Go back to review if we went through it, else timeline
      if (chosenDate > '2025-08-12') {
        setStep('review');
      } else {
        setStep('timeline');
      }
    } else if (step === 'review') {
      setStep('timeline');
    } else if (step === 'timeline') {
      setStep('name');
    } else {
      onBack();
    }
  };

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
        onContinue={() => setStep('path')}
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
        {step === 'path' ? 'Back to Date' : 'Back to Menu'}
      </button>

      <motion.div
        key={step}
        initial={{ opacity: 0, x: step === 'path' ? 20 : -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="relative z-10 max-w-xl w-full"
      >
        {step === 'name' ? (
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

            <form onSubmit={handleNameSubmit} className="space-y-8">
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

              {/* Game Settings collapsible */}
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
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-1.5 text-white text-sm font-semibold">
                          <Bot size={14} className="text-violet-400" />
                          AI Commentary &amp; Narratives
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Enable AI commentary and narratives. Off = fast offline play.
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

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 text-white text-sm font-semibold">
                          <Zap size={14} className="text-amber-400" />
                          Simulation Speed
                        </div>
                        <span className="text-xs text-slate-400 font-mono">{settings.gameSpeed}/10</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={settings.gameSpeed}
                        onChange={e => updateSetting('gameSpeed', parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-full bg-slate-700 appearance-none cursor-pointer accent-amber-400"
                      />
                      <div className="flex justify-between text-xs text-slate-600 mt-1">
                        <span>Slow</span>
                        <span>Fast</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!name.trim()}
                className="w-full group relative flex items-center justify-center gap-3 py-4 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-2xl transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 disabled:shadow-none overflow-hidden mt-4"
              >
                <span className="relative z-10">Next Step</span>
                <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </button>
            </form>
          </div>
        ) : (
          // step === 'path'
          <div className="space-y-8">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-black text-white tracking-tight mb-2">
                Choose Your Entry
              </h2>
              <p className="text-slate-400">
                How would you like to begin your tenure, Commissioner {name}?
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                onClick={() => handleStart(false)}
                className="group relative flex flex-col items-center text-center p-8 bg-slate-900/50 border border-slate-800 rounded-3xl hover:border-indigo-500/50 hover:bg-indigo-950/20 transition-all duration-300"
              >
                <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Crown className="text-indigo-400" size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Full Briefing</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Receive comprehensive reports on league status, team dynamics, and media narratives. A deep dive into the current state of the NBA.
                </p>
                <div className="mt-6 flex items-center gap-2 text-indigo-400 font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                  Begin Journey <ArrowRight size={16} />
                </div>
              </button>

              <button
                onClick={() => handleStart(true)}
                className="group relative flex flex-col items-center text-center p-8 bg-slate-900/50 border border-slate-800 rounded-3xl hover:border-emerald-500/50 hover:bg-emerald-950/20 transition-all duration-300"
              >
                <div className="w-16 h-16 bg-emerald-600/20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <ArrowRight className="text-emerald-400" size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Immediate Command</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Skip the formalities. Jump straight to your desk and start making decisions immediately. The league office is ready for you.
                </p>
                <div className="mt-6 flex items-center gap-2 text-emerald-400 font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                  Take Control <ArrowRight size={16} />
                </div>
              </button>
            </div>
          </div>
        )}

        <p className="mt-12 text-center text-xs text-slate-600 font-medium max-w-md mx-auto">
          By taking office, you agree to handle all league crises, scandals, and draft lotteries with "integrity".
        </p>
      </motion.div>
    </div>
  );
};
