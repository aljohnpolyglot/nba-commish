import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Activity, Dumbbell, FlaskConical, Info, MonitorPlay, Star, Users, X, Zap } from 'lucide-react';
import type { TrainingFacilityAreaKey } from '../../../../../types/tycoon';
import {
  getTrainingUpgradeCost,
  TRAINING_AREA_SPECS,
} from '../../../../../services/tycoon/facilityUpgradeEngine';
type FacilityTier = 'Elite' | 'Advanced' | 'Standard' | 'Basic';

interface TrainingOverviewPanelProps {
  facilityName: string;
  arenaName: string;
  teamLogoUrl?: string;
  areaLevels: Record<TrainingFacilityAreaKey, number>;
  rating: number;
  economyIndex: number;
  availableCash: number;
  fmt: (value: number) => string;
  onPurchaseArea: (area: TrainingFacilityAreaKey) => void;
}

const AREA_ICONS: Record<TrainingFacilityAreaKey, React.ReactNode> = {
  courts: <Dumbbell size={22} />,
  strength: <Zap size={22} />,
  science: <FlaskConical size={22} />,
  video: <MonitorPlay size={22} />,
  media: <Users size={22} />,
  recovery: <Activity size={22} />,
};

const FACILITY_AREAS = TRAINING_AREA_SPECS.map(spec => ({
  ...spec,
  key: spec.id,
  icon: AREA_ICONS[spec.id],
}));

const TIER_STYLES: Record<FacilityTier, string> = {
  Elite: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  Advanced: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  Standard: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
  Basic: 'border-slate-600 bg-slate-800/50 text-slate-400',
};

function tierFromLevel(level: number): FacilityTier {
  if (level >= 9) return 'Elite';
  if (level >= 6) return 'Advanced';
  if (level >= 3) return 'Standard';
  return 'Basic';
}

function facilityStatus(rating: number): string {
  if (rating >= 90) return 'World Class';
  if (rating >= 80) return 'Elite';
  if (rating >= 68) return 'Advanced';
  if (rating >= 50) return 'Standard';
  return 'Basic';
}

