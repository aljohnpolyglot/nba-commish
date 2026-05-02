import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, Swords, Shield, HeartPulse, Users, Calendar, Activity, ChevronRight, Check, Target, Info } from 'lucide-react';
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
    color: 'blue',
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
                     <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-3xl bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
                        <Calendar size={24} className="text-blue-400 md:w-8 md:h-8" />
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
               <section>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-4 md:mb-6 relative group/header gap-4">
                     <div className="flex items-center gap-3">
                        <div>
                           <div className="flex items-center gap-2">
                              <h3 className="text-base md:text-lg font-black text-white uppercase tracking-tight">Workload Intensity</h3>
                              <div className="bg-slate-800 p-0.5 md:p-1 rounded-full cursor-help">
                                 <Info size={10} className="text-slate-400 md:w-3 md:h-3" />
                              </div>
                           </div>
                           <p className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mt-1">Sets global physical demand</p>
                        </div>
                     </div>
                     <span className={`text-2xl md:text-3xl font-black tabular-nums ${localIntensity > 85 ? 'text-red-500' : 'text-blue-400'}`}>
                        {localIntensity}%
                     </span>
                  </div>
                  
                  <div className={`p-4 md:p-8 bg-slate-950/40 rounded-2xl md:rounded-[2rem] border border-slate-800/50 ${localParadigm === 'Recovery' ? 'opacity-50 grayscale' : ''}`}>
                    {/* Slider Bar area */}
                    <div className="relative group/range mb-4">
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-slate-900 rounded-full overflow-hidden">
                         <div 
                           className="h-full bg-blue-600 transition-all duration-300" 
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
                       <span className="text-blue-500/50">Optimal Dev</span>
                       <span className="text-red-500/50 text-right">High Risk</span>
                    </div>

                    {/* Description area */}
                    <div className="mt-8 pt-6 border-t border-slate-800/30 flex justify-center">
                       <p className="text-[10px] md:text-xs text-blue-400 font-bold uppercase tracking-widest text-center">
                         {getIntensityDescription(localParadigm, localIntensity)}
                       </p>
                    </div>
                  </div>
               </section>

               {/* Focus Selector */}
               <section>
                  <h3 className="text-base md:text-lg font-black text-white uppercase tracking-tight mb-4 md:mb-6">Training Focus</h3>
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
                              ? 'bg-blue-600 border-blue-400 shadow-xl shadow-blue-900/20' 
                              : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                             <div className={`${isActive ? 'text-white' : `text-${template.color}-400 md:text-${template.color}-400 shadow-none md:shadow-none`} bg-slate-950/20 p-1 md:p-1.5 rounded-lg w-fit`}>
                                {React.cloneElement(template.icon as React.ReactElement<any>, { size: 14 })}
                             </div>
                             <div>
                                <div className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest leading-tight ${isActive ? 'text-white' : 'text-slate-200'}`}>
                                   {template.label}
                                </div>
                             </div>
                             
                             {isActive && (
                               <div className="absolute top-3 right-3 md:top-4 md:right-4">
                                  <Check size={14} className="text-white md:w-4 md:h-4" />
                               </div>
                             )}
                          </button>
                        );
                     })}
                  </div>
               </section>

               {/* Allocation Preview Slots */}
               <section className="bg-slate-950/60 p-6 md:p-8 rounded-3xl md:rounded-[2.5rem] border border-slate-800/40">
                  <div className="flex items-center gap-2 mb-4 md:mb-6">
                     <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">Focus Distribution</span>
                     <div className="h-[1px] flex-1 bg-slate-800/50" />
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                     <AllocationDisplay label="Offense" value={localAllocations.offense} icon={<Swords size={14} />} color="orange" />
                     <AllocationDisplay label="Defense" value={localAllocations.defense} icon={<Shield size={14} />} color="red" />
                     <AllocationDisplay label="Biometrics" value={localAllocations.conditioning} icon={<Users size={14} />} color="emerald" />
                     <AllocationDisplay label="Recovery" value={localAllocations.recovery} icon={<HeartPulse size={14} />} color="violet" />
                  </div>
               </section>

               {/* System Practice Section */}
               <section>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-6 gap-2">
                  <div className="flex items-center gap-3 md:gap-4 text-left">
                     <Target size={20} className="text-blue-400 md:w-6 md:h-6" />
                     <div>
                        <div className="flex items-center gap-2 group relative">
                           <h3 className="text-base md:text-lg font-black text-white uppercase tracking-tight">System Practice</h3>
                           <div className="bg-slate-800 p-0.5 md:p-1 rounded-full cursor-help">
                              <Info size={10} className="text-slate-400 md:w-3 md:h-3" />
                           </div>
                        </div>
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
                               ? 'bg-blue-600 border-blue-400 text-white' 
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
                 className="px-6 md:px-8 py-2 md:py-3 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20"
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
