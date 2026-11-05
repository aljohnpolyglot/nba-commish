import type { OffseasonChecklist } from '../../types';

function isUnresolved(status: unknown): boolean {
  return status === 'pending' || status === 'in-progress' || status == null;
}

export function settleBypassedReviewsForInternationalTournament(
  checklist: OffseasonChecklist,
  tournament: { readOnly?: boolean } | null | undefined,
): OffseasonChecklist {
  if (!tournament || tournament.readOnly) return checklist;
  const settleSeasonReview = isUnresolved(checklist.seasonSummary);
  const settleRetirementReview = isUnresolved(checklist.retiredPlayersReview);
  if (!settleSeasonReview && !settleRetirementReview) return checklist;
  return {
    ...checklist,
    seasonSummary: settleSeasonReview ? 'done' : checklist.seasonSummary,
    retiredPlayersReview: settleRetirementReview ? 'skipped' : checklist.retiredPlayersReview,
  };
}
