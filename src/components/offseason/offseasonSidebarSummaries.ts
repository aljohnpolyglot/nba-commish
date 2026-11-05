import { getOffseasonState } from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow, OffseasonRowStatus } from '../../types';
import { formatMonthDay } from './aufgabenShared';

type RowAutoReasonArgs = {
  row: OffseasonChecklistRow;
  status: OffseasonRowStatus;
  state: any;
  pendingTeamOptionsLength: number;
  rfaCandidatesLength: number;
  expiringGateHasRows: boolean;
  staffRetirementCount?: number;
  openStaffCount: number;
  staffCompletionSummary?: string | null;
  sponsorCoverageComplete: boolean;
  transferWindowOpen: boolean;
  transferWindowNextOpenLabel: string | null;
};

export function getRowAutoReason({
  row,
  status,
  state,
  pendingTeamOptionsLength,
  rfaCandidatesLength,
  expiringGateHasRows,
  staffRetirementCount = 0,
  openStaffCount,
  staffCompletionSummary,
  sponsorCoverageComplete,
  transferWindowOpen,
  transferWindowNextOpenLabel,
}: RowAutoReasonArgs): string | null {
  if (row === 'freeAgency' && status === 'skipped') {
    const offseasonWindow = state.date ? getOffseasonState(state.date, state.leagueStats as any, state.schedule as any) : null;
    if (offseasonWindow?.phase === 'preCamp') return `The summer market is closed. Camp opens ${formatMonthDay(offseasonWindow.trainingCampStr)}.`;
    if (offseasonWindow && offseasonWindow.phase !== 'moratorium' && offseasonWindow.phase !== 'birdRights' && offseasonWindow.phase !== 'openFA') {
      return `Free agency is not open yet. The market opens ${formatMonthDay(offseasonWindow.faStartStr)}.`;
    }
    return 'Free agency is not active right now.';
  }
  if (status !== 'done' && status !== 'skipped') return null;
  switch (row) {
    case 'options':
      return pendingTeamOptionsLength === 0 ? 'No option decisions remain on your board.' : null;
    case 'qualifyingOffers':
      return rfaCandidatesLength === 0 ? 'No qualifying-offer decisions remain on your board.' : null;
    case 'myFAs':
      return !expiringGateHasRows ? 'No expiring-contract talks remain on your board.' : null;
    case 'staffRetirements':
      return staffRetirementCount === 0 ? 'No staff retirements were announced this offseason.' : null;
    case 'staffSignings':
      return staffCompletionSummary ?? (openStaffCount === 0 ? 'All coaching and support roles are already covered.' : null);
    case 'sponsorRenewals':
      return sponsorCoverageComplete ? 'All sponsor slots are already locked in for next season.' : null;
    case 'transferMarket':
      return !transferWindowOpen ? `The player market is closed right now${transferWindowNextOpenLabel ? ` and reopens ${transferWindowNextOpenLabel}` : ''}.` : null;
    default:
      return null;
  }
}
