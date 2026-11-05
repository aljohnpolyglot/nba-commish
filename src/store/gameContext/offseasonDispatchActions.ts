import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { GameState, OffseasonChecklistRow, Tab, TeamStatus, UserAction } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import {
  getCurrentOffseasonEffectiveFAStart,
  getCurrentOffseasonFAMoratoriumEnd,
  getTrainingCampDate,
  parseGameDate,
  toISODateString,
} from '../../utils/dateUtils';
import { getLeagueCalendarDates } from '../../services/leagueCalendar';
import {
  defaultOffseasonChecklist,
  firstUnfinishedRow,
  getManualReviewBlockingAutoResolve,
  getOffseasonBlockingRow,
  getVisibleOffseasonRows,
  setRowStatus,
  computeUpcomingSeasonYear,
} from '../../services/offseason/offseasonState';
import { resolveOffseasonTaskView } from '../../services/offseason/offseasonTaskNavigation';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../utils/uiMode';
import { isEuroVisibleScheduleGame } from '../../utils/euroLeagueDefaults';
import {
  generateForCompetition,
  repairCompetitionSchedules,
  selectCompetitionTeamTids,
} from '../../services/competition/competitionScheduler';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { requestLeagueHistorySeasonDetail } from '../../components/central/view/LeagueHistoryNav';
import { requestSeasonReviewView } from '../../components/news/SeasonReviewNav';
import { settleBypassedReviewsForInternationalTournament } from '../../services/offseason/internationalTournamentTaskState';
import {
  clearConferenceImports,
  generateNextConferenceSchedule,
  getConferenceStartIso,
  getNextPbaScheduleGid,
  getNextConference,
  type PbaConference,
} from '../../services/pba/conferenceTransition';
import { preparePbaLocalFreeAgency } from '../../services/pba/localFreeAgency';
import {
  completePbaLocalFreeAgencyWindow,
  getNextPbaLocalFreeAgencyDay,
  resolvePbaLocalFreeAgency,
  startPbaLocalFreeAgency,
} from '../../services/pba/localFreeAgencyAi';
import { getCentralFreeAgencyDays } from '../../services/freeAgency/freeAgencyDecisionTiming';
import { applySeasonRollover } from '../../services/logic/seasonRollover';
import { autoSignPbaImportsForLazySim } from '../../services/logic/lazySimRunnerHelpers';
import { getAllStarWeekendDates } from '../../services/allStar/allStarWeekendDates';
import { areAllStarSaturdayEventsComplete } from '../../services/allStar/allStarSaturdayCompletion';
import { getEffectivePbaConference } from '../../services/pba/importManager';
import { bookEuroMediaRights } from '../../services/euro/mediaRights';
import { promoteEuroAcademyPlayers } from '../../services/euroScouting/pipeline';
import { completeEuroNbaDraftDecisionReview, prepareEuroNbaDraftDecisions } from '../../services/euroScouting/nbaDraft';
import { getPbaMuseCandidates } from '../../services/pba/musePool';
import { prepareSummerLeagueTournament, updateSummerLeagueUserRoster } from '../../services/summerLeague/roster';
import { prepareInitialFAMarkets } from '../../services/faMarketTickerOpening';
import { getSummerLeagueOffseasonTaskYear } from '../../services/summerLeague/availability';
import {
  applySummerLeaguePlayerResults,
  reviewSummerLeagueTournament,
  simulateRemainingSummerLeague,
} from '../../services/summerLeague/tournament';
import {
  processManagedTeamStaffHiringVacancies,
  processScopedAIStaffHiringVacancies,
} from '../../services/staff/nbaRealStaffSeed';
import { inferEuroStaffLeagueId } from '../../services/euro/staffPool';
import {
  applyCupPrizePoolDecision,
  createAICupPrizePoolDecision,
} from '../../services/governorsBoard/cupPrizePool';
import {
  advanceTransferMarketDay,
  advanceTransferMarketToDate,
} from '../../services/transfer/advanceTransferMarketDay';
import { prepareGmSeasonReviewTask } from '../../services/gmCareer/careerService';
import { prepareSeasonRolloverForTask } from '../../services/offseason/taskRolloverGate';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import { resolvePostFreeAgencyNavigation } from '../../services/freeAgency/freeAgencySummaryNavigation';
import { getFranchiseDealsTaskAccess } from '../../services/franchises/franchiseTaskTiming';
import { resolveActiveLeagueFranchiseDeals } from '../../services/franchises/franchiseState';
import {
  applyQualifyingOfferDecision,
  getOffseasonContractDecisions,
  isReSignDecision,
} from '../../services/freeAgency/offseasonContractDecision';
import { isExpiringContractBoardReviewed } from '../../services/freeAgency/expiringContractBoard';
import { autoRunDraft, completeDraftedRookieContracts } from '../../services/logic/autoResolversParts/draftResolvers';
import {
  advancePbaAllStarTaskCalendar,
  getPbaAllStarTaskCompletionTarget,
  getPbaAllStarTaskSimulationTarget,
} from '../../services/pba/allStar';
import { prepareInternationalTournamentWindow } from '../../services/fiba/prepareTournamentWindow';
import {
  completeInternationalTournamentTask,
  getInternationalBranchYear,
  getInternationalTournamentTaskWindow,
} from '../../services/fiba/tournamentTask';
import {
  getEuroOffseasonMarketDates,
  getEuroOffseasonMarketProgress,
} from '../../services/offseason/euroOffseasonMarkets';
import {
  lifecycleWithDraftOrderReviewed,
  lifecycleForNextRegularSeason,
  resolveLeagueSeasonLifecycle,
} from '../../services/lifecycle/leagueSeasonLifecycle';
import { skipToPreseason } from '../../services/lifecycle/skipToPreseason';
import { compileTargetPlan } from '../../services/simulation/targetPlanner';
import { finalizeCentralFAMarketWindow } from '../logic/turn/simulation/freeAgencyMarketPass';
import {
  completeStaffHiresReview,
  projectStaffHiringRequirements,
} from '../../services/offseason/staffHiringRequirements';
import {
  completeFranchiseDealsFromEvidence,
  completeMediaDayAnswer,
} from '../../services/offseason/taskCompletionEvidence';
import { persistCommittedSimulationState } from '../../services/simulation/durableSimulationCheckpoint';
import { publishSummerLeagueCoverage } from '../../services/news/nativeLeagueAnnouncements';

type SetGameState = Dispatch<SetStateAction<GameState>>;

function fillActiveLeagueAiStaff(state: GameState): GameState {
  if (state.userTeamId == null) return state;
  const userTeamId = Number(state.userTeamId);
  const managedTeam = state.teams.find(team => Number(team.id ?? (team as any).tid) === userTeamId)
    ?? (state.nonNBATeams ?? []).find(team => Number((team as any).id ?? team.tid) === userTeamId);
  if (!managedTeam) return state;
  const staffLeagueId = inferEuroStaffLeagueId(userTeamId, state.leagueType, {
    teamLeague: (managedTeam as any).league,
    uiMode: state.leagueStats?.uiMode,
  });
  const isMainLeague = state.teams.some(team => Number(team.id ?? (team as any).tid) === userTeamId);
  const scopedTeams = isMainLeague
    ? state.teams
    : (state.nonNBATeams ?? []).filter(team => inferEuroStaffLeagueId(team.tid, state.leagueType, {
      teamLeague: team.league,
      uiMode: state.leagueStats?.uiMode,
    }) === staffLeagueId);
  const result = processScopedAIStaffHiringVacancies(
    scopedTeams as any[],
    state.leagueStats.year,
    state.date,
    userTeamId,
    state.staffFreeAgents ?? [],
    staffLeagueId,
  );
  const replacements = new Map(result.teams.map(team => [Number(team.id ?? (team as any).tid), team]));
  const consumedIds = new Set(result.consumedFreeAgentIds);
  return {
    ...state,
    teams: isMainLeague
      ? state.teams.map(team => replacements.get(Number(team.id ?? (team as any).tid)) ?? team)
      : state.teams,
    nonNBATeams: isMainLeague
      ? state.nonNBATeams
      : (state.nonNBATeams ?? []).map(team => (replacements.get(team.tid) as any) ?? team),
    staffFreeAgents: (state.staffFreeAgents ?? []).filter(member => !member.id || !consumedIds.has(member.id)),
    history: [...(state.history ?? []), ...result.historyEntries],
    leagueStats: { ...state.leagueStats, staffHiringResolvedYear: state.leagueStats.year } as any,
  };
}

type HandleOffseasonDispatchActionArgs = {
  action: UserAction;
  setState: SetGameState;
  setCurrentView: (view: Tab) => void;
  stateRef: MutableRefObject<GameState>;
  dispatchAction: (action: UserAction) => Promise<void>;
};

