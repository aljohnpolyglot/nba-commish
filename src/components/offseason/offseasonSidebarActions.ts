import type React from 'react';
import { ALL_SLOTS } from '../../types/tycoon';
import type { OffseasonChecklistRow, Tab } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { addGameDays, getDraftDate, getDraftLotteryDate, getRolloverDate, toISODateString } from '../../utils/dateUtils';
import { getUpcomingTrainingCampISO, getOffseasonCalendarYear, getInternationalSummerReviewDateISO } from './aufgabenShared';
import type { OffseasonConfirmSpec } from './offseasonStepSpecs';
import { hasPreparedExpansionDraft } from '../../services/expansion/expansionDraftFlow';
import { isFranchiseExperienceAvailable } from '../../services/franchises/franchiseState';
import { getFranchiseDealsTaskAccess } from '../../services/franchises/franchiseTaskTiming';
import { getDraftSeasonYearForState } from '../../services/offseason/offseasonState';
import { buildPbaGovernorsBoardMeeting } from '../../services/pba/governorsBoard';
import type {
  StaffHiringRequirements,
  StaffHiresTaskPhase,
} from '../../services/offseason/staffHiringRequirements';

const ENDORSEMENT_SLOT_CAP = 4;

type Args = {
  state: any;
  dispatchAction: (action: any) => void;
  openStaffCount: number;
  staffHiringRequirements: StaffHiringRequirements | null;
  staffHiresTaskPhase: StaffHiresTaskPhase;
  sponsorCoverage: {
    emptySlotCount: number;
    endorsementCount: number;
  };
  dueSponsorCount: number;
  staffRetirementCount: number;
  rfaCandidates: any[];
  isEuroMode: boolean;
  scheduleDrawFixtureCount: number;
  expiringGate: { forceOpen: () => void };
  myFAsModalShown: React.MutableRefObject<boolean>;
  myFAsModalOpened: React.MutableRefObject<boolean>;
  setExpansionProtectOpen: (open: boolean) => void;
  setExpansionDraftViewOpen: (open: boolean) => void;
  setOptionsModalOpen: (open: boolean) => void;
  setQoModalOpen: (open: boolean) => void;
  setYouthPromotionOpen: (open: boolean) => void;
  setBudgetReviewOpen: (open: boolean) => void;
  setFacilityReviewOpen: (open: boolean) => void;
  setEuroScheduleDrawOpen: (open: boolean) => void;
  setPreseasonFriendliesOpen: (open: boolean) => void;
  setSponsorModalOpen: (open: boolean) => void;
  setRetiredReviewOpen: (open: boolean) => void;
  setStaffRetirementsOpen: (open: boolean) => void;
  setHofCeremonyOpen: (open: boolean) => void;
  setGovernorsBoardOpen: (open: boolean) => void;
  setSeasonStrategyOpen: (open: boolean) => void;
  openStepConfirm: (spec: OffseasonConfirmSpec, action: () => void) => void;
  simToDateIfBefore: (targetISO: string, onArrive?: () => void) => void;
  setCurrentView: (view: Tab) => void;
};

