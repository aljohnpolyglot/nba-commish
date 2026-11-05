import React from 'react';
import { ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import type { TycoonState } from '../../../../../types/tycoon';
import {
  ARENA_CAPACITY_PROJECTS,
  type ArenaCapacityProject,
} from '../../../../../services/tycoon/facilityUpgradeEngine';

interface ArenaOverviewTabProps {
  arenaName: string;
  capacity: number;
  arenaRating: number;
  tycoon: TycoonState;
  revenueEstimate: number;
  homeGames: number;
  fmt: (value: number) => string;
  onSelectCapacity: (project: ArenaCapacityProject) => void;
}

export const ArenaOverviewTab: React.FC<ArenaOverviewTabProps> = ({
  arenaName,
  capacity,
  arenaRating,
  tycoon,
  revenueEstimate,
  homeGames,
  fmt,
  onSelectCapacity,
}) => {
  const completed = new Set(tycoon.facilities.stadium.completedArenaProjects ?? []);
  const currentIndex = ARENA_CAPACITY_PROJECTS.findIndex(project => !completed.has(project.id));
  const currentProject = currentIndex >= 0 ? ARENA_CAPACITY_PROJECTS[currentIndex] : undefined;
  const nextProject = currentIndex >= 0 ? ARENA_CAPACITY_PROJECTS[currentIndex + 1] : undefined;
  const completedCount = ARENA_CAPACITY_PROJECTS.filter(project => completed.has(project.id)).length;

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Capacity Projects</div>
              <p className="mt-2 text-xs leading-5 text-slate-500">Complete each permanent expansion to unlock the next stage.</p>
            </div>
            <span className="shrink-0 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-xs font-black text-amber-300">
              {completedCount} / {ARENA_CAPACITY_PROJECTS.length}
            </span>
          </div>

          {currentProject ? (
            <div className="mt-5 grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]">
              <button
                type="button"
                onClick={() => onSelectCapacity(currentProject)}
                className="rounded-xl border border-amber-400/35 bg-amber-400/[0.05] p-5 text-left transition hover:border-amber-300/65"
              >
                <div className="text-[10px] font-black uppercase tracking-widest text-sky-300">Current Stage</div>
                <div className="mt-3 text-lg font-black text-white">{currentProject.label}</div>
                <div className="mt-2 text-base font-black text-amber-300">+{currentProject.seatGain.toLocaleString()} seats</div>
                <div className="mt-4 inline-flex items-center gap-2 text-xs font-black text-amber-200">
                  Review project <ArrowRight size={14} />
                </div>
              </button>
              <div className="flex items-center justify-center text-slate-500">
                <div className="flex h-11 w-11 rotate-90 items-center justify-center rounded-full border border-slate-700 bg-slate-950 md:rotate-0">
                  <ArrowRight size={20} />
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/55 p-5">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <Lock size={12} /> Next Stage
                </div>
                {nextProject ? (
                  <>
                    <div className="mt-3 text-lg font-black text-white">{nextProject.label}</div>
                    <div className="mt-2 text-base font-black text-amber-300">+{nextProject.seatGain.toLocaleString()} seats</div>
                  </>
                ) : (
                  <div className="mt-3 text-lg font-black text-white">Final configuration</div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-emerald-200">
              <CheckCircle2 size={22} />
              <span className="font-black">All capacity projects are complete.</span>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-6">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Arena Sections</div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              ['Lower Bowl', `${Math.round(capacity * 0.45).toLocaleString()} seats`, 'Premium courtside and lower-level seating.'],
              ['Upper Bowl', `${Math.round(capacity * 0.40).toLocaleString()} seats`, 'Upper-level general admission seating.'],
              ['Luxury Suites', `${Math.round(capacity * 0.15).toLocaleString()} seats`, 'Private suites, club seats, and VIP areas.'],
            ].map(([name, seats, description]) => (
              <div key={name} className="rounded-xl border border-slate-700 bg-slate-950/55 p-5">
                <div className="text-base font-black text-white">{name}</div>
                <div className="mt-2 text-2xl font-black text-white">{seats.split(' ')[0]}</div>
                <div className="text-sm text-slate-400">seats</div>
                <div className="my-4 h-px bg-slate-800" />
                <p className="text-sm leading-6 text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-5">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Arena Details</div>
          <div className="mt-4 divide-y divide-slate-800">
            {[
              ['Name', arenaName],
              ['Capacity', capacity.toLocaleString()],
              ['Arena Rating', `${Math.min(99, arenaRating)} / 99`],
              ['Home Games', homeGames > 0 ? String(homeGames) : 'Schedule pending'],
              ['Surface', 'Maple Hardwood'],
              ['Scoreboard', arenaRating >= 85 ? '360° Halo' : 'Standard'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 py-3">
                <span className="text-sm text-slate-400">{label}</span>
                <span className="max-w-[210px] break-words text-right text-sm font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-amber-400/35 bg-gradient-to-b from-amber-400/[0.06] to-slate-900/70 p-6 text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Matchday Revenue</div>
          <div className="mt-8 text-3xl font-black text-white">
            {homeGames > 0 ? fmt(revenueEstimate) : 'Schedule pending'}
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            {homeGames > 0
              ? `Projected across ${homeGames} scheduled home games.`
              : 'Projection appears after the season schedule is drawn.'}
          </p>
        </section>
      </aside>
    </div>
  );
};
