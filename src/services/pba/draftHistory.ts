import type { NBAPlayer } from '../../types';

export type PbaDraftHistorySelection = {
  year: number;
  round: number;
  pick: number;
  tid: number;
};

export function resolvePbaDraftHistorySelection(player: NBAPlayer): PbaDraftHistorySelection | null {
  const draft = player.draft;
  const round = Number(draft?.round);
  const pick = Number(draft?.pick);
  if (!Number.isFinite(round) || round <= 0 || !Number.isFinite(pick) || pick <= 0) return null;

  const branchDraft = [...(player.transactions ?? [])]
    .filter(transaction => transaction.type === 'draft' && Number(transaction.pickNum) > 0)
    .sort((left, right) => Number(right.season) - Number(left.season))[0];
  const year = Number(branchDraft?.season ?? draft?.year);
  const tid = Number(branchDraft?.tid ?? draft?.tid);
  if (!Number.isFinite(year) || year <= 0 || !Number.isFinite(tid)) return null;

  return { year, round, pick, tid };
}
