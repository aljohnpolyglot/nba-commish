import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { RosterView } from '../../TeamTraining/components/RosterView';
import { SystemProficiencyView } from '../../TeamTraining/components/SystemProficiencyView';
import { DailyPlanModal } from '../../TeamTraining/components/DailyPlanModal';
import { CalendarView as ScheduleCalendarView } from '../schedule/view/components/CalendarView';
import { DayView as ScheduleDayView } from '../schedule/view/components/DayView';
import { TrainingDayOverlay } from './TrainingDayOverlay';
import { mapPlayerToK2 } from '../../TeamTraining/lib/playerMapping';
import { computeTeamProficiency } from '../../utils/coachSliders';
import { nbaPlayerToTrainingPlayer, nbaTeamToTrainingTeam } from '../../TeamTraining/adapters/fromGameState';
import type { Allocations, TrainingParadigm, Staffing, ScheduleDay, DayType } from '../../TeamTraining/types';
import { Home as TeamOfficeHome } from '../central/view/TeamOffice/pages/Home';
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
  /** ISO `YYYY-MM-DD` for any day inside the target month — buildCalendar walks
   *  the entire calendar month containing this date. */
  anchorISO: string,
  teamLookup: Map<number, { abbrev: string; logoUrl?: string }>
): ScheduleDay[] {
  const anchor = new Date(`${anchorISO}T00:00:00Z`);
  if (isNaN(anchor.getTime())) return [];

  // Month bounds.
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth(); // 0..11
  const monthStart = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // g.date is full ISO (`2025-10-07T20:00:00Z`); slice to `YYYY-MM-DD` so the
  // map lookup matches the day-keys used by every consumer.
  const teamGamesByISO = new Map<string, Game>();
  for (const g of schedule) {
    if (g.played) continue;
    if (g.homeTid !== teamId && g.awayTid !== teamId) continue;
    if (g.isAllStar || g.isRisingStars || g.isCelebrityGame || g.isDunkContest || g.isThreePointContest) continue;
    const dateKey = (g.date ?? '').slice(0, 10);
    if (dateKey) teamGamesByISO.set(dateKey, g);
  }

  const days: ScheduleDay[] = [];
  let lastWasGame = false;
  let lastWasB2BGame2 = false; // night-2 of a back-to-back finished yesterday → mandatory pure recovery today

  // Walk every day of the calendar month so cells align to real weekdays.
  for (let i = 0; i < daysInMonth; i++) {
    const d = new Date(monthStart);
    d.setUTCDate(monthStart.getUTCDate() + i);
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
    } else if (lastWasB2BGame2) {
      // Day after a B2B → mandatory pure recovery, no team practice.
      activity = 'Recovery';
      description = 'Mandatory recovery — post B2B';
    } else if (lastWasGame) {
      // Day after a single game.
      activity = 'Recovery Practice';
      description = 'Active recovery + walkthrough';
    } else if (hasGameTomorrow) {
      activity = 'Shootaround';
      description = "Light shootaround — game tomorrow";
    } else if (phase === 'offseason') {
      activity = 'Off Day';
      description = 'Offseason — individual development only';
    } else if (phase === 'playoffs') {
      activity = 'Light Practice';
      description = 'Film + walkthrough for next opponent';
    } else if (phase === 'preseason') {
      activity = 'Full Training';
      description = 'Training camp scrimmage';
    } else {
      // Regular season — 4 train / 1 off rhythm.
      const dow = d.getUTCDay();
      if (dow === 0) {
        activity = 'Off Day';
        description = 'Sunday rest';
      } else {
        activity = 'Balanced Practice';
        description = 'Balanced offensive / defensive sets';
      }
    }

    let opponent: ScheduleDay['opponent'];
    if (game) {
      const isHome = game.homeTid === teamId;
      const oppTid = isHome ? game.awayTid : game.homeTid;
      const oppMeta = teamLookup.get(oppTid);
      opponent = {
        tid: oppTid,
        abbrev: oppMeta?.abbrev ?? '',
        logoUrl: oppMeta?.logoUrl,
        isHome,
      };
    }

    days.push({
      day: d.getUTCDate(), // actual day-of-month (1-31), not loop offset
      hasGame: !!game,
      isB2B,
      activity,
      description,
      opponent,
      isoDate: iso,
      weekday: d.getUTCDay(), // 0=Sun..6=Sat — ScheduleView anchors cells with this
    });
    lastWasB2BGame2 = isB2B;
    lastWasGame = !!game;
  }

  return days;
}

