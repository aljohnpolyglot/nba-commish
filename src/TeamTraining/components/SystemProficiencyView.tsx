import React, { useMemo, useState } from 'react';
import { Player, PlayerK2 } from '../types';
import { mapPlayerToK2 } from '../lib/playerMapping';
import { computeTeamProficiency } from '../../utils/coachSliders';
import { systemDescriptions } from '../lib/coachSliders';
import { getSystemProficiency } from '../lib/coachSliders';
import { Star, Zap, Info, TrendingUp, Activity, X, Target, Users, BookOpen, ChevronRight, GraduationCap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ARCHETYPE_PROFILES } from '../constants/archetypes';
import { TrainingFocusModal } from './TrainingFocusModal';
import { ATTRIBUTE_LABELS, getK2SubAttributes } from '../constants/trainingSystems';

interface Props {
  roster: Player[];
  /** Optional team-level familiarity to boost system scores — passed from TrainingCenterView. */
  systemFamiliarity?: { offense?: number; defense?: number };
  /** League-wide K2 rosters for slider normalization — must match what CoachingPage passes. */
  allRosters?: PlayerK2[][];
}

export function SystemProficiencyView({ roster, systemFamiliarity, allRosters }: Props) {
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);

  const { sortedProfs, coachSliders, k2Roster } = useMemo(() => {
    if (roster.length === 0) return { sortedProfs: [] as [string, number][], coachSliders: null, k2Roster: [] as PlayerK2[] };
    const mapped = roster.map(mapPlayerToK2);
    // Shared util — produces identical sortedProfs to CoachingView's CoachingPage.
    const { sortedProfs: sp, coachSliders } = computeTeamProficiency(mapped as any, allRosters as any, systemFamiliarity);
    return { sortedProfs: sp, coachSliders, k2Roster: mapped };
  }, [roster, systemFamiliarity, allRosters]);

  const tiers = useMemo(() => {
    const categories = {
      mastery: [] as [string, number][],
      competence: [] as [string, number][],
      learning: [] as [string, number][]
    };

    const bestScore = sortedProfs[0]?.[1] || 0;

    sortedProfs.forEach(p => {
      if (p[1] >= 85 || (bestScore >= 75 && p[1] >= bestScore - 3)) {
        categories.mastery.push(p);
      } else if (p[1] >= 70) {
        categories.competence.push(p);
      } else {
        categories.learning.push(p);
      }
    });

    return categories;
  }, [sortedProfs]);

  if (roster.length === 0) return null;

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Tier 1: Mastery */}
      {tiers.mastery.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Zap size={16} />
              Scheme Mastery
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-blue-400/20 to-transparent" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tiers.mastery.map(([name, score]) => (
              <SystemCard 
                key={name} 
                name={name} 
                score={score} 
                tier="mastery" 
                onClick={() => setSelectedSystem(name)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Tier 2: Competence */}
      {tiers.competence.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <TrendingUp size={16} />
              System Competence
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-slate-400/10 to-transparent" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {tiers.competence.map(([name, score]) => (
              <SystemCard 
                key={name} 
                name={name} 
                score={score} 
                tier="competence" 
                onClick={() => setSelectedSystem(name)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Tier 3: Learning */}
      {tiers.learning.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-[0.2em] flex items-center gap-2">
              <Activity size={16} />
              Incompatible Schemes
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-slate-800/20 to-transparent" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 opacity-70">
            {tiers.learning.map(([name, score]) => (
              <SystemCard 
                key={name} 
                name={name} 
                score={score} 
                tier="learning" 
                onClick={() => setSelectedSystem(name)}
              />
            ))}
          </div>
        </section>
      )}

      <AnimatePresence>
        {selectedSystem && (
          <SystemModal 
            name={selectedSystem} 
            roster={k2Roster}
            onClose={() => setSelectedSystem(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface SystemCardProps {
  name: string;
  score: number;
  tier: 'mastery' | 'competence' | 'learning';
  onClick: () => void;
  key?: string | number;
}

function SystemCard({ name, score, tier, onClick }: SystemCardProps) {
  const details = systemDescriptions[name];
  const stars = Math.round(Math.max(0, (score - 50) / 10) * 2) / 2;

  const renderStars = (rating: number) => {
    const s = [];
    for (let i = 1; i <= 5; i++) {
        const fill = Math.min(1, Math.max(0, rating - (i - 1)));
        s.push(
            <div key={i} className="relative">
                <Star size={12} className="text-slate-800 fill-slate-800" />
                <div 
                    className="absolute inset-0 overflow-hidden" 
                    style={{ width: `${fill * 100}%` }}
                >
                    <Star size={12} className={`${tier === 'mastery' ? 'text-blue-400 fill-blue-400' : 'text-slate-400 fill-slate-400'}`} />
                </div>
            </div>
        );
    }
    return <div className="flex gap-0.5">{s}</div>;
  };

  return (
    <button 
      onClick={onClick}
      className={`p-6 rounded-3xl border flex flex-col gap-4 transition-all duration-300 group text-left w-full ${
      tier === 'mastery' 
      ? 'bg-slate-900 border-blue-500/30 hover:border-blue-400 hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] cursor-pointer' 
      : 'bg-slate-950 border-slate-800 hover:border-slate-700 cursor-pointer'
    }`}>
      <div className="flex justify-between items-start">
        <h4 className={`text-sm font-black uppercase tracking-tight ${tier === 'mastery' ? 'text-white' : 'text-slate-400'}`}>{name}</h4>
        {renderStars(stars)}
      </div>
      <p className={`text-[11px] leading-relaxed line-clamp-2 ${tier === 'mastery' ? 'text-slate-400' : 'text-slate-600'}`}>
        {details?.desc}
      </p>
      <div className="mt-auto pt-2 flex items-center justify-between">
        <div className="h-1 flex-1 bg-slate-900 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-1000 ${tier === 'mastery' ? 'bg-blue-500' : 'bg-slate-700'}`}
            style={{ width: `${score}%` }} 
          />
        </div>
        <span className="ml-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{score}</span>
      </div>
    </button>
  );
}

function SystemModal({ name, roster, onClose }: { name: string, roster: PlayerK2[], onClose: () => void }) {
  const details = systemDescriptions[name];
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(0);
  
  const playerTiers = useMemo(() => {
    const sorted = roster.map(player => {
      const playerK2 = {
        OS: player.k2.OS,
        AT: player.k2.AT,
        IS: player.k2.IS,
        PL: player.k2.PL,
        DF: player.k2.DF,
        RB: player.k2.RB
      };

      const profs = getSystemProficiency(
        playerK2,
        0,
        player.stats,
        0,
        undefined,
        player.stats.oiq > 70 ? 1 : 0,
        70,
        false,
        50
      );

      const attributeFit = profs[name] || 0;
      const experienceBonus = Math.min(100, (player.ywt || 0) * 20); // 5 years = max experience bonus
      const combinedScore = (attributeFit * 0.8) + (experienceBonus * 0.2);

      return {
        player,
        fitScore: combinedScore
      };
    }).sort((a, b) => b.fitScore - a.fitScore);

    return {
      elite: sorted.filter(p => p.fitScore >= 85),
      strong: sorted.filter(p => p.fitScore >= 70 && p.fitScore < 85),
      developing: sorted.filter(p => p.fitScore < 70)
    };
  }, [roster, name]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" 
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full md:max-w-2xl bg-slate-900 md:border border-slate-800 md:rounded-[2.5rem] rounded-none overflow-hidden shadow-2xl flex flex-col md:max-h-[85vh] h-full"
      >
        <div className="p-6 md:p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
           <div className="flex items-center gap-3 md:gap-4">
              <div className="bg-blue-600 p-2.5 md:p-3 rounded-xl md:rounded-2xl shadow-lg shadow-blue-500/20">
                 <Target size={20} className="text-white md:w-6 md:h-6" />
              </div>
              <div>
                 <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">{name}</h3>
                 <p className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 md:mt-1">Scheme & Personnel Fit</p>
              </div>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
              <X size={20} className="text-slate-500" />
           </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar space-y-8 md:space-y-12">
           {/* Requirements Section */}
           <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                   <Zap size={14} className="text-blue-400" />
                   Team Scheme
                </h4>
                <div className="h-px flex-1 mx-4 bg-slate-800" />
              </div>
              
              <div className="flex flex-col gap-3 w-full">
                 {details?.requirements.map((req, i) => (
                    <div 
                      key={i} 
                      className={`border rounded-3xl overflow-hidden transition-all duration-300 flex flex-col w-full ${
                        expandedSlot === i 
                          ? 'border-blue-500/30 bg-slate-950/50 shadow-lg shadow-blue-500/5' 
                          : 'border-slate-800/50 bg-slate-950/20 hover:border-slate-700'
                      }`}
                    >
                      <button 
                        onClick={() => setExpandedSlot(expandedSlot === i ? null : i)}
                        className={`w-full p-5 flex items-center justify-between text-left transition-all ${expandedSlot === i ? 'pb-3' : ''}`}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                           <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                              expandedSlot === i ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-900 text-slate-500'
                           }`}>
                              <Target size={18} />
                           </div>
                           <div className="min-w-0 transition-opacity duration-300">
                              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Role</div>
                              <div className="text-xs font-black text-white uppercase tracking-tight leading-tight line-clamp-1">{req.slot}</div>
                           </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                           <ChevronRight size={18} className={`text-slate-600 transition-transform ${expandedSlot === i ? 'rotate-90 text-blue-400' : ''}`} />
                        </div>
                      </button>
                      
                      <AnimatePresence>
                        {expandedSlot === i && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="bg-slate-950/80 px-5 pb-5 space-y-4"
                          >
                            <div className="h-px bg-slate-800/50 mb-4" />
                            <div className="space-y-3">
                               <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Suitable Training Paths</p>
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {req.archetypes.map((arch) => (
                                     <button 
                                       key={arch}
                                       onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedArchetype(arch);
                                       }}
                                       className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900 border border-slate-800/50 hover:border-blue-500/50 transition-all text-left group"
                                     >
                                        <div className="p-2 rounded-lg bg-slate-800 group-hover:bg-blue-500/10 transition-colors shrink-0">
                                           <GraduationCap size={14} className="text-slate-500 group-hover:text-blue-400" />
                                        </div>
                                        <span className="text-[10px] sm:text-xs font-bold text-slate-300 group-hover:text-white uppercase tracking-tight line-clamp-1">{arch}</span>
                                     </button>
                                  ))}
                               </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                 ))}
              </div>
           </section>

           {/* Personnel Section */}
           <section className="space-y-6">
              <div className="flex justify-between items-end">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                   <Users size={14} className="text-blue-400" />
                   Personnel Compatibility
                </h4>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{playerTiers.elite.length} Elite</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{playerTiers.strong.length} Good</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-8">
                 {/* Elite Fits */}
                 {playerTiers.elite.length > 0 && (
                   <div className="space-y-2">
                     <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest px-1">System Stars</div>
                     {playerTiers.elite.map(({ player, fitScore }) => (
                        <PlayerFitCard key={player.id} player={player} fitScore={fitScore} tier="elite" />
                     ))}
                   </div>
                 )}

                 {/* Strong Fits */}
                 {playerTiers.strong.length > 0 && (
                   <div className="space-y-2">
                     <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">System Competence</div>
                     {playerTiers.strong.map(({ player, fitScore }) => (
                        <PlayerFitCard key={player.id} player={player} fitScore={fitScore} tier="strong" />
                     ))}
                   </div>
                 )}

                 {/* Developing Fits */}
                 {playerTiers.developing.length > 0 && (
                   <div className="space-y-2">
                     <div className="text-[9px] font-black text-slate-700 uppercase tracking-widest px-1">Development Pending</div>
                     {playerTiers.developing.map(({ player, fitScore }) => (
                        <PlayerFitCard key={player.id} player={player} fitScore={fitScore} tier="developing" />
                     ))}
                   </div>
                 )}
              </div>
           </section>
        </div>

        <div className="p-6 md:p-8 border-t border-slate-800 bg-slate-900/50">
           <button 
             onClick={onClose}
             className="w-full py-4 rounded-xl md:rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 shadow-xl"
           >
              Return to Dashboard
           </button>
        </div>

        <AnimatePresence>
           {selectedArchetype && (
              <TrainingFocusModal 
                 isOpen={true}
                 onClose={() => setSelectedArchetype(null)}
                 currentFocus={null}
                 initialArchetype={selectedArchetype}
                 onSelect={(focus) => {
                    // Do nothing or handle selection if needed
                 }}
                 playerName="System Preview"
                 playerPos="Any"
                 readOnly={true}
                 imgURL={undefined}
              />
           )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function PlayerFitCard({ player, fitScore, tier }: { player: PlayerK2, fitScore: number, tier: 'elite' | 'strong' | 'developing', key?: string | number }) {
  return (
    <div className={`flex items-center justify-between p-4 rounded-2xl transition-all group border ${
      tier === 'elite' 
        ? 'bg-blue-500/5 border-blue-500/10 hover:border-blue-400/30' 
        : 'bg-slate-950/40 border-slate-800/30 hover:border-slate-700'
    }`}>
       <div className="flex items-center gap-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border transition-colors ${
            tier === 'elite' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>
             {player.pos}
          </div>
          <div>
             <div className="text-xs font-black text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">{player.name}</div>
             <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                <span>OVR: {player.bbgmOvr}</span>
                {tier === 'elite' && <Star size={10} className="text-blue-400 fill-blue-400" />}
             </div>
          </div>
       </div>
       
       <div className="flex items-center gap-4 w-32 md:w-48">
         <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
            <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${fitScore}%` }}
               transition={{ duration: 1, ease: "easeOut" }}
               className={`h-full rounded-full transition-all ${
                 tier === 'elite' ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 
                 tier === 'strong' ? 'bg-slate-400' : 'bg-slate-700'
               }`}
            />
         </div>
         <span className={`text-[10px] font-black w-8 text-right tabular-nums ${
           tier === 'elite' ? 'text-blue-400' : 'text-slate-500'
         }`}>
           {Math.round(fitScore)}%
         </span>
       </div>
    </div>
  );
}

function ArchetypeTrainingModal({ name, roster, onClose }: { name: string, roster: PlayerK2[], onClose: () => void }) {
  const profile = ARCHETYPE_PROFILES[name];
  
  if (!profile) return null;

  const candidates = useMemo(() => {
    return roster.map(player => {
      const weights = profile.weights;
      let score = 0;
      let totalWeight = 0;
      
      Object.entries(weights).forEach(([attr, weight]) => {
        if (attr === 'hgt') return;
        const val = (player.stats as any)[attr] || 50;
        score += val * (weight as number);
        totalWeight += (weight as number);
      });

      return {
        player,
        score: score / totalWeight
      };
    }).sort((a,b) => b.score - a.score).slice(0, 4);
  }, [roster, profile]);

  const trainingFocus = Object.entries(profile.weights)
    .filter(([k]) => k !== 'hgt' && (profile.weights as any)[k] > 0.05)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="absolute inset-4 z-[60] bg-slate-900 border border-slate-700 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col overflow-hidden"
    >
      <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
         <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-xl shadow-lg shadow-emerald-500/20">
               <GraduationCap size={20} className="text-white" />
            </div>
            <div>
               <h4 className="text-lg font-black text-white uppercase tracking-tight">{name} Training</h4>
               <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Development Program</p>
            </div>
         </div>
         <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
            <X size={20} className="text-slate-400" />
         </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
         <div className="space-y-2">
            <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Description</h5>
            <p className="text-sm text-slate-300 leading-relaxed font-medium">
               {profile.description}
            </p>
            <div className="pt-2 flex items-center gap-2">
               <span className="text-[10px] text-slate-500 font-black uppercase">Player Comparison:</span>
               <span className="text-[10px] text-blue-400 font-black uppercase tracking-tight">{profile.comparison}</span>
            </div>
         </div>

         <div className="space-y-4">
            <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
               <TrendingUp size={14} className="text-emerald-400" />
               Primary Training Focus
            </h5>
            <div className="space-y-3">
               {trainingFocus.map(([attr, weight]) => (
                  <div key={attr} className="bg-slate-950 p-4 rounded-2xl border border-slate-800/50">
                     <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-white uppercase tracking-tight">{ATTRIBUTE_LABELS[attr] || attr}</span>
                        <span className="text-[10px] font-black text-emerald-400 uppercase">High Priority</span>
                     </div>
                     <div className="flex flex-wrap gap-1 mb-2">
                       {getK2SubAttributes(attr, name).map((subAttr, i) => (
                         <span key={i} className="text-[9px] font-bold text-slate-300 bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700/50">
                           {subAttr}
                         </span>
                       ))}
                     </div>
                     <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <motion.div 
                           initial={{ width: 0 }}
                           animate={{ width: `${(weight as number) * 400}%` }} // Simplified visualization
                           className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                        />
                     </div>
                  </div>
               ))}
            </div>
         </div>

         <div className="space-y-4">
            <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
               <Users size={14} className="text-blue-400" />
               High-Potential Candidates
            </h5>
            <div className="grid grid-cols-2 gap-2">
               {candidates.map(({ player, score }) => (
                  <div key={player.id} className="p-3 bg-slate-950 border border-slate-800/50 rounded-xl flex flex-col gap-1">
                     <span className="text-[10px] font-black text-white truncate uppercase tracking-tight">{player.name}</span>
                     <div className="flex justify-between items-center">
                        <span className="text-[9px] text-slate-500 font-bold">OVR {player.bbgmOvr}</span>
                        <span className="text-[9px] text-blue-400 font-black">{Math.round(score)}% FIT</span>
                     </div>
                  </div>
               ))}
            </div>
         </div>

         <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex items-start gap-3">
            <Info size={16} className="text-emerald-400 mt-0.5" />
            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
               Assigning players to the <span className="text-emerald-400 font-bold">{name}</span> program in the Training Center will accelerate their growth in key attributes (Weight: {Math.round((trainingFocus[0]?.[1] as number || 0) * 100)}% {ATTRIBUTE_LABELS[trainingFocus[0]?.[0] as string] || trainingFocus[0]?.[0]}) required for this tactical role.
            </p>
         </div>
      </div>

      <div className="p-6 border-t border-slate-800 bg-slate-950/50">
         <button 
           onClick={onClose}
           className="w-full py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-black uppercase tracking-[0.2em] transition-all"
         >
            Back to Scheme
         </button>
      </div>
    </motion.div>
  );
}

