import type { OffseasonChecklistRow, OffseasonRowStatus } from '../../types';

interface MarkDoneAccessInput {
  row: OffseasonChecklistRow;
  status: OffseasonRowStatus;
  isResolved: boolean;
  blocked: boolean;
  isEuroMode: boolean;
  isDraftOrderReview: boolean;
  hasDraftLotteryResult: boolean;
  transferRowClosed: boolean;
  transferMarketCanComplete: boolean;
  sponsorCoverageComplete: boolean;
  staffReviewReady?: boolean;
}

export function shouldShowOffseasonMarkDone(input: MarkDoneAccessInput): boolean {
  const eligible = (
    (input.row === 'seasonSummary' && input.status === 'in-progress')
    || (input.row === 'draftOrderReview' && input.status === 'in-progress')
    || (input.row === 'draftLottery'
      && input.status === 'in-progress'
      && (input.isDraftOrderReview || input.hasDraftLotteryResult))
    || (input.row === 'trainingCamp' && input.status === 'in-progress')
    || input.row === 'transferMarket'
    || (input.row === 'sponsorRenewals' && input.isEuroMode)
    || input.row === 'pbaAllStarWeekend'
  );
  if (!eligible || input.isResolved || input.blocked) return false;
  if (input.row === 'transferMarket' && (input.transferRowClosed || !input.transferMarketCanComplete)) return false;
  if (input.row === 'sponsorRenewals' && input.isEuroMode && !input.sponsorCoverageComplete) return false;
  return true;
}

const SKIPPABLE_REVIEW_ROWS = new Set<OffseasonChecklistRow>([
  'seasonSummary',
  'draft',
  'draftOrderReview',
  'retiredPlayersReview',
  'staffRetirements',
  'staffSignings',
  'options',
  'qualifyingOffers',
  'myFAs',
  'summerLeague',
  'internationalTournament',
  'hofCeremony',
  'sponsorRenewals',
]);

export function shouldShowOffseasonSkip(
  row: OffseasonChecklistRow,
  status: OffseasonRowStatus,
  blocked: boolean,
): boolean {
  if (blocked || !SKIPPABLE_REVIEW_ROWS.has(row)) return false;
  return status === 'pending'
    || ((row === 'staffSignings' || row === 'sponsorRenewals') && status === 'in-progress');
}
