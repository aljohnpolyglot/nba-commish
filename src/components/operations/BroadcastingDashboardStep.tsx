import React from 'react';
import { CheckCircle2, DollarSign, ThumbsUp, Users, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import {
  BROADCASTERS,
  BroadcastingMetrics,
  PHASE_DATA,
  SCHEDULE_DAYS,
  StatCard,
  TOTAL_REV_TARGET,
} from './BroadcastingShared';

type BroadcastingDashboardStepProps = {
  metrics: BroadcastingMetrics;
  dispTotalRev: number;
  dispSalaryCap: number;
  phaseAssignments: Record<string, string[]>;
  scheduleAssignments: Record<string, string[]>;
  phaseName: (phase: { id: string; name: string }) => string;
  handleNext: () => void;
  readOnly: boolean;
};

export const BroadcastingDashboardStep: React.FC<BroadcastingDashboardStepProps> = ({
  metrics,
  dispTotalRev,
  dispSalaryCap,
  phaseAssignments,
  scheduleAssignments,
  phaseName,
  handleNext,
  readOnly,
}) => (
  <motion.div
    key="dashboard"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    className="space-y-8"
  >
    <div>
      <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic">Financial Dashboard</h2>
      <p className="text-zinc-500 text-sm mt-1">Real-time projection of your media rights deal.</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard icon={DollarSign} label="Total Expected Rev" value={`$${metrics.totalRev.toFixed(2)}B`} subValue={`Target: $${TOTAL_REV_TARGET}B`} color="emerald" trend={((metrics.totalRev / TOTAL_REV_TARGET) - 1) * 100} />
      <StatCard icon={Users} label="Est. Viewership" value={`${metrics.viewership.toFixed(1)}M`} subValue="Avg. per marquee game" color="blue" trend={null} />
      <StatCard icon={ThumbsUp} label="Fan Approval" value={metrics.approvalGrade} subValue={metrics.approval > 0.8 ? 'Beloved deal' : 'Fan backlash risk'} color="amber" trend={null} />
      <StatCard icon={Zap} label="Market Reach" value={`${Math.round(metrics.avgReach * 100)}%`} subValue="Global penetration" color="indigo" trend={null} />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8">
        <h3 className="text-xl font-black text-white uppercase italic mb-6">Expected Revenue Mix</h3>
        <div className="space-y-6">
          {[
            { label: 'Base Revenue (Sponsorship/Merch/Tickets)', val: 6.9, color: 'bg-zinc-500' },
            { label: 'National TV Rights', val: metrics.mediaRev, color: 'bg-emerald-500' },
            { label: 'League Pass D2C', val: metrics.lpRev, color: 'bg-indigo-500' },
          ].map(({ label, val, color }) => (
            <div key={label} className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span className="text-zinc-400">{label}</span>
                <span className="text-white">${val.toFixed(2)}B</span>
              </div>
              <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${(val / metrics.totalRev) * 100}%` }} className={`h-full ${color}`} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid grid-cols-2 gap-8">
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Salary Cap Projection</div>
            <div className="text-3xl font-black text-white">${dispSalaryCap.toFixed(1)}M</div>
            <div className="text-[10px] text-emerald-400 font-bold uppercase">Dynamic (Rev-based)</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Player Share (51%)</div>
            <div className="text-3xl font-black text-white">${(dispTotalRev * 0.51).toFixed(2)}B</div>
            <div className="text-[10px] text-zinc-500 font-bold uppercase">CBA Compliant</div>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 flex flex-col gap-8">
        <div>
          <h3 className="text-xl font-black text-white uppercase italic mb-4">Phase Impact</h3>
          <div className="space-y-3 max-h-52 overflow-y-auto pr-2">
            {PHASE_DATA.map(phase => {
              const ids = phaseAssignments[phase.id] || [];
              const reach = ids.length > 0
                ? ids.reduce((sum, id) => {
                  const broadcaster = BROADCASTERS.find(entry => entry.id === id);
                  return sum + (broadcaster?.reach ?? 0);
                }, 0) / ids.length
                : 0;

              return (
                <div key={phase.id} className="flex items-center gap-3">
                  <div className="w-28 text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate">{phaseName(phase)}</div>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${reach * 100}%` }} className={`h-full ${reach > 0.8 ? 'bg-emerald-500' : reach > 0.5 ? 'bg-indigo-500' : 'bg-zinc-700'}`} />
                  </div>
                  <div className="w-10 text-right text-[10px] font-black text-white">{Math.round(reach * 100)}%</div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <h3 className="text-xl font-black text-white uppercase italic mb-4">Schedule Impact</h3>
          <div className="space-y-3">
            {SCHEDULE_DAYS.map(scheduleDay => {
              const ids = scheduleAssignments[scheduleDay.day] || [];
              const reach = ids.length > 0
                ? ids.reduce((sum, id) => {
                  const broadcaster = BROADCASTERS.find(entry => entry.id === id);
                  return sum + (broadcaster?.reach ?? 0);
                }, 0) / ids.length
                : 0;

              return (
                <div key={scheduleDay.day} className="flex items-center gap-3">
                  <div className="w-28 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{scheduleDay.day}</div>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${reach * 100}%` }} className={`h-full ${reach > 0.8 ? 'bg-emerald-500' : reach > 0.5 ? 'bg-indigo-500' : 'bg-zinc-700'}`} />
                  </div>
                  <div className="w-10 text-right text-[10px] font-black text-white">{Math.round(reach * 100)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>

    {!readOnly && (
      <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-2xl p-6 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-white mb-1">Ready to Finalize?</h3>
          <p className="text-sm text-zinc-400">
            Locks the deal for the season. Salary cap updates to <span className="text-white font-bold">${metrics.salaryCap.toFixed(1)}M</span>.
          </p>
        </div>
        <button onClick={handleNext} className="shrink-0 flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all">
          <CheckCircle2 size={14} />
          Finalize Deal
        </button>
      </div>
    )}
  </motion.div>
);
