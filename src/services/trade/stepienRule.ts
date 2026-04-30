import type { DraftPick } from '../../types';

/**
 * Stepien Rule — NBA prohibition: a team cannot trade its 1st-round pick if
 * doing so would leave it without a 1st in any two CONSECUTIVE future drafts.
 *
 * Evaluates the post-trade pick ledger for both sides and flags any team that
 * ends up with two back-to-back future seasons holding zero owned 1sts.
 */
export function validateStepienRule(
  allDraftPicks: DraftPick[],
  currentYear: number,
  tradableSeasons: number,
  tidA: number,
  tidB: number,
  picksFromA: DraftPick[],
  picksFromB: DraftPick[],
): { ok: true } | { ok: false; reason: string; offendingTid: number } {
  const fromAIds = new Set(picksFromA.map(p => p.dpid));
  const fromBIds = new Set(picksFromB.map(p => p.dpid));

  // Synthesize the post-trade ledger: every pick that was leaving A now lives
  // on B (and vice versa); everything else is unchanged. We only care about
  // round-1, future-season picks for the two trade participants.
  const horizon = currentYear + Math.max(1, tradableSeasons);

  const owns = (tid: number, season: number): boolean => {
    for (const pick of allDraftPicks) {
      if (pick.round !== 1 || pick.season !== season) continue;
      let owner = pick.tid;
      if (fromAIds.has(pick.dpid)) owner = tidB;
      else if (fromBIds.has(pick.dpid)) owner = tidA;
      if (owner === tid) return true;
    }
    return false;
  };

  for (const tid of [tidA, tidB]) {
    for (let y = currentYear + 1; y < horizon; y++) {
      if (!owns(tid, y) && !owns(tid, y + 1)) {
        return {
          ok: false,
          reason: `Stepien Rule: team would hold no 1st-round pick in ${y} or ${y + 1}.`,
          offendingTid: tid,
        };
      }
    }
  }
  return { ok: true };
}

/**
 * Per-team variant: would this single team violate Stepien if it gave away the
 * supplied set of picks? Used to gate individual pick chips in trade UIs so the
 * user can't even add a pick whose inclusion would break the rule.
 */
export function wouldStepienViolateForTid(
  allDraftPicks: DraftPick[],
  currentYear: number,
  tradableSeasons: number,
  tid: number,
  picksLeavingTid: DraftPick[],
): boolean {
  const leavingIds = new Set(picksLeavingTid.map(p => p.dpid));
  const horizon = currentYear + Math.max(1, tradableSeasons);
  const owns = (season: number): boolean => {
    for (const pick of allDraftPicks) {
      if (pick.round !== 1 || pick.season !== season) continue;
      if (pick.tid !== tid) continue;
      if (leavingIds.has(pick.dpid)) continue;
      return true;
    }
    return false;
  };
  for (let y = currentYear + 1; y < horizon; y++) {
    if (!owns(y) && !owns(y + 1)) return true;
  }
  return false;
}
