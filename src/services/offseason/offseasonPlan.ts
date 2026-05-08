// Single source of truth for "what should each offseason subsystem do today".
// Where getOffseasonState answers the phase, getOffseasonDayPlan answers the
// per-subsystem fire/skip decision so dispatch logic stays in one place
// instead of being re-derived across simulationHandler / lazySimRunner / etc.

import type { GameState } from '../../types';
import { getOffseasonState, type OffseasonState } from './offseasonState';
import { getGameDateParts, getRolloverDate, toISODateString } from '../../utils/dateUtils';

export type PlanAction = 'fire' | 'skip';

export interface OffseasonDayPlan {
  /** Underlying derived phase + boundary dates. */
  state: OffseasonState;

  /** What each subsystem should do today. */
  actions: {
    /** seasonRollover.applySeasonRollover — fires once at the rollover boundary. */
    rollover: PlanAction;
    /** faMarketTicker.tickFAMarkets — open + resolve daily during FA window. */
    tickFAMarkets: PlanAction;
    /** AIFreeAgentHandler.runAIFreeAgencyRound — Passes 1-5 (best-fit/2W/NG/fill/floor). */
    runAIFAPass: PlanAction;
    /** simulationHandler.applyBirdRightsResignsPass (wraps runAIBirdRightsResigns).
     *  Fires once per league year on the first post-moratorium day. */
    runBirdRightsPass: PlanAction;
  };

  /** Throttle for the AI FA pass — daily during peak July, biweekly off-season. */
  faFrequency: number;

  /** Human-readable explanation of why this plan was produced. */
  reason: string;

  /** Computed flags downstream consumers may want. */
  flags: {
    isFreeAgencySeason: boolean;
    moratoriumActive: boolean;
    underMinRoster: boolean;
    birdRightsAlreadyRanThisYear: boolean;
    rolloverAlreadyHappened: boolean;
  };
}

/**
 * Compute today's offseason day plan from current state.
 *
 * Pure function — no side effects, deterministic. Reads `state.date`,
 * `state.leagueStats`, `state.players`, `state.teams`, `state.schedule`,
 * `state.faBidding`. Does not mutate.
 */