export function getCompletedSeasonForSummary(state: GameState): number | undefined {
  const currentYear = Number(state.leagueStats?.year);
  const lastClosedFileYear = Number.isFinite(currentYear) ? currentYear - 1 : undefined;
  const completionUpperBound = state.leagueStats?.uiMode === 'euro_isolated'
    ? lastClosedFileYear
    : Number.isFinite(currentYear) ? currentYear : undefined;
  const candidates = new Set<number>();
  for (const entry of state.seasonHistory ?? []) {
    const year = Number((entry as any)?.year);
    if (Number.isFinite(year) && ((entry as any)?.championTid != null || (entry as any)?.champion)) {
      candidates.add(year);
    }
  }
  for (const entries of Object.values(state.competitionHistory ?? {})) {
    for (const entry of entries ?? []) {
      const year = Number((entry as any)?.season);
      if (Number.isFinite(year) && (entry as any)?.championTid != null) {
        candidates.add(year);
      }
    }
  }
  for (const award of state.historicalAwards ?? []) {
    const year = Number((award as any)?.season);
    if (Number.isFinite(year) && (award as any)?.type === 'Champion') {
      candidates.add(year);
    }
    if (
      Number.isFinite(year)
      && state.nbaGmStartMode === 'full_offseason'
      && year === currentYear
    ) {
      candidates.add(year);
    }
    if (Number.isFinite(year) && lastClosedFileYear != null && year <= lastClosedFileYear) {
      candidates.add(year);
    }
  }
  for (const [yearKey, playoffs] of Object.entries(((state as any).historicalPlayoffs ?? {}) as Record<string, any>)) {
    const year = Number(yearKey);
    if (Number.isFinite(year) && playoffs?.bracketComplete && playoffs?.champion != null) {
      candidates.add(year);
    }
  }
  if (state.playoffs?.bracketComplete && state.playoffs?.champion != null && Number.isFinite(currentYear)) {
    candidates.add(currentYear);
  }
  const completed = [...candidates]
    .filter(year => completionUpperBound == null || year <= completionUpperBound)
    .sort((a, b) => b - a)[0];
  return completed ?? lastClosedFileYear;
}

const isUnresolvedOffseasonRow = (status: string | undefined): boolean =>
  status === 'pending' || status === 'in-progress';

async function resolvePbaAllStarTaskState(state: GameState, onlyDay?: 'saturday' | 'sunday'): Promise<{ state: GameState; completed: boolean }> {
  const { autoSimAllStarWeekend } = await import('../../services/logic/autoResolvers');
  const stateForSim = {
    ...state,
    offseasonChecklist: setRowStatus(state.offseasonChecklist, 'pbaAllStarWeekend', 'done'),
  } as GameState;
  const patch = await autoSimAllStarWeekend(stateForSim, onlyDay);
  const { _deferred, ...resolvedPatch } = patch as any;
  void _deferred;
  const completed = (resolvedPatch.allStar ?? stateForSim.allStar)?.weekendComplete === true;
  let checklist = setRowStatus(
    resolvedPatch.offseasonChecklist ?? stateForSim.offseasonChecklist,
    'pbaAllStarWeekend',
    completed ? 'done' : 'in-progress',
  );
  if (completed && checklist?.pbaImportSearch === 'pending') {
    checklist = setRowStatus(checklist, 'pbaImportSearch', 'in-progress');
  }
  return {
    completed,
    state: {
      ...stateForSim,
      ...resolvedPatch,
      offseasonChecklist: checklist,
      lastOutcome: completed
        ? 'PBA All-Star Weekend is complete.'
        : 'The PBA All-Star Weekend could not be completed yet.',
    } as GameState,
  };
}

