import { Dispatch, SetStateAction, useEffect } from 'react';
import { GameState, OffseasonChecklist, OffseasonChecklistRow } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { getDraftDate, getTrainingCampDate, parseGameDate, toISODateString } from '../../utils/dateUtils';
import {
  computeDraftSeasonYear,
  computeUpcomingSeasonYear,
  defaultOffseasonChecklist,
  getOffseasonState,
  isOffseasonActiveForChecklist,
  initialEuroOffseasonChecklist,
  initialPbaEndOfSeasonChecklist,
  initialPbaInterConferenceChecklist,
  initialPbaChecklist,
  initialPreseasonChecklist,
  isNoDraftLeague,
  shouldSuppressOpeningOffseasonChecklist,
} from '../../services/offseason/offseasonState';
import { settleBypassedReviewsForInternationalTournament } from '../../services/offseason/internationalTournamentTaskState';
import { hasUnresolvedEuroSeasonCompetitions } from '../../services/competition/competitionResolver';
import { applyExpansionDraftOffseasonTransition } from '../../services/expansion/expansionOffseasonTransition';
import { isPbaActiveConferenceMode, isPbaIsolatedMode } from '../../utils/uiMode';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import { prepareInternationalTournamentWindow } from '../../services/fiba/prepareTournamentWindow';
import { getPlayableInternationalWindowForSeason } from '../../services/fiba/tournamentWindows';
import {
  completeInternationalTournamentTask,
  getInternationalBranchYear,
  getInternationalTournamentTaskWindow,
  isInternationalTournamentSave,
} from '../../services/fiba/tournamentTask';
import { activateInternationalTournamentFreeAgents } from '../../services/fiba/prepareNationalTeams';
import { getManagedEuroCompetitions } from '../../utils/euroLeagueDefaults';
import {
  getCompletedManagedEuroSeasonResolutions,
  shouldPrepareCompletedEuroSeasonRollover,
} from '../../services/competition/euroSeasonReview';
import { prepareCompletedEuroSeasonRollover } from '../../services/competition/euroSeasonRollover';
import { simulateRemainingInternationalTournament } from '../../services/fiba/playTournament';
import { prepareSummerLeagueTournament } from '../../services/summerLeague/roster';
import {
  getSummerLeagueOffseasonTaskYear,
  isSummerLeagueOffseasonTaskAvailable,
  isSummerLeagueTournamentEnabled,
} from '../../services/summerLeague/availability';
import { getLeagueCalendarDates, getLeagueSeasonForDate } from '../../services/leagueCalendar';
import { withDeathMemorialTask } from '../../services/playerDevelopment/deathMemorial';
import { isCommissionerSeasonReviewReady } from '../../services/commissionerTasks/taskRegistry';
import { resolveLeagueSeasonLifecycle } from '../../services/lifecycle/leagueSeasonLifecycle';

type SetGameState = Dispatch<SetStateAction<GameState>>;

export function withSummerLeagueTask(
  checklist: OffseasonChecklist,
  state: GameState,
): OffseasonChecklist {
  const savedTournament = state.summerLeagueTournament;
  const taskYear = getSummerLeagueOffseasonTaskYear(state);
  const tournament = savedTournament?.year == null || savedTournament.year === taskYear
    ? savedTournament
    : undefined;
  const status = !isSummerLeagueOffseasonTaskAvailable(state)
    ? 'skipped'
    : tournament?.reviewed || tournament?.status === 'reviewed'
      ? 'done'
      : checklist.summerLeague === 'in-progress' || tournament?.status === 'complete'
        ? 'in-progress'
        : 'pending';
  return checklist.summerLeague === status
    ? checklist
    : { ...checklist, summerLeague: status };
}

function withSummerTournamentTasks(
  checklist: OffseasonChecklist,
  state: GameState,
): OffseasonChecklist {
  return withDeathMemorialTask(
    withSummerLeagueTask(withInternationalTournamentTask(checklist, state), state),
    state.inbox,
  );
}

