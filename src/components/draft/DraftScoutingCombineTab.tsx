import React from 'react';
import { Activity, Info, Ruler, Target } from 'lucide-react';
import type { CombineStats } from '../../services/draftCombineCalculator';
import { useGame } from '../../store/GameContext';
import { isPbaIsolatedMode } from '../../utils/uiMode';

type Props = {
  playerName: string;
  combine: CombineStats;
};

const pct = (fgm: number, fga: number) => `${((fgm / Math.max(1, fga)) * 100).toFixed(1)}%`;

const shootingRows = [
  { key: 'offDribble', label: 'Off Dribble' },
  { key: 'spotUp', label: 'Spot Up' },
  { key: 'star3pt', label: 'Star 3PT' },
  { key: 'starMid', label: 'Star Mid' },
  { key: 'side3pt', label: 'Side 3PT' },
  { key: 'sideMid', label: 'Side Mid' },
  { key: 'freeThrow', label: 'Free Throw' },
] as const;

const Panel: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <section className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
      <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-300 flex items-center justify-center">
        {icon}
      </div>
      <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-white">{title}</h3>
    </div>
    <div className="p-4">
      {children}
    </div>
  </section>
);

const StatRows: React.FC<{
  rows: Array<{ label: string; value: string }>;
}> = ({ rows }) => (
  <div className="rounded-xl border border-slate-800 overflow-hidden">
    {rows.map((row, idx) => (
      <div
        key={row.label}
        className={`grid grid-cols-[1fr_auto] gap-3 px-4 py-3 ${idx !== rows.length - 1 ? 'border-b border-slate-800' : ''}`}
      >
        <div className="text-sm text-slate-300">{row.label}</div>
        <div className="text-sm font-bold text-white tabular-nums">{row.value}</div>
      </div>
    ))}
  </div>
);

export const DraftScoutingCombineTab: React.FC<Props> = ({ playerName, combine }) => {
  const { state } = useGame();
  const draftLabel = isPbaIsolatedMode(state) ? 'PBA Draft' : 'NBA Draft';
  const anthroRows = [
    { label: 'Height (No Shoes)', value: combine.anthro.heightNoShoes },
    { label: 'Height (With Shoes)', value: combine.anthro.heightWithShoes },
    { label: 'Wingspan', value: combine.anthro.wingspan },
    { label: 'Standing Reach', value: combine.anthro.standingReach },
    { label: 'Weight', value: `${combine.anthro.weight} lbs` },
    { label: 'Body Fat', value: `${combine.anthro.bodyFat}%` },
    { label: 'Hand Length', value: `${combine.anthro.handLength}"` },
    { label: 'Hand Width', value: `${combine.anthro.handWidth}"` },
  ];

  const athleticRows = [
    { label: 'Standing Vertical', value: `${combine.athletic.standingVertical} in` },
    { label: 'Max Vertical', value: `${combine.athletic.maxVertical} in` },
    { label: 'Lane Agility', value: `${combine.athletic.laneAgility} sec` },
    { label: 'Shuttle Run', value: `${combine.athletic.shuttleRun} sec` },
    { label: '3/4 Court Sprint', value: `${combine.athletic.threeQuarterSprint} sec` },
    { label: 'Bench Press', value: `${combine.athletic.benchPress} reps` },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-800/30 px-4 py-4">
        <p className="text-sm text-slate-200 leading-relaxed">
          View {playerName}&apos;s {draftLabel} Combine results.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Anthropometrics" icon={<Ruler size={16} />}>
          <StatRows rows={anthroRows} />
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
            <Info size={13} className="text-indigo-300" />
            Measured size profile from combine testing.
          </div>
        </Panel>

        <Panel title="Athleticism" icon={<Activity size={16} />}>
          <StatRows rows={athleticRows} />
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
            <Info size={13} className="text-indigo-300" />
            Timed drills are listed in seconds. Lower is better.
          </div>
        </Panel>

        <Panel title="Shooting Drills" icon={<Target size={16} />}>
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="grid grid-cols-[1.4fr_56px_56px_72px] gap-3 px-4 py-3 border-b border-slate-800 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              <div>Drill</div>
              <div>FGM</div>
              <div>FGA</div>
              <div>FG%</div>
            </div>
            {shootingRows.map(({ key, label }) => {
              const row = combine.shootingDrills[key];
              const percentage = (row.fgm / Math.max(1, row.fga)) * 100;
              return (
                <div key={key} className="grid grid-cols-[1.4fr_56px_56px_72px] gap-3 px-4 py-3 border-b last:border-b-0 border-slate-800 items-center">
                  <div className="text-sm text-slate-200">{label}</div>
                  <div className="text-sm font-bold text-white tabular-nums">{row.fgm}</div>
                  <div className="text-sm font-bold text-white tabular-nums">{row.fga}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white tabular-nums">{pct(row.fgm, row.fga)}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
            <Info size={13} className="text-indigo-300" />
            Shooting percentages are based on made shots over attempts.
          </div>
        </Panel>
      </div>
    </div>
  );
};
