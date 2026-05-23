import React, { useMemo, useState } from 'react';
import { Player, PlayerK2 } from '../types';
import { mapPlayerToK2 } from '../lib/playerMapping';
import { computeTeamProficiency } from '../../utils/coachSliders';
import { computeDefensiveSystemFit, blendDefensiveProficiency } from '../../utils/defensiveSystemFit';
import { systemDescriptions, defensiveSystemDescriptions } from '../lib/coachSliders';
import { getSystemProficiency } from '../lib/coachSliders';
import { Star, Zap, Info, TrendingUp, Activity, X, Target, Users, BookOpen, ChevronRight, GraduationCap, Swords, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ARCHETYPE_PROFILES } from '../constants/archetypes';
import { TrainingFocusModal } from './TrainingFocusModal';
import { ATTRIBUTE_LABELS, getK2SubAttributes } from '../constants/trainingSystems';

interface Props {
  roster: Player[];
  /** Optional team-level familiarity to boost system scores — passed from TrainingCenterView. */
  systemFamiliarity?: {
    offense?: number;
    defense?: number;
    byOffense?: Record<string, number>;
    byDefense?: Record<string, number>;
  };
  /** League-wide K2 rosters for slider normalization — must match what CoachingPage passes. */
  allRosters?: PlayerK2[][];
}

