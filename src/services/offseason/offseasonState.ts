/**
 * Offseason orchestrator — Session 1 (instrumentation only, no behavior change).
 *
 * Why this exists: post-draft → Oct 1 is the highest-bug-density window in the
 * codebase. Five+ systems (faMarketTicker, AIFreeAgentHandler passes 1-5,
 * runAIBirdRightsResigns, autoResolvers, externalLeagueSustainer, seasonRollover)
 * each derive "where are we in the offseason" from raw `state.date` plus their
 * own date-math helpers. When two systems disagree about the boundary, behavior
 * breaks at the seam — see CHANGELOG sessions 41-51 for the patch trail.
 *
 * This file is the FIRST step of a refactor that will collapse those into one
 * orchestrator. For now it only exposes the derived phase + a throttled drift
 * warning helper. No system's behavior changes — we just log when a system
 * fires in a phase where the orchestrator design would say it shouldn't.
 *
 * After a play-through, the warnings will tell us exactly which races still
 * exist before Session 2 moves dispatch into the orchestrator itself.
 */

import {
  getDraftDate,
  getCurrentOffseasonEffectiveFAStart,
  getCurrentOffseasonFAMoratoriumEnd,
  getTrainingCampDate,
  getOpeningNightDate,
  parseGameDate,
  toISODateString,
} from '../../utils/dateUtils';

/** Single source-of-truth phase enum for the post-draft → preseason window.
 *  `inSeason` is the catch-all for anything that isn't an offseason phase
 *  (regular season, play-in, playoffs, lottery — the orchestrator doesn't
 *  need to subclassify those, it only cares about the offseason boundary).
 */
export type OffseasonPhase =
  | 'inSeason'      // Opening night → Finals end (orchestrator inactive)
  | 'preDraft'      // Finals end → draft day-1 (lottery + post-Finals window)
  | 'draftDay'      // Draft date exactly (commissioner or auto-run)
  | 'postDraft'     // Draft+1 → effective FA start - 1 (rookie deals seal)
  | 'moratorium'    // FA start → FA start + faMoratoriumDays-1 (verbal only)
  | 'birdRights'    // First open day after moratorium ends (1 day, incumbent re-signs)
  | 'openFA'        // birdRights+1 → trainingCamp - 1 (broad market)
  | 'preCamp';      // trainingCamp → opening night - 1 (camp/exhibitions, late signings)

export interface OffseasonState {
  phase: OffseasonPhase;
  /** YYYY-MM-DD of `current` (normalized). */
  dateStr: string;
  /** YYYY-MM-DD of the season's draft date. */
  draftDateStr: string;
  /** YYYY-MM-DD of the FA start (rollover-adjusted). */
  faStartStr: string;
  /** YYYY-MM-DD of the day after the moratorium (first signing day). */
  moratoriumEndStr: string;
  /** YYYY-MM-DD of training camp open. */
  trainingCampStr: string;
  /** YYYY-MM-DD of next opening night. */
  openingNightStr: string;
  /** True ⇒ FA market signings are legal today (any FA-write phase). */
  faSigningsLegal: boolean;
}

interface PhaseSignals {
  /** Pass `state.draftComplete` so an early-finished draft flips to postDraft. */
  draftComplete?: boolean;
  /** Pass `true` if any playoff series is non-complete and unfinished games
   *  remain. Used to distinguish in-season vs preDraft when draft is past. */
  playoffsActive?: boolean;
}

type ScheduleDateLike = {
  date?: string;
  isPlayoff?: boolean;
  isPlayIn?: boolean;
};

type LeagueStatsLike = {
  year?: number;
  draftMonth?: number;
  draftDay?: number;
  faStartMonth?: number;
  faStartDay?: number;
  faMoratoriumDays?: number;
  trainingCampMonth?: number;
  trainingCampDay?: number;
  numGamesPlayoffSeries?: number[];
};

/** Derive the current offseason phase. Behavior-preserving — no side effects.
 *
 *  All boundary dates come from existing `dateUtils` helpers so this matches
 *  what every other system in the codebase already computes. The point of
 *  centralizing here is to give callers a SINGLE phase value to agree on
 *  instead of each one re-deriving from raw bits.
 */
