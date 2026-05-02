import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Target, Zap, Waves, Shield, Swords, Info, ChevronRight, Lock, CheckCircle2 } from 'lucide-react';
import { ArchetypeProfile, ARCHETYPE_PROFILES, ARCHETYPE_NAMES, getFocusWeights } from '../constants/archetypes';
import { ATTRIBUTE_LABELS, getK2SubAttributes } from '../constants/trainingSystems';
import { PlayerStats } from '../types';

/**
 * Game Mechanics: Player Development (Progression & Regression)
 *
 * Progression/Regression looks like this in the system:
 *
 * Example 1: Regression (Veteran)
 * Overall: 60 (-5) | Potential: 60 (-5)
 * Physical: Speed: 52 (-10), Endurance: 44 (-10)
 * Shooting: Three Pointers: 92 (-3), Mid Range: 80 (-3)
 * Skill: Offensive IQ: 66 (-3), Defensive IQ: 50 (-2)
 *
 * Example 2: Progression (Young Star)
 * Overall: 73 (+4) | Potential: 76 (+4)
 * Physical: Speed: 67 (+2), Endurance: 71 (+3)
 * Shooting: Dunks/Layups: 94 (+5), Free Throws: 59 (+4)
 * Skill: Offensive IQ: 77 (+5), Defensive IQ: 65 (+5)
 *
 * THE FUNNEL MODEL:
 * This training focus acts as a "funnel" for development.
 * 1. It does NOT add more total volume of growth/regression.
 * 2. It REDIRECTS (funnels) natural growth into focus-specific attributes.
 *    - e.g., A "Mid-Range Maestro" focus will ensure growth points are prioritized for Mid-Range,
 *      potentially sacrificing growth in Three Pointers or other areas to feed the focus area.
 * 3. Regression Protection: If a player trains a specific focus, they are less likely to
 *    regress in those attributes. Most of their regression will be funneled to "unimportant"
 *    attributes for that focus (e.g., Kyle Korver as a Sharpshooter retains 3P form while
 *    regressing more in Dunks or Dribbling).
 * 4. Individual vs. Team: This funnelling logic is independent of team training.
 *    It doesn't override team-based IQ gains, ensuring balanced development across the squad.
 * 5. Strength & Weight: Increasing Strength progression also results in a minimal,
 *    realistic increase in player weight. This is capped to prevent unnatural compounding,
 *    providing a subtle biometric feedback loop for physical training.
 * 6. Balanced Training: The "Balanced" focus represents the default progression engine.
 *    Setting a player to Balanced ensures they grow and regress at their natural rates
 *    without any specific funneling logic applied.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentFocus?: string | null;
  onSelect: (focus: string) => void;
  playerName?: string;
  playerPos?: string;
  playerAge?: number;
  playerStats?: PlayerStats;
  initialArchetype?: string | null;
  readOnly?: boolean;
  imgURL?: string;
}

export function TrainingFocusModal({
  isOpen,
  onClose,
  currentFocus,
  onSelect,
  playerName = 'System Preview',
  playerPos = 'Any',
  playerAge = 25,
  playerStats,
  initialArchetype = null,
  readOnly = false,
  imgURL
}: Props) {
  const [selectedArchetype, setSelectedArchetype] = React.useState<string | null>(initialArchetype);
  const [activeTab, setActiveTab] = React.useState<string>('Any');

  // Reset local state on open
  React.useEffect(() => {
    if (isOpen) {
      setSelectedArchetype(initialArchetype);

      if (initialArchetype) {
         const profile = ARCHETYPE_PROFILES[initialArchetype];
         if (profile) {
           if (profile.category === 'Scoring') {
             setActiveTab('Scoring');
           } else if (profile.category === 'Playmaking') {
             setActiveTab('Playmaking');
           } else if (profile.category === 'Defensive') {
             setActiveTab('Defensive');
           } else if (profile.category === 'Specialized') {
             setActiveTab('Specialized');
           } else {
             setActiveTab(profile.pos);
           }
         }
      } else {
         const posGroup = getGroup(playerPos);
         setActiveTab(posGroup);
      }
    }
  }, [isOpen, playerPos, initialArchetype]);

  const getGroup = (pos: string) => {
    // Hybrid positions (GF, G/F, FC, F/C) default to the larger half — the
    // archetype list is filtered, but hybrids unlock both halves via posGroups below.
    if (['PG', 'SG', 'G', 'GF', 'G/F'].includes(pos)) return 'G';
    if (['SF', 'PF', 'F', 'FC', 'F/C'].includes(pos)) return 'F';
    if (['C'].includes(pos)) return 'C';
    return 'Any';
  };

  const TABS = ['G', 'F', 'C', 'Any', 'Scoring', 'Playmaking', 'Defensive', 'Versatility', 'Specialized'];

  const TAB_LABELS: Record<string, string> = {
    'G': 'Guards',
    'F': 'Forwards',
    'C': 'Big Men',
    'Any': 'General',
    'Scoring': 'Scoring',
    'Playmaking': 'Playmaking',
    'Defensive': 'Defense',
    'Versatility': 'Versatile',
    'Specialized': 'Specialized'
  };

  const getFilteredArchetypes = (tab: string) => {
    const specializedNames = [
      'Limitless Sniper', 'Movement Shooter', 'Corner Sniper',
      'Mid-Range Maestro', 'The Unicorn', 'Isolation Specialist',
      'Conditioning Master', 'Elite Cutter', 'The Professor',
      'Free Throw Specialist', 'Glass Crasher', 'Catch & Shoot',
      'Veteran Maintenance'
    ];

    const generalNames = ['Balanced', 'Generalist', 'Glue Guy'];

    const versatileNames = [
      'Two-Way PG', 'Two-Way Wing', 'All-Around Wing', 'Swiss Army Knife', 'Two-Way Big'
    ];

    return ARCHETYPE_NAMES.filter(name => {
      const profile = ARCHETYPE_PROFILES[name];

      if (tab === 'Scoring') {
        const allowedScoring = ['Primary Creator', 'Scoring Guard', 'Volume Scorer', 'Shot Creator', 'Post Specialist', 'Freight Train'];
        return allowedScoring.includes(name);
      }

      if (tab === 'Playmaking') {
        const allowedPlaymaking = ['Primary Creator', 'Floor General', 'Pass-First Floor Gen', 'Sharpshooting Floor Gen', 'Point Forward', 'Offensive Hub'];
        return allowedPlaymaking.includes(name);
      }

      if (tab === 'Defensive') {
        const isDefensive = profile.category === 'Defensive';
        return isDefensive; // Always show defensive archetypes in the Defensive tab
      }

      if (tab === 'Versatility') {
        return profile.category === 'Versatility' || versatileNames.includes(name);
      }

      if (tab === 'Specialized') {
        return specializedNames.includes(name);
      }

      if (tab === 'Any') {
        return generalNames.includes(name);
      }

      return profile.pos === tab;
    });
  };

  const getWeightsData = (name: string) => getFocusWeights(name);

  const checkRequirements = (name: string) => {
    if (!playerStats) return { met: true };

    const profile = ARCHETYPE_PROFILES[name];
    const isAthleticType = name.toLowerCase().includes('athletic') ||
                           name.toLowerCase().includes('explosive') ||
                           name.toLowerCase().includes('rim-runner') ||
                           name.toLowerCase().includes('slasher');

    // Position restriction check.
    // Hybrid positions (GF, G/F, FC, F/C) qualify for BOTH halves of their
    // composite — a Guard-Forward is a valid Guard archetype AND a valid Forward.
    const posGroups = {
      'G': ['PG', 'SG', 'G', 'GF', 'G/F'],
      'F': ['SF', 'PF', 'F', 'GF', 'G/F', 'FC', 'F/C'],
      'C': ['C', 'FC', 'F/C'],
    };

    if (profile.pos !== 'Any') {
      const allowed = posGroups[profile.pos as keyof typeof posGroups];

      // Override for tall guards (Luka/LaMelo) to train as Wings/Forwards
      const isWingOverride = profile.pos === 'F' && ['PG', 'SG', 'G'].includes(playerPos) && (playerStats?.hgt || 0) > 45;

      if (!allowed.includes(playerPos) && !isWingOverride) {
        return {
          met: false,
          reason: playerPos === 'G' ? 'Requires Height > 45 for Wing training' : `Locked for ${playerPos} (Requires ${profile.pos})`
        };
      }
    }

    if (isAthleticType) {
      const spd = playerStats.spd || 0;
      const jmp = playerStats.jmp || 0;
      const met = spd >= 50 || jmp >= 50;
      return {
        met,
        reason: !met ? 'Requires 50+ Speed or 50+ Vertical' : undefined
      };
    }

    if (name === 'Switchable Defender') {
      const hgt = playerStats.hgt || 0;
      const spd = playerStats.spd || 0;
      const isCorrectPos = ['SF', 'PF', 'F', 'C', 'FC'].includes(playerPos);

      if (!isCorrectPos) {
        return { met: false, reason: 'Requires Frontcourt size (F or C)' };
      }

      const met = hgt > 45 && spd > 50;
      return {
        met,
        reason: !met ? `Requires Height > 45 and Speed > 50` : undefined
      };
    }

    if (name === 'The Unicorn') {
      const hgt = playerStats.hgt || 0;
      const met = hgt > 70;
      return {
        met,
        reason: !met ? 'Requires height attribute > 70' : undefined
      };
    }

    if (name === 'Veteran Maintenance') {
      const met = playerAge >= 30;
      return {
        met,
        reason: !met ? 'Requires Age 30+' : undefined
      };
    }

    return { met: true };
  };

  const currentProfile = selectedArchetype ? ARCHETYPE_PROFILES[selectedArchetype] : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full md:max-w-6xl max-h-[90vh] md:h-auto h-full bg-slate-900 md:border border-slate-800 md:rounded-[3rem] rounded-none shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex-shrink-0 p-6 md:p-10 border-b border-slate-800 bg-slate-900/80">
              <div className="flex justify-between items-start mb-6 md:mb-8">
                <div className="flex items-center gap-4 md:gap-6">
                  {imgURL ? (
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-[1rem] md:rounded-[1.5rem] bg-indigo-600/20 border border-indigo-500/30 overflow-hidden shrink-0">
                      <img src={imgURL} alt={playerName} className="w-full h-full object-cover scale-110 translate-y-1" referrerPolicy="no-referrer" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-[1rem] md:rounded-[1.5rem] bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                       <span className="text-indigo-400 font-black text-xl">{playerPos[0]}</span>
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-tighter leading-none mb-1 md:mb-2 text-balance lg:text-3xl">
                       {selectedArchetype ? 'Confirm Selection' : 'Training Focus'}
                    </h2>
                    <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-[0.2em] font-extrabold flex items-center gap-2">
                       <span className="text-white bg-indigo-600 px-1.5 py-0.5 rounded text-[8px] md:text-[10px] tracking-tight">{playerPos}</span> {playerName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 md:p-3 bg-slate-800 hover:bg-slate-700 rounded-xl md:rounded-2xl text-slate-400 hover:text-white transition-all shadow-xl border border-slate-700"
                >
                  <X size={18} className="md:w-5 md:h-5" />
                </button>
              </div>

              {!selectedArchetype && (
                <div className="flex overflow-x-auto no-scrollbar gap-1.5 p-1 bg-slate-950/50 rounded-xl md:rounded-[1.5rem] border border-slate-800 w-full md:w-fit whitespace-nowrap">
                  {TABS.map((tab) => {
                    const isActive = activeTab === tab;
                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 md:px-5 py-1.5 md:py-2 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all relative ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {TAB_LABELS[tab]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <AnimatePresence mode="wait">
                {!selectedArchetype ? (
                  <motion.div
                    key="selection"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4"
                  >
                    {getFilteredArchetypes(activeTab).map(name => {
                      const profile = ARCHETYPE_PROFILES[name];
                      const { met, reason } = checkRequirements(name);
                      const isActive = currentFocus === name;
                      const isCompatible = profile.pos === 'Any' || (
                         profile.pos === 'G' && ['PG', 'SG', 'G', 'GF', 'G/F'].includes(playerPos) ||
                         profile.pos === 'F' && ['SF', 'PF', 'F', 'GF', 'G/F', 'FC', 'F/C'].includes(playerPos) ||
                         profile.pos === 'C' && ['C', 'FC', 'F/C'].includes(playerPos)
                      );

                      return (
                        <button
                          key={name}
                        onClick={() => {
                          if (met && !readOnly) setSelectedArchetype(name);
                        }}
                        className={`group relative p-4 md:p-6 rounded-xl md:rounded-[1.5rem] border transition-all duration-500 text-left overflow-hidden h-full flex flex-col ${
                          !met
                          ? 'opacity-30 grayscale cursor-not-allowed bg-slate-950/40 border-slate-900 pointer-events-none'
                          : isActive
                            ? 'bg-indigo-600/20 border-indigo-500 shadow-[0_0_50px_rgba(79,70,229,0.2)] ring-1 ring-indigo-500/50'
                            : isCompatible
                              ? 'bg-slate-950/60 border-slate-700 hover:border-indigo-500/50 hover:bg-slate-900/80 shadow-lg'
                              : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-500 hover:bg-slate-900/60 opacity-60'
                        } ${readOnly && !isActive ? 'hidden' : ''}`}
                      >
                          {isCompatible && met && !isActive && (
                            <div className="absolute top-0 right-0 p-3">
                              <div className="bg-indigo-600/20 text-indigo-400 text-[8px] font-black px-2 py-0.5 rounded-full border border-indigo-500/20 tracking-widest">
                                COMPATIBLE
                              </div>
                            </div>
                          )}

                          {!met && (
                            <div className="absolute top-0 right-0 p-3">
                              <Lock size={14} className="text-slate-600" />
                            </div>
                          )}

                          <div className="relative z-10 space-y-3 flex-1">
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col">
                                   <span className={`text-lg font-black uppercase tracking-tighter transition-colors ${
                                     isActive ? 'text-indigo-400' : 'text-white'
                                   } ${met ? 'group-hover:text-indigo-200' : ''}`}>
                                     {name}
                                   </span>
                                   <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                                      {profile.category === 'Versatility' ? 'Two-Way/Versatile' :
                                       profile.category === 'Specialized' ? 'One-Way Master' :
                                       profile.category === 'Foundations' ? 'Standard Basis' :
                                       `${profile.pos} ${profile.category}`}
                                   </span>
                                </div>
                                {isActive && (
                                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_15px_#6366f1]" />
                                )}
                            </div>

                            <p className="text-[10px] text-slate-400 leading-relaxed font-bold uppercase tracking-tight opacity-70">
                              {met ? profile.description : reason}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </motion.div>
                ) : (
                  <motion.div
                    key="confirmation"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="p-4 md:p-8 max-w-4xl mx-auto space-y-4 md:space-y-6"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 bg-slate-950/40 p-6 md:p-8 rounded-2xl md:rounded-[2rem] border border-slate-800 max-h-[60vh] md:max-h-[70vh] overflow-y-auto custom-scrollbar">
                      <div className="space-y-4 md:space-y-6 flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.3em] mb-1 md:mb-2 block">Training Style</span>
                          <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter mb-1 md:mb-2">{selectedArchetype}</h3>
                          <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-tight leading-relaxed">
                            {currentProfile?.description}
                          </p>

                          {currentProfile?.comparison && (
                            <div className="mt-4 md:mt-6 p-4 md:p-5 bg-indigo-600/5 rounded-xl md:rounded-2xl border border-indigo-500/20">
                               <span className="text-[8px] md:text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-1.5 opacity-60">Elite Comparison</span>
                               <div className="flex items-center gap-2">
                                  <Zap size={14} className="text-indigo-400 md:w-4 md:h-4" />
                                  <span className="text-xs md:text-sm font-black text-white uppercase tracking-tight">{currentProfile.comparison}</span>
                                </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3 md:space-y-4">
                         <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block text-xs">Attribute Priorities</span>
                         <div className="grid grid-cols-1 gap-1">
                           {selectedArchetype && Object.entries(getWeightsData(selectedArchetype).rawWeights)
                             .filter(([attr, weight]) => attr !== 'hgt' && (weight as number) > 0.05)
                             .sort(([, a], [, b]) => (b as number) - (a as number))
                             .map(([attr, weight]) => (
                             <div key={attr} className="flex flex-col gap-2 py-2 md:py-3 px-3 md:px-4 bg-slate-900/40 rounded-lg md:rounded-xl border border-slate-800/40 group hover:border-indigo-500/30 transition-colors">
                               <div className="flex items-center justify-between gap-4">
                                 <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-indigo-400 whitespace-nowrap min-w-[80px] md:min-w-[100px]">{ATTRIBUTE_LABELS[attr] || attr}</span>
                                 <div className="flex-1">
                                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden w-full">
                                       <div
                                         className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                                         style={{ width: `${Math.min(100, Math.max(5, ((weight as number) / 0.5) * 100))}%` }}
                                       />
                                    </div>
                                 </div>
                               </div>
                               <div className="flex flex-wrap gap-1 mt-1">
                                 {getK2SubAttributes(attr, selectedArchetype).map((subAttr, i) => (
                                   <span key={i} className="text-[9px] md:text-[10px] font-bold text-slate-300 bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700/50">
                                     {subAttr}
                                   </span>
                                 ))}
                               </div>
                             </div>
                           ))}
                         </div>
                      </div>
                    </div>

                    {!readOnly && (
                      <div className="flex flex-col md:flex-row gap-2 md:gap-3">
                        <button
                          onClick={() => setSelectedArchetype(null)}
                          className="w-full md:flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 font-black text-xs uppercase tracking-widest hover:bg-slate-800 hover:text-white transition-all shadow-lg"
                        >
                          Back to Selection
                        </button>
                        <button
                          onClick={() => {
                            if (selectedArchetype) onSelect(selectedArchetype);
                            onClose();
                          }}
                          className="w-full md:flex-[2] py-3 md:py-4 rounded-xl md:rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-500 transition-all shadow-[0_10px_20px_rgba(79,70,229,0.3)]"
                        >
                          Confirm Training Plan
                        </button>
                      </div>
                    )}
                    {readOnly && (
                      <div className="mt-4 flex justify-center">
                         <button
                           onClick={onClose}
                           className="px-8 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                         >
                            Close Detail View
                         </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>


          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
