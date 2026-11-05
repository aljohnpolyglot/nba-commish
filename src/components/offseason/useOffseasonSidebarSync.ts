import React, { useEffect, useRef } from 'react';
import type { OffseasonChecklistRow, OffseasonRowStatus } from '../../types';
import { useExpiringResignGate } from '../../hooks/useExpiringResignGate';
import { getOffseasonState, computeUpcomingSeasonYear } from '../../services/offseason/offseasonState';
import { getUpcomingTrainingCampISO, lsYearOf, useCalendarRowSignals } from './aufgabenShared';
import { isInTransferWindow } from '../../utils/transferWindow';
import { getEuroOffseasonMarketProgress } from '../../services/offseason/euroOffseasonMarkets';
import { getDraftDate, getDraftLotteryDate, getTrainingCampDate, parseGameDate, toISODateString } from '../../utils/dateUtils';
import { normalizeDate } from '../../utils/helpers';
import {
  DEFAULT_EXPANSION_PROTECTION_SETTINGS,
  isExpansionDraftDueForOffseason,
} from '../../services/expansion/expansionOffseasonTransition';
import { getEffectivePbaConference } from '../../services/pba/importManager';
import {
  resolveStaffRetirementReviewPersistence,
  resolveUnifiedStaffSigningMigration,
} from '../../services/offseason/staffTaskPersistence';
import { getExpiringContractPlayers } from '../../services/freeAgency/expiringContractBoard';
import {
  getOffseasonBlockingRow,
  isPbaDraftCompleteForSeason,
} from '../../services/offseason/offseasonChecklistState';
import { getPendingTeamOptions, getRfaCandidates } from './offseasonSidebarData';
import { resolveLeagueSeasonLifecycle } from '../../services/lifecycle/leagueSeasonLifecycle';
import {
  findCurrentStaffHiresReviewEvidence,
  projectStaffHiringRequirements,
} from '../../services/offseason/staffHiringRequirements';
import {
  completeFranchiseDealsFromEvidence,
  projectFranchiseDealsRequirements,
} from '../../services/offseason/taskCompletionEvidence';
import { getFranchiseDealsTaskAccess } from '../../services/franchises/franchiseTaskTiming';

type Args = {
  state: any;
  dispatchAction: (action: any) => void;
  checklist: any;
  visibleRows: readonly OffseasonChecklistRow[];
  sponsorCoverage: { complete: boolean };
  openStaffCount: number;
  staffTeamReady: boolean;
  staffRetirementCount?: number;
  staffRetirementIds?: readonly string[];
  isEuroMode: boolean;
};

