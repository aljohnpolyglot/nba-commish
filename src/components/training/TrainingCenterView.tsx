import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Activity, RotateCcw } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { RosterView } from '../../TeamTraining/components/RosterView';
import { SystemProficiencyView } from '../../TeamTraining/components/SystemProficiencyView';
import { DailyPlanModal } from '../../TeamTraining/components/DailyPlanModal';
import { TrainingCalendarView } from './TrainingCalendarView';
import { TrainingDayView } from './TrainingDayView';
import { TrainingFranchisePicker } from './TrainingFranchisePicker';
import { DashboardStatusBar } from './DashboardStatusBar';
import { mapPlayerToK2 } from '../../TeamTraining/lib/playerMapping';
import { computeTeamProficiency } from '../../utils/coachSliders';
import { nbaPlayerToTrainingPlayer, nbaTeamToTrainingTeam } from '../../TeamTraining/adapters/fromGameState';
import { TRAINING_CALENDAR_VERSION } from '../../services/training/trainingScheduler';
import type { Allocations, TrainingParadigm, Staffing, ScheduleDay, DayType } from '../../TeamTraining/types';
import type { Game } from '../../types';

/**
 * Build a 30-day training calendar starting from the current sim date.
 * Honors the brainstormed scheduling philosophy from simulation.ts:
 *
 * Auto-Scheduling by Season Phase:
 * - Training Camp (Preseason): high intensity default, Full Training around scrimmages.
 * - Regular Season: balanced load mgmt, dynamically weaving practices around game days.
 * - Playoffs: opponent-specific film, walkthroughs, recovery. Minimal physical.
 * - Offseason: individual programs, rehab, zero team practices.
 *
 * Proximity Logic (Matchup & Back-to-Backs):
 * - Game day: Game.
 * - Day before a game: Shootaround.
 * - Second night of B2B: Game (mandatory zero practice that morning — implicit).
 * - Day after a B2B (i.e. day after the night-2 game): mandatory pure Recovery.
 * - Day after a single game (not B2B): Recovery Practice (active recovery, walkthrough).
 * - Otherwise (2+ days clear): Full Training (regular) / Off Day (Sunday rest).
 */
/** Parse a sim-date string permissively.
 *
 *  state.date in this codebase is *not* ISO — it's a locale-formatted string
 *  like "Nov 7, 2025" (see initialState.ts + the per-day toLocaleDateString
 *  setters). Naive `slice(0, 10)` gives "Nov 7, 202" which parses to Invalid
 *  Date and silently breaks every date comparison downstream.
 *
 *  Strategy: try `new Date(raw)` first — JS handles both ISO and "Mon D, YYYY"
 *  natively. Use local getters (getFullYear/Month/Date) so "Nov 7, 2025" lands
 *  on Nov 7 regardless of the user's timezone, then re-anchor at UTC midnight.
 */
