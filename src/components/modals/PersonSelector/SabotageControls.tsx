import React from 'react';
import { ChevronDown, ChevronUp, HatGlasses, ShieldPlus } from 'lucide-react';
import type { InjuryDefinition } from '../../../types';

interface SabotageControlsProps {
  injuries: InjuryDefinition[];
  selectedInjuryName: string;
  reason: string;
  duration: string;
  onInjurySelect: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onDurationChange: (duration: string) => void;
}

export const SabotageControls: React.FC<SabotageControlsProps> = ({
  injuries,
  selectedInjuryName,
  reason,
  duration,
  onInjurySelect,
  onDurationChange,
}) => {
  const adjustDuration = (delta: number) => {
    const current = Number.parseInt(duration, 10);
    onDurationChange(String(Math.max(1, (Number.isFinite(current) ? current : 1) + delta)));
  };

  return (
    <div className="space-y-7 sm:space-y-10">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1.7fr)_minmax(220px,0.9fr)] md:gap-10">
        <div className="space-y-3">
          <label
            htmlFor="sabotage-injury"
            className="block text-xs font-black uppercase tracking-[0.13em] text-slate-400 sm:text-sm"
          >
            Select Injury <span className="text-rose-500">*</span>
          </label>
          <div className="group relative">
            <ShieldPlus
              aria-hidden="true"
              className="pointer-events-none absolute left-5 top-1/2 z-10 -translate-y-1/2 text-violet-400"
              size={25}
            />
            <select
              id="sabotage-injury"
              value={selectedInjuryName}
              onChange={onInjurySelect}
              className="h-[68px] w-full cursor-pointer appearance-none rounded-2xl border border-violet-500/70 bg-slate-950/80 pl-16 pr-14 text-base font-bold text-slate-100 outline-none shadow-[0_0_0_1px_rgba(139,92,246,0.12),0_0_28px_rgba(124,58,237,0.08)] transition focus:border-fuchsia-400 focus:ring-4 focus:ring-violet-500/15 sm:h-[76px] sm:text-lg"
            >
              <option value="" disabled>Choose an injury...</option>
              {injuries.map(injury => (
                <option key={injury.name} value={injury.name}>
                  {injury.name} ({injury.games} games)
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-violet-400 transition-transform group-focus-within:rotate-180"
              size={26}
            />
          </div>
        </div>

        <div className="space-y-3">
          <label
            htmlFor="sabotage-games"
            className="block text-xs font-black uppercase tracking-[0.13em] text-slate-400 sm:text-sm"
          >
            Games <span className="text-rose-500">*</span>
          </label>
          <div className="relative h-[68px] overflow-hidden rounded-2xl border border-slate-700/90 bg-slate-950/80 transition focus-within:border-violet-500 focus-within:ring-4 focus-within:ring-violet-500/15 sm:h-[76px]">
            <input
              id="sabotage-games"
              type="number"
              min="1"
              inputMode="numeric"
              value={duration}
              onChange={event => onDurationChange(event.target.value)}
              placeholder="1"
              className="h-full w-full appearance-none bg-transparent px-5 pr-20 text-lg font-bold text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <div className="absolute inset-y-0 right-0 grid w-[68px] grid-rows-2 border-l border-slate-700/90">
              <button
                type="button"
                onClick={() => adjustDuration(1)}
                className="flex items-center justify-center border-b border-slate-700/90 text-violet-400 transition hover:bg-violet-500/10 hover:text-violet-300"
                aria-label="Increase games"
              >
                <ChevronUp size={23} />
              </button>
              <button
                type="button"
                onClick={() => adjustDuration(-1)}
                className="flex items-center justify-center text-violet-400 transition hover:bg-violet-500/10 hover:text-violet-300"
                aria-label="Decrease games"
              >
                <ChevronDown size={23} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {reason && (
        <div className="flex items-start gap-4 rounded-2xl border border-violet-500/30 bg-[linear-gradient(105deg,rgba(76,29,149,0.20),rgba(15,23,42,0.70))] p-5 shadow-[inset_0_1px_24px_rgba(124,58,237,0.06)] sm:gap-6 sm:p-7">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-violet-500/60 bg-slate-950/70 text-violet-400 shadow-[0_0_24px_rgba(124,58,237,0.16)] sm:h-16 sm:w-16">
            <HatGlasses size={30} />
          </div>
          <p className="pt-0.5 text-sm font-medium leading-7 text-slate-300 sm:pt-2 sm:text-base">
            <span className="font-black uppercase tracking-wide text-violet-400">Covert Plan:</span>{' '}
            Target will suffer a <span className="font-bold text-violet-300">{reason}</span> and be sidelined
            for approximately <span className="font-black text-violet-300">{duration}</span> games. The media
            will report this as a natural occurrence.
          </p>
        </div>
      )}
    </div>
  );
};
