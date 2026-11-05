import type { InternationalTournamentState } from './types';

export function markInternationalTournamentReviewed(
  tournament: InternationalTournamentState,
): InternationalTournamentState {
  if (tournament.status !== 'complete' || !tournament.result) return tournament;
  return { ...tournament, status: 'reviewed', reviewed: true };
}