function parseSimDate(dateStr: string | undefined | null): Date {
  if (dateStr) {
    const direct = new Date(dateStr);
    if (!isNaN(direct.getTime())) {
      return new Date(Date.UTC(direct.getFullYear(), direct.getMonth(), direct.getDate()));
    }
  }
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Sunday (UTC midnight) of the week containing the parsed sim date. */
function sundayOf(dateStr: string | undefined | null): Date {
  const out = parseSimDate(dateStr);
  out.setUTCDate(out.getUTCDate() - out.getUTCDay());
  return out;
}

/** Sim-date as canonical "YYYY-MM-DD" — what every downstream calendar
 *  consumer wants. Null-safe. */
function toIsoDay(dateStr: string | undefined | null): string {
  return parseSimDate(dateStr).toISOString().slice(0, 10);
}

// Derives season phase from a date via month-day windows (mirrors SEASON_DATES in src/constants.ts).
function phaseFromDate(d: Date): 'preseason' | 'regular' | 'playoffs' | 'offseason' {
  const m = d.getMonth() + 1; // 1-12
  const day = d.getDate();
  // Aug 15 – Oct 23 → Training Camp + Preseason
  if ((m === 8 && day >= 15) || m === 9 || (m === 10 && day <= 23)) return 'preseason';
  // Apr 16 – Jun 20 → Playoffs
  if ((m === 4 && day >= 16) || m === 5 || (m === 6 && day <= 20)) return 'playoffs';
  // Jun 21 – Aug 14 → Offseason / Draft / Free Agency
  if ((m === 6 && day >= 21) || m === 7 || (m === 8 && day <= 14)) return 'offseason';
  return 'regular';
}

/**
 * Build the visible calendar — one full calendar month (like the real game
 * schedule view at NBA Central). Cells carry day-of-month + weekday so the
 * grid can anchor them to Sun-Sat columns.
 */
function buildCalendar(
  schedule: Game[],
  teamId: number,
  /** ISO `YYYY-MM-DD` of the FIRST visible day (Sunday). buildCalendar walks
   *  exactly `days` cells from this anchor. */
  anchorISO: string,
  teamLookup: Map<number, { abbrev: string; logoUrl?: string }>,
  days: number = 28,
): ScheduleDay[] {
  const anchor = new Date(`${anchorISO}T00:00:00Z`);
  if (isNaN(anchor.getTime())) return [];

  // g.date is full ISO (`2025-10-07T20:00:00Z`); slice to `YYYY-MM-DD` so the
  // map lookup matches the day-keys used by every consumer.
  // Note: include played games too — past weeks (and freshly-switched teams
  // whose game history is mostly already-played) need to render the historical
  // matchups, not collapse to all-Off-Day.
  const teamGamesByISO = new Map<string, Game>();
  for (const g of schedule) {
    if (g.homeTid !== teamId && g.awayTid !== teamId) continue;
    if (g.isAllStar || g.isRisingStars || g.isCelebrityGame || g.isDunkContest || g.isThreePointContest) continue;
    const dateKey = (g.date ?? '').slice(0, 10);
    if (dateKey) teamGamesByISO.set(dateKey, g);
  }

  // Look one day BEHIND the anchor so the lastWasGame / B2B flags are seeded
  // correctly for cells right at the start of the visible window.
  const seedDay = new Date(anchor); seedDay.setUTCDate(anchor.getUTCDate() - 1);
  const seedSeed = new Date(anchor); seedSeed.setUTCDate(anchor.getUTCDate() - 2);
  const seedISO = seedDay.toISOString().slice(0, 10);
  const seedSeedISO = seedSeed.toISOString().slice(0, 10);
  let lastWasGame = teamGamesByISO.has(seedISO);
  let lastWasB2BGame2 = teamGamesByISO.has(seedISO) && teamGamesByISO.has(seedSeedISO);

  const result: ScheduleDay[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(anchor);
    d.setUTCDate(anchor.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const game = teamGamesByISO.get(iso);

    const nextDate = new Date(d); nextDate.setDate(d.getDate() + 1);
    const nextISO = nextDate.toISOString().slice(0, 10);
    const hasGameTomorrow = teamGamesByISO.has(nextISO);

    const phase = phaseFromDate(d);

    let activity: DayType = 'Off Day';
    let description = 'Player day off';
    let isB2B = false;

    if (game) {
      activity = 'Game';
      isB2B = lastWasGame;
      description = isB2B ? 'Back-to-back — night two' : 'Game day';
    } else {
      // All non-game cells render as Balanced Practice. Intensity in the saved
      // plan carries the load story (15% post-B2B, 25% pre/post-game, 50%
      // regular, 75% training camp). The cell visual reads identical whether
      // the plan was auto-set or user-set.
      activity = 'Balanced Practice';
      if (lastWasB2BGame2)         description = 'Light load — post B2B';
      else if (lastWasGame)        description = 'Light load — post-game';
      else if (hasGameTomorrow)    description = 'Light load — pre-game';
      else if (phase === 'offseason')  { activity = 'Off Day'; description = 'Offseason — individual development only'; }
      else if (phase === 'playoffs')   description = 'Film + walkthrough for next opponent';
      else if (phase === 'preseason')  description = 'Preseason training';
      else if (d.getUTCDay() === 0)    { activity = 'Off Day'; description = 'Sunday rest'; }
      else                              description = 'Balanced offensive / defensive sets';
    }

    let opponent: ScheduleDay['opponent'];
    if (game) {
      const isHome = game.homeTid === teamId;
      const oppTid = isHome ? game.awayTid : game.homeTid;
      // Playoff anticipation — when the opponent slot isn't locked yet (e.g. a
      // 7–10 seed waiting on play-in results), flag as TBD and let the cell
      // render the generic NBA logo instead of an unknown abbrev.
      const oppMeta = oppTid >= 0 ? teamLookup.get(oppTid) : undefined;
      const isTBD = oppTid < 0 || !oppMeta;
      opponent = {
        tid: oppTid,
        abbrev: isTBD ? 'TBD' : (oppMeta?.abbrev ?? ''),
        logoUrl: isTBD ? undefined : oppMeta?.logoUrl,
        isHome,
      };
    }

    result.push({
      day: d.getUTCDate(),
      hasGame: !!game,
      isB2B,
      activity,
      description,
      opponent,
      isoDate: iso,
      weekday: d.getUTCDay(),
    });
    lastWasB2BGame2 = isB2B;
    lastWasGame = !!game;
  }

  return result;
}

export const TrainingCenterView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const isGM = state.gameMode === 'gm';

  // GM mode default: user's team. GM can still navigate to other teams,
  // but those views are read-only (per TeamTraining.tsx:279 design doc).
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
    isGM && state.userTeamId != null ? state.userTeamId : null
  );

  const team = selectedTeamId != null ? state.teams.find(t => t.id === selectedTeamId) : null;
  const isReadOnly = isGM && selectedTeamId != null && selectedTeamId !== state.userTeamId;
  const leagueYear = state.leagueStats?.year ?? new Date().getFullYear();

  const trainingTeams = useMemo(() => state.teams.map(nbaTeamToTrainingTeam), [state.teams]);
  const roster = useMemo(() => {
    if (!team) return [];
    const teamPlayers = state.players.filter(p => p.tid === team.id && (p.status === 'Active' || !p.status));
    return teamPlayers.map(p =>
      nbaPlayerToTrainingPlayer(p, leagueYear, {
        team,
        dateStr: state.date,
        teamPlayers,
      }),
    );
  }, [state.players, team, leagueYear, state.date]);

  // Persistent daily plans live on NBATeam.trainingCalendar keyed by ISO date `YYYY-MM-DD`.
  const dailyPlansISO = (team?.trainingCalendar ?? {}) as Record<string, { intensity: number; paradigm: TrainingParadigm; allocations: Allocations; auto?: boolean }>;

  const [intensity] = useState(50);
  const [allocations] = useState<Allocations>({ offense: 30, defense: 30, conditioning: 20, recovery: 20 });
  const [staffing] = useState<Staffing>({});
  const [activeView, setActiveView] = useState<'training' | 'roster' | 'proficiency'>('training');
  const [selectedPlanDateISO, setSelectedPlanDateISO] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(state.date);
  const [viewMode, setViewMode] = useState<'calendar' | 'day' | 'watching'>('calendar');
  // Calendar anchor is the SUNDAY of the visible 4-week window. Initialized to
  // the Sunday of the current sim week. Falls back to *real now* if state.date
  // is missing/malformed — without this guard the calendar renders Invalid Date
  // and chevrons silently break (`Date < Date` is false when either side is NaN).
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => sundayOf(state.date));

  // Conditional schedule regen — when play-in / playoffs / NBA Cup games get
  // injected into state.schedule (post-Aug 14), the team's `trainingCalendar`
  // doesn't know about them yet. Watch schedule length and dispatch an autofill
  // for the active team when it grows. Cheap; preserves user overrides.
  const lastScheduleLenRef = useRef<number>(state.schedule?.length ?? 0);
  useEffect(() => {
    if (!team) return;
    const len = state.schedule?.length ?? 0;
    if (len > lastScheduleLenRef.current + 5) {
      // Significant growth → playoffs bracket / play-in / cup KO games injected.
      dispatchAction({ type: 'AUTOFILL_TEAM_TRAINING_CALENDAR', payload: { teamId: team.id } });
    }
    lastScheduleLenRef.current = len;
  }, [state.schedule?.length, team?.id, dispatchAction]);

  // Lazy-init + version migration: fires AUTOFILL when the calendar is empty
  // OR contains any auto-plan written by an older scheduler version (e.g. the
  // legacy "BAL · 15%" post-game cells from v1/v2). User-set plans (auto: false)
  // are preserved by autoGenerateTrainingCalendar regardless.
  useEffect(() => {
    if (!team) return;
    const cal = (team as any).trainingCalendar ?? {};
    const entries = Object.values(cal) as Array<{ auto?: boolean; version?: number }>;
    if (entries.length === 0) {
      dispatchAction({ type: 'AUTOFILL_TEAM_TRAINING_CALENDAR', payload: { teamId: team.id } });
      return;
    }
    const hasStale = entries.some(p => p && p.auto !== false && (p.version ?? 0) < TRAINING_CALENDAR_VERSION);
    if (hasStale) {
      dispatchAction({ type: 'AUTOFILL_TEAM_TRAINING_CALENDAR', payload: { teamId: team.id } });
    }
  }, [team?.id, dispatchAction]);

  // Snap visible window back to the current sim week ONLY on a genuine date
  // advance. Naive deps `[state.date, state.day]` re-fire on unrelated re-renders
  // and rip the user back when they're navigating history.
  const lastSimDateRef = useRef<string>(state.date);
  useEffect(() => {
    if (lastSimDateRef.current === state.date) return;
    lastSimDateRef.current = state.date;
    setSelectedDate(state.date);
    setWeekAnchor(sundayOf(state.date));
    setViewMode('calendar');
  }, [state.date]);

  // ISO of the first day of the visible 4-week window.
  const windowStartISO = useMemo(
    () => weekAnchor.toISOString().slice(0, 10),
    [weekAnchor]
  );

  // 28-day window derived from real state.schedule.
  const schedule = useMemo(() => {
    if (!team || !windowStartISO) return [];
    const lookup = new Map<number, { abbrev: string; logoUrl?: string }>();
    for (const t of state.teams) lookup.set(t.id, { abbrev: t.abbrev, logoUrl: t.logoUrl });
    return buildCalendar(state.schedule || [], team.id, windowStartISO, lookup, 28);
  }, [team, windowStartISO, state.schedule, state.teams]);

  // Map for O(1) ScheduleDay lookups by ISO date — feeds TrainingDayOverlay
  // so it can render auto-scheduled rest/recovery/practice badges.
  const scheduleByIso = useMemo(
    () => new Map(schedule.map(d => [d.isoDate, d])),
    [schedule]
  );

  // Hide-calendar logic — when there's literally no point training (offseason / FA
  // / playoff-eliminated mid-April), show a placeholder card instead of a screen
  // full of "Off Day" cells. The Roster + Systems tabs still work for player dev
  // settings.
  const dormantState = useMemo(() => {
    if (!team || !state.date) return null;
    const d = new Date(state.date);
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    // Offseason / Free Agency window — Jun 21 – Aug 14 inclusive.
    const inOffseason = (m === 6 && day >= 21) || m === 7 || (m === 8 && day <= 14);
    if (inOffseason) {
      return { reason: 'offseason' as const, label: 'Offseason — no team training', subtext: 'Players are on vacation, in Vegas Summer League, or signing FA deals. Training Center reopens Aug 15 (Training Camp).' };
    }
    // Playoffs phase — Apr 16 to Jun 20. If team isn't alive in the bracket, treat as offseason.
    const inPlayoffsPhase = (m === 4 && day >= 16) || m === 5 || (m === 6 && day <= 20);
    if (inPlayoffsPhase) {
      const playoffs: any = (state as any).playoffs;
      const aliveTids = new Set<number>();
      const teams: any[] = playoffs?.teams ?? playoffs?.bracket?.teams ?? [];
      for (const pt of teams) {
        const tid = pt?.tid ?? pt?.id;
        const eliminated = pt?.eliminated || pt?.outOfPlayoffs;
        if (typeof tid === 'number' && !eliminated) aliveTids.add(tid);
      }
      // Fallback: if we can't reliably introspect the bracket, assume alive.
      if (aliveTids.size > 0 && !aliveTids.has(team.id)) {
        return { reason: 'eliminated' as const, label: 'Season over — your team was eliminated', subtext: 'Players are recovering. Calendar reopens at Training Camp (Aug 15).' };
      }
    }
    return null;
  }, [team, state.date, state.playoffs]);
  const selectedDayData = selectedPlanDateISO ? schedule.find(d => d.isoDate === selectedPlanDateISO) : null;
  const selectedDayISO = selectedPlanDateISO;

  const dateInfo = useMemo(() => {
    // Header date should track the current sim date (top-left "DATE: …"),
    // while the month label tracks the chevron-driven view.
    const today = state.date ? new Date(state.date) : new Date();
    const monthLabelDate = windowStartISO ? new Date(windowStartISO) : today;
    return {
      currentDate: today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      displayMonth: monthLabelDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase(),
    };
  }, [state.date, windowStartISO]);

  const gamesForSelectedDate = useMemo(() => {
    const selectedNorm = (selectedDate ?? '').slice(0, 10);
    return (state.schedule ?? []).filter(g => (g.date ?? '').slice(0, 10) === selectedNorm);
  }, [state.schedule, selectedDate]);

  const selectedDateNorm = (selectedDate ?? '').slice(0, 10);
  const selectedDayForHeader = selectedDateNorm
    ? schedule.find(d => d.isoDate === selectedDateNorm)
    : undefined;

  // League-wide K2 rosters for `calculateCoachSliders` normalization. Heavy:
  // 30 teams × ~600 players × full K2 conversion. Two gates keep this off the
  // hot path:
  //   1. Lazy — only build when a consumer needs it (Systems tab open, or the
  //      DailyPlanModal is about to open). Otherwise return [] and bail.
  //   2. Stable deps — `state.date` is OUT. K2 ratings don't change daily, and
  //      mood-score (the only date-sensitive field) isn't read here. With date
  //      in deps the memo re-ran every sim day and made cell taps feel dead.
  const needAllRosters = activeView === 'proficiency' || selectedPlanDateISO !== null;
  const allK2Rosters = useMemo(() => {
    if (!needAllRosters) return [] as any[];
    return state.teams.map(t => {
      const tp = state.players.filter(p => p.tid === t.id && (p.status === 'Active' || !p.status))
        .map(p => nbaPlayerToTrainingPlayer(p, leagueYear, { team: t }));
      return tp.map(mapPlayerToK2) as any;
    });
  }, [needAllRosters, state.teams, state.players, leagueYear]);

  const top5Systems = useMemo(() => {
    // Same gate — top5Systems only feeds the modal, no point computing while closed.
    if (!needAllRosters || roster.length === 0) return [];
    const k2 = roster.map(mapPlayerToK2);
    const { sortedProfs } = computeTeamProficiency(k2 as any, allK2Rosters, team?.systemFamiliarity);
    return sortedProfs.slice(0, 5).map(([n]) => n);
  }, [needAllRosters, roster, team?.systemFamiliarity, allK2Rosters]);

  // Tracks the just-edited day so we can offer "Save as Default" propagation.
  // Captures the BEFORE-save plan so we know which auto-cells match for replacement.
  const [savedDefault, setSavedDefault] = useState<null | {
    oldPlan: { intensity: number; paradigm: TrainingParadigm; auto?: boolean } | undefined;
    newPlan: { intensity: number; paradigm: TrainingParadigm; allocations: Allocations };
    matchCount: number;
  }>(null);

  // Normal-Default editor — opens a DailyPlanModal-style sheet that lets the
  // user define what "every regular practice day" should look like. Save then
  // walks forward and stamps all upcoming auto-Balanced-50 cells (the
  // scheduler's regular-season default) with the user's preferences.
  const [normalDefaultOpen, setNormalDefaultOpen] = useState(false);
  const [normalDefaultDraft, setNormalDefaultDraft] = useState<{
    intensity: number;
    allocations: Allocations;
    paradigm: TrainingParadigm;
  }>(() => team?.normalDayDefault
    ? {
        intensity: team.normalDayDefault.intensity,
        allocations: team.normalDayDefault.allocations as Allocations,
        paradigm: team.normalDayDefault.paradigm as TrainingParadigm,
      }
    : {
        intensity: 50,
        paradigm: 'Balanced',
        allocations: { offense: 30, defense: 30, conditioning: 20, recovery: 20 },
      });

  // Re-hydrate when the picked team changes (commish browsing other rosters).
  useEffect(() => {
    if (team?.normalDayDefault) {
      setNormalDefaultDraft({
        intensity: team.normalDayDefault.intensity,
        allocations: team.normalDayDefault.allocations as Allocations,
        paradigm: team.normalDayDefault.paradigm as TrainingParadigm,
      });
    } else {
      setNormalDefaultDraft({
        intensity: 50,
        paradigm: 'Balanced',
        allocations: { offense: 30, defense: 30, conditioning: 20, recovery: 20 },
      });
    }
  }, [team?.id, team?.normalDayDefault]);

  const handleSavePlan = (i: number, a: Allocations, p: TrainingParadigm) => {
    if (!team || !selectedDayISO || isReadOnly) return;
    const oldPlan = (team.trainingCalendar as any)?.[selectedDayISO];
    dispatchAction({
      type: 'SET_TRAINING_DAILY_PLAN',
      payload: { teamId: team.id, dayKey: selectedDayISO, plan: { intensity: i, allocations: a, paradigm: p } },
    });

    // Offer "Save as Default" only when the user replaced an auto-cell. The old
    // plan being auto means it was a generic phase default (e.g. Balanced 50%
    // regular-season), and the user may want every future matching auto-cell to
    // adopt their new pick. A user-set day (auto: false) was a one-off — no prompt.
    if (oldPlan && oldPlan.auto !== false) {
      const cal = (team.trainingCalendar ?? {}) as Record<string, any>;
      const todayIso = toIsoDay(state.date);
      let matches = 0;
      for (const [iso, plan] of Object.entries(cal)) {
        if (iso < todayIso) continue;
        if (iso === selectedDayISO) continue;
        if (plan?.auto === false) continue;
        if (plan?.paradigm === oldPlan.paradigm && plan?.intensity === oldPlan.intensity) {
          matches++;
        }
      }
      if (matches > 0) {
        setSavedDefault({
          oldPlan: { intensity: oldPlan.intensity, paradigm: oldPlan.paradigm, auto: oldPlan.auto },
          newPlan: { intensity: i, allocations: a, paradigm: p },
          matchCount: matches,
        });
      }
    }
  };

  // Save the Normal-Default template. Walks every upcoming auto-cell that
  // currently holds a Balanced 50% (= scheduler's regular-season default) and
  // replaces it with the user's preferences. Pre-game, post-game, training
  // camp 75%, B2B-recovery 15%, etc. cells are NOT touched — only the regular
  // practice day pattern is. User-set days (auto: false) are also skipped.
  // Pending Normal-Default propagation prompt — fires after the user saves
  // the template. Persisting the template is unconditional; rewriting the
  // calendar only happens after explicit confirmation.
  const [normalDefaultPending, setNormalDefaultPending] = useState<null | {
    matchCount: number;
    template: { intensity: number; allocations: Allocations; paradigm: TrainingParadigm };
  }>(null);

  const handleSaveNormalDefault = (i: number, a: Allocations, p: TrainingParadigm) => {
    if (!team || isReadOnly) return;
    setNormalDefaultDraft({ intensity: i, allocations: a, paradigm: p });
    // Persist the template on the team so it survives reload + tab-switch.
    dispatchAction({
      type: 'SET_TRAINING_NORMAL_DEFAULT',
      payload: { teamId: team.id, template: { intensity: i, allocations: a, paradigm: p } },
    });
    // Count future auto-cells that match the scheduler's Balanced 50% default —
    // those are the candidates the user might want overwritten with their template.
    const cal = (team.trainingCalendar ?? {}) as Record<string, any>;
    const todayIso = toIsoDay(state.date);
    let matches = 0;
    for (const [iso, plan] of Object.entries(cal)) {
      if (iso < todayIso) continue;
      if (plan?.auto === false) continue;
      if (plan?.paradigm !== 'Balanced' || plan?.intensity !== 50) continue;
      matches++;
    }
    setNormalDefaultOpen(false);
    if (matches > 0) {
      setNormalDefaultPending({
        matchCount: matches,
        template: { intensity: i, allocations: a, paradigm: p },
      });
    }
  };

  // User confirmed — stamp every future auto Balanced 50% cell with the saved template.
  const applyNormalDefaultToFuture = () => {
    if (!normalDefaultPending || !team) return;
    const { template } = normalDefaultPending;
    const cal = (team.trainingCalendar ?? {}) as Record<string, any>;
    const todayIso = toIsoDay(state.date);
    for (const [iso, plan] of Object.entries(cal)) {
      if (iso < todayIso) continue;
      if (plan?.auto === false) continue;
      if (plan?.paradigm !== 'Balanced' || plan?.intensity !== 50) continue;
      dispatchAction({
        type: 'SET_TRAINING_DAILY_PLAN',
        payload: { teamId: team.id, dayKey: iso, plan: template },
      });
    }
    setNormalDefaultPending(null);
  };

  // Apply the just-saved plan to every future auto-cell that matches the old
  // plan's paradigm + intensity. Skips user-set days and game/empty days.
  const applyAsDefault = () => {
    if (!savedDefault || !team) return;
    const cal = (team.trainingCalendar ?? {}) as Record<string, any>;
    const todayIso = toIsoDay(state.date);
    for (const [iso, plan] of Object.entries(cal)) {
      if (iso < todayIso) continue;
      if (iso === selectedDayISO) continue;
      if (plan?.auto === false) continue;
      if (plan?.paradigm !== savedDefault.oldPlan?.paradigm) continue;
      if (plan?.intensity !== savedDefault.oldPlan?.intensity) continue;
      dispatchAction({
        type: 'SET_TRAINING_DAILY_PLAN',
        payload: {
          teamId: team.id,
          dayKey: iso,
          plan: { ...savedDefault.newPlan },
        },
      });
    }
    setSavedDefault(null);
  };

  const updateDevFocus = (playerId: string, focus: string) => {
    if (isReadOnly) return;
    dispatchAction({ type: 'SET_PLAYER_DEV_FOCUS', payload: { playerId, devFocus: focus } });
  };

  const updateMentor = (playerId: string, mentorId: string | undefined) => {
    if (isReadOnly) return;
    dispatchAction({ type: 'SET_PLAYER_MENTOR', payload: { playerId, mentorId: mentorId ?? null } });
  };

  const updateIndividualIntensity = (playerId: string, ii: 'Rest' | 'Half' | 'Normal' | 'Double') => {
    if (isReadOnly) return;
    dispatchAction({ type: 'SET_PLAYER_TRAINING_INTENSITY', payload: { playerId, intensity: ii } });
  };

  // Franchise picker — Training Center variant with slate panels and #FDB927 brand accent.
  // Commissioner: no default team. GM: defaults to user team but can browse others (read-only).
  if (!team) {
    return (
      <div className="bg-slate-950 min-h-full text-white">
        <header className="h-[60px] bg-[linear-gradient(to_bottom,#1a1a1a,#000)] flex items-center px-4 sm:px-10 border-b border-[#30363d] justify-between shrink-0 relative z-20">
          <div className="font-black text-xl sm:text-2xl tracking-widest uppercase">
            Training <span className="text-[#FDB927]">Center</span>
          </div>
          <div className="text-[10px] sm:text-xs uppercase tracking-widest text-slate-500 font-bold">
            Pick a franchise
          </div>
        </header>
        {/* Yellow accent strip — visual separation between header and picker body */}
        <div className="h-[3px] bg-gradient-to-r from-transparent via-[#FDB927]/60 to-transparent" />
        <div className="h-px bg-[#30363d]" />
        <TrainingFranchisePicker onSelectTeam={(teamId: number) => setSelectedTeamId(teamId)} />
      </div>
    );
  }

  const TABS: { id: typeof activeView; label: string }[] = [
    { id: 'training', label: 'Dashboard' },
    { id: 'roster', label: 'Roster' },
    { id: 'proficiency', label: 'Systems' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <header className="h-[60px] bg-[linear-gradient(to_bottom,#1a1a1a,#000)] flex items-center px-4 sm:px-10 border-b border-[#30363d] justify-between shrink-0 relative z-20">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            onClick={() => setSelectedTeamId(null)}
            className="font-black text-xl sm:text-2xl tracking-widest uppercase hover:text-[#FDB927] transition-colors"
            title="Back to franchise picker"
          >
            ←
          </button>
          <div className="font-black text-xl sm:text-2xl tracking-widest uppercase truncate">
            Training <span className="text-[#FDB927]">Center</span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-3 pl-3 border-l border-[#30363d]">
            <Activity size={12} className="text-[#FDB927]" />
            {team.name} · {dateInfo.currentDate}
          </div>
          {isReadOnly && (
            <div className="hidden md:flex items-center gap-1.5 ml-3 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30">
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">View Only</span>
            </div>
          )}
        </div>

        <select
          className="bg-[#1a1a1a] border border-[#30363d] text-white rounded-md px-3 py-1.5 text-xs uppercase tracking-wide outline-none focus:border-[#FDB927]"
          value={team.id}
          onChange={e => setSelectedTeamId(Number(e.target.value))}
        >
          {state.teams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </header>

      <div className="border-b border-[#30363d] bg-[#0a0a0a] px-4 sm:px-10">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map(t => {
            const isActive = activeView === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveView(t.id)}
                className={`relative px-4 sm:px-6 py-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap ${
                  isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t.label}
                {isActive && (
                  <>
                    <div className="absolute -bottom-[1px] left-0 w-full h-[2px] bg-white" />
                    <div className="absolute -bottom-[3px] left-0 w-full h-[3px] bg-[#FDB927]" />
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {activeView === 'training' && dormantState ? (
            <div className="bg-black border border-slate-800 rounded-3xl p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FDB927]/10 border border-[#FDB927]/30 mb-4">
                <Activity size={28} className="text-[#FDB927]" />
              </div>
              <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight mb-2">
                {dormantState.label}
              </h2>
              <p className="text-xs md:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                {dormantState.subtext}
              </p>
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-6">
                Roster + Systems tabs remain editable
              </p>
            </div>
          ) : activeView === 'training' && (
            <>
              {/* Quick-Status + Preset Bar */}
              <DashboardStatusBar
                team={team}
                today={toIsoDay(state.date)}
                isReadOnly={isReadOnly}
                onApplyNormalDefault={() => setNormalDefaultOpen(true)}
              />
              {viewMode === 'day' ? (
              <TrainingDayView
                team={team}
                date={selectedDate}
                scheduleDay={selectedDayForHeader}
                userPlan={dailyPlansISO[selectedDateNorm]}
                gamesForDate={gamesForSelectedDate}
                state={state}
                isReadOnly={isReadOnly}
                onBack={() => setViewMode('calendar')}
                onEditPlan={() => setSelectedPlanDateISO(selectedDateNorm)}
              />
            ) : (
              <TrainingCalendarView
                team={team}
                scheduleByIso={scheduleByIso}
                dailyPlansISO={dailyPlansISO}
                weekAnchor={weekAnchor}
                setWeekAnchor={setWeekAnchor}
                selectedDate={selectedDate}
                currentDateISO={toIsoDay(state.date)}
                isReadOnly={isReadOnly}
                onCellClick={(iso, scheduleDay) => {
                  setSelectedDate(`${iso}T00:00:00.000Z`);
                  if (scheduleDay?.activity === 'Game') {
                    setViewMode('day');
                  } else if (!isReadOnly) {
                    setSelectedPlanDateISO(iso);
                  }
                }}
              />
              )}
            </>
          )}

          {activeView === 'roster' && (
            <RosterView
              roster={roster}
              staffing={staffing}
              teams={trainingTeams}
              nbaPlayersById={(() => {
                const m = new Map<string, typeof state.players[number]>();
                for (const p of state.players) m.set(p.internalId, p);
                return m;
              })()}
              currentYear={leagueYear}
              currentDate={state.date}
              trainingCalendar={dailyPlansISO as any}
              updateDevFocus={updateDevFocus}
              updateIndividualIntensity={updateIndividualIntensity}
              updateMentor={updateMentor}
              logs={[]}
            />
          )}

          {activeView === 'proficiency' && (
            <SystemProficiencyView roster={roster} systemFamiliarity={team.systemFamiliarity} allRosters={allK2Rosters} />
          )}

          {(() => {
            // When opening an auto-filled regular practice day (Balanced 50%, no
            // user override), hydrate the modal from the user's Normal Default
            // template so their preference shows up everywhere — without needing
            // to mass-stamp the calendar up front.
            const cell = selectedDayISO ? dailyPlansISO[selectedDayISO] : null;
            const isAutoBalanced50 =
              !!cell && cell.auto !== false && cell.paradigm === 'Balanced' && cell.intensity === 50;
            const tmpl = team.normalDayDefault;
            const useTmpl = isAutoBalanced50 && !!tmpl;
            const modalIntensity = selectedDayISO
              ? (useTmpl ? tmpl!.intensity : (cell?.intensity ?? (selectedDayData?.activity === 'Recovery Practice' ? 15 : intensity)))
              : intensity;
            const modalAllocations = selectedDayISO
              ? (useTmpl ? (tmpl!.allocations as Allocations) : (cell?.allocations ?? allocations))
              : allocations;
            const modalParadigm = selectedDayISO
              ? (useTmpl ? (tmpl!.paradigm as TrainingParadigm) : (cell?.paradigm ?? 'Balanced'))
              : 'Balanced';
            return (
              <DailyPlanModal
                isOpen={selectedPlanDateISO !== null}
                onClose={() => setSelectedPlanDateISO(null)}
                day={selectedPlanDateISO ? Number(selectedPlanDateISO.slice(8, 10)) : 0}
                activity={selectedDayData?.activity || ''}
                intensity={modalIntensity}
                allocations={modalAllocations}
                paradigm={modalParadigm}
                top5Systems={top5Systems}
                onSave={handleSavePlan}
              />
            );
          })()}

          {/* Normal-Default editor — same modal UI but paints all upcoming
              regular-season practice days (Balanced 50%) with the saved values. */}
          <DailyPlanModal
            isOpen={normalDefaultOpen}
            onClose={() => setNormalDefaultOpen(false)}
            day={0}
            activity="NORMAL DAY DEFAULT"
            intensity={normalDefaultDraft.intensity}
            allocations={normalDefaultDraft.allocations}
            paradigm={normalDefaultDraft.paradigm}
            top5Systems={top5Systems}
            onSave={handleSaveNormalDefault}
          />

          {/* Normal-Default propagation prompt — fires after handleSaveNormalDefault.
              Confirms whether the saved template should also overwrite every future
              auto Balanced 50% cell. Cancelling keeps the template; only future days
              stay untouched. */}
          {normalDefaultPending && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-[#1a1a1a] border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                    <RotateCcw className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="font-black uppercase tracking-widest text-amber-300 text-sm">
                      Auf Zukunft anwenden?
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Normal Default gespeichert
                    </div>
                  </div>
                </div>
                <div className="text-sm text-slate-300 mb-5 leading-relaxed">
                  Dein Template ist gespeichert. Sollen{' '}
                  <span className="font-bold text-rose-300">{normalDefaultPending.matchCount}</span>{' '}
                  kommende Standard-Tage (Auto Balanced 50%) mit{' '}
                  <span className="font-bold text-amber-300">{normalDefaultPending.template.paradigm} {normalDefaultPending.template.intensity}%</span>{' '}
                  überschrieben werden?
                  <div className="text-[11px] text-slate-500 mt-2">
                    Manuell gesetzte Tage und nicht-Standard-Auto-Tage (Pre-Game, Recovery, B2B) bleiben unverändert.
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 justify-end">
                  <button
                    onClick={() => setNormalDefaultPending(null)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-black uppercase text-xs tracking-widest"
                  >
                    Nur Template speichern
                  </button>
                  <button
                    onClick={applyNormalDefaultToFuture}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-widest"
                  >
                    Auf alle anwenden ({normalDefaultPending.matchCount})
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Save-as-Default propagation prompt — fires after handleSavePlan
              when an auto-cell was replaced. Apply All overwrites every future
              matching auto-day with the user's new plan. */}
          {savedDefault && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-[#1a1a1a] border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Activity className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="font-black uppercase tracking-widest text-amber-300 text-sm">
                      Save as Default?
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Apply to upcoming matching days
                    </div>
                  </div>
                </div>
                <div className="text-sm text-slate-300 mb-5 leading-relaxed">
                  Replace <span className="font-bold text-rose-300">{savedDefault.matchCount}</span> upcoming auto-day{savedDefault.matchCount === 1 ? '' : 's'} of{' '}
                  <span className="font-bold text-slate-200">{savedDefault.oldPlan?.paradigm} {savedDefault.oldPlan?.intensity}%</span>{' '}
                  with{' '}
                  <span className="font-bold text-amber-300">{savedDefault.newPlan.paradigm} {savedDefault.newPlan.intensity}%</span>?
                  <div className="text-[11px] text-slate-500 mt-2">
                    Only auto-cells are touched — your manually-edited days stay as-is.
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 justify-end">
                  <button
                    onClick={() => setSavedDefault(null)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-black uppercase text-xs tracking-widest"
                  >
                    Just This Day
                  </button>
                  <button
                    onClick={applyAsDefault}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-widest"
                  >
                    Apply to All ({savedDefault.matchCount})
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