export function withInternationalTournamentTask(
  checklist: OffseasonChecklist,
  state: GameState,
): OffseasonChecklist {
  const calendarYear = state.date ? parseGameDate(state.date).getUTCFullYear() : undefined;
  const tournament = state.internationalTournament;
  const tournamentPlayedYear = tournament?.playedYear ?? tournament?.year;
  const currentTournament = tournamentPlayedYear === calendarYear ? tournament : undefined;
  const dueWindow = getInternationalTournamentTaskWindow(state);
  const explicitlySkipped = Number(state.internationalTournamentTaskSkippedYear) === Number(calendarYear);
  const status: OffseasonChecklist['internationalTournament'] = !isInternationalTournamentSave(state) || (!dueWindow && !currentTournament) || currentTournament?.readOnly
    ? 'skipped'
    : currentTournament?.reviewed || currentTournament?.status === 'reviewed'
        || (currentTournament?.status === 'complete' && !!currentTournament.result)
      ? 'done'
      : explicitlySkipped
        ? 'skipped'
      : currentTournament ? 'in-progress' : 'pending';
  const withTournamentStatus = checklist.internationalTournament === status
    ? checklist
    : { ...checklist, internationalTournament: status };
  return settleBypassedReviewsForInternationalTournament(withTournamentStatus, currentTournament);
}

