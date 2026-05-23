import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useGame } from '../../store/GameContext';
import { RosterView } from '../../TeamTraining/components/RosterView';
import { SystemProficiencyView } from '../../TeamTraining/components/SystemProficiencyView';
import { TrainingCalendarView } from './TrainingCalendarView';
import { TrainingDayView } from './TrainingDayView';
import {
  DormantTrainingStateCard,
  SaveAsDefaultPrompt,
  TrainingCenterHeader,
  TrainingCenterPickerShell,
  TrainingCenterTabs,
  TrainingPlanModals,
} from './TrainingCenterChrome';
import { buildCalendar, sundayOf, toIsoDay, type SavedDefaultState } from './trainingCenterShared';
import { getActiveLeagueTeams, isOnRoster, resolveAnyTeam } from '../../utils/teamLookup';
import { DashboardStatusBar } from './DashboardStatusBar';
import { mapPlayerToK2 } from '../../TeamTraining/lib/playerMapping';
import { computeTeamProficiency } from '../../utils/coachSliders';
import { nbaPlayerToTrainingPlayer, nbaTeamToTrainingTeam } from '../../TeamTraining/adapters/fromGameState';
import { TRAINING_CALENDAR_VERSION } from '../../services/training/trainingScheduler';
import { resolveEffectiveTrainingCalendar, resolveEffectiveTrainingPlan } from '../../services/training/trainingPlanResolver';
import type { Allocations, TrainingParadigm, Staffing } from '../../TeamTraining/types';

