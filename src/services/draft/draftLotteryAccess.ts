import type { OffseasonRowStatus } from '../../types';

export type DraftLotteryUnavailableReason = 'not-open' | 'field-not-ready' | 'complete';

export const shouldShowDraftOrderReview = (
  pbaMode: boolean,
  reviewStatus: OffseasonRowStatus | undefined,
): boolean => !pbaMode && reviewStatus === 'in-progress';

export function getDraftLotteryActionAvailability({
  dateReached,
  poolReady,
  hasSavedResult,
  replayPending,
  draftComplete,
  checklistStatus,
}: {
  dateReached: boolean;
  poolReady: boolean;
  hasSavedResult: boolean;
  replayPending: boolean;
  draftComplete: boolean;
  checklistStatus?: OffseasonRowStatus;
}): { canRun: boolean; reason: DraftLotteryUnavailableReason | null } {
  if (hasSavedResult || replayPending) return { canRun: true, reason: null };
  if (draftComplete || checklistStatus === 'done' || checklistStatus === 'skipped') {
    return { canRun: false, reason: 'complete' };
  }
  if (!dateReached) return { canRun: false, reason: 'not-open' };
  if (!poolReady) return { canRun: false, reason: 'field-not-ready' };
  return { canRun: true, reason: null };
}
