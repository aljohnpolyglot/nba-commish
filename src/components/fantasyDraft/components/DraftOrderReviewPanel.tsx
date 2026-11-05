import { ChevronLeft } from 'lucide-react';
import { TeamLogo } from '../lib/nbaBranding';

export type DraftOrderReviewTeam = {
  id: number;
  draftSlot: number;
  name: string;
  abbrev: string;
  isUser?: boolean;
  secondaryLabel?: string;
  logoUrl?: string;
};

type DraftOrderReviewPanelProps = {
  teams: DraftOrderReviewTeam[];
  eyebrow: string;
  title: string;
  description: string;
  footerLabel: string;
  primaryLabel: string;
  userDraftSlot?: number;
  userDraftSlots?: number[];
  onBack?: () => void;
  onPrimary: () => void;
  primaryDisabled?: boolean;
};

export const DraftOrderReviewPanel = ({
  teams,
  eyebrow,
  title,
  description,
  footerLabel,
  primaryLabel,
  userDraftSlot,
  userDraftSlots,
  onBack,
  onPrimary,
  primaryDisabled = false,
}: DraftOrderReviewPanelProps) => (
  <main className="relative z-10 flex-1 overflow-y-auto px-4 py-8 sm:px-6 sm:py-12">
    <div className="mx-auto w-full max-w-5xl">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-7 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-300 transition-colors hover:border-amber-400 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
      )}

      <div className="rounded-[2rem] border border-indigo-400/30 bg-gradient-to-br from-slate-900 via-indigo-950/35 to-slate-950 p-5 shadow-[0_0_50px_rgba(79,70,229,0.16)] sm:p-8">
        <div className="mb-7 flex flex-col gap-4 border-b border-indigo-300/15 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-indigo-300">{eyebrow}</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-5xl">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-400">{description}</p>
          </div>
          {(userDraftSlots != null || userDraftSlot != null) && (
            <div className="rounded-2xl border border-amber-400/50 bg-amber-500/10 px-5 py-3 text-left sm:text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Your Picks</p>
              <p className="max-w-full whitespace-normal break-words text-2xl font-black text-white sm:max-w-64">
                {userDraftSlots != null
                  ? userDraftSlots.length > 0
                    ? [...userDraftSlots].sort((left, right) => left - right).map(slot => `#${slot}`).join(', ')
                    : 'NONE'
                  : `#${userDraftSlot}`}
              </p>
            </div>
          )}
        </div>

        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...teams].sort((a, b) => a.draftSlot - b.draftSlot).map(team => (
            <li
              key={`${team.id}-${team.draftSlot}`}
              className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 transition-colors ${team.isUser ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_24px_rgba(245,158,11,0.13)]' : 'border-indigo-300/15 bg-slate-950/65'}`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-black ${team.isUser ? 'bg-amber-400 text-slate-950' : 'bg-indigo-500/15 text-indigo-200'}`}>
                {String(team.draftSlot).padStart(2, '0')}
              </span>
              {team.logoUrl ? (
                <img src={team.logoUrl} alt={team.name} className="h-11 w-11 shrink-0 object-contain" referrerPolicy="no-referrer" />
              ) : (
                <TeamLogo abbrev={team.abbrev} alt={team.name} sizeClass="h-11 w-11" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-black uppercase text-white">{team.name}</span>
                <span className={`block truncate text-[9px] font-black uppercase tracking-wider ${team.isUser ? 'text-amber-300' : 'text-slate-500'}`}>
                  {team.isUser ? 'Your Team' : team.secondaryLabel ?? `Pick #${team.draftSlot}`}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-7 flex flex-col gap-3 border-t border-indigo-300/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{footerLabel}</p>
          <button
            type="button"
            onClick={onPrimary}
            disabled={primaryDisabled}
            className="w-full rounded-2xl bg-amber-400 px-7 py-3.5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-amber-500/20 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none sm:w-auto"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  </main>
);
