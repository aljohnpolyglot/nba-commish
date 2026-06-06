import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, Swords, Shield, HeartPulse, Users, Calendar, Activity, ChevronRight, Check, Target, Info, BarChart3 } from 'lucide-react';
import { Allocations, TrainingParadigm } from '../types';
import { systemDescriptions, defensiveSystemDescriptions } from '../lib/coachSliders';
import { Tooltip } from './ToolTip';
import {
  ACCENT_CLASSES,
  getIntensityDescription,
  PARADIGM_ACTIVE_CLASSES,
  PARADIGM_CHECK_TEXT,
  PARADIGM_DEFAULT_SYSTEMS,
  PARADIGM_TEMPLATES,
} from './dailyPlanModalConfig';

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

export function DailyPlanModal({ isOpen, onClose, day, activity, intensity: initIntensity, allocations: initAllocations, paradigm: initParadigm, top5Systems, onSave }: Props) {
  const [localIntensity, setLocalIntensity] = useState(initIntensity);
  const [localAllocations, setLocalAllocations] = useState<Allocations>(initAllocations);
  const [localParadigm, setLocalParadigm] = useState<TrainingParadigm>(initParadigm);
  const [localSystems, setLocalSystems] = useState<string[]>([]);
  const [systemTab, setSystemTab] = useState<'offense' | 'defense'>('offense');

  // Hydrate local state ONLY on the false→true transition. Re-running on every
  // prop change clobbered user clicks (paradigm picker, slider, system toggles)
  // because parent re-renders produce new top5Systems / initAllocations refs.
  //
  // Robust default: a saved plan that lost its allocations (legacy / migration /
  // user wiped to 0) hydrates from PARADIGM_TEMPLATES so the modal always opens
  // with sane sliders — Balanced 50% with 30/30/20/20 is the floor.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const paradigm: TrainingParadigm = initParadigm ?? 'Balanced';
      const preset = PARADIGM_TEMPLATES[paradigm];
      const allocSum = (initAllocations?.offense ?? 0) + (initAllocations?.defense ?? 0)
        + (initAllocations?.conditioning ?? 0) + (initAllocations?.recovery ?? 0);
      const allocations: Allocations = allocSum > 0
        ? initAllocations
        : { ...preset.allocations };
      const intensity = (typeof initIntensity === 'number' && initIntensity > 0)
        ? initIntensity
        : preset.intensity;
      setLocalIntensity(intensity);
      setLocalAllocations(allocations);
      setLocalParadigm(paradigm);
      const systems = allocations.systemFocus && allocations.systemFocus.length > 0
        ? allocations.systemFocus
        : (top5Systems && top5Systems.length > 0)
          ? top5Systems
          : PARADIGM_DEFAULT_SYSTEMS[paradigm];
      setLocalSystems(systems);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initIntensity, initAllocations, initParadigm, top5Systems]);

  const handleParadigmSelect = (p: TrainingParadigm) => {
    setLocalParadigm(p);
    setLocalAllocations(PARADIGM_TEMPLATES[p].allocations);
    setLocalIntensity(PARADIGM_TEMPLATES[p].intensity);
    // Seed paradigm defaults when the user hasn't touched the system picker —
    // otherwise switching to e.g. Defensive without picking a scheme leaves
    // localSystems holding the previous paradigm's offense list.
    if (localSystems.length === 0) {
      setLocalSystems(PARADIGM_DEFAULT_SYSTEMS[p]);
    }
  };

  // Defensive save fallback — three call sites invoke onSave with
  // `systemFocus: localSystems`. If the user closed without touching anything
  // and localSystems is empty, fill from paradigm defaults so reps land in
  // byOffense/byDefense.
  const resolvedSystems = (): string[] =>
    localSystems.length > 0 ? localSystems : PARADIGM_DEFAULT_SYSTEMS[localParadigm];

  const toggleSystem = (system: string) => {
    setLocalSystems(prev => {
      if (prev.includes(system)) return prev.filter(s => s !== system);
      // At cap — evict the oldest pick so the newest click always wins.
      if (prev.length >= 5) return [...prev.slice(1), system];
      return [...prev, system];
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              onSave(localIntensity, { ...localAllocations, systemFocus: resolvedSystems() }, localParadigm);
              onClose();
            }}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            className="relative w-full md:max-w-4xl bg-slate-900 md:border border-slate-800 md:rounded-[3rem] rounded-none shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden flex flex-col md:max-h-[calc(100vh-2rem)] h-full"
          >
            {/* Header */}
            <div className="p-6 md:p-10 border-b border-slate-800 bg-slate-900/50">
               <div className="flex justify-between items-start gap-3 mb-4 md:mb-6">
                  <div className="flex items-center gap-4 md:gap-6 min-w-0">
                     <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-3xl bg-indigo-600/20 flex items-center justify-center border border-indigo-500/30">
                        <Calendar size={24} className="text-indigo-400 md:w-8 md:h-8" />
                     </div>
                     <div className="min-w-0">
                        <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-tighter leading-none mb-1 md:mb-2 lg:text-3xl">
                          {day === 0 ? 'Team Practice Template' : `Plan Day ${day}`}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 md:gap-3">
                           {day !== 0 && (
                             <span className="text-[8px] md:text-[10px] font-black bg-slate-800 text-slate-400 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-slate-700 uppercase tracking-widest">{activity}</span>
                           )}
                           <Activity size={10} className="text-slate-600 md:w-3 md:h-3" />
                           <span className="text-[8px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">Practice Plan</span>
                        </div>
                     </div>
                  </div>
                  <button onClick={() => {
                      onSave(localIntensity, { ...localAllocations, systemFocus: resolvedSystems() }, localParadigm);
                      onClose();
                  }} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-white transition-all flex-shrink-0">
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
                              <Tooltip text="Game-speed vs walk-through. Low = film & walk-throughs. High (70%+) raises dev cap and injury risk. Recovery days locked at 15%.">
                                 <div className="bg-slate-800 p-0.5 md:p-1 rounded-full cursor-help">
                                    <Info size={10} className="text-slate-400 md:w-3 md:h-3" />
                                 </div>
                              </Tooltip>
                           </div>
                           <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">How hard the day should feel</p>
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
                       <span>Light</span>
                       <span className="text-sky-400/60">Balanced</span>
                       <span className="text-rose-400/60 text-right">Heavy</span>
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
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Choose the kind of day you want</p>
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
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Where the staff spends its time</p>
                     </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                     <AllocationSlider label="Offense" bucket="offense" alloc={localAllocations} setAlloc={setLocalAllocations} icon={<Swords size={14} />} color="rose" />
                     <AllocationSlider label="Defense" bucket="defense" alloc={localAllocations} setAlloc={setLocalAllocations} icon={<Shield size={14} />} color="indigo" />
                     <AllocationSlider label="Biometrics" bucket="conditioning" alloc={localAllocations} setAlloc={setLocalAllocations} icon={<Users size={14} />} color="purple" />
                     <AllocationSlider label="Recovery" bucket="recovery" alloc={localAllocations} setAlloc={setLocalAllocations} icon={<HeartPulse size={14} />} color="violet" />
                  </div>
                  <p className="mt-4 text-[9px] text-slate-600 font-bold uppercase tracking-widest text-center">
                    Total {localAllocations.offense + localAllocations.defense + localAllocations.conditioning + localAllocations.recovery}% · Drag to redistribute
                  </p>
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
                              <Tooltip text="Up to 5 sets the team drills today. Each rep raises System Familiarity — the higher the meter, the better the team executes that set in-game. Mix offense and defense.">
                                 <div className="bg-slate-800 p-0.5 md:p-1 rounded-full cursor-help">
                                    <Info size={10} className="text-slate-400 md:w-3 md:h-3" />
                                 </div>
                              </Tooltip>
                           </div>
                           <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Choose up to five sets to rehearse</p>
                        </div>
                     </div>
                     <span className="text-[9px] md:text-xs font-black uppercase tracking-widest text-slate-500">
                        {localSystems.length} / 5 Chosen
                     </span>
                  </div>

                  {/* Offense / Defense toggle */}
                  <div className="flex gap-1 mb-3 bg-slate-900/60 border border-slate-800 rounded-lg p-1">
                    <button
                      onClick={() => setSystemTab('offense')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-colors ${
                        systemTab === 'offense'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                          : 'text-slate-500 hover:text-slate-300 border border-transparent'
                      }`}
                    >
                      <Swords size={10} />
                      Offense
                      <span className="text-[8px] opacity-60">
                        {localSystems.filter(s => systemDescriptions[s]).length}
                      </span>
                    </button>
                    <button
                      onClick={() => setSystemTab('defense')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-colors ${
                        systemTab === 'defense'
                          ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                          : 'text-slate-500 hover:text-slate-300 border border-transparent'
                      }`}
                    >
                      <Shield size={10} />
                      Defense
                      <span className="text-[8px] opacity-60">
                        {localSystems.filter(s => defensiveSystemDescriptions[s]).length}
                      </span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 md:gap-2">
                     {Object.keys(systemTab === 'offense' ? systemDescriptions : defensiveSystemDescriptions).map(systemName => {
                        const isSelected = localSystems.includes(systemName);
                        const accent = systemTab === 'offense'
                          ? 'bg-amber-500/20 border-amber-400/60 text-amber-100'
                          : 'bg-cyan-500/20 border-cyan-400/60 text-cyan-100';
                        return (
                          <button
                            key={systemName}
                            onClick={() => toggleSystem(systemName)}
                            className={`p-2.5 md:p-3 rounded-lg md:rounded-xl border text-[8px] md:text-[10px] font-black uppercase tracking-tight transition-all text-center ${
                               isSelected
                               ? accent
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
                   onSave(localIntensity, { ...localAllocations, systemFocus: resolvedSystems() }, localParadigm);
                   onClose();
                 }}
                 className="px-6 md:px-8 py-2 md:py-3 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-2 bg-indigo-500/90 hover:bg-indigo-400 text-white shadow-indigo-500/20"
               >
                 Save Changes <ChevronRight size={12} className="md:w-3.5 md:h-3.5" />
               </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

type AllocBucket = 'offense' | 'defense' | 'conditioning' | 'recovery';

interface AllocationSliderProps {
  label: string;
  bucket: AllocBucket;
  alloc: Allocations;
  setAlloc: React.Dispatch<React.SetStateAction<Allocations>>;
  icon: React.ReactNode;
  color: string;
}

/** Drags the chosen bucket to a new value and proportionally redistributes
 *  the delta across the other three so the sum stays at 100. If the others
 *  are all zero, the leftover dumps into recovery as a safe sink. */
function rebalance(prev: Allocations, bucket: AllocBucket, next: number): Allocations {
  const clamped = Math.max(0, Math.min(100, Math.round(next)));
  const others: AllocBucket[] = (['offense', 'defense', 'conditioning', 'recovery'] as AllocBucket[]).filter(b => b !== bucket);
  const otherSum = others.reduce((s, b) => s + (prev[b] ?? 0), 0);
  const remaining = 100 - clamped;
  const out: Allocations = { ...prev, [bucket]: clamped };
  if (otherSum === 0) {
    // No room to scale — give the leftover to recovery (rest is the safe default).
    const sink: AllocBucket = bucket === 'recovery' ? 'conditioning' : 'recovery';
    out[sink] = remaining;
    for (const b of others) if (b !== sink) out[b] = 0;
    return out;
  }
  // Scale others proportionally; round + correct rounding drift on the last bucket.
  let assigned = 0;
  others.forEach((b, i) => {
    if (i === others.length - 1) {
      out[b] = Math.max(0, remaining - assigned);
    } else {
      const v = Math.round(((prev[b] ?? 0) / otherSum) * remaining);
      out[b] = v;
      assigned += v;
    }
  });
  return out;
}

function AllocationSlider({ label, bucket, alloc, setAlloc, icon, color }: AllocationSliderProps) {
  const value = alloc[bucket] ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center pr-1">
        <div className="flex items-center gap-2">
          <span className={`text-${color}-500`}>{icon}</span>
          <span className="text-[10px] font-black text-slate-400 tracking-tight uppercase">{label}</span>
        </div>
        <span className="text-xs font-black text-white tabular-nums">{value}%</span>
      </div>
      <div className="relative">
        <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
          <div className={`h-full bg-${color}-500 transition-all duration-300`} style={{ width: `${value}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setAlloc(prev => rebalance(prev, bucket, Number(e.target.value)))}
          className="absolute inset-0 w-full h-3 -mt-1 opacity-0 cursor-pointer"
          aria-label={`${label} allocation`}
        />
      </div>
    </div>
  );
}