export const TrainingCenterView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const isGM = state.gameMode === 'gm';

  // GM mode default: user's team. GM can still navigate to other teams,
  // but those views are read-only (per TeamTraining.tsx:279 design doc).
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
    isGM && state.userTeamId != null ? state.userTeamId : null
  );

  // resolveAnyTeam handles non-NBA tids (Euroleague/Endesa) so a EuroLeague
  // GM lands on a populated training view instead of the NBA-only picker.
  // NOTE: NonNBATeam stubs have no trainingCalendar slot today, so saving
  // a plan won't persist — that's a known Phase 2 follow-up.
  const team = selectedTeamId != null
    ? resolveAnyTeam(selectedTeamId, state.teams, state.nonNBATeams ?? [])
    : null;
  const isReadOnly = isGM && selectedTeamId != null && selectedTeamId !== state.userTeamId;
  const leagueYear = state.leagueStats?.year ?? new Date().getFullYear();
  const activeLeagueTeams = useMemo(() => getActiveLeagueTeams(state), [state]);
  const trainingTeams = useMemo(() => activeLeagueTeams.map(nbaTeamToTrainingTeam), [activeLeagueTeams]);
  const roster = useMemo(() => {
    if (!team) return [];
    const teamPlayers = state.players.filter(p => p.tid === team.id && isOnRoster(p));
    return teamPlayers.map(p =>
      nbaPlayerToTrainingPlayer(p, leagueYear, {
        team,
        dateStr: state.date,
        teamPlayers,
      }),
    );
  }, [state.players, team, leagueYear, state.date]);

  // Persistent daily plans live on NBATeam.trainingCalendar keyed by ISO date `YYYY-MM-DD`.
  const effectiveDailyPlansISO = useMemo(
    () => team ? resolveEffectiveTrainingCalendar(team) : {},
    [team],
  );

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
    for (const nonNBA of state.nonNBATeams ?? []) {
      lookup.set(nonNBA.tid, {
        abbrev: nonNBA.abbrev || nonNBA.name.substring(0, 3).toUpperCase(),
        logoUrl: nonNBA.imgURL,
      });
    }
    return buildCalendar(state.schedule || [], team.id, windowStartISO, lookup, 28);
  }, [team, windowStartISO, state.schedule, state.teams, state.nonNBATeams]);

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
    return activeLeagueTeams.map(t => {
      const tp = state.players.filter(p => p.tid === t.id && isOnRoster(p))
        .map(p => nbaPlayerToTrainingPlayer(p, leagueYear, { team: t }));
      return tp.map(mapPlayerToK2) as any;
    });
  }, [needAllRosters, activeLeagueTeams, state.players, leagueYear]);

  const top5Systems = useMemo(() => {
    // Same gate — top5Systems only feeds the modal, no point computing while closed.
    if (!needAllRosters || roster.length === 0) return [];
    const k2 = roster.map(mapPlayerToK2);
    const { sortedProfs } = computeTeamProficiency(k2 as any, allK2Rosters, team?.systemFamiliarity);
    return sortedProfs.slice(0, 5).map(([n]) => n);
  }, [needAllRosters, roster, team?.systemFamiliarity, allK2Rosters]);

  // Tracks the just-edited day so we can offer "Save as Default" propagation.
  // Captures the BEFORE-save plan so we know which auto-cells match for replacement.
  const [savedDefault, setSavedDefault] = useState<SavedDefaultState | null>(null);

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

  const handleSaveNormalDefault = (i: number, a: Allocations, p: TrainingParadigm) => {
    if (!team || isReadOnly) return;
    const template = { intensity: i, allocations: a, paradigm: p };
    setNormalDefaultDraft({ intensity: i, allocations: a, paradigm: p });
    dispatchAction({
      type: 'SET_TRAINING_NORMAL_DEFAULT',
      payload: { teamId: team.id, template },
    });

    // Normal Default is durable: saving it immediately rewrites every current
    // and future regular auto-day, while newly generated auto Balanced-50 days
    // still resolve through this template until the user changes it again.
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
    setNormalDefaultOpen(false);
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
    return <TrainingCenterPickerShell onSelectTeam={(teamId: number) => setSelectedTeamId(teamId)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <TrainingCenterHeader
        teamName={team.name}
        currentDate={dateInfo.currentDate}
        isReadOnly={isReadOnly}
        isGM={isGM}
        selectedTeamId={team.id}
        activeLeagueTeams={activeLeagueTeams}
        onBack={() => setSelectedTeamId(null)}
        onTeamChange={setSelectedTeamId}
      />

      <TrainingCenterTabs activeView={activeView} onViewChange={setActiveView} />

      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {activeView === 'training' && dormantState ? (
            <DormantTrainingStateCard label={dormantState.label} subtext={dormantState.subtext} />
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
                userPlan={team ? resolveEffectiveTrainingPlan(team, selectedDateNorm) ?? undefined : undefined}
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
                dailyPlansISO={effectiveDailyPlansISO}
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
              trainingCalendar={effectiveDailyPlansISO as any}
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
            const cell = selectedDayISO && team ? resolveEffectiveTrainingPlan(team, selectedDayISO) : null;
            const modalIntensity = selectedDayISO
              ? cell?.intensity ?? (selectedDayData?.activity === 'Recovery Practice' ? 15 : intensity)
              : intensity;
            const modalAllocations = selectedDayISO ? cell?.allocations ?? allocations : allocations;
            const modalParadigm = selectedDayISO ? cell?.paradigm ?? 'Balanced' : 'Balanced';
            return (
              <TrainingPlanModals
                selectedPlanDateISO={selectedPlanDateISO}
                selectedDayDataActivity={selectedDayData?.activity || ''}
                modalIntensity={modalIntensity}
                modalAllocations={modalAllocations}
                modalParadigm={modalParadigm}
                top5Systems={top5Systems}
                onCloseSelectedPlan={() => setSelectedPlanDateISO(null)}
                onSaveSelectedPlan={handleSavePlan}
                normalDefaultOpen={normalDefaultOpen}
                normalDefaultDraft={normalDefaultDraft}
                onCloseNormalDefault={() => setNormalDefaultOpen(false)}
                onSaveNormalDefault={handleSaveNormalDefault}
              />
            );
          })()}

          <SaveAsDefaultPrompt
            savedDefault={savedDefault}
            onCancel={() => setSavedDefault(null)}
            onConfirm={applyAsDefault}
          />
        </div>
      </div>
    </div>
  );
};