export const TrainingCenterView: React.FC = () => {
  const { state, dispatchAction, setCurrentView } = useGame();
  const isGM = state.gameMode === 'gm';

  // GM mode default: user's team. GM can still navigate to other teams,
  // but those views are read-only (per TeamTraining.tsx:279 design doc).
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
    isGM && state.userTeamId != null ? state.userTeamId : null
  );

  const team = selectedTeamId != null ? state.teams.find(t => t.id === selectedTeamId) : null;
  const isReadOnly = isGM && selectedTeamId != null && selectedTeamId !== state.userTeamId;
  const leagueYear = state.leagueStats?.year ?? 2026;

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
  const [calendarMonth, setCalendarMonth] = useState(new Date(state.date));

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

  useEffect(() => {
    setSelectedDate(state.date);
    setCalendarMonth(new Date(state.date));
    setViewMode('calendar');
  }, [state.date, state.day]);

  // Anchor for the visible canonical calendar month.
  const windowStartISO = useMemo(() => {
    if (!calendarMonth) return undefined;
    const d = new Date(calendarMonth);
    d.setUTCDate(1); // anchor first day of month so display always starts on real day-1
    return d.toISOString().slice(0, 10);
  }, [calendarMonth]);

  // 30-day calendar derived from real state.schedule.
  const schedule = useMemo(() => {
    if (!team || !windowStartISO) return [];
    const lookup = new Map<number, { abbrev: string; logoUrl?: string }>();
    for (const t of state.teams) lookup.set(t.id, { abbrev: t.abbrev, logoUrl: t.logoUrl });
    return buildCalendar(state.schedule || [], team.id, windowStartISO, lookup);
  }, [team, windowStartISO, state.schedule, state.teams]);

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
  const selectedTeamGame = team
    ? gamesForSelectedDate.find(g => g.homeTid === team.id || g.awayTid === team.id)
    : undefined;
  const selectedDayForHeader = selectedDateNorm
    ? schedule.find(d => d.isoDate === selectedDateNorm)
    : undefined;

  const formatDateDisplay = (dateStr: string) => {
    const norm = (dateStr ?? '').slice(0, 10);
    const d = norm ? new Date(`${norm}T00:00:00Z`) : new Date(dateStr);
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDotColor = (g: Game) => {
    if (g.played) return 'bg-slate-600';
    if (g.isAllStar || g.isRisingStars || (g as any).isCelebrityGame) return 'bg-amber-400';
    if ((g as any).isPreseason) return 'bg-slate-400';
    return 'bg-emerald-500';
  };

  const getHighlightedEvent = () => null;

  const simulateDay = async () => {
    dispatchAction({ type: 'ADVANCE_DAY' } as any);
  };

  const simulateToDate = async (targetDateStr: string) => {
    dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: targetDateStr, stopBefore: true } } as any);
  };

  const maxSimulatableDate = useMemo(() => {
    const d = new Date(`${(state.date ?? '').slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 365);
    return d;
  }, [state.date]);

  const trainingHeaderCard = (
    <div className="mb-6 border border-[#FDB927]/20 bg-[#111] rounded-2xl p-4 md:p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-[#FDB927]">
            Training prep
          </div>
          <h3 className="text-lg md:text-xl font-black uppercase tracking-tight text-white mt-1">
            {team.abbrev} {selectedTeamGame ? (selectedDayForHeader?.description ?? 'Game day') : 'Team plan'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {(selectedDayForHeader?.activity ?? 'Balanced Practice')} · {dailyPlansISO[selectedDateNorm]?.paradigm ?? 'Balanced'} · {dailyPlansISO[selectedDateNorm]?.intensity ?? 25}% intensity
          </p>
        </div>
        {!isReadOnly && (
          <button
            onClick={() => setSelectedPlanDateISO(selectedDateNorm)}
            className="px-4 py-2 rounded-lg bg-[#FDB927] text-black text-[10px] font-black uppercase tracking-widest hover:bg-amber-300 transition-colors"
          >
            Edit Plan
          </button>
        )}
      </div>
    </div>
  );

  // League-wide K2 rosters for `calculateCoachSliders` normalization. CoachingPage
  // builds the same array — passing it ensures Training Center stars match
  // CoachingView stars exactly. Without it the sliders fall back to raw values
  // and proficiency scores diverge.
  const allK2Rosters = useMemo(() => {
    return state.teams.map(t => {
      const tp = state.players.filter(p => p.tid === t.id && (p.status === 'Active' || !p.status))
        .map(p => nbaPlayerToTrainingPlayer(p, leagueYear, { team: t, dateStr: state.date }));
      return tp.map(mapPlayerToK2) as any;
    });
  }, [state.teams, state.players, leagueYear, state.date]);

  const top5Systems = useMemo(() => {
    if (roster.length === 0) return [];
    const k2 = roster.map(mapPlayerToK2);
    // Shared util — same answer as CoachingView and SystemProficiencyView.
    const { sortedProfs } = computeTeamProficiency(k2 as any, allK2Rosters, team?.systemFamiliarity);
    return sortedProfs.slice(0, 5).map(([n]) => n);
  }, [roster, team?.systemFamiliarity, allK2Rosters]);

  const handleSavePlan = (i: number, a: Allocations, p: TrainingParadigm) => {
    if (!team || !selectedDayISO || isReadOnly) return;
    dispatchAction({
      type: 'SET_TRAINING_DAILY_PLAN',
      payload: { teamId: team.id, dayKey: selectedDayISO, plan: { intensity: i, allocations: a, paradigm: p } },
    });
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

  // Franchise picker — reuse Team Office Home for selection consistency.
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
        <TeamOfficeHome onSelectTeam={(teamId: number) => setSelectedTeamId(teamId)} />
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
            viewMode === 'day' ? (
              <ScheduleDayView
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                setViewMode={setViewMode}
                state={state}
                formatDateDisplay={formatDateDisplay}
                gamesForSelectedDate={gamesForSelectedDate}
                simulateDay={simulateDay}
                simulateToDate={simulateToDate}
                handleWatchGame={() => {}}
                setSelectedBoxScoreGame={() => {}}
                onNavigateToAllStar={() => setCurrentView('All-Star' as any)}
                onViewRosters={() => {}}
                onWatchDunkContest={() => {}}
                onWatchThreePoint={() => {}}
                onViewContestDetails={() => {}}
                onViewBoxScore={() => {}}
                maxSimulatableDate={maxSimulatableDate}
                openConfirmModal={(_title, message, onConfirm) => {
                  if (window.confirm(message)) onConfirm();
                }}
                boxScores={state.boxScores}
                players={state.players}
                nonNBATeams={state.nonNBATeams}
                onNavigateToDraftLottery={() => setCurrentView('Draft Lottery' as any)}
                onNavigateToDraftBoard={() => setCurrentView('Draft Board' as any)}
                onNavigateToSeasonPreview={() => setCurrentView('Season Preview' as any)}
                headerSlot={trainingHeaderCard}
              />
            ) : (
              <ScheduleCalendarView
                calendarMonth={calendarMonth}
                setCalendarMonth={setCalendarMonth}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                setViewMode={setViewMode}
                state={state}
                title="Training Calendar"
                focusTeamId={team.id}
                formatDateDisplay={formatDateDisplay}
                getDotColor={getDotColor}
                getHighlightedEvent={getHighlightedEvent}
                onDateClick={({ date, focusTeamGame }) => {
                  setSelectedDate(`${date}T00:00:00.000Z`);
                  if (focusTeamGame) {
                    setViewMode('day');
                  } else if (!isReadOnly) {
                    setSelectedPlanDateISO(date);
                  }
                  return true;
                }}
                renderDayOverlay={({ date, focusTeamGame }) => (
                  <TrainingDayOverlay
                    plan={dailyPlansISO[date]}
                    isGameDay={!!focusTeamGame}
                  />
                )}
              />
            )
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

          <DailyPlanModal
            isOpen={selectedPlanDateISO !== null}
            onClose={() => setSelectedPlanDateISO(null)}
            day={selectedPlanDateISO ? Number(selectedPlanDateISO.slice(8, 10)) : 0}
            activity={selectedDayData?.activity || ''}
            intensity={selectedDayISO ? (dailyPlansISO[selectedDayISO]?.intensity ?? (selectedDayData?.activity === 'Recovery Practice' ? 15 : intensity)) : intensity}
            allocations={selectedDayISO ? (dailyPlansISO[selectedDayISO]?.allocations ?? allocations) : allocations}
            paradigm={selectedDayISO ? (dailyPlansISO[selectedDayISO]?.paradigm ?? 'Balanced') : 'Balanced'}
            top5Systems={top5Systems}
            onSave={handleSavePlan}
          />
        </div>
      </div>
    </div>
  );
};
