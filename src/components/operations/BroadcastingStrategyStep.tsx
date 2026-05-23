import React from 'react';
import { Calendar, CheckCircle2, MonitorPlay, AlertTriangle, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import {
  BROADCASTERS,
  BroadcastingMetrics,
  BroadcastingViewStep,
  FictionalBadge,
  PHASE_DATA,
  SCHEDULE_DAYS,
} from './BroadcastingShared';

type BroadcastingStrategyStepProps = {
  view: Extract<BroadcastingViewStep, 'phases' | 'weekly' | 'leaguepass'>;
  activeBroadcasters: string[];
  currentBroadcaster: string | null;
  setCurrentBroadcaster: React.Dispatch<React.SetStateAction<string | null>>;
  phaseAssignments: Record<string, string[]>;
  scheduleAssignments: Record<string, string[]>;
  togglePhaseAssignment: (phaseId: string, broadcasterId: string) => void;
  toggleScheduleAssignment: (day: string, broadcasterId: string) => void;
  lpPrice: number;
  setLpPrice: React.Dispatch<React.SetStateAction<number>>;
  metrics: BroadcastingMetrics;
  phaseName: (phase: { id: string; name: string }) => string;
  bcName: (id: string) => string;
  readOnly: boolean;
  isFictional: boolean;
};

export const BroadcastingStrategyStep: React.FC<BroadcastingStrategyStepProps> = ({
  view,
  activeBroadcasters,
  currentBroadcaster,
  setCurrentBroadcaster,
  phaseAssignments,
  scheduleAssignments,
  togglePhaseAssignment,
  toggleScheduleAssignment,
  lpPrice,
  setLpPrice,
  metrics,
  phaseName,
  bcName,
  readOnly,
  isFictional,
}) => (
  <motion.div
    key="strategy"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    className="grid grid-cols-1 lg:grid-cols-3 gap-8"
  >
    <div className="lg:col-span-2 space-y-8">
      <div>
        <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic">
          {view === 'phases' ? 'Phase Strategy' : view === 'weekly' ? 'Weekly Schedule' : 'League Pass Strategy'}
        </h2>
        <p className="text-zinc-500 text-sm mt-1">
          {view === 'phases' ? 'Assign broadcasters to maximize viewership per phase.' : view === 'weekly' ? 'Assign broadcasters to specific days.' : 'Set monthly pricing for the direct-to-consumer platform.'}
        </p>
      </div>

      {view === 'phases' && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {activeBroadcasters.map(id => {
            const broadcaster = BROADCASTERS.find(entry => entry.id === id);
            if (!broadcaster) return null;
            return (
              <button
                key={id}
                onClick={() => setCurrentBroadcaster(id)}
                className={`px-4 py-3 rounded-2xl border shrink-0 transition-all flex items-center gap-3 ${currentBroadcaster === id ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' : 'bg-zinc-900/50 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
              >
                {isFictional ? (
                  <FictionalBadge id={broadcaster.id} size="md" />
                ) : (
                  <div className="w-8 h-8 bg-white rounded-lg p-1 flex items-center justify-center overflow-hidden shrink-0">
                    <img src={broadcaster.logo} alt={broadcaster.name} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                  </div>
                )}
                <span className="text-sm font-black uppercase italic">{bcName(broadcaster.id)}</span>
              </button>
            );
          })}
        </div>
      )}

      {view === 'phases' && currentBroadcaster && (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
              <Zap size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white uppercase italic">
                Assigning {bcName(currentBroadcaster) || BROADCASTERS.find(b => b.id === currentBroadcaster)?.name} to Phases
              </h3>
              <p className="text-xs text-zinc-500">Select which phases this broadcaster covers.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PHASE_DATA.map(phase => {
              const isAssigned = phaseAssignments[phase.id]?.includes(currentBroadcaster);
              const phaseIds = phaseAssignments[phase.id] || [];
              const phaseReach = phaseIds.length > 0
                ? phaseIds.reduce((sum, id) => {
                  const broadcaster = BROADCASTERS.find(entry => entry.id === id);
                  return sum + (broadcaster?.reach ?? 0);
                }, 0) / phaseIds.length
                : 0;

              return (
                <button
                  key={phase.id}
                  onClick={() => togglePhaseAssignment(phase.id, currentBroadcaster)}
                  disabled={readOnly}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${isAssigned ? phase.id === 'regularseason' ? 'bg-emerald-500/20 border-emerald-500/50 text-white' : 'bg-indigo-500/10 border-indigo-500/50 text-white' : 'bg-zinc-950/50 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                >
                  <div className="text-left">
                    <div className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                      {phaseName(phase)}
                      {phase.id === 'regularseason' && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded uppercase">Unlocks Weekly</span>}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest opacity-60">{phase.days} Days</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase opacity-60">Est. Viewers</div>
                    <div className="text-lg font-black text-emerald-400">{(phase.baseViewers * phaseReach).toFixed(1)}M</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === 'weekly' && (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
              <Calendar size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white uppercase italic">Weekly Schedule</h3>
              <p className="text-xs text-zinc-500">Only broadcasters in the <strong className="text-emerald-400">Regular Season</strong> phase are available.</p>
            </div>
          </div>
          <div className="space-y-4">
            {SCHEDULE_DAYS.map(scheduleDay => {
              const regIds = phaseAssignments.regularseason || [];
              const assignedIds = scheduleAssignments[scheduleDay.day] || [];
              const dayReach = assignedIds.reduce((sum, id) => {
                const broadcaster = BROADCASTERS.find(entry => entry.id === id);
                return sum + (broadcaster?.reach ?? 0);
              }, 0) / Math.max(1, assignedIds.length);

              return (
                <div key={scheduleDay.day} className="p-4 rounded-2xl border bg-zinc-950/50 border-zinc-800">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-white uppercase tracking-wider">{scheduleDay.day}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                        {((scheduleDay.pri + scheduleDay.sec) * dayReach * 0.1).toFixed(1)}M viewers
                      </span>
                      <span className="text-[10px] text-zinc-500 uppercase">{scheduleDay.tipoff}</span>
                    </div>
                  </div>
                  {regIds.length === 0 ? (
                    <p className="text-xs text-zinc-600 italic">Assign Regular Season broadcasters first.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {regIds.map(id => {
                        const broadcaster = BROADCASTERS.find(entry => entry.id === id);
                        if (!broadcaster) return null;
                        const assigned = assignedIds.includes(id);
                        return (
                          <button
                            key={id}
                            onClick={() => toggleScheduleAssignment(scheduleDay.day, id)}
                            disabled={readOnly}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${assigned ? 'bg-indigo-500/20 border-indigo-500/50 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                          >
                            {isFictional ? (
                              <FictionalBadge id={broadcaster.id} size="sm" />
                            ) : (
                              <div className="w-4 h-4 bg-white rounded-sm p-0.5 flex items-center justify-center overflow-hidden shrink-0">
                                <img src={broadcaster.logo} alt={broadcaster.name} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                              </div>
                            )}
                            <span className="text-xs font-bold uppercase">{bcName(broadcaster.id)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'leaguepass' && (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
              <MonitorPlay size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white uppercase italic">League Pass (D2C)</h3>
              <p className="text-xs text-zinc-500">Monthly pricing for the direct-to-consumer platform.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">
                Monthly Price: ${lpPrice.toFixed(2)}
              </label>
              <input
                type="range"
                min="4.99"
                max="39.99"
                step="1"
                value={lpPrice}
                onChange={event => !readOnly && setLpPrice(parseFloat(event.target.value))}
                disabled={readOnly}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 mt-2 font-mono">
                <span>$4.99</span>
                <span>$39.99</span>
              </div>
            </div>
            <div className="bg-zinc-950 rounded-2xl p-6 border border-zinc-800 flex flex-col justify-center">
              <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">Est. Subscribers</div>
              <div className="text-3xl font-black text-white mb-4">{metrics.subs.toFixed(1)}M</div>
              <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">Expected Annual Rev</div>
              <div className="text-xl font-bold text-emerald-400">${(metrics.lpRev * 1000).toFixed(0)}M</div>
            </div>
          </div>
        </div>
      )}
    </div>

    <div className="space-y-6">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-4">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Active Risks</h3>
        <div className="space-y-2">
          {metrics.streamingCount > 2 && (
            <div className="flex items-center gap-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
              <AlertTriangle size={16} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Paywall Fatigue High</span>
            </div>
          )}
          {metrics.integrityPenalty > 0 && (
            <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <AlertTriangle size={16} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Integrity Concerns</span>
            </div>
          )}
          {metrics.hasStreameast && (
            <div className="flex items-center gap-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Zap size={16} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Piracy Reach Boost</span>
            </div>
          )}
          {!metrics.streamingCount && !metrics.integrityPenalty && !metrics.hasStreameast && (
            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <CheckCircle2 size={16} />
              <span className="text-[10px] font-bold uppercase tracking-wider">No Major Risks</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-3">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Live Projection</h3>
        {[
          { label: 'Media Rev', val: `$${metrics.mediaRev.toFixed(2)}B` },
          { label: 'League Pass', val: `$${metrics.lpRev.toFixed(2)}B` },
          { label: 'Total Expected Rev', val: `$${metrics.totalRev.toFixed(2)}B` },
          { label: 'Salary Cap', val: `$${metrics.salaryCap.toFixed(1)}M` },
          { label: 'Subscribers', val: `${metrics.subs.toFixed(1)}M` },
        ].map(({ label, val }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider">{label}</span>
            <span className="text-sm font-black text-white">{val}</span>
          </div>
        ))}
      </div>
    </div>
  </motion.div>
);
