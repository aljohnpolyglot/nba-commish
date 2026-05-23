import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../../store/GameContext';
import { normalizeDate } from '../../utils/helpers';
import {
  OFFSEASON_ROW_DESCRIPTIONS,
  getVisibleOffseasonRows,
  firstUnfinishedRow,
} from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow, OffseasonRowStatus, NBAPlayer } from '../../types';
import { ALL_SLOTS } from '../../types/tycoon';
import { getOffseasonState } from '../../services/offseason/offseasonState';
import { isSponsorDueForRenewal } from '../../services/tycoon/sponsorshipEngine';
import { ExpansionSchedulePin } from './OffseasonSidebarBits';
import { OffseasonChecklistRowItem, OffseasonEuroRecapCard } from './OffseasonSidebarView';
import { getOffseasonStepConfirmSpec, type OffseasonConfirmSpec } from './offseasonStepSpecs';
import { buildEuroRecap, getRowAutoReason } from './offseasonSidebarSummaries';
import { useOffseasonSidebarSync } from './useOffseasonSidebarSync';
import { OffseasonSidebarShell } from './OffseasonSidebarShell';
import { OffseasonSidebarOverlays } from './OffseasonSidebarOverlays';
import { createHandleEnter } from './offseasonSidebarActions';
import { useOffseasonSidebarDecisions } from './useOffseasonSidebarDecisions';
import {
  getPendingTeamOptions,
  getPreseasonFriendlyRows,
  getRfaCandidates,
  getUserTeamRookies,
  getYouthPromotionPlayers,
  getYouthSeniorRosterSize,
  hasTransferMarketEngagement,
} from './offseasonSidebarData';
import {
  getSponsorCoverage,
  getStaffOpenByGroup,
  lsYearOf,
} from './aufgabenShared';
export { OffseasonPhaseBadge, OffseasonNextActionButton } from './OffseasonHeader';
export { OffseasonFATagFooter, OffseasonTransferMarketFooter, OffseasonTrainingCampFooter } from './OffseasonFooters'; export { OffseasonAufgabenMobileSheet } from './OffseasonMobileSheet';
const ENDORSEMENT_SLOT_CAP = 4;
type EuroSidebarSectionId = 'now' | 'opensSoon' | 'later' | 'resolved';
const EURO_LATER_ROWS = new Set<OffseasonChecklistRow>(['youthPromotion', 'preseasonFriendlies', 'trainingCamp']);
export const OffseasonAufgabenSidebar: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const checklist = state.offseasonChecklist;
  const userTeam = React.useMemo(
    () => state.teams.find((t: any) => (t.id ?? t.tid) === state.userTeamId)
      ?? (state.nonNBATeams ?? []).find((t: any) => (t.id ?? t.tid) === state.userTeamId),
    [state.teams, state.nonNBATeams, state.userTeamId],
  );
  const visibleRows = React.useMemo(
    () => getVisibleOffseasonRows(state.leagueStats, userTeam as any, state.date, (state as any).expansionSchedule),
    [state.leagueStats, userTeam, state.date, (state as any).expansionSchedule],
  );
  const sponsorCoverage = getSponsorCoverage(userTeam as any, lsYearOf(state));
  const dueSponsorCount = sponsorCoverage.dueCount;
  const dueSponsorSlotLabels = React.useMemo(() => {
    const s = (userTeam as any)?.tycoon?.sponsorships;
    if (!s) return [] as string[];
    return ALL_SLOTS
      .filter(k => !s[k] || isSponsorDueForRenewal(s[k], lsYearOf(state)))
      .map(slot => slot.charAt(0).toUpperCase() + slot.slice(1));
  }, [userTeam, state.leagueStats?.year, state.teams, state.nonNBATeams]);
  const openByGroup = getStaffOpenByGroup(userTeam as any, state.staff, lsYearOf(state));
  const expiringCoachCount = openByGroup.coaching;
  const expiringStaffCount = openByGroup.support;
  const openStaffCount = expiringCoachCount + expiringStaffCount;
  const isEuroMode = state.leagueStats?.uiMode === 'euro_isolated';
  const EURO_PARALLEL_ROWS = new Set<OffseasonChecklistRow>(['transferMarket', 'sponsorRenewals', 'facilityUpgrades', 'staffSignings']);
  const confirmActionRef = useRef<(() => void) | null>(null);
  const [expansionProtectOpen, setExpansionProtectOpen] = useState(false);
  const [expansionDraftViewOpen, setExpansionDraftViewOpen] = useState(false);
  const {
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
  } = useOffseasonSidebarSync({
    state,
    dispatchAction,
    checklist,
    visibleRows,
    sponsorCoverage,
    openStaffCount,
    isEuroMode,
  });
  if (!checklist) return null;
  const currentRow = firstUnfinishedRow(checklist, sidebarSignals, visibleRows);
  const orderedRows = React.useMemo(() => {
    if (!isEuroMode) return [...visibleRows];
    const unresolved = (status: OffseasonRowStatus | undefined) => status === 'pending' || status === 'in-progress' || status == null;
    const unresolvedRows = visibleRows.filter(row => unresolved(checklist[row]));
    const resolvedRows = visibleRows.filter(row => !unresolved(checklist[row]));
    return [...unresolvedRows, ...resolvedRows];
  }, [isEuroMode, visibleRows, checklist]);
  const euroSections = React.useMemo(() => {
    if (!isEuroMode) return [] as Array<{ id: EuroSidebarSectionId; title: string; blurb: string; rows: OffseasonChecklistRow[] }>;
    const grouped: Record<EuroSidebarSectionId, OffseasonChecklistRow[]> = {
      now: [],
      opensSoon: [],
      later: [],
      resolved: [],
    };
    for (const row of orderedRows) {
      const status = checklist[row] ?? 'pending';
      const isResolved = status === 'done' || status === 'skipped';
      if (isResolved) {
        grouped.resolved.push(row);
        continue;
      }
      if (row === 'transferMarket' && !transferWindowStatus?.open) {
        grouped.opensSoon.push(row);
        continue;
      }
      if (EURO_LATER_ROWS.has(row)) {
        grouped.later.push(row);
        continue;
      }
      grouped.now.push(row);
    }
    const meta: Array<{ id: EuroSidebarSectionId; title: string; blurb: string }> = [
      { id: 'now', title: 'Handle Now', blurb: 'These are ready for you right away.' },
      { id: 'opensSoon', title: 'Coming Up', blurb: 'Visible now, but still waiting on the calendar.' },
      { id: 'later', title: 'Save For Later', blurb: 'Best handled after the early summer business is done.' },
      { id: 'resolved', title: 'Finished', blurb: 'Already handled this offseason.' },
    ];
    return meta
      .map(section => ({ ...section, rows: grouped[section.id] }))
      .filter(section => section.rows.length > 0);
  }, [isEuroMode, orderedRows, checklist, transferWindowStatus?.open]);
  const displayCurrentRow = React.useMemo(() => {
    if (!isEuroMode) return currentRow;
    const unresolved = (row: OffseasonChecklistRow) => {
      const status = checklist[row] ?? 'pending';
      return status === 'pending' || status === 'in-progress';
    };
    const actionableNow = orderedRows.find(row =>
      unresolved(row)
      && row !== 'transferMarket'
      && !EURO_LATER_ROWS.has(row),
    );
    if (actionableNow) return actionableNow;
    const transferIfOpen = orderedRows.find(row => row === 'transferMarket' && unresolved(row) && !!transferWindowStatus?.open);
    return transferIfOpen ?? currentRow;
  }, [isEuroMode, currentRow, orderedRows, checklist, transferWindowStatus?.open]);
  const transferMarketCanComplete = React.useMemo(() => {
    if (!isEuroMode || !checklist) return true;
    const required: OffseasonChecklistRow[] = ['sponsorRenewals', 'facilityUpgrades', 'staffSignings'];
    return required.every(row => checklist[row] === 'done' || checklist[row] === 'skipped');
  }, [isEuroMode, checklist?.sponsorRenewals, checklist?.facilityUpgrades, checklist?.staffSignings]);
  const [sponsorModalOpen, setSponsorModalOpen] = useState(false);
  const [retiredReviewOpen, setRetiredReviewOpen] = useState(false);
  const [hofCeremonyOpen, setHofCeremonyOpen] = useState(false);
  const [youthPromotionOpen, setYouthPromotionOpen] = useState(false);
  const [preseasonFriendliesOpen, setPreseasonFriendliesOpen] = useState(false);
  const [budgetReviewOpen, setBudgetReviewOpen] = useState(false);
  const [facilityReviewOpen, setFacilityReviewOpen] = useState(false);
  const [transferWindowSimPending, setTransferWindowSimPending] = useState(false);
  const transferWindowSimPendingRef = useRef(false);
  const [autoResolveConfirmOpen, setAutoResolveConfirmOpen] = useState(false);
  const [stepConfirm, setStepConfirm] = useState<OffseasonConfirmSpec | null>(null);
  const [rookieDisclaimerOpen, setRookieDisclaimerOpen] = useState(false);
  const rookieDisclaimerKey = `rookie-disclaimer-${state.saveId ?? 'default'}-${state.leagueStats?.year ?? 0}`;
  useEffect(() => {
    transferWindowSimPendingRef.current = false;
    setTransferWindowSimPending(false);
  }, [state.date, state.isProcessing]);
  const handleTransferWindowSimDay = () => {
    if (!tmWindowCounter || tmWindowCounter.isLast || state.isProcessing || transferWindowSimPendingRef.current) return;
    transferWindowSimPendingRef.current = true;
    setTransferWindowSimPending(true);
    dispatchAction({ type: 'ADVANCE_DAY' } as any);
  };
  const rfaCandidates = React.useMemo<NBAPlayer[]>(() => getRfaCandidates(state), [state]);
  const pendingTeamOptions = React.useMemo<NBAPlayer[]>(() => getPendingTeamOptions(state), [state]);
  const youthPlayers = React.useMemo(() => getYouthPromotionPlayers(state), [state]);
  const youthSeniorRosterSize = React.useMemo(() => getYouthSeniorRosterSize(state), [state]);
  const preseasonGames = React.useMemo(() => getPreseasonFriendlyRows(state), [state]);
  const userTeamRookies = React.useMemo<NBAPlayer[]>(() => getUserTeamRookies(state), [state]);
  const simToDateIfBefore = (targetISO: string) => {
    if (!state.date) return;
    const todayNorm = normalizeDate(state.date);
    if (todayNorm >= targetISO) return;
    dispatchAction({
      type: 'SIMULATE_TO_DATE',
      payload: { targetDate: targetISO, stopBefore: true },
    } as any);
  };
  const openStepConfirm = (spec: OffseasonConfirmSpec, action: () => void) => {
    confirmActionRef.current = action;
    setStepConfirm(spec);
  };
  const closeStepConfirm = () => {
    confirmActionRef.current = null;
    setStepConfirm(null);
  };
  const handleMarkTransferMarketDone = () => {
    if (!transferMarketCanComplete) return;
    const engaged = hasTransferMarketEngagement(state);
    openStepConfirm({
      eyebrow: 'Player Market',
      title: 'Finish Player Market',
      body: engaged
        ? 'This closes out your player-market review and moves the summer board to the next item.'
        : 'No listings, bids, completed deals, or release-clause moves were found for your club. Finish the player market anyway?',
      confirmLabel: 'Mark Done',
    }, () => {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'transferMarket' } } as any);
    });
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
  });
  useEffect(() => {
    if (!draftDone || state.gameMode !== 'gm') return;
    try {
      if (window.localStorage.getItem(rookieDisclaimerKey)) return;
    } catch {}
    setRookieDisclaimerOpen(true);
  }, [draftDone, state.gameMode, rookieDisclaimerKey]);
  const dismissRookieDisclaimer = () => {
    try {
      window.localStorage.setItem(rookieDisclaimerKey, '1');
    } catch {}
    setRookieDisclaimerOpen(false);
  };
  const expiringUnsignedCount = unresolvedExpiringCount;
  const faRowStatus = state.offseasonChecklist?.freeAgency;
  const showExpiringBanner =
    expiringUnsignedCount > 0 &&
    (state.faTagCounter ?? 0) === 0 &&
    faRowStatus === 'pending';
  const handleExpiringBanner = () => {
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: { pendingTeamOfficeNav: { tab: 'intel', intelTab: 'expiring' } },
    } as any);
  };
  const handleAutoResolveAll = () => {
    setAutoResolveConfirmOpen(true);
  };
  const euroRecap = React.useMemo(() => buildEuroRecap(state, userTeam, isEuroMode), [state, userTeam, isEuroMode]);
  const renderChecklistRow = (row: OffseasonChecklistRow) => {
    const status = checklist[row] ?? 'pending';
    const isCurrent = row === displayCurrentRow;
    const isResolved = status === 'done' || status === 'skipped';
    const isParallel = isEuroMode && EURO_PARALLEL_ROWS.has(row) && !isResolved;
    const isExpanded = isCurrent || isParallel;
    const transferRowClosed = row === 'transferMarket' && !isResolved && !transferWindowStatus?.open;
    const transferClosedLabel = transferWindowNextOpenLabel ? `Opens ${transferWindowNextOpenLabel}` : 'Window closed';
    const rowDescription = transferRowClosed
      ? `Transfer activity is date-gated. The market board is visible now, but new listings and bids reopen on ${transferWindowNextOpenLabel ?? 'the next window opening'}.`
      : OFFSEASON_ROW_DESCRIPTIONS[row];
    const autoReason = getRowAutoReason({
      row,
      status,
      state,
      pendingTeamOptionsLength: pendingTeamOptions.length,
      rfaCandidatesLength: rfaCandidates.length,
      expiringGateHasRows: expiringGate.hasRows,
      openStaffCount,
      sponsorCoverageComplete: sponsorCoverage.complete,
      transferWindowOpen: !!transferWindowStatus?.open,
      transferWindowNextOpenLabel,
    });
    const showMarkDone = (row === 'transferMarket' || row === 'sponsorRenewals')
      && !isResolved
      && (row !== 'transferMarket' || (!transferRowClosed && transferMarketCanComplete))
      && (row !== 'sponsorRenewals' || sponsorCoverage.complete);
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
        hasTrainingEngagement={hasTrainingEngagement}
        dueSponsorCount={dueSponsorCount}
        openStaffCount={openStaffCount}
        transferRowClosed={transferRowClosed}
        transferClosedLabel={transferClosedLabel}
        transferMarketCanComplete={transferMarketCanComplete}
        rowDescription={rowDescription}
        autoReason={autoReason}
        tmWindowCounter={row === 'transferMarket' ? tmWindowCounter : null}
        onPrimary={() => {
          if (transferRowClosed) return;
                    openStepConfirm(getOffseasonStepConfirmSpec({
                      row,
                      status,
                      isEuroMode,
                      dueSponsorSlotLabels,
                      openStaffCount,
                    }), () => handleEnter(row));
        }}
        onMarkDone={showMarkDone
          ? () => row === 'transferMarket'
            ? handleMarkTransferMarketDone()
            : dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any)
          : undefined}
      />
    );
  };
  return (
    <OffseasonSidebarShell
      checklist={checklist}
      visibleRows={visibleRows}
      isEuroMode={isEuroMode}
      expansionPin={<ExpansionSchedulePin />}
      euroRecap={isEuroMode && euroRecap ? <OffseasonEuroRecapCard recap={euroRecap} /> : null}
      euroSections={euroSections}
      orderedRows={orderedRows}
      expiringUnsignedCount={expiringUnsignedCount}
      showExpiringBanner={showExpiringBanner}
      onExpiringBanner={handleExpiringBanner}
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
        tmWindowCounter={tmWindowCounter}
        transferWindowSimPending={transferWindowSimPending}
        retiredReviewOpen={retiredReviewOpen}
        hofCeremonyOpen={hofCeremonyOpen}
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
        preseasonFriendliesOpen={preseasonFriendliesOpen}
        preseasonGames={preseasonGames}
        stepConfirm={stepConfirm}
        autoResolveConfirmOpen={autoResolveConfirmOpen}
        rookieDisclaimerOpen={rookieDisclaimerOpen}
        userTeamRookies={userTeamRookies}
        expansionProtectOpen={expansionProtectOpen}
        expansionDraftViewOpen={expansionDraftViewOpen}
        onRetiredClose={() => setRetiredReviewOpen(false)}
        onHofClose={() => setHofCeremonyOpen(false)}
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
        onTransferWindowSimDay={handleTransferWindowSimDay}
        onBudgetClose={() => setBudgetReviewOpen(false)}
        onBudgetMarkDone={() => {
          const lockTeam = (team: any) => {
            const tid = team.id ?? team.tid;
            if (tid !== state.userTeamId || !team.tycoon) return team;
            return {
              ...team,
              tycoon: {
                ...team.tycoon,
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
        onPreseasonClose={() => setPreseasonFriendliesOpen(false)}
        onPreseasonDone={() => {
          setPreseasonFriendliesOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'preseasonFriendlies' } } as any);
        }}
        onStepCancel={closeStepConfirm}
        onStepConfirm={() => {
          const action = confirmActionRef.current;
          closeStepConfirm();
          action?.();
        }}
        onAutoResolveCancel={() => setAutoResolveConfirmOpen(false)}
        onAutoResolveConfirm={() => {
          setAutoResolveConfirmOpen(false);
          dispatchAction({ type: 'OFFSEASON_AUTO_RESOLVE_ALL' } as any);
        }}
        onRookieDismiss={dismissRookieDisclaimer}
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
    </OffseasonSidebarShell>
  );
};
