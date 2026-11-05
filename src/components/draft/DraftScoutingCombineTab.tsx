import React from 'react';
import { Activity, Info, Ruler, Target } from 'lucide-react';
import type { CombineStats } from '../../services/draftCombineCalculator';
import { useGame } from '../../store/GameContext';
import { isPbaIsolatedMode } from '../../utils/uiMode';

type Props = {
  playerName: string;
  combine: CombineStats | null;
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
    <div className="p-3">
      {children}
    </div>
  </section>
);

const StatGrid: React.FC<{
  rows: Array<{ label: string; value: string }>;
}> = ({ rows }) => (
  <div className="grid grid-cols-2 gap-2">
    {rows.map(row => (
      <div
        key={row.label}
        className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2.5"
      >
        <div className="truncate text-[9px] font-black uppercase tracking-wider text-slate-500">{row.label}</div>
        <div className="mt-1 text-sm font-black text-white tabular-nums">{row.value}</div>
      </div>
    ))}
  </div>
);

export const DraftScoutingCombineTab: React.FC<Props> = ({ playerName, combine }) => {
  const { state } = useGame();
  const draftLabel = isPbaIsolatedMode(state) ? 'PBA Draft' : 'NBA Draft';
  if (!combine) {
    return (
      <p className="py-16 text-center text-sm font-semibold text-slate-300">
        This player did not attend the combine.
      </p>
    );
  }
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
      <div className="rounded-2xl border border-indigo-400/20 bg-gradient-to-r from-indigo-500/10 to-sky-500/5 p-4">
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-300">{draftLabel} Combine Snapshot</div>
        <h3 className="mt-1 text-lg font-black text-white">{playerName}</h3>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ['Wingspan', combine.anthro.wingspan],
            ['Max Vert', `${combine.athletic.maxVertical} in`],
            ['3/4 Sprint', `${combine.athletic.threeQuarterSprint} sec`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/5 bg-slate-950/45 px-2 py-2 text-center">
              <div className="text-[8px] font-black uppercase tracking-wider text-slate-500">{label}</div>
              <div className="mt-0.5 text-sm font-black tabular-nums text-white">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Anthropometrics" icon={<Ruler size={16} />}>
          <StatGrid rows={anthroRows} />
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
            <Info size={13} className="text-indigo-300" />
            Measured size profile from combine testing.
          </div>
        </Panel>

        <Panel title="Athleticism" icon={<Activity size={16} />}>
          <StatGrid rows={athleticRows} />
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
            <Info size={13} className="text-indigo-300" />
            Timed drills are listed in seconds. Lower is better.
          </div>
        </Panel>

        <div className="md:col-span-2">
        <Panel title="Shooting Drills" icon={<Target size={16} />}>
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_42px_42px_minmax(92px,0.8fr)] gap-2 px-3 py-2.5 border-b border-slate-800 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
              <div>Drill</div>
              <div>FGM</div>
              <div>FGA</div>
              <div>FG%</div>
            </div>
            {shootingRows.map(({ key, label }) => {
              const row = combine.shootingDrills[key];
              const percentage = (row.fgm / Math.max(1, row.fga)) * 100;
              return (
                <div key={key} className="grid grid-cols-[minmax(0,1fr)_42px_42px_minmax(92px,0.8fr)] gap-2 px-3 py-2.5 border-b last:border-b-0 border-slate-800 items-center">
                  <div className="truncate text-xs font-bold text-slate-200">{label}</div>
                  <div className="text-xs font-bold text-white tabular-nums">{row.fgm}</div>
                  <div className="text-xs font-bold text-white tabular-nums">{row.fga}</div>
                  <div className="flex items-center gap-2">
                    <span className="w-11 text-right text-xs font-bold text-white tabular-nums">{pct(row.fgm, row.fga)}</span>
                    <div className="h-1.5 min-w-8 flex-1 rounded-full bg-slate-800 overflow-hidden">
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
    </div>
  );
};