export const useOffseasonChecklistLifecycle = (
  state: GameState,
  setState: SetGameState,
) => {
  useEffect(() => {
    if (!state.isDataLoaded || !state.offseasonChecklist) return;
    const next = withSummerTournamentTasks(state.offseasonChecklist, state);
    if (next === state.offseasonChecklist) return;
    setState(previous => previous.offseasonChecklist === state.offseasonChecklist
      ? { ...previous, offseasonChecklist: next }
      : previous);
  }, [
    setState,
    state.internationalTournament,
    state.internationalTournamentTaskSkippedYear,
    state.inbox,
    state.isDataLoaded,
    state.date,
    state.leagueStats?.uiMode,
    state.leagueType,
    state.moddedLeagueBase,
    state.nbaGmStartMode,
    state.nbaStartYear,
    !!state.offseasonChecklist,
    state.summerLeagueTournament,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || !state.date || !isSummerLeagueOffseasonTaskAvailable(state)) return;
    const today = parseGameDate(state.date);
    const todayStr = toISODateString(today);
    const activeSeason = getLeagueSeasonForDate(todayStr, state.leagueStats) || today.getUTCFullYear();
    const summerSeasonYear = [activeSeason - 2, activeSeason - 1, activeSeason, activeSeason + 1]
      .find(season => {
        const dates = getLeagueCalendarDates(season, state.leagueStats);
        return !!dates.summerLeagueStart && !!dates.summerLeagueEnd
          && today >= dates.summerLeagueStart && today <= dates.summerLeagueEnd;
      });
    if (!summerSeasonYear || !isSummerLeagueTournamentEnabled(state.leagueStats, summerSeasonYear)) return;
    if (
      state.nbaGmStartMode === 'fixed_preseason'
      && Number(state.nbaStartYear) === summerSeasonYear
    ) return;
    const current = state.summerLeagueTournament;
    if (current?.year === summerSeasonYear) return;
    if (current && !current.reviewed && current.status !== 'reviewed') return;
    const tournament = prepareSummerLeagueTournament(state, summerSeasonYear);
    if (!tournament) return;
    setState(previous => {
      const existing = previous.summerLeagueTournament;
      if (existing?.year === summerSeasonYear) return previous;
      if (existing && !existing.reviewed && existing.status !== 'reviewed') return previous;
      return {
        ...previous,
        summerLeagueTournament: tournament,
        offseasonChecklist: previous.offseasonChecklist
          ? withSummerLeagueTask(previous.offseasonChecklist, {
              ...previous,
              summerLeagueTournament: tournament,
            })
          : previous.offseasonChecklist,
      };
    });
  }, [
    setState,
    state.date,
    state.gameMode,
    state.isDataLoaded,
    state.leagueStats,
    state.leagueType,
    state.moddedLeagueBase,
    state.nbaGmStartMode,
    state.nbaStartYear,
    state.players,
    state.summerLeagueTournament,
    state.teams,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || !state.date || !isInternationalTournamentSave(state)) return;
    const today = parseGameDate(state.date);
    const todayStr = toISODateString(today);
    const calendarYear = today.getUTCFullYear();
    if (
      state.nbaGmStartMode === 'fixed_preseason'
      && state.leagueStats?.uiMode !== 'euro_isolated'
      && Number(state.nbaStartYear) === calendarYear
    ) return;
    const window = getPlayableInternationalWindowForSeason(
      calendarYear,
      calendarYear,
    );
    if (!window) return;
    if (todayStr < window.markerDate || todayStr > window.tournamentEndDate) return;
    const current = state.internationalTournament;
    if (current?.year === window.tournamentYear) return;
    if (current && !current.reviewed && current.status !== 'reviewed') return;

    let cancelled = false;
    prepareInternationalTournamentWindow(
      state.players,
      getInternationalBranchYear(state, calendarYear),
      calendarYear,
      calendarYear,
      normalizeDate(state.date),
    ).then(prepared => {
      if (cancelled) return;
      setState(prev => {
        const existing = prev.internationalTournament;
        if (existing && !existing.reviewed && existing.status !== 'reviewed') return prev;
        if (!prepared.tournament || prepared.tournament.readOnly) {
          return {
            ...prev,
            players: prepared.players,
            internationalTournamentTaskSkippedYear: calendarYear,
            offseasonChecklist: prev.offseasonChecklist
              ? { ...prev.offseasonChecklist, internationalTournament: 'skipped' }
              : prev.offseasonChecklist,
          };
        }
        return {
          ...prev,
          players: prepared.players,
          internationalTournament: prepared.tournament,
          offseasonChecklist: prev.offseasonChecklist
            ? withSummerTournamentTasks(prev.offseasonChecklist, {
                ...prev,
                internationalTournament: prepared.tournament,
              })
            : prev.offseasonChecklist,
        };
      });
    });
    return () => { cancelled = true; };
  }, [
    setState,
    state.date,
    state.euroStartSeason,
    state.internationalTournament,
    state.inbox,
    state.isDataLoaded,
    state.leagueStats?.historicalEraStartYear,
    state.leagueStats?.uiMode,
    state.leagueType,
    state.moddedLeagueBase,
    state.nbaGmStartMode,
    state.nbaStartYear,
    state.players,
  ]);

  useEffect(() => {
    const tournament = state.internationalTournament;
    if (!state.isDataLoaded || !tournament || !isInternationalTournamentSave(state)) return;
    const year = tournament.playedYear ?? tournament.year;
    const hasUnder19 = tournament.teams.some(team =>
      [...team.players, ...team.reserves].some(player => !!player.birthYear && year - player.birthYear < 19),
    );
    const missingSaveIds = tournament.teams.reduce((count, team) =>
      count + [...team.players, ...team.reserves].filter(player => !player.savePlayerId).length,
    0);
    const lifecycleNeedsAudit = state.internationalPlayerLifecycleTournamentId !== tournament.id;
    if (!hasUnder19 && missingSaveIds === 0 && !lifecycleNeedsAudit) return;

    let cancelled = false;
    activateInternationalTournamentFreeAgents(
      state.players,
      tournament,
      getInternationalBranchYear(state, year) - 1,
    ).then(activated => {
      if (cancelled) return;
      const remainingMissing = activated.tournament.teams.reduce((count, team) =>
        count + [...team.players, ...team.reserves].filter(player => !player.savePlayerId).length,
      0);
      const remainingUnder19 = activated.tournament.teams.some(team =>
        [...team.players, ...team.reserves].some(player => !!player.birthYear && year - player.birthYear < 19),
      );
      if (
        remainingMissing >= missingSaveIds
        && remainingUnder19 === hasUnder19
        && activated.players === state.players
        && !lifecycleNeedsAudit
      ) return;
      setState(prev => prev.internationalTournament?.id === tournament.id ? {
        ...prev,
        players: activated.players,
        internationalTournament: activated.tournament,
        internationalPlayerLifecycleTournamentId: tournament.id,
      } : prev);
    });
    return () => { cancelled = true; };
  }, [
    setState,
    state.euroStartSeason,
    state.internationalPlayerLifecycleTournamentId,
    state.internationalTournament,
    state.isDataLoaded,
    state.leagueStats?.historicalEraStartYear,
    state.leagueStats?.uiMode,
    state.leagueType,
    state.moddedLeagueBase,
    state.nbaStartYear,
    state.players,
  ]);

  useEffect(() => {
    const tournament = state.internationalTournament;
    const goldMedalGameFinished = tournament?.games.some(game => game.phase === 'final' && game.played);
    const bronzeMedalGamePending = tournament?.games.some(game => game.phase === 'third-place' && !game.played);
    if (
      !state.isDataLoaded
      || !tournament
      || !goldMedalGameFinished
      || !bronzeMedalGamePending
      || !isInternationalTournamentSave(state)
    ) return;
    setState(previous => {
      const current = previous.internationalTournament;
      if (
        !current
        || current.id !== tournament.id
        || !current.games.some(game => game.phase === 'final' && game.played)
        || !current.games.some(game => game.phase === 'third-place' && !game.played)
      ) return previous;
      return {
        ...previous,
        internationalTournament: simulateRemainingInternationalTournament(
          current,
          previous.players,
          previous.stats.playerApproval,
        ),
      };
    });
  }, [
    setState,
    state.internationalTournament,
    state.isDataLoaded,
    state.leagueStats?.uiMode,
    state.leagueType,
    state.moddedLeagueBase,
  ]);

  useEffect(() => {
    const tournament = state.internationalTournament;
    if (
      !state.isDataLoaded
      || !tournament?.result
      || tournament.status !== 'complete'
      || tournament.reviewed
      || !isInternationalTournamentSave(state)
    ) return;
    setState(previous => {
      const current = previous.internationalTournament;
      if (!current?.result || current.id !== tournament.id || current.status !== 'complete' || current.reviewed) {
        return previous;
      }
      return completeInternationalTournamentTask(previous);
    });
  }, [
    setState,
    state.internationalTournament,
    state.isDataLoaded,
    state.leagueStats?.uiMode,
    state.leagueType,
    state.moddedLeagueBase,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded) return;
    if (state.gameMode !== 'gm') return;
    if (!state.date) return;

    const isEuroIsolated = state.leagueStats?.uiMode === 'euro_isolated';
    if (isEuroIsolated) {
      const completedSeason = getCompletedManagedEuroSeasonResolutions(state);
      if (completedSeason && shouldPrepareCompletedEuroSeasonRollover(state, completedSeason)) {
        setState(prev => prepareCompletedEuroSeasonRollover(prev) ?? prev);
        return;
      }
    }
    const managedEuroState = isEuroIsolated
      ? {
          ...state,
          activeCompetitions: getManagedEuroCompetitions(state as any),
        }
      : state;
    const playoffsActive = !!(state.playoffs?.series ?? []).some(
      (s: any) => s.status !== 'complete',
    ) || hasUnresolvedEuroSeasonCompetitions(managedEuroState as any);
    const seasonLifecycle = resolveLeagueSeasonLifecycle(state);
    const canonicalDraftComplete = seasonLifecycle.draft.draft === 'complete';

    let phase: string;
    try {
      phase = getOffseasonState(
        state.date,
        state.leagueStats as any,
        state.schedule as any,
        { playoffsActive, draftComplete: canonicalDraftComplete },
      ).phase;
    } catch {
      return;
    }

    const isPbaIsolated = isPbaIsolatedMode(state);
    const pbaConferencePhase = (state.leagueStats as any)?.pbaConferencePhase;
    const pbaConferenceOffseason = isPbaIsolated && pbaConferencePhase === 'offseason';
    const inOffseason = isOffseasonActiveForChecklist(
      phase,
      seasonLifecycle.offseasonOpen,
      pbaConferenceOffseason,
    );
    const cYearForExit = state.date ? new Date(state.date).getUTCFullYear() : 0;
    const userManuallyExited = state.offseasonExitedYear === cYearForExit;
    const isInitialFirstSeason = (
      !state.seasonHistory
      || state.seasonHistory.length === 0
    ) && state.nbaGmStartMode !== 'full_offseason';
    const isFullyInSeason = phase === 'inSeason' && !inOffseason;
    const hasChecklist = !!state.offseasonChecklist;
    const suppressOpeningChecklist = shouldSuppressOpeningOffseasonChecklist(state);
    const isPbaActiveConference = isPbaActiveConferenceMode(state);
    const noDraftLeague = isNoDraftLeague(state.leagueStats);
    const lotteryResolved = noDraftLeague || isPbaIsolated || !isDraftLotteryEnabled(state.leagueStats?.draftType) || seasonLifecycle.draft.lottery === 'complete';
    const draftNotDone = !noDraftLeague && !isPbaIsolated && !canonicalDraftComplete;
    const isRealOffseasonNow = !isPbaIsolated && lotteryResolved && draftNotDone;

    let forceGate = false;
    let pastTrainingCampOpen = false;
    let upcomingTrainingCampIso: string | null = null;
    try {
      const lsAny = state.leagueStats as any;
      const lsYear: number = lsAny?.year ?? new Date().getFullYear();
      const currentDate = parseGameDate(state.date);
      const cMonth = currentDate.getUTCMonth() + 1;
      const cYear = currentDate.getUTCFullYear();
      const cDay = currentDate.getUTCDate();
      const draftSeasonYear = computeDraftSeasonYear(cMonth, cYear, lsYear, lsAny, cDay);
      const draftStr = toISODateString(getDraftDate(draftSeasonYear, lsAny));
      const todayStr = normalizeDate(state.date);
      const upcomingSeasonYear = computeUpcomingSeasonYear(cMonth, cYear, lsYear, lsAny, cDay);
      const campStr = toISODateString(getTrainingCampDate(upcomingSeasonYear, lsAny));
      upcomingTrainingCampIso = campStr;
      pastTrainingCampOpen = !!todayStr && !!campStr && todayStr >= campStr;
      forceGate = !isPbaIsolated && !noDraftLeague && !!todayStr && !!draftStr && todayStr >= draftStr && !canonicalDraftComplete && !pastTrainingCampOpen;
    } catch {}

    if (isPbaActiveConference) {
      if (state.offseasonChecklist || state.faTagCounter != null || (state.pendingOfferDecisions?.length ?? 0) > 0) {
        setState(prev => ({
          ...prev,
          offseasonChecklist: undefined,
          faTagCounter: undefined,
          pendingOfferDecisions: [],
        }));
      }
      return;
    }

    if (suppressOpeningChecklist) {
      if (hasChecklist) {
        setState(prev => ({
          ...prev,
          offseasonChecklist: undefined,
          faTagCounter: undefined,
          pendingOfferDecisions: [],
        }));
      }
      return;
    }

    const shouldAutoCloseEuroTransferTask = (() => {
      if (!isEuroIsolated || !hasChecklist || !upcomingTrainingCampIso || !state.date) return false;
      const checklist = state.offseasonChecklist!;
      const unresolved = checklist.transferMarket === 'pending' || checklist.transferMarket === 'in-progress';
      if (!unresolved) return false;
      const prerequisitesDone = (['sponsorRenewals', 'facilityUpgrades', 'staffRetirements', 'staffSignings'] as OffseasonChecklistRow[])
        .every(row => checklist[row] === 'done' || checklist[row] === 'skipped');
      return prerequisitesDone && normalizeDate(state.date) >= upcomingTrainingCampIso;
    })();

    if (inOffseason && !hasChecklist && (pbaConferenceOffseason || !userManuallyExited || isRealOffseasonNow || forceGate)) {
      const pbaConference = (state.leagueStats as any)?.pbaConference ?? 'philippine';
      const pbaSeason = Number((state.leagueStats as any)?.year);
      const pbaConferenceComplete = ((state.leagueStats as any)?.pbaConferenceChampions ?? []).some((entry: any) =>
        Number(entry?.season) === pbaSeason && entry?.conference === pbaConference,
      );
      const checklist = isPbaIsolated
        ? pbaConferenceComplete
          ? pbaConference === 'governors'
            ? initialPbaEndOfSeasonChecklist(state.gameMode === 'gm')
            : initialPbaInterConferenceChecklist(pbaConference)
          : initialPbaChecklist()
        : isEuroIsolated && isInitialFirstSeason && !isRealOffseasonNow
        ? initialEuroOffseasonChecklist(state.gameMode === 'gm')
        : isInitialFirstSeason && !isRealOffseasonNow
          ? initialPreseasonChecklist()
          : defaultOffseasonChecklist(state.leagueStats, state.gameMode === 'gm');
      const checklistWithExpansion =
        applyExpansionDraftOffseasonTransition(checklist, state.leagueStats, state.expansionSchedule) ?? checklist;
      setState(prev => ({
        ...prev,
        offseasonChecklist: withSummerTournamentTasks(checklistWithExpansion, prev),
        euroScheduleReleaseDate: isEuroIsolated ? undefined : prev.euroScheduleReleaseDate,
      }));
      return;
    }

    if (inOffseason && hasChecklist && shouldAutoCloseEuroTransferTask) {
      setState(prev => ({
        ...prev,
        offseasonChecklist: { ...prev.offseasonChecklist!, transferMarket: 'done' },
      }));
      return;
    }

    if (inOffseason && hasChecklist && !isEuroIsolated && !isPbaIsolatedMode(state)) {
      const checklist = state.offseasonChecklist!;
      const todayStr = normalizeDate(state.date);
      let next: OffseasonChecklist = withSummerTournamentTasks({ ...checklist }, state);
      let changed = next !== checklist
        && (next.internationalTournament !== checklist.internationalTournament
          || next.summerLeague !== checklist.summerLeague);
      const meeting = state.pendingGovernorsBoardMeeting;
      const meetingForSeason =
        !!meeting &&
        meeting.season === state.leagueStats?.year;
      const meetingActive = meetingForSeason && meeting.reviewed !== true;
      if (meetingActive && checklist.governorsBoardMeeting === 'skipped') {
        next.governorsBoardMeeting = 'pending';
        changed = true;
      } else if (meetingForSeason && meeting.reviewed === true && checklist.governorsBoardMeeting !== 'done') {
        next.governorsBoardMeeting = 'done';
        changed = true;
      } else if (!meetingForSeason && checklist.governorsBoardMeeting !== 'skipped') {
        next.governorsBoardMeeting = 'skipped';
        changed = true;
      }
      const seasonReviewExpected = !isInitialFirstSeason || lotteryResolved || canonicalDraftComplete;
      const nativeFictionalSeasonReviewExpected = isInitialFirstSeason
        && state.leagueType === 'fictional'
        && isCommissionerSeasonReviewReady(state);
      if (
        (seasonReviewExpected || nativeFictionalSeasonReviewExpected)
        && (typeof checklist.seasonSummary === 'undefined' || checklist.seasonSummary === 'skipped')
      ) {
        next.seasonSummary = 'pending';
        changed = true;
      }
      if (
        seasonReviewExpected
        && (typeof checklist.strategyReview === 'undefined' || checklist.strategyReview === 'skipped')
      ) {
        next.strategyReview = 'pending';
        changed = true;
      }
      if (seasonReviewExpected && checklist.retiredPlayersReview === 'skipped') {
        next.retiredPlayersReview = 'pending';
        changed = true;
      }
      if (seasonReviewExpected && checklist.hofCeremony === 'skipped') {
        next.hofCeremony = 'pending';
        changed = true;
      }
      const expansionNext = applyExpansionDraftOffseasonTransition(next, state.leagueStats, state.expansionSchedule);
      if (expansionNext && expansionNext !== next) {
        next = expansionNext;
        changed = true;
      }
      if (changed) {
        setState(prev => ({ ...prev, offseasonChecklist: next }));
      }
      return;
    }

    if (inOffseason && hasChecklist && !isPbaIsolated && pastTrainingCampOpen && !isRealOffseasonNow) {
      const checklist = state.offseasonChecklist!;
      const isUnresolved = (status: any) => status === 'pending' || status === 'in-progress';
      const preCampRows: OffseasonChecklistRow[] = [
        'draftLottery',
        'options',
        'qualifyingOffers',
        'myFAs',
        'draft',
        'rookieContracts',
        'freeAgency',
      ];
      const hasStalePreCamp = preCampRows.some(row => isUnresolved(checklist[row]));
      if (hasStalePreCamp) {
        const next: OffseasonChecklist = { ...checklist };
        for (const row of preCampRows) {
          if (isUnresolved((next as any)[row])) {
            (next as any)[row] = 'skipped';
          }
        }
        setState(prev => ({ ...prev, offseasonChecklist: next }));
      }
      return;
    }

    if (inOffseason && hasChecklist && !isPbaIsolated && noDraftLeague) {
      const checklist = state.offseasonChecklist!;
      const next: OffseasonChecklist = { ...checklist };
      let changed = false;
      for (const row of ['draftLottery', 'draft', 'rookieContracts'] as OffseasonChecklistRow[]) {
        if (next[row] !== 'skipped') {
          next[row] = 'skipped';
          changed = true;
        }
      }
      if (changed) {
        setState(prev => ({ ...prev, offseasonChecklist: next }));
      }
      return;
    }

    if (inOffseason && hasChecklist && isRealOffseasonNow) {
      const checklist = state.offseasonChecklist!;
      const hasInitialModeArtifacts =
        checklist.myFAs === 'skipped' || checklist.freeAgency === 'skipped' ||
        checklist.qualifyingOffers === 'skipped' || checklist.options === 'skipped' ||
        checklist.retiredPlayersReview === 'skipped' || checklist.staffRetirements === 'skipped' || checklist.hofCeremony === 'skipped' ||
        (!!state.pendingGovernorsBoardMeeting &&
          state.pendingGovernorsBoardMeeting.season === state.leagueStats?.year &&
          checklist.governorsBoardMeeting === 'skipped');
      const campWronglyDone = checklist.trainingCamp === 'done'
        && !!upcomingTrainingCampIso
        && normalizeDate(state.date) < upcomingTrainingCampIso;
      if (hasInitialModeArtifacts || campWronglyDone) {
        const fresh = defaultOffseasonChecklist(state.leagueStats, state.gameMode === 'gm');
        const nextFresh = {
          ...fresh,
          governorsBoardMeeting:
            !!state.pendingGovernorsBoardMeeting &&
            state.pendingGovernorsBoardMeeting.season === state.leagueStats?.year &&
            state.pendingGovernorsBoardMeeting.reviewed !== true
              ? 'pending'
              : fresh.governorsBoardMeeting,
          draftLottery: checklist.draftLottery === 'done' ? 'done' : fresh.draftLottery,
          draft: checklist.draft === 'done' ? 'done' : fresh.draft,
        } as OffseasonChecklist;
        const nextWithExpansion =
          applyExpansionDraftOffseasonTransition(nextFresh, state.leagueStats, state.expansionSchedule) ?? nextFresh;
        setState(prev => ({
          ...prev,
          offseasonChecklist: withSummerTournamentTasks(nextWithExpansion, prev),
        }));
      }
      return;
    }

    if (inOffseason && hasChecklist && isInitialFirstSeason && !isRealOffseasonNow) {
      const checklist = state.offseasonChecklist!;
      const hasRealOffseasonProgress =
        lotteryResolved ||
        canonicalDraftComplete ||
        checklist.draftLottery === 'done' ||
        checklist.draft === 'done' ||
        checklist.rookieContracts === 'done' ||
        checklist.options === 'done' ||
        checklist.qualifyingOffers === 'done' ||
        checklist.myFAs === 'done' ||
        checklist.freeAgency === 'in-progress';
      if (hasRealOffseasonProgress) return;

      const needsMigration = isEuroIsolated
        ? checklist.freeAgency === 'pending' || checklist.trainingCamp === 'in-progress'
        : checklist.draftLottery === 'pending' || checklist.options === 'pending' ||
          checklist.qualifyingOffers === 'pending' || checklist.myFAs === 'pending' ||
          checklist.draft === 'pending' || checklist.rookieContracts === 'pending' ||
          checklist.freeAgency === 'pending';

      if (needsMigration) {
        setState(prev => ({
          ...prev,
          offseasonChecklist: isEuroIsolated ? initialEuroOffseasonChecklist(state.gameMode === 'gm') : initialPreseasonChecklist(),
        }));
      }
      return;
    }

    if (isFullyInSeason && hasChecklist) {
      setState(prev => ({
        ...prev,
        offseasonChecklist: undefined,
        faTagCounter: undefined,
        pendingOfferDecisions: [],
      }));
    }
  }, [
    setState,
    state.activeCompetitions,
    state.boxScores,
    state.controlledTeams,
    state.date,
    state.draftComplete,
    state.seasonLifecycle,
    state.draftLotteryResult,
    state.expansionSchedule,
    state.gameMode,
    state.isDataLoaded,
    state.internationalTournament,
    state.leagueStats,
    state.nbaGmStartMode,
    state.offseasonChecklist,
    state.offseasonExitedYear,
    state.pendingGovernorsBoardMeeting,
    state.playoffs,
    state.schedule,
    state.seasonHistory,
    state.userTeamId,
  ]);
};
