import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../../store/GameContext';
import { normalizeDate } from '../../utils/helpers';
import {
  getEuroOffseasonTaskDates,
  getEuroScheduleDrawTransition,
  getOffseasonBlockingRow,
  getOffseasonRowDescription,
  getVisibleOffseasonRows,
  firstUnfinishedRow,
  shouldOpenRookieContractsDisclaimer,
  withGovernorsBoardMeetingTask,
} from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow, OffseasonRowStatus, NBAPlayer } from '../../types';
import { ALL_SLOTS } from '../../types/tycoon';
import { getOffseasonState } from '../../services/offseason/offseasonState';
import { isSponsorDueForRenewal } from '../../services/tycoon/sponsorshipEngine';
import { ExpansionSchedulePin } from './OffseasonSidebarBits';
import { OffseasonChecklistRowItem } from './OffseasonSidebarView';
import { getOffseasonStepConfirmSpec, type OffseasonConfirmSpec } from './offseasonStepSpecs';
import { getRowAutoReason } from './offseasonSidebarSummaries';
import { useOffseasonSidebarSync } from './useOffseasonSidebarSync';
import { OffseasonSidebarShell } from './OffseasonSidebarShell';
import { OffseasonSidebarOverlays } from './OffseasonSidebarOverlays';
import { createHandleEnter } from './offseasonSidebarActions';
import { useOffseasonSidebarDecisions } from './useOffseasonSidebarDecisions';
import { shouldShowOffseasonMarkDone, shouldShowOffseasonSkip } from './offseasonTaskActions';
import {
  getPendingTeamOptions,
  getEuroScheduleDrawRows,
  getPreseasonFriendlyRows,
  getRfaCandidates,
  getUserTeamRookies,
  getYouthPromotionPlayers,
  getYouthSeniorRosterSize,
  hasTransferMarketEngagement,
} from './offseasonSidebarData';
import {
  getOffseasonCalendarYear,
  getRetirementClassYear,
  getSponsorCoverage,
  lsYearOf,
} from './aufgabenShared';
import {
  getEffectivePbaConference,
  PBA_GOVERNORS_IMPORT_HEIGHT_LABEL,
  type PbaConference,
} from '../../services/pba/importManager';
import { EndesaNbaDraftReviewModal } from './views/EndesaNbaDraftReviewModal';
import { EndesaBroadcastMeetingModal } from './views/EndesaBroadcastMeetingModal';
import { buildBudgetContext, computeAnnualBudget } from '../../services/tycoon/budgetEngine';
import { scheduleSeasonOperatingCommitments } from '../../services/tycoon/clubFinance';
import { getSponsorPaymentAdvanceEUR } from '../../services/tycoon/sponsorPerkEngine';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { ensureFranchiseOperations, getFranchiseTaskItems } from '../../services/franchises/franchiseState';
import { getFranchiseDealsTaskAccess } from '../../services/franchises/franchiseTaskTiming';
import { isStaffRetirementRecordInMode } from '../../services/staff/staffRetirement';
import { SeasonStrategyTaskOverlay } from './SeasonStrategyTaskOverlay';
import type { PbaMuseCandidate } from '../../services/pba/musePool';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import { getEuroOffseasonMarketDates } from '../../services/offseason/euroOffseasonMarkets';
import { resolveLeagueSeasonLifecycle } from '../../services/lifecycle/leagueSeasonLifecycle';
import {
  getStaffHiresCompletionSummary,
  getStaffHiresTaskPhase,
  projectStaffHiringRequirements,
} from '../../services/offseason/staffHiringRequirements';
export { OffseasonPhaseBadge, OffseasonNextActionButton } from './OffseasonHeader';
export { OffseasonTransferMarketFooter, OffseasonTrainingCampFooter } from './OffseasonFooters'; export { OffseasonAufgabenMobileSheet } from './OffseasonMobileSheet';
const ENDORSEMENT_SLOT_CAP = 4;
const EURO_LATER_ROWS = new Set<OffseasonChecklistRow>(['youthPromotion']);

const pbaBriefingStorageKey = (saveId: string | undefined) => `pba-conference-briefings-${saveId ?? 'default'}`;

type PbaBriefingState = {
  seen: Partial<Record<PbaConference, true>>;
  dismissedForever?: true;
};

const readPbaBriefingState = (saveId: string | undefined): PbaBriefingState => {
  try {
    const raw = window.localStorage.getItem(pbaBriefingStorageKey(saveId));
    if (!raw) return { seen: {} };
    const parsed = JSON.parse(raw) as PbaBriefingState;
    return {
      seen: parsed?.seen ?? {},
      dismissedForever: parsed?.dismissedForever ? true : undefined,
    };
  } catch {
    return { seen: {} };
  }
};

const writePbaBriefingState = (saveId: string | undefined, value: PbaBriefingState) => {
  try {
    window.localStorage.setItem(pbaBriefingStorageKey(saveId), JSON.stringify(value));
  } catch {}
};

const getPbaBriefingSpec = (conference: PbaConference) => {
  if (conference === 'commissioners') {
    return {
      eyebrow: 'Conference Briefing',
      title: "Welcome to the Commissioner's Cup",
      body: "This conference opens the import market.\n\nYou can carry one unrestricted import, so your first stop is Import Search before opening night. Use this window to decide whether your roster needs a headline scorer, a rim protector, or a short-term fixer.",
    };
  }
  if (conference === 'governors') {
    return {
      eyebrow: 'Conference Briefing',
      title: "Welcome to the Governors' Cup",
      body: `This conference also allows one import, but the pool is capped at ${PBA_GOVERNORS_IMPORT_HEIGHT_LABEL} and below.\n\nYour first move is Import Search. Make sure the player fits the height limit before you commit, because this conference is built around smaller, faster import profiles.`,
    };
  }
  return {
    eyebrow: 'Conference Briefing',
    title: 'Welcome to the Philippine Cup',
    body: 'This is the all-Filipino conference.\n\nNo imports are allowed here. Start by handling local free agency, tighten the domestic roster, and get your core set before the conference opens.',
  };
};

