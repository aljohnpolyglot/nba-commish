import React from 'react';
import { CheckCircle2, Circle, ChevronRight, FastForward, ListChecks } from 'lucide-react';
import { OFFSEASON_ROW_LABELS } from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow, OffseasonRowStatus } from '../../types';

type EuroRecapSummary = {
  title: string;
  hasSeasonRecap: boolean;
  endedOn: string | null;
  finishLine: string | null;
  championLine: string | null;
  faLine: string | null;
};

type WindowCounter = {
  current: number;
  total: number;
};

const STATUS_ICON: Record<OffseasonRowStatus, React.ReactNode> = {
  'pending': <Circle className="w-4 h-4 text-slate-500" />,
  'in-progress': <Circle className="w-4 h-4 text-amber-400 animate-pulse" />,
  'done': <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  'skipped': <CheckCircle2 className="w-4 h-4 text-slate-600" />,
};

const STATUS_LABEL: Record<OffseasonRowStatus, string> = {
  'pending': '',
  'in-progress': 'In progress',
  'done': 'Complete',
  'skipped': 'Skipped',
};

export const OffseasonEuroRecapCard: React.FC<{ recap: EuroRecapSummary }> = ({ recap }) => (
  <section className="rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-3 space-y-2">
    <div className="flex items-center gap-2">
      <ListChecks size={14} className="text-amber-300" />
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">
        {recap.title}
      </div>
    </div>
    {recap.hasSeasonRecap && recap.endedOn && (
      <p className="text-[10px] text-slate-300 leading-snug">
        Your season wrapped up on <span className="font-black text-white">{recap.endedOn}</span>.
      </p>
    )}
    {recap.finishLine && (
      <p className="text-[10px] text-slate-400 leading-snug">
        Finish: <span className="text-slate-200">{recap.finishLine}</span>
      </p>
    )}
    {recap.championLine && (
      <p className="text-[10px] text-slate-400 leading-snug">
        Champions: <span className="text-slate-200">{recap.championLine}</span>
      </p>
    )}
    {recap.faLine && (
      <p className="text-[10px] text-slate-400 leading-snug">
        {recap.faLine}
      </p>
    )}
  </section>
);

type ChecklistRowItemProps = {
  row: OffseasonChecklistRow;
  status: OffseasonRowStatus;
  isCurrent: boolean;
  isParallel: boolean;
  isExpanded: boolean;
  isResolved: boolean;
  isEuroMode: boolean;
  hasTrainingEngagement: boolean;
  dueSponsorCount: number;
  openStaffCount: number;
  transferRowClosed: boolean;
  transferClosedLabel: string;
  blocked: boolean;
  blockedLabel: string | null;
  transferMarketCanComplete: boolean;
  rowDescription: string;
  autoReason: string | null;
  tmWindowCounter: WindowCounter | null;
  onPrimary: () => void;
  onMarkDone?: () => void;
};

