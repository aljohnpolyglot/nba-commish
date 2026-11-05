import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function getSeasonChevronState<T extends string | number>(
  values: readonly T[],
  value: T,
): { previous: T | undefined; next: T | undefined } {
  const index = values.findIndex(candidate => Object.is(candidate, value));
  if (index < 0) return { previous: undefined, next: undefined };
  return {
    previous: values[index + 1],
    next: values[index - 1],
  };
}

interface SeasonChevronControlProps<T extends string | number> {
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
  formatValue: (value: T) => string;
  className?: string;
  size?: 'sm' | 'md';
}

export function SeasonChevronControl<T extends string | number>({
  values,
  value,
  onChange,
  formatValue,
  className = '',
  size = 'sm',
}: SeasonChevronControlProps<T>) {
  const { previous, next } = getSeasonChevronState(values, value);
  const height = size === 'md' ? 'h-9' : 'h-7';
  const buttonWidth = size === 'md' ? 'w-9' : 'w-7';
  const iconSize = size === 'md' ? 15 : 12;

  return (
    <div className={`inline-flex items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900 ${height} ${className}`}>
      <button
        type="button"
        aria-label={previous === undefined ? 'No previous season' : `Previous season: ${formatValue(previous)}`}
        disabled={previous === undefined}
        onClick={() => previous !== undefined && onChange(previous)}
        className={`flex h-full ${buttonWidth} items-center justify-center border-r border-slate-700 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-25`}
      >
        <ChevronLeft size={iconSize} />
      </button>
      <span className="min-w-[72px] px-2 text-center text-[10px] font-black uppercase tracking-wider text-white" aria-live="polite">
        {formatValue(value)}
      </span>
      <button
        type="button"
        aria-label={next === undefined ? 'No next season' : `Next season: ${formatValue(next)}`}
        disabled={next === undefined}
        onClick={() => next !== undefined && onChange(next)}
        className={`flex h-full ${buttonWidth} items-center justify-center border-l border-slate-700 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-25`}
      >
        <ChevronRight size={iconSize} />
      </button>
    </div>
  );
}
