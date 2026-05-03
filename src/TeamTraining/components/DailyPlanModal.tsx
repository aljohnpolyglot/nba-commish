import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, Swords, Shield, HeartPulse, Users, Calendar, Activity, ChevronRight, Check, Target, Info, BarChart3 } from 'lucide-react';
import { Allocations, TrainingParadigm } from '../types';
import { systemDescriptions } from '../lib/coachSliders';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  day: number;
  activity: string;
  intensity: number;
  allocations: Allocations;
  paradigm: TrainingParadigm;
  top5Systems: string[];
  onSave: (intensity: number, allocations: Allocations, paradigm: TrainingParadigm) => void;
}

// Game Mechanics Note:
// Please refer to /docs/training_mechanics.md for the updated training design spec.
// - Daily Offense/Defense training no longer directly affects OIQ/DIQ attributes, but instead upgrades the team's System Familiarity.
// - Biometric Focus heavily limits individual skill development and is primarily used to prevent age-related regression in SPD, JMP, STR, etc.
// 
// Additional info:
// - Light team intensity (Recovery) allows players to stay rested (100% condition), 
//   recommended before gamedays to lower fatigue.
// - Light training (low individual/team intensity) significantly reduces injury risk, 
//   making it essential for injured players and those with low durability or injury proneness.
// - High workload (85%+): Increases development caps by 1.3x for that session,
//   but decreases in-game performance and increases injury risk as fatigue accumulates.
// - Recovery Mechanics:
//   - If a player is set to High Intensity but plays 0 minutes in a game, they treat the 
//     game as a rest day, resetting fatigue compounding.
//   - Game minutes provide both experience points and natural development.

const PARADIGM_TEMPLATES: Record<TrainingParadigm, { label: string; intensity: number; allocations: Allocations; icon: React.ReactNode; color: string; tooltip: string }> = {
  'Balanced': {
    label: 'Balanced',
    intensity: 50,
    allocations: { offense: 30, defense: 30, conditioning: 20, recovery: 20 },
    icon: <Zap size={20} />,
    color: 'sky',
    tooltip: 'Balanced: Linearly builds Offensive & Defensive System Familiarity.'
  },
  'Offensive': {
    label: 'Offensive Heavy',
    intensity: 50,
    allocations: { offense: 60, defense: 10, conditioning: 10, recovery: 20 },
    icon: <Swords size={20} />,
    color: 'orange',
    tooltip: 'Offensive Heavy: Rapidly builds Offensive System Familiarity.'
  },
  'Defensive': {
    label: 'Defensive Grind',
    intensity: 50,
    allocations: { offense: 10, defense: 60, conditioning: 10, recovery: 20 },
    icon: <Shield size={20} />,
    color: 'red',
    tooltip: 'Defensive Grind: Rapidly builds Defensive System Familiarity.'
  },
  'Biometrics': {
    label: 'Biometrics Focus',
    intensity: 50,
    allocations: { offense: 10, defense: 10, conditioning: 60, recovery: 20 },
    icon: <Users size={20} />,
    color: 'emerald',
    tooltip: 'Biometrics Focus: Prevents age-related regression in physical stats, but stunts skill growth.'
  },
  'Recovery': {
    label: 'Load Management',
    intensity: 15,
    allocations: { offense: 5, defense: 5, conditioning: 10, recovery: 80 },
    icon: <HeartPulse size={20} />,
    color: 'violet',
    tooltip: 'Load Management: Minimizes physical strain while focusing on IQ film study.'
  }
};

