import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { GameState, OffseasonChecklistRow, Tab, UserAction } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import {
  getCurrentOffseasonFAMoratoriumEnd,
  getTrainingCampDate,
  parseGameDate,
  toISODateString,
} from '../../utils/dateUtils';
import {
  defaultOffseasonChecklist,
  setRowStatus,
  OFFSEASON_ROW_TAB,
  computeUpcomingSeasonYear,
} from '../../services/offseason/offseasonState';
import { isPbaIsolatedMode } from '../../utils/uiMode';
import { isEuroVisibleScheduleGame } from '../../utils/euroLeagueDefaults';
import { generateForCompetition, selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { requestLeagueHistorySeasonDetail } from '../../components/central/view/LeagueHistoryNav';
import {
  clearConferenceImports,
  generateNextConferenceSchedule,
  getConferenceStartIso,
  getNextConference,
  type PbaConference,
} from '../../services/pba/conferenceTransition';
import { preparePbaLocalFreeAgency } from '../../services/pba/localFreeAgency';
import { applySeasonRollover } from '../../services/logic/seasonRollover';
import { autoSignPbaImportsForLazySim } from '../../services/logic/lazySimRunnerHelpers';
import { getAllStarWeekendDates } from '../../services/allStar/allStarWeekendDates';

type SetGameState = Dispatch<SetStateAction<GameState>>;

type HandleOffseasonDispatchActionArgs = {
  action: UserAction;
  setState: SetGameState;
  setCurrentView: (view: Tab) => void;
  stateRef: MutableRefObject<GameState>;
  dispatchAction: (action: UserAction) => Promise<void>;
};

export async function handleOffseasonDispatchAction({
  action,
  setState,
  setCurrentView,
  stateRef,
  dispatchAction,
}: HandleOffseasonDispatchActionArgs): Promise<boolean> {
  if (action.type === 'OFFSEASON_ENTER_PHASE') {
    const row = (action.payload as { row: OffseasonChecklistRow }).row;
    if (row === 'pbaAllStarWeekend' && isPbaIsolatedMode(stateRef.current)) {
      const season = stateRef.current.leagueStats?.year ?? new Date(stateRef.current.date).getUTCFullYear();
      const targetDate = toISODateString(getAllStarWeekendDates(season, { uiMode: 'pba_isolated' }).breakStart);
      const currentDate = normalizeDate(stateRef.current.date);
      setState(prev => ({
        ...prev,
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, row, 'in-progress'),
      }));
      if (currentDate < targetDate) {
        await dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { targetDate, stopBefore: true },
        } as any);
      }
      setCurrentView('All-Star');
      return true;
    }
    const reviewOnlyRow = row === 'seasonSummary' || row === 'pbaConferenceAwards';
    if (reviewOnlyRow) {
      const leagueStats = stateRef.current.leagueStats as any;
      const preparedPbaSeason = Number(leagueStats?.pbaYearEndRolloverPreparedSeason);
      const season = row === 'pbaConferenceAwards' && Number.isFinite(preparedPbaSeason)
        ? preparedPbaSeason
        : stateRef.current.leagueStats?.year;
      if (typeof season === 'number') {
        requestLeagueHistorySeasonDetail(season);
      }
    }
    setState(prev => {
      const pbaLocalFaPatch = row === 'pbaLocalFreeAgency'
        ? preparePbaLocalFreeAgency(prev)
        : {};
      const patched = { ...prev, ...pbaLocalFaPatch };
      return {
        ...patched,
        offseasonChecklist: setRowStatus(patched.offseasonChecklist, row, reviewOnlyRow ? 'done' : 'in-progress'),
      };
    });
    const target = OFFSEASON_ROW_TAB[row];
    if (target) setCurrentView(target);
    return true;
  }

  if (action.type === 'PROMOTE_YOUTH') {
    const { playerIds, teamId } = action.payload as { playerIds: any[]; teamId: number };
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
    setState(prev => {
      let next = prev;

      if (row === 'pbaImportDecision' && prev.leagueStats?.uiMode === 'pba_isolated') {
        const currentConference: PbaConference = ((prev.leagueStats as any)?.pbaConference ?? 'philippine') as PbaConference;
        const nextConference = getNextConference(currentConference);
        if (nextConference) {
          next = autoSignPbaImportsForLazySim(next, nextConference);
        }
      }

      return {
        ...next,
        leagueStats: row === 'youthPromotion' && next.leagueStats?.uiMode === 'euro_isolated'
          ? { ...next.leagueStats, euroYouthPromotionReviewedYear: next.leagueStats.year }
          : next.leagueStats,
        offseasonChecklist: setRowStatus(next.offseasonChecklist, row, 'done'),
      };
    });
    return true;
  }

  if (action.type === 'OFFSEASON_SKIP_PHASE') {
    const row = (action.payload as { row: OffseasonChecklistRow }).row;
    if (row === 'freeAgency' && (stateRef.current.faTagCounter ?? 0) > 0) {
      const todayNorm = stateRef.current.date ? normalizeDate(stateRef.current.date) : '';
      const currentDate = stateRef.current.date ? parseGameDate(stateRef.current.date) : new Date();
      const cMonth = currentDate.getUTCMonth() + 1;
      const cYear = currentDate.getUTCFullYear();
      const lsYear = stateRef.current.leagueStats?.year ?? cYear;
      const upcomingSeasonYear = computeUpcomingSeasonYear(cMonth, cYear, lsYear);
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
    setState(prev => ({
      ...prev,
      offseasonChecklist: defaultOffseasonChecklist(prev.leagueStats),
      faTagCounter: undefined,
      pendingOfferDecisions: [],
    }));
    return true;
  }

  if (action.type === 'OFFSEASON_AUTO_RESOLVE_ALL') {
    await dispatchAction({ type: 'OFFSEASON_EXIT', payload: { assistantGM: true } } as any);
    return true;
  }

  if (action.type === 'SUBMIT_QUALIFYING_OFFER') {
    const { playerId } = (action as any).payload as { playerId: string };
    setState(prev => ({
      ...prev,
      players: prev.players.map(player =>
        player.internalId === playerId
          ? { ...player, contract: { ...(player.contract as any), restrictedFA: true, isRestrictedFA: true, qualifyingOfferSubmitted: true } } as any
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
          ? { ...player, contract: { ...(player.contract as any), restrictedFA: false, isRestrictedFA: false, qualifyingOfferSkipped: true, qualifyingOfferSubmitted: false } } as any
          : player,
      ),
    }));
    return true;
  }

  if (action.type === 'OFFSEASON_EXIT') {
    if (isPbaIsolatedMode(stateRef.current)) {
      const leagueStats = stateRef.current.leagueStats as any;
      const currentConference: PbaConference = leagueStats?.pbaConference ?? 'philippine';
      const nextConference = getNextConference(currentConference);
      if (!nextConference) {
        const preparedSeason = Number(leagueStats?.pbaYearEndRolloverPreparedSeason);
        const rolloverAlreadyPrepared = Number.isFinite(preparedSeason);
        const rolloverPatch = rolloverAlreadyPrepared ? {} : applySeasonRollover(stateRef.current);
        const rolledState = { ...stateRef.current, ...rolloverPatch } as GameState;
        const nextYear = rolloverAlreadyPrepared
          ? preparedSeason + 1
          : (rolledState.leagueStats as any)?.year ?? ((leagueStats?.year ?? new Date().getFullYear()) + 1);
        const philSpec = PBA_COMPETITIONS[0];
        const source = { nonNBATeams: rolledState.nonNBATeams as any, userTeamId: rolledState.userTeamId };
        const tids = selectCompetitionTeamTids(philSpec, source);
        const start = new Date(Date.UTC(nextYear - 1, philSpec.seasonStart.month - 1, philSpec.seasonStart.day));
        const newGames = generateForCompetition(philSpec, tids.map((tid: number) => ({ tid })), start, 800_000);
        const cleaned = clearConferenceImports((rolledState.players ?? stateRef.current.players) as any, currentConference);
        setState(prev => ({
          ...prev,
          ...rolloverPatch,
          players: cleaned,
          leagueStats: {
            ...((rolloverPatch.leagueStats ?? prev.leagueStats) as any),
            ...((rolledState.leagueStats ?? {}) as any),
            year: nextYear,
            pbaConference: 'philippine',
            pbaConferencePhase: 'regularSeason',
            pbaYearEndRolloverPreparedSeason: undefined,
          },
          date: getConferenceStartIso('philippine', nextYear),
          schedule: newGames,
          offseasonChecklist: undefined,
          draftComplete: undefined,
          activeDraftPicks: undefined,
          activeDraftPassedPicks: undefined,
          activeDraftOrder: undefined,
          draftLotteryResult: undefined,
        }));
      } else {
        const newGames = generateNextConferenceSchedule(stateRef.current, nextConference);
        const cleaned = clearConferenceImports(stateRef.current.players, currentConference);
        const withSignedImports = autoSignPbaImportsForLazySim(
          { ...stateRef.current, players: cleaned } as GameState,
          nextConference,
        );
        const startDate = getConferenceStartIso(nextConference, leagueStats?.year ?? new Date().getFullYear());
        setState(prev => ({
          ...prev,
          players: withSignedImports.players,
          history: withSignedImports.history ?? prev.history,
          leagueStats: {
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
    const leagueStats = stateRef.current.leagueStats as any;
    const lsYear: number = leagueStats?.year ?? new Date().getFullYear();
    const cMonth = stateRef.current.date ? new Date(stateRef.current.date).getUTCMonth() + 1 : 0;
    const cYear = stateRef.current.date ? new Date(stateRef.current.date).getUTCFullYear() : lsYear;
    const preseasonYear = cMonth <= 6 && cYear === lsYear ? lsYear : cYear;
    const todayStr = stateRef.current.date ? normalizeDate(stateRef.current.date) : '';
    const currentState = stateRef.current;
    const target = currentState.leagueStats?.uiMode === 'euro_isolated'
      ? ((currentState.schedule ?? [])
          .filter((game: any) => !game.played && isEuroVisibleScheduleGame(currentState as any, game))
          .map((game: any) => normalizeDate(game.date))
          .filter((date: string) => !!date && (!todayStr || date >= todayStr))
          .sort()[0] ?? `${preseasonYear}-09-28`)
      : ((currentState.schedule ?? [])
          .filter((game: any) => game.isPreseason && !game.played)
          .map((game: any) => normalizeDate(game.date))
          .filter((date: string) => !!date && (!todayStr || date > todayStr))
          .sort()[0] ?? `${preseasonYear}-10-01`);
    if (todayStr && todayStr < target) {
      await dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: target, stopBefore: true, assistantGM: useAssistantGM },
      } as any);
    }
    const exitCYear = stateRef.current.date ? new Date(stateRef.current.date).getUTCFullYear() : 0;
    setState(prev => ({
      ...prev,
      offseasonChecklist: undefined,
      faTagCounter: undefined,
      faTagsTotal: undefined,
      pendingOfferDecisions: [],
      offseasonExitedYear: exitCYear,
    }));
    return true;
  }

  if (action.type === 'OFFSEASON_ADVANCE_FA_TAG') {
    const total = stateRef.current.faTagsTotal ?? 13;
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
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, 'freeAgency', 'in-progress'),
        faTagCounter: 1,
        faTagsTotal: total,
      }));
      return true;
    }

    const daysPerTag = Math.max(1, Math.floor(62 / total));
    const currentDate = new Date(`${normalizeDate(currentDateStr)}T00:00:00Z`);
    currentDate.setUTCDate(currentDate.getUTCDate() + daysPerTag);
    const targetISO = toISODateString(currentDate);
    await dispatchAction({
      type: 'SIMULATE_TO_DATE',
      payload: { targetDate: targetISO, stopBefore: true },
    } as any);

    const newCounter = counter + 1;
    if (newCounter >= total) {
      setState(prev => ({
        ...prev,
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, 'freeAgency', 'done'),
        faTagCounter: undefined,
        faTagsTotal: undefined,
      }));
    } else {
      setState(prev => ({
        ...prev,
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, 'freeAgency', 'in-progress'),
        faTagCounter: newCounter,
      }));
    }
    return true;
  }

  return false;
}
