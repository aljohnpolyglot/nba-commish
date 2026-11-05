import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, Play, FastForward, Music2, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import { NBATeam, Game, Tab, NBAPlayer, ResolvedGamePresentation } from '../../../types';
import { DunkContest } from '../../../services/allStar/DunkContest';
import { ThreePointContest, mapPlayerToContestant } from '../../allstar/allstarevents';
import { normalizeDate, getTeamForGame, getPlayersForExhibitionTeam } from '../../../utils/helpers';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { GameSimulator } from '../../../services/simulation/GameSimulator';
import { SettingsManager } from '../../../services/SettingsManager';
import { GameSimulatorScreen } from '../../shared/GameSimulatorScreen';
import { BoxScoreModal } from '../../modals/BoxScoreModal';
import { WatchGamePreviewModal } from '../../modals/WatchGamePreviewModal';
import { PlayerRatingsModal } from '../../modals/PlayerRatingsModal';
import { useRosterComplianceGate } from '../../../hooks/useRosterComplianceGate';
import { useDraftEventGate } from '../../../hooks/useDraftEventGate';
import { useSimulationBoundaryPreflight } from '../../../hooks/useSimulationBoundaryPreflight';
import { isEuroIsolatedMode, isPbaActiveConferenceMode, isPbaIsolatedMode } from '../../../utils/uiMode';
import { isEuroVisibleScheduleGame } from '../../../utils/euroLeagueDefaults';
import { DanceContestMiniGame } from '../../../minigames/pbadance/DanceContestMiniGame';
import {
  AllStarSatelliteLiveContestOverlay,
  type SatelliteLiveContestKind,
} from '../../allstar/AllStarSatelliteLiveContestOverlay';
import { findBoxScoreForGame, findBoxScoreForScheduledGame } from '../../../utils/boxScoreLookup';
import { shouldAdvanceAfterAllStarEventDay } from '../../../services/allStar/allStarSaturdayCompletion';
import { getAllStarWeekendDates } from '../../../services/allStar/allStarWeekendDates';
import { getDraftDate, toISODateString } from '../../../utils/dateUtils';
import { getCurrentPbaOffseasonTaskTarget } from '../../../services/pba/offseasonTaskTarget';
import { isDanceContestEnabled } from '../../../services/allStar/allStarEventAvailability';
import { simulateDanceContest, type DanceContestResult } from '../../../services/pba/danceContest';
import { getResolvedTeamLogoUrl } from '../../../utils/teamAssets';
import { compileTargetPlan, type TargetPlan } from '../../../services/simulation/targetPlanner';
import { buildDunkJudgePool } from '../../../services/allStar/allStarWeekendEvents';
import { getAllStarPlayerEligibility } from '../../../services/allStar/allStarSelectionHelpers';

// Sub-components
import { AllStarDayView } from './components/AllStarDayView';
import { ContestDetailsModal } from './components/ContestDetailsModal';
import { CalendarView } from './components/CalendarView';
import { DayView } from './components/DayView';
import { AllStarRosterModal } from './components/AllStarRosterModal';
import { NextFixturesAside } from './components/NextFixturesAside';

