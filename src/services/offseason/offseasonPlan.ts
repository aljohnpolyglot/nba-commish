/**
 * Offseason orchestrator — Session 2 (shadow plan, no behavior change).
 *
 * Builds on Session 1 (offseasonState.ts). Where `getOffseasonState` says
 * "what phase are we in", `getOffseasonDayPlan` says "what each subsystem
 * SHOULD do today".
 *
 * Used by simulationHandler.ts as a SHADOW reference: existing inline date
 * logic still drives behavior, but we compute the plan alongside and log
 * disagreements. After a play-through with no disagreements, Session 3
 * can swap authority to the plan and delete the inline gates.
 *
 * Why this matters: today the dispatch decisions are spread across ~5 files
 * (simulationHandler, lazySimRunner, autoResolvers, gameLogic, faMarketTicker
 * itself). Each has its own date math. Bugs happen at the seams. The plan
 * struct is the single source of truth for "what runs today" — once it owns
 * dispatch, the seams disappear.
 */

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
  const lsYear: number = ls?.year ?? 2026;
  const { month: simMonth, day: simDayNum } = state.date
    ? getGameDateParts(state.date)
    : { month: 1, day: 1 };

  // ── Frequency throttle (matches existing simulationHandler tapering) ──
  // July daily → August biweekly → September weekly → off-season biweekly.
  // Kept identical to the inline logic so the shadow comparison stays clean.
  const faFrequency =
    simMonth === 7 ? 1
    : simMonth === 8 && simDayNum <= 15 ? 2
    : simMonth === 8 ? 4
    : simMonth === 9 ? 7
    : 14;

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

  // Rollover-already-happened detection: post-rollover, leagueStats.year has
  // already been incremented. We replicate `shouldFireRollover` here directly
  // (date >= rolloverDate) because the rolloverDate may slide into July when
  // playoffs overrun, and a phase-only proxy can disagree on those days.
  const rolloverDateStr = toISODateString(
    getRolloverDate(lsYear, ls, state.schedule as any),
  );
  const rolloverAlreadyHappened = os.dateStr < rolloverDateStr
    ? false
    : os.phase === 'moratorium' ||
      os.phase === 'birdRights' ||
      os.phase === 'openFA' ||
      os.phase === 'preCamp' ||
      os.phase === 'inSeason';

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

/** Reset trace dedupe — exposed for tests. */
export function _resetPlanTrace(): void {
  planTraceLastEmittedKey.clear();
}

// ─── Shadow-compare helper ─────────────────────────────────────────────────
// Used by simulationHandler.ts to log when an existing inline gate disagrees
// with the plan. Throttled by the same mechanism as logOffseasonDrift.

const SHADOW_WARN_THROTTLE_MS = 5_000;
const lastShadowWarnAt = new Map<string, number>();

/** Log when actual subsystem dispatch disagrees with the plan.
 *  `subsystem` identifies which action (e.g., 'tickFAMarkets').
 *  Throttled by `${subsystem}:${planned}:${actual}` so a daily disagreement
 *  doesn't spam the console. */
export function shadowCompare(
  subsystem: keyof OffseasonDayPlan['actions'],
  planned: PlanAction,
  actuallyFired: boolean,
  plan: OffseasonDayPlan,
): boolean {
  const actual: PlanAction = actuallyFired ? 'fire' : 'skip';
  if (planned === actual) return false;

  const key = `${subsystem}:${planned}:${actual}`;
  const now = Date.now();
  const last = lastShadowWarnAt.get(key) ?? 0;
  if (now - last < SHADOW_WARN_THROTTLE_MS) return false;
  lastShadowWarnAt.set(key, now);

  console.warn(
    `[OSPLAN] SHADOW-DRIFT ${subsystem}: planned=${planned} actual=${actual} ` +
      `(phase=${plan.state.phase}, ${plan.reason})`,
  );
  return true;
}

/** Reset throttle — exposed for tests. */
export function _resetShadowThrottle(): void {
  lastShadowWarnAt.clear();
}
