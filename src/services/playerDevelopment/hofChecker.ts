/**
 * hofChecker.ts
 *
 * Hall of Fame induction logic — called at season rollover AFTER retirement checks.
 *
 * Philosophy (mirrors real Naismith Hall of Fame):
 *  - 3-year waiting period between retirement and earliest induction ("first ballot")
 *  - Primary gate is career Win Shares (configurable threshold, default 50)
 *  - Accolade shortcuts: 2+ MVPs, 2+ Finals MVPs, or 3+ rings with ≥5 All-Stars auto-induct
 *  - After the waiting period, if WS + All-Star threshold is cleared → induction
 *  - Older unlucky candidates keep rolling forward each year until inducted or abandoned
 */

import type { NBAPlayer } from '../../types';
import { resolveSeasonDate, toISODateString } from '../../utils/dateUtils';

export const HOF_WAIT_YEARS = 3; // years between retirement and first-ballot eligibility

/**
 * Real-world Naismith HOF enshrinement ceremony falls on the first Saturday of
 * September. Uses the same resolveSeasonDate helper that AllStarWeekendOrchestrator
 * relies on — month=9, ordinal=1, day=Sat.
 *
 * Examples: 2025 → '2025-09-06', 2026 → '2026-09-05', 2027 → '2027-09-04'.
 */
export function getHOFCeremonyDate(year: number): Date {
  return resolveSeasonDate(year, 9, 1, 'Sat', 0);
}

export function getHOFCeremonyDateString(year: number): string {
  return toISODateString(getHOFCeremonyDate(year));
}

export interface HOFInduction {
  playerId: string;
  name: string;
  age: number;
  inductionYear: number;
  careerWS: number;
  allStarAppearances: number;
  championships: number;
  mvps: number;
  firstBallot: boolean;
}

// ─── Career Win Shares ────────────────────────────────────────────────────────
/**
 * Sum regular-season win shares across the player's career.
 * Skips playoff rows. Missing ws values count as 0.
 *
 * @public — exported for UI preview (retirement watch, HOF eligibility indicator).
 */
export function careerWinShares(player: NBAPlayer): number {
  const stats = player.stats ?? [];
  let ws = 0;
  for (const s of stats) {
    if ((s as any).playoffs) continue;
    ws += (s as any).ws ?? 0;
  }
  return ws;
}

function countAward(player: NBAPlayer, type: string): number {
  return (player.awards ?? []).filter(a => a.type === type).length;
}

function countAwardIncludes(player: NBAPlayer, needle: string): number {
  return (player.awards ?? []).filter(a => a.type.includes(needle)).length;
}

// ─── Worthiness ───────────────────────────────────────────────────────────────
/**
 * Is this retired player worthy of the Hall of Fame?
 *
 * Two paths:
 *  1. **Auto-induct** (first-ballot lock): 2+ MVPs, 2+ Finals MVPs, or 3+ rings
 *     with star-level All-Star credentials.
 *  2. **Threshold path**: career WS ≥ threshold AND at least 3 All-Star nods
 *     (to filter out stat-compilers on bad teams).
 *
 * @public — exported so the UI can flag "HOF watch" players.
 */
export function isHOFWorthy(player: NBAPlayer, wsThreshold: number): boolean {
  const ws = careerWinShares(player);
  const allStars = countAward(player, 'All-Star');
  const mvps = countAward(player, 'Most Valuable Player');
  const fmvps = countAward(player, 'Finals MVP');
  const champs = countAward(player, 'Won Championship') + countAward(player, 'Champion');
  const dpoys = countAward(player, 'Defensive Player of the Year');

  // Auto-induct accolade paths
  if (mvps >= 2) return true;
  if (fmvps >= 2) return true;
  if (champs >= 3 && allStars >= 5) return true;
  if (mvps >= 1 && champs >= 1) return true;
  if (dpoys >= 2 && allStars >= 5) return true;

  // Threshold path — WS is the primary gate
  if (ws >= wsThreshold && allStars >= 3) return true;

  // Near-threshold with strong accolades
  if (ws >= wsThreshold * 0.8 && allStars >= 8) return true;

  return false;
}

/**
 * First-ballot = auto-induct path OR a clean top-tier resume.
 * These players go in the very first year they're eligible.
 */
