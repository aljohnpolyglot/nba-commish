import React from 'react';
import { CheckCircle2, Circle, ChevronRight, FastForward } from 'lucide-react';
import { getOffseasonRowLabel } from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow, OffseasonRowStatus } from '../../types';

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

type ChecklistRowItemProps = {
  row: OffseasonChecklistRow;
  status: OffseasonRowStatus;
  isCurrent: boolean;
  isParallel: boolean;
  isExpanded: boolean;
  isResolved: boolean;
  isEuroMode: boolean;
  isPbaMode: boolean;
  isDraftOrderReview: boolean;
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
  onOneDay?: () => void;
  onEndWindow?: () => void;
  onMarkDone?: () => void;
  onSkip?: () => void;
  markDoneReplacesPrimary?: boolean;
  primaryLabel?: string;
};

export const OffseasonChecklistRowItem: React.FC<ChecklistRowItemProps> = ({
  row,
  status,
  isCurrent,
  isParallel,
  isExpanded,
  isResolved,
  isEuroMode,
  isPbaMode,
  isDraftOrderReview,
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
  onOneDay,
  onEndWindow,
  onMarkDone,
  onSkip,
  markDoneReplacesPrimary = false,
  primaryLabel,
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
            isResolved || blocked ? 'text-slate-500' : 'text-white'
          }`}
        >
          {isEuroMode && row === 'governorsBoardMeeting'
            ? 'League Assembly'
            : isEuroMode && row === 'seasonSummary'
              ? 'Season Review'
              : isEuroMode && row === 'euroScheduleDraw'
                ? 'Schedule Draw'
                : !isEuroMode && row === 'sponsorRenewals'
                  ? 'Franchise Deals'
                : isDraftOrderReview && row === 'draftLottery'
                  ? 'Draft Order Review'
              : getOffseasonRowLabel(row, isEuroMode ? 'euro_isolated' : undefined)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {row === 'sponsorRenewals' && !isResolved && !blocked && dueSponsorCount > 0 && (
            <span
              title={isEuroMode
                ? `${dueSponsorCount} sponsorship slot${dueSponsorCount === 1 ? '' : 's'} still need renewal or replacement`
                : `${dueSponsorCount} franchise decision${dueSponsorCount === 1 ? '' : 's'} still need review`}
              className="text-[8px] uppercase tracking-widest font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded"
            >
              {dueSponsorCount} due
            </span>
        )}
        {row === 'staffSignings' && !isResolved && openStaffCount > 0 && (
            <span
              title={`${openStaffCount} coach or staff role${openStaffCount === 1 ? '' : 's'} still need renewal or replacement`}
              className="text-[8px] uppercase tracking-widest font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded"
            >
              {openStaffCount} due
            </span>
        )}
        {(transferRowClosed || (blocked && !!blockedLabel)) && (
          <span
            title={transferRowClosed ? 'The transfer window is closed right now.' : undefined}
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
        {(row === 'transferMarket' || (isEuroMode && row === 'freeAgency')) && tmWindowCounter && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-sky-400">{row === 'freeAgency' ? 'Signing Day' : 'Market Day'}</span>
            <span className="text-[9px] font-black text-white">{tmWindowCounter.current}/{tmWindowCounter.total}</span>
            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-sky-400 rounded-full" style={{ width: `${(tmWindowCounter.current / tmWindowCounter.total) * 100}%` }} />
            </div>
          </div>
        )}
        {onOneDay && onEndWindow && !isResolved ? (
          <div className="mt-1 flex flex-col gap-2">
            <button
              onClick={onPrimary}
              disabled={transferRowClosed || blocked}
              className="w-full rounded-md bg-emerald-600 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:border disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
            >
              Resume
            </button>
            <button
              onClick={onOneDay}
              disabled={transferRowClosed || blocked}
              className="w-full rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-sky-200 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
            >
              One Day
            </button>
            <button
              onClick={onEndWindow}
              disabled={transferRowClosed || blocked}
              className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              {row === 'freeAgency' ? 'Finish Signing Market' : row === 'transferMarket' ? 'Finish Transfer Market' : 'End Window'}
            </button>
          </div>
        ) : (
        <div className="flex gap-2 mt-1">
          {!isResolved && !markDoneReplacesPrimary && !blocked && (
            <button
              onClick={onPrimary}
              disabled={transferRowClosed}
              title={transferRowClosed
                ? `This task unlocks on ${transferClosedLabel.replace(/^Opens /, '')}.`
                : status === 'in-progress'
                  ? 'Re-open this offseason task and continue where you left off.'
                  : 'Open this offseason task.'}
              className={`flex-1 px-2 py-1 rounded-md font-bold text-[10px] uppercase tracking-widest transition-colors ${
                transferRowClosed
                  ? 'bg-white/5 text-slate-500 border border-white/10 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {transferRowClosed
                ? transferClosedLabel
                : status === 'in-progress'
                    ? 'Resume'
                    : primaryLabel ?? 'Enter'}
            </button>
          )}
          {onMarkDone && !blocked && (
            <button
              onClick={onMarkDone}
              title="Mark complete without making changes."
              className="flex-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-bold text-[10px] uppercase tracking-widest transition-colors"
            >
              Mark Done
            </button>
          )}
          {onSkip && (
            <button
              onClick={onSkip}
              title={row === 'staffSignings'
                ? 'Let your Assistant GM handle the remaining staff decisions.'
                : row === 'pbaOpeningCeremony'
                  ? 'Complete this ceremony task without watching the cutscene.'
                  : 'Skip this task after confirmation.'}
              className="flex-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-bold text-[10px] uppercase tracking-widest transition-colors"
            >
              Skip
            </button>
          )}
        </div>
        )}
      </>
    )}
  </li>
);