export function createHandleEnter({
  state,
  dispatchAction,
  openStaffCount,
  staffHiringRequirements,
  staffHiresTaskPhase,
  sponsorCoverage,
  dueSponsorCount,
  staffRetirementCount,
  rfaCandidates,
  isEuroMode,
  scheduleDrawFixtureCount,
  expiringGate,
  myFAsModalShown,
  myFAsModalOpened,
  setExpansionProtectOpen,
  setExpansionDraftViewOpen,
  setOptionsModalOpen,
  setQoModalOpen,
  setYouthPromotionOpen,
  setBudgetReviewOpen,
  setFacilityReviewOpen,
  setEuroScheduleDrawOpen,
  setPreseasonFriendliesOpen,
  setSponsorModalOpen,
  setRetiredReviewOpen,
  setStaffRetirementsOpen,
  setHofCeremonyOpen,
  setGovernorsBoardOpen,
  setSeasonStrategyOpen,
  openStepConfirm,
  simToDateIfBefore,
  setCurrentView,
}: Args) {
  const handleEnter = (row: OffseasonChecklistRow) => {
    const ls = state.leagueStats as any;
    const isPbaMode = ls?.uiMode === 'pba_isolated';
    const draftSeasonYear = getDraftSeasonYearForState(state);
    const offseasonCalendarYear = getOffseasonCalendarYear(state);
    const nbaRetirementReviewDate = !isEuroMode && !isPbaMode
      ? toISODateString(addGameDays(getRolloverDate(offseasonCalendarYear, ls, state.schedule), 1))
      : undefined;
    if (row === 'strategyReview') {
      const todayNorm = state.date ? normalizeDate(state.date) : '';
      const trainingCampDate = getUpcomingTrainingCampISO(state);
      if (todayNorm && todayNorm < trainingCampDate) {
        simToDateIfBefore(trainingCampDate);
        return;
      }
      setSeasonStrategyOpen(true);
      return;
    }
    if (row === 'expansionDraft' && state.gameMode === 'gm') {
      dispatchAction({ type: 'APPLY_EXPANSION_REALIGNMENT' } as any);
      if (hasPreparedExpansionDraft(state)) {
        setExpansionDraftViewOpen(true);
      } else {
        setExpansionProtectOpen(true);
      }
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'options') {
      setOptionsModalOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'myFAs') {
      myFAsModalShown.current = true;
      myFAsModalOpened.current = false;
      expiringGate.forceOpen();
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'qualifyingOffers') {
      if (rfaCandidates.length === 0) {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any);
        return;
      }
      setQoModalOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'coachingSignings') {
      dispatchAction({ type: 'OFFSEASON_SKIP_PHASE', payload: { row: 'coachingSignings' } } as any);
      handleEnter('staffSignings');
      return;
    }
    if (row === 'staffSignings') {
      const targetISO = nbaRetirementReviewDate ?? getInternationalSummerReviewDateISO(state, row);
      const todayNorm = state.date ? normalizeDate(state.date) : '';
      if (targetISO && todayNorm && todayNorm < targetISO) {
        simToDateIfBefore(targetISO);
        return;
      }
      if (staffHiresTaskPhase === 'NO_ACTION_REVIEW_READY') {
        const optionalCopy = staffHiringRequirements?.optionalVacancies.length
          ? `\n\nOptional vacancies: ${staffHiringRequirements.optionalVacancies.length}`
          : '';
        openStepConfirm(
          {
            eyebrow: 'Staff Hires',
            title: 'No Staff Hires Required',
            body: `No staff contracts are expiring and no required staff roles are vacant for the upcoming season.\n\nExpiring staff: ${staffHiringRequirements?.expiringStaffIds.length ?? 0}\nRequired vacancies: ${staffHiringRequirements?.requiredVacancies.length ?? 0}\nUnresolved staff decisions: ${staffHiringRequirements?.unresolvedDecisionIds.length ?? 0}${optionalCopy}\n\nReview this result, then mark the Staff Hires task done to continue.`,
            confirmLabel: 'Mark Done',
          },
          () => {
            dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'staffSignings' } } as any);
          },
        );
        return;
      }
      if (staffHiresTaskPhase === 'REVIEW_READY') {
        openStepConfirm(
          {
            eyebrow: 'Staff Hires',
            title: 'Staff Hiring Review Complete',
            body: `All required staff roles are filled.\n\nRequired roles filled: ${staffHiringRequirements?.filledRequiredRoleKeys.length ?? 0}/${staffHiringRequirements?.filledRequiredRoleKeys.length ?? 0}\nUnresolved actions: ${staffHiringRequirements?.unresolvedDecisionIds.length ?? 0}\n\nReview the completed staff work, then mark this task done to continue.`,
            confirmLabel: 'Mark Done',
          },
          () => {
            dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'staffSignings' } } as any);
          },
        );
        return;
      }
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'youthPromotion') {
      setYouthPromotionOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'budgetLock') {
      if (isEuroMode && state.offseasonChecklist?.endesaBroadcastMeeting !== 'done'
        && state.offseasonChecklist?.endesaBroadcastMeeting !== 'skipped') return;
      if (isEuroMode && state.offseasonChecklist?.governorsBoardMeeting !== 'done'
        && state.offseasonChecklist?.governorsBoardMeeting !== 'skipped') return;
      setBudgetReviewOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'facilityUpgrades') {
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      setFacilityReviewOpen(true);
      return;
    }
    if (row === 'euroScheduleDraw') {
      if (scheduleDrawFixtureCount === 0) return;
      setEuroScheduleDrawOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'preseasonFriendlies') {
      setPreseasonFriendliesOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'sponsorRenewals') {
      if (isFranchiseExperienceAvailable(state)) {
        if (!getFranchiseDealsTaskAccess(state).available) return;
        dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
        setCurrentView('Franchises');
        return;
      }
      if (dueSponsorCount === 0 && sponsorCoverage.emptySlotCount === 0) {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'sponsorRenewals' } } as any);
        return;
      }
      setSponsorModalOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'retiredPlayersReview') {
      const targetISO = nbaRetirementReviewDate ?? getInternationalSummerReviewDateISO(state, row);
      const todayNorm = state.date ? normalizeDate(state.date) : '';
      if (targetISO && todayNorm && todayNorm < targetISO) {
        simToDateIfBefore(targetISO, () => {
          setRetiredReviewOpen(true);
          dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
        });
        return;
      }
      setRetiredReviewOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'memorialDecisions') {
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      setCurrentView('Inbox');
      return;
    }
    if (row === 'governorsBoardMeeting') {
      if (isPbaMode && !state.pendingGovernorsBoardMeeting) {
        dispatchAction({
          type: 'UPDATE_STATE',
          payload: { pendingGovernorsBoardMeeting: buildPbaGovernorsBoardMeeting(state) },
        } as any);
      }
      setGovernorsBoardOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'staffRetirements') {
      const targetISO = nbaRetirementReviewDate ?? getInternationalSummerReviewDateISO(state, row);
      const todayNorm = state.date ? normalizeDate(state.date) : '';
      if (targetISO && todayNorm && todayNorm < targetISO) {
        simToDateIfBefore(targetISO, () => {
          setStaffRetirementsOpen(true);
          dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
        });
        return;
      }
      setStaffRetirementsOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'hofCeremony') {
      setHofCeremonyOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'freeAgency') {
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingTeamOfficeNav: { tab: 'intel', intelTab: 'fa' } },
      } as any);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'pbaLocalFreeAgency') {
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingTeamOfficeNav: { tab: 'intel', intelTab: 'fa' } },
      } as any);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'pbaImportSearch') {
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'pbaImportDecision') {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'draftLottery') {
      if (!isPbaMode) {
        const targetISO = toISODateString(getDraftLotteryDate(draftSeasonYear, ls));
        const todayNorm = state.date ? normalizeDate(state.date) : '';
        if (todayNorm && todayNorm < targetISO) {
          simToDateIfBefore(targetISO, () => {
            dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
          });
          return;
        }
      }
    } else if (row === 'draft' || (row === 'pbaDraft' && !isPbaMode)) {
      const targetISO = toISODateString(getDraftDate(draftSeasonYear, ls));
      const todayNorm = state.date ? normalizeDate(state.date) : '';
      if (todayNorm && todayNorm < targetISO) {
        simToDateIfBefore(targetISO, () => {
          dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
        });
        return;
      }
    } else if (row === 'trainingCamp') {
      if (isPbaMode) {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'trainingCamp' } } as any);
        return;
      }
      simToDateIfBefore(getUpcomingTrainingCampISO(state));
    }
    dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
  };

  return handleEnter;
}