export const TrainingOverviewPanel: React.FC<TrainingOverviewPanelProps> = ({
  facilityName,
  arenaName,
  teamLogoUrl,
  areaLevels,
  rating,
  economyIndex,
  availableCash,
  fmt,
  onPurchaseArea,
}) => {
  const [selectedArea, setSelectedArea] = useState<(typeof FACILITY_AREAS)[number] | null>(null);
  const [completed, setCompleted] = useState<{ level: number; before: number; after: number } | null>(null);
  const status = facilityStatus(rating);
  const impact = [
    ['Player Growth', Math.min(99, rating)],
    ['Injury Reduction', Math.min(99, 30 + areaLevels.recovery * 6 + areaLevels.science * 2)],
    ['Learning Environment', Math.min(99, 35 + areaLevels.video * 5 + areaLevels.courts * 2)],
    ['Conditioning', Math.min(99, 35 + areaLevels.strength * 6 + areaLevels.recovery * 2)],
  ] as Array<[string, number]>;

  const closeArea = () => {
    setSelectedArea(null);
    setCompleted(null);
  };

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-sky-400/25 bg-gradient-to-br from-slate-900 to-sky-950/30 p-4 sm:p-6">
            <div className="flex items-start gap-4 sm:items-center">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-sky-400/25 bg-slate-950/60 sm:h-24 sm:w-24">
                {teamLogoUrl
                  ? <img src={teamLogoUrl} alt="" className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
                  : <Dumbbell size={36} className="text-sky-300" />}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-300">Training Facility</div>
                <h3 className="mt-1 break-words text-xl font-black leading-tight text-white sm:text-2xl">{facilityName}</h3>
                <span className="mt-3 inline-flex rounded-lg border border-emerald-400/35 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">{status}</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <Star size={19} className="shrink-0 text-sky-300" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-400">Training Center Rating</div>
                <div className="mt-1 text-lg font-black tabular-nums text-white">
                  {Math.min(99, rating)} <span className="text-sm text-slate-500">/ 99</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300"
                    style={{ width: `${Math.min(99, Math.max(0, rating))}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] font-black text-amber-300">{status}</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-5">
            <div className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-sky-300">Facility Areas</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FACILITY_AREAS.map(area => {
                const level = areaLevels[area.key];
                const tier = tierFromLevel(level);
                const areaRating = Math.min(99, Math.round(35 + ((level - 1) / 9) * 64));
                return (
                  <button
                    type="button"
                    key={area.key}
                    onClick={() => {
                      setSelectedArea(area);
                      setCompleted(null);
                    }}
                    className="rounded-xl border border-slate-800 bg-slate-950/65 p-4 text-left transition hover:border-sky-400/45 hover:bg-slate-900"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-sky-300">{area.icon}</span>
                      <div className="min-w-0">
                        <div className="font-black leading-tight text-white">{area.label}</div>
                        <span className={`mt-2 inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-black ${TIER_STYLES[tier]}`}>Level {level} / 10</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-sky-400" style={{ width: `${areaRating}%` }} />
                      </div>
                      <span className="w-6 text-right text-xs font-black text-sky-200">{areaRating}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-5">
            <div className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-sky-300">Quick Info</div>
            <div className="divide-y divide-slate-800">
              {[
                ['Facility', facilityName],
                ['Status', status],
                ['Arena', arenaName],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 py-3">
                  <span className="text-sm text-slate-400">{label}</span>
                  <span className="max-w-[170px] text-right text-sm font-black text-white">{value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-5">
            <div className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-sky-300">Facility Impact</div>
            <div className="space-y-5">
              {impact.map(([label, value]) => (
                <div key={label}>
                  <div className="mb-2 flex justify-between gap-3 text-sm">
                    <span className="font-bold text-slate-200">{label}</span>
                    <span className="font-black text-sky-300">{value}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-sky-400" style={{ width: `${value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/5 p-4 text-sm text-slate-300 sm:p-5">
        <Info size={21} className="mt-0.5 shrink-0 text-sky-300" />
        <p>Owned upgrades and installed sponsor equipment are permanent club assets.</p>
      </div>

      {selectedArea && (
        <TrainingAreaModal
          area={selectedArea}
          areaLevels={areaLevels}
          rating={rating}
          economyIndex={economyIndex}
          availableCash={availableCash}
          fmt={fmt}
          completed={completed}
          onClose={closeArea}
          onPurchase={area => {
            const currentLevel = areaLevels[area];
            const currentAverage = Object.values(areaLevels).reduce((sum, value) => sum + value, 0) / Object.values(areaLevels).length;
            const nextLevels = { ...areaLevels, [area]: Math.min(10, currentLevel + 1) };
            const nextAverage = Object.values(nextLevels).reduce((sum, value) => sum + value, 0) / Object.values(nextLevels).length;
            const before = Math.min(99, Math.round(35 + ((currentAverage - 1) / 9) * 64));
            const after = Math.min(99, rating + Math.round(35 + ((nextAverage - 1) / 9) * 64) - before);
            setCompleted({ level: currentLevel + 1, before: rating, after });
            onPurchaseArea(area);
          }}
        />
      )}
    </>
  );
};

const TrainingAreaModal: React.FC<{
  area: (typeof FACILITY_AREAS)[number];
  areaLevels: Record<TrainingFacilityAreaKey, number>;
  rating: number;
  economyIndex: number;
  availableCash: number;
  fmt: (value: number) => string;
  completed: { level: number; before: number; after: number } | null;
  onClose: () => void;
  onPurchase: (area: TrainingFacilityAreaKey) => void;
}> = ({ area, areaLevels, rating, economyIndex, availableCash, fmt, completed, onClose, onPurchase }) => {
  const level = areaLevels[area.key];
  const cost = getTrainingUpgradeCost(area, level, economyIndex);
  const canAfford = cost > 0 && availableCash >= cost;
  const tier = tierFromLevel(level);
  const areaRating = Math.min(99, Math.round(35 + ((level - 1) / 9) * 64));
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/80 sm:items-center sm:p-4" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-400/10 text-sky-300">{area.icon}</span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-300">{completed ? 'Upgrade Complete' : 'Owned Facility Area'}</p>
              <h3 className="mt-1 text-xl font-black text-white">{area.label}</h3>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-800 hover:text-white"><X size={18} /></button>
        </div>
        {completed ? (
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-center">
            <motion.div initial={{ scale: 0.4, rotate: -18 }} animate={{ scale: 1, rotate: 0 }} className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400 text-lg font-black text-slate-950">✓</motion.div>
            <p className="text-lg font-black text-emerald-200">Level {completed.level} is now active</p>
            <p className="mt-2 text-sm text-slate-300">The permanent {area.label.toLowerCase()} upgrade has been added.</p>
            <div className="mt-3 rounded-xl bg-slate-950/35 px-3 py-2 text-sm font-black text-white">Facility Rating: {completed.before} → <span className="text-emerald-300">{completed.after}</span></div>
          </div>
        ) : (
          <>
            <p className="mt-5 text-sm leading-6 text-slate-400">{area.description}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Owned level</p>
                  <span className="text-xs font-black tabular-nums text-sky-200">{level} / 10</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full border border-slate-700 bg-slate-950">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${level * 10}%` }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300"
                  />
                </div>
                <p className="mt-2 text-[10px] font-black text-slate-400">{tier}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Area rating</p>
                <p className="mt-1 text-2xl font-black text-sky-300">{areaRating}</p>
              </div>
            </div>
            {level < 10 ? (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex justify-between text-sm"><span className="text-slate-400">Next upgrade</span><span className="font-black text-white">Level {level + 1}</span></div>
                <div className="mt-2 flex justify-between text-sm"><span className="text-slate-400">One-time price</span><span className="font-black text-amber-300">{fmt(cost)}</span></div>
                <div className="mt-2 flex justify-between text-sm"><span className="text-slate-400">Available Club Cash</span><span className="font-black text-white">{fmt(availableCash)}</span></div>
                <button type="button" disabled={!canAfford} onClick={() => onPurchase(area.key)} className="mt-4 w-full rounded-xl bg-sky-400 py-3 text-sm font-black text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40">Purchase Level {level + 1}</button>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-center text-sm font-black text-emerald-200">Fully upgraded</div>
            )}
          </>
        )}
        <button type="button" onClick={onClose} className="mt-3 w-full rounded-xl bg-slate-800 py-3 text-sm font-black text-white hover:bg-slate-700">{completed ? 'Done' : 'Close'}</button>
      </div>
    </div>
  );
};
