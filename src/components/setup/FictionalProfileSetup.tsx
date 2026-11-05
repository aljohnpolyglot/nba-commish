import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Bot, ChevronDown, ChevronUp, Crown, Settings, User } from 'lucide-react';

interface FictionalProfileSetupProps {
  gameMode: 'commissioner' | 'gm';
  initialName: string;
  enableLLM: boolean;
  onToggleLLM: () => void;
  onContinue: (name: string) => void;
  onBack: () => void;
}

export const FictionalProfileSetup: React.FC<FictionalProfileSetupProps> = ({
  gameMode,
  initialName,
  enableLLM,
  onToggleLLM,
  onContinue,
  onBack,
}) => {
  const [name, setName] = useState(initialName);
  const [showSettings, setShowSettings] = useState(true);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim()) onContinue(name);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-20" />
      <button
        onClick={onBack}
        className="absolute top-8 left-8 text-slate-400 hover:text-white flex items-center gap-2 transition-colors z-20"
      >
        <ArrowLeft size={20} />
        Back to Menu
      </button>
      <motion.div
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
              {gameMode === 'gm' ? <User size={40} className="text-white" /> : <Crown size={40} className="text-white" />}
            </motion.div>
            <h1 className="text-4xl font-black text-white tracking-tight mb-2">
              {gameMode === 'gm' ? 'Welcome, GM' : 'Welcome, Commissioner'}
            </h1>
            <p className="text-slate-400 text-lg">
              {gameMode === 'gm'
                ? 'A franchise is about to bet five years on you.'
                : 'A new league is waiting for your blueprint.'}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
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
                  onChange={event => setName(event.target.value)}
                  maxLength={20}
                  className="block w-full pl-12 pr-4 py-4 bg-slate-900/50 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-slate-900 transition-all outline-none font-medium text-lg"
                  placeholder="e.g. Avery Stone"
                  autoFocus
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="border border-slate-800 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSettings(current => !current)}
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
                        Powers news, social posts, DMs &amp; reactions. Off = fast offline play.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onToggleLLM}
                      aria-pressed={enableLLM}
                      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${enableLLM ? 'bg-violet-600' : 'bg-slate-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${enableLLM ? 'translate-x-5' : 'translate-x-0'}`} />
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
              <span className="relative z-10">Build League</span>
              <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};
