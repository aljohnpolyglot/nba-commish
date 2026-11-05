import type { GameState, OffseasonChecklistRow, Tab } from '../../types';
import {
  firstUnfinishedRow,
  getVisibleOffseasonRows,
  OFFSEASON_ROW_LABELS,
  withGovernorsBoardMeetingTask,
} from '../offseason/offseasonChecklistState';
import { resolveOffseasonTaskView } from '../offseason/offseasonTaskNavigation';

export interface PbaOffseasonTaskTarget {
  row: OffseasonChecklistRow;
  label: string;
  tab: Tab | null;
}

export function getCurrentPbaOffseasonTaskTarget(state: GameState): PbaOffseasonTaskTarget | null {
  if (state.leagueStats?.uiMode !== 'pba_isolated' || !state.offseasonChecklist) return null;
  const checklist = withGovernorsBoardMeetingTask(
    state.offseasonChecklist,
    state.pendingGovernorsBoardMeeting,
    state.leagueStats.year,
  );
  if (!checklist) return null;
  const visibleRows = getVisibleOffseasonRows(
    state.leagueStats,
    null,
    state.date,
    (state as any).expansionSchedule,
    checklist,
    {
      lotteryResolved: !!state.draftLotteryResult?.length,
      draftComplete: !!state.draftComplete,
    },
  );
  const row = firstUnfinishedRow(checklist, undefined, visibleRows);
  return row
    ? {
        row,
        label: row === 'draftLottery' ? 'Draft Order Review' : OFFSEASON_ROW_LABELS[row],
        tab: resolveOffseasonTaskView(row, state),
      }
    : null;
}