export function useOffseasonSidebarSync({
  state,
  dispatchAction,
  checklist,
  visibleRows,
  sponsorCoverage,
  openStaffCount,
  staffTeamReady,
  staffRetirementCount = 0,
  staffRetirementIds = [],
  isEuroMode,
}: Args) {
  const tmWindowCounter = React.useMemo(() => {
    if (!isEuroMode || !checklist || checklist.transferMarket === 'done' || checklist.transferMarket === 'skipped') return null;
    return getEuroOffseasonMarketProgress(state.date, 'transfer');
  }, [isEuroMode, state.date, checklist?.transferMarket]);

  const signingWindowCounter = React.useMemo(() => {
    if (!isEuroMode || !checklist || checklist.freeAgency === 'done' || checklist.freeAgency === 'skipped') return null;
    return getEuroOffseasonMarketProgress(state.date, 'signing');
  }, [isEuroMode, state.date, checklist?.freeAgency]);

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
    return getExpiringContractPlayers(state, state.userTeamId).length;
  }, [state.players, state.userTeamId, state.leagueStats?.year]);
  const myFAsModalShown = useRef(false);
  const myFAsModalOpened = useRef(false);

  useEffect(() => {
    const currentChecklist = state.offseasonChecklist as any;
    if (!currentChecklist) return;
    const canMigrateUnifiedRows = !isEuroMode && state.leagueStats?.uiMode !== 'pba_isolated';
    const alreadyMigrated = (state as any).offseasonUnifiedStaffRowsMigratedYear === lsYearOf(state);
    const next: any = {};
    if (
      canMigrateUnifiedRows
      && !alreadyMigrated
      && currentChecklist.staffSignings === 'skipped'
      && visibleRows.includes('staffSignings')
    ) {
      next.staffSignings = resolveUnifiedStaffSigningMigration({
        status: currentChecklist.staffSignings,
        retirementStatus: currentChecklist.staffRetirements,
        openStaffCount,
        staffTeamReady,
      });
    }
    if (canMigrateUnifiedRows && !alreadyMigrated && currentChecklist.coachingSignings !== 'skipped') {
      next.coachingSignings = 'skipped';
    }
    if (Object.keys(next).length === 0) return;
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        offseasonChecklist: { ...currentChecklist, ...next },
        ...(canMigrateUnifiedRows && !alreadyMigrated
          ? { offseasonUnifiedStaffRowsMigratedYear: lsYearOf(state) }
          : {}),
      },
    } as any);
  }, [dispatchAction, openStaffCount, staffTeamReady, isEuroMode, state, visibleRows]);

  useEffect(() => {
    const currentChecklist = state.offseasonChecklist as any;
    if (!currentChecklist) return;
    const transition = resolveStaffRetirementReviewPersistence({
      status: currentChecklist.staffRetirements,
      currentIds: staffRetirementIds,
      reviewedIds: state.staffRetirementReviewedIds,
    });
    if (!transition.changed) return;
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        staffRetirementReviewedIds: transition.reviewedIds,
        offseasonChecklist: {
          ...currentChecklist,
          staffRetirements: transition.status,
        },
      },
    } as any);
  }, [
    dispatchAction,
    staffRetirementIds,
    state.offseasonChecklist,
    state.staffRetirementReviewedIds,
  ]);

  useEffect(() => {
    const currentChecklist = state.offseasonChecklist as any;
    if (!currentChecklist) return;
    const unresolved = (s: string) => s === 'pending' || s === 'in-progress';
    if (unresolved(currentChecklist.coachingSignings)) {
      dispatchAction({ type: 'OFFSEASON_SKIP_PHASE', payload: { row: 'coachingSignings' } } as any);
    }
    const staffRequirements = projectStaffHiringRequirements(state);
    if (staffRequirements) {
      const currentEvidence = findCurrentStaffHiresReviewEvidence(state, staffRequirements);
      const hasCycleEvidence = (state.staffHiresReviewEvidence ?? [])
        .some((evidence: any) => Number(evidence.cycleSeason) === staffRequirements.cycleSeason);
      const terminal = currentChecklist.staffSignings === 'done' || currentChecklist.staffSignings === 'skipped';
      if (
        currentChecklist.staffSignings === 'in-progress'
        && !staffRequirements.actionRequired
        && !currentEvidence
      ) {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'staffSignings' } } as any);
      } else if (currentEvidence && !terminal) {
        dispatchAction({
          type: 'UPDATE_STATE',
          payload: { offseasonChecklist: { ...currentChecklist, staffSignings: 'done' } },
        } as any);
      } else if (!currentEvidence && hasCycleEvidence && terminal) {
        dispatchAction({
          type: 'UPDATE_STATE',
          payload: { offseasonChecklist: { ...currentChecklist, staffSignings: 'pending' } },
        } as any);
      }
    }
    if (
      isEuroMode
      && unresolved(currentChecklist.sponsorRenewals)
      && sponsorCoverage.complete
      && getOffseasonBlockingRow('sponsorRenewals', currentChecklist, visibleRows) === null
    ) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'sponsorRenewals' } } as any);
    }
    if (!isEuroMode && unresolved(currentChecklist.sponsorRenewals)) {
      const requirements = projectFranchiseDealsRequirements(state);
      const access = getFranchiseDealsTaskAccess(state);
      if (
        access.available
        && requirements?.requiredItems.length === 0
        && getOffseasonBlockingRow('sponsorRenewals', currentChecklist, visibleRows) === null
      ) {
        const completed = completeFranchiseDealsFromEvidence(state);
        dispatchAction({
          type: 'UPDATE_STATE',
          payload: {
            franchiseDealsReviewEvidence: completed.franchiseDealsReviewEvidence,
            offseasonChecklist: completed.offseasonChecklist,
            lastOutcome: completed.lastOutcome,
          },
        } as any);
      }
    }
  }, [openStaffCount, staffTeamReady, sponsorCoverage.complete, isEuroMode, state.date, state.leagueStats, state.schedule, state.staffSigningsDelegatedYear, state.staffHiresReviewEvidence, state.staffRetirementAnnouncements, state.franchiseDealsReviewEvidence, state.offseasonChecklist?.coachingSignings, state.offseasonChecklist?.staffRetirements, state.offseasonChecklist?.staffSignings, state.offseasonChecklist?.sponsorRenewals, state.teams, state.nonNBATeams, visibleRows, dispatchAction]);

  useEffect(() => {
    if (expiringGate.isOpen) {
      myFAsModalOpened.current = true;
      return;
    }
    if (myFAsModalShown.current && myFAsModalOpened.current && !expiringGate.isOpen) {
      myFAsModalShown.current = false;
      myFAsModalOpened.current = false;
      if (!expiringGate.hasRows || expiringGate.reviewed) {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'myFAs' } } as any);
      }
    }
  }, [expiringGate.isOpen, expiringGate.hasRows, expiringGate.reviewed, dispatchAction]);

  useEffect(() => {
    if (!checklist) return;
    if (checklist.myFAs !== 'pending' && checklist.myFAs !== 'in-progress') return;
    if (!state.date) return;
    const phase = getOffseasonState(state.date, state.leagueStats as any, state.schedule as any).phase;
    if (phase !== 'moratorium' && phase !== 'birdRights' && phase !== 'openFA' && phase !== 'preCamp') return;
    if (expiringGate.hasRows && !expiringGate.reviewed) return;
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'myFAs' } } as any);
  }, [checklist, state.date, state.leagueStats, state.schedule, expiringGate.hasRows, expiringGate.reviewed, dispatchAction]);

  useEffect(() => {
    if (!checklist || checklist.myFAs !== 'done') return;
    if (state.date) {
      const phase = getOffseasonState(state.date, state.leagueStats as any, state.schedule as any).phase;
      if (phase === 'inSeason') return;
    }
    if (!expiringGate.hasRows || expiringGate.reviewed) return;
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: { offseasonChecklist: { ...checklist, myFAs: 'pending' } },
    } as any);
  }, [checklist, state.date, state.leagueStats, state.schedule, expiringGate.hasRows, expiringGate.reviewed, dispatchAction]);

  useEffect(() => {
    if (!checklist || (state.faTagCounter ?? 0) === 0) return;
    const faStatus = checklist.freeAgency;
    if (faStatus !== 'pending' && faStatus !== 'in-progress') return;
    if (!state.date || !state.leagueStats) return;
    const ls = state.leagueStats as any;
    const lsYear = lsYearOf(state);
    const cMonth = parseGameDate(state.date).getUTCMonth() + 1;
    const currentYear = parseGameDate(state.date).getUTCFullYear();
    const currentDay = parseGameDate(state.date).getUTCDate();
    const upcomingSeasonYear = computeUpcomingSeasonYear(cMonth, currentYear, lsYear, ls, currentDay);
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

  const seasonLifecycle = resolveLeagueSeasonLifecycle(state);
  const lotteryDone = seasonLifecycle.draft.lottery === 'complete'
    || seasonLifecycle.draft.lottery === 'not-applicable';
  const lotteryReplayPending = Number(state.draftLotteryReplayPendingYear) === lsYearOf(state);
  const draftDone = seasonLifecycle.draft.draft === 'complete';
  const pbaDraftDone = isPbaDraftCompleteForSeason(state.leagueStats, draftDone);
  const rookieContractsDone = seasonLifecycle.draft.rookieContracts === 'complete';
  const noPendingTeamOptions = state.gameMode === 'gm'
    && state.userTeamId != null
    && getPendingTeamOptions(state).length === 0;

  const offseasonPhase = state.date
    ? getOffseasonState(state.date, state.leagueStats as any, state.schedule as any).phase
    : 'inSeason';
  const calendarTrainingCampDone = offseasonPhase === 'inSeason';
  const trainingCampDone = calendarTrainingCampDone;
  const noQOCandidates = state.gameMode === 'gm'
    && state.userTeamId != null
    && getRfaCandidates(state).length === 0;

  useEffect(() => {
    if (!checklist) return;
    const isUnresolved = (s: OffseasonRowStatus) => s === 'pending' || s === 'in-progress';
    if (lotteryDone && !lotteryReplayPending && isUnresolved(checklist.draftLottery)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'draftLottery' } } as any);
    if (draftDone && isUnresolved(checklist.draft)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'draft' } } as any);
    if (rookieContractsDone && isUnresolved(checklist.rookieContracts)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'rookieContracts' } } as any);
    if (noPendingTeamOptions && isUnresolved(checklist.options)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'options' } } as any);
    if (trainingCampDone && isUnresolved(checklist.trainingCamp)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'trainingCamp' } } as any);
    if (noQOCandidates && isUnresolved(checklist.qualifyingOffers)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'qualifyingOffers' } } as any);
    if (pbaDraftDone && isUnresolved(checklist.pbaDraft)) dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaDraft' } } as any);
  }, [lotteryDone, lotteryReplayPending, draftDone, pbaDraftDone, rookieContractsDone, noPendingTeamOptions, trainingCampDone, noQOCandidates, checklist?.draftLottery, checklist?.draft, checklist?.rookieContracts, checklist?.options, checklist?.trainingCamp, checklist?.qualifyingOffers, checklist?.pbaDraft, dispatchAction]);

  useEffect(() => {
    if (!checklist || state.leagueStats?.uiMode !== 'pba_isolated') return;
    const isUnresolved = (s: OffseasonRowStatus) => s === 'pending' || s === 'in-progress';
    if (!isUnresolved(checklist.pbaAllStarWeekend)) return;
    if (!(state.allStar as any)?.weekendComplete) return;
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaAllStarWeekend' } } as any);
  }, [
    checklist?.pbaAllStarWeekend,
    state.leagueStats?.uiMode,
    (state.allStar as any)?.weekendComplete,
    dispatchAction,
  ]);

  useEffect(() => {
    if (!checklist || state.leagueStats?.uiMode !== 'pba_isolated') return;
    const isUnresolved = (s: OffseasonRowStatus) => s === 'pending' || s === 'in-progress';
    if (!isUnresolved(checklist.pbaImportSearch)) return;
    const teamId = Number(state.userTeamId);
    if (!Number.isFinite(teamId)) return;
    const conference = getEffectivePbaConference(state.leagueStats as any);
    if (conference === 'philippine') return;
    const hasCurrentImport = (state.players ?? []).some((player: any) => {
      if (Number(player?.tid) !== teamId) return false;
      const meta = player?.pbaImportContract;
      if (meta?.status === 'active' && meta?.conference === conference) return true;
      if (player?.isImport && (!player?.importConference || player.importConference === conference)) return true;
      if (player?.contract?.type === 'PBA_IMPORT' && (!player?.importConference || player.importConference === conference)) return true;
      return false;
    });
    if (!hasCurrentImport) return;
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaImportSearch' } } as any);
  }, [
    checklist?.pbaImportSearch,
    state.leagueStats,
    state.userTeamId,
    state.players,
    dispatchAction,
  ]);

  useEffect(() => {
    if (!checklist) return;
    const schedule = (state as any).expansionSchedule;
    if (!schedule) return;
    if (isExpansionDraftDueForOffseason(state.leagueStats, schedule) && checklist.expansionDraft === 'skipped') {
      dispatchAction({
        type: 'SCHEDULE_EXPANSION',
        payload: {
          teams: schedule.teams,
          realignment: schedule.realignment ?? {},
          settings: state.expansionProtectionSettings ?? { ...DEFAULT_EXPANSION_PROTECTION_SETTINGS },
          scheduleYear: schedule.year,
          league: schedule.league,
        },
      } as any);
    }
  }, [(state as any).expansionSchedule, state.expansionProtectionSettings, state.leagueStats, checklist?.expansionDraft, dispatchAction]);

  return {
    tmWindowCounter,
    signingWindowCounter,
    transferWindowStatus,
    transferWindowNextOpenLabel,
    sidebarSignals,
    expiringGate,
    unresolvedExpiringCount,
    myFAsModalShown,
    myFAsModalOpened,
    draftDone,
  };
}