export const OffseasonAufgabenSidebar: React.FC = () => {
  const { state, dispatchAction, setCurrentView, navigateToPlayer } = useGame();
  const lifecycle = React.useMemo(() => resolveLeagueSeasonLifecycle(state), [state.seasonLifecycle, state.draftLotteryResult, state.activeDraftPicks, state.activeDraftPassedPicks, state.history, state.players, state.leagueStats]);
  const checklist = React.useMemo(
    () => withGovernorsBoardMeetingTask(state.offseasonChecklist, state.pendingGovernorsBoardMeeting, state.leagueStats?.year),
    [state.offseasonChecklist, state.pendingGovernorsBoardMeeting, state.leagueStats?.year],
  );
  const userTeam = React.useMemo(
    () => state.teams.find((t: any) => (t.id ?? t.tid) === state.userTeamId)
      ?? (state.nonNBATeams ?? []).find((t: any) => (t.id ?? t.tid) === state.userTeamId),
    [state.teams, state.nonNBATeams, state.userTeamId],
  );
  const visibleRows = React.useMemo(
    () => getVisibleOffseasonRows(state.leagueStats, userTeam as any, state.date, (state as any).expansionSchedule, checklist, { lotteryResolved: lifecycle.draft.lottery === 'complete', draftComplete: lifecycle.draft.draft === 'complete' }),
    [state.leagueStats, userTeam, state.date, (state as any).expansionSchedule, checklist, lifecycle],
  );
  const isEuroMode = state.leagueStats?.uiMode === 'euro_isolated';
  const franchiseDealsAccess = getFranchiseDealsTaskAccess(
    state,
    checklist?.sponsorRenewals ?? 'pending',
  );
  const isPbaMode = state.leagueStats?.uiMode === 'pba_isolated';
  const isDraftOrderReview = isPbaMode || !isDraftLotteryEnabled(state.leagueStats?.draftType);
  const sponsorCoverage = getSponsorCoverage(userTeam as any, lsYearOf(state));
  const franchiseTaskItems = React.useMemo(() => {
    if (isEuroMode || !userTeam || !('id' in userTeam)) return [] as string[];
    return getFranchiseTaskItems(
      ensureFranchiseOperations(state, userTeam),
      state.leagueStats,
    );
  }, [isEuroMode, state, userTeam]);
  const dueSponsorCount = isEuroMode ? sponsorCoverage.dueCount : franchiseTaskItems.length;
  const dueSponsorSlotLabels = React.useMemo(() => {
    const s = (userTeam as any)?.tycoon?.sponsorships;
    if (!s) return [] as string[];
    return ALL_SLOTS
      .filter(k => !s[k] || isSponsorDueForRenewal(s[k], lsYearOf(state)))
      .map(slot => slot.charAt(0).toUpperCase() + slot.slice(1));
  }, [userTeam, state.leagueStats?.year, state.teams, state.nonNBATeams]);
  const staffHiringRequirements = React.useMemo(
    () => projectStaffHiringRequirements(state),
    [state],
  );
  const openStaffCount = staffHiringRequirements?.requiredVacancies.length ?? 0;
  const staffHiresTaskPhase = getStaffHiresTaskPhase(state, staffHiringRequirements);
  const staffHiresCompletionSummary = getStaffHiresCompletionSummary(state);
  const staffRetirementRows = React.useMemo(() => {
    const classYear = getRetirementClassYear(state);
    const visibleClassYears = new Set([classYear, classYear - 1]);
    return (state.staffRetirementAnnouncements ?? []).filter((record: any) => {
      const retiredYear = Number(String(record.retiredDate ?? '').slice(0, 4));
      return (visibleClassYears.has(Number(record.season)) || visibleClassYears.has(retiredYear))
        && isStaffRetirementRecordInMode(record, state.leagueStats?.uiMode);
    });
  }, [state.staffRetirementAnnouncements, state.date, state.leagueStats?.year, state.leagueStats?.uiMode]);
  const staffRetirementCount = staffRetirementRows.length;
  const staffRetirementIds = React.useMemo(
    () => staffRetirementRows.map(record => record.id),
    [staffRetirementRows],
  );
  const euroCalendarYear = getOffseasonCalendarYear(state);
  const { scheduleDraw: euroScheduleDrawDate } = getEuroOffseasonTaskDates(euroCalendarYear);
  const euroScheduleDrawLabel = React.useMemo(
    () => new Date(`${euroScheduleDrawDate}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    [euroScheduleDrawDate],
  );
  const currentDateISO = normalizeDate(state.date);
  const euroScheduleDateBlocked = isEuroMode && currentDateISO < euroScheduleDrawDate;
  const EURO_PARALLEL_ROWS = new Set<OffseasonChecklistRow>(['sponsorRenewals', 'staffRetirements', 'staffSignings', 'myFAs', 'endesaNbaDraft']);
  const confirmActionRef = useRef<(() => void) | null>(null);
  const secondaryConfirmActionRef = useRef<(() => void) | null>(null);
  const [expansionProtectOpen, setExpansionProtectOpen] = useState(false);
  const [expansionDraftViewOpen, setExpansionDraftViewOpen] = useState(false);
  const {
    tmWindowCounter,
    signingWindowCounter,
    transferWindowStatus,
    transferWindowNextOpenLabel,
    sidebarSignals,
    expiringGate,
    myFAsModalShown,
    myFAsModalOpened,
    draftDone,
  } = useOffseasonSidebarSync({
    state,
    dispatchAction,
    checklist,
    visibleRows,
    sponsorCoverage,
    openStaffCount,
    staffTeamReady: !!userTeam,
    staffRetirementCount,
    staffRetirementIds,
    isEuroMode,
  });
  if (!checklist || visibleRows.length === 0) return null;
  const currentRow = firstUnfinishedRow(checklist, sidebarSignals, visibleRows);
  const orderedRows = React.useMemo(() => {
    if (!isEuroMode) return [...visibleRows];
    const unresolved = (status: OffseasonRowStatus | undefined) => status === 'pending' || status === 'in-progress' || status == null;
    const unresolvedRows = visibleRows.filter(row => unresolved(checklist[row]));
    const resolvedRows = visibleRows.filter(row => !unresolved(checklist[row]));
    return [...unresolvedRows, ...resolvedRows];
  }, [isEuroMode, visibleRows, checklist]);
  const displayCurrentRow = React.useMemo(() => {
    if (!isEuroMode) return currentRow;
    const unresolved = (row: OffseasonChecklistRow) => {
      const status = checklist[row] ?? 'pending';
      return status === 'pending' || status === 'in-progress';
    };
    const actionableNow = orderedRows.find(row =>
      unresolved(row)
      && !getOffseasonBlockingRow(row, checklist, visibleRows)
      && !(row === 'euroScheduleDraw' && euroScheduleDateBlocked)
      && !(row === 'transferMarket' && !transferWindowStatus?.open)
      && !EURO_LATER_ROWS.has(row),
    );
    if (actionableNow) return actionableNow;
    return currentRow;
  }, [isEuroMode, currentRow, orderedRows, checklist, visibleRows, transferWindowStatus?.open, euroScheduleDateBlocked]);
  const transferMarketCanComplete = React.useMemo(() => {
    if (!isEuroMode || !checklist) return true;
    return getOffseasonBlockingRow('transferMarket', checklist, visibleRows) === null;
  }, [isEuroMode, checklist, visibleRows]);
  const [sponsorModalOpen, setSponsorModalOpen] = useState(false);
  const [retiredReviewOpen, setRetiredReviewOpen] = useState(false);
  const [staffRetirementsOpen, setStaffRetirementsOpen] = useState(false);
  const [hofCeremonyOpen, setHofCeremonyOpen] = useState(false);
  const [governorsBoardOpen, setGovernorsBoardOpen] = useState(false);
  const [seasonStrategyOpen, setSeasonStrategyOpen] = useState(false);
  const [youthPromotionOpen, setYouthPromotionOpen] = useState(false);
  const [euroScheduleDrawOpen, setEuroScheduleDrawOpen] = useState(false);
  const [preseasonFriendliesOpen, setPreseasonFriendliesOpen] = useState(false);
  const [budgetReviewOpen, setBudgetReviewOpen] = useState(false);
  const [endesaNbaDraftOpen, setEndesaNbaDraftOpen] = useState(false);
  const [endesaBroadcastMeetingOpen, setEndesaBroadcastMeetingOpen] = useState(false);
  const [pbaImportDecisionOpen, setPbaImportDecisionOpen] = useState(false);
  const [pbaMuseSelectionOpen, setPbaMuseSelectionOpen] = useState(false);
  const [pbaOpeningCeremonyOpen, setPbaOpeningCeremonyOpen] = useState(false);
  const previousPbaImportDecisionStatus = useRef(state.offseasonChecklist?.pbaImportDecision);
  const previousPbaMuseSelectionStatus = useRef(state.offseasonChecklist?.pbaMuseSelection);
  const previousPbaOpeningCeremonyStatus = useRef<OffseasonRowStatus | undefined>(undefined);
  useEffect(() => {
    const status = state.offseasonChecklist?.pbaImportDecision;
    if (status === 'in-progress' && previousPbaImportDecisionStatus.current !== 'in-progress') {
      setPbaImportDecisionOpen(true);
    }
    previousPbaImportDecisionStatus.current = status;
  }, [state.offseasonChecklist?.pbaImportDecision]);
  useEffect(() => {
    const status = state.offseasonChecklist?.pbaMuseSelection;
    if (status === 'in-progress' && previousPbaMuseSelectionStatus.current !== 'in-progress') {
      setPbaMuseSelectionOpen(true);
    }
    previousPbaMuseSelectionStatus.current = status;
  }, [state.offseasonChecklist?.pbaMuseSelection]);
  useEffect(() => {
    const status = state.offseasonChecklist?.pbaOpeningCeremony;
    if (status === 'in-progress' && previousPbaOpeningCeremonyStatus.current !== 'in-progress') {
      setPbaOpeningCeremonyOpen(true);
    }
    previousPbaOpeningCeremonyStatus.current = status;
  }, [state.offseasonChecklist?.pbaOpeningCeremony]);
  const [facilityReviewOpen, setFacilityReviewOpen] = useState(false);
  const [autoResolveConfirmOpen, setAutoResolveConfirmOpen] = useState(false);
  const [stepConfirm, setStepConfirm] = useState<OffseasonConfirmSpec | null>(null);
  const [briefingSpec, setBriefingSpec] = useState<{ eyebrow: string; title: string; body: string } | null>(null);
  const [rookieDisclaimerOpen, setRookieDisclaimerOpen] = useState(false);
  const rookieDisclaimerKey = `rookie-disclaimer-${state.saveId ?? 'default'}-${state.leagueStats?.year ?? 0}`;
  const euroScheduleGames = React.useMemo(() => getEuroScheduleDrawRows(state), [state]);
  const preseasonGames = React.useMemo(() => getPreseasonFriendlyRows(state), [state]);
  useEffect(() => {
    if (!state.pendingSeasonStrategyModal) return;
    setSeasonStrategyOpen(true);
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: { pendingSeasonStrategyModal: undefined },
    } as any);
  }, [state.pendingSeasonStrategyModal, dispatchAction]);
  useEffect(() => {
    if (!isEuroMode || state.isProcessing) return;
    const scheduleDrawTransition = getEuroScheduleDrawTransition(checklist, currentDateISO, euroCalendarYear);
    if (scheduleDrawTransition.action === 'simulate') {
      dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: scheduleDrawTransition.targetDate } } as any);
      return;
    }
    if (scheduleDrawTransition.action === 'open') {
      if (euroScheduleGames.length === 0) return;
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: 'euroScheduleDraw' } } as any);
      setEuroScheduleDrawOpen(true);
      return;
    }
    if (checklist.euroScheduleDraw === 'done' && checklist.facilityUpgrades === 'pending') {
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: 'facilityUpgrades' } } as any);
      setFacilityReviewOpen(true);
      return;
    }
    if (checklist.transferMarket === 'done'
      && checklist.budgetLock === 'pending'
      && !getOffseasonBlockingRow('budgetLock', checklist, visibleRows)) {
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: 'budgetLock' } } as any);
      setBudgetReviewOpen(true);
      return;
    }
    if (checklist.transferMarket !== 'pending'
      || getOffseasonBlockingRow('transferMarket', checklist, visibleRows)) return;
    if (!transferWindowStatus?.open) {
      const nextOpen = transferWindowStatus?.nextOpen
        ? normalizeDate(transferWindowStatus.nextOpen.toISOString())
        : null;
      if (nextOpen && nextOpen > currentDateISO) {
        dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: nextOpen } } as any);
      }
      return;
    }
    dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: 'transferMarket' } } as any);
  }, [
    isEuroMode,
    state.isProcessing,
    checklist,
    visibleRows,
    transferWindowStatus?.open,
    transferWindowStatus?.nextOpen,
    currentDateISO,
    euroCalendarYear,
    euroScheduleDateBlocked,
    euroScheduleDrawDate,
    euroScheduleGames.length,
    dispatchAction,
  ]);
  useEffect(() => {
    if (!isEuroMode) return;
    if (checklist.euroScheduleDraw === 'in-progress' && euroScheduleGames.length > 0) setEuroScheduleDrawOpen(true);
    if (checklist.preseasonFriendlies === 'in-progress') setPreseasonFriendliesOpen(true);
  }, [isEuroMode, checklist.euroScheduleDraw, checklist.preseasonFriendlies, euroScheduleGames.length]);
  useEffect(() => {
    if (checklist.endesaNbaDraft === 'in-progress') setEndesaNbaDraftOpen(true);
    if (checklist.endesaBroadcastMeeting === 'in-progress') setEndesaBroadcastMeetingOpen(true);
  }, [checklist.endesaBroadcastMeeting, checklist.endesaNbaDraft]);
  const rfaCandidates = React.useMemo<NBAPlayer[]>(() => getRfaCandidates(state), [state]);
  const pendingTeamOptions = React.useMemo<NBAPlayer[]>(() => getPendingTeamOptions(state), [state]);
  const youthPlayers = React.useMemo(() => getYouthPromotionPlayers(state), [state]);
  const youthSeniorRosterSize = React.useMemo(() => getYouthSeniorRosterSize(state), [state]);
  const userTeamRookies = React.useMemo<NBAPlayer[]>(() => getUserTeamRookies(state), [state]);
  const simToDateIfBefore = (targetISO: string, onArrive?: () => void) => {
    if (!state.date) return;
    const todayNorm = normalizeDate(state.date);
    if (todayNorm >= targetISO) {
      onArrive?.();
      return;
    }
    const pending = dispatchAction({
      type: 'SIMULATE_TO_DATE',
      payload: { targetDate: targetISO, stopBefore: true },
    } as any);
    void Promise.resolve(pending).then(() => onArrive?.());
  };
  const openStepConfirm = (
    spec: OffseasonConfirmSpec,
    action: () => void,
    secondaryAction?: () => void,
  ) => {
    confirmActionRef.current = action;
    secondaryConfirmActionRef.current = secondaryAction ?? null;
    setStepConfirm(spec);
  };
  const closeStepConfirm = () => {
    confirmActionRef.current = null;
    secondaryConfirmActionRef.current = null;
    setStepConfirm(null);
  };
  const handleMarkTransferMarketDone = () => {
    if (!transferMarketCanComplete) return;
    const engaged = hasTransferMarketEngagement(state);
    openStepConfirm({
      eyebrow: 'Transfer Market',
      title: 'Finish Transfer Market',
      body: engaged
        ? 'This closes out your transfer-market review and opens the signing period next.'
        : 'No listings, bids, completed deals, or release-clause moves were found for your club. Finish the transfer market anyway?',
      confirmLabel: 'Mark Done',
    }, () => {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'transferMarket' } } as any);
    });
  };
  const prepareFreeAgencySimulation = async () => {
    await dispatchAction({
      type: 'UPDATE_STATE',
      payload: { isProcessing: true, simCurrentDate: normalizeDate(state.date) },
    } as any);
    await new Promise(resolve => window.setTimeout(resolve, 350));
  };
  const handleFreeAgencyOneDay = async (pba = false) => {
    await prepareFreeAgencySimulation();
    await dispatchAction({ type: pba ? 'OFFSEASON_ADVANCE_PBA_LOCAL_FA_DAY' : 'OFFSEASON_ADVANCE_FA_TAG' } as any);
  };
  const handleFreeAgencyEndWindow = async () => {
    await prepareFreeAgencySimulation();
    await dispatchAction({ type: 'OFFSEASON_SKIP_FREE_AGENCY' } as any);
  };
  const handleTransferMarketOneDay = async () => {
    await dispatchAction({ type: 'OFFSEASON_ADVANCE_TRANSFER_MARKET_DAY' } as any);
  };
  const handleTransferMarketEndWindow = async () => {
    const calendarYear = new Date(`${normalizeDate(state.date)}T00:00:00Z`).getUTCFullYear();
    const targetDate = getEuroOffseasonMarketDates(calendarYear, 'transfer').nextIso;
    await dispatchAction({
      type: 'OFFSEASON_END_TRANSFER_MARKET',
      payload: { targetDate },
    } as any);
  };
  const {
    optionsModalOpen,
    setOptionsModalOpen,
    exercisedIds,
    declinedIds,
    qoModalOpen,
    setQoModalOpen,
    qoSubmittedIds,
    qoSkippedIds,
    handleOptionsAssistant,
    handleOptionsExerciseOne,
    handleOptionsDeclineOne,
    handleOptionsDismiss,
    handleOptionsManual,
    handleQoSubmitOne,
    handleQoSkipOne,
    handleQoAssistantAll,
    handleQoDismiss,
  } = useOffseasonSidebarDecisions({
    dispatchAction,
    pendingTeamOptions,
    rfaCandidates,
  });
  const handleEnter = createHandleEnter({
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
    scheduleDrawFixtureCount: euroScheduleGames.length,
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
  });
  const pendingBriefingActionRef = useRef<(() => void) | null>(null);
  const pbaEffectiveConference = getEffectivePbaConference(state.leagueStats as any);
  const shouldShowPbaBriefing = (row: OffseasonChecklistRow) => {
    if (state.leagueStats?.uiMode !== 'pba_isolated') return false;
    const triggerRow = pbaEffectiveConference === 'philippine' ? 'pbaDraft' : 'pbaImportSearch';
    if (row !== triggerRow) return false;
    const briefingState = readPbaBriefingState(state.saveId);
    if (briefingState.dismissedForever) return false;
    return !briefingState.seen[pbaEffectiveConference];
  };
  const openPbaBriefing = (row: OffseasonChecklistRow) => {
    pendingBriefingActionRef.current = () => handleEnter(row);
    setBriefingSpec(getPbaBriefingSpec(pbaEffectiveConference));
  };
  const closePbaBriefing = () => {
    const next = pendingBriefingActionRef.current;
    pendingBriefingActionRef.current = null;
    setBriefingSpec(null);
    return next;
  };
  const markPbaBriefingSeen = (dismissedForever?: boolean) => {
    const current = readPbaBriefingState(state.saveId);
    writePbaBriefingState(state.saveId, {
      seen: { ...current.seen, [pbaEffectiveConference]: true },
      dismissedForever: dismissedForever ? true : current.dismissedForever,
    });
  };
  useEffect(() => {
    if (!shouldOpenRookieContractsDisclaimer(
      state.gameMode,
      state.leagueStats?.uiMode,
      draftDone,
      state.offseasonChecklist,
    )) return;
    try {
      if (window.localStorage.getItem(rookieDisclaimerKey)) return;
    } catch {}
    setRookieDisclaimerOpen(true);
  }, [draftDone, state.gameMode, state.leagueStats?.uiMode, state.offseasonChecklist, rookieDisclaimerKey]);
  const dismissRookieDisclaimer = () => {
    try {
      window.localStorage.setItem(rookieDisclaimerKey, '1');
    } catch {}
    setRookieDisclaimerOpen(false);
  };
  const handleAutoResolveAll = () => {
    setAutoResolveConfirmOpen(true);
  };
  const openPbaImportDecisionReview = async () => {
    await dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: 'pbaImportDecision' } } as any);
    setPbaImportDecisionOpen(true);
  };
  const openPbaMuseSelection = async () => {
    await dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: 'pbaMuseSelection' } } as any);
    setPbaMuseSelectionOpen(true);
  };
  const openPbaOpeningCeremony = async () => {
    await dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: 'pbaOpeningCeremony' } } as any);
    setPbaOpeningCeremonyOpen(true);
  };
  const completePbaOpeningCeremony = async () => {
    setPbaOpeningCeremonyOpen(false);
    await dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaOpeningCeremony' } } as any);
  };
  const handleSkipTask = (row: OffseasonChecklistRow) => {
    if (row === 'draft') {
      openStepConfirm({
        eyebrow: 'Assistant GM',
        title: 'Sim the Complete Draft?',
        body: 'Your Assistant GM will make every selection and complete the draft. This cannot be undone.',
        confirmLabel: 'Sim Draft to End',
      }, () => dispatchAction({ type: 'OFFSEASON_SKIP_PHASE', payload: { row, assistantGM: true } } as any));
      return;
    }
    if (row === 'internationalTournament') {
      openStepConfirm({
        eyebrow: 'International Basketball',
        title: 'Delegate Remaining Tournament',
        body: 'The remaining tournament games will be simulated, the bracket and awards will be saved, and the completed edition will remain available from International.',
        confirmLabel: 'Simulate Tournament',
      }, () => dispatchAction({ type: 'OFFSEASON_SKIP_PHASE', payload: { row } } as any));
      return;
    }
    if (row === 'options') {
      openStepConfirm({
        eyebrow: 'Assistant GM',
        title: 'Delegate Option Decisions',
        body: 'Your Assistant GM will exercise the remaining team options and close this review.',
        confirmLabel: 'Let Assistant GM Handle It',
      }, () => { void handleOptionsAssistant(); });
      return;
    }
    if (row === 'qualifyingOffers') {
      openStepConfirm({
        eyebrow: 'Assistant GM',
        title: 'Delegate Qualifying Offers',
        body: 'Your Assistant GM will submit or pass on every remaining qualifying offer and close this review.',
        confirmLabel: 'Let Assistant GM Handle It',
      }, () => { void handleQoAssistantAll(); });
      return;
    }
    if (row === 'myFAs') {
      openStepConfirm({
        eyebrow: 'Assistant GM',
        title: 'Delegate Expiring Players',
        body: 'Your Assistant GM will handle the remaining expiring-player decisions using the existing contract rules.',
        confirmLabel: 'Let Assistant GM Handle It',
      }, () => { void expiringGate.resolveWithAssistant(); });
      return;
    }
    if (row === 'staffSignings') {
      openStepConfirm({
        eyebrow: 'Assistant GM',
        title: openStaffCount > 0 ? 'Delegate Staff Hires' : 'Skip Staff Hires Review?',
        body: openStaffCount > 0
          ? `Your Assistant GM will fill all ${openStaffCount} open or expiring staff role${openStaffCount === 1 ? '' : 's'} before camp. The hires and contracts will be saved to your club.`
          : 'No required staff hire remains. This will close the review for this offseason.',
        confirmLabel: openStaffCount > 0 ? 'Let Assistant GM Handle It' : 'Skip Staff Hires Review',
      }, () => dispatchAction({
        type: openStaffCount > 0 ? 'OFFSEASON_SKIP_PHASE' : 'OFFSEASON_COMPLETE_PHASE',
        payload: openStaffCount > 0 ? { row, assistantGM: true } : { row },
      } as any));
      return;
    }
    const labels: Partial<Record<OffseasonChecklistRow, string>> = {
      seasonSummary: 'Season Review',
      draftOrderReview: 'Draft Order Review',
      retiredPlayersReview: 'Retired Players Review',
      staffRetirements: 'Staff Retirements Review',
      summerLeague: 'Summer League',
      hofCeremony: 'Hall of Fame Review',
    };
    const label = labels[row];
    if (!label) return;
    openStepConfirm({
      eyebrow: 'Summer Checklist',
      title: `Skip ${label}?`,
      body: `You can continue without opening ${label}. This will close the task for this offseason.`,
      confirmLabel: `Skip ${label}`,
    }, () => dispatchAction({
      type: row === 'seasonSummary' || row === 'summerLeague' ? 'OFFSEASON_SKIP_PHASE' : 'OFFSEASON_COMPLETE_PHASE',
      payload: { row },
    } as any));
  };
  const choosePbaMuse = async (candidate: PbaMuseCandidate) => {
    const season = Number(state.leagueStats?.year ?? new Date().getFullYear());
    const teamId = state.userTeamId;
    const selection = {
      season,
      museId: candidate.id,
      teamId,
      selectedAt: state.date,
    };
    await dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        pbaMuseSelections: [
          ...(state.pbaMuseSelections ?? []).filter(existing =>
            existing.season !== season || existing.teamId !== teamId,
          ),
          selection,
        ],
        leagueStats: {
          ...state.leagueStats,
          pbaMuseSelected: true,
        },
      },
    } as any);
    setPbaMuseSelectionOpen(false);
    await dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaMuseSelection' } } as any);
  };
  const renderChecklistRow = (row: OffseasonChecklistRow) => {
    const status = checklist[row] ?? 'pending';
    const isCurrent = row === displayCurrentRow;
    const isResolved = status === 'done' || status === 'skipped';
    const isParallel = isEuroMode && EURO_PARALLEL_ROWS.has(row) && !isResolved;
    const isExpanded = isCurrent;
    const transferRowClosed = row === 'transferMarket' && !isResolved && !transferWindowStatus?.open;
    const transferClosedLabel = transferWindowNextOpenLabel ? `Opens ${transferWindowNextOpenLabel}` : 'Window closed';
    const rowDescription = row === 'sponsorRenewals' && !isEuroMode
      ? 'Renew arena naming rights, settle the jersey patch, and review any new arena proposal before next season.'
      : row === 'draftLottery' && !isDraftOrderReview && !!state.draftLotteryResult?.length
      ? 'The draft lottery is complete. Review the official order in the Draft Lottery menu.'
      : transferRowClosed
      ? `Transfer activity is date-gated. The market board is visible now, but new listings and bids reopen on ${transferWindowNextOpenLabel ?? 'the next window opening'}.`
      : getOffseasonRowDescription(row, state.leagueStats?.uiMode);
    const autoReason = getRowAutoReason({
      row,
      status,
      state,
      pendingTeamOptionsLength: pendingTeamOptions.length,
      rfaCandidatesLength: rfaCandidates.length,
      expiringGateHasRows: expiringGate.hasRows,
      staffRetirementCount,
      openStaffCount,
      staffCompletionSummary: staffHiresCompletionSummary,
      sponsorCoverageComplete: sponsorCoverage.complete,
      transferWindowOpen: !!transferWindowStatus?.open,
      transferWindowNextOpenLabel,
    });
    const blockingRow = getOffseasonBlockingRow(row, checklist, visibleRows);
    const scheduleDateLocked = row === 'euroScheduleDraw' && euroScheduleDateBlocked;
    const franchiseDateLocked = row === 'sponsorRenewals'
      && !isEuroMode
      && !franchiseDealsAccess.available;
    const blocked = blockingRow !== null || scheduleDateLocked || franchiseDateLocked;
    const blockedLabel = scheduleDateLocked
      ? `Opens ${euroScheduleDrawLabel}`
      : franchiseDateLocked
        ? franchiseDealsAccess.blockedLabel
        : null;
    const showMarkDone = shouldShowOffseasonMarkDone({
      row,
      status,
      isResolved,
      blocked,
      isEuroMode,
      isDraftOrderReview,
      hasDraftLotteryResult: !!state.draftLotteryResult?.length,
      transferRowClosed,
      transferMarketCanComplete,
      sponsorCoverageComplete: sponsorCoverage.complete,
      staffReviewReady: staffHiresTaskPhase === 'REVIEW_READY',
    });
    return (
      <OffseasonChecklistRowItem
        key={row}
        row={row}
        status={status}
        isCurrent={isCurrent}
        isParallel={isParallel}
        isExpanded={isExpanded}
        isResolved={isResolved}
        isEuroMode={isEuroMode}
        isPbaMode={isPbaMode}
        isDraftOrderReview={isDraftOrderReview}
        dueSponsorCount={dueSponsorCount}
        openStaffCount={openStaffCount}
        transferRowClosed={transferRowClosed}
        transferClosedLabel={transferClosedLabel}
        blocked={blocked}
        blockedLabel={blockedLabel}
        transferMarketCanComplete={transferMarketCanComplete}
        rowDescription={rowDescription}
        autoReason={autoReason}
        tmWindowCounter={row === 'transferMarket' ? tmWindowCounter : row === 'freeAgency' ? signingWindowCounter : null}
        onPrimary={() => {
          if (transferRowClosed || blocked) return;
          if (row === 'endesaNbaDraft') {
            setEndesaNbaDraftOpen(true);
            dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
            return;
          }
          if (row === 'endesaBroadcastMeeting') {
            setEndesaBroadcastMeetingOpen(true);
            dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
            return;
          }
          if (shouldShowPbaBriefing(row)) {
            openPbaBriefing(row);
            return;
          }
          if (row === 'governorsBoardMeeting') {
            handleEnter(row);
            return;
          }
          if (row === 'pbaImportDecision') {
            void openPbaImportDecisionReview();
            return;
          }
          if (row === 'pbaMuseSelection') {
            void openPbaMuseSelection();
            return;
          }
          if (row === 'pbaOpeningCeremony') {
            void openPbaOpeningCeremony();
            return;
          }
          if (row === 'sponsorRenewals' && !isEuroMode) {
            handleEnter(row);
            return;
          }
          if (row === 'strategyReview') {
            handleEnter(row);
            return;
          }
          if (row === 'seasonSummary' || row === 'retiredPlayersReview' || row === 'staffRetirements') {
            handleEnter(row);
            return;
          }
          if (row === 'draftLottery') {
            handleEnter(row);
            return;
          }
          if (row === 'trainingCamp' && status === 'in-progress') {
            handleEnter(row);
            return;
          }
          if (row === 'freeAgency' || row === 'transferMarket' || row === 'internationalTournament') {
            handleEnter(row);
            return;
          }
          if (row === 'staffSignings') {
            handleEnter(row);
            return;
          }
          const spec = getOffseasonStepConfirmSpec({
            row,
            status,
            isEuroMode,
            isPbaMode: isDraftOrderReview,
            dueSponsorSlotLabels,
            openStaffCount,
          });
          openStepConfirm(
            spec,
            () => handleEnter(row),
          );
        }}
        onOneDay={row === 'freeAgency'
          ? () => { void handleFreeAgencyOneDay(); }
          : row === 'pbaLocalFreeAgency'
            ? () => { void handleFreeAgencyOneDay(true); }
          : row === 'transferMarket'
            ? () => { void handleTransferMarketOneDay(); }
            : undefined}
        onEndWindow={row === 'freeAgency'
          ? () => { void handleFreeAgencyEndWindow(); }
          : row === 'pbaLocalFreeAgency'
            ? () => { void handleFreeAgencyEndWindow(); }
          : row === 'transferMarket'
            ? () => { void handleTransferMarketEndWindow(); }
            : undefined}
        onMarkDone={showMarkDone
          ? () => row === 'transferMarket'
            ? handleMarkTransferMarketDone()
            : dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any)
          : undefined}
        onSkip={shouldShowOffseasonSkip(row, status, blocked)
          ? () => handleSkipTask(row)
          :
          row === 'pbaOpeningCeremony'
          && !blocked
            ? () => { void completePbaOpeningCeremony(); }
            : undefined
        }
        primaryLabel={row === 'draftLottery'
          ? 'Review'
          : row === 'internationalTournament'
            ? status === 'in-progress' ? 'Resume' : 'Enter'
            : undefined}
        markDoneReplacesPrimary={
          showMarkDone
          && row === 'draftLottery'
        }
      />
    );
  };
  return (
    <OffseasonSidebarShell
      checklist={checklist}
      visibleRows={visibleRows}
      isEuroMode={isEuroMode}
      expansionPin={<ExpansionSchedulePin />}
      orderedRows={orderedRows}
      renderChecklistRow={renderChecklistRow}
      onAutoResolveAll={handleAutoResolveAll}
      onExit={() => {
        dispatchAction({ type: 'OFFSEASON_EXIT' } as any);
      }}
      uiMode={state.leagueStats?.uiMode}
      pbaConference={(state.leagueStats as any)?.pbaConference}
    >
      <OffseasonSidebarOverlays
        state={state}
        userTeam={userTeam}
        retiredReviewOpen={retiredReviewOpen}
        staffRetirementsOpen={staffRetirementsOpen}
        hofCeremonyOpen={hofCeremonyOpen}
        governorsBoardOpen={governorsBoardOpen}
        sponsorModalOpen={sponsorModalOpen}
        facilityReviewOpen={facilityReviewOpen}
        budgetReviewOpen={budgetReviewOpen}
        optionsModalOpen={optionsModalOpen}
        pendingTeamOptions={pendingTeamOptions}
        exercisedIds={exercisedIds}
        declinedIds={declinedIds}
        expiringGateModal={expiringGate.modal}
        qoModalOpen={qoModalOpen}
        rfaCandidates={rfaCandidates}
        qoSubmittedIds={qoSubmittedIds}
        qoSkippedIds={qoSkippedIds}
        youthPromotionOpen={youthPromotionOpen}
        youthPlayers={youthPlayers}
        seniorRosterSize={youthSeniorRosterSize}
        maxRosterSize={getStandardRosterLimit(state.leagueStats)}
        euroScheduleDrawOpen={euroScheduleDrawOpen}
        euroScheduleGames={euroScheduleGames}
        preseasonFriendliesOpen={preseasonFriendliesOpen}
        preseasonGames={preseasonGames}
        pbaImportDecisionOpen={pbaImportDecisionOpen}
        pbaMuseSelectionOpen={pbaMuseSelectionOpen}
        pbaOpeningCeremonyOpen={pbaOpeningCeremonyOpen}
        stepConfirm={stepConfirm}
        briefingSpec={briefingSpec}
        autoResolveConfirmOpen={autoResolveConfirmOpen}
        rookieDisclaimerOpen={rookieDisclaimerOpen}
        userTeamRookies={userTeamRookies}
        expansionProtectOpen={expansionProtectOpen}
        expansionDraftViewOpen={expansionDraftViewOpen}
        onRetiredClose={() => setRetiredReviewOpen(false)}
        onStaffRetirementsClose={() => setStaffRetirementsOpen(false)}
        onHofClose={() => setHofCeremonyOpen(false)}
        onGovernorsBoardClose={() => setGovernorsBoardOpen(false)}
        onGovernorsBoardDone={() => {
          setGovernorsBoardOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'governorsBoardMeeting' } } as any);
        }}
        onSponsorClose={() => {
          setSponsorModalOpen(false);
          const latestUser = state.teams.find((t: any) => (t.id ?? t.tid) === state.userTeamId)
            ?? (state.nonNBATeams ?? []).find((t: any) => (t.id ?? t.tid) === state.userTeamId);
          if (getSponsorCoverage(latestUser as any, lsYearOf(state)).complete) {
            dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'sponsorRenewals' } } as any);
          }
        }}
        onFacilityOpenSliders={() => {
          setFacilityReviewOpen(false);
          dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: 'facilityUpgrades' } } as any);
        }}
        onFacilityClose={() => setFacilityReviewOpen(false)}
        onFacilityMarkDone={() => {
          setFacilityReviewOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'facilityUpgrades' } } as any);
        }}
        onBudgetClose={() => setBudgetReviewOpen(false)}
        onBudgetMarkDone={() => {
          const lockTeam = (team: any) => {
            const tid = team.id ?? team.tid;
            if (tid !== state.userTeamId || !team.tycoon) return team;
            const tycoon = {
              ...team.tycoon,
              commitments: (team.tycoon.commitments ?? []).map((commitment: any) => ({ ...commitment })),
            };
            const budgetTeam = { ...team, tycoon };
            const ledger = computeAnnualBudget(
              budgetTeam,
              buildBudgetContext(state, tid),
              state.players,
            );
            scheduleSeasonOperatingCommitments(tycoon, {
              season: state.leagueStats.year,
              startDate: state.date,
              sponsorshipEUR: ledger.revenue.sponsorship,
              sponsorshipAdvanceEUR: getSponsorPaymentAdvanceEUR(tycoon, state.leagueStats.year),
              facilityEUR: ledger.expenses.facility,
              medicalEUR: ledger.expenses.medical ?? 0,
              academyEUR: ledger.expenses.academy ?? 0,
              financeCostsEUR: ledger.expenses.financeCosts,
            });
            return {
              ...team,
              tycoon: {
                ...tycoon,
                budgetLocked: true,
                budgetLockedYear: state.leagueStats?.year ?? new Date().getFullYear(),
              },
            };
          };
          dispatchAction({
            type: 'UPDATE_STATE',
            payload: {
              teams: state.teams.map(lockTeam),
              nonNBATeams: (state.nonNBATeams ?? []).map(lockTeam),
            },
          } as any);
          setBudgetReviewOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'budgetLock' } } as any);
        }}
        onOptionsAssistant={handleOptionsAssistant}
        onOptionsManual={handleOptionsManual}
        onOptionsDismiss={handleOptionsDismiss}
        onOptionsExerciseOne={handleOptionsExerciseOne}
        onOptionsDeclineOne={handleOptionsDeclineOne}
        onQoSubmitOne={handleQoSubmitOne}
        onQoSkipOne={handleQoSkipOne}
        onQoAssistant={handleQoAssistantAll}
        onQoDismiss={handleQoDismiss}
        onYouthClose={() => {
          setYouthPromotionOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'youthPromotion' } } as any);
        }}
        onYouthPromote={(ids) => {
          dispatchAction({
            type: 'PROMOTE_YOUTH',
            payload: { playerIds: ids, teamId: state.userTeamId },
          } as any);
          setYouthPromotionOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'youthPromotion' } } as any);
        }}
        onEuroScheduleClose={() => setEuroScheduleDrawOpen(false)}
        onEuroScheduleDone={() => {
          setEuroScheduleDrawOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'euroScheduleDraw' } } as any);
        }}
        onPreseasonClose={() => setPreseasonFriendliesOpen(false)}
        onPreseasonDone={() => {
          setPreseasonFriendliesOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'preseasonFriendlies' } } as any);
        }}
        onPreseasonScheduleChange={(schedule) => dispatchAction({ type: 'UPDATE_STATE', payload: { schedule } } as any)}
        onPbaImportDecisionClose={() => setPbaImportDecisionOpen(false)}
        onPbaImportDecisionDone={() => {
          setPbaImportDecisionOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaImportDecision' } } as any);
        }}
        onPbaMuseSelectionClose={() => setPbaMuseSelectionOpen(false)}
        onPbaMuseChosen={choosePbaMuse}
        onPbaOpeningCeremonyExit={() => { void completePbaOpeningCeremony(); }}
        onPbaOpeningCeremonySkip={() => { void completePbaOpeningCeremony(); }}
        onStepCancel={closeStepConfirm}
        onStepConfirm={() => {
          const action = confirmActionRef.current;
          closeStepConfirm();
          action?.();
        }}
        onStepSecondary={() => {
          const action = secondaryConfirmActionRef.current;
          closeStepConfirm();
          action?.();
        }}
        onBriefingConfirm={() => {
          markPbaBriefingSeen(false);
          const action = closePbaBriefing();
          action?.();
        }}
        onBriefingDismissForever={() => {
          markPbaBriefingSeen(true);
          const action = closePbaBriefing();
          action?.();
        }}
        onAutoResolveCancel={() => setAutoResolveConfirmOpen(false)}
        onAutoResolveConfirm={() => {
          setAutoResolveConfirmOpen(false);
          dispatchAction({ type: 'OFFSEASON_AUTO_RESOLVE_ALL' } as any);
        }}
        onRookieDismiss={dismissRookieDisclaimer}
        onRookieSelect={player => {
          dismissRookieDisclaimer();
          navigateToPlayer(player);
        }}
        onExpansionProtectClose={() => setExpansionProtectOpen(false)}
        onExpansionProtectConfirm={async (protections) => {
          setExpansionProtectOpen(false);
          await dispatchAction({ type: 'SET_EXPANSION_PROTECTIONS', payload: { protections } } as any);
          setExpansionDraftViewOpen(true);
        }}
        onExpansionDraftClose={() => {
          setExpansionDraftViewOpen(false);
        }}
      />
      <SeasonStrategyTaskOverlay
        open={seasonStrategyOpen}
        onClose={() => setSeasonStrategyOpen(false)}
      />
      <EndesaNbaDraftReviewModal
        open={endesaNbaDraftOpen}
        state={state}
        userTeam={userTeam}
        onClose={() => setEndesaNbaDraftOpen(false)}
        onMarkDone={() => {
          setEndesaNbaDraftOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'endesaNbaDraft' } } as any);
        }}
      />
      <EndesaBroadcastMeetingModal
        open={endesaBroadcastMeetingOpen}
        state={state}
        onClose={() => setEndesaBroadcastMeetingOpen(false)}
        onMarkDone={() => {
          setEndesaBroadcastMeetingOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'endesaBroadcastMeeting' } } as any);
        }}
      />
    </OffseasonSidebarShell>
  );
};

