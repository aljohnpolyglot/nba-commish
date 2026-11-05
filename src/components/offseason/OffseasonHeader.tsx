import React from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import {
  getOffseasonRowDescription,
  getOffseasonRowLabel,
  firstUnfinishedRow,
  getDraftSeasonYearForState,
  getVisibleOffseasonRows,
  isChecklistComplete,
  withGovernorsBoardMeetingTask,
} from '../../services/offseason/offseasonState';
import { resolveOffseasonTaskView } from '../../services/offseason/offseasonTaskNavigation';
import type { OffseasonChecklistRow, Tab } from '../../types';
import { addGameDays, getDraftDate, getDraftLotteryDate, getRolloverDate, toISODateString } from '../../utils/dateUtils';
import { normalizeDate } from '../../utils/helpers';
import { getCentralFreeAgencyDays } from '../../services/freeAgency/freeAgencyDecisionTiming';
import { getEuroOffseasonMarketProgress } from '../../services/offseason/euroOffseasonMarkets';
import { OffseasonBriefingModal } from './OffseasonModalDeck';
import GovernorsBoardMeetingView from './views/GovernorsBoardMeetingView';
import {
  getOffseasonCalendarYear,
  getUpcomingTrainingCampISO,
  useCalendarRowSignals,
} from './aufgabenShared';
import {
  getEffectivePbaConference,
  PBA_GOVERNORS_IMPORT_HEIGHT_LABEL,
  type PbaConference,
} from '../../services/pba/importManager';
import { useExpiringResignGate } from '../../hooks/useExpiringResignGate';
import { isFranchiseExperienceAvailable } from '../../services/franchises/franchiseState';
import { getFranchiseDealsTaskAccess } from '../../services/franchises/franchiseTaskTiming';
import { getNextPbaLocalFreeAgencyDay } from '../../services/pba/localFreeAgencyAi';
import { ExpansionDraftTaskFlow } from '../commissioner-tasks/CommissionerExpansionDraftFlow';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import { resolveLeagueSeasonLifecycle } from '../../services/lifecycle/leagueSeasonLifecycle';

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
    body: 'This is the all-Filipino conference.\n\nNo imports are allowed here. Start by handling the draft and your local roster work, then get the domestic core ready for opening night.',
  };
};

interface NextActionButtonProps {
  setCurrentView: (v: Tab) => void;
}

export const OffseasonPhaseBadge: React.FC = () => {
  const { state } = useGame();
  const centralFreeAgencyDays = getCentralFreeAgencyDays(state);
  const lifecycle = React.useMemo(() => resolveLeagueSeasonLifecycle(state), [state.seasonLifecycle, state.draftLotteryResult, state.activeDraftPicks, state.activeDraftPassedPicks, state.history, state.players, state.leagueStats]);
  const signals = useCalendarRowSignals();
  const checklist = React.useMemo(
    () => withGovernorsBoardMeetingTask(state.offseasonChecklist, state.pendingGovernorsBoardMeeting, state.leagueStats?.year),
    [state.offseasonChecklist, state.pendingGovernorsBoardMeeting, state.leagueStats?.year],
  );
  const visibleRows = React.useMemo(
    () => getVisibleOffseasonRows(state.leagueStats, null, state.date, (state as any).expansionSchedule, checklist, { lotteryResolved: lifecycle.draft.lottery === 'complete', draftComplete: lifecycle.draft.draft === 'complete' }),
    [state.leagueStats, state.date, (state as any).expansionSchedule, checklist, lifecycle],
  );
  if (!checklist) return null;
  if (visibleRows.length === 0) return null;
  const currentRow = firstUnfinishedRow(checklist, signals, visibleRows);
  const isEuroMode = state.leagueStats?.uiMode === 'euro_isolated';
  const phaseLabel = currentRow === 'governorsBoardMeeting' && state.pendingGovernorsBoardMeeting?.kind === 'euro-league-assembly'
    ? 'League Assembly'
    : currentRow === 'seasonSummary' && isEuroMode
      ? 'Season Review'
    : currentRow ? getOffseasonRowLabel(currentRow, state.leagueStats?.uiMode) : 'Ready for next season';
  const isFA = currentRow === 'freeAgency';
  const isPbaLocalFA = currentRow === 'pbaLocalFreeAgency'
    && state.pbaLocalFreeAgency?.status === 'open';
  const euroSigningProgress = isEuroMode && isFA
    ? getEuroOffseasonMarketProgress(state.date, 'signing')
    : null;
  const tagSuffix = euroSigningProgress
    ? ` · DAY ${euroSigningProgress.current}/${euroSigningProgress.total}`
    : isFA && state.faTagCounter
      ? ` · DAY ${state.faTagCounter}/${centralFreeAgencyDays}`
    : isPbaLocalFA
      ? ` · DAY ${getNextPbaLocalFreeAgencyDay(state)}/${state.pbaLocalFreeAgency?.totalDays ?? 15}`
      : '';
  return (
    <div className="min-w-0 rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-300/80 shrink-0">
          Offseason
        </span>
        <span className="h-3 w-px bg-slate-700 shrink-0" />
        <span className="text-[11px] font-black text-white truncate uppercase tracking-tight min-w-0">
          {phaseLabel}{tagSuffix}
        </span>
      </div>
    </div>
  );
};

