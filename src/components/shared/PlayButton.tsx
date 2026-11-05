import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronDown, Play } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { normalizeDate } from '../../utils/helpers';
import {
  getTradeDeadlineDate, getDraftLotteryDate, getDraftDate,
  getCurrentOffseasonEffectiveFAStart, getOpeningNightDate, getTrainingCampDate,
  getCurrentOffseasonFAMoratoriumEnd, toISODateString,
  formatGameDateShort, getRolloverDate,
} from '../../utils/dateUtils';
import { Tab } from '../../types';
import { useDraftEventGate } from '../../hooks/useDraftEventGate';
import { useSimulationBoundaryPreflight } from '../../hooks/useSimulationBoundaryPreflight';
import { getCentralFreeAgencyDays } from '../../services/freeAgency/freeAgencyDecisionTiming';
import { useRosterComplianceGate } from '../../hooks/useRosterComplianceGate';
import { useTeamOptionGate } from '../../hooks/useTeamOptionGate';
import { useExpiringResignGate } from '../../hooks/useExpiringResignGate';
import { useTycoonYearEndGate } from '../../hooks/useTycoonYearEndGate';
import {
  computeUpcomingSeasonYear,
  isNoDraftLeague,
} from '../../services/offseason/offseasonState';
import {
  firstUnfinishedRow,
  getOffseasonBlockingRow,
  getOffseasonRowLabel,
  getVisibleOffseasonRows,
  withGovernorsBoardMeetingTask,
} from '../../services/offseason/offseasonChecklistState';
import { resolveOffseasonTaskView } from '../../services/offseason/offseasonTaskNavigation';
import { isEuroIsolatedMode, isPbaActiveConferenceMode, isPbaIsolatedMode, isPbaOffseasonMode } from '../../utils/uiMode';
import { getManagedEuroCompetitions } from '../../utils/euroLeagueDefaults';
import { isInTransferWindow } from '../../utils/transferWindow';
import { getEuroOffseasonMarketProgress } from '../../services/offseason/euroOffseasonMarkets';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { autoRunDraft } from '../../services/logic/autoResolversParts/draftResolvers';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import {
  addDays,
  addDaysToDate,
  clampToToday,
  competitionRegularComplete,
  competitionRoundDate,
  findFirstCompetitionDate,
  findFirstPlayInDate,
  findFirstPreseasonDate,
  findFirstRegularSeasonDate,
  findFirstTruePlayoffDate,
  findLastCompetitionDate,
  findLastCompetitionRegularDate,
  findLastPreseasonDate,
  findLastRegSeasonDate,
  findLastTruePlayoffDate,
  findPlayInEndDate,
  findPlayoffRoundEndDate,
  getEuroCompetitionTarget,
  getEuroPhaseLabel,
  getPbaConferencePlayState,
  getPhaseLabel,
  getSimPhase,
  minScheduledDate,
  type PlayOption,
  pushFutureOption,
} from './playButtonOptions';
import { getPbaFirstPlayoffDate, inferPbaConferenceSeasonYear } from '../../services/pba/conferenceTransition';
import { resolveLeagueSeasonLifecycle } from '../../services/lifecycle/leagueSeasonLifecycle';
import { isLotteryBoundaryOwnedByTargetPlan } from '../../services/lifecycle/calendarEventDisposition';
import {
  alignInternationalTournamentToDate,
  nextInternationalTournamentGameDate,
  simulateRemainingInternationalTournament,
  simulateInternationalTournamentToTarget,
  type InternationalTournamentSimTarget,
} from '../../services/fiba/playTournament';
import {
  getBlockingCommissionerTask,
} from '../../services/commissionerTasks/taskRegistry';
import { getNextPbaLocalFreeAgencyDay } from '../../services/pba/localFreeAgencyAi';
import { getAllStarWeekendDates } from '../../services/allStar/allStarWeekendDates';
import { isPbaAllStarWeekendPending } from '../../services/pba/allStar';
import { getLeagueCalendarDates } from '../../services/leagueCalendar';
import {
  createDraftLotterySimulationPayload,
  createOffseasonSimulationPayload,
  getAllStarEventsSimulationTarget,
} from '../../services/offseason/playSimulationTargets';
import {
  compileTargetPlan,
  isDraftLotteryActionAvailable,
  isDraftLotteryEvidenceComplete,
  type TargetPlan,
  type TargetName,
} from '../../services/simulation/targetPlanner';
import { TimeService } from '../../services/time/TimeService';

interface PlayButtonProps {
  setCurrentView: (v: Tab) => void;
}

const maxIsoDate = (dates: Array<string | null | undefined>): string | null =>
  dates
    .filter((date): date is string => Boolean(date))
    .map(normalizeDate)
    .sort()
    .at(-1) ?? null;