export function SystemProficiencyView({ roster, systemFamiliarity, allRosters }: Props) {
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [side, setSide] = useState<'offense' | 'defense'>('offense');

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

  // Defense side: blend roster fit (60%) + per-system Familiarity (40%).
  // Roster fit comes from defensiveSystemFit — attribute baskets per scheme
  // (Switch = versatility, Drop = big interior defense, Press = guard speed
  // + endurance, etc.). Familiarity comes from training reps. A team with
  // great roster but no reps still scores OK; reps alone can't overcome
  // mismatched personnel.
  const defenseTiers = useMemo(() => {
    const fitMap = computeDefensiveSystemFit(k2Roster);
    const famMap = systemFamiliarity?.byDefense ?? {};
    const all = Object.keys(defensiveSystemDescriptions).map(name => {
      const score = blendDefensiveProficiency(fitMap[name] ?? 50, famMap[name] ?? 0);
      return [name, score] as [string, number];
    }).sort((a, b) => b[1] - a[1]);
    return {
      mastery: all.filter(([, s]) => s >= 75),
      competence: all.filter(([, s]) => s >= 50 && s < 75),
      learning: all.filter(([, s]) => s < 50),
    };
  }, [systemFamiliarity, k2Roster]);

  const defenseOverview = useMemo(() => {
    if (side !== 'defense') return null;
    const fitMap = computeDefensiveSystemFit(k2Roster);
    const famMap = systemFamiliarity?.byDefense ?? {};
    const systems = Object.keys(defensiveSystemDescriptions).map(name => {
      const fit = Math.round(fitMap[name] ?? 50);
      const familiarity = Math.round(famMap[name] ?? 0);
      const score = Math.round(blendDefensiveProficiency(fit, familiarity));
      return {
        name,
        fit,
        familiarity,
        score,
        details: defensiveSystemDescriptions[name],
      };
    }).sort((a, b) => b.score - a.score);
    return {
      top: systems[0] ?? null,
      compare: systems.slice(1, 5),
      rest: systems,
    };
  }, [side, k2Roster, systemFamiliarity]);

  const activeTiers = side === 'offense' ? tiers : defenseTiers;
  const activeMap = side === 'offense' ? systemDescriptions : defensiveSystemDescriptions;

  if (roster.length === 0) return null;

  // Tier color: defense uses cyan to match the DailyPlanModal toggle accent.
  const accent = side === 'offense' ? 'blue' : 'cyan';
  const learningLabel = side === 'offense' ? 'Incompatible Schemes' : 'Personnel Mismatch';

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Offense / Defense toggle */}
      <div className="flex gap-1 bg-slate-900/60 border border-slate-800 rounded-lg p-1 max-w-xs">
        <button
          onClick={() => { setSide('offense'); setSelectedSystem(null); }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-colors ${
            side === 'offense'
              ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          <Swords size={12} />
          Offense
        </button>
        <button
          onClick={() => { setSide('defense'); setSelectedSystem(null); }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-colors ${
            side === 'defense'
              ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          <Shield size={12} />
          Defense
        </button>
      </div>

      {side === 'defense' && activeTiers.mastery.length === 0 && activeTiers.competence.length === 0 && activeTiers.learning.length === 0 && (
        <div className="border border-slate-800 bg-slate-950/40 rounded-2xl p-6 text-center">
          <Shield size={20} className="mx-auto text-slate-600 mb-2" />
          <p className="text-sm font-bold text-slate-400">No personnel data</p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
            Roster is empty. Defensive scheme fit is computed from active rotation attributes.
          </p>
        </div>
      )}

      {side === 'defense' && defenseOverview?.top && (
        <section className="space-y-5">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2 text-cyan-400">
              <Shield size={16} />
              Defensive Identity
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-cyan-400/20 to-transparent" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
            <div className="rounded-[2rem] border border-cyan-500/20 bg-slate-950/70 p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-400">Best Current Fit</div>
                  <h4 className="text-2xl font-black text-white uppercase tracking-tight mt-2">{defenseOverview.top.name}</h4>
                  <p className="text-sm text-slate-400 mt-2 max-w-2xl">{defenseOverview.top.details.desc}</p>
                </div>
                <div className={`px-3 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-[0.2em] ${getDefenseTierTone(defenseOverview.top.familiarity).pill}`}>
                  {getDefenseTierTone(defenseOverview.top.familiarity).label}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Roster Fit</div>
                  <div className="text-2xl font-black text-white mt-2 tabular-nums">{defenseOverview.top.fit}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Personnel-only baseline before reps.</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Familiarity</div>
                  <div className="text-2xl font-black text-white mt-2 tabular-nums">{defenseOverview.top.familiarity}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Built in system practice reps.</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Composite</div>
                  <div className="text-2xl font-black text-cyan-300 mt-2 tabular-nums">{defenseOverview.top.score}</div>
                  <p className="text-[11px] text-slate-500 mt-1">What the team can actually live in today.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-2">Why It Fits</div>
                  <div className="space-y-1.5">
                    {defenseOverview.top.details.pos.slice(0, 3).map(item => (
                      <div key={item} className="text-[11px] text-slate-300">• {item}</div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-rose-500/15 bg-rose-500/5 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-400 mb-2">What You Give Up</div>
                  <div className="space-y-1.5">
                    {defenseOverview.top.details.neg.slice(0, 3).map(item => (
                      <div key={item} className="text-[11px] text-slate-300">• {item}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-800 bg-slate-950/60 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Scheme Compare</div>
                <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">Train cold looks here</div>
              </div>
              <div className="space-y-3">
                {defenseOverview.compare.map(system => {
                  const tone = getDefenseTierTone(system.familiarity);
                  const delta = system.score - defenseOverview.top.score;
                  return (
                    <div
                      key={system.name}
                      className="w-full text-left rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-white uppercase tracking-tight">{system.name}</div>
                          <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{system.details.desc}</div>
                        </div>
                        <div className={`px-2 py-1 rounded-full border text-[9px] font-black uppercase tracking-[0.2em] ${tone.pill}`}>{tone.label}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">Fit</div>
                          <div className="text-xs font-bold text-slate-300 mt-1 tabular-nums">{system.fit}</div>
                        </div>
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">Fam</div>
                          <div className="text-xs font-bold text-slate-300 mt-1 tabular-nums">{system.familiarity}</div>
                        </div>
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">Delta</div>
                          <div className={`text-xs font-bold mt-1 tabular-nums ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {delta >= 0 ? `+${delta}` : delta}
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-3">
                        {system.details.pos[0]} • Risk: {system.details.neg[0]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Tier 1: Mastery */}
      {activeTiers.mastery.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <h3 className={`text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2 ${accent === 'blue' ? 'text-blue-400' : 'text-cyan-400'}`}>
              <Zap size={16} />
              Scheme Mastery
            </h3>
            <div className={`h-px flex-1 bg-gradient-to-r ${accent === 'blue' ? 'from-blue-400/20' : 'from-cyan-400/20'} to-transparent`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTiers.mastery.map(([name, score]) => (
              <SystemCard
                key={name}
                name={name}
                score={score}
                tier="mastery"
                accent={accent}
                systemMap={activeMap}
                onClick={() => setSelectedSystem(name)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Tier 2: Competence */}
      {activeTiers.competence.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <TrendingUp size={16} />
              System Competence
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-slate-400/10 to-transparent" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {activeTiers.competence.map(([name, score]) => (
              <SystemCard
                key={name}
                name={name}
                score={score}
                tier="competence"
                accent={accent}
                systemMap={activeMap}
                onClick={() => setSelectedSystem(name)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Tier 3: Learning / Untrained */}
      {activeTiers.learning.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-[0.2em] flex items-center gap-2">
              <Activity size={16} />
              {learningLabel}
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-slate-800/20 to-transparent" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 opacity-70">
            {activeTiers.learning.map(([name, score]) => (
              <SystemCard
                key={name}
                name={name}
                score={score}
                tier="learning"
                accent={accent}
                systemMap={activeMap}
                onClick={() => setSelectedSystem(name)}
              />
            ))}
          </div>
        </section>
      )}

      <AnimatePresence>
        {selectedSystem && side === 'offense' && (
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
  accent?: 'blue' | 'cyan';
  /** Pass either the offensive or defensive map so the card can pull desc from the right side. */
  systemMap?: Record<string, { desc: string }>;
  onClick: () => void;
  key?: string | number;
}

function SystemCard({ name, score, tier, accent = 'blue', systemMap, onClick }: SystemCardProps) {
  const details = (systemMap ?? systemDescriptions)[name];
  const stars = Math.round(Math.max(0, (score - 50) / 10) * 2) / 2;

  const masteryStarCls = accent === 'cyan' ? 'text-cyan-400 fill-cyan-400' : 'text-blue-400 fill-blue-400';
  const masteryBorder = accent === 'cyan' ? 'border-cyan-500/30 hover:border-cyan-400 hover:shadow-[0_0_30px_rgba(34,211,238,0.1)]' : 'border-blue-500/30 hover:border-blue-400 hover:shadow-[0_0_30px_rgba(59,130,246,0.1)]';
  const masteryBar = accent === 'cyan' ? 'bg-cyan-500' : 'bg-blue-500';

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
                    <Star size={12} className={`${tier === 'mastery' ? masteryStarCls : 'text-slate-400 fill-slate-400'}`} />
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
      ? `bg-slate-900 ${masteryBorder} cursor-pointer`
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
            className={`h-full transition-all duration-1000 ${tier === 'mastery' ? masteryBar : 'bg-slate-700'}`}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="ml-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{score}</span>
      </div>
    </button>
  );
}

function getDefenseTierTone(value: number) {
  if (value >= 75) {
    return { label: 'Elite', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
  }
  if (value >= 50) {
    return { label: 'Sharp', pill: 'bg-amber-500/15 text-amber-200 border-amber-500/30' };
  }
  if (value >= 25) {
    return { label: 'Learning', pill: 'bg-orange-500/15 text-orange-200 border-orange-500/30' };
  }
  return { label: 'Cold', pill: 'bg-rose-500/15 text-rose-200 border-rose-500/30' };
}

function getDefenseTierTone(value: number) {
  if (value >= 75) {
    return { label: 'Elite', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
  }
  if (value >= 50) {
    return { label: 'Sharp', pill: 'bg-amber-500/15 text-amber-200 border-amber-500/30' };
  }
  if (value >= 25) {
    return { label: 'Learning', pill: 'bg-orange-500/15 text-orange-200 border-orange-500/30' };
  }
  return { label: 'Cold', pill: 'bg-rose-500/15 text-rose-200 border-rose-500/30' };
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
