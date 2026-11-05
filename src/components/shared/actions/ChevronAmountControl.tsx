import { ChevronLeft, ChevronRight, Star } from 'lucide-react';

interface ChevronAmountControlProps {
  value: number;
  step: number;
  recommendedValue?: number;
  currencyCode: string;
  label?: string;
  valueCaption?: string;
  onChange: (value: number) => void;
}

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(value);
}

export function ChevronAmountControl({
  value,
  step,
  recommendedValue,
  currencyCode,
  label = 'Amount',
  valueCaption,
  onChange,
}: ChevronAmountControlProps) {
  const safeStep = Math.max(1, Math.round(step));
  const canDecrease = value > safeStep;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</label>
        {recommendedValue !== undefined && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-300">
            <Star size={12} fill="currentColor" />
            Recommended {formatMoney(recommendedValue, currencyCode)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-stretch overflow-hidden rounded-2xl border border-slate-600/70 bg-slate-950/50">
        <button
          type="button"
          onClick={() => onChange(Math.max(safeStep, value - safeStep))}
          disabled={!canDecrease}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="flex min-h-24 items-center justify-center border-r border-slate-700 text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:text-slate-700"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex min-w-0 flex-col items-center justify-center px-3 py-4 text-center">
          <p className="break-all text-3xl font-black tracking-tight text-white sm:text-5xl">{formatMoney(value, currencyCode)}</p>
          {valueCaption && <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{valueCaption}</p>}
        </div>
        <button
          type="button"
          onClick={() => onChange(value + safeStep)}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="flex min-h-24 items-center justify-center border-l border-slate-700 text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  );
}
