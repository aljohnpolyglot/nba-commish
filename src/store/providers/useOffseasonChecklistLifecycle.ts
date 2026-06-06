import { Dispatch, SetStateAction, useEffect } from 'react';
import { GameState, OffseasonChecklist, OffseasonChecklistRow } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { getDraftDate, getTrainingCampDate, toISODateString } from '../../utils/dateUtils';
import {
  computeUpcomingSeasonYear,
  defaultOffseasonChecklist,
  getOffseasonState,
  initialEuroOffseasonChecklist,
  initialPbaChecklist,
  initialPreseasonChecklist,
  isNoDraftLeague,
} from '../../services/offseason/offseasonState';
import { hasUnresolvedEuroSeasonCompetitions } from '../../services/competition/competitionResolver';
import { getHOFCeremonyDateString } from '../../services/playerDevelopment/hofChecker';
import { isPbaIsolatedMode } from '../../utils/uiMode';

type SetGameState = Dispatch<SetStateAction<GameState>>;

export const useOffseasonChecklistLifecycle = (
  state: GameState,
  setState: SetGameState,
) => {
  useEffect(() => {
    if (!state.isDataLoaded) return;
    if (state.gameMode !== 'gm') return;
    if (!state.date) return;

    const playoffsActive = !!(state.playoffs?.series ?? []).some(
      (s: any) => s.status !== 'complete',
    ) || hasUnresolvedEuroSeasonCompetitions(state as any);

    let phase: string;
    try {
      phase = getOffseasonState(
        state.date,
        state.leagueStats as any,
        state.schedule as any,
        { playoffsActive, draftComplete: !!state.draftComplete },
      ).phase;
    } catch {
      return;
    }

    const inOffseason = phase !== 'inSeason';
    const cYearForExit = state.date ? new Date(state.date).getUTCFullYear() : 0;
    const userManuallyExited = state.offseasonExitedYear === cYearForExit;
    const isInitialFirstSeason = !state.seasonHistory || state.seasonHistory.length === 0;
    const isFullyInSeason = phase === 'inSeason' && !inOffseason;
    const hasChecklist = !!state.offseasonChecklist;
    const isPbaIsolated = isPbaIsolatedMode(state);
    const noDraftLeague = isNoDraftLeague(state.leagueStats);
    const lotteryResolved = noDraftLeague || isPbaIsolated || !!(state.draftLotteryResult && state.draftLotteryResult.length > 0);
    const draftNotDone = !noDraftLeague && !isPbaIsolated && !state.draftComplete;
    const isRealOffseasonNow = !isPbaIsolated && lotteryResolved && draftNotDone;

    let forceGate = false;
    let pastTrainingCampOpen = false;
    let upcomingTrainingCampIso: string | null = null;
    try {
      const lsAny = state.leagueStats as any;
      const lsYear: number = lsAny?.year ?? new Date().getFullYear();
      const cMonth = new Date(state.date).getUTCMonth() + 1;
      const cYear = new Date(state.date).getUTCFullYear();
      const draftSeasonYear = cMonth >= 7 ? cYear : lsYear;
      const draftStr = toISODateString(getDraftDate(draftSeasonYear, lsAny));
      const todayStr = normalizeDate(state.date);
      const upcomingSeasonYear = computeUpcomingSeasonYear(cMonth, cYear, lsYear);
      const campStr = toISODateString(getTrainingCampDate(upcomingSeasonYear, lsAny));
      upcomingTrainingCampIso = campStr;
      pastTrainingCampOpen = !!todayStr && !!campStr && todayStr >= campStr;
      forceGate = !isPbaIsolated && !noDraftLeague && !!todayStr && !!draftStr && todayStr >= draftStr && !state.draftComplete && !pastTrainingCampOpen;
    } catch {}

    const isEuroIsolated = state.leagueStats?.uiMode === 'euro_isolated';
    if (isPbaIsolated && hasChecklist && (state.leagueStats as any)?.pbaConferencePhase !== 'offseason') {
      setState(prev => ({
        ...prev,
        offseasonChecklist: undefined,
        faTagCounter: undefined,
        pendingOfferDecisions: [],
      }));
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

    if (inOffseason && !hasChecklist && (!userManuallyExited || isRealOffseasonNow || forceGate)) {
      const checklist = isPbaIsolated
        ? initialPbaChecklist()
        : isEuroIsolated && isInitialFirstSeason && !isRealOffseasonNow
        ? initialEuroOffseasonChecklist()
        : isInitialFirstSeason && !isRealOffseasonNow
          ? initialPreseasonChecklist()
          : defaultOffseasonChecklist(state.leagueStats);
      setState(prev => ({ ...prev, offseasonChecklist: checklist }));
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
      const offseasonYear = Number(todayStr.slice(0, 4));
      const next: OffseasonChecklist = { ...checklist };
      let changed = false;
      if (typeof checklist.seasonSummary === 'undefined') {
        next.seasonSummary = state.draftComplete ? 'done' : lotteryResolved ? 'pending' : 'skipped';
        changed = true;
      } else if (state.draftComplete && checklist.seasonSummary === 'pending') {
        next.seasonSummary = 'done';
        changed = true;
      }
      if (Number.isFinite(offseasonYear)) {
        if (todayStr >= `${offseasonYear}-07-01` && checklist.retiredPlayersReview === 'skipped') {
          next.retiredPlayersReview = 'pending';
          changed = true;
        }
        const hofCeremonyDate = getHOFCeremonyDateString(offseasonYear);
        if (todayStr >= `${offseasonYear}-07-01` && checklist.hofCeremony === 'skipped') {
          next.hofCeremony = 'pending';
          changed = true;
        }
        if (todayStr >= hofCeremonyDate && checklist.hofCeremony === 'skipped') {
          next.hofCeremony = 'pending';
          changed = true;
        }
      }
      if (changed) {
        setState(prev => ({ ...prev, offseasonChecklist: next }));
      }
      return;
    }

    if (inOffseason && hasChecklist && pastTrainingCampOpen && !isRealOffseasonNow) {
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

    if (inOffseason && hasChecklist && noDraftLeague) {
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
        checklist.retiredPlayersReview === 'skipped' || checklist.staffRetirements === 'skipped' || checklist.hofCeremony === 'skipped';
      const cMonthNow = new Date(state.date).getUTCMonth() + 1;
      const cDayNow = new Date(state.date).getUTCDate();
      const isInCampWindowNow = (cMonthNow === 9 && cDayNow >= 29) || (cMonthNow === 10 && cDayNow <= 20);
      const campWronglyDone = checklist.trainingCamp === 'done' && !isInCampWindowNow && cMonthNow < 10;
      if (hasInitialModeArtifacts || campWronglyDone) {
        const fresh = defaultOffseasonChecklist(state.leagueStats);
        setState(prev => ({
          ...prev,
          offseasonChecklist: {
            ...fresh,
            draftLottery: checklist.draftLottery === 'done' ? 'done' : fresh.draftLottery,
            draft: checklist.draft === 'done' ? 'done' : fresh.draft,
          },
        }));
      }
      return;
    }

    if (inOffseason && hasChecklist && isInitialFirstSeason && !isRealOffseasonNow) {
      const checklist = state.offseasonChecklist!;
      const hasRealOffseasonProgress =
        lotteryResolved ||
        state.draftComplete ||
        checklist.draftLottery === 'done' ||
        checklist.draft === 'done' ||
        checklist.rookieContracts === 'done' ||
        checklist.options === 'done' ||
        checklist.qualifyingOffers === 'done' ||
        checklist.myFAs === 'done' ||
        checklist.freeAgency === 'in-progress';
      if (hasRealOffseasonProgress) return;

      const youthReviewedYear = (state.leagueStats as any)?.euroYouthPromotionReviewedYear;
      if (isEuroIsolated && checklist.youthPromotion === 'done' && youthReviewedYear !== state.leagueStats?.year) {
        setState(prev => ({
          ...prev,
          offseasonChecklist: { ...prev.offseasonChecklist!, youthPromotion: 'pending' },
        }));
        return;
      }

      const needsMigration = isEuroIsolated
        ? checklist.freeAgency === 'pending' || checklist.trainingCamp === 'in-progress'
        : checklist.draftLottery === 'pending' || checklist.options === 'pending' ||
          checklist.qualifyingOffers === 'pending' || checklist.myFAs === 'pending' ||
          checklist.draft === 'pending' || checklist.rookieContracts === 'pending' ||
          checklist.freeAgency === 'pending';

      if (needsMigration) {
        setState(prev => ({
          ...prev,
          offseasonChecklist: isEuroIsolated ? initialEuroOffseasonChecklist() : initialPreseasonChecklist(),
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
    state.date,
    state.draftComplete,
    state.draftLotteryResult,
    state.gameMode,
    state.isDataLoaded,
    state.leagueStats,
    state.offseasonChecklist,
    state.offseasonExitedYear,
    state.playoffs,
    state.schedule,
    state.seasonHistory,
  ]);
};