export function isFirstBallot(player: NBAPlayer, wsThreshold: number): boolean {
  const ws = careerWinShares(player);
  const allStars = countAward(player, 'All-Star');
  const mvps = countAward(player, 'Most Valuable Player');
  const fmvps = countAward(player, 'Finals MVP');
  const champs = countAward(player, 'Won Championship') + countAward(player, 'Champion');

  if (mvps >= 2) return true;
  if (fmvps >= 2) return true;
  if (champs >= 3 && allStars >= 8) return true;
  if (ws >= wsThreshold * 2 && allStars >= 8) return true; // stats+longevity monster
  return false;
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Induct eligible retired players at season rollover.
 * Called AFTER runRetirementChecks and runFarewellTourChecks in seasonRollover.ts.
 *
 * Rules:
 *  - Skip players already inducted (hof === true).
 *  - Must be retired (status === 'Retired') with a known retiredYear.
 *  - Must have waited HOF_WAIT_YEARS seasons (retiredYear + 3 ≤ year).
 *  - Must pass isHOFWorthy() with the configured threshold.
 *
 * @param players      Post-retirement player list (retirees already tagged with retiredYear)
 * @param year         The season that just ended (induction year stamp)
 * @param wsThreshold  Career Win Shares threshold from GameSettings.hofWSThreshold
 */
export function runHOFChecks(
  players: NBAPlayer[],
  year: number,
  wsThreshold: number,
): { players: NBAPlayer[]; newInductees: HOFInduction[] } {
  const newInductees: HOFInduction[] = [];

  const updated = players.map(p => {
    if (p.hof) return p; // already inducted
    if ((p as any).status !== 'Retired') return p;
    const retiredYear = p.retiredYear;
    if (!retiredYear) return p;
    if (year < retiredYear + HOF_WAIT_YEARS) return p;
    if (!isHOFWorthy(p, wsThreshold)) return p;

    const ws = careerWinShares(p);
    const allStars = countAward(p, 'All-Star');
    const mvps = countAward(p, 'Most Valuable Player');
    const champs = countAward(p, 'Won Championship') + countAward(p, 'Champion');
    const age = p.born?.year ? (year - p.born.year) : 0;
    const firstBallot = year === retiredYear + HOF_WAIT_YEARS && isFirstBallot(p, wsThreshold);

    newInductees.push({
      playerId:           p.internalId,
      name:               p.name,
      age,
      inductionYear:      year,
      careerWS:           ws,
      allStarAppearances: allStars,
      championships:      champs,
      mvps,
      firstBallot,
    });

    console.log(
      `[HOF] ${p.name} inducted (class of ${year}) — WS ${ws.toFixed(1)}, ${allStars}× All-Star, ${champs}× Champion${firstBallot ? ' [FIRST BALLOT]' : ''}`
    );

    return {
      ...p,
      hof: true,
      hofInductionYear: year,
    } as NBAPlayer;
  });

  console.log(`[HOF] Class of ${year}: ${newInductees.length} inductee${newInductees.length === 1 ? '' : 's'} (WS threshold: ${wsThreshold})`);
  return { players: updated, newInductees };
}

// ─── Preview: who's eligible next rollover? ───────────────────────────────────
/**
 * Retired players who will be eligible at the next rollover (for "HOF watch" UI).
 * Returns the list of retirees who haven't been inducted yet AND clear the worthiness
 * bar — sorted by career WS descending.
 *
 * @public — used by HallofFameView for the "coming soon" panel.
 */
export function upcomingHOFCandidates(
  players: NBAPlayer[],
  currentYear: number,
  wsThreshold: number,
): Array<{ player: NBAPlayer; yearsUntilEligible: number; eligibleYear: number; careerWS: number; firstBallot: boolean }> {
  const out: Array<{ player: NBAPlayer; yearsUntilEligible: number; eligibleYear: number; careerWS: number; firstBallot: boolean }> = [];
  for (const p of players) {
    if (p.hof) continue;
    if ((p as any).status !== 'Retired') continue;
    if (!p.retiredYear) continue;
    if (!isHOFWorthy(p, wsThreshold)) continue;
    const eligibleYear = p.retiredYear + HOF_WAIT_YEARS;
    const yearsUntil = eligibleYear - currentYear;
    if (yearsUntil < 0) continue; // overdue — will be caught at next rollover
    out.push({
      player: p,
      yearsUntilEligible: yearsUntil,
      eligibleYear,
      careerWS: careerWinShares(p),
      firstBallot: isFirstBallot(p, wsThreshold),
    });
  }
  return out.sort((a, b) => b.careerWS - a.careerWS);
}