// Concrete-class lookups so Tailwind JIT picks them up. These match the
// PlayerProgressionModal panel/icon-pill language (slate-950/40 panels,
// bg-{accent}-600/20 icon pill, text-{accent}-400 icon, paradigm-tinted
// active states with no bright bg-blue-600 anywhere).
const ACCENT_CLASSES = {
  sky:     { iconBg: 'bg-sky-600/20',     iconText: 'text-sky-400' },
  orange:  { iconBg: 'bg-orange-600/20',  iconText: 'text-orange-400' },
  emerald: { iconBg: 'bg-emerald-600/20', iconText: 'text-emerald-400' },
  indigo:  { iconBg: 'bg-indigo-600/20',  iconText: 'text-indigo-400' },
  rose:    { iconBg: 'bg-rose-600/20',    iconText: 'text-rose-400' },
} as const;

const PARADIGM_ACTIVE_CLASSES: Record<TrainingParadigm, string> = {
  Balanced:   'bg-sky-500/15 border-sky-400/60 ring-1 ring-sky-400/30 shadow-lg shadow-sky-900/20',
  Offensive:  'bg-orange-500/15 border-orange-400/60 ring-1 ring-orange-400/30 shadow-lg shadow-orange-900/20',
  Defensive:  'bg-red-500/15 border-red-400/60 ring-1 ring-red-400/30 shadow-lg shadow-red-900/20',
  Biometrics: 'bg-emerald-500/15 border-emerald-400/60 ring-1 ring-emerald-400/30 shadow-lg shadow-emerald-900/20',
  Recovery:   'bg-violet-500/15 border-violet-400/60 ring-1 ring-violet-400/30 shadow-lg shadow-violet-900/20',
};

const PARADIGM_CHECK_TEXT: Record<TrainingParadigm, string> = {
  Balanced:   'text-sky-200',
  Offensive:  'text-orange-200',
  Defensive:  'text-red-200',
  Biometrics: 'text-emerald-200',
  Recovery:   'text-violet-200',
};

const getIntensityDescription = (paradigm: TrainingParadigm, intensity: number) => {
  const desc: Record<TrainingParadigm, Record<string, string>> = {
    'Balanced': {
      low: 'Film study, walk-throughs',
      mid: 'Competitive drills, balanced reps',
      high: 'Full-speed 5v5, game intensity'
    },
    'Offensive': {
      low: 'Offensive film, spacing work',
      mid: 'Live offensive sets, game speed',
      high: 'Explosive 5v5 offense, max reps'
    },
    'Defensive': {
      low: 'Defensive schemes, closeouts',
      mid: 'Live defensive 5v5, pressure',
      high: 'Full-speed defense, game intensity'
    },
    'Biometrics': {
      low: 'Mobility, flexibility, prehab',
      mid: 'Speed & strength drills',
      high: 'Max effort vertical, plyometrics'
    },
    'Recovery': {
      low: 'Film study, light treatment',
      mid: 'Film study, light activation',
      high: 'Film study, mobility work'
    }
  };

  const bracket = intensity < 40 ? 'low' : intensity < 70 ? 'mid' : 'high';
  return desc[paradigm][bracket];
};