export function getOffseasonState(
  date: string | Date,
  leagueStats: LeagueStatsLike,
  schedule?: ScheduleDateLike[],
  signals?: PhaseSignals,
): OffseasonState {
  const c = parseGameDate(date);
  const ls = leagueStats;
  const cMonth = c.getUTCMonth() + 1;
  const cYear = c.getUTCFullYear();

  // Pick the right "draft season" — Jan-Jun is the upcoming draft (ls.year),
  // Jul-Dec is the previous draft (ls.year was already rolled, so the last
  // draft happened in the calendar year of `current`).
  const lsYear = ls.year ?? cYear;
  const draftSeasonYear = cMonth >= 7 ? cYear : lsYear;

  const draftDate = getDraftDate(draftSeasonYear, ls);
  const effectiveFAStart = getCurrentOffseasonEffectiveFAStart(c, ls, schedule);
  const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(c, ls, schedule);
  const trainingCamp = getTrainingCampDate(lsYear, ls);
  const openingNight = getOpeningNightDate(lsYear);

  const dateStr = toISODateString(c);
  const draftDateStr = toISODateString(draftDate);
  const faStartStr = toISODateString(effectiveFAStart);
  const moratoriumEndStr = toISODateString(moratoriumEnd);
  const trainingCampStr = toISODateString(trainingCamp);
  const openingNightStr = toISODateString(openingNight);

  let phase: OffseasonPhase;
  // Order matters — most specific first. Keep this readable; the orchestrator
  // refactor will replace it with explicit transitions, but for now the date
  // ladder mirrors what existing code paths assume.
  if (dateStr >= openingNightStr) {
    phase = 'inSeason';
  } else if (dateStr >= trainingCampStr) {
    phase = 'preCamp';
  } else if (dateStr > moratoriumEndStr) {
    phase = 'openFA';
  } else if (dateStr === moratoriumEndStr) {
    phase = 'birdRights';
  } else if (dateStr >= faStartStr) {
    phase = 'moratorium';
  } else if (dateStr > draftDateStr) {
    phase = 'postDraft';
  } else if (dateStr === draftDateStr) {
    phase = signals?.draftComplete ? 'postDraft' : 'draftDay';
  } else {
    // dateStr < draftDateStr — either still in-season or post-Finals lottery window.
    // Without a playoffs signal we conservatively call it inSeason; the orchestrator
    // doesn't gate anything on preDraft yet so the distinction is purely diagnostic.
    phase = signals?.playoffsActive === false && dateStr >= `${cYear}-06-15`
      ? 'preDraft'
      : 'inSeason';
  }

  const faSigningsLegal =
    phase === 'birdRights' || phase === 'openFA' || phase === 'preCamp';

  return {
    phase,
    dateStr,
    draftDateStr,
    faStartStr,
    moratoriumEndStr,
    trainingCampStr,
    openingNightStr,
    faSigningsLegal,
  };
}

// ─── Drift warning helper ──────────────────────────────────────────────────
// Throttled by `${caller}:${phase}` so a daily tick doesn't flood the console.

const DRIFT_WARN_THROTTLE_MS = 5_000;
const lastWarnedAt = new Map<string, number>();

/** Log a one-line console.warn when `caller` runs in a phase outside its
 *  allowed set. Throttled so a daily-tick caller doesn't spam.
 *
 *  Returns true if a warning was emitted (useful for tests).
 */
export function logOffseasonDrift(
  caller: string,
  allowedPhases: readonly OffseasonPhase[],
  actual: OffseasonPhase,
  extra?: string,
): boolean {
  if (allowedPhases.includes(actual)) return false;

  const key = `${caller}:${actual}`;
  const now = Date.now();
  const last = lastWarnedAt.get(key) ?? 0;
  if (now - last < DRIFT_WARN_THROTTLE_MS) return false;
  lastWarnedAt.set(key, now);

  console.warn(
    `[OSPLAN] DRIFT ${caller} fired in phase=${actual} (allowed: ${allowedPhases.join('|')})` +
      (extra ? ` ${extra}` : ''),
  );
  return true;
}

/** Reset throttle state — exposed for tests, not used in production paths. */
export function _resetDriftThrottle(): void {
  lastWarnedAt.clear();
}
