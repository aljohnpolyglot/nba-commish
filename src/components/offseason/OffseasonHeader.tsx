import React from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import {
  OFFSEASON_ROW_DESCRIPTIONS,
  OFFSEASON_ROW_LABELS,
  OFFSEASON_ROW_TAB,
  firstUnfinishedRow,
  getVisibleOffseasonRows,
  isChecklistComplete,
} from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow, Tab } from '../../types';
import { getDraftDate, getDraftLotteryDate, toISODateString } from '../../utils/dateUtils';
import { normalizeDate } from '../../utils/helpers';
import { getHOFCeremonyDateString } from '../../services/playerDevelopment/hofChecker';
import { OffseasonBriefingModal } from './OffseasonModalDeck';
import {
  getOffseasonCalendarYear,
  getUpcomingTrainingCampISO,
  lsYearOf,
  useCalendarRowSignals,
} from './aufgabenShared';
import { getEffectivePbaConference, type PbaConference } from '../../services/pba/importManager';

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
      body: "This conference also allows one import, but the pool is capped at 6'5\" and below.\n\nYour first move is Import Search. Make sure the player fits the height limit before you commit, because this conference is built around smaller, faster import profiles.",
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
  const signals = useCalendarRowSignals();
  const visibleRows = React.useMemo(
    () => getVisibleOffseasonRows(state.leagueStats, null, state.date, (state as any).expansionSchedule, state.offseasonChecklist, { lotteryResolved: !!(state.draftLotteryResult && state.draftLotteryResult.length > 0), draftComplete: !!state.draftComplete }),
    [state.leagueStats, state.date, (state as any).expansionSchedule],
  );
  if (!state.offseasonChecklist) return null;
  if (visibleRows.length === 0) return null;
  const currentRow = firstUnfinishedRow(state.offseasonChecklist, signals, visibleRows);
  const phaseLabel = currentRow ? OFFSEASON_ROW_LABELS[currentRow] : 'Ready for next season';
  const isFA = currentRow === 'freeAgency';
  const tagSuffix = isFA && state.faTagCounter
    ? ` · DAY ${state.faTagCounter}/${state.faTagsTotal ?? 13}`
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
  const [briefingSpec, setBriefingSpec] = React.useState<{ eyebrow: string; title: string; body: string } | null>(null);
  const pendingBriefingRef = React.useRef<(() => void) | null>(null);
  const signals = useCalendarRowSignals();
  const visibleRows = React.useMemo(
    () => getVisibleOffseasonRows(state.leagueStats, null, state.date, (state as any).expansionSchedule, state.offseasonChecklist, { lotteryResolved: !!(state.draftLotteryResult && state.draftLotteryResult.length > 0), draftComplete: !!state.draftComplete }),
    [state.leagueStats, state.date, (state as any).expansionSchedule],
  );
  if (!state.offseasonChecklist) return null;
  if (visibleRows.length === 0) return null;
  const currentRow = firstUnfinishedRow(state.offseasonChecklist, signals, visibleRows);
  const allDone = isChecklistComplete(state.offseasonChecklist, visibleRows);
  const isPba = state.leagueStats?.uiMode === 'pba_isolated';
  const isEuro = state.leagueStats?.uiMode === 'euro_isolated';
  const pbaEffectiveConference = getEffectivePbaConference(state.leagueStats as any);

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
  const labelForRow: Record<OffseasonChecklistRow, string> = {
    draftLottery: isPba
      ? 'Review Draft Order'
      : lotteryAlreadyRan
        ? 'Review Lottery Results'
        : 'Watch Draft Lottery',
    seasonSummary: 'View League History',
    retiredPlayersReview: 'Honor Retirees',
    expansionDraft: 'Run Expansion Draft',
    options: 'Decide Options',
    qualifyingOffers: 'Submit Qualifying Offers',
    myFAs: 'Talk to Expiring Players',
    draft: 'Run NBA Draft',
    rookieContracts: 'Sign Rookies',
    freeAgency: state.faTagCounter
      ? `End Day · ${state.faTagCounter}/${state.faTagsTotal ?? 13}`
      : 'Enter Free Agency',
    transferMarket: 'Open Player Market',
    sponsorRenewals: 'Check Sponsors',
    facilityUpgrades: 'Check Facilities',
    budgetLock: 'Set Budget',
    coachingSignings: 'Review Staff',
    staffRetirements: 'Review Staff Retirements',
    staffSignings: 'Check Staff',
    youthPromotion: 'Review Academy',
    preseasonFriendlies: 'Review Tune-Ups',
    hofCeremony: 'Attend Ceremony',
    trainingCamp: state.leagueStats?.uiMode === 'euro_isolated' ? 'Finish Camp' : 'Open Training Camp',
    pbaDraft: 'Run PBA Draft',
    pbaLocalFreeAgency: 'Enter Free Agency',
    pbaImportSearch: 'Search Imports',
    pbaImportDecision: 'Decide Import',
    pbaMuseSelection: 'Choose Muse',
    pbaOpeningCeremony: 'Watch Opening',
    pbaAllStarWeekend: 'All-Star Weekend',
    pbaConferenceAwards: 'View Awards',
  };
  const label = labelForRow[currentRow];

  const handleEnter = () => {
    if (shouldShowPbaBriefing(currentRow)) {
      pendingBriefingRef.current = handleEnter;
      setBriefingSpec(getPbaBriefingSpec(pbaEffectiveConference));
      return;
    }
    if (currentRow === 'freeAgency' && (state.faTagCounter ?? 0) > 0) {
      dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
      return;
    }
    const ls = state.leagueStats as any;
    const lsYear = lsYearOf(state);
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
        simIfBefore(toISODateString(getDraftLotteryDate(lsYear, ls)));
      }
    } else if (currentRow === 'draft') {
      simIfBefore(toISODateString(getDraftDate(lsYear, ls)));
    } else if (currentRow === 'trainingCamp') {
      if (state.leagueStats?.uiMode === 'pba_isolated') {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'trainingCamp' } } as any);
        return;
      }
      simIfBefore(getUpcomingTrainingCampISO(state));
      if (state.leagueStats?.uiMode === 'euro_isolated') {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'trainingCamp' } } as any);
        return;
      }
    } else if (currentRow === 'hofCeremony') {
      simIfBefore(getHOFCeremonyDateString(getOffseasonCalendarYear(state)));
    }
    if (currentRow === 'pbaImportDecision' || currentRow === 'pbaOpeningCeremony' || currentRow === 'pbaAllStarWeekend') {
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
    if (currentRow === 'freeAgency' && (state.faTagCounter ?? 0) === 0) {
      dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
    }
    if (isPba) {
      const target = OFFSEASON_ROW_TAB[currentRow];
      if (target) setCurrentView(target);
    }
  };

  return (
    <>
      <button
        onClick={handleEnter}
        disabled={state.isProcessing}
        title={OFFSEASON_ROW_DESCRIPTIONS[currentRow]}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2d5a27] hover:bg-[#3a7233] disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest transition-colors"
      >
        <ChevronRight size={14} />
        {label}
      </button>
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
    </>
  );
};