export function DailyPlanModal({ isOpen, onClose, day, activity, intensity: initIntensity, allocations: initAllocations, paradigm: initParadigm, top5Systems, onSave }: Props) {
  const [localIntensity, setLocalIntensity] = useState(initIntensity);
  const [localAllocations, setLocalAllocations] = useState<Allocations>(initAllocations);
  const [localParadigm, setLocalParadigm] = useState<TrainingParadigm>(initParadigm);
  const [localSystems, setLocalSystems] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setLocalIntensity(initIntensity);
      setLocalAllocations(initAllocations);
      setLocalParadigm(initParadigm);
      
      const systems = initAllocations.systemFocus && initAllocations.systemFocus.length > 0
        ? initAllocations.systemFocus 
        : top5Systems;
      setLocalSystems(systems);
    }
  }, [isOpen, initIntensity, initAllocations, initParadigm, activity, top5Systems]);

  const handleParadigmSelect = (p: TrainingParadigm) => {
    setLocalParadigm(p);
    setLocalAllocations(PARADIGM_TEMPLATES[p].allocations);
    setLocalIntensity(PARADIGM_TEMPLATES[p].intensity);
  };

  const toggleSystem = (system: string) => {
    setLocalSystems(prev => {
      if (prev.includes(system)) return prev.filter(s => s !== system);
      if (prev.length >= 5) return prev; // Limit to 5
      return [...prev, system];
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              onSave(localIntensity, { ...localAllocations, systemFocus: localSystems }, localParadigm);
              onClose();
            }}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            className="relative w-full md:max-w-4xl bg-slate-900 md:border border-slate-800 md:rounded-[3rem] rounded-none shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden flex flex-col md:max-h-[90vh] h-full"
          >
            {/* Header */}
            <div className="p-6 md:p-10 border-b border-slate-800 bg-slate-900/50">
               <div className="flex justify-between items-start mb-4 md:mb-6">
                  <div className="flex items-center gap-4 md:gap-6">
                     <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-3xl bg-indigo-600/20 flex items-center justify-center border border-indigo-500/30">
                        <Calendar size={24} className="text-indigo-400 md:w-8 md:h-8" />
                     </div>
                     <div>
                        <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-tighter leading-none mb-1 md:mb-2 lg:text-3xl">Configure Day {day}</h2>
                        <div className="flex flex-wrap items-center gap-2 md:gap-3">
                           <span className="text-[8px] md:text-[10px] font-black bg-slate-800 text-slate-400 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-slate-700 uppercase tracking-widest">{activity}</span>
                           <Activity size={10} className="text-slate-600 md:w-3 md:h-3" />
                           <span className="text-[8px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">Training Plan</span>
                        </div>
                     </div>
                  </div>
                  <button onClick={() => {
                      onSave(localIntensity, { ...localAllocations, systemFocus: localSystems }, localParadigm);
                      onClose();
                  }} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-white transition-all">
                    <X size={20} className="md:w-6 md:h-6" />
                  </button>
               </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar space-y-8 md:space-y-12">
               {/* Workload Section */}
               <section className="bg-slate-950/40 border border-slate-800/50 rounded-3xl p-6">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-4 md:mb-6 relative group/header gap-4">
                     <div className="flex items-center gap-3">
                        <div className={`${ACCENT_CLASSES.sky.iconBg} p-2 rounded-lg`}>
                           <Activity size={16} className={ACCENT_CLASSES.sky.iconText} />
                        </div>
                        <div>
                           <div className="flex items-center gap-2">
                              <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest">Workload Intensity</h4>
                              <div className="bg-slate-800 p-0.5 md:p-1 rounded-full cursor-help">
                                 <Info size={10} className="text-slate-400 md:w-3 md:h-3" />
                              </div>
                           </div>
                           <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Sets global physical demand</p>
                        </div>
                     </div>
                     <span className={`text-2xl md:text-3xl font-black tabular-nums ${localIntensity > 85 ? 'text-red-500' : 'text-sky-300'}`}>
                        {localIntensity}%
                     </span>
                  </div>

                  <div className={`p-4 md:p-6 bg-slate-900/40 rounded-2xl border border-slate-800/40 ${localParadigm === 'Recovery' ? 'opacity-50 grayscale' : ''}`}>
                    {/* Slider Bar area */}
                    <div className="relative group/range mb-4">
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-slate-900 rounded-full overflow-hidden">
                         <div
                           className="h-full bg-gradient-to-r from-slate-700 via-sky-500/70 to-rose-500/70 transition-all duration-300"
                           style={{ width: `${localIntensity}%` }}
                         />
                      </div>
                      <input 
                        disabled={localParadigm === 'Recovery'}
                        type="range"
                        min="0"
                        max="100"
                        value={localIntensity}
                        onChange={(e) => {
                          const newIntensity = Number(e.target.value);
                          setLocalIntensity(newIntensity);
                          
                          let newRecovery = 100 - newIntensity;
                          if (newIntensity === 50) newRecovery = 20;
                          else if (newIntensity < 50) newRecovery = 20 + ((50 - newIntensity) * 1.6);
                          else newRecovery = 20 * ((100 - newIntensity) / 50);
                          
                          newRecovery = Math.max(0, Math.min(100, Math.round(newRecovery)));
                          const prevWorkload = 100 - localAllocations.recovery;
                          const newWorkload = 100 - newRecovery;
                          
                          if (prevWorkload > 0) {
                            const scale = newWorkload / prevWorkload;
                            setLocalAllocations(prev => ({
                              offense: Math.round(prev.offense * scale),
                              defense: Math.round(prev.defense * scale),
                              conditioning: newWorkload - Math.round(prev.offense * scale) - Math.round(prev.defense * scale),
                              recovery: newRecovery
                            }));
                          } else {
                            // Fallback
                            setLocalAllocations({
                              offense: Math.round(newWorkload * 0.4),
                              defense: Math.round(newWorkload * 0.4),
                              conditioning: newWorkload - 2 * Math.round(newWorkload * 0.4),
                              recovery: newRecovery
                            });
                          }
                        }}
                        className={`relative w-full h-8 bg-transparent appearance-none cursor-pointer accent-white z-10 ${localParadigm === 'Recovery' ? 'cursor-not-allowed' : ''}`}
                      />
                    </div>

                    {/* Risk Labels area */}
                    <div className="flex justify-between px-1 md:px-2 text-[8px] md:text-[10px] font-black text-slate-600 uppercase tracking-widest">
                       <span>Low Load</span>
                       <span className="text-sky-400/60">Optimal Dev</span>
                       <span className="text-rose-400/60 text-right">High Risk</span>
                    </div>

                    {/* Description area */}
                    <div className="mt-8 pt-6 border-t border-slate-800/30 flex justify-center">
                       <p className="text-[10px] md:text-xs text-sky-300 font-bold uppercase tracking-widest text-center">
                         {getIntensityDescription(localParadigm, localIntensity)}
                       </p>
                    </div>
                  </div>
               </section>

               {/* Focus Selector */}
               <section className="bg-slate-950/40 border border-slate-800/50 rounded-3xl p-6">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                     <div className={`${ACCENT_CLASSES.orange.iconBg} p-2 rounded-lg`}>
                        <Target size={16} className={ACCENT_CLASSES.orange.iconText} />
                     </div>
                     <div>
                        <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest">Training Focus</h4>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Pick a paradigm template</p>
                     </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
                     {(Object.keys(PARADIGM_TEMPLATES) as TrainingParadigm[]).map(p => {
                        const template = PARADIGM_TEMPLATES[p];
                        const isActive = localParadigm === p;
                        return (
                           <button
                            key={p}
                            onClick={() => handleParadigmSelect(p)}
                            className={`p-3 md:p-4 rounded-xl md:rounded-2xl border transition-all text-left flex flex-col gap-2 md:gap-3 relative overflow-hidden h-full group/paradigm ${
                              isActive
                              ? PARADIGM_ACTIVE_CLASSES[p]
                              : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                             <div className={`text-${template.color}-400 bg-slate-950/40 p-1 md:p-1.5 rounded-lg w-fit`}>
                                {React.cloneElement(template.icon as React.ReactElement<any>, { size: 14 })}
                             </div>
                             <div>
                                <div className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest leading-tight ${isActive ? 'text-white' : 'text-slate-200'}`}>
                                   {template.label}
                                </div>
                             </div>

                             {isActive && (
                               <div className="absolute top-3 right-3 md:top-4 md:right-4">
                                  <Check size={14} className={`${PARADIGM_CHECK_TEXT[p]} md:w-4 md:h-4`} />
                               </div>
                             )}
                          </button>
                        );
                     })}
                  </div>
               </section>

               {/* Allocation Preview Slots */}
               <section className="bg-slate-950/40 border border-slate-800/50 rounded-3xl p-6">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                     <div className={`${ACCENT_CLASSES.emerald.iconBg} p-2 rounded-lg`}>
                        <BarChart3 size={16} className={ACCENT_CLASSES.emerald.iconText} />
                     </div>
                     <div>
                        <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest">Focus Distribution</h4>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">How the day's minutes split</p>
                     </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                     <AllocationDisplay label="Offense" value={localAllocations.offense} icon={<Swords size={14} />} color="orange" />
                     <AllocationDisplay label="Defense" value={localAllocations.defense} icon={<Shield size={14} />} color="red" />
                     <AllocationDisplay label="Biometrics" value={localAllocations.conditioning} icon={<Users size={14} />} color="emerald" />
                     <AllocationDisplay label="Recovery" value={localAllocations.recovery} icon={<HeartPulse size={14} />} color="violet" />
                  </div>
               </section>

               {/* System Practice Section */}
               <section className="bg-slate-950/40 border border-slate-800/50 rounded-3xl p-6">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-6 gap-2">
                     <div className="flex items-center gap-3">
                        <div className={`${ACCENT_CLASSES.indigo.iconBg} p-2 rounded-lg`}>
                           <Target size={16} className={ACCENT_CLASSES.indigo.iconText} />
                        </div>
                        <div>
                           <div className="flex items-center gap-2">
                              <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest">System Practice</h4>
                              <div className="bg-slate-800 p-0.5 md:p-1 rounded-full cursor-help">
                                 <Info size={10} className="text-slate-400 md:w-3 md:h-3" />
                              </div>
                           </div>
                           <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Up to five sets to drill</p>
                        </div>
                     </div>
                     <span className="text-[9px] md:text-xs font-black uppercase tracking-widest text-slate-500">
                        {localSystems.length} / 5 Selected
                     </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 md:gap-2">
                     {Object.keys(systemDescriptions).map(systemName => {
                        const isSelected = localSystems.includes(systemName);
                        return (
                          <button
                            key={systemName}
                            onClick={() => toggleSystem(systemName)}
                            className={`p-2.5 md:p-3 rounded-lg md:rounded-xl border text-[8px] md:text-[10px] font-black uppercase tracking-tight transition-all text-center ${
                               isSelected
                               ? 'bg-indigo-500/20 border-indigo-400/60 text-indigo-100'
                               : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                            }`}
                          >
                             {systemName}
                          </button>
                        );
                     })}
                  </div>
               </section>
            </div>

            {/* Footer */}
            <div className="p-4 md:p-6 bg-slate-950/60 border-t border-slate-800 flex flex-col md:flex-row justify-end items-stretch md:items-center gap-2 md:gap-3">
               <button 
                 onClick={onClose}
                 className="px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
               >
                 Cancel
               </button>
               <button 
                 onClick={() => {
                   onSave(localIntensity, { ...localAllocations, systemFocus: localSystems }, localParadigm);
                   onClose();
                 }}
                 className="px-6 md:px-8 py-2 md:py-3 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-2 bg-indigo-500/90 hover:bg-indigo-400 text-white shadow-indigo-500/20"
               >
                 Save Plan <ChevronRight size={12} className="md:w-3.5 md:h-3.5" />
               </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function AllocationDisplay({ label, value, icon, color }: any) {
   return (
      <div className="space-y-3">
         <div className="flex justify-between items-center pr-1">
            <div className="flex items-center gap-2">
               <span className={`text-${color}-500`}>{icon}</span>
               <span className="text-[10px] font-black text-slate-400 tracking-tight uppercase">{label}</span>
            </div>
            <span className="text-xs font-black text-white tabular-nums">{value}%</span>
         </div>
         <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
            <div className={`h-full bg-${color}-500 transition-all duration-700`} style={{ width: `${value}%` }} />
         </div>
      </div>
   );
}