export const ScheduleView: React.FC = () => {
  const { state, dispatchAction, setCurrentView } = useGame();
  
  const [selectedDate, setSelectedDate] = useState(state.date);
  const [focusedGameId, setFocusedGameId] = useState<number | undefined>();
  const [viewMode, setViewMode] = useState<'calendar' | 'day' | 'watching'>('calendar');
  const [watchingGame, setWatchingGame] = useState<Game | null>(null);
  const [watchingDunkContest, setWatchingDunkContest] = useState(false);
  const [watchingThreePoint, setWatchingThreePoint] = useState(false);
  const [satelliteLiveContest, setSatelliteLiveContest] = useState<SatelliteLiveContestKind | null>(null);
  const [watchingDance, setWatchingDance] = useState(false);
  const [pendingDanceGame, setPendingDanceGame] = useState<Game | null>(null);
  const [pendingWatchGame, setPendingWatchGame] = useState<Game | null>(null);
  const [riggedForTid, setRiggedForTid] = useState<number | undefined>(undefined);
  const [precomputedWatchResult, setPrecomputedWatchResult] = useState<any>(null);
  const [watchPresentation, setWatchPresentation] = useState<ResolvedGamePresentation | null>(null);
  const [selectedBoxScoreGame, setSelectedBoxScoreGame] = useState<Game | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date(state.date));
  const [allStarModalTab, setAllStarModalTab] = useState<string | null>(null);
  const [contestModalType, setContestModalType] = useState<'dunk' | 'three' | 'skills' | 'shooting-stars' | null>(null);
  const [boxScoreClickedPlayer, setBoxScoreClickedPlayer] = useState<NBAPlayer | null>(null);
  const pendingWatchPresentation = useMemo(() => {
    if (!pendingWatchGame) return null;
    const homeRoster = getPlayersForExhibitionTeam(pendingWatchGame, true, state.allStar, state.players, state.leagueType);
    const awayRoster = getPlayersForExhibitionTeam(pendingWatchGame, false, state.allStar, state.players, state.leagueType);
    return GameSimulator.prepareDayGames(
      state.teams,
      state.players,
      [pendingWatchGame],
      pendingWatchGame.date,
      state.stats.playerApproval,
      state.allStar,
      homeRoster.length ? homeRoster : undefined,
      awayRoster.length ? awayRoster : undefined,
      undefined,
      state.leagueStats,
    )[0]?.presentation ?? null;
  }, [pendingWatchGame, state.allStar, state.leagueStats, state.leagueType, state.players, state.stats.playerApproval, state.teams]);
  
  const settings = useMemo(() => SettingsManager.getSettings(), [state.isProcessing]);
  const MAX_SIM_DAYS = useMemo(() => {
    const { gameSpeed, enableLLM, llmPerformance } = settings;
    const speedScore = (gameSpeed - 1) / 9; // 0.0 → 1.0

    if (!enableLLM) {
      // No AI: speed alone sets the horizon — 7 days at speed 1, 365 at speed 10
      return Math.round(7 + speedScore * 358);
    }

    // AI on: speed gives a base of 5–60 days, AI performance penalises by up to 85%
    const base = 5 + speedScore * 55;
    const penalty = ((llmPerformance - 1) / 9) * 0.85;
    return Math.max(2, Math.round(base * (1 - penalty)));
  }, [settings]);
  
  const maxSimulatableDate = useMemo(() => {
    const stateDateNorm = normalizeDate(state.date);
    const d = new Date(`${stateDateNorm}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + MAX_SIM_DAYS);
    return d;
  }, [state.date, MAX_SIM_DAYS]);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [offseasonBlockOpen, setOffseasonBlockOpen] = useState(false);

  // Update selected date when state.date changes (e.g. after simulation).
  // Key off both date and day — day is a monotonic counter, so even if the
  // formatted date string somehow reformats identically the effect still runs.
  useEffect(() => {
    setSelectedDate(state.date);
    setCalendarMonth(new Date(state.date));
  }, [state.date, state.day]);

  useEffect(() => {
    const focus = state.pendingScheduleFocus;
    if (!focus) return;
    setSelectedDate(focus.date);
    setFocusedGameId(focus.gameId);
    setCalendarMonth(new Date(`${focus.date}T12:00:00Z`));
    setViewMode('day');
    void dispatchAction({ type: 'UPDATE_STATE', payload: { pendingScheduleFocus: undefined } } as any);
  }, [dispatchAction, state.pendingScheduleFocus]);

  const euroIsolated = isEuroIsolatedMode(state);
  const pbaIsolated = isPbaIsolatedMode(state);
  const pbaOffseasonTaskTarget = useMemo(
    () => getCurrentPbaOffseasonTaskTarget(state),
    [state],
  );
  const contestTeams = useMemo(
    () => pbaIsolated
      ? (state.nonNBATeams ?? [])
          .filter((team: any) => team.league === 'PBA')
          .map((team: any) => ({ ...team, id: team.tid ?? team.id }))
      : state.teams,
    [pbaIsolated, state.nonNBATeams, state.teams],
  );
  const euroScheduleState = useMemo(() => ({
    activeCompetitions: state.activeCompetitions,
    leagueStats: state.leagueStats,
    userTeamId: state.userTeamId,
    gameMode: state.gameMode,
    teams: state.teams,
    nonNBATeams: state.nonNBATeams,
    schedule: state.schedule,
    boxScores: state.boxScores,
    clubAliasMap: (state as any).clubAliasMap,
  }), [
    state.activeCompetitions,
    state.leagueStats,
    state.userTeamId,
    state.gameMode,
    state.teams,
    state.nonNBATeams,
    state.schedule,
    state.boxScores,
    (state as any).clubAliasMap,
  ]);
  const visibleSchedule = useMemo(() => {
    const schedule = state.schedule ?? [];
    if (euroIsolated) return schedule.filter(g => isEuroVisibleScheduleGame(euroScheduleState as any, g));
    if (pbaIsolated) {
      return schedule.filter(g =>
        (g.homeTid >= 2000 && g.homeTid < 2100) ||
        !!(g as any).isAllStar ||
        !!(g as any).isRisingStars ||
        !!(g as any).isCelebrityGame ||
        !!(g as any).isDunkContest ||
        !!(g as any).isThreePointContest ||
        !!(g as any).isShootingStars ||
        !!(g as any).isSkillsChallenge ||
        !!(g as any).isHorseContest ||
        !!(g as any).isThroneEvent
      );
    }
    return schedule;
  }, [state.schedule, euroIsolated, pbaIsolated, euroScheduleState]);

  const gamesForSelectedDate = useMemo(() => {
    return visibleSchedule.filter(g => normalizeDate(g.date) === normalizeDate(selectedDate));
  }, [visibleSchedule, selectedDate]);

  // Roster compliance gate — shared hook covers every sim advancement path.
  const rosterGate = useRosterComplianceGate();
  const draftGate = useDraftEventGate({
    onNavigateToDraftLottery: () => setCurrentView('Draft Lottery' as Tab),
    onNavigateToDraft: () => setCurrentView('Draft Board' as Tab),
  });
  const boundaryPreflight = useSimulationBoundaryPreflight(state);

  const startLongSimulation = (
    plan: TargetPlan,
    start: (resolvedPlan: TargetPlan) => void | Promise<void>,
  ) => {
    boundaryPreflight.attempt(plan, resolvedPlan => {
      rosterGate.attempt(() => draftGate.attempt(async () => {
        await start(resolvedPlan);
        if (
          resolvedPlan.confirmedBoundaries.includes('DRAFT_LOTTERY')
          && resolvedPlan.boundaryPolicy.draftLottery === 'STOP_AND_WATCH'
        ) {
          setCurrentView('Draft Lottery' as Tab);
        }
      }, resolvedPlan));
    });
  };

  const openCurrentPbaTask = async (): Promise<boolean> => {
    const target = pbaOffseasonTaskTarget;
    if (!target) return false;
    if (target.row === 'pbaLocalFreeAgency') {
      await dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingTeamOfficeNav: { tab: 'intel', intelTab: 'fa' } },
      } as any);
    }
    if (target.row === 'pbaDraft') {
      const draftDate = toISODateString(getDraftDate(state.leagueStats.year, state.leagueStats));
      if (normalizeDate(state.date) < draftDate) {
        await dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { targetDate: draftDate, stopBefore: true },
        } as any);
      }
    }
    const directRows = new Set([
      'pbaDraft',
      'pbaLocalFreeAgency',
      'pbaImportSearch',
      'pbaImportDecision',
      'pbaAllStarWeekend',
    ]);
    if (!directRows.has(target.row) && !target.tab) return false;
    await dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: target.row } } as any);
    if (target.tab) setCurrentView(target.tab);
    return true;
  };

  const simulateDay = async () => {
    if (pbaIsolated && ['pending', 'in-progress'].includes(state.offseasonChecklist?.pbaAllStarWeekend ?? '')
      && normalizeDate(state.date) === toISODateString(getAllStarWeekendDates(state.leagueStats.year, state.leagueStats).allStarGame)) {
      await dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaAllStarWeekend' } } as any);
      return;
    }
    // Calendar advance is paused during offseason — user steps through
    // phases via the AUFGABEN sidebar instead. Avoids dual-driver bugs
    // where ADVANCE_DAY skips past Tag-counter ticks or option deadlines.
    if (
      state.offseasonChecklist
      && !isPbaActiveConferenceMode(state)
      && !shouldAdvanceAfterAllStarEventDay(state)
    ) {
      if (pbaIsolated && await openCurrentPbaTask()) return;
      setOffseasonBlockOpen(true);
      return;
    }
    rosterGate.attempt(() => draftGate.attempt(() => dispatchAction({ type: 'ADVANCE_DAY' })));
  };

  const simulateToDate = async (targetDateStr: string) => {
    if (state.offseasonChecklist && !isPbaActiveConferenceMode(state)) {
      if (pbaIsolated && await openCurrentPbaTask()) return;
      setOffseasonBlockOpen(true);
      return;
    }
    // stopBefore: land ON the selected date with that day's games still unplayed,
    // so the user can choose to watch or sim them manually.
    const plan = compileTargetPlan(state, 'SIMULATE_TO_DATE', targetDateStr);
    startLongSimulation(plan, resolvedPlan => dispatchAction({
      type: 'SIMULATE_TO_DATE',
      payload: { targetDate: targetDateStr, stopBefore: true, targetPlan: resolvedPlan },
    } as any));
  };

  const simulateSeason = async () => {
    // Season sim — include the last day's games (we want the season complete).
    const lastGame = [...visibleSchedule].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const targetDate = lastGame?.date ?? (() => {
      const stateDateNorm = normalizeDate(state.date);
      const farDate = new Date(`${stateDateNorm}T00:00:00Z`);
      farDate.setUTCDate(farDate.getUTCDate() + 180);
      return farDate.toISOString();
    })();
    const plan = compileTargetPlan(state, 'SIMULATE_TO_DATE', targetDate);
    startLongSimulation(plan, resolvedPlan => dispatchAction({
      type: 'SIMULATE_TO_DATE',
      payload: { targetDate, targetPlan: resolvedPlan },
    } as any));
  };

  const formatDateDisplay = (dateStr: string) => {
    // Anchor the parse in UTC — otherwise `new Date("Apr 29, 2026")` is local
    // midnight, which in any GMT+X timezone is still Apr 28 in UTC. Combined
    // with the formatter's `timeZone: 'UTC'` below, that shifts the displayed
    // weekday/day one day backward — user reports "header still shows Apr 28
    // even though I'm on Apr 29".
    const norm = normalizeDate(dateStr);
    const d = norm ? new Date(`${norm}T00:00:00Z`) : new Date(dateStr);
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const openConfirmModal = (title: string, message: string, onConfirm: () => void) => {
    setModalConfig({ isOpen: true, title, message, onConfirm });
  };

  const closeConfirmModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  const getCityFromTeamName = (name: string) => {
    const multiWordCities = ['New York', 'Los Angeles', 'San Antonio', 'Golden State', 'Oklahoma City', 'New Orleans'];
    const safeName = String(name ?? '').trim();
    for (const city of multiWordCities) {
      if (safeName.startsWith(city)) return city;
    }
    return safeName.split(' ')[0] || 'Unknown';
  };

  const handleDunkComplete = (simResult: any) => {
    if (!simResult || !state.allStar) return;
    const dunkContestants = (state.allStar?.dunkContestContestants ?? []);
    // Build name→internalId map (only needed for winnerId)
    const nameToId = new Map<string, string>();
    dunkContestants.forEach((c: any) => {
      const player = state.players.find((p: any) => p.internalId === (c.internalId || c.playerId)) || c;
      if (player?.name) nameToId.set(player.name, c.internalId || c.playerId);
    });
    const winnerId = nameToId.get(simResult.winnerName) ?? simResult.winnerId;
    // Keep round1/round2 AS-IS (name-keyed) — DunkContestView matches by playerName
    const result = {
      contestants: dunkContestants.map((c: any) => {
        const pid = c.internalId || c.playerId;
        const player = state.players.find((p: any) => p.internalId === pid);
        const playerName = player?.name || c.name || '';
        const r1 = simResult.round1?.find((r: any) => r.playerName === playerName);
        const r2 = simResult.round2?.find((r: any) => r.playerName === playerName);
        return {
          playerId: pid,
          playerName,
          round1Score: r1?.totalScore ?? 0,
          round2Score: r2?.totalScore ?? null,
          isWinner: winnerId === pid,
          dunkTypes: [...(r1?.dunks?.map((d: any) => d.move) ?? []), ...(r2?.dunks?.map((d: any) => d.move) ?? [])],
        };
      }),
      winnerId,
      winnerName: simResult.winnerName,
      mvpDunk: simResult.mvpDunk,
      round1: simResult.round1,
      round2: simResult.round2,
      log: simResult.log,
      complete: true,
    };
    dispatchAction({ type: 'SAVE_CONTEST_RESULT', payload: { contest: 'dunk', result } });
  };

  const handleThreeComplete = (simResult: any) => {
    const threeContestants = (state.allStar?.threePointContestants ?? []);
    const winnerPlayer = state.players.find((p: any) => p.internalId === simResult.winnerId);
    const winnerName = winnerPlayer?.name || simResult.winnerName || '';
    const result = {
      contestants: threeContestants.map((c: any) => {
        const pid = c.internalId || c.playerId;
        const player = state.players.find((p: any) => p.internalId === pid);
        const r1 = simResult.round1?.find((r: any) => r.playerId === pid);
        const fin = simResult.finals?.find((r: any) => r.playerId === pid);
        return {
          playerId: pid,
          playerName: player?.name || c.name || '',
          round1Score: r1?.score ?? r1?.totalScore ?? 0,
          finalScore: fin?.score ?? fin?.totalScore ?? null,
          isWinner: simResult.winnerId === pid,
        };
      }),
      winnerId: simResult.winnerId,
      winnerName,
      log: simResult.log,
      complete: true,
    };
    dispatchAction({ type: 'SAVE_CONTEST_RESULT', payload: { contest: 'three', result } });
  };

  const handleWatchGame = (game: Game) => {
    const gameDateNorm = normalizeDate(game.date);
    const stateDateNorm = normalizeDate(state.date);
    const isToday = gameDateNorm === stateDateNorm;

    if (isToday) {
      if (
        game.isAllStar
        && isDanceContestEnabled(state.leagueStats)
        && !state.allStar?.danceContest?.complete
      ) {
        setPendingDanceGame(game);
        return;
      }
      setPendingWatchGame(game);
    }
  };

  const saveDanceResult = async (result: DanceContestResult) => {
    await dispatchAction({
      type: 'SAVE_CONTEST_RESULT',
      payload: { contest: 'dance', result },
    } as any);
  };

  // Resolve a team by tid — NBA, non-NBA (tid ≥ 100), or exhibition mocks.
  // Wrapper around the shared `resolveAnyTeam` helper that falls back to a
  // mock object when nothing matches (older sim paths expected non-null).
  const resolveTeam = (tid: number): NBATeam => {
    return resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []) ?? ({
      id: tid, name: 'Unknown', abbrev: '?', logoUrl: '',
    } as unknown as NBATeam);
  };

  const finishWatchGame = (result: any) => {
    if (!watchingGame) return;
    const currentRig = riggedForTid; // capture before clearing state
    setWatchingGame(null);
    setRiggedForTid(undefined);
    setPrecomputedWatchResult(null);
    setWatchPresentation(null);
    setViewMode('day');

    // The result was persisted before the watch screen opened. Advance only
    // after the user finishes or leaves so a normal game cannot unmount its
    // own live screen during preview confirmation.
    const isExhibition = watchingGame.homeTid < 0;
    if (!isExhibition) {
      rosterGate.attempt(() => draftGate.attempt(() => dispatchAction({
        type: 'ADVANCE_DAY',
        payload: {
          watchedGameResult: result,
          ...(currentRig !== undefined ? { riggedForTid: currentRig } : {}),
        }
      } as any)));
    }
  };

  const getDotColor = (g: Game) => {
    if (g.played) return 'bg-slate-600';
    if (g.isAllStar) return 'bg-amber-400';
    if (g.isRisingStars) return 'bg-sky-400';
    if ((g as any).isExhibition) return 'bg-purple-400';
    return 'bg-emerald-500';
  };

  const getHighlightedEvent = (date: Date) => {
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    if (m === 12 && d === 25) return { label: 'Christmas', color: 'text-red-400', icon: '🎄' };
    return null;
  };

  const jumpToDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setCalendarMonth(new Date(dateStr));
    setViewMode('day');
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-[#0a0a0a] min-h-0">
      
      {/* --- Main View Logic --- */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {viewMode === 'calendar' && (
            <motion.div 
              key="calendar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto custom-scrollbar"
            >
              <CalendarView 
                calendarMonth={calendarMonth}
                setCalendarMonth={setCalendarMonth}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                setViewMode={setViewMode}
                state={state}
                formatDateDisplay={formatDateDisplay}
                getDotColor={getDotColor}
                getHighlightedEvent={getHighlightedEvent}
              />
            </motion.div>
          )}

          {viewMode === 'day' && (
            <motion.div 
              key="day"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto custom-scrollbar"
            >
              <DayView
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                setViewMode={setViewMode}
                state={state}
                focusGameId={focusedGameId}
                formatDateDisplay={formatDateDisplay}
                gamesForSelectedDate={gamesForSelectedDate}
                simulateDay={simulateDay}
                simulateToDate={simulateToDate}
                handleWatchGame={handleWatchGame}
                setSelectedBoxScoreGame={setSelectedBoxScoreGame}
                onNavigateToAllStar={() => setCurrentView('All-Star' as Tab)}
                onViewRosters={setAllStarModalTab}
                onWatchDunkContest={() => setWatchingDunkContest(true)}
                onWatchThreePoint={() => setWatchingThreePoint(true)}
                onWatchShootingStars={() => setSatelliteLiveContest('shooting-stars')}
                onWatchSkillsChallenge={() => setSatelliteLiveContest('skills')}
                onWatchHorse={() => setSatelliteLiveContest('horse')}
                onViewContestDetails={setContestModalType}
                onViewBoxScore={setSelectedBoxScoreGame}
                maxSimulatableDate={maxSimulatableDate}
                openConfirmModal={openConfirmModal}
                boxScores={state.boxScores}
                players={state.players}
                nonNBATeams={state.nonNBATeams}
                onNavigateToDraftLottery={() => setCurrentView('Draft Lottery' as Tab)}
                onNavigateToDraftBoard={() => setCurrentView('Draft Board' as Tab)}
                onNavigateToSeasonPreview={() => setCurrentView('Season Preview' as Tab)}
              />
            </motion.div>
          )}

          {viewMode === 'watching' && watchingGame && watchPresentation && (
            <motion.div
              key="watching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1"
            >
              <GameSimulatorScreen
                game={watchingGame}
                presentation={watchPresentation}
                players={state.players}
                isProcessing={state.isProcessing}
                precomputedResult={precomputedWatchResult}
                onClose={() => finishWatchGame(precomputedWatchResult)}
                onComplete={finishWatchGame}
                riggedForTid={riggedForTid}
                otherGamesToday={0}
              />
            </motion.div>
          )}

      </AnimatePresence>
      </div>

      {euroIsolated && (
        <NextFixturesAside
          state={state}
          onJumpToDate={jumpToDate}
        />
      )}

      {watchingDunkContest && !euroIsolated && (
        <div className="fixed inset-0 z-[100] bg-black">
          <DunkContest
            contestants={(state.allStar?.dunkContestContestants ?? [])
              .map((c: any) => state.players.find((p: any) => p.internalId === (c.internalId || c.playerId)) || c)
              .filter(Boolean)}
            judgeCandidates={buildDunkJudgePool(
              state,
              state.players.filter(getAllStarPlayerEligibility(state.leagueStats, state.teams)),
            )}
            onClose={() => setWatchingDunkContest(false)}
            onComplete={handleDunkComplete}
          />
        </div>
      )}

      {watchingThreePoint && !euroIsolated && (() => {
        const threeContestants = (state.allStar?.threePointContestants ?? []).map((c: any) => {
          const player = state.players.find((p: any) => p.internalId === (c.internalId || c.playerId)) || c;
          const team = contestTeams.find((t: any) => Number(t.id ?? t.tid) === Number(player.tid));
          return mapPlayerToContestant(
            player,
            team?.abbrev ?? '',
            team ? getResolvedTeamLogoUrl(team, state.leagueStats.year) : undefined,
            state.leagueStats.year,
          );
        });
        return (
          <div className="fixed inset-0 z-[100] bg-black overflow-y-auto">
            <ThreePointContest
              contestants={threeContestants}
              onClose={() => setWatchingThreePoint(false)}
              onComplete={handleThreeComplete}
            />
          </div>
        );
      })()}

      {!euroIsolated && (
        <AllStarSatelliteLiveContestOverlay
          active={satelliteLiveContest}
          contestTeams={contestTeams as NBATeam[]}
          onClose={() => setSatelliteLiveContest(null)}
        />
      )}

      {allStarModalTab && !euroIsolated && (
        <AllStarRosterModal
          tab={allStarModalTab}
          allStar={state.allStar}
          state={state}
          onClose={() => setAllStarModalTab(null)}
          onGoToAllStar={() => {
            setAllStarModalTab(null);
            setCurrentView('All-Star' as Tab);
          }}
        />
      )}

      {contestModalType && !euroIsolated && (
        <ContestDetailsModal
          type={contestModalType}
          state={state}
          onClose={() => setContestModalType(null)}
        />
      )}

      {pendingDanceGame && !watchingDance && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-blue-500/30 bg-slate-950 p-6 shadow-2xl">
            <Music2 className="text-blue-400" size={30} />
            <h2 className="mt-4 text-2xl font-black text-white">Watch the Dance Contest first?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              The All-Star teams perform before the main game. Watch the routines or pass straight to the saved result.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setWatchingDance(true)} className="rounded-xl bg-blue-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-white hover:bg-blue-400">
                Watch Dance Contest
              </button>
              <button
                type="button"
                onClick={async () => {
                  const game = pendingDanceGame;
                  const result = simulateDanceContest(state.allStar?.roster ?? []);
                  if (result) await saveDanceResult(result);
                  setPendingDanceGame(null);
                  setPendingWatchGame(game);
                }}
                className="rounded-xl bg-slate-800 px-4 py-3 text-sm font-black uppercase tracking-wider text-slate-200 hover:bg-slate-700"
              >
                Pass & Continue
              </button>
            </div>
            <button type="button" onClick={() => setPendingDanceGame(null)} className="mt-3 w-full py-2 text-xs font-bold text-slate-500 hover:text-white">
              Not now
            </button>
          </div>
        </div>
      )}

      {pendingDanceGame && watchingDance && (
        <div className="fixed inset-0 z-[115] overflow-y-auto bg-black p-4 md:p-8">
          <DanceContestMiniGame
            roster={state.allStar?.roster ?? []}
            players={state.players}
            teams={[...(state.teams ?? []), ...(state.nonNBATeams ?? [])]}
            result={state.allStar?.danceContest}
            onSave={result => {
              void saveDanceResult(result);
            }}
            onExit={() => {
              const game = pendingDanceGame;
              setWatchingDance(false);
              setPendingDanceGame(null);
              setPendingWatchGame(game);
            }}
          />
        </div>
      )}

      <AnimatePresence>
        {pendingWatchGame && pendingWatchPresentation && (
            <WatchGamePreviewModal
              game={pendingWatchGame}
              homeTeam={pendingWatchPresentation.home.team}
              awayTeam={pendingWatchPresentation.away.team}
              players={state.players}
              homeStartersOverride={pendingWatchPresentation.home.roster}
              awayStartersOverride={pendingWatchPresentation.away.roster}
              onClose={() => setPendingWatchGame(null)}
              onConfirm={async (rig, watchLive) => {
                if (watchLive === false) {
                  rosterGate.attempt(() => draftGate.attempt(() => dispatchAction({ type: 'ADVANCE_DAY', payload: rig !== undefined ? { riggedForTid: rig } : undefined } as any)));
                  setPendingWatchGame(null);
                } else {
                  // Pre-simulate the game and record the result BEFORE opening the watch screen.
                  // This makes Leave Game a pure exit button — no re-simulation on close.
                  const game = pendingWatchGame;
                  const homeOverride = getPlayersForExhibitionTeam(game, true, state.allStar, state.players, state.leagueType);
                  const awayOverride = getPlayersForExhibitionTeam(game, false, state.allStar, state.players, state.leagueType);
                  const prepared = GameSimulator.prepareDayGames(
                    state.teams,
                    state.players,
                    [game],
                    game.date,
                    50,
                    state.allStar,
                    homeOverride?.length ? homeOverride : undefined,
                    awayOverride?.length ? awayOverride : undefined,
                    rig,
                    state.leagueStats,
                  );
                  const simResult = GameSimulator.simulatePreparedDayGames(prepared)[0];
                  const presentation = prepared[0]?.presentation;
                  if (!simResult || !presentation) throw new Error(`Unable to prepare watched game ${game.gid}`);
                  console.log(`[WatchGame] pre-sim done — home=${simResult.homeScore} away=${simResult.awayScore} gid=${simResult.gameId}`);
                  await dispatchAction({ type: 'RECORD_WATCHED_GAME' as any, payload: { gameId: game.gid, result: simResult } });
                  setPrecomputedWatchResult(simResult);
                  setWatchPresentation(presentation);
                  setRiggedForTid(rig);
                  setWatchingGame(game);
                  setPendingWatchGame(null);
                  setViewMode('watching');
                }
              }}
            />
        )}

        {selectedBoxScoreGame && (
          <BoxScoreModal
            game={selectedBoxScoreGame}
            result={findBoxScoreForScheduledGame(state.boxScores, selectedBoxScoreGame)}
            homeTeam={(() => {
              const tid = selectedBoxScoreGame.homeTid;
              if (tid >= 100) {
                return resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []) ?? getTeamForGame(tid, state.teams);
              }
              // For fake/exhibition teams (tid < 0), prefer the name stored in the box score
              // so Rising Stars bracket teams show their real names (Team Melo, G League, etc.)
              if (tid < 0) {
                const bs = findBoxScoreForScheduledGame(state.boxScores, selectedBoxScoreGame);
                const base = getTeamForGame(tid, state.teams);
                if (bs?.homeTeamName) return { ...base, name: bs.homeTeamName, abbrev: bs.homeTeamAbbrev ?? base.abbrev };
                return base;
              }
              return getTeamForGame(tid, state.teams);
            })()}
            awayTeam={(() => {
              const tid = selectedBoxScoreGame.awayTid;
              if (tid >= 100) {
                return resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []) ?? getTeamForGame(tid, state.teams);
              }
              if (tid < 0) {
                const bs = findBoxScoreForScheduledGame(state.boxScores, selectedBoxScoreGame);
                const base = getTeamForGame(tid, state.teams);
                if (bs?.awayTeamName) return { ...base, name: bs.awayTeamName, abbrev: bs.awayTeamAbbrev ?? base.abbrev };
                return base;
              }
              return getTeamForGame(tid, state.teams);
            })()}
            players={state.players}
            onClose={() => setSelectedBoxScoreGame(null)}
            onPlayerClick={p => setBoxScoreClickedPlayer(p)}
            playoffs={state.playoffs}
            schedule={visibleSchedule}
          />
        )}

      {boxScoreClickedPlayer && (
          <PlayerRatingsModal
            player={boxScoreClickedPlayer}
            season={state.leagueStats?.year ?? new Date().getFullYear()}
            onClose={() => setBoxScoreClickedPlayer(null)}
          />
        )}
      </AnimatePresence>

      {rosterGate.modal}
      {draftGate.modal}
      {boundaryPreflight.modal}
      <AnimatePresence>
        {offseasonBlockOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOffseasonBlockOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-[#111] border border-white/10 rounded-[32px] p-10 max-w-lg w-full shadow-2xl"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300 mb-3">Offseason Calendar</p>
              <h3 className="text-3xl font-black text-white uppercase tracking-tight mb-4">Use Offseason Tasks</h3>
              <p className="text-slate-300 text-sm mb-4 leading-relaxed">
                Draft, free agency, training camp, and summer reviews are handled from the offseason task list.
              </p>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                Advance there to keep each league event in the right order.
              </p>
              <button
                onClick={() => setOffseasonBlockOpen(false)}
                className="w-full px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-2xl font-black uppercase tracking-widest text-xs transition-colors"
              >
                Got It
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Confirmation Modal --- */}
      <AnimatePresence>
        {modalConfig.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeConfirmModal}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-[#111] border border-white/10 rounded-[40px] p-12 max-w-lg w-full shadow-2xl"
            >
              <h3 className="text-4xl font-black text-white uppercase tracking-tighter mb-6">{modalConfig.title}</h3>
              <p className="text-slate-400 text-lg mb-10 leading-relaxed">{modalConfig.message}</p>
              <div className="flex gap-4">
                <button 
                  onClick={closeConfirmModal}
                  className="flex-1 px-8 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    modalConfig.onConfirm();
                    closeConfirmModal();
                  }}
                  className="flex-1 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-xl shadow-indigo-500/20"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