export function getOffseasonDayPlan(state: GameState): OffseasonDayPlan {
  const os = getOffseasonState(
    state.date,
    state.leagueStats as any,
    state.schedule as any,
  );

  const ls = state.leagueStats as any;
  const lsYear: number = ls?.year ?? new Date().getFullYear();
  const { month: simMonth, day: simDayNum } = state.date
    ? getGameDateParts(state.date)
    : { month: 1, day: 1 };

  // July daily → August biweekly → September weekly → off-season biweekly.
  // Kept identical to the inline simulationHandler tapering.
  const faFrequency = (() => {
    if (simMonth === 7) return 1;
    if (simMonth === 8 && simDayNum <= 15) return 2;
    if (simMonth === 8) return 4;
    if (simMonth === 9) return 7;
    return 14;
  })();

  // ── State-derived flags ──────────────────────────────────────────────
  const minRosterSetting: number = ls?.minPlayersPerTeam ?? 14;
  const underMinRoster = (state.teams ?? []).some((t: any) => {
    const count = (state.players ?? []).filter(
      (p: any) => p.tid === t.id && !p.twoWay,
    ).length;
    return count < minRosterSetting;
  });

  const birdRightsAlreadyRanThisYear =
    ls?.birdRightsResignPassYear === lsYear;

  // Rollover-already-happened detection — uses ls.year increment as the
  // SOLE signal, NOT phase. Phase is derived from calendar date alone, so
  // once the calendar crosses Jul 7 (moratorium end), phase becomes 'openFA'
  // regardless of whether ls.year was actually incremented. The previous
  // phase-based check returned true here even for orphan saves where
  // rollover never fired — blocking the trigger forever.
  //
  // Correct semantics: rollover should fire iff
  //   (a) calendar date is at/past rolloverDate, AND
  //   (b) ls.year has not yet been bumped to the post-rollover value.
  // The post-rollover ls.year for THIS calendar offseason is cYear+1
  // (since BBGM convention: ls.year = year season ENDS, and rollover at
  // Jun 30 cYear ends the cYear-season, advancing ls.year to cYear+1).
  const rolloverDateStr = toISODateString(
    getRolloverDate(lsYear, ls, state.schedule as any),
  );
  // Calendar year from os.dateStr (YYYY-MM-DD) — the year the calendar
  // currently sits in. After rollover for THIS calendar's summer, ls.year
  // should have advanced to (cYear + 1).
  const cYear = parseInt(os.dateStr.slice(0, 4), 10);
  const rolloverAlreadyHappened = os.dateStr < rolloverDateStr
    ? false
    : (lsYear >= (cYear + 1));

  // FA-season detection: matches `simulationHandler`'s `isFreeAgencySeason`
  // exactly. Summer = Jul-Sep (after effective FA start), in-season = Oct-Feb.
  // Phase membership is the cleaner check, but we keep the month-based fallback
  // for in-season parity since waiver-wire activity stretches Oct → Feb.
  const isFreeAgencySeason =
    os.phase === 'moratorium' ||
    os.phase === 'birdRights' ||
    os.phase === 'openFA' ||
    os.phase === 'preCamp' ||
    (os.phase === 'inSeason' && (simMonth >= 10 || simMonth <= 2));

  const moratoriumActive = os.phase === 'moratorium';

  // ── Action decisions ─────────────────────────────────────────────────
  // Each action mirrors the existing inline gate in simulationHandler 1:1
  // so swapping authority in Session 3 is behavior-preserving. Where
  // simulationHandler uses date arithmetic, we use the phase + state.day
  // throttle here.
  const dayCounter: number = (state as any)?.day ?? 0;

  const actions: OffseasonDayPlan['actions'] = {
    // shouldFireRollover === (date >= rolloverDate) AND year not yet incremented.
    // Year-increment is implicit in `rolloverAlreadyHappened` (post-rollover, the
    // phase moves into moratorium/openFA based on the new year's calendar).
    rollover: os.dateStr >= rolloverDateStr && !rolloverAlreadyHappened
      ? 'fire'
      : 'skip',

    // FA market ticks every day during FA-active window — including moratorium
    // (the ticker itself suppresses signings during moratorium, just opens
    // markets and resolves expired ones).
    tickFAMarkets: isFreeAgencySeason ? 'fire' : 'skip',

    // AI FA round = isFA && !moratorium && (cadence-met || underMinRoster).
    // Cadence: state.day % faFrequency === 0. Daily in July, biweekly off-season.
    // The underMinRoster bypass forces a fill regardless of cadence (immediate
    // refill after a salary-dump trade).
    runAIFAPass: isFreeAgencySeason && !moratoriumActive && (dayCounter % faFrequency === 0 || underMinRoster)
      ? 'fire'
      : 'skip',

    // Bird Rights — fires once per league year on a July non-moratorium day.
    // Inline gate: isFA && simMonth === 7 && !moratorium && passYear !== ls.year.
    // Plan equivalent: month is July (phase 'birdRights' or early 'openFA' both
    // qualify in July) AND not moratorium AND not yet ran this year.
    runBirdRightsPass: isFreeAgencySeason && simMonth === 7 && !moratoriumActive && !birdRightsAlreadyRanThisYear
      ? 'fire'
      : 'skip',
  };

  const reason = `phase=${os.phase}, isFA=${isFreeAgencySeason}, moratorium=${moratoriumActive}, ` +
    `underMin=${underMinRoster}, birdAlready=${birdRightsAlreadyRanThisYear}, freq=${faFrequency}`;

  // [OSPLAN] single-tag tracing — grep this prefix to see every offseason
  // dispatch decision in chronological order. Throttled per phase so daily
  // ticks in the same phase only emit one line per phase.
  emitPlanTrace(os.phase, os.dateStr, actions, reason);

  return {
    state: os,
    actions,
    faFrequency,
    reason,
    flags: {
      isFreeAgencySeason,
      moratoriumActive,
      underMinRoster,
      birdRightsAlreadyRanThisYear,
      rolloverAlreadyHappened,
    },
  };
}

// ─── [OSPLAN] tracing ──────────────────────────────────────────────────────
// Single grep tag: every offseason dispatch decision logs `[OSPLAN]` so the
// user can search for one identifier and see the full timeline. Throttled
// per (phase, date) so a multi-day batch with the same phase doesn't spam.

const planTraceLastEmittedKey = new Map<string, string>();

function emitPlanTrace(
  phase: string,
  dateStr: string,
  actions: OffseasonDayPlan['actions'],
  reason: string,
): void {
  // De-dup: only log when phase or date changes (suppress the "same plan twice
  // in one tick" noise from rollover-then-bird-rights chained calls).
  const key = `${phase}:${dateStr}:${actions.rollover}:${actions.tickFAMarkets}:${actions.runAIFAPass}:${actions.runBirdRightsPass}`;
  const last = planTraceLastEmittedKey.get('any') ?? '';
  if (last === key) return;
  planTraceLastEmittedKey.set('any', key);

  const fired = Object.entries(actions)
    .filter(([, v]) => v === 'fire')
    .map(([k]) => k)
    .join(',') || 'none';
  console.log(`[OSPLAN] phase=${phase} date=${dateStr} fire=${fired} ${reason}`);
}

/** Log a one-off [OSPLAN] event from outside the plan — call this from any
 *  callsite that wants to mark its decision in the searchable timeline.
 *  Examples: lazySimRunner rollover dispatch, externalLeagueSustainer Oct 1
 *  routing, autoResolvers offseason events. */
export function logPlanEvent(caller: string, action: 'fire' | 'skip', extra?: string): void {
  console.log(`[OSPLAN] ${caller} ${action}${extra ? ' ' + extra : ''}`);
}


