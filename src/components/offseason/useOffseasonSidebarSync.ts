import React, { useEffect, useRef } from 'react';
import type { OffseasonChecklistRow, OffseasonRowStatus } from '../../types';
import { useExpiringResignGate } from '../../hooks/useExpiringResignGate';
import { getOffseasonState, computeUpcomingSeasonYear } from '../../services/offseason/offseasonState';
import { getTransferWindowProgress, getUpcomingTrainingCampISO, getOffseasonCalendarYear, lsYearOf, useCalendarRowSignals, getEffectivePlayerExpYear } from './aufgabenShared';
import { isInTransferWindow } from '../../utils/transferWindow';
import { getDraftDate, getDraftLotteryDate, getTrainingCampDate, parseGameDate, toISODateString } from '../../utils/dateUtils';
import { normalizeDate } from '../../utils/helpers';
import { getEffectivePbaConference } from '../../services/pba/importManager';

type Args = {
  state: any;
  dispatchAction: (action: any) => void;
  checklist: any;
  visibleRows: readonly OffseasonChecklistRow[];
  sponsorCoverage: { complete: boolean };
  openStaffCount: number;
  staffRetirementCount?: number;
  isEuroMode: boolean;
};

export function useOffseasonSidebarSync({
  state,
  dispatchAction,
  checklist,
  visibleRows,
  sponsorCoverage,
  openStaffCount,
  staffRetirementCount = 0,
  isEuroMode,
}: Args) {
  const tmWindowCounter = React.useMemo(() => {
    if (!isEuroMode || !checklist || checklist.transferMarket === 'done' || checklist.transferMarket === 'skipped') return null;
    return getTransferWindowProgress(state.date, state.leagueStats);
  }, [isEuroMode, state.date, state.leagueStats, checklist?.transferMarket]);

  const transferWindowStatus = React.useMemo(
    () => (isEuroMode ? isInTransferWindow(state.date ?? new Date(), state.leagueStats as any) : null),
    [isEuroMode, state.date, state.leagueStats],
  );

  const transferWindowNextOpenLabel = React.useMemo(() => {
    if (!transferWindowStatus?.nextOpen) return null;
    return transferWindowStatus.nextOpen.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    });
  }, [transferWindowStatus?.nextOpen]);

  const sidebarSignals = useCalendarRowSignals();

  const expiringGate = useExpiringResignGate({
    onNavigateManual: () => {
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingTeamOfficeNav: { tab: 'intel', intelTab: 'expiring' } },
      } as any);
    },
  });

  const unresolvedExpiringCount = React.useMemo(() => {
    if (state.userTeamId == null) return 0;
    const currentYear = getOffseasonCalendarYear(state);
    return state.players.filter((p: any) =>
      p.tid === state.userTeamId &&
      p.status === 'Active' &&
      p.contract &&
      getEffectivePlayerExpYear(p, currentYear) === currentYear &&
      !p.contract.hasTeamOption
    ).length;
  }, [state.players, state.userTeamId, state.leagueStats?.year]);
  const actionableExpiringCount = expiringGate.actionableCount ?? 0;

  const myFAsModalShown = useRef(false);
  const myFAsModalOpened = useRef(false);

  useEffect(() => {
    const currentChecklist = state.offseasonChecklist as any;
    if (!currentChecklist || isEuroMode || state.leagueStats?.uiMode === 'pba_isolated') return;
    if ((state as any).offseasonUnifiedStaffRowsMigratedYear === lsYearOf(state)) return;
    const next: any = {};
    if ((currentChecklist.staffSignings === 'skipped' || currentChecklist.staffSignings === 'done') && visibleRows.includes('staffSignings')) {
      next.staffSignings = 'pending';
    }
    if ((currentChecklist.staffRetirements === 'skipped' || currentChecklist.staffRetirements === 'done') && visibleRows.includes('staffRetirements') && staffRetirementCount > 0) {
      next.staffRetirements = 'pending';
    }
    if (currentChecklist.coachingSignings !== 'skipped') {
      next.coachingSignings = 'skipped';
    }
    if (Object.keys(next).length === 0) return;
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        offseasonChecklist: { ...currentChecklist, ...next },
        offseasonUnifiedStaffRowsMigratedYear: lsYearOf(state),
      },
    } as any);
  }, [dispatchAction, openStaffCount, isEuroMode, state, visibleRows]);

  useEffect(() => {
    const currentChecklist = state.offseasonChecklist as any;
    if (!currentChecklist) return;
    const unresolved = (s: string) => s === 'pending' || s === 'in-progress';
    if (unresolved(currentChecklist.coachingSignings)) {
      dispatchAction({ type: 'OFFSEASON_SKIP_PHASE', payload: { row: 'coachingSignings' } } as any);
    }
    if (unresolved(currentChecklist.staffRetirements) && staffRetirementCount === 0) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'staffRetirements' } } as any);
    }
    if (unresolved(currentChecklist.staffSignings) && openStaffCount === 0) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'staffSignings' } } as any);
    }
    if (unresolved(currentChecklist.sponsorRenewals) && sponsorCoverage.complete) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'sponsorRenewals' } } as any);
    }
  }, [openStaffCount, staffRetirementCount, sponsorCoverage.complete, state.offseasonChecklist?.coachingSignings, state.offseasonChecklist?.staffRetirements, state.offseasonChecklist?.staffSignings, state.offseasonChecklist?.sponsorRenewals, state.teams, state.nonNBATeams, dispatchAction]);

  useEffect(() => {
    if (expiringGate.isOpen) {
      myFAsModalOpened.current = true;
      return;
    }
    if (myFAsModalShown.current && myFAsModalOpened.current && !expiringGate.isOpen) {
      myFAsModalShown.current = false;
      myFAsModalOpened.current = false;
      if (actionableExpiringCount === 0) {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'myFAs' } } as any);
      }
    }
  }, [expiringGate.isOpen, actionableExpiringCount, dispatchAction]);

  useEffect(() => {
    if (!checklist) return;
    if (checklist.myFAs !== 'pending' && checklist.myFAs !== 'in-progress') return;
    if (!state.date) return;
    const phase = getOffseasonState(state.date, state.leagueStats as any, state.schedule as any).phase;
    if (phase !== 'moratorium' && phase !== 'birdRights' && phase !== 'openFA' && phase !== 'preCamp') return;
    if (actionableExpiringCount > 0 && !expiringGate.allResolved) return;
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'myFAs' } } as any);
  }, [checklist, state.date, state.leagueStats, state.schedule, actionableExpiringCount, expiringGate.allResolved, dispatchAction]);

  useEffect(() => {
    if (!checklist || checklist.myFAs !== 'done') return;
    if (checklist.freeAgency !== 'pending') return;
    if (state.date) {
      const phase = getOffseasonState(state.date, state.leagueStats as any, state.schedule as any).phase;
      if (phase === 'moratorium' || phase === 'birdRights' || phase === 'openFA' || phase === 'preCamp') return;
    }
    if (actionableExpiringCount <= 0) return;
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: { offseasonChecklist: { ...checklist, myFAs: 'pending' } },
    } as any);
  }, [checklist, state.date, state.leagueStats, state.schedule, actionableExpiringCount, dispatchAction]);

  useEffect(() => {
    if (!checklist || (state.faTagCounter ?? 0) === 0) return;
    const faStatus = checklist.freeAgency;
    if (faStatus !== 'pending' && faStatus !== 'in-progress') return;
    if (!state.date || !state.leagueStats) return;
    const ls = state.leagueStats as any;
    const lsYear = lsYearOf(state);
    const cMonth = parseGameDate(state.date).getUTCMonth() + 1;
    const currentYear = parseGameDate(state.date).getUTCFullYear();
    const upcomingSeasonYear = computeUpcomingSeasonYear(cMonth, currentYear, lsYear);
    const campStr = toISODateString(getTrainingCampDate(upcomingSeasonYear, ls));
    const todayNorm = normalizeDate(state.date);
    if (todayNorm && todayNorm >= campStr) {
      dispatchAction({ type: 'OFFSEASON_SKIP_PHASE', payload: { row: 'freeAgency' } } as any);
    }
  }, [state.date, state.faTagCounter, checklist, state.leagueStats, dispatchAction]);

  useEffect(() => {
    if (!checklist || checklist.freeAgency !== 'skipped') return;
    if ((state.faTagCounter ?? 0) <= 0) return;
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: { offseasonChecklist: { ...checklist, freeAgency: 'in-progress' } },
    } as any);
  }, [checklist, state.faTagCounter, dispatchAction]);

  const lotteryDone = !!(state.draftLotteryResult && state.draftLotteryResult.length > 0);
  const draftDone = !!state.draftComplete;
  const rookieContractsDone = draftDone;
  const noPendingTeamOptions = (() => {
    if (state.gameMode !== 'gm' || state.userTeamId == null) return false;
    const currentYear = lsYearOf(state);
    const nextYear = currentYear + 1;
    const pending = state.players.filter((p: any) => {
      if (p.tid !== state.userTeamId || p.status !== 'Active') return false;
      if (!p.contract?.hasTeamOption) return false;
      const teamOptionExp = Number(p.contract?.teamOptionExp ?? p.contract?.exp ?? 0);
      return teamOptionExp === nextYear;
    });
    return pending.length === 0;
  })();

  const offseasonPhase = state.date
    ? getOffseasonState(state.date, state.leagueStats as any, state.schedule as any).phase
    : 'inSeason';
  const isInCampWindow = offseasonPhase === 'preCamp';
  const calendarTrainingCampDone = offseasonPhase === 'inSeason';
  const hasTrainingEngagement = React.useMemo(() => {
    if (!isInCampWindow) return false;
    if (state.gameMode !== 'gm' || state.userTeamId == null) return false;
    const userTeam = state.teams.find((t: any) => t.id === state.userTeamId) as any;
    if (userTeam?.trainingCalendar && Object.keys(userTeam.trainingCalendar).length > 0) return true;
    return state.players.some((p: any) =>
      p.tid === state.userTeamId && (!!p.devFocus || !!p.mentorId || (p.trainingIntensity && p.trainingIntensity !== 'Normal'))
    );
  }, [state.gameMode, state.userTeamId, state.teams, state.players, isInCampWindow]);
  const trainingCampDone = calendarTrainingCampDone;
  const noQOCandidates = state.gameMode === 'gm'
    && state.userTeamId != null
    && (() => {
      const currentYear = lsYearOf(state);
      return !state.players.some((p: any) =>
        p.tid === state.userTeamId &&
        p.status === 'Active' &&
        p.contract &&
        (p.contract.exp ?? 0) === currentYear &&
        p.contract.rookie &&
        p.draft?.round === 1 &&
        !p.contract.qualifyingOfferSkipped &&
        !p.contract.qualifyingOfferSubmitted
      );
    })();

  useEffect(() => {
    if (!checklist) return;
    const isUnresolved = (s: OffseasonRowStatus) => s === 'pending' || s === 'in-progress';
    if (lotteryDone && isUnresolved(checklist.draftLottery)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'draftLottery' } } as any);
    if (draftDone && isUnresolved(checklist.draft)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'draft' } } as any);
    if (rookieContractsDone && isUnresolved(checklist.rookieContracts)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'rookieContracts' } } as any);
    if (noPendingTeamOptions && isUnresolved(checklist.options)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'options' } } as any);
    if (trainingCampDone && isUnresolved(checklist.trainingCamp)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'trainingCamp' } } as any);
    if (noQOCandidates && isUnresolved(checklist.qualifyingOffers)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'qualifyingOffers' } } as any);
    if (draftDone && isUnresolved(checklist.pbaDraft)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaDraft' } } as any);
  }, [lotteryDone, draftDone, rookieContractsDone, noPendingTeamOptions, trainingCampDone, noQOCandidates, checklist?.draftLottery, checklist?.draft, checklist?.rookieContracts, checklist?.options, checklist?.trainingCamp, checklist?.qualifyingOffers, checklist?.pbaDraft, dispatchAction]);

  useEffect(() => {
    if (!checklist || state.leagueStats?.uiMode !== 'pba_isolated') return;
    const conf = getEffectivePbaConference(state.leagueStats as any);
    if (!conf || conf === 'philippine') return;
    const userTid = Number(state.userTeamId);
    if (!Number.isFinite(userTid)) return;
    const hasCurrentImport = (state.players ?? []).some((player: any) =>
      Number(player.tid) === userTid &&
      !!player.isImport &&
      player.importConference === conf
    );
    if (!hasCurrentImport) return;
    const isUnresolved = (s: OffseasonRowStatus) => s === 'pending' || s === 'in-progress';
    if (isUnresolved(checklist.pbaImportSearch)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaImportSearch' } } as any);
    }
    if (isUnresolved(checklist.pbaImportDecision)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaImportDecision' } } as any);
    }
  }, [
    checklist?.pbaImportSearch,
    checklist?.pbaImportDecision,
    state.leagueStats?.uiMode,
    (state.leagueStats as any)?.pbaConference,
    (state.leagueStats as any)?.pbaConferencePhase,
    state.userTeamId,
    state.players,
    dispatchAction,
  ]);

  useEffect(() => {
    if (!checklist) return;
    const schedule = (state as any).expansionSchedule;
    const lsYear = state.leagueStats?.year;
    if (!schedule || lsYear == null) return;
    if (schedule.year === lsYear && checklist.expansionDraft === 'skipped') {
      dispatchAction({
        type: 'SCHEDULE_EXPANSION',
        payload: {
          teams: schedule.teams,
          realignment: schedule.realignment ?? {},
          settings: state.expansionProtectionSettings ?? { perTeamLimit: 8, maxDraftedPerTeam: 2, picksPerExpansionTeam: 14 },
          scheduleYear: schedule.year,
        },
      } as any);
    }
  }, [(state as any).expansionSchedule, state.leagueStats?.year, checklist?.expansionDraft, dispatchAction]);

  useEffect(() => {
    if (!checklist) return;
    if (checklist.retiredPlayersReview !== 'in-progress') return;
    if (checklist.freeAgency !== 'pending') return;
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: { offseasonChecklist: { ...checklist, retiredPlayersReview: 'pending' } },
    } as any);
  }, [checklist, checklist?.retiredPlayersReview, checklist?.freeAgency, dispatchAction]);

  return {
    tmWindowCounter,
    transferWindowStatus,
    transferWindowNextOpenLabel,
    sidebarSignals,
    expiringGate,
    unresolvedExpiringCount,
    myFAsModalShown,
    myFAsModalOpened,
    draftDone,
    hasTrainingEngagement,
  };
}