export async function handleOffseasonDispatchAction({
  action,
  setState,
  setCurrentView,
  stateRef,
  dispatchAction,
}: HandleOffseasonDispatchActionArgs): Promise<boolean> {
  if (action.type === 'COMPLETE_MEDIA_DAY') {
    const strategy = action.payload?.strategy;
    const validStrategies: TeamStatus[] = [
      'contending',
      'win_now',
      'play_in_push',
      'retooling',
      'cap_clearing',
      'rebuilding',
      'development',
    ];
    if (!validStrategies.includes(strategy as TeamStatus)) return true;
    setState(previous => completeMediaDayAnswer(previous, strategy as TeamStatus));
    return true;
  }

  if (action.type === 'SUMMER_LEAGUE_SET_ROSTER') {
    const payload = action.payload as { playerIds?: string[]; finalizeAndSim?: boolean } | undefined;
    const playerIds = payload?.playerIds ?? [];
    setState(previous => {
      const tournament = previous.summerLeagueTournament;
      if (!tournament) return previous;
      try {
        const finalized = updateSummerLeagueUserRoster(tournament, previous.players, playerIds);
        const next = payload?.finalizeAndSim
          ? simulateRemainingSummerLeague(finalized, previous.players, previous.stats.playerApproval)
          : finalized;
        const updated = {
          ...previous,
          summerLeagueTournament: next,
          offseasonChecklist: setRowStatus(previous.offseasonChecklist, 'summerLeague', 'in-progress'),
          lastOutcome: next.status === 'complete'
            ? 'Summer League is complete. Review the championship and honors.'
            : 'Your Summer League roster is ready.',
        };
        return next.status === 'complete'
          ? { ...updated, ...publishSummerLeagueCoverage(updated, next) }
          : updated;
      } catch (error) {
        return {
          ...previous,
          lastOutcome: error instanceof Error ? error.message : 'The Summer League roster could not be saved.',
        };
      }
    });
    return true;
  }

  if (action.type === 'SUMMER_LEAGUE_SIMULATE') {
    setState(previous => {
      const tournament = previous.summerLeagueTournament;
      if (!tournament || !tournament.userRosterFinalized) {
        return { ...previous, lastOutcome: 'Finalize the Summer League roster before the tournament begins.' };
      }
      const simulated = simulateRemainingSummerLeague(
        tournament,
        previous.players,
        previous.stats.playerApproval,
      );
      const updated = {
        ...previous,
        summerLeagueTournament: simulated,
        offseasonChecklist: setRowStatus(previous.offseasonChecklist, 'summerLeague', 'in-progress'),
        lastOutcome: simulated.status === 'complete'
          ? 'Summer League is complete. Review the championship and honors.'
          : previous.lastOutcome,
      };
      return simulated.status === 'complete'
        ? { ...updated, ...publishSummerLeagueCoverage(updated, simulated) }
        : updated;
    });
    return true;
  }

  if (action.type === 'OFFSEASON_ENTER_PHASE') {
    const row = (action.payload as { row: OffseasonChecklistRow }).row;
    const current = stateRef.current;
    const lifecycle = resolveLeagueSeasonLifecycle(current);
    if (row === 'draftOrderReview' && lifecycle.draft.lottery !== 'complete') return true;
    if (
      row === 'draft'
      && lifecycle.draft.draft !== 'complete'
      && (
        lifecycle.draft.lottery === 'pending'
        || current.offseasonChecklist?.draftOrderReview !== 'done'
      )
    ) return true;
    if (
      row === 'rookieContracts'
      && (
        lifecycle.draft.draft !== 'complete'
        || !lifecycle.draft.historyPersisted
      )
    ) return true;
    const visibleRows = getVisibleOffseasonRows(
      current.leagueStats,
      null,
      current.date,
      current.expansionSchedule,
      current.offseasonChecklist,
      { lotteryResolved: lifecycle.draft.lottery === 'complete', draftComplete: lifecycle.draft.draft === 'complete' },
    );
    if (
      row === 'sponsorRenewals'
      && current.leagueStats.uiMode !== 'euro_isolated'
      && !getFranchiseDealsTaskAccess(current).available
    ) return true;
    if (
      current.offseasonChecklist
      && getOffseasonBlockingRow(row, current.offseasonChecklist, visibleRows)
    ) return true;
    if (row === 'rookieContracts') {
      const patch = lifecycle.draft.rookieContracts === 'complete'
        ? {}
        : completeDraftedRookieContracts(current);
      const next = {
        ...current,
        ...patch,
        offseasonChecklist: setRowStatus(current.offseasonChecklist, row, 'in-progress'),
      } as GameState;
      stateRef.current = next;
      setState(next);
      const target = resolveOffseasonTaskView(row, next);
      if (target) setCurrentView(target);
      return true;
    }
    if (row === 'freeAgency' && isEuroIsolatedMode(current) && current.date) {
      const calendarYear = parseGameDate(current.date).getUTCFullYear();
      const targetDate = getEuroOffseasonMarketDates(calendarYear, 'signing').startIso;
      if (normalizeDate(current.date) < targetDate) {
        await dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { targetDate, stopBefore: true },
        } as any);
        if (normalizeDate(stateRef.current.date) < targetDate) return true;
      }
      setState(previous => ({
        ...previous,
        offseasonChecklist: setRowStatus(previous.offseasonChecklist, row, 'in-progress'),
        faTagCounter: undefined,
        faTagsTotal: undefined,
      }));
      const target = resolveOffseasonTaskView(row, stateRef.current);
      if (target) setCurrentView(target);
      return true;
    }
    if (row === 'freeAgency' && (current.faTagCounter ?? 0) === 0 && current.date) {
      const targetDate = toISODateString(
        getCurrentOffseasonEffectiveFAStart(current.date, current.leagueStats, current.schedule),
      );
      if (normalizeDate(current.date) < targetDate) {
        await dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { targetDate, stopBefore: true },
        } as any);
        if (normalizeDate(stateRef.current.date) < targetDate) return true;
      }
    }
    if (row === 'summerLeague') {
      setState(previous => {
        const tournament = previous.summerLeagueTournament
          ?? prepareSummerLeagueTournament(previous, getSummerLeagueOffseasonTaskYear(previous));
        const next = tournament && previous.gameMode !== 'gm' && tournament.userRosterFinalized
          ? simulateRemainingSummerLeague(tournament, previous.players, previous.stats.playerApproval)
          : tournament;
        const entered = next ? {
          ...next,
          reviewEntryVersion: Math.max(0, Number(next.reviewEntryVersion) || 0) + 1,
        } : next;
        return {
          ...previous,
          summerLeagueTournament: entered,
          offseasonChecklist: setRowStatus(previous.offseasonChecklist, row, 'in-progress'),
          lastOutcome: entered
            ? previous.lastOutcome
            : 'Summer League could not be prepared for this season.',
        };
      });
      setCurrentView('Summer League');
      return true;
    }
    if (row === 'internationalTournament') {
      let live = stateRef.current;
      let window = getInternationalTournamentTaskWindow(live);
      const calendarYear = live.date ? parseGameDate(live.date).getUTCFullYear() : live.leagueStats.year;
      if (!window) {
        const next = {
          ...live,
          internationalTournamentTaskSkippedYear: calendarYear,
          offseasonChecklist: setRowStatus(live.offseasonChecklist, row, 'skipped'),
        } as GameState;
        stateRef.current = next;
        setState(next);
        return true;
      }
      if (normalizeDate(live.date) < window.markerDate) {
        await dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { targetDate: window.markerDate, stopBefore: true },
        } as any);
        live = stateRef.current;
        if (normalizeDate(live.date) < window.markerDate) return true;
        window = getInternationalTournamentTaskWindow(live);
        if (!window) return true;
      }
      let tournament = live.internationalTournament;
      let players = live.players;
      const tournamentYear = tournament?.playedYear ?? tournament?.year;
      if (tournamentYear !== window.rosterYear || tournament?.readOnly) tournament = undefined;
      if (!tournament) {
        const prepared = await prepareInternationalTournamentWindow(
          live.players,
          getInternationalBranchYear(live, calendarYear),
          calendarYear,
          calendarYear,
          normalizeDate(live.date),
        );
        tournament = prepared.tournament;
        players = prepared.players;
      }
      if (!tournament || tournament.readOnly) {
        const next = {
          ...live,
          players,
          internationalTournamentTaskSkippedYear: calendarYear,
          offseasonChecklist: setRowStatus(live.offseasonChecklist, row, 'skipped'),
        } as GameState;
        stateRef.current = next;
        setState(next);
        setCurrentView('International');
        return true;
      }
      const enteredTournament = {
        ...tournament,
        reviewEntryVersion: Math.max(0, Number(tournament.reviewEntryVersion) || 0) + 1,
      };
      const next = {
        ...live,
        players,
        internationalTournament: enteredTournament,
        offseasonChecklist: settleBypassedReviewsForInternationalTournament(
          setRowStatus(live.offseasonChecklist, row, 'in-progress'),
          enteredTournament,
        ),
      } as GameState;
      stateRef.current = next;
      setState(next);
      setCurrentView('International');
      return true;
    }
    if (row === 'endesaNbaDraft' && isEuroIsolatedMode(current)) {
      let prepared = prepareEuroNbaDraftDecisions(current);
      prepared = {
        ...prepared,
        offseasonChecklist: setRowStatus(prepared.offseasonChecklist, row, 'in-progress'),
      };
      stateRef.current = prepared;
      setState(prepared);
      return true;
    }
    if (row === 'pbaAllStarWeekend' && isPbaIsolatedMode(stateRef.current)) {
      const season = stateRef.current.leagueStats?.year ?? new Date(stateRef.current.date).getUTCFullYear();
      const advance = getPbaAllStarTaskSimulationTarget(stateRef.current);
      const live = advance
        ? advancePbaAllStarTaskCalendar(stateRef.current, advance.targetDate)
        : stateRef.current;
      const {
        buildPbaAllStarLeagueStats,
        buildPbaAllStarPatch,
        buildPbaContestPatch,
        isPbaAllStarStateLocal,
      } = await import('../../services/pba/allStar');
      const { AllStarWeekendOrchestrator } = await import('../../services/allStar/AllStarWeekendOrchestrator');
      const leagueStats = buildPbaAllStarLeagueStats(live.leagueStats);
      const stateForWeekend = { ...live, leagueStats } as GameState;
      const seeded = live.allStar?.reservesAnnounced && isPbaAllStarStateLocal(stateForWeekend, live.allStar)
        ? { players: live.players, allStar: live.allStar }
        : buildPbaAllStarPatch(stateForWeekend, live.players);
      const players = seeded?.players ?? live.players;
      let allStar = seeded?.allStar ?? live.allStar;
      let schedule = live.schedule;
      if (allStar?.reservesAnnounced && !(allStar as any).weekendComplete) {
        allStar = buildPbaContestPatch(
          { ...stateForWeekend, players, allStar } as GameState,
          players,
          allStar,
        );
        const allStarDate = normalizeDate(getAllStarWeekendDates(season, leagueStats).allStarGame.toISOString());
        const hasMainGame = schedule.some(game => game.isAllStar && normalizeDate(game.date) === allStarDate);
        if (!hasMainGame) {
          const pbaTeams = (live.nonNBATeams ?? [])
            .filter((team: any) => team?.league === 'PBA')
            .map((team: any) => ({ ...team, id: team.tid ?? team.id }));
          schedule = AllStarWeekendOrchestrator.injectAllStarGames(
            schedule,
            pbaTeams,
            season,
            (allStar as any).roster ?? [],
            leagueStats,
            players,
          );
        }
        allStar = { ...allStar, gamesInjected: true };
      }
      const prepared = {
        ...live,
        leagueStats,
        players,
        schedule,
        allStar,
        offseasonChecklist: setRowStatus(live.offseasonChecklist, row, 'in-progress'),
      } as GameState;
      stateRef.current = prepared;
      setState(prepared);
      setCurrentView('Schedule');
      return true;
    }
    const reviewRow = row === 'seasonSummary' || row === 'pbaConferenceAwards';
    let reviewTarget: Tab | undefined;
    if (reviewRow) {
      const leagueStats = stateRef.current.leagueStats as any;
      const preparedPbaSeason = Number(leagueStats?.pbaYearEndRolloverPreparedSeason);
      const season = row === 'pbaConferenceAwards' && Number.isFinite(preparedPbaSeason)
        ? preparedPbaSeason
        : getCompletedSeasonForSummary(stateRef.current);
      if (typeof season === 'number') {
        if (row === 'seasonSummary') {
          reviewTarget = requestSeasonReviewView(stateRef.current.news, season, stateRef.current.leagueStats?.uiMode);
        } else {
          requestLeagueHistorySeasonDetail(season);
        }
      }
    }
    const completesWhenOpened = row === 'pbaConferenceAwards';
    setState(prev => {
      const rolloverPrepared = prepareSeasonRolloverForTask(prev, row);
      const reviewPrepared = row === 'performanceReview'
        ? prepareGmSeasonReviewTask(rolloverPrepared)
        : rolloverPrepared;
      const pbaLocalFaPatch = row === 'pbaLocalFreeAgency' ? preparePbaLocalFreeAgency(reviewPrepared) : {};
      const initialFaMarkets = row === 'freeAgency'
        ? prepareInitialFAMarkets(reviewPrepared)
        : reviewPrepared.faBidding?.markets;
      const prepared = {
        ...reviewPrepared,
        ...pbaLocalFaPatch,
        ...(row === 'freeAgency' ? { faBidding: { markets: initialFaMarkets ?? [] } } : {}),
      } as GameState;
      const pbaLocalFaAiPatch = row === 'pbaLocalFreeAgency' ? startPbaLocalFreeAgency(prepared) : {};
      let patched = { ...prepared, ...pbaLocalFaAiPatch } as GameState;
      if (row === 'pbaImportDecision' && isPbaIsolatedMode(patched)) {
        patched = autoSignPbaImportsForLazySim(patched, getEffectivePbaConference(patched.leagueStats as any), {
          excludeUserTeam: patched.gameMode === 'gm',
        });
      }
      const performanceReviewOpen = !!patched.gmCareer && (
        !!patched.gmCareer.pendingReview
        || !!patched.gmCareer.pendingContractDecision
        || patched.gmCareer.jobOffers !== undefined
      );
      return {
        ...patched,
        offseasonChecklist: setRowStatus(
          patched.offseasonChecklist,
          row,
          completesWhenOpened || (row === 'performanceReview' && !performanceReviewOpen) ? 'done' : 'in-progress',
        ),
        ...(row === 'freeAgency' ? {
          faTagCounter: Math.max(1, patched.faTagCounter ?? 1),
          faTagsTotal: getCentralFreeAgencyDays(patched),
        } : {}),
      };
    });
    const target = reviewTarget ?? resolveOffseasonTaskView(row, stateRef.current);
    if (target) setCurrentView(target);
    return true;
  }

  if (action.type === 'PROMOTE_YOUTH') {
    const { playerIds, teamId } = action.payload as { playerIds: any[]; teamId: number };
    if (isEuroIsolatedMode(stateRef.current)) {
      setState(prev => {
        const result = promoteEuroAcademyPlayers(prev, playerIds);
        if (result.promotedIds.length === 0 && result.blockedIds.length > 0) {
          return { ...prev, lastOutcome: 'There is no open place in the senior roster.' };
        }
        const blockedCopy = result.blockedIds.length > 0
          ? ` ${result.blockedIds.length} could not be added because the senior roster is full.`
          : '';
        return {
          ...result.state,
          lastOutcome: `${result.promotedIds.length} academy ${result.promotedIds.length === 1 ? 'player has' : 'players have'} joined the senior team.${blockedCopy}`,
        };
      });
      return true;
    }
    const idSet = new Set(playerIds);
    setState(prev => ({
      ...prev,
      players: prev.players.map((player: any) => {
        const pid = player.pid ?? player.internalId ?? player.id;
        if (!idSet.has(pid) || player.tid !== teamId) return player;
        return { ...player, promotedFromAcademy: true, status: player.status ?? 'Active' };
      }),
    }));
    return true;
  }

  if (action.type === 'OFFSEASON_COMPLETE_PHASE') {
    const row = (action.payload as { row: OffseasonChecklistRow }).row;
    const current = stateRef.current;
    const lifecycle = resolveLeagueSeasonLifecycle(current);
    if (row === 'draftOrderReview' && lifecycle.draft.lottery !== 'complete') return true;
    if (
      row === 'draftLottery'
      && current.leagueStats?.uiMode !== 'pba_isolated'
      && isDraftLotteryEnabled(current.leagueStats?.draftType)
      && !(current.draftLotteryResult?.length)
    ) return true;
    if (row === 'draft' && lifecycle.draft.draft !== 'complete') return true;
    if (
      row === 'rookieContracts'
      && (
        lifecycle.draft.draft !== 'complete'
        || !lifecycle.draft.historyPersisted
        || lifecycle.draft.rookieContracts !== 'complete'
      )
    ) return true;
    if (current.gameMode === 'gm' && current.userTeamId != null) {
      const contractDecisions = getOffseasonContractDecisions(current, current.userTeamId);
      if (
        row === 'options'
        && contractDecisions.some(decision => (
          decision.kind === 'ROOKIE_TEAM_OPTION_DUE' || decision.kind === 'TEAM_OPTION_DUE'
        ))
      ) return true;
      if (
        row === 'qualifyingOffers'
        && contractDecisions.some(decision => (
          (decision.kind === 'ROOKIE_EXIT_RFA_QO' || decision.kind === 'RFA_QO_DUE')
          && !decision.qualifyingOfferSubmitted
          && !decision.qualifyingOfferSkipped
        ))
      ) return true;
      if (
        row === 'myFAs'
        && contractDecisions.some(decision => isReSignDecision(decision.kind))
        && !isExpiringContractBoardReviewed(current, [])
      ) return true;
    }
    const visibleRows = getVisibleOffseasonRows(
      current.leagueStats,
      null,
      current.date,
      current.expansionSchedule,
      current.offseasonChecklist,
      { lotteryResolved: lifecycle.draft.lottery === 'complete', draftComplete: lifecycle.draft.draft === 'complete' },
    );
    if (
      current.offseasonChecklist
      && getOffseasonBlockingRow(row, current.offseasonChecklist, visibleRows)
    ) return true;
    if (
      row === 'performanceReview'
      && current.gameMode === 'gm'
      && current.gmCareer
      && (
        !!current.gmCareer.pendingReview
        || !!current.gmCareer.pendingContractDecision
        || current.gmCareer.jobOffers !== undefined
      )
    ) {
      return true;
    }
    if (
      row === 'seasonSummary'
      || row === 'performanceReview'
      || row === 'draftOrderReview'
      || row === 'retiredPlayersReview'
      || row === 'staffRetirements'
      || row === 'hofCeremony'
    ) {
      const saving = { ...current, isProcessing: true } as GameState;
      const committed = {
        ...saving,
        isProcessing: false,
        offseasonChecklist: setRowStatus(saving.offseasonChecklist, row, 'done'),
        staffRetirementReviewedIds: row === 'staffRetirements'
          ? [...new Set((saving.staffRetirementAnnouncements ?? []).map(record => record.id))]
          : saving.staffRetirementReviewedIds,
        seasonLifecycle: row === 'draftOrderReview'
          ? lifecycleWithDraftOrderReviewed(saving)
          : saving.seasonLifecycle,
      };
      stateRef.current = saving;
      setState(saving);
      if (typeof indexedDB === 'undefined') {
        stateRef.current = committed;
        setState(committed);
        return true;
      }
      try {
        const durable = await persistCommittedSimulationState(committed);
        stateRef.current = durable.state;
        setState(durable.state);
      } catch (error) {
        const label = row === 'seasonSummary' ? 'Season Review'
          : row === 'performanceReview' ? 'Performance Review'
            : row === 'draftOrderReview' ? 'Draft Order Review'
              : row === 'retiredPlayersReview' ? 'Player Retirements Review'
                : row === 'staffRetirements' ? 'Staff Retirements Review'
                  : 'Hall of Fame Review';
        console.error(`[OFFSEASON] ${label} save failed.`, error);
        const failed = { ...current, lastOutcome: `${label} could not be saved. Try again.` };
        stateRef.current = failed;
        setState(failed);
      }
      return true;
    }
    if (row === 'staffSignings') {
      setState(prev => {
        const aiFilled = fillActiveLeagueAiStaff(prev);
        return completeStaffHiresReview(aiFilled, {
          reviewedBy: 'user',
          requiredActionsCompleted: prev.offseasonChecklist?.staffSignings === 'in-progress',
        });
      });
      return true;
    }
    if (row === 'sponsorRenewals' && !isEuroIsolatedMode(current)) {
      setState(previous => completeFranchiseDealsFromEvidence(previous, { completedBy: 'user' }));
      return true;
    }
    if (row === 'endesaNbaDraft') {
      setState(prev => {
        const reviewed = completeEuroNbaDraftDecisionReview(prev);
        return {
          ...reviewed,
          offseasonChecklist: setRowStatus(reviewed.offseasonChecklist, row, 'done'),
        };
      });
      return true;
    }
    if (row === 'endesaBroadcastMeeting') {
      setState(prev => {
        const booked = bookEuroMediaRights(prev);
        const schedule = repairCompetitionSchedules(
          booked,
          booked.activeCompetitions ?? [],
          booked.leagueStats.year,
        );
        return {
          ...booked,
          schedule,
          offseasonChecklist: setRowStatus(booked.offseasonChecklist, row, 'done'),
        };
      });
      return true;
    }
    if (row === 'internationalTournament') {
      setState(prev => completeInternationalTournamentTask(prev));
      return true;
    }
    if (row === 'summerLeague') {
      setState(previous => {
        const tournament = previous.summerLeagueTournament;
        if (!tournament?.result || tournament.status !== 'complete') {
          return {
            ...previous,
            lastOutcome: 'Complete the Summer League tournament before closing this task.',
          };
        }
        const reviewed = reviewSummerLeagueTournament(tournament);
        const updated = {
          ...previous,
          players: applySummerLeaguePlayerResults(previous.players, reviewed, previous.leagueStats),
          summerLeagueTournament: reviewed,
          summerLeagueHistory: [
            ...(previous.summerLeagueHistory ?? []).filter(entry => entry.id !== reviewed.id),
            reviewed,
          ],
          offseasonChecklist: setRowStatus(previous.offseasonChecklist, row, 'done'),
          lastOutcome: 'Summer League results and honors are now part of league history.',
        };
        return { ...updated, ...publishSummerLeagueCoverage(updated, reviewed) };
      });
      return true;
    }
    if (row === 'pbaAllStarWeekend' && isPbaIsolatedMode(stateRef.current)) {
      if (action.payload?.day === 'saturday') {
        const resolved = await resolvePbaAllStarTaskState(stateRef.current, 'saturday');
        const sunday = toISODateString(getAllStarWeekendDates(stateRef.current.leagueStats.year, stateRef.current.leagueStats).allStarGame);
        stateRef.current = advancePbaAllStarTaskCalendar(resolved.state, sunday);
        setState(stateRef.current);
        return true;
      }
      const advance = getPbaAllStarTaskCompletionTarget(stateRef.current);
      if (advance) {
        stateRef.current = advancePbaAllStarTaskCalendar(stateRef.current, advance.targetDate);
      }
      const resolved = await resolvePbaAllStarTaskState(
        stateRef.current,
        areAllStarSaturdayEventsComplete(stateRef.current) ? 'sunday' : undefined,
      );
      stateRef.current = resolved.state;
      setState(resolved.state);
      if (resolved.completed && resolved.state.offseasonChecklist?.pbaImportSearch === 'in-progress') {
        setCurrentView('Free Agents');
      }
      return true;
    }
    setState(prev => {
      let next = prev;
      if (row === 'pbaLocalFreeAgency' && isPbaIsolatedMode(next)) {
        next = {
          ...next,
          ...resolvePbaLocalFreeAgency({
            ...next,
            ...preparePbaLocalFreeAgency(next),
          } as GameState),
        } as GameState;
      }
      if (row === 'pbaImportDecision' && isPbaIsolatedMode(next)) {
        next = autoSignPbaImportsForLazySim(next, getEffectivePbaConference(next.leagueStats as any), {
          excludeUserTeam: next.gameMode === 'gm',
        });
      }
      if (row === 'governorsBoardMeeting' && next.pendingGovernorsBoardMeeting?.cupPrizePoolProposal) {
        const result = applyCupPrizePoolDecision(
          next.cupPrizePools ?? [],
          createAICupPrizePoolDecision(next.pendingGovernorsBoardMeeting.cupPrizePoolProposal),
        );
        if (result.applied && result.recap) {
          next = {
            ...next,
            cupPrizePools: result.pools,
            cupPrizePoolRecaps: [...(next.cupPrizePoolRecaps ?? []), result.recap],
          };
        }
      }

      return {
        ...next,
        euroScheduleReleaseDate: row === 'euroScheduleDraw' && next.leagueStats?.uiMode === 'euro_isolated'
          ? normalizeDate(next.date)
          : next.euroScheduleReleaseDate,
        leagueStats: row === 'youthPromotion' && next.leagueStats?.uiMode === 'euro_isolated'
          ? { ...next.leagueStats, euroYouthPromotionReviewedYear: next.leagueStats.year }
          : next.leagueStats,
        pendingGovernorsBoardMeeting: row === 'governorsBoardMeeting' && next.pendingGovernorsBoardMeeting
          ? { ...next.pendingGovernorsBoardMeeting, reviewed: true }
          : next.pendingGovernorsBoardMeeting,
        offseasonChecklist: setRowStatus(next.offseasonChecklist, row, 'done'),
        seasonLifecycle: next.seasonLifecycle,
      };
    });
    return true;
  }

  if (action.type === 'OFFSEASON_SKIP_PHASE') {
    const { row, assistantGM } = action.payload as { row: OffseasonChecklistRow; assistantGM?: boolean };
    if (row === 'draft' && assistantGM) {
      const current = stateRef.current;
      const patch = autoRunDraft(current);
      if ((patch as any)._deferred) {
        setState(prev => ({ ...prev, lastOutcome: 'The draft cannot be delegated until its prerequisites are complete.' }));
        return true;
      }
      const next = { ...current, ...patch } as GameState;
      stateRef.current = next;
      setState(next);
      return true;
    }
    if (row === 'internationalTournament') {
      const next = completeInternationalTournamentTask(stateRef.current, { simulateRemaining: true });
      stateRef.current = next;
      setState(next);
      const visibleRows = getVisibleOffseasonRows(
        next.leagueStats,
        null,
        next.date,
        next.expansionSchedule,
        next.offseasonChecklist,
      );
      const nextRow = next.offseasonChecklist
        ? firstUnfinishedRow(next.offseasonChecklist, undefined, visibleRows)
        : null;
      if (nextRow) setCurrentView(resolveOffseasonTaskView(nextRow, next));
      return true;
    }
    if (row === 'staffRetirements') {
      setState(prev => ({
        ...prev,
        staffRetirementReviewedIds: [...new Set((prev.staffRetirementAnnouncements ?? []).map(record => record.id))],
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, row, 'done'),
      }));
      return true;
    }
    if (row === 'staffSignings' && assistantGM) {
      setState(prev => {
        const requirementsBeforeDelegation = projectStaffHiringRequirements(prev);
        const teamId = Number(prev.userTeamId);
        const managedTeam = prev.teams.find(team => Number(team.id ?? (team as any).tid) === teamId)
          ?? (prev.nonNBATeams ?? []).find(team => Number((team as any).id ?? team.tid) === teamId);
        if (!managedTeam) {
          return {
            ...prev,
            lastOutcome: 'Staff Hires requires a managed team before it can be delegated.',
          };
        }
        const staffLeagueId = inferEuroStaffLeagueId(teamId, prev.leagueType, {
          teamLeague: (managedTeam as any).league,
          uiMode: prev.leagueStats?.uiMode,
        });
        const result = processManagedTeamStaffHiringVacancies(
          managedTeam as any,
          prev.leagueStats.year,
          prev.date,
          prev.staffFreeAgents ?? [],
          staffLeagueId,
        );
        const resolvedTeam = result.teams[0] as any;
        const consumedIds = new Set(result.consumedFreeAgentIds);
        const hiredNames = new Set(
          ((resolvedTeam?.tycoon?.staffMembers ?? []) as Array<{ name?: string }>)
            .map(member => String(member.name ?? '').trim().toLowerCase())
            .filter(Boolean),
        );
        const staffFreeAgents = (prev.staffFreeAgents ?? []).filter(member => {
          if (member.id && consumedIds.has(member.id)) return false;
          const sameLeague = !member.leagueId || member.leagueId === staffLeagueId;
          return !sameLeague || !hiredNames.has(String(member.name ?? '').trim().toLowerCase());
        });
        const replaceTeam = (team: any) =>
          Number(team.id ?? team.tid) === teamId ? resolvedTeam : team;
        const delegatedState = {
          ...prev,
          teams: prev.teams.map(replaceTeam),
          nonNBATeams: (prev.nonNBATeams ?? []).map(replaceTeam),
          staffFreeAgents,
          history: [...(prev.history ?? []), ...result.historyEntries],
          staffSigningsDelegatedYear: prev.leagueStats.year,
        } as GameState;
        return completeStaffHiresReview(fillActiveLeagueAiStaff(delegatedState), {
          reviewedBy: prev.gameMode === 'commissioner' ? 'commissioner_auto' : 'assistant_gm',
          delegated: true,
          requiredActionsCompleted: requirementsBeforeDelegation?.actionRequired === true,
        });
      });
      return true;
    }
    if (row === 'sponsorRenewals' && !isEuroIsolatedMode(stateRef.current)) {
      setState(prev => completeFranchiseDealsFromEvidence(
        resolveActiveLeagueFranchiseDeals(prev, { includeManagedTeam: true }),
        {
          completedBy: prev.gameMode === 'commissioner' ? 'commissioner_auto' : 'assistant_gm',
          delegated: true,
        },
      ));
      return true;
    }
    if (row === 'freeAgency' && (stateRef.current.faTagCounter ?? 0) > 0) {
      const todayNorm = stateRef.current.date ? normalizeDate(stateRef.current.date) : '';
      const currentDate = stateRef.current.date ? parseGameDate(stateRef.current.date) : new Date();
      const cMonth = currentDate.getUTCMonth() + 1;
      const cYear = currentDate.getUTCFullYear();
      const lsYear = stateRef.current.leagueStats?.year ?? cYear;
      const upcomingSeasonYear = computeUpcomingSeasonYear(
        cMonth,
        cYear,
        lsYear,
        stateRef.current.leagueStats as any,
        currentDate.getUTCDate(),
      );
      const campStr = toISODateString(getTrainingCampDate(upcomingSeasonYear, stateRef.current.leagueStats as any));
      if (todayNorm && todayNorm < campStr) {
        setState(prev => ({
          ...prev,
          offseasonChecklist: setRowStatus(prev.offseasonChecklist, 'freeAgency', 'in-progress'),
        }));
        return true;
      }
    }
    setState(prev => ({
      ...prev,
      offseasonChecklist: setRowStatus(prev.offseasonChecklist, row, 'skipped'),
      ...(row === 'freeAgency' ? { faTagCounter: undefined, faTagsTotal: undefined } : {}),
    }));
    return true;
  }

  if (action.type === 'OFFSEASON_RESET_CHECKLIST') {
    setState(prev => {
      const resetPbaMarket = isPbaIsolatedMode(prev);
      return {
        ...prev,
        offseasonChecklist: defaultOffseasonChecklist(prev.leagueStats, prev.gameMode === 'gm'),
        faTagCounter: undefined,
        pendingOfferDecisions: [],
        ...(resetPbaMarket ? {
          pbaLocalFreeAgency: undefined,
          leagueStats: {
            ...prev.leagueStats,
            pbaLocalFreeAgencyPreparedSeason: undefined,
            pbaLocalFreeAgencyResolvedSeason: undefined,
          },
        } : {}),
      };
    });
    return true;
  }

  if (action.type === 'OFFSEASON_AUTO_RESOLVE_ALL') {
    const current = stateRef.current;
    const visibleRows = getVisibleOffseasonRows(
      current.leagueStats,
      null,
      current.date,
      (current as any).expansionSchedule,
      current.offseasonChecklist,
    );
    const requiredReview = current.gameMode === 'gm'
      ? getManualReviewBlockingAutoResolve(current.offseasonChecklist, visibleRows)
      : null;
    if (requiredReview) {
      await dispatchAction({
        type: 'OFFSEASON_ENTER_PHASE',
        payload: { row: requiredReview },
      } as any);
      return true;
    }
    if (isPbaIsolatedMode(stateRef.current)) {
      let prepared = stateRef.current;
      if (isUnresolvedOffseasonRow(prepared.offseasonChecklist?.pbaAllStarWeekend)) {
        const advance = getPbaAllStarTaskCompletionTarget(prepared);
        if (advance) {
          prepared = advancePbaAllStarTaskCalendar(prepared, advance.targetDate);
        }
        const resolved = await resolvePbaAllStarTaskState(prepared);
        prepared = resolved.state;
        if (!resolved.completed) {
          stateRef.current = prepared;
          setState(prepared);
          return true;
        }
      }
      const importSearchOpen = isUnresolvedOffseasonRow(prepared.offseasonChecklist?.pbaImportSearch);
      const importDecisionOpen = isUnresolvedOffseasonRow(prepared.offseasonChecklist?.pbaImportDecision);
      if (importSearchOpen || importDecisionOpen) {
        prepared = autoSignPbaImportsForLazySim(
          prepared,
          getEffectivePbaConference(prepared.leagueStats as any),
          { excludeUserTeam: false },
        );
        prepared = {
          ...prepared,
          offseasonChecklist: setRowStatus(
            setRowStatus(prepared.offseasonChecklist, 'pbaImportSearch', 'done'),
            'pbaImportDecision',
            'done',
          ),
        } as GameState;
      }
      stateRef.current = prepared;
      setState(prepared);
    }
    if (isEuroIsolatedMode(stateRef.current)) {
      let prepared = completeEuroNbaDraftDecisionReview(prepareEuroNbaDraftDecisions(stateRef.current));
      prepared = bookEuroMediaRights(prepared);
      const schedule = repairCompetitionSchedules(
        prepared,
        prepared.activeCompetitions ?? [],
        prepared.leagueStats.year,
      );
      prepared = {
        ...prepared,
        schedule,
        offseasonChecklist: setRowStatus(
          setRowStatus(prepared.offseasonChecklist, 'endesaNbaDraft', 'done'),
          'endesaBroadcastMeeting',
          'done',
        ),
      };
      stateRef.current = prepared;
      setState(prepared);
    }
    if (
      isPbaIsolatedMode(stateRef.current)
      && stateRef.current.gameMode === 'gm'
      && ['pending', 'in-progress'].includes(stateRef.current.offseasonChecklist?.pbaMuseSelection ?? '')
    ) {
      try {
        const candidates = await getPbaMuseCandidates(
          stateRef.current.leagueStats.year,
          stateRef.current.pbaMuseSelections ?? [],
        );
        const selected = candidates[0];
        if (selected) {
          const teamId = stateRef.current.userTeamId;
          const season = stateRef.current.leagueStats.year;
          const prepared = {
            ...stateRef.current,
            pbaMuseSelections: [
              ...(stateRef.current.pbaMuseSelections ?? []).filter(row =>
                row.season !== season || row.teamId !== teamId,
              ),
              {
                season,
                museId: selected.id,
                teamId,
                selectedAt: stateRef.current.date,
              },
            ],
            leagueStats: {
              ...stateRef.current.leagueStats,
              pbaMuseSelected: true,
            },
            offseasonChecklist: setRowStatus(
              stateRef.current.offseasonChecklist,
              'pbaMuseSelection',
              'done',
            ),
          };
          stateRef.current = prepared;
          setState(prepared);
        }
      } catch (error) {
        console.warn('[PBA muse] Assistant selection unavailable; continuing the offseason exit.', error);
      }
    }
    await dispatchAction({ type: 'OFFSEASON_EXIT', payload: { assistantGM: true } } as any);
    return true;
  }

  if (action.type === 'SUBMIT_QUALIFYING_OFFER') {
    const { playerId } = (action as any).payload as { playerId: string };
    setState(prev => ({
      ...prev,
      players: prev.players.map(player =>
        player.internalId === playerId
          ? applyQualifyingOfferDecision(player, prev, 'submit')
          : player,
      ),
    }));
    return true;
  }

  if (action.type === 'SKIP_QUALIFYING_OFFER') {
    const { playerId } = (action as any).payload as { playerId: string };
    setState(prev => ({
      ...prev,
      players: prev.players.map(player =>
        player.internalId === playerId
          ? applyQualifyingOfferDecision(player, prev, 'skip')
          : player,
      ),
    }));
    return true;
  }

  if (action.type === 'OFFSEASON_ADVANCE_PBA_LOCAL_FA_DAY') {
    const current = stateRef.current;
    if (
      !isPbaIsolatedMode(current)
      || current.offseasonChecklist?.pbaLocalFreeAgency !== 'in-progress'
      || current.pbaLocalFreeAgency?.status !== 'open'
    ) {
      return true;
    }
    const freeAgencyDay = getNextPbaLocalFreeAgencyDay(current);
    await dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        freeAgencyDayStart: freeAgencyDay,
        freeAgencyTotal: current.pbaLocalFreeAgency.totalDays,
      },
    } as any);
    return true;
  }

  if (action.type === 'OFFSEASON_EXIT') {
    const current = stateRef.current;
    const visibleRows = getVisibleOffseasonRows(
      current.leagueStats,
      null,
      current.date,
      (current as any).expansionSchedule,
      current.offseasonChecklist,
    );
    const requiredReview = current.gameMode === 'gm'
      ? getManualReviewBlockingAutoResolve(current.offseasonChecklist, visibleRows)
      : null;
    if (requiredReview) {
      await dispatchAction({
        type: 'OFFSEASON_ENTER_PHASE',
        payload: { row: requiredReview },
      } as any);
      return true;
    }
    if (isPbaIsolatedMode(stateRef.current)) {
      const preparedPbaState = {
        ...stateRef.current,
        ...preparePbaLocalFreeAgency(stateRef.current),
      } as GameState;
      const pbaLocalFaResolvedState = {
        ...preparedPbaState,
        ...resolvePbaLocalFreeAgency(preparedPbaState),
      } as GameState;
      const leagueStats = stateRef.current.leagueStats as any;
      const currentConference: PbaConference = leagueStats?.pbaConference ?? 'philippine';
      const nextConference = getNextConference(currentConference, Number(leagueStats?.year));
      if (!nextConference) {
        const preparedSeason = Number(leagueStats?.pbaYearEndRolloverPreparedSeason);
        const alreadyRolledForYearEnd = Number.isFinite(preparedSeason)
          && Number(leagueStats?.year) === preparedSeason + 1;
        const rolloverPatch = alreadyRolledForYearEnd ? {} : applySeasonRollover(pbaLocalFaResolvedState);
        const rolledState = { ...pbaLocalFaResolvedState, ...rolloverPatch } as GameState;
        const nextYear = (rolledState.leagueStats as any)?.year ?? (
          alreadyRolledForYearEnd
            ? preparedSeason + 1
            : (((pbaLocalFaResolvedState.leagueStats as any)?.year ?? new Date().getFullYear()) + 1)
        );
        const philSpec = PBA_COMPETITIONS[0];
        const source = { nonNBATeams: rolledState.nonNBATeams as any, userTeamId: rolledState.userTeamId };
        const tids = selectCompetitionTeamTids(philSpec, source);
        const start = new Date(Date.UTC(nextYear - 1, philSpec.seasonStart.month - 1, philSpec.seasonStart.day));
        const newGames = generateForCompetition(
          philSpec,
          tids.map((tid: number) => ({ tid })),
          start,
          getNextPbaScheduleGid(rolledState, 'philippine'),
        );
        const cleaned = clearConferenceImports((rolledState.players ?? pbaLocalFaResolvedState.players) as any, currentConference);
        const preservedBackgroundSchedule = (rolledState.schedule ?? []).filter((game: any) =>
          !String(game?.competitionId ?? '').startsWith('pba-'),
        );
        setState(prev => ({
          ...(() => {
            const prepared = { ...prev, ...preparePbaLocalFreeAgency(prev) } as GameState;
            return resolvePbaLocalFreeAgency(prepared);
          })(),
          ...prev,
          ...rolloverPatch,
          players: cleaned,
          leagueStats: {
            ...((() => {
              const prepared = { ...prev, ...preparePbaLocalFreeAgency(prev) } as GameState;
              const resolved = resolvePbaLocalFreeAgency(prepared);
              return (resolved.leagueStats ?? prepared.leagueStats) as any;
            })()),
            ...((rolloverPatch.leagueStats ?? prev.leagueStats) as any),
            ...((rolledState.leagueStats ?? {}) as any),
            year: nextYear,
            pbaConference: 'philippine',
            pbaConferencePhase: 'regularSeason',
            pbaYearEndRolloverPreparedSeason: undefined,
          },
          date: getConferenceStartIso('philippine', nextYear),
          schedule: [...preservedBackgroundSchedule, ...newGames].sort((a: any, b: any) =>
            new Date(a.date).getTime() - new Date(b.date).getTime(),
          ),
          offseasonChecklist: undefined,
          draftComplete: undefined,
          activeDraftPicks: undefined,
          activeDraftPassedPicks: undefined,
          activeDraftOrder: undefined,
          draftLotteryResult: undefined,
        }));
      } else {
        const newGames = generateNextConferenceSchedule(stateRef.current, nextConference);
        const cleaned = clearConferenceImports(pbaLocalFaResolvedState.players, currentConference);
        const withSignedImports = autoSignPbaImportsForLazySim(
          { ...pbaLocalFaResolvedState, players: cleaned } as GameState,
          nextConference,
          { excludeUserTeam: stateRef.current.gameMode === 'gm' },
        );
        const startDate = getConferenceStartIso(nextConference, leagueStats?.year ?? new Date().getFullYear());
        setState(prev => ({
          ...(() => {
            const prepared = { ...prev, ...preparePbaLocalFreeAgency(prev) } as GameState;
            return resolvePbaLocalFreeAgency(prepared);
          })(),
          ...prev,
          players: withSignedImports.players,
          history: withSignedImports.history ?? prev.history,
          leagueStats: {
            ...((() => {
              const prepared = { ...prev, ...preparePbaLocalFreeAgency(prev) } as GameState;
              const resolved = resolvePbaLocalFreeAgency(prepared);
              return (resolved.leagueStats ?? prepared.leagueStats) as any;
            })()),
            ...prev.leagueStats,
            pbaConference: nextConference,
            pbaConferencePhase: 'regularSeason',
          },
          date: startDate,
          schedule: [...(prev.schedule ?? []), ...newGames],
          offseasonChecklist: undefined,
        }));
      }
      return true;
    }

    const useAssistantGM = !!(action.payload as any)?.assistantGM;
    if (
      useAssistantGM
      && ['pending', 'in-progress'].includes(stateRef.current.offseasonChecklist?.staffSignings ?? '')
      && ['done', 'skipped'].includes(stateRef.current.offseasonChecklist?.staffRetirements ?? '')
    ) {
      await dispatchAction({
        type: 'OFFSEASON_SKIP_PHASE',
        payload: { row: 'staffSignings', assistantGM: true },
      } as any);
    }
    const leagueStats = stateRef.current.leagueStats as any;
    const lsYear: number = leagueStats?.year ?? new Date().getFullYear();
    const currentDate = stateRef.current.date ? parseGameDate(stateRef.current.date) : new Date();
    const cMonth = currentDate.getUTCMonth() + 1;
    const cYear = currentDate.getUTCFullYear();
    const upcomingSeasonYear = computeUpcomingSeasonYear(
      cMonth,
      cYear,
      lsYear,
      leagueStats,
      currentDate.getUTCDate(),
    );
    const calendarDates = getLeagueCalendarDates(upcomingSeasonYear, leagueStats);
    const configuredPreseasonStart = toISODateString(
      calendarDates.preseasonStart ?? calendarDates.trainingCampStart ?? calendarDates.regularSeasonStart,
    );
    const todayStr = stateRef.current.date ? normalizeDate(stateRef.current.date) : '';
    const currentState = stateRef.current;
    const target = currentState.leagueStats?.uiMode === 'euro_isolated'
      ? ((currentState.schedule ?? [])
          .filter((game: any) => !game.played && isEuroVisibleScheduleGame(currentState as any, game))
          .map((game: any) => normalizeDate(game.date))
          .filter((date: string) => !!date && (!todayStr || date >= todayStr))
          .sort()[0] ?? configuredPreseasonStart)
      : ((currentState.schedule ?? [])
          .filter((game: any) => game.isPreseason && !game.played)
          .map((game: any) => normalizeDate(game.date))
          .filter((date: string) => !!date && (!todayStr || date > todayStr))
          .sort()[0] ?? configuredPreseasonStart);
    const manualBlockers = (action.payload as any)?.manualBlockers ?? currentState.manualOffseasonBlockers;
    const preflight = skipToPreseason(currentState, {
      targetDate: todayStr || target,
      manualBlockers,
      staffHiresAuthority: useAssistantGM ? 'delegated' : 'manual',
    });
    if (preflight.seasonLifecycle?.currentPhase !== 'PRESEASON_ACTIVE') {
      setState(preflight);
      return true;
    }
    if (todayStr && todayStr < target) {
      await dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: {
          targetDate: target,
          stopBefore: true,
          assistantGM: useAssistantGM,
          targetPlan: compileTargetPlan(stateRef.current, 'SKIP_TO_PRESEASON', target),
        },
      } as any);
    }
    const exitCYear = stateRef.current.date ? new Date(stateRef.current.date).getUTCFullYear() : 0;
    setState(prev => ({
      ...skipToPreseason(finalizeCentralFAMarketWindow(prev), {
        targetDate: target,
        manualBlockers,
        staffHiresAuthority: useAssistantGM ? 'delegated' : 'manual',
      }),
      faTagCounter: undefined,
      faTagsTotal: undefined,
      pendingOfferDecisions: [],
      offseasonExitedYear: exitCYear,
      draftComplete: undefined,
    }));
    return true;
  }

  if (action.type === 'OFFSEASON_ADVANCE_FA_TAG') {
    if (isEuroIsolatedMode(stateRef.current)) {
      const currentDateStr = stateRef.current.date;
      if (!currentDateStr) return true;
      const calendarYear = parseGameDate(currentDateStr).getUTCFullYear();
      const dates = getEuroOffseasonMarketDates(calendarYear, 'signing');
      const currentIso = normalizeDate(currentDateStr);
      const progress = getEuroOffseasonMarketProgress(currentIso, 'signing');
      const nextDate = progress?.isLast
        ? dates.nextIso
        : toISODateString(new Date(new Date(`${currentIso}T00:00:00Z`).getTime() + 86_400_000));
      const targetDate = nextDate < dates.startIso ? dates.startIso : nextDate > dates.nextIso ? dates.nextIso : nextDate;
      await dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate, stopBefore: true },
      } as any);
      setState(previous => ({
        ...previous,
        offseasonChecklist: setRowStatus(
          previous.offseasonChecklist,
          'freeAgency',
          normalizeDate(previous.date) >= dates.nextIso ? 'done' : 'in-progress',
        ),
        faTagCounter: undefined,
        faTagsTotal: undefined,
      }));
      return true;
    }
    const total = getCentralFreeAgencyDays(stateRef.current);
    const counter = stateRef.current.faTagCounter ?? 0;
    const currentDateStr = stateRef.current.date;
    if (!currentDateStr) return true;
    setState(prev => ({
      ...prev,
      offseasonChecklist: setRowStatus(prev.offseasonChecklist, 'freeAgency', 'in-progress'),
    }));

    if (counter === 0) {
      const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(
        currentDateStr,
        stateRef.current.leagueStats as any,
        stateRef.current.schedule as any,
      );
      const targetISO = toISODateString(moratoriumEnd);
      const currentNorm = normalizeDate(currentDateStr);
      if (currentNorm < targetISO) {
        await dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { targetDate: targetISO, stopBefore: true },
        } as any);
      }
      setState(prev => ({
        ...prev,
        faBidding: { markets: prepareInitialFAMarkets(prev) },
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, 'freeAgency', 'in-progress'),
        faTagCounter: 1,
        faTagsTotal: total,
      }));
      return true;
    }

    const currentDate = new Date(`${normalizeDate(currentDateStr)}T00:00:00Z`);
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    const targetISO = toISODateString(currentDate);
    await dispatchAction({
      type: 'SIMULATE_TO_DATE',
      payload: {
        targetDate: targetISO,
        stopBefore: true,
        freeAgencyDayStart: counter,
        freeAgencyTotal: total,
      },
    } as any);

    if (counter >= total) {
      setState(prev => {
        const finalized = finalizeCentralFAMarketWindow(prev);
        return {
          ...finalized,
          offseasonChecklist: setRowStatus(finalized.offseasonChecklist, 'freeAgency', 'done'),
          faTagCounter: undefined,
          faTagsTotal: undefined,
        };
      });
    } else {
      setState(prev => ({
        ...prev,
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, 'freeAgency', 'in-progress'),
        faTagCounter: counter + 1,
      }));
    }
    return true;
  }

  if (action.type === 'OFFSEASON_ADVANCE_TRANSFER_MARKET_DAY') {
    setState(previous => {
      const advanced = advanceTransferMarketDay(previous, true);
      if (!isEuroIsolatedMode(previous) || !previous.date) return advanced;
      const calendarYear = parseGameDate(previous.date).getUTCFullYear();
      const nextIso = getEuroOffseasonMarketDates(calendarYear, 'transfer').nextIso;
      return {
        ...advanced,
        offseasonChecklist: setRowStatus(
          advanced.offseasonChecklist,
          'transferMarket',
          normalizeDate(advanced.date) >= nextIso ? 'done' : 'in-progress',
        ),
      };
    });
    return true;
  }

  if (action.type === 'OFFSEASON_END_TRANSFER_MARKET') {
    const current = stateRef.current;
    const requestedTarget = String(action.payload?.targetDate ?? current.date);
    const targetDate = isEuroIsolatedMode(current) && current.date
      ? getEuroOffseasonMarketDates(parseGameDate(current.date).getUTCFullYear(), 'transfer').nextIso
      : requestedTarget;
    setState(previous => {
      const advanced = advanceTransferMarketToDate(previous, targetDate);
      return {
        ...advanced,
        offseasonChecklist: setRowStatus(advanced.offseasonChecklist, 'transferMarket', 'done'),
      };
    });
    return true;
  }

  if (action.type === 'OFFSEASON_SKIP_FREE_AGENCY') {
    if (isEuroIsolatedMode(stateRef.current)) {
      const currentDateStr = stateRef.current.date;
      if (!currentDateStr) return true;
      const calendarYear = parseGameDate(currentDateStr).getUTCFullYear();
      const targetDate = getEuroOffseasonMarketDates(calendarYear, 'signing').nextIso;
      if (normalizeDate(currentDateStr) < targetDate) {
        await dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { targetDate, stopBefore: true },
        } as any);
      }
      setState(previous => ({
        ...previous,
        offseasonChecklist: setRowStatus(previous.offseasonChecklist, 'freeAgency', 'done'),
        faTagCounter: undefined,
        faTagsTotal: undefined,
      }));
      return true;
    }
    const commissionerFreeAgencyReview = action.payload?.commissionerFreeAgencyReview === true
      && stateRef.current.gameMode !== 'gm';
    if (isPbaIsolatedMode(stateRef.current) && stateRef.current.pbaLocalFreeAgency?.status === 'open') {
      const marketStartPatch = startPbaLocalFreeAgency(stateRef.current);
      const preparedState = Object.keys(marketStartPatch).length > 0
        ? { ...stateRef.current, ...marketStartPatch }
        : stateRef.current;
      const resolvedState = completePbaLocalFreeAgencyWindow(preparedState);
      const marketComplete = resolvedState.pbaLocalFreeAgency?.status === 'complete'
        && Number(resolvedState.leagueStats?.pbaLocalFreeAgencyResolvedSeason)
          === Number(resolvedState.leagueStats?.year);
      const completedChecklist = setRowStatus(
        resolvedState.offseasonChecklist,
        'pbaLocalFreeAgency',
        marketComplete ? 'done' : 'in-progress',
      );
      if (!marketComplete) {
        setState(prev => ({
          ...prev,
          ...resolvedState,
          offseasonChecklist: completedChecklist,
          lastOutcome: 'Local Free Agency could not be completed yet.',
        }));
        return true;
      }
      const nextRow = firstUnfinishedRow(
        completedChecklist,
        undefined,
        getVisibleOffseasonRows(
          resolvedState.leagueStats,
          null,
          resolvedState.date,
          (resolvedState as any).expansionSchedule,
          completedChecklist,
        ),
      );
      const nextView = (nextRow && resolveOffseasonTaskView(nextRow, resolvedState)) || 'Schedule';
      const navigation = resolvePostFreeAgencyNavigation(
        resolvedState.pendingFreeAgencySummary?.combined === true,
        nextView,
      );
      setState(prev => ({
        ...prev,
        ...resolvedState,
        offseasonChecklist: completedChecklist,
        pendingPostFreeAgencyView: navigation.deferredView ?? undefined,
      }));
      if (navigation.immediateView) setCurrentView(navigation.immediateView);
      return true;
    }
    const total = getCentralFreeAgencyDays(stateRef.current);
    const counter = commissionerFreeAgencyReview
      ? 1
      : Math.max(1, stateRef.current.faTagCounter ?? 1);
    const currentDateStr = stateRef.current.date;
    if (!currentDateStr) return true;
    const remainingDays = Math.max(1, total - counter + 1);
    const targetDate = new Date(`${normalizeDate(currentDateStr)}T00:00:00Z`);
    targetDate.setUTCDate(targetDate.getUTCDate() + remainingDays);
    await dispatchAction({
      type: 'SIMULATE_TO_DATE',
      payload: {
        targetDate: toISODateString(targetDate),
        stopBefore: true,
        freeAgencyDayStart: counter,
        freeAgencyTotal: total,
        freeAgencyCombinedSummary: true,
        freeAgencyCombinedSummaryReset: true,
        commissionerFreeAgencyReview,
      },
    } as any);
    if (commissionerFreeAgencyReview) {
      setState(prev => {
        const finalized = finalizeCentralFAMarketWindow(prev);
        return {
          ...finalized,
          faTagCounter: undefined,
          faTagsTotal: undefined,
        };
      });
      return true;
    }
    const completedChecklist = setRowStatus(
      stateRef.current.offseasonChecklist,
      'freeAgency',
      'done',
    );
    const nextRow = firstUnfinishedRow(
      completedChecklist,
      undefined,
      getVisibleOffseasonRows(
        stateRef.current.leagueStats,
        null,
        stateRef.current.date,
        (stateRef.current as any).expansionSchedule,
        completedChecklist,
      ),
    );
    const nextView = (nextRow && resolveOffseasonTaskView(nextRow, stateRef.current)) || 'Schedule';
    const navigation = resolvePostFreeAgencyNavigation(
      stateRef.current.pendingFreeAgencySummary?.combined === true,
      nextView,
    );
    setState(prev => {
      const finalized = finalizeCentralFAMarketWindow(prev);
      return {
        ...finalized,
        offseasonChecklist: setRowStatus(finalized.offseasonChecklist, 'freeAgency', 'done'),
        faTagCounter: undefined,
        faTagsTotal: undefined,
        pendingPostFreeAgencyView: navigation.deferredView ?? undefined,
      };
    });
    if (navigation.immediateView) setCurrentView(navigation.immediateView);
    return true;
  }

  return false;
}
