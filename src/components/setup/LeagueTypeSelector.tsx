import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Globe, ArrowLeft } from 'lucide-react';
import { ModdedBaseSelector } from './ModdedBaseSelector';
import { stopModdedSetupTrack } from './moddedSetupAudio';
import type { EuropeMarket, LeagueType, ModdedLeagueBase } from '../../types';

export type { EuropeMarket, LeagueType, ModdedLeagueBase } from '../../types';

export interface LeagueSetupSelection {
  leagueType: LeagueType;
  moddedLeagueBase?: ModdedLeagueBase;
  europeMarket?: EuropeMarket;
}

interface LeagueTypeSelectorProps {
  onSelect: (selection: LeagueSetupSelection) => void;
  onBack: () => void;
}

export const LeagueTypeSelector: React.FC<LeagueTypeSelectorProps> = ({ onSelect, onBack }) => {
  const [moddedStep, setModdedStep] = React.useState(false);

  if (moddedStep) {
    return <ModdedBaseSelector onSelect={onSelect} onBack={() => {
      stopModdedSetupTrack();
      setModdedStep(false);
    }} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />

      <button
        onClick={() => {
          stopModdedSetupTrack();
          onBack();
        }}
        className="absolute top-8 left-8 text-slate-400 hover:text-white flex items-center gap-2 transition-colors z-20"
      >
        <ArrowLeft size={20} /> Back to Menu
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-3xl"
      >
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-3">
            Choose Your League
          </h1>
          <p className="text-slate-400 text-sm">
            Start clean with our generated league — or load community-made real-world rosters.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Fictional */}
          <button
            onClick={() => onSelect({ leagueType: 'fictional' })}
            className="group relative p-6 rounded-2xl border-2 border-slate-800 bg-slate-900/50 hover:border-violet-500 hover:bg-violet-500/10 transition-all text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <Sparkles size={24} className="text-violet-400" />
              <h3 className="text-xl font-black text-white uppercase tracking-tight">Fictional League</h3>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded">
                Default
              </span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              30 generated teams, generated players, generated drama. <span className="text-white font-bold">100% original</span>, no external downloads, plays offline.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {['Cheesesteaks', 'Massacre', 'Missionaries', 'Snipers', 'Random Players'].map(tag => (
                <span key={tag} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-violet-500/10 text-violet-300 rounded">
                  {tag}
                </span>
              ))}
            </div>
          </button>

          {/* Modded */}
          <button
            onClick={() => setModdedStep(true)}
            className="group relative p-6 rounded-2xl border-2 border-slate-800 bg-slate-900/50 hover:border-amber-500 hover:bg-amber-500/10 transition-all text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <Globe size={24} className="text-amber-400" />
              <h3 className="text-xl font-black text-white uppercase tracking-tight">Modded League</h3>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded">
                Community Mod
              </span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Play with <span className="text-white font-bold">real-world teams and players</span> across supported leagues, contracts, competitions, and historical starting points.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {['NBA', 'Europe', 'PBA', 'Real Rosters'].map(tag => (
                <span key={tag} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-amber-500/10 text-amber-300 rounded">
                  {tag}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-slate-500 italic">
              Available clubs and seasons depend on the league you choose.
            </p>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