export const OffseasonChecklistRowItem: React.FC<ChecklistRowItemProps> = ({
  row,
  status,
  isCurrent,
  isParallel,
  isExpanded,
  isResolved,
  isEuroMode,
  hasTrainingEngagement,
  dueSponsorCount,
  openStaffCount,
  transferRowClosed,
  transferClosedLabel,
  blocked,
  blockedLabel,
  transferMarketCanComplete,
  rowDescription,
  autoReason,
  tmWindowCounter,
  onPrimary,
  onMarkDone,
}) => (
  <li
    className={`rounded-xl px-3 py-2.5 flex flex-col gap-1 transition-colors ${
      isCurrent
        ? 'bg-amber-500/10 border border-amber-500/40'
        : isParallel
          ? 'bg-sky-500/5 border border-sky-500/20'
          : 'bg-slate-900/40 border border-slate-800/60'
    }`}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {STATUS_ICON[status]}
        <span
          className={`text-[11px] font-black uppercase tracking-tight truncate ${
            isResolved ? 'text-slate-500' : 'text-white'
          }`}
        >
          {OFFSEASON_ROW_LABELS[row]}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {row === 'trainingCamp' && hasTrainingEngagement && !isResolved && (
          <span
            title="Training changes detected on your team. Camp still completes by calendar, not by this signal."
            className="text-[8px] uppercase tracking-widest font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded"
          >
            Engaged
          </span>
        )}
        {row === 'sponsorRenewals' && !isResolved && (
          dueSponsorCount > 0 ? (
            <span
              title={`${dueSponsorCount} sponsorship slot${dueSponsorCount === 1 ? '' : 's'} still need renewal or replacement`}
              className="text-[8px] uppercase tracking-widest font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded"
            >
              {dueSponsorCount} due
            </span>
          ) : (
            <span
              title="All sponsors cleared for the next season"
              className="text-[8px] uppercase tracking-widest font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded"
            >
              Active
            </span>
          )
        )}
        {row === 'staffSignings' && !isResolved && (
          openStaffCount > 0 ? (
            <span
              title={`${openStaffCount} coach or staff role${openStaffCount === 1 ? '' : 's'} still need renewal or replacement`}
              className="text-[8px] uppercase tracking-widest font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded"
            >
              {openStaffCount} due
            </span>
          ) : (
            <span
              title="All coaching and support staff are set for next season"
              className="text-[8px] uppercase tracking-widest font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded"
            >
              Active
            </span>
          )
        )}
        {(transferRowClosed || blocked) && (
          <span
            title={transferRowClosed ? 'The transfer window is closed right now.' : 'This offseason step is still locked.'}
            className="text-[8px] uppercase tracking-widest font-bold text-sky-300 bg-sky-500/10 border border-sky-500/30 px-1.5 py-0.5 rounded"
          >
            {blocked ? blockedLabel : transferClosedLabel}
          </span>
        )}
        {STATUS_LABEL[status] && (
          <span className="text-[8px] uppercase tracking-widest font-bold text-slate-500 shrink-0">
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>
    </div>
    {autoReason && (
      <p className="text-[9px] text-slate-500 leading-snug pl-6 pr-1">
        {autoReason}
      </p>
    )}

    {isExpanded && (
      <>
        <p className="text-[10px] text-slate-400 leading-snug">
          {rowDescription}
        </p>
        {row === 'transferMarket' && tmWindowCounter && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-sky-400">Market Day</span>
            <span className="text-[9px] font-black text-white">{tmWindowCounter.current}/{tmWindowCounter.total}</span>
            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-sky-400 rounded-full" style={{ width: `${(tmWindowCounter.current / tmWindowCounter.total) * 100}%` }} />
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-1">
          {!isResolved && (
            <button
              onClick={onPrimary}
              disabled={transferRowClosed || blocked}
              title={transferRowClosed
                ? `This task unlocks on ${transferClosedLabel.replace(/^Opens /, '')}.`
                : blocked
                  ? `${blockedLabel ?? 'This task is locked.'}`
                : status === 'in-progress'
                  ? 'Re-open this offseason task and continue where you left off.'
                  : 'Open this offseason task.'}
              className={`flex-1 px-2 py-1 rounded-md font-bold text-[10px] uppercase tracking-widest transition-colors ${
                transferRowClosed || blocked
                  ? 'bg-white/5 text-slate-500 border border-white/10 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {transferRowClosed
                ? transferClosedLabel
                : blocked
                  ? blockedLabel
                : isEuroMode && row === 'trainingCamp'
                  ? 'Mark Done'
                  : status === 'in-progress'
                    ? 'Resume'
                    : 'Enter'}
            </button>
          )}
          {onMarkDone && (
            <button
              onClick={onMarkDone}
              title="Mark complete without making changes."
              className="flex-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-bold text-[10px] uppercase tracking-widest transition-colors"
            >
              Mark Done
            </button>
          )}
        </div>
      </>
    )}
  </li>
);