export const OffseasonNextActionButton: React.FC<NextActionButtonProps> = ({ setCurrentView }) => {
  const { state, dispatchAction } = useGame();
  const centralFreeAgencyDays = getCentralFreeAgencyDays(state);
  const lifecycle = React.useMemo(() => resolveLeagueSeasonLifecycle(state), [state.seasonLifecycle, state.draftLotteryResult, state.activeDraftPicks, state.activeDraftPassedPicks, state.history, state.players, state.leagueStats]);
  const [briefingSpec, setBriefingSpec] = React.useState<{ eyebrow: string; title: string; body: string } | null>(null);
  const [governorsBoardOpen, setGovernorsBoardOpen] = React.useState(false);
  const [expansionDraftFlowOpen, setExpansionDraftFlowOpen] = React.useState(false);
  const pendingBriefingRef = React.useRef<(() => void) | null>(null);
  const myFAsModalShown = React.useRef(false);
  const myFAsModalOpened = React.useRef(false);
  const expiringGate = useExpiringResignGate({
    onNavigateManual: () => setCurrentView('Team Office' as Tab),
    onReviewComplete: () => dispatchAction({
      type: 'OFFSEASON_COMPLETE_PHASE',
      payload: { row: 'myFAs' },
    } as any),
  });
  const signals = useCalendarRowSignals();
  const checklist = React.useMemo(
    () => withGovernorsBoardMeetingTask(state.offseasonChecklist, state.pendingGovernorsBoardMeeting, state.leagueStats?.year),
    [state.offseasonChecklist, state.pendingGovernorsBoardMeeting, state.leagueStats?.year],
  );
  const visibleRows = React.useMemo(
    () => getVisibleOffseasonRows(state.leagueStats, null, state.date, (state as any).expansionSchedule, checklist, { lotteryResolved: lifecycle.draft.lottery === 'complete', draftComplete: lifecycle.draft.draft === 'complete' }),
    [state.leagueStats, state.date, (state as any).expansionSchedule, checklist, lifecycle],
  );
  if (!checklist) return null;
  if (visibleRows.length === 0) return null;
  const currentRow = firstUnfinishedRow(checklist, signals, visibleRows);
  const allDone = isChecklistComplete(checklist, visibleRows);
  const isPba = state.leagueStats?.uiMode === 'pba_isolated';
  const isEuro = state.leagueStats?.uiMode === 'euro_isolated';
  const pbaEffectiveConference = getEffectivePbaConference(state.leagueStats as any);
  const pbaLocalFaActive = currentRow === 'pbaLocalFreeAgency'
    && checklist.pbaLocalFreeAgency === 'in-progress'
    && state.pbaLocalFreeAgency?.status === 'open';
  const franchiseDealsAccess = getFranchiseDealsTaskAccess(
    state,
    checklist.sponsorRenewals ?? 'pending',
  );

  React.useEffect(() => {
    if (expiringGate.isOpen) {
      myFAsModalOpened.current = true;
      return;
    }
    if (!myFAsModalShown.current || !myFAsModalOpened.current) return;
    myFAsModalShown.current = false;
    myFAsModalOpened.current = false;
    if (!expiringGate.hasRows || expiringGate.reviewed) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'myFAs' } } as any);
    }
  }, [dispatchAction, expiringGate.hasRows, expiringGate.isOpen, expiringGate.reviewed]);

  const shouldShowPbaBriefing = (row: OffseasonChecklistRow) => {
    if (!isPba) return false;
    const triggerRow = pbaEffectiveConference === 'philippine' ? 'pbaDraft' : 'pbaImportSearch';
    if (row !== triggerRow) return false;
    const briefingState = readPbaBriefingState(state.saveId);
    if (briefingState.dismissedForever) return false;
    return !briefingState.seen[pbaEffectiveConference];
  };

  const markBriefingSeen = (dismissedForever?: boolean) => {
    const current = readPbaBriefingState(state.saveId);
    writePbaBriefingState(state.saveId, {
      seen: { ...current.seen, [pbaEffectiveConference]: true },
      dismissedForever: dismissedForever ? true : current.dismissedForever,
    });
  };

  const closeBriefing = () => {
    const next = pendingBriefingRef.current;
    pendingBriefingRef.current = null;
    setBriefingSpec(null);
    return next;
  };

  const handleAdvanceSeason = () => {
    dispatchAction({ type: 'OFFSEASON_EXIT' } as any);
    const target = isPba ? 'NBA Central' : state.leagueStats?.uiMode === 'euro_isolated' ? 'Schedule' : 'NBA Central';
    setCurrentView(target as Tab);
  };

  if (allDone || !currentRow) {
    const exitLabel = isPba
      ? ((state.leagueStats as any)?.pbaConference === 'governors' ? 'Enter New Season' : 'Enter Next Conference')
      : isEuro ? 'Jump to Preseason' : 'Enter Preseason';
    return (
      <button
        onClick={handleAdvanceSeason}
        disabled={state.isProcessing}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest transition-colors"
      >
        <Sparkles size={14} />
        {exitLabel}
      </button>
    );
  }

  const lotteryAlreadyRan = !!(state.draftLotteryResult && state.draftLotteryResult.length > 0);
  const isDraftOrderReview = isPba || !isDraftLotteryEnabled(state.leagueStats?.draftType);
  const labelForRow: Record<OffseasonChecklistRow, string> = {
    governorsBoardMeeting: state.pendingGovernorsBoardMeeting?.kind === 'euro-league-assembly'
      ? checklist.governorsBoardMeeting === 'in-progress' ? 'Resume League Assembly' : 'Open League Assembly'
      : checklist.governorsBoardMeeting === 'in-progress' ? 'Resume Season Recap' : 'Open Season Recap',
    draftLottery: isDraftOrderReview
      ? 'Review Draft Order'
      : lotteryAlreadyRan
        ? 'Review Lottery Results'
        : 'Watch Draft Lottery',
    draftOrderReview: 'Review Draft Order',
    seasonSummary: checklist.seasonSummary === 'in-progress' ? 'Mark Done' : 'Enter Season Review',
    performanceReview: checklist.performanceReview === 'in-progress' ? 'Resume Performance Review' : 'Begin Performance Review',
    strategyReview: checklist.strategyReview === 'in-progress' ? 'Resume Media Day' : 'Enter Media Day',
    retiredPlayersReview: 'Honor Retirees',
    memorialDecisions: 'Review Memorials',
    expansionDraft: 'Run Expansion Draft',
    options: 'Decide Options',
    qualifyingOffers: 'Submit Qualifying Offers',
    myFAs: 'Talk to Expiring Players',
    endesaNbaDraft: 'Review NBA Draft',
    draft: 'Run NBA Draft',
    rookieContracts: 'Sign Rookies',
    freeAgency: isEuro
      ? 'Open Signing Market'
      : state.faTagCounter
        ? `Resume Free Agency · ${state.faTagCounter}/${centralFreeAgencyDays}`
        : 'Open Free Agency',
    transferMarket: isEuro ? 'Open Transfer Market' : 'Open Player Market',
    sponsorRenewals: isEuro
      ? 'Check Sponsors'
      : franchiseDealsAccess.available
        ? checklist.sponsorRenewals === 'in-progress' ? 'Resume Franchise Deals' : 'Enter Franchise Deals'
        : franchiseDealsAccess.blockedLabel ?? 'Franchise Deals',
    facilityUpgrades: 'Check Facilities',
    budgetLock: 'Set Budget',
    endesaBroadcastMeeting: 'Review Media Rights',
    coachingSignings: 'Review Staff',
    staffRetirements: 'Review Staff Retirements',
    staffSignings: 'Check Staff',
    youthPromotion: 'Review Academy',
    euroScheduleDraw: 'Review Schedule',
    preseasonFriendlies: state.leagueStats?.uiMode === 'euro_isolated' ? 'Plan Friendlies' : 'Review Tune-Ups',
    hofCeremony: 'Review Class',
    summerLeague: 'Open Summer League',
    internationalTournament: 'Open Tournament',
    trainingCamp: checklist.trainingCamp === 'in-progress' ? 'Resume Training Camp' : 'Enter Training Camp',
    pbaDraft: checklist.pbaDraft === 'in-progress' ? 'Resume PBA Draft' : 'Run PBA Draft',
    pbaLocalFreeAgency: pbaLocalFaActive
      ? `Open Free Agency · ${getNextPbaLocalFreeAgencyDay(state)}/${state.pbaLocalFreeAgency?.totalDays ?? 15}`
      : 'Enter Free Agency',
    pbaImportSearch: 'Search Imports',
    pbaImportDecision: 'Decide Import',
    pbaMuseSelection: 'Choose Muse',
    pbaOpeningCeremony: 'Watch Opening',
    pbaAllStarWeekend: 'All-Star Weekend',
    pbaConferenceAwards: 'Review Season',
  };
  const label = labelForRow[currentRow];

  const handleEnter = () => {
    if (
      currentRow === 'seasonSummary'
      && checklist[currentRow] === 'in-progress'
    ) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: currentRow } } as any);
      return;
    }
    if (currentRow === 'strategyReview') {
      const todayNorm = state.date ? normalizeDate(state.date) : '';
      const trainingCampDate = getUpcomingTrainingCampISO(state);
      if (todayNorm && todayNorm < trainingCampDate) {
        dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { targetDate: trainingCampDate, stopBefore: true },
        } as any);
        return;
      }
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingSeasonStrategyModal: true },
      } as any);
      return;
    }
    if (pbaLocalFaActive) {
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingTeamOfficeNav: { tab: 'intel', intelTab: 'fa' } },
      } as any);
      setCurrentView('Free Agents' as Tab);
      return;
    }
    if (currentRow === 'expansionDraft') {
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: currentRow } } as any);
      setExpansionDraftFlowOpen(true);
      return;
    }
    if (shouldShowPbaBriefing(currentRow)) {
      pendingBriefingRef.current = handleEnter;
      setBriefingSpec(getPbaBriefingSpec(pbaEffectiveConference));
      return;
    }
    if (currentRow === 'governorsBoardMeeting') {
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: currentRow } } as any);
      setGovernorsBoardOpen(true);
      return;
    }
    if (currentRow === 'myFAs') {
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: currentRow } } as any);
      if (!expiringGate.hasRows) {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: currentRow } } as any);
        return;
      }
      myFAsModalShown.current = true;
      myFAsModalOpened.current = false;
      expiringGate.forceOpen();
      return;
    }
    if (currentRow === 'sponsorRenewals' && isFranchiseExperienceAvailable(state)) {
      if (!franchiseDealsAccess.available) return;
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: currentRow } } as any);
      setCurrentView('Franchises');
      return;
    }
    if (currentRow === 'memorialDecisions') {
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: currentRow } } as any);
      setCurrentView('Inbox');
      return;
    }
    const ls = state.leagueStats as any;
    const draftSeasonYear = getDraftSeasonYearForState(state);
    const todayNorm = state.date ? normalizeDate(state.date) : '';
    const simIfBefore = (targetISO: string) => {
      if (todayNorm && todayNorm < targetISO) {
        dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { targetDate: targetISO, stopBefore: true },
        } as any);
      }
    };
    if (currentRow === 'draftLottery') {
      if (!isPba) {
        simIfBefore(toISODateString(getDraftLotteryDate(draftSeasonYear, ls)));
      }
    } else if (currentRow === 'draft' || currentRow === 'pbaDraft') {
      simIfBefore(toISODateString(getDraftDate(draftSeasonYear, ls)));
    } else if (
      !isEuro
      && !isPba
      && (
        currentRow === 'retiredPlayersReview'
        || currentRow === 'staffRetirements'
        || currentRow === 'staffSignings'
      )
    ) {
      simIfBefore(toISODateString(addGameDays(
        getRolloverDate(getOffseasonCalendarYear(state), ls, state.schedule),
        1,
      )));
    } else if (currentRow === 'trainingCamp') {
      if (state.leagueStats?.uiMode === 'pba_isolated') {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'trainingCamp' } } as any);
        return;
      }
      simIfBefore(getUpcomingTrainingCampISO(state));
    }
    if (currentRow === 'pbaImportDecision') {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: currentRow } } as any);
      return;
    }
    if (currentRow === 'pbaLocalFreeAgency') {
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingTeamOfficeNav: { tab: 'intel', intelTab: 'fa' } },
      } as any);
    }
    dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: currentRow } } as any);
    if (isPba) {
      const target = resolveOffseasonTaskView(currentRow, state);
      if (target) setCurrentView(target);
    }
  };

  return (
    <>
      <div className="relative flex items-stretch">
        <button
          onClick={handleEnter}
          disabled={state.isProcessing || (currentRow === 'sponsorRenewals' && !isEuro && !franchiseDealsAccess.available)}
          title={getOffseasonRowDescription(currentRow, state.leagueStats?.uiMode)}
          className="flex items-center gap-2 rounded-lg bg-[#2d5a27] px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#3a7233] disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          <ChevronRight size={14} />
          {label}
        </button>
      </div>
      {expiringGate.modal}
      {expansionDraftFlowOpen && (
        <ExpansionDraftTaskFlow onClose={() => setExpansionDraftFlowOpen(false)} />
      )}
      <OffseasonBriefingModal
        spec={briefingSpec}
        onConfirm={() => {
          markBriefingSeen(false);
          const next = closeBriefing();
          next?.();
        }}
        onDismissForever={() => {
          markBriefingSeen(true);
          const next = closeBriefing();
          next?.();
        }}
      />
      <GovernorsBoardMeetingView
        isOpen={governorsBoardOpen}
        onClose={() => setGovernorsBoardOpen(false)}
        onDone={() => {
          setGovernorsBoardOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'governorsBoardMeeting' } } as any);
        }}
      />
    </>
  );
};


