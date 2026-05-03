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

// ─── 2K-style checklist helpers (Phase A foundation) ───────────────────────
// Pure utilities for the AUFGABEN sidebar. Co-located here so all offseason
// metadata lives in one folder — no new files (keeps the tree uncluttered).

import type { OffseasonChecklist, OffseasonChecklistRow, OffseasonRowStatus, Tab } from '../../types';

/** Visual order of the checklist sidebar (matches NBA 2K MyGM "Aufgaben"). */
export const OFFSEASON_ROW_ORDER: readonly OffseasonChecklistRow[] = [
  'draftLottery',
  'options',
  'qualifyingOffers',
  'myFAs',
  'draft',
  'rookieContracts',
  'freeAgency',
  'trainingCamp',
] as const;

export const OFFSEASON_ROW_LABELS: Record<OffseasonChecklistRow, string> = {
  draftLottery:     'Draft Lottery',
  options:          'Team / Player Options',
  qualifyingOffers: 'Qualifying Offers',
  myFAs:            'My Free Agents',
  draft:            'NBA Draft',
  rookieContracts:  'Rookie Contracts',
  freeAgency:       'Free Agency',
  trainingCamp:     'Training Camp',
};

export const OFFSEASON_ROW_DESCRIPTIONS: Record<OffseasonChecklistRow, string> = {
  draftLottery:     'Watch the lottery draw to set this year\'s draft order.',
  options:          'Decide which team options to exercise and review player option outcomes.',
  qualifyingOffers: 'Submit qualifying offers to make eligible players restricted free agents.',
  myFAs:            'Review the players whose contracts have expired and where they stand.',
  draft:            'Run the NBA Draft and select your rookies.',
  rookieContracts:  'Sign your drafted rookies to their first NBA contracts.',
  freeAgency:       'Negotiate with free agents over the 13-day signing window.',
  trainingCamp:     'Set your training camp drills and finalize your opening-night roster.',
};

/** Where each row navigates when "Enter Phase" is clicked. */
export const OFFSEASON_ROW_TAB: Record<OffseasonChecklistRow, Tab> = {
  draftLottery:     'Draft Lottery',
  options:          'Team Office',
  qualifyingOffers: 'Team Office',
  myFAs:            'Team Office',
  draft:            'Draft Board',
  rookieContracts:  'Team Office',
  freeAgency:       'Team Office',
  trainingCamp:     'Training Center',
};

/** Default — every row 'pending'. Created when offseason begins. */
export function defaultOffseasonChecklist(): OffseasonChecklist {
  return {
    draftLottery:     'pending',
    options:          'pending',
    qualifyingOffers: 'pending',
    myFAs:            'pending',
    draft:            'pending',
    rookieContracts:  'pending',
    freeAgency:       'pending',
    trainingCamp:     'pending',
  };
}

/** First non-completed row. Drives the header CTA's label. Null = all done. */
export function firstUnfinishedRow(checklist: OffseasonChecklist | undefined): OffseasonChecklistRow | null {
  if (!checklist) return null;
  for (const row of OFFSEASON_ROW_ORDER) {
    const status = checklist[row];
    if (status === 'pending' || status === 'in-progress') return row;
  }
  return null;
}

/** All rows resolved (done or skipped). */
export function isChecklistComplete(checklist: OffseasonChecklist | undefined): boolean {
  if (!checklist) return false;
  return OFFSEASON_ROW_ORDER.every(row => {
    const s = checklist[row];
    return s === 'done' || s === 'skipped';
  });
}

/** Update one row immutably. */
export function setRowStatus(
  checklist: OffseasonChecklist | undefined,
  row: OffseasonChecklistRow,
  status: OffseasonRowStatus,
): OffseasonChecklist {
  const base = checklist ?? defaultOffseasonChecklist();
  return { ...base, [row]: status };
}
