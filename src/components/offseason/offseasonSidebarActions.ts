import type React from 'react';
import { ALL_SLOTS } from '../../types/tycoon';
import type { OffseasonChecklistRow } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { getDraftDate, getDraftLotteryDate, toISODateString } from '../../utils/dateUtils';
import { getHOFCeremonyDateString } from '../../services/playerDevelopment/hofChecker';
import { getUpcomingTrainingCampISO, getOffseasonCalendarYear, lsYearOf } from './aufgabenShared';
import type { OffseasonConfirmSpec } from './offseasonStepSpecs';

const ENDORSEMENT_SLOT_CAP = 4;

type Args = {
  state: any;
  dispatchAction: (action: any) => void;
  openStaffCount: number;
  sponsorCoverage: {
    emptySlotCount: number;
    endorsementCount: number;
  };
  dueSponsorCount: number;
  rfaCandidates: any[];
  isEuroMode: boolean;
  expiringGate: { forceOpen: () => void };
  myFAsModalShown: React.MutableRefObject<boolean>;
  myFAsModalOpened: React.MutableRefObject<boolean>;
  setExpansionProtectOpen: (open: boolean) => void;
  setOptionsModalOpen: (open: boolean) => void;
  setQoModalOpen: (open: boolean) => void;
  setYouthPromotionOpen: (open: boolean) => void;
  setBudgetReviewOpen: (open: boolean) => void;
  setFacilityReviewOpen: (open: boolean) => void;
  setPreseasonFriendliesOpen: (open: boolean) => void;
  setSponsorModalOpen: (open: boolean) => void;
  setRetiredReviewOpen: (open: boolean) => void;
  setHofCeremonyOpen: (open: boolean) => void;
  openStepConfirm: (spec: OffseasonConfirmSpec, action: () => void) => void;
  simToDateIfBefore: (targetISO: string) => void;
};

export function createHandleEnter({
  state,
  dispatchAction,
  openStaffCount,
  sponsorCoverage,
  dueSponsorCount,
  rfaCandidates,
  isEuroMode,
  expiringGate,
  myFAsModalShown,
  myFAsModalOpened,
  setExpansionProtectOpen,
  setOptionsModalOpen,
  setQoModalOpen,
  setYouthPromotionOpen,
  setBudgetReviewOpen,
  setFacilityReviewOpen,
  setPreseasonFriendliesOpen,
  setSponsorModalOpen,
  setRetiredReviewOpen,
  setHofCeremonyOpen,
  openStepConfirm,
  simToDateIfBefore,
}: Args) {
  const handleEnter = (row: OffseasonChecklistRow) => {
    if (row === 'expansionDraft' && state.gameMode === 'gm') {
      dispatchAction({ type: 'APPLY_EXPANSION_REALIGNMENT' } as any);
      setExpansionProtectOpen(true);
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
      if (openStaffCount === 0) {
        openStepConfirm(
          {
            eyebrow: 'Staff',
            title: 'Staff Signings',
            body: 'No staff roles are open or expiring this offseason. Fire a staff member to open a position, then return here.',
            confirmLabel: 'Continue',
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
      setBudgetReviewOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'facilityUpgrades') {
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      setFacilityReviewOpen(true);
      return;
    }
    if (row === 'preseasonFriendlies') {
      setPreseasonFriendliesOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'sponsorRenewals') {
      if (dueSponsorCount === 0 && sponsorCoverage.emptySlotCount === 0) {
        const endorsementSlotsLeft = Math.max(0, ENDORSEMENT_SLOT_CAP - sponsorCoverage.endorsementCount);
        openStepConfirm(
          {
            eyebrow: 'Club Office',
            title: 'Sponsor Check',
            body: endorsementSlotsLeft > 0
              ? `All ${ALL_SLOTS.length} sponsorship slots are active, but ${endorsementSlotsLeft}/${ENDORSEMENT_SLOT_CAP} endorsement slot${endorsementSlotsLeft === 1 ? '' : 's'} remain open. Review the open market before closing sponsor renewals.`
              : `All ${ALL_SLOTS.length} sponsorship slots and ${ENDORSEMENT_SLOT_CAP}/${ENDORSEMENT_SLOT_CAP} endorsements are active.`,
            confirmLabel: endorsementSlotsLeft > 0 ? 'Review Endorsements' : 'Complete Review',
          },
          () => {
            if (endorsementSlotsLeft > 0) {
              dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: 'sponsorRenewals' } } as any);
              return;
            }
            dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'sponsorRenewals' } } as any);
          },
        );
        return;
      }
      setSponsorModalOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'retiredPlayersReview') {
      setRetiredReviewOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'hofCeremony') {
      const targetISO = getHOFCeremonyDateString(getOffseasonCalendarYear(state));
      const todayNorm = state.date ? normalizeDate(state.date) : '';
      if (todayNorm && todayNorm < targetISO) {
        simToDateIfBefore(targetISO);
        return;
      }
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
      if ((state.faTagCounter ?? 0) === 0) {
        dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
      }
      return;
    }
    if (row === 'pbaImportDecision' || row === 'pbaMuseSelection' || row === 'pbaOpeningCeremony' || row === 'pbaAllStarWeekend' || row === 'pbaConferenceAwards') {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any);
      return;
    }
    const ls = state.leagueStats as any;
    const lsYear = lsYearOf(state);
    if (row === 'draftLottery') {
      simToDateIfBefore(toISODateString(getDraftLotteryDate(lsYear, ls)));
    } else if (row === 'draft') {
      simToDateIfBefore(toISODateString(getDraftDate(lsYear, ls)));
    } else if (row === 'trainingCamp') {
      simToDateIfBefore(getUpcomingTrainingCampISO(state));
      if (isEuroMode) {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'trainingCamp' } } as any);
        return;
      }
    }
    dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
  };

  return handleEnter;
}