export const PlayButton: React.FC<PlayButtonProps> = ({ setCurrentView }) => {
  const { state, dispatchAction, currentView } = useGame();
  const lifecycle = useMemo(() => resolveLeagueSeasonLifecycle(state), [state.seasonLifecycle, state.draftLotteryResult, state.activeDraftPicks, state.activeDraftPassedPicks, state.history, state.players, state.leagueStats]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const norm = normalizeDate(state.date);
  const ls = state.leagueStats;
  const seasonYear: number = ls?.year ?? new Date(state.date).getUTCFullYear();
  const seasonCalendarDates = getLeagueCalendarDates(seasonYear, ls);
  const playInCalendarStr = toISODateString(seasonCalendarDates.playInStart);
  const playoffCalendarStr = toISODateString(seasonCalendarDates.playoffStart);
  const calDate = new Date(`${norm}T00:00:00Z`);
  const calYear = calDate.getUTCFullYear();
  const calMonth = calDate.getUTCMonth() + 1;
  const isEuro = isEuroIsolatedMode(state);
  const isPba = isPbaIsolatedMode(state);
  const centralFreeAgencyDays = getCentralFreeAgencyDays(state);
  const preseasonSeasonYear = isPba
    ? computeUpcomingSeasonYear(calMonth, calYear, ls?.year ?? calYear, ls as any, calDate.getUTCDate())
    : seasonYear;
  const noDraft = isNoDraftLeague(ls);
  const transferWindowStatus = useMemo(
    () => (isEuro ? isInTransferWindow(state.date ?? new Date(), state.leagueStats as any) : null),
    [isEuro, state.date, state.leagueStats],
  );
  const unresolvedEuroTransferMarket = isEuro && state.offseasonChecklist?.transferMarket !== 'done' && state.offseasonChecklist?.transferMarket !== 'skipped';
  const transferMarketProgress = useMemo(
    () => unresolvedEuroTransferMarket ? getEuroOffseasonMarketProgress(state.date, 'transfer') : null,
    [state.date, unresolvedEuroTransferMarket],
  );
  const euroSigningProgress = useMemo(
    () => isEuro && state.offseasonChecklist?.freeAgency === 'in-progress'
      ? getEuroOffseasonMarketProgress(state.date, 'signing')
      : null,
    [isEuro, state.date, state.offseasonChecklist?.freeAgency],
  );
  const fictionalFantasyDraftPending = state.leagueType === 'fictional'
    && state.leagueStats.fictionalRosterMode === 'fantasy_draft'
    && state.leagueStats.fictionalFantasyDraftCompleted !== true
    && lifecycle.draft.draft !== 'complete';

  const phase = getSimPhase(state);
  const phaseLabel = useMemo(() => {
    if (euroSigningProgress) {
      return `Signing Market · Day ${euroSigningProgress.current}/${euroSigningProgress.total}`;
    }
    if (!isEuro && !isPba && (state.faTagCounter ?? 0) > 0) {
      return `Free Agency · Day ${state.faTagCounter}/${centralFreeAgencyDays}`;
    }
    if (
      isPba
      && state.offseasonChecklist?.pbaLocalFreeAgency === 'in-progress'
      && state.pbaLocalFreeAgency?.status === 'open'
    ) {
      return `Free Agency · Day ${getNextPbaLocalFreeAgencyDay(state)}/${state.pbaLocalFreeAgency.totalDays}`;
    }
    const tournament = state.internationalTournament;
    if (currentView === 'International' && tournament && tournament.status !== 'reviewed') {
      return `${tournament.year} ${tournament.kind === 'world-cup' ? 'FIBA World Cup' : 'Olympic Games'}`;
    }
    if (isPba) {
      const currentConference = (state.leagueStats as any)?.pbaConference ?? 'philippine';
      const currentSpec = currentConference === 'commissioners'
        ? PBA_COMPETITIONS[1]
        : currentConference === 'governors'
          ? PBA_COMPETITIONS[2]
          : PBA_COMPETITIONS[0];
      const currentPbaSeasonYear = inferPbaConferenceSeasonYear(state as any, currentConference);
      const upcomingGames = getPbaConferencePlayState(state, currentSpec, currentPbaSeasonYear).unplayedGames;
      const nextPhase = upcomingGames[0]?.competitionPhase;
      if (nextPhase === 'play-in' || nextPhase === 'qf' || nextPhase === 'sf' || nextPhase === 'final') return `${currentSpec.shortName} playoffs`;
      if (nextPhase === 'group' || nextPhase?.startsWith('r')) return `${currentSpec.shortName} regular season`;
      if (isPbaOffseasonMode(state)) return `${currentSpec.shortName} offseason`;
      return `${currentSpec.shortName} season`;
    }
    return isEuro
      ? getEuroPhaseLabel(state, seasonYear)
      : getPhaseLabel(phase, seasonYear, calYear, lifecycle.draft.lottery === 'complete');
  }, [currentView, euroSigningProgress, isEuro, isPba, state, seasonYear, phase, calYear]);
  const isCommissioner = state.gameMode !== 'gm';
  const euroCompetitionState = useMemo(() => {
    const activeCompetitions = getManagedEuroCompetitions(state as any);
    const visibleCompetitionIds = new Set(activeCompetitions.map(competition => competition.id));
    return {
    activeCompetitions,
    leagueStats: state.leagueStats,
    userTeamId: state.userTeamId,
    gameMode: state.gameMode,
    teams: state.teams,
    nonNBATeams: state.nonNBATeams,
    schedule: state.schedule.filter(game => !game.competitionId || visibleCompetitionIds.has(game.competitionId)),
    boxScores: state.boxScores,
    clubAliasMap: (state as any).clubAliasMap,
    euroPrimaryCompetitionId: state.euroPrimaryCompetitionId,
    euroCompetitionTeamTids: state.euroCompetitionTeamTids,
  };
  }, [
    state.activeCompetitions,
    state.leagueStats,
    state.userTeamId,
    state.gameMode,
    state.teams,
    state.nonNBATeams,
    state.schedule,
    state.boxScores,
    (state as any).clubAliasMap,
    state.euroPrimaryCompetitionId,
    state.euroCompetitionTeamTids,
  ]);

  const draftGate = useDraftEventGate({
    onNavigateToDraftLottery: () => setCurrentView('Draft Lottery' as Tab),
    onNavigateToDraft: () => setCurrentView('Draft Board' as Tab),
  });
  const {
    attempt: attemptSimulationBoundaryPreflight,
    modal: simulationBoundaryPreflightModal,
  } = useSimulationBoundaryPreflight(state);
  const rosterGate = useRosterComplianceGate();
  const teamOptionGate = useTeamOptionGate({
    onNavigateManual: () => setCurrentView('Team Office' as Tab),
  });
  const expiringGate = useExpiringResignGate({
    onNavigateManual: () => setCurrentView('Team Office' as Tab),
  });
  const tycoonYearEndGate = useTycoonYearEndGate();

  const guardedSim = useCallback((
    fn: (resolvedTargetPlan?: TargetPlan) => void | Promise<void>,
    targetDate?: string,
    targetPlan?: TargetPlan,
  ) => {
    const continueWithPlan = (resolvedTargetPlan?: TargetPlan) => {
      if (fictionalFantasyDraftPending) {
        setCurrentView('Draft Board' as Tab);
        return;
      }
      const commissionerTask = targetDate ? getBlockingCommissionerTask(state, targetDate) : null;
      const simulationOwnsLotteryTask = commissionerTask?.taskId === 'draft_lottery'
        && isLotteryBoundaryOwnedByTargetPlan(resolvedTargetPlan);
      const simulationOwnsOffseasonFlow = resolvedTargetPlan?.name === 'TO_OFFSEASON';
      if (commissionerTask && !simulationOwnsLotteryTask && !simulationOwnsOffseasonFlow) {
        setOpen(false);
        if (commissionerTask.openDate > norm) {
          expiringGate.attempt(() => {
            teamOptionGate.attempt(() => {
              rosterGate.attempt(() => {
                tycoonYearEndGate.attempt(() => {
                  void dispatchAction({
                    type: 'SIMULATE_TO_DATE',
                    payload: { targetDate: commissionerTask.openDate, stopBefore: true },
                  } as any).then(() => setCurrentView('Commissioner Tasks' as Tab));
                }, commissionerTask.openDate);
              });
            }, commissionerTask.openDate);
          }, commissionerTask.openDate);
          return;
        }
        setCurrentView('Commissioner Tasks' as Tab);
        return;
      }
      const runAfterContractGates = () => {
        rosterGate.attempt(() => {
          draftGate.attempt(() => {
            tycoonYearEndGate.attempt(async () => {
              await fn(resolvedTargetPlan);
              if (
                resolvedTargetPlan?.confirmedBoundaries.includes('DRAFT_LOTTERY')
                && resolvedTargetPlan.boundaryPolicy.draftLottery === 'STOP_AND_WATCH'
              ) {
                setCurrentView('Draft Lottery' as Tab);
              } else if (
                resolvedTargetPlan?.confirmedBoundaries.includes('ALL_STAR_WEEKEND')
                && resolvedTargetPlan.boundaryPolicy.allStarWeekend === 'STOP_AND_WATCH'
              ) {
                setCurrentView('All-Star' as Tab);
              }
            }, targetDate);
          }, resolvedTargetPlan);
        });
      };
      if (simulationOwnsOffseasonFlow) {
        // This command explicitly delegates offseason decisions to the
        // simulation runner, which resolves them on their real calendar date.
        // Opening contract gates now would surface June decisions in April.
        runAfterContractGates();
      } else {
        expiringGate.attempt(() => {
          teamOptionGate.attempt(runAfterContractGates, targetDate);
        }, targetDate);
      }
    };
    if (targetPlan) {
      attemptSimulationBoundaryPreflight(targetPlan, continueWithPlan);
      return;
    }
    continueWithPlan();
  }, [attemptSimulationBoundaryPreflight, dispatchAction, draftGate, expiringGate, fictionalFantasyDraftPending, norm, rosterGate, setCurrentView, state, teamOptionGate, tycoonYearEndGate]);

  const simDay = useCallback(() => {
    setOpen(false);
    const targetDate = TimeService.addSimulationDays(norm, 1);
    const targetPlan = compileTargetPlan(state, 'ONE_DAY', targetDate);
    guardedSim(resolvedTargetPlan => dispatchAction({
      type: 'ADVANCE_DAY',
      payload: { targetPlan: resolvedTargetPlan ?? targetPlan },
    } as any), targetDate, targetPlan);
  }, [dispatchAction, guardedSim, norm, state]);

  const simToDate = useCallback((date: string, targetName: TargetName = 'SIMULATE_TO_DATE') => {
    setOpen(false);
    const targetPlan = compileTargetPlan(state, targetName, date);
    guardedSim(
      resolvedTargetPlan => dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: date, stopBefore: true, targetPlan: resolvedTargetPlan ?? targetPlan },
      } as any),
      date,
      targetPlan,
    );
  }, [dispatchAction, guardedSim, state]);

  const simThrough = useCallback((date: string, targetName: TargetName = 'SIMULATE_TO_DATE') => {
    setOpen(false);
    const targetPlan = compileTargetPlan(state, targetName, date);
    guardedSim(
      resolvedTargetPlan => dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: date, targetPlan: resolvedTargetPlan ?? targetPlan },
      } as any),
      date,
      targetPlan,
    );
  }, [dispatchAction, guardedSim, state]);

  const watchNextGame = useCallback((date: string) => {
    const target = TimeService.normalize(date);
    const nextGame = TimeService.nextUnplayedGame(norm, state.schedule, target);
    if (!nextGame) return;
    setOpen(false);
    const targetPlan = compileTargetPlan(state, 'UNTIL_NEXT_GAME', nextGame.date);
    guardedSim(async resolvedTargetPlan => {
      await dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: {
          targetDate: nextGame.date,
          stopBefore: true,
          targetPlan: resolvedTargetPlan ?? targetPlan,
        },
      } as any);
      await dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingScheduleFocus: { date: TimeService.normalize(nextGame.date), gameId: nextGame.gid } },
      } as any);
      setCurrentView('Schedule' as Tab);
    }, nextGame.date, targetPlan);
  }, [dispatchAction, guardedSim, norm, setCurrentView, state]);

  const simToPlayoffs = useCallback((date: string) => {
    setOpen(false);
    const targetPlan = compileTargetPlan(state, 'TO_PLAYOFFS', date);
    guardedSim(async resolvedTargetPlan => {
      await dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: date, stopBefore: true, targetPlan: resolvedTargetPlan ?? targetPlan },
      } as any);
      setCurrentView('Playoffs' as Tab);
    }, date, targetPlan);
  }, [dispatchAction, guardedSim, setCurrentView, state]);

  const skipToPreseason = useCallback((date: string) => {
    setOpen(false);
    const confirmed = window.confirm(
      'Skip the remaining applicable offseason responsibilities for this season and begin preseason? Manual blockers will remain unresolved.',
    );
    if (!confirmed) return;
    void dispatchAction({
      type: 'OFFSEASON_EXIT',
      payload: {
        assistantGM: true,
        manualBlockers: state.manualOffseasonBlockers,
        targetPlan: compileTargetPlan(state, 'SKIP_TO_PRESEASON', date),
      },
    } as any).then(() => setCurrentView('Schedule' as Tab));
  }, [dispatchAction, setCurrentView, state]);

  const simToOffseason = useCallback((date: string) => {
    setOpen(false);
    const payload = createOffseasonSimulationPayload(date, state);
    guardedSim(
      resolvedTargetPlan => dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { ...payload, targetPlan: resolvedTargetPlan ?? payload.targetPlan },
      } as any),
      date,
      payload.targetPlan,
    );
  }, [dispatchAction, guardedSim, state]);

  const simToDraftLottery = useCallback((date: string) => {
    setOpen(false);
    if (isDraftLotteryEvidenceComplete(state)) {
      setCurrentView(resolveOffseasonTaskView('draftOrderReview', state));
      return;
    }
    const payload = createDraftLotterySimulationPayload(date, state);
    guardedSim(
      async resolvedTargetPlan => {
        await dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { ...payload, targetPlan: resolvedTargetPlan ?? payload.targetPlan },
        } as any);
        setCurrentView('Draft Lottery' as Tab);
      },
      date,
      payload.targetPlan,
    );
  }, [dispatchAction, guardedSim, setCurrentView, state]);

  const simToPbaPlayoffs = useCallback((date: string) => {
    setOpen(false);
    guardedSim(
      async () => {
        await dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { targetDate: date, stopBefore: true },
        } as any);
        setCurrentView('Playoffs' as Tab);
      },
      date,
    );
  }, [dispatchAction, guardedSim, setCurrentView]);

  const simDraftToEnd = useCallback(() => {
    setOpen(false);
    const targetDate = addDays(norm, 1);
    guardedSim(
      () => dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate, stopBefore: true, assistantGM: true },
      } as any),
      targetDate,
    );
  }, [dispatchAction, guardedSim, norm]);

  const simPbaDraftToEnd = useCallback(() => {
    setOpen(false);
    const patch = autoRunDraft(state as any);
    if ((patch as any)?.draftComplete) {
      dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaDraft' } } as any);
    } else {
      setCurrentView('Draft Board' as Tab);
    }
  }, [dispatchAction, setCurrentView, state]);

  const navigate = useCallback((view: Tab) => {
    setOpen(false);
    setCurrentView(view);
  }, [setCurrentView]);

  const simInternationalTo = useCallback(async (target: InternationalTournamentSimTarget) => {
    setOpen(false);
    const tournament = state.internationalTournament;
    if (!tournament || ['complete', 'reviewed'].includes(tournament.status)) return;
    await dispatchAction({ type: 'UPDATE_STATE', payload: { isProcessing: true, simCurrentDate: norm } } as any);
    await new Promise(resolve => window.setTimeout(resolve, 350));
    const trainingCampDate = toISODateString(getTrainingCampDate(preseasonSeasonYear, ls));
    const aligned = alignInternationalTournamentToDate(tournament, norm);
    const playedBefore = new Set(aligned.games.filter(game => game.played).map(game => game.id));
    const next = simulateInternationalTournamentToTarget(
      aligned,
      state.players,
      target,
      state.stats.playerApproval,
      { stopBeforeDate: trainingCampDate },
    );
    const newlyPlayedDates = next.games
      .filter(game => game.played && !playedBefore.has(game.id))
      .map(game => game.date)
      .sort();
    const nextGameDate = next.games.filter(game => !game.played).map(game => game.date).sort()[0];
    const lastAllowedDate = addDays(trainingCampDate, -1);
    const requestedDate = target === 'day'
      ? newlyPlayedDates.length > 0 ? addDays(newlyPlayedDates[newlyPlayedDates.length - 1], 1) : norm
      : nextGameDate ?? (newlyPlayedDates.length > 0 ? addDays(newlyPlayedDates[newlyPlayedDates.length - 1], 1) : norm);
    const nextDate = requestedDate > lastAllowedDate
      ? lastAllowedDate
      : requestedDate < norm ? norm : requestedDate;
    const daysAdvanced = Math.max(0, Math.round(
      (Date.parse(`${nextDate}T00:00:00Z`) - Date.parse(`${norm}T00:00:00Z`)) / 86_400_000,
    ));
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        internationalTournament: next,
        date: formatGameDateShort(nextDate),
        day: state.day + daysAdvanced,
        isProcessing: false,
        simCurrentDate: undefined,
      },
    } as any);
  }, [dispatchAction, ls, norm, preseasonSeasonYear, state.day, state.internationalTournament, state.players, state.stats.playerApproval]);

  const goToNextInternationalGameDay = useCallback(async () => {
    setOpen(false);
    const tournament = state.internationalTournament;
    if (!tournament || tournament.readOnly || ['complete', 'reviewed'].includes(tournament.status)) return;
    const aligned = alignInternationalTournamentToDate(tournament, norm);
    const nextDate = nextInternationalTournamentGameDate(aligned);
    if (!nextDate || nextDate <= norm) return;
    const trainingCampDate = toISODateString(getTrainingCampDate(preseasonSeasonYear, ls));
    if (nextDate >= trainingCampDate) return;
    await dispatchAction({ type: 'UPDATE_STATE', payload: { isProcessing: true, simCurrentDate: norm } } as any);
    await new Promise(resolve => window.setTimeout(resolve, 350));
    const daysAdvanced = Math.max(0, Math.round(
      (Date.parse(`${nextDate}T00:00:00Z`) - Date.parse(`${norm}T00:00:00Z`)) / 86_400_000,
    ));
    await dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        internationalTournament: aligned,
        date: formatGameDateShort(nextDate),
        day: state.day + daysAdvanced,
        isProcessing: false,
        simCurrentDate: undefined,
      },
    } as any);
  }, [dispatchAction, ls, norm, preseasonSeasonYear, state.day, state.internationalTournament]);

  const simInternationalToNextTask = useCallback(async () => {
    setOpen(false);
    const tournament = state.internationalTournament;
    if (!tournament || ['complete', 'reviewed'].includes(tournament.status)) return;
    await dispatchAction({ type: 'UPDATE_STATE', payload: { isProcessing: true, simCurrentDate: norm } } as any);
    await new Promise(resolve => window.setTimeout(resolve, 350));
    const aligned = alignInternationalTournamentToDate(tournament, norm);
    const completed = tournament.readOnly
      ? aligned
      : simulateRemainingInternationalTournament(aligned, state.players, state.stats.playerApproval);
    const lastPlayedDate = completed.games.map(game => game.date).sort().at(-1) ?? norm;
    const trainingCampDate = toISODateString(getTrainingCampDate(preseasonSeasonYear, ls));
    const requestedDate = addDays(lastPlayedDate, 1);
    const cappedDate = requestedDate >= trainingCampDate ? addDays(trainingCampDate, -1) : requestedDate;
    const nextDate = cappedDate < norm ? norm : cappedDate;
    const daysAdvanced = Math.max(0, Math.round(
      (Date.parse(`${nextDate}T00:00:00Z`) - Date.parse(`${norm}T00:00:00Z`)) / 86_400_000,
    ));
    await dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        internationalTournament: completed,
        date: formatGameDateShort(nextDate),
        day: state.day + daysAdvanced,
        isProcessing: false,
        simCurrentDate: undefined,
      },
    } as any);
    await dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'internationalTournament' } } as any);
  }, [dispatchAction, ls, norm, preseasonSeasonYear, state.day, state.internationalTournament, state.players, state.stats.playerApproval]);

  const options: PlayOption[] = useMemo(() => {
    const pbaFreeAgency = isPba
      && state.offseasonChecklist?.pbaLocalFreeAgency === 'in-progress'
      && state.pbaLocalFreeAgency?.status === 'open';
    const taggedFreeAgency = !isEuro && !isPba && (state.faTagCounter ?? 0) > 0;
    if (pbaFreeAgency || taggedFreeAgency) {
      const day = pbaFreeAgency
        ? getNextPbaLocalFreeAgencyDay(state)
        : state.faTagCounter ?? 1;
      const total = pbaFreeAgency
        ? state.pbaLocalFreeAgency?.totalDays ?? 15
        : centralFreeAgencyDays;
      return [
        {
          label: `Sim Free Agency — ${day}/${total}`,
          action: () => {
            setOpen(false);
            dispatchAction({
              type: pbaFreeAgency
                ? 'OFFSEASON_ADVANCE_PBA_LOCAL_FA_DAY'
                : 'OFFSEASON_ADVANCE_FA_TAG',
            } as any);
          },
        },
        {
          label: 'Skip to Next Task',
          action: () => {
            setOpen(false);
            dispatchAction({ type: 'OFFSEASON_SKIP_FREE_AGENCY' } as any);
          },
        },
      ];
    }
    if (euroSigningProgress) {
      return [
        {
          label: `Sim Signing Day — ${euroSigningProgress.current}/${euroSigningProgress.total}`,
          action: () => {
            setOpen(false);
            dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
          },
        },
        {
          label: 'End Signing Market',
          action: () => {
            setOpen(false);
            dispatchAction({ type: 'OFFSEASON_SKIP_FREE_AGENCY' } as any);
          },
        },
      ];
    }
    const internationalTournament = state.internationalTournament;
    if (currentView === 'International' && internationalTournament) {
      if (internationalTournament.readOnly) return [];
      if (internationalTournament.status === 'complete') {
        return [{ label: 'Review Tournament', action: () => navigate('International' as Tab) }];
      }
      if (internationalTournament.status !== 'reviewed') {
        const hasPlayed = (phaseName: string) => internationalTournament.games.some(game =>
          (game.phase === phaseName || game.groupStage === phaseName) && game.played,
        );
        const nextGameDate = nextInternationalTournamentGameDate(internationalTournament);
        const hasGamesToday = !!nextGameDate && nextGameDate <= norm;
        const nextKnockoutGame = internationalTournament.games
          .filter(game => !game.played && !['group', 'classification'].includes(game.phase))
          .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))[0];
        const opts: PlayOption[] = hasGamesToday
          ? [
              { label: "Open Today's Games", action: () => navigate('International' as Tab) },
              { label: 'Simulate Day', action: () => simInternationalTo('day') },
            ]
          : [{ label: 'Go to Next Game Day', action: goToNextInternationalGameDay }];
        if (nextKnockoutGame) {
          opts.push({ label: 'Simulate Round', action: () => simInternationalTo('round') });
        }
        if (internationalTournament.kind === 'world-cup' && internationalTournament.teams.length >= 16) {
          if (!hasPlayed('second-round')) {
            opts.push({ label: 'Until Second Round', action: () => simInternationalTo('second-round') });
          }
          if (!hasPlayed('classification')) {
            opts.push({ label: 'Until Class. Games 17-32', action: () => simInternationalTo('classification') });
          }
        }
        if (!hasPlayed('quarterfinal')) {
          opts.push({ label: 'Until Quarter Finals', action: () => simInternationalTo('quarterfinal') });
        }
        if (!hasPlayed('semifinal')) {
          opts.push({ label: 'Until Semifinals', action: () => simInternationalTo('semifinal') });
        }
        if (!hasPlayed('third-place')) {
          opts.push({ label: 'Until 3rd Place', action: () => simInternationalTo('third-place') });
        }
        if (!hasPlayed('final')) {
          opts.push({ label: 'Until Final', action: () => simInternationalTo('final') });
        }
        opts.push({ label: 'Simulate to Next Task', action: simInternationalToNextTask });
        return opts;
      }
    }
    if (isPba) {
      const currentConference = (state.leagueStats as any)?.pbaConference ?? 'philippine';
      const currentSpec = currentConference === 'commissioners'
        ? PBA_COMPETITIONS[1]
        : currentConference === 'governors'
          ? PBA_COMPETITIONS[2]
          : PBA_COMPETITIONS[0];
      const currentPbaSeasonYear = inferPbaConferenceSeasonYear(state as any, currentConference);
      const pbaAllStarDates = getAllStarWeekendDates(currentPbaSeasonYear, state.leagueStats);
      const pbaAllStarStart = toISODateString(pbaAllStarDates.breakStart);
      const pbaAllStarPending = isPbaAllStarWeekendPending(state);
      if (pbaAllStarPending && norm >= pbaAllStarStart) {
        return [{ label: 'Open PBA All-Star Weekend', action: () => navigate('All-Star' as Tab) }];
      }
      const allStarBlocksTarget = (date: string | null) =>
        pbaAllStarPending && norm < pbaAllStarStart && !!date && date >= pbaAllStarStart;
      const addAllStarTarget = (options: PlayOption[]) => {
        if (!options.some(option => option.label === 'To PBA All-Star Weekend')) {
          options.push({ label: 'To PBA All-Star Weekend', action: () => simToDate(pbaAllStarStart) });
        }
      };
      const playoffPhases = ['play-in', 'qf', 'sf', 'final'];
      const conferencePlayState = getPbaConferencePlayState(state, currentSpec, currentPbaSeasonYear);
      const conferenceGames = conferencePlayState.unplayedGames;
      const playoffGames = conferencePlayState.unplayedPostseasonGames;
      const pbaPhase = String((state.leagueStats as any)?.pbaConferencePhase ?? '');
      const nextGame = pbaPhase === 'playoffs' && playoffGames.length > 0 ? playoffGames[0] : conferenceGames[0];
      const nextDate = nextGame ? normalizeDate(nextGame.date) : null;
      const nextPhase = nextGame?.competitionPhase;
      const samePhaseGames = nextPhase
        ? (playoffPhases.includes(String(nextPhase)) ? playoffGames : conferenceGames).filter((game: any) => game.competitionPhase === nextPhase)
        : [];
      const phaseEnd = samePhaseGames.length > 0 ? normalizeDate(samePhaseGames[samePhaseGames.length - 1].date) : null;
      const conferenceEnd = conferenceGames.length > 0 ? normalizeDate(conferenceGames[conferenceGames.length - 1].date) : null;
      const regularComplete = conferencePlayState.regularComplete;
      const firstPlayoffDate = getPbaFirstPlayoffDate(state, currentConference)
        ?? (playoffGames[0] ? normalizeDate(playoffGames[0].date) : null)
        ?? competitionRoundDate(state, currentPbaSeasonYear, currentSpec.id, ['qf', 'quarterfinals'], 'start');
      const firstPlayoffPhase = playoffGames[0]?.competitionPhase;
      const playoffRoundEnd = firstPlayoffPhase
        ? normalizeDate(playoffGames.filter((game: any) => game.competitionPhase === firstPlayoffPhase).at(-1)?.date ?? playoffGames[0].date)
        : regularComplete
          ? competitionRoundDate(state, currentPbaSeasonYear, currentSpec.id, ['qf', 'quarterfinals'], 'end')
          : null;
      const configuredPlayoffEnd = regularComplete
        ? competitionRoundDate(state, currentPbaSeasonYear, currentSpec.id, ['final', 'final-four'], 'end')
        : null;
      const playoffEnd = maxIsoDate([
        playoffGames.at(-1)?.date,
        configuredPlayoffEnd,
      ]);
      const hasNextPlayoff = !!nextPhase && playoffPhases.includes(String(nextPhase));
      const playoffsActive = hasNextPlayoff && conferencePlayState.postseasonMaterialized;
      if (playoffsActive) {
        const playoffOpts: PlayOption[] = [];
        if (nextDate) {
          if (allStarBlocksTarget(nextDate)) addAllStarTarget(playoffOpts);
          else {
            const target = clampToToday(nextDate, norm);
            playoffOpts.push({ label: 'Sim Next Game', action: () => simThrough(target) });
            playoffOpts.push({ label: 'Watch Next Game', action: () => watchNextGame(target) });
          }
        }
        const roundEnd = phaseEnd ?? playoffRoundEnd;
        if (roundEnd) {
          if (allStarBlocksTarget(roundEnd)) addAllStarTarget(playoffOpts);
          else playoffOpts.push({ label: 'Sim Round', action: () => simThrough(clampToToday(roundEnd, norm), 'SIM_ROUND') });
        }
        if (playoffEnd) {
          if (allStarBlocksTarget(playoffEnd)) addAllStarTarget(playoffOpts);
          else playoffOpts.push({ label: 'Sim to Champion', action: () => simThrough(clampToToday(playoffEnd, norm), 'TO_CHAMPION') });
        }
        playoffOpts.push({ label: 'One day', action: simDay });
        return playoffOpts;
      }
      const opts: PlayOption[] = [
        { label: 'One day', action: simDay },
        { label: 'One week', action: () => simToDate(addDays(norm, 7)) },
        { label: 'One month', action: () => simToDate(addDays(norm, 30)) },
      ];
      if (phaseEnd && phaseEnd >= norm) {
        if (hasNextPlayoff) {
          opts.push({ label: 'Sim playoff round', action: () => simThrough(phaseEnd) });
        }
      }
      if (!hasNextPlayoff && regularComplete && firstPlayoffDate && firstPlayoffDate >= norm) {
        if (allStarBlocksTarget(firstPlayoffDate)) addAllStarTarget(opts);
        else opts.push({ label: `To ${currentSpec.shortName} playoffs`, action: () => simToPbaPlayoffs(firstPlayoffDate) });
      }
      if (!hasNextPlayoff && regularComplete && playoffRoundEnd && playoffRoundEnd >= norm) {
        opts.push({ label: 'Sim playoff round', action: () => simThrough(playoffRoundEnd) });
      }
      if (regularComplete && playoffEnd && playoffEnd >= norm) {
        opts.push({
          label: currentConference === 'governors' ? 'Sim to next season' : 'Sim to next conference',
          action: () => simThrough(playoffEnd),
        });
      } else if (!regularComplete && firstPlayoffDate && firstPlayoffDate >= norm) {
        if (allStarBlocksTarget(firstPlayoffDate)) addAllStarTarget(opts);
        else opts.push({ label: `To ${currentSpec.shortName} playoffs`, action: () => simToPbaPlayoffs(firstPlayoffDate) });
      } else if (conferenceEnd && conferenceEnd >= norm) {
        if (allStarBlocksTarget(conferenceEnd)) addAllStarTarget(opts);
        else opts.push({ label: `Through ${currentSpec.shortName} playoffs`, action: () => simThrough(conferenceEnd) });
      }
      if (state.offseasonChecklist && !isPbaActiveConferenceMode(state)) {
        const effectiveChecklist = withGovernorsBoardMeetingTask(
          state.offseasonChecklist,
          state.pendingGovernorsBoardMeeting,
          state.leagueStats?.year,
        )!;
        const visibleRows = getVisibleOffseasonRows(
          state.leagueStats as any,
          null,
          state.date,
          (state as any).expansionSchedule,
          effectiveChecklist,
          {
            lotteryResolved: lifecycle.draft.lottery === 'complete',
            draftComplete: lifecycle.draft.draft === 'complete',
          },
        );
        if (visibleRows.length === 0) return opts;
        const nextRow = firstUnfinishedRow(effectiveChecklist as any, undefined, visibleRows);
        const openTask = (row: any) => {
          if (row === 'strategyReview') {
            dispatchAction({
              type: 'UPDATE_STATE',
              payload: { pendingSeasonStrategyModal: true },
            } as any);
            setOpen(false);
            return;
          }
          if (row === 'governorsBoardMeeting') {
            dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
            setOpen(false);
            return;
          }
          if (row === 'expansionDraft') {
            dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
            navigate('Schedule');
            setOpen(false);
            return;
          }
          const tab = resolveOffseasonTaskView(row, state);
          if (tab) {
            if (row === 'pbaLocalFreeAgency') {
              dispatchAction({
                type: 'UPDATE_STATE',
                payload: {
                  pendingTeamOfficeNav: {
                    tab: 'intel',
                    intelTab: 'fa',
                  },
                },
              } as any);
            }
            dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
            navigate(tab as Tab);
            return;
          }
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any);
        };
        opts.length = 0;
        if (nextRow) {
          const rowStatus = state.offseasonChecklist[nextRow];
          const canFinishReviewRow =
            rowStatus === 'in-progress' &&
            (nextRow === 'pbaLocalFreeAgency' || nextRow === 'pbaImportSearch');
          if (nextRow === 'pbaConferenceAwards') {
            opts.push({
              label: currentConference === 'governors' ? 'Sim to next season' : 'Sim to next conference',
              action: () => {
                dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: nextRow } } as any);
                const remainingRows = visibleRows.filter(row => row !== nextRow);
                openTask(firstUnfinishedRow(
                  { ...(state.offseasonChecklist as any), [nextRow]: 'done' },
                  undefined,
                  remainingRows,
                ) ?? (currentConference === 'governors' ? 'pbaDraft' : 'pbaImportSearch'));
              },
            });
          } else if (nextRow === 'pbaDraft') {
            opts.push(
              { label: 'Watch PBA Draft', action: () => openTask(nextRow) },
              { label: 'Sim to end of PBA Draft', action: simPbaDraftToEnd },
            );
          } else {
            opts.push({
              label: canFinishReviewRow
                ? `Finish ${getOffseasonRowLabel(nextRow, state.leagueStats?.uiMode)}`
                : `Open ${getOffseasonRowLabel(nextRow, state.leagueStats?.uiMode)}`,
              action: () => {
                if (canFinishReviewRow) {
                  dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: nextRow } } as any);
                  return;
                }
                openTask(nextRow);
              },
            });
          }
        } else {
          opts.push({
            label: currentConference === 'governors' ? 'Enter New Season' : 'Enter Next Conference',
            action: () => {
              setOpen(false);
              dispatchAction({ type: 'OFFSEASON_EXIT' } as any);
              setCurrentView('Schedule' as Tab);
            },
          });
        }
      }
      return opts;
    }

    if (isEuro) {
      if (state.offseasonChecklist) {
        const effectiveChecklist = withGovernorsBoardMeetingTask(
          state.offseasonChecklist,
          state.pendingGovernorsBoardMeeting,
          state.leagueStats?.year,
        )!;
        const visibleRows = getVisibleOffseasonRows(
          state.leagueStats as any,
          null,
          state.date,
          state.expansionSchedule,
          effectiveChecklist,
          { lotteryResolved: true, draftComplete: true },
        );
        const nextRow = visibleRows.find(row => {
          const status = effectiveChecklist[row];
          return (status === 'pending' || status === 'in-progress' || status == null)
            && getOffseasonBlockingRow(row, effectiveChecklist, visibleRows) === null;
        }) ?? firstUnfinishedRow(effectiveChecklist, undefined, visibleRows);
        if (nextRow) {
          if (nextRow === 'transferMarket' && !transferWindowStatus?.open) {
            const nextOpen = transferWindowStatus?.nextOpen
              ? TimeService.normalize(transferWindowStatus.nextOpen)
              : null;
            return [{
              label: nextOpen && nextOpen > norm ? 'Until Transfer Market' : 'One day',
              action: () => nextOpen && nextOpen > norm ? simToDate(nextOpen) : simDay(),
            }];
          }
          const target = resolveOffseasonTaskView(nextRow, state);
          return [{
            label: `Open ${getOffseasonRowLabel(nextRow, state.leagueStats?.uiMode)}`,
            action: () => {
              setOpen(false);
              if (nextRow === 'strategyReview') {
                dispatchAction({
                  type: 'UPDATE_STATE',
                  payload: { pendingSeasonStrategyModal: true },
                } as any);
                return;
              }
              dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: nextRow } } as any);
              setCurrentView((target ?? 'Schedule') as Tab);
            },
          }];
        }
        return [{
          label: 'Enter Preseason',
          action: () => {
            setOpen(false);
            dispatchAction({ type: 'OFFSEASON_EXIT' } as any);
            setCurrentView('Schedule' as Tab);
          },
        }];
      }
      const competitionState = euroCompetitionState;
      const competitionTargets = (competitionState.activeCompetitions ?? []).map((competition: any) => {
        const regularComplete = competitionRegularComplete(competitionState, competition.id);
        const playoffSpecStart = regularComplete
          ? competitionRoundDate(competitionState, seasonYear, competition.id, ['play-in', 'qf', 'quarterfinals', 'sf', 'semifinals', 'final-four'], 'start')
          : null;
        const playoffStart = findFirstCompetitionDate(competitionState, competition.id, ['play-in', 'qf', 'sf', 'final'])
          ?? playoffSpecStart;
        const finalSpecEnd = competitionRoundDate(
          competitionState,
          seasonYear,
          competition.id,
          ['final', 'final-four'],
          'end',
        );
        return {
          id: competition.id as string,
          domesticParentId: competition.domesticParentId as string | undefined,
          label: competition.displayName ?? competition.shortName ?? competition.id,
          regularEnd: findLastCompetitionRegularDate(competitionState, competition.id),
          playoffStart,
          seasonEnd: maxIsoDate([findLastCompetitionDate(competitionState, competition.id), finalSpecEnd]),
        };
      });
      const firstFixture = findFirstCompetitionDate(competitionState);
      const nextFixture = minScheduledDate((competitionState.schedule ?? []).filter((game: any) =>
        game.competitionId && !game.played && normalizeDate(game.date) > norm,
      ));
      const currentOrNextFixture = minScheduledDate((competitionState.schedule ?? []).filter((game: any) =>
        game.competitionId && !game.played && normalizeDate(game.date) >= norm,
      ));
      const allCompetitionEnd = [findLastCompetitionDate(competitionState), ...competitionTargets.map(target => target.seasonEnd)]
        .filter((date): date is string => !!date)
        .sort()
        .at(-1) ?? null;
      const focusedCompetitionTargets = isCommissioner
        ? competitionTargets.filter(target =>
            target.id === state.euroPrimaryCompetitionId
            || target.domesticParentId === state.euroPrimaryCompetitionId
            || target.id === 'euroleague'
            || target.id === 'eurocup',
          )
        : competitionTargets;
      const trainingCampStr = toISODateString(getTrainingCampDate(preseasonSeasonYear, ls));
      const activeCompetition = getEuroCompetitionTarget(competitionState, seasonYear, norm, currentView);

      const opts: PlayOption[] = [
        {
          label: transferMarketProgress
            ? `Sim Transfer Market Day · ${transferMarketProgress.current}/${transferMarketProgress.total}`
            : 'One day',
          action: simDay,
        },
        { label: 'One week', action: () => simToDate(addDays(norm, 7)) },
        { label: 'One month', action: () => simToDate(addDays(norm, 30)) },
      ];
      if (unresolvedEuroTransferMarket && transferWindowStatus?.open) {
        opts.push({
          label: 'Open Transfer Market',
          action: () => navigate('Front Office Transfer Market' as Tab),
        });
      }
      if (unresolvedEuroTransferMarket && transferWindowStatus?.open && transferWindowStatus.currentClose) {
        const windowClose = TimeService.normalize(transferWindowStatus.currentClose);
        if (windowClose > norm) {
          opts.push({
            label: 'Through active transfer period',
            action: () => simThrough(windowClose),
          });
        }
      } else if (unresolvedEuroTransferMarket && transferWindowStatus?.nextOpen) {
        pushFutureOption(
          opts,
          norm,
          'Until transfer activity resumes',
          TimeService.normalize(transferWindowStatus.nextOpen),
          simToDate,
        );
      }

      pushFutureOption(opts, norm, 'Until next fixture', nextFixture ?? firstFixture, simToDate);
      if (currentOrNextFixture && currentOrNextFixture >= norm) {
        opts.push({ label: 'Through next fixture', action: () => simThrough(currentOrNextFixture) });
      }
      if (activeCompetition?.postseasonActive) {
        if (activeCompetition.postseasonSeedError) {
          opts.push({
            label: `Retry ${activeCompetition.label} playoff setup`,
            action: simDay,
          });
        }
        if (activeCompetition.nextGameDate) {
          opts.push({
            label: 'Watch Next Game',
            action: () => watchNextGame(clampToToday(activeCompetition.nextGameDate!, norm)),
          });
          opts.push({
            label: `Next ${activeCompetition.label} game`,
            action: () => simThrough(clampToToday(activeCompetition.nextGameDate!, norm)),
          });
        }
        if (activeCompetition.roundEndDate) {
          opts.push({
            label: `Through current ${activeCompetition.label} round`,
            action: () => simThrough(clampToToday(activeCompetition.roundEndDate!, norm)),
          });
        }
        if (activeCompetition.postseasonEndDate && !activeCompetition.postseasonSeedError) {
          opts.push({
            label: `To ${activeCompetition.label} champion`,
            action: () => simThrough(clampToToday(activeCompetition.postseasonEndDate!, norm)),
          });
        }
      }
      for (const target of focusedCompetitionTargets) {
        if (activeCompetition?.postseasonActive && target.id === activeCompetition.id) continue;
        pushFutureOption(opts, norm, `Through ${target.label} regular season`, target.regularEnd, simThrough);
        pushFutureOption(opts, norm, `To ${target.label} playoffs`, target.playoffStart, simToDate);
        pushFutureOption(opts, norm, `Through ${target.label} final`, target.seasonEnd, simThrough);
      }
      pushFutureOption(opts, norm, 'To offseason', allCompetitionEnd, simThrough);
      pushFutureOption(opts, norm, 'Until training camp', trainingCampStr, simToDate);
      return opts;
    }

    const tdStr = toISODateString(getTradeDeadlineDate(seasonYear, ls));
    const draftLotteryStr = toISODateString(getDraftLotteryDate(seasonYear, ls));
    const lotteryEnabled = isDraftLotteryEnabled(ls?.draftType);
    const lotteryActionAvailable = isDraftLotteryActionAvailable(state, lotteryEnabled, noDraft);
    const draftStr = toISODateString(getDraftDate(seasonYear, ls));
    const faStartStr = toISODateString(getCurrentOffseasonEffectiveFAStart(`${norm}T00:00:00Z`, ls, state.schedule));
    const faMoratoriumEndStr = toISODateString(getCurrentOffseasonFAMoratoriumEnd(`${norm}T00:00:00Z`, ls, state.schedule));
    const openingNightStr = findFirstRegularSeasonDate(state) ?? toISODateString(getOpeningNightDate(seasonYear, ls, state.schedule as any));
    const allStarStr = getAllStarEventsSimulationTarget(seasonYear, ls);
    const preseasonStr = toISODateString(getTrainingCampDate(preseasonSeasonYear, ls));
    const lastPlayoffStr = findLastTruePlayoffDate(state) ?? addDays(draftStr, -1);
    const offseasonStartStr = addDays(lastPlayoffStr, 1);
    const offseasonHorizonStr = toISODateString(getRolloverDate(seasonYear, ls, state.schedule));
    const addGmOffseasonOption = (opts: PlayOption[]) => {
      if (!isCommissioner && norm < offseasonStartStr) {
        opts.push({ label: 'To offseason', action: () => simToOffseason(offseasonHorizonStr) });
      }
      return opts;
    };

    if (!isEuro && !isPba && !lifecycle.offseasonOpen && state.playoffs?.bracketComplete && norm < offseasonStartStr) {
      return [{ label: 'To offseason', action: () => simToOffseason(offseasonHorizonStr) }];
    }

    switch (phase) {
      case 'preseason': {
        const opts: PlayOption[] = [
          { label: 'One day', action: simDay },
          { label: 'One week', action: () => simToDate(addDays(norm, 7)) },
          { label: 'One month', action: () => simToDate(addDays(norm, 30)) },
        ];
        const firstPreseason = findFirstPreseasonDate(state);
        const lastPreseason = findLastPreseasonDate(state);
        const trainingCampStr = toISODateString(getTrainingCampDate(preseasonSeasonYear, ls));
        if (norm < trainingCampStr) {
          opts.push({ label: isCommissioner ? 'Until preseason begins' : 'Until training camp', action: () => simToDate(trainingCampStr) });
        }
        if (firstPreseason && firstPreseason > norm) {
          opts.push({ label: 'Until preseason games', action: () => simToDate(firstPreseason) });
        }
        if (lastPreseason && lastPreseason >= norm) {
          opts.push({ label: 'Through preseason', action: () => simThrough(lastPreseason) });
        }
        opts.push({ label: 'To opening night', action: () => simToDate(openingNightStr) });
        if (offseasonStartStr > norm) {
          opts.push({ label: 'To next offseason', action: () => simToDate(offseasonStartStr) });
        } else {
          const nextRollover = toISODateString(getRolloverDate(seasonYear, ls, state.schedule));
          if (nextRollover > norm) {
            opts.push({ label: 'To next offseason', action: () => simToDate(nextRollover) });
          }
        }
        return opts;
      }

      case 'regular-season': {
        const opts: PlayOption[] = [
          { label: 'One day', action: simDay },
          { label: 'One week', action: () => simToDate(addDays(norm, 7)) },
          { label: 'One month', action: () => simToDate(addDays(norm, 30)) },
        ];
        if (norm < tdStr) {
          opts.push({ label: 'Until trade deadline', action: () => simToDate(tdStr, 'UNTIL_TRADE_DEADLINE') });
        }
        if (norm < allStarStr) {
          opts.push({ label: 'Until All-Star events', action: () => simToDate(allStarStr) });
        }
        const lastRegSeasonStr = findLastRegSeasonDate(state);
        if (lastRegSeasonStr && lastRegSeasonStr >= norm) {
          opts.push({ label: 'Through regular season', action: () => simThrough(lastRegSeasonStr) });
        }
        const playInScheduled = ls?.playIn !== false ? findFirstPlayInDate(state) : null;
        const playInTarget = ls?.playIn !== false
          ? (playInScheduled ?? (lastRegSeasonStr ? addDays(lastRegSeasonStr, 1) : null) ?? (norm < playInCalendarStr ? playInCalendarStr : null))
          : null;
        if (playInTarget && playInTarget > norm) {
          opts.push({ label: 'Until play-in', action: () => simToDate(playInTarget) });
        }
        const playoffScheduled = findFirstTruePlayoffDate(state);
        const playoffTarget = playoffScheduled
          ?? (playInTarget ? addDays(playInTarget, 1) : null)
          ?? (norm < playoffCalendarStr ? playoffCalendarStr : null);
        if (playoffTarget && playoffTarget > norm) {
          opts.push({ label: 'Until playoffs', action: () => simToPlayoffs(playoffTarget) });
        }
        if (lotteryActionAvailable && norm < draftLotteryStr) {
          opts.push({ label: 'Until draft lottery', action: () => simToDraftLottery(draftLotteryStr) });
        }
        return addGmOffseasonOption(opts);
      }

      case 'playin': {
        const playInEnd = findPlayInEndDate(state);
        const nextPlayInGame = findFirstPlayInDate(state);
        const playoffStart = findFirstTruePlayoffDate(state)
          ?? (playInEnd ? addDays(playInEnd, 1) : (norm < playoffCalendarStr ? playoffCalendarStr : null));
        const opts: PlayOption[] = [{ label: 'One day', action: simDay }];
        if (nextPlayInGame) {
          opts.push({ label: 'Watch Next Game', action: () => watchNextGame(clampToToday(nextPlayInGame, norm)) });
        }
        if (playInEnd && playInEnd >= norm) {
          opts.push({ label: 'Until end of play-in', action: () => simThrough(playInEnd) });
        }
        if (playoffStart && playoffStart > norm) {
          opts.push({ label: 'Until playoffs', action: () => simToPlayoffs(playoffStart) });
        }
        if (lotteryActionAvailable && norm < draftLotteryStr) {
          opts.push({ label: 'Until draft lottery', action: () => simToDraftLottery(draftLotteryStr) });
        } else if (lotteryActionAvailable && norm === draftLotteryStr) {
          opts.push({ label: 'Watch lottery', action: () => navigate('Draft Lottery' as Tab) });
        }
        opts.push({ label: 'Through playoffs', action: () => simThrough(lastPlayoffStr, 'TO_CHAMPION') });
        return addGmOffseasonOption(opts);
      }

      case 'playoffs': {
        const nextPlayoffGame = findFirstTruePlayoffDate(state);
        const roundEnd = findPlayoffRoundEndDate(state);
        const opts: PlayOption[] = [{ label: 'One day', action: simDay }];
        if (nextPlayoffGame) {
          opts.push({ label: 'Watch Next Game', action: () => watchNextGame(clampToToday(nextPlayoffGame, norm)) });
        }
        if (roundEnd && roundEnd >= norm) {
          opts.push({ label: 'Until end of round', action: () => simThrough(roundEnd, 'SIM_ROUND') });
        }
        if (lotteryActionAvailable && norm < draftLotteryStr) {
          opts.push({ label: 'Until draft lottery', action: () => simToDraftLottery(draftLotteryStr) });
        } else if (lotteryActionAvailable && norm === draftLotteryStr) {
          opts.push({ label: 'Watch lottery', action: () => navigate('Draft Lottery' as Tab) });
        }
        opts.push({ label: 'Through playoffs', action: () => simThrough(lastPlayoffStr, 'TO_CHAMPION') });
        if (norm < offseasonStartStr) {
          opts.push({ label: 'To offseason', action: () => simToOffseason(offseasonHorizonStr) });
        }
        return opts;
      }

      case 'draft-lottery': {
        const opts: PlayOption[] = [
          { label: 'One day', action: simDay },
          ...(lotteryActionAvailable ? [{ label: 'Watch lottery', action: () => navigate('Draft Lottery' as Tab) }] : []),
        ];
        if (!noDraft) {
          pushFutureOption(opts, norm, 'Until draft', draftStr, simToDate);
        }
        if (isCommissioner) {
          pushFutureOption(opts, norm, 'Skip to preseason', preseasonStr, skipToPreseason);
          pushFutureOption(opts, norm, 'Skip to opening night', openingNightStr, simToDate);
        }
        return opts;
      }

      case 'draft':
        return [
          { label: 'Sim to end of draft', action: simDraftToEnd },
          { label: 'Watch draft', action: () => navigate('Draft Board' as Tab) },
        ];

      case 'after-draft': {
        const opts: PlayOption[] = [];
        if (isCommissioner) {
          pushFutureOption(opts, norm, 'Skip to preseason', preseasonStr, skipToPreseason);
          pushFutureOption(opts, norm, 'Skip to opening night', openingNightStr, simToDate);
        }
        opts.push({ label: 'One day', action: simDay });
        if (!noDraft && lifecycle.draft.draft !== 'complete') {
          opts.push({ label: 'Watch draft', action: () => navigate('Draft Board' as Tab) });
          opts.push({ label: 'Sim to end of draft', action: simDraftToEnd });
        }
        if (norm < faStartStr) {
          opts.push({ label: 'Until FA opens', action: () => simToDate(faStartStr) });
        }
        if (!isEuro && !isPba && norm < faMoratoriumEndStr) {
          opts.push({ label: 'Until signings open', action: () => simToDate(faMoratoriumEndStr) });
        }
        return opts;
      }

      case 'free-agency': {
        const activeMarkets = (state.faBidding?.markets ?? []).filter((market: any) => !market.resolved);
        const marketTarget = (markets: any[]) => {
          const nextDecisionDay = markets
            .map((market: any) => Number(market.decidesOnDay))
            .filter((day: number) => Number.isFinite(day))
            .sort((a: number, b: number) => a - b)[0];
          if (nextDecisionDay == null) return addDays(norm, 1);
          return addDays(norm, Math.max(1, nextDecisionDay - (state.day ?? 0)));
        };
        const majorMarketPlayerIds = new Set(
          state.players
            .filter((player: any) => player.tid < 0 && player.status === 'Free Agent' && (player.overallRating ?? 0) >= 55)
            .map((player: any) => player.internalId),
        );
        const majorMarkets = activeMarkets.filter((market: any) => majorMarketPlayerIds.has(market.playerId));
        const opts: PlayOption[] = [];
        if (isCommissioner) {
          pushFutureOption(opts, norm, 'Skip to preseason', preseasonStr, skipToPreseason);
          pushFutureOption(opts, norm, 'Skip to opening night', openingNightStr, simToDate);
        }
        opts.push(
          { label: 'One day', action: simDay },
          { label: 'One FA week', action: () => simToDate(addDays(norm, 7)) },
        );
        if (!isEuro && !isPba && norm < faMoratoriumEndStr) {
          opts.push({ label: 'Through moratorium', action: () => simToDate(faMoratoriumEndStr) });
        }
        if (activeMarkets.length > 0) {
          opts.push({ label: 'Until next FA decision', action: () => simThrough(marketTarget(activeMarkets)) });
        }
        if (majorMarkets.length > 0) {
          opts.push({ label: 'Until major FAs resolve', action: () => simThrough(marketTarget(majorMarkets)) });
        }
        opts.push({ label: 'One month', action: () => simToDate(addDays(norm, 30)) });
        pushFutureOption(
          opts,
          norm,
          isCommissioner ? 'Until preseason' : 'Until training camp',
          preseasonStr,
          simToDate,
        );
        const nextSeasonOpening = toISODateString(getOpeningNightDate(preseasonSeasonYear, ls, state.schedule as any));
        if (nextSeasonOpening > norm) {
          opts.push({ label: 'Through preseason', action: () => simToDate(nextSeasonOpening) });
        }
        return opts;
      }

      default:
        return [{ label: 'One day', action: simDay }];
    }
  }, [
    currentView,
    isCommissioner,
    isEuro,
    isPba,
    ls,
    navigate,
    noDraft,
    norm,
    phase,
    seasonYear,
    simDay,
    simDraftToEnd,
    simPbaDraftToEnd,
    simToPbaPlayoffs,
    simThrough,
    simInternationalTo,
    goToNextInternationalGameDay,
    simInternationalToNextTask,
    simToDate,
    simToPlayoffs,
    watchNextGame,
    skipToPreseason,
    simToDraftLottery,
    simToOffseason,
    calYear,
    playInCalendarStr,
    playoffCalendarStr,
    euroCompetitionState,
    transferWindowStatus?.currentClose,
    transferWindowStatus?.open,
    transferWindowStatus?.window,
    transferMarketProgress,
    euroSigningProgress,
    state.schedule,
    state.players,
    state.faBidding?.markets,
    state.faTagCounter,
    state.faTagsTotal,
    state.pbaLocalFreeAgency,
    state.offseasonChecklist?.transferMarket,
    state.offseasonChecklist,
    state.day,
    state.playoffs,
    state.internationalTournament,
    state.stats.playerApproval,
    lifecycle.draft.draft,
    dispatchAction,
  ]);

  useEffect(() => {
    const clickHandler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', escHandler);
    return () => {
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', escHandler);
    };
  }, []);

  const disabled = state.isProcessing;
  if (
    currentView === 'International'
    && state.internationalTournament?.readOnly
  ) return null;
  const immediateCommissionerTask = getBlockingCommissionerTask(state, addDays(norm, 1));
  const insideInternationalTask = currentView === 'International'
    && immediateCommissionerTask?.taskId === 'international_tournament';
  const canSurfaceFutureCommissionerTask = (
    phase === 'draft-lottery'
    || phase === 'draft'
    || phase === 'after-draft'
    || phase === 'free-agency'
  );
  const nextCommissionerTask = isCommissioner && canSurfaceFutureCommissionerTask
    ? getBlockingCommissionerTask(state, addDays(norm, 400))
    : null;
  const centralFreeAgencyControls =
    !isEuro
    && (
      (!isPba && (state.faTagCounter ?? 0) > 0)
      || (
        isPba
        && state.offseasonChecklist?.pbaLocalFreeAgency === 'in-progress'
        && state.pbaLocalFreeAgency?.status === 'open'
      )
    );
  const visibleOptions = centralFreeAgencyControls
    ? options
    : immediateCommissionerTask && !insideInternationalTask
    ? [{
        label: `${immediateCommissionerTask.openDate > norm ? 'Advance to' : 'Open'} ${immediateCommissionerTask.definition.title}`,
        action: () => guardedSim(
          () => dispatchAction({ type: 'ADVANCE_DAY' }),
          addDays(norm, 1),
        ),
      }]
    : nextCommissionerTask && !insideInternationalTask
      ? [{
          label: `Until next task · ${nextCommissionerTask.definition.title}`,
          action: () => simToDate(nextCommissionerTask.openDate),
        }, ...options]
      : options;
  const primaryOption = visibleOptions[0];

  return (
    <div className="flex items-center gap-3">
      <div ref={ref} className="relative flex items-center">
        <button
          onClick={() => { if (!disabled) primaryOption?.action(); }}
          disabled={disabled}
          aria-label={primaryOption?.label ?? 'Sim day'}
          title={primaryOption?.label ?? 'Sim day'}
          className={`flex items-center justify-center px-3 py-1.5 rounded-l-lg transition-colors ${
            disabled
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-[#2d5a27] hover:bg-[#3a7233] text-white'
          }`}
        >
          <Play size={14} fill="currentColor" />
        </button>
        <button
          onClick={() => !disabled && setOpen(prev => !prev)}
          disabled={disabled}
          aria-label="Simulation options"
          className={`flex items-center px-1.5 py-1.5 rounded-r-lg border-l border-black/30 transition-colors ${
            disabled
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-[#1e4219] hover:bg-[#2d5a27] text-white'
          }`}
        >
          <ChevronDown size={12} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && !disabled && (
          <div className="absolute top-full left-0 mt-1 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl z-[300] min-w-[240px] py-1.5 overflow-hidden">
            {visibleOptions.map((option, index) => (
              <button
                key={index}
                onClick={option.action}
                className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/5 transition-colors"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col leading-none min-w-0">
        <span className="text-[11px] font-bold text-white truncate">{phaseLabel}</span>
        <span className={`text-[10px] mt-0.5 ${state.isProcessing ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`}>
          {state.isProcessing ? 'Simulating…' : 'Idle'}
        </span>
      </div>

      {simulationBoundaryPreflightModal}
      {draftGate.modal}
      {rosterGate.modal}
      {teamOptionGate.modal}
      {expiringGate.modal}
      {tycoonYearEndGate.modal}
    </div>
  );
};
