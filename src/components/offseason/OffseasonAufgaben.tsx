/**
 * Offseason 2K-style sandboxed task UI — Phase A.
 *
 * Single file colocates the three pieces (sidebar + header badge + header CTA)
 * for the new AUFGABEN flow. Phase B/C add their modal stacks here too so the
 * whole feature lives in one place.
 *
 * Renders ONLY when state.offseasonChecklist is set (i.e. offseason mode).
 * Driven by getOffseasonState (Sessions 1-5 orchestrator) — no calendar math.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Circle, ChevronRight, FastForward, Sparkles, ListChecks, X, FileSignature, Bot, CheckCircle, AlertTriangle, GraduationCap } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { convertTo2KRating, normalizeDate, computeAge } from '../../utils/helpers';
import { getDraftDate, getDraftLotteryDate, getTrainingCampDate, getCurrentOffseasonFAMoratoriumEnd, parseGameDate, toISODateString } from '../../utils/dateUtils';
import { getTeamFullName } from '../../utils/teamNames';
import {
  OFFSEASON_ROW_LABELS,
  OFFSEASON_ROW_DESCRIPTIONS,
  getVisibleOffseasonRows,
  firstUnfinishedRow,
  isChecklistComplete,
} from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow, OffseasonRowStatus, NBAPlayer, Tab } from '../../types';
import type { SponsorshipSlot } from '../../types/tycoon';
import { TeamOptionGateModal } from '../modals/TeamOptionGateModal';
import { SponsorshipNegotiationModal } from '../tycoon/SponsorshipNegotiationModal';
import RetiredPlayersReviewModal from './views/RetiredPlayersReviewView';
import HOFCeremonyModal from './views/HOFCeremonyView';
import { useExpiringResignGate } from '../../hooks/useExpiringResignGate';
import { getOffseasonState, computeDraftSeasonYear, computeUpcomingSeasonYear } from '../../services/offseason/offseasonState';
import { getTransferMarketSettings, isInTransferWindow } from '../../utils/transferWindow';
import { PlayerProtectionModal } from '../expansion/PlayerProtectionModal';
import { ExpansionDraftView } from '../expansion/ExpansionDraftView';
import { YouthPromotionPanel } from '../central/view/FrontOffice/sections/AcademySection';
import { AnnualBudgetReviewModal, type AnnualBudgetReviewValues } from '../tycoon/AnnualBudgetReviewModal';
import { getTeamStaff } from '../../services/staffService';

type OffseasonConfirmSpec = {
  eyebrow: string;
  title: string;
  body: string;
  confirmLabel: string;
};

// File-private alias of utils/leagueYear getLsYear — kept here to minimise the
// import diff while the helper is still being adopted across the codebase.
function lsYearOf(state: { leagueStats?: { year?: number } | null }): number {
  return state.leagueStats?.year ?? new Date().getFullYear();
}

function getUpcomingTrainingCampISO(state: {
  date?: string;
  leagueStats?: any;
}) {
  const ls = state.leagueStats as any;
  const lsYear = lsYearOf(state);
  const todayNorm = state.date ? normalizeDate(state.date) : '';
  const currentMonth = state.date ? parseGameDate(state.date).getUTCMonth() + 1 : 7;
  const currentYear = state.date ? parseGameDate(state.date).getUTCFullYear() : lsYear;
  let seasonYear = computeUpcomingSeasonYear(currentMonth, currentYear, lsYear);
  let campISO = toISODateString(getTrainingCampDate(seasonYear, ls));
  // Some saves are still pre-rollover in July/Sep, so ls.year still points to
  // the season that just ended. If the derived camp date is already behind us,
  // bump to the next season's camp anchor.
  if (todayNorm && campISO < todayNorm) {
    seasonYear = Math.max(seasonYear + 1, currentYear + 1);
    campISO = toISODateString(getTrainingCampDate(seasonYear, ls));
  }
  return campISO;
}

// ─── Header Phase Badge — replaces date during offseason ────────────────────
//
// Used in App.tsx header. When offseasonChecklist exists, swap the date pill
// for this badge so the GM sees "OFFSEASON · DRAFT LOTTERY" instead of
// "Jul 5, 2026". Falls back to nothing (caller renders date) when not in
// offseason.

/** Calendar-anchor signals shared across the three callers. Same date math
 *  as PlayButton's phase derivation — sidebar should highlight the row that
 *  matches today's actual event, not just the first pending one in order. */
function useCalendarRowSignals() {
  const { state } = useGame();
  return React.useMemo(() => {
    if (!state.date) return {};
    const ls = state.leagueStats as any;
    const lsYear: number = lsYearOf(state);
    const todayStr = normalizeDate(state.date);
    const cParsed = parseGameDate(state.date);
    const cMonth = cParsed.getUTCMonth() + 1;
    const cYear = cParsed.getUTCFullYear();
    const draftSeasonYear = computeDraftSeasonYear(cMonth, cYear, lsYear);
    const upcomingSeasonYear = computeUpcomingSeasonYear(cMonth, cYear, lsYear);
    const draftStr = toISODateString(getDraftDate(draftSeasonYear, ls));
    const lotteryStr = toISODateString(getDraftLotteryDate(draftSeasonYear, ls));
    const campStr = toISODateString(getTrainingCampDate(upcomingSeasonYear, ls));
    const faOpenStr = toISODateString(getCurrentOffseasonFAMoratoriumEnd(state.date, ls, state.schedule as any));
    return {
      onDraftDay:    todayStr === draftStr,
      onLotteryDay:  todayStr === lotteryStr,
      onCampOpenDay: todayStr === campStr,
      onFAOpenDay:   todayStr === faOpenStr,
    };
  }, [state.date, state.leagueStats, state.schedule]);
}

export const OffseasonPhaseBadge: React.FC = () => {
  const { state } = useGame();
  const signals = useCalendarRowSignals();
  const visibleRows = React.useMemo(
    () => getVisibleOffseasonRows(state.leagueStats, null, state.date),
    [state.leagueStats, state.date],
  );
  if (!state.offseasonChecklist) return null;
  const currentRow = firstUnfinishedRow(state.offseasonChecklist, signals, visibleRows);
  const phaseLabel = currentRow ? OFFSEASON_ROW_LABELS[currentRow] : 'Ready for next season';
  const isFA = currentRow === 'freeAgency';
  const tagSuffix = isFA && state.faTagCounter
    ? ` · DAY ${state.faTagCounter}/${state.faTagsTotal ?? 13}`
    : '';
  return (
    <div className="flex flex-col leading-none min-w-0">
      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-300/80">
        Offseason
      </span>
      <span className="text-[11px] font-black text-white truncate uppercase tracking-tight">
        {phaseLabel}{tagSuffix}
      </span>
    </div>
  );
};

// ─── Header Next-Action CTA — replaces PlayButton during offseason ──────────

interface NextActionButtonProps {
  setCurrentView: (v: Tab) => void;
}

export const OffseasonNextActionButton: React.FC<NextActionButtonProps> = ({ setCurrentView }) => {
  const { state, dispatchAction } = useGame();
  const signals = useCalendarRowSignals();
  const visibleRows = React.useMemo(
    () => getVisibleOffseasonRows(state.leagueStats, null, state.date),
    [state.leagueStats, state.date],
  );
  if (!state.offseasonChecklist) return null;
  const currentRow = firstUnfinishedRow(state.offseasonChecklist, signals, visibleRows);
  const allDone = isChecklistComplete(state.offseasonChecklist, visibleRows);
  const isPba = state.leagueStats?.uiMode === 'pba_isolated';

  const handleAdvanceSeason = () => {
    dispatchAction({ type: 'OFFSEASON_EXIT' } as any);
    const target = isPba ? 'PBA Hub' : state.leagueStats?.uiMode === 'euro_isolated' ? 'Schedule' : 'NBA Central';
    setCurrentView(target as Tab);
  };

  if (allDone || !currentRow) {
    const exitLabel = isPba
      ? ((state.leagueStats as any)?.pbaConference === 'governors' ? 'Enter New Season' : 'Enter Next Conference')
      : 'Enter Preseason';
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

  // Context-aware label per phase row
  const lotteryAlreadyRan = !!(state.draftLotteryResult && state.draftLotteryResult.length > 0);
  const labelForRow: Record<OffseasonChecklistRow, string> = {
    draftLottery:     lotteryAlreadyRan ? 'Review Lottery Results' : 'Watch Draft Lottery',
    retiredPlayersReview: 'Honor Retirees',
    expansionDraft:   'Run Expansion Draft',
    options:          'Decide Options',
    qualifyingOffers: 'Submit Qualifying Offers',
    myFAs:            'Review Departing FAs',
    draft:            'Run NBA Draft',
    rookieContracts:  'Sign Rookies',
    freeAgency:       state.faTagCounter
      ? `End Day · ${state.faTagCounter}/${state.faTagsTotal ?? 13}`
      : 'Enter Free Agency',
    transferMarket:   'Open Transfer Market',
    sponsorRenewals:  'Review Sponsors',
    facilityUpgrades: 'Review Facilities',
    budgetLock: 'Review Budget',
    coachingSignings: 'Review Coaching',
    staffSignings: 'Review Support Staff',
    youthPromotion: 'Review Academy',
    preseasonFriendlies: 'Review Friendlies',
    hofCeremony:      'Attend Ceremony',
    trainingCamp:     'Open Training Camp',
    pbaDraft:         'Run PBA Draft',
    pbaLocalFreeAgency: 'Enter Free Agency',
    pbaImportSearch:  'Search Imports',
    pbaImportDecision: 'Decide Import',
    pbaMuseSelection: 'Choose Muse',
    pbaOpeningCeremony: 'Watch Opening',
    pbaAllStarWeekend: 'All-Star Weekend',
    pbaConferenceAwards: 'View Awards',
  };
  const label = labelForRow[currentRow];

  const handleEnter = () => {
    // Special case: during active FA tag counter, the header CTA is "End Day"
    // — fire the tag advance directly instead of re-entering the phase.
    if (currentRow === 'freeAgency' && (state.faTagCounter ?? 0) > 0) {
      dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
      return;
    }
    // Calendar-anchored phases: advance to event date if user is before it
    // so they land ON the day (matching sidebar Enter behavior).
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
      simIfBefore(toISODateString(getDraftLotteryDate(lsYear, ls)));
    } else if (currentRow === 'draft') {
      simIfBefore(toISODateString(getDraftDate(lsYear, ls)));
    } else if (currentRow === 'trainingCamp') {
      simIfBefore(getUpcomingTrainingCampISO(state));
    }
    dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: currentRow } } as any);
    // Initial FA entry also fires the moratorium-skip + counter-init.
    if (currentRow === 'freeAgency' && (state.faTagCounter ?? 0) === 0) {
      dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
    }
  };

  return (
    <button
      onClick={handleEnter}
      disabled={state.isProcessing}
      title={OFFSEASON_ROW_DESCRIPTIONS[currentRow]}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2d5a27] hover:bg-[#3a7233] disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest transition-colors"
    >
      <ChevronRight size={14} />
      {label}
    </button>
  );
};

// ─── Sidebar — the AUFGABEN checklist ───────────────────────────────────────
//
// Mounted inside TeamOfficeView when state.offseasonChecklist is set. Vertical
// list of 8 rows; current row highlighted; each row has an Enter / Skip pair.

const STATUS_ICON: Record<OffseasonRowStatus, React.ReactNode> = {
  'pending':     <Circle className="w-4 h-4 text-slate-500" />,
  'in-progress': <Circle className="w-4 h-4 text-amber-400 animate-pulse" />,
  'done':        <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  'skipped':     <CheckCircle2 className="w-4 h-4 text-slate-600" />,
};

const STATUS_LABEL: Record<OffseasonRowStatus, string> = {
  'pending':     '',
  'in-progress': 'In progress',
  'done':        'Complete',
  'skipped':     'Skipped',
};

/** Sidebar-Pin: zeigt eine geplante Expansion oben in der Aufgaben-Sidebar.
 *  - year === current ls.year: "this offseason" (emerald)
 *  - year > current: "scheduled for YYYY" (zinc, mit Test-Now + Cancel-Button)
 *  Kein Render wenn kein Schedule oder year < current (stale). */
const ExpansionSchedulePin: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const schedule = (state as any).expansionSchedule;
  const lsYear = state.leagueStats?.year;
  if (!schedule || lsYear == null || schedule.year < lsYear) return null;
  // Expansion is NBA-only — the 2029 auto-seed creates a phantom banner in
  // Euro-Isolated saves because the GameContext auto-seeds an NBA expansion
  // schedule unconditionally. Suppress the pin entirely for Euro saves until
  // the upstream auto-seed is gated.
  if (state.leagueStats?.uiMode === 'euro_isolated') return null;

  const isThisYear = schedule.year === lsYear;
  const teamCount = schedule.teams?.length ?? 0;

  return (
    <div className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
      isThisYear
        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
        : 'bg-zinc-800/40 border-zinc-700 text-zinc-300'
    }`}>
      <Sparkles size={14} className={isThisYear ? 'text-emerald-400' : 'text-amber-400'} />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-black uppercase tracking-tight">
          Expansion {isThisYear ? 'this offseason' : `scheduled for ${schedule.year}`}
        </div>
        <div className="text-[9px] opacity-70">
          {teamCount} new franchise{teamCount === 1 ? '' : 's'}
        </div>
      </div>
      {/*
       * DEV-only Test-Now-Button — schiebt schedule.year auf ls.year, damit man
       * den Expansion-Flow ohne Wartezeit testen kann. Auskommentiert für
       * Default-Build: echtes 2029-Schedule (auto-seed) läuft via Future-Year-
       * Trigger automatisch wenn ls.year === 2029.
       *
       * Re-aktivieren: einfach den Block unten unkommentieren.
       *
      {!isThisYear && (
        <button
          onClick={() => dispatchAction({ type: 'ACTIVATE_EXPANSION_NOW' } as any)}
          title="DEV: Trigger now (skip wait)"
          className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 rounded shrink-0"
        >
          Test Now
        </button>
      )}
      */}
      <button
        onClick={() => dispatchAction({ type: 'CLEAR_EXPANSION_SCHEDULE' } as any)}
        title="Cancel scheduled expansion"
        className="text-zinc-500 hover:text-rose-400 shrink-0"
      >
        <X size={12} />
      </button>
    </div>
  );
};

export const OffseasonAufgabenSidebar: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const checklist = state.offseasonChecklist;
  const userTeam = React.useMemo(
    () => state.teams.find((t: any) => (t.id ?? t.tid) === state.userTeamId)
      ?? (state.nonNBATeams ?? []).find((t: any) => (t.id ?? t.tid) === state.userTeamId),
    [state.teams, state.nonNBATeams, state.userTeamId],
  );
  const visibleRows = React.useMemo(
    () => getVisibleOffseasonRows(state.leagueStats, userTeam as any, state.date),
    [state.leagueStats, userTeam, state.date],
  );

  // Sponsor-renewal status: how many of the 3 slots are expired right now?
  const expiredSponsorCount = React.useMemo(() => {
    const s = (userTeam as any)?.tycoon?.sponsorships;
    if (!s) return 0;
    return (['kit', 'sleeve', 'stadium'] as const).reduce((n, k) => n + (s[k] === null ? 1 : 0), 0);
  }, [userTeam]);

  // Staff-signing status: count OPEN positions per group. A role is open when
  // it's in firedStaffRoles OR has no signed member at all. Expiring (1-year-
  // left) contracts are NOT counted as open — the user can re-sign during
  // next offseason. Auto-done fires when openCount === 0 for the group.
  const COACHING_ROLES = ['Head Coach', 'Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3'];
  const SUPPORT_ROLES = ['Head of Sports Science', 'Head Physio', 'Player Development Coach', 'Chief Scout', 'Head of Analytics'];
  const openByGroup = React.useMemo(() => {
    const members: any[] = (userTeam as any)?.tycoon?.staffMembers ?? [];
    const fired: string[] = (userTeam as any)?.tycoon?.firedStaffRoles ?? [];
    const teamName: string | undefined = (userTeam as any)?.name;
    const teamFullName = userTeam ? getTeamFullName(userTeam as any) : teamName;
    const persistedRoles = new Set(members.map(m => m.role).filter(Boolean));
    const hcCoachExists = (state.staff?.coaches ?? []).some(
      (s: any) => (s.team === teamName || s.team === teamFullName) && ((s.position ?? s.jobTitle ?? s.role) === 'Head Coach'),
    );
    const realTeamCoaches = getTeamStaff(teamName ?? '').concat(teamFullName && teamFullName !== teamName ? getTeamStaff(teamFullName) : []);
    const realAssistantSlots = realTeamCoaches
      .filter((s: any) => {
        const pos = String(s.position ?? s.jobTitle ?? s.role ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
        return pos === 'assistant coach' || pos === 'lead assistant coach' || pos === 'assistant  coach';
      })
      .filter((s: any) => !members.some(m => m.name === s.name));
    const missingAssistantRoles = COACHING_ROLES
      .filter(role => role.startsWith('Assistant Coach'))
      .filter(role => !fired.includes(role) && !persistedRoles.has(role));
    const realAssistantFilled = new Set(missingAssistantRoles.slice(0, realAssistantSlots.length));
    const isOpen = (role: string) => {
      if (fired.includes(role)) return true;
      if (persistedRoles.has(role)) return false;
      if (realAssistantFilled.has(role)) return false;
      // Head Coach can also be sourced from state.staff.coaches (Euro saves
      // seed the HC there without a tycoon.staffMembers entry).
      if (role === 'Head Coach' && hcCoachExists) return false;
      return true;
    };
    return {
      coaching: COACHING_ROLES.filter(isOpen).length,
      support: SUPPORT_ROLES.filter(isOpen).length,
    };
  }, [userTeam, state.staff?.coaches]);
  const expiringCoachCount = openByGroup.coaching;
  const expiringStaffCount = openByGroup.support;

  // Auto-complete coaching/staff signings when nothing is expiring or vacant
  // in scope. Also fires from 'pending' so a Euro offseason whose roster is
  // already fully staffed for multiple years doesn't surface a no-op task.
  React.useEffect(() => {
    const checklist = state.offseasonChecklist as any;
    if (!checklist) return;
    const unresolved = (s: string) => s === 'pending' || s === 'in-progress';
    if (unresolved(checklist.coachingSignings) && expiringCoachCount === 0) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'coachingSignings' } } as any);
    }
    if (unresolved(checklist.staffSignings) && expiringStaffCount === 0) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'staffSignings' } } as any);
    }
  }, [expiringCoachCount, expiringStaffCount, state.offseasonChecklist?.coachingSignings, state.offseasonChecklist?.staffSignings]);

  // Euro parallel rows: Transfer Market + Sponsor Renewals + Facility Upgrades
  // are all simultaneously openable — don't wait for the previous one to finish.
  const isEuroMode = state.leagueStats?.uiMode === 'euro_isolated';
  const EURO_PARALLEL_ROWS = new Set<OffseasonChecklistRow>(['transferMarket', 'sponsorRenewals', 'facilityUpgrades']);

  // Transfer window day counter (like FA Day X/Y)
  const tmWindowCounter = React.useMemo(() => {
    if (!isEuroMode || !checklist || checklist.transferMarket === 'done' || checklist.transferMarket === 'skipped') return null;
    const ws = isInTransferWindow(state.date, state.leagueStats);
    if (!ws.open || !ws.currentClose) return null;
    const todayIso = typeof state.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.date)
      ? state.date
      : new Date(state.date ?? '').toISOString().slice(0, 10);
    const closeIso = ws.currentClose.toISOString().slice(0, 10);
    const msPerDay = 86_400_000;
    const settings = getTransferMarketSettings(state.leagueStats);
    const startMMDD = ws.window === 'summer' ? settings.summerStart : settings.winterStart;
    const [startMonth, startDay] = startMMDD.split('-').map((n: string) => parseInt(n, 10));
    const todayDate = new Date(`${todayIso}T00:00:00Z`);
    const closeDate = new Date(`${closeIso}T00:00:00Z`);
    let startDate = new Date(Date.UTC(closeDate.getUTCFullYear(), startMonth - 1, startDay));
    if (startDate.getTime() > closeDate.getTime()) {
      startDate = new Date(Date.UTC(closeDate.getUTCFullYear() - 1, startMonth - 1, startDay));
    }
    const total = Math.max(1, Math.round((closeDate.getTime() - startDate.getTime()) / msPerDay) + 1);
    const current = Math.max(1, Math.min(total, Math.round((todayDate.getTime() - startDate.getTime()) / msPerDay) + 1));
    return { current, total };
  }, [isEuroMode, state.date, state.leagueStats, checklist?.transferMarket]);
  const confirmActionRef = useRef<(() => void) | null>(null);
  // GM-Mode Expansion-Modals — mountable direkt aus der Sidebar, weil im GM
  // die Actions-Tab nicht existiert und Navigation dorthin ins Leere führt.
  const [expansionProtectOpen, setExpansionProtectOpen] = useState(false);
  const [expansionDraftViewOpen, setExpansionDraftViewOpen] = useState(false);
  const sidebarSignals = useCalendarRowSignals();
  // My FAs row reuses the existing expiring-contracts modal (same one
  // PlayButton fires before crossing FA-open). forceOpen triggers it as a
  // standalone task; isOpen + a transition watcher mark the row done after
  // the user dismisses the modal.
  const expiringGate = useExpiringResignGate({
    onNavigateManual: () => {
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingTeamOfficeNav: { tab: 'intel', intelTab: 'expiring' } },
      } as any);
    },
  });
  const myFAsModalShown = useRef(false);
  useEffect(() => {
    if (myFAsModalShown.current && !expiringGate.isOpen) {
      myFAsModalShown.current = false;
      // Mark done once every row is resolved, including unavailable players
      // who are testing FA / retiring and therefore need no user action.
      // Early-dismiss before review still leaves actionable rows unresolved.
      if (expiringGate.allResolved) {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'myFAs' } } as any);
      }
    }
  }, [expiringGate.isOpen, expiringGate.allResolved, dispatchAction]);

  // FA counter auto-clear: if PlayButton skips the calendar past training camp
  // while the FA day counter is still running, mark the FA row skipped so the
  // bottom-bar FA·DAY label doesn't persist into preseason.
  useEffect(() => {
    if (!checklist || (state.faTagCounter ?? 0) === 0) return;
    const faStatus = checklist.freeAgency;
    if (faStatus !== 'pending' && faStatus !== 'in-progress') return;
    if (!state.date || !state.leagueStats) return;
    const ls = state.leagueStats as any;
    const lsYear: number = lsYearOf(state);
    const cMonth = parseGameDate(state.date).getUTCMonth() + 1;
    const currentYear = parseGameDate(state.date).getUTCFullYear();
    const upcomingSeasonYear = computeUpcomingSeasonYear(cMonth, currentYear, lsYear);
    const campStr = toISODateString(getTrainingCampDate(upcomingSeasonYear, ls));
    if (state.date >= campStr) {
      dispatchAction({ type: 'OFFSEASON_SKIP_PHASE', payload: { row: 'freeAgency' } } as any);
    }
  }, [state.date, state.faTagCounter, checklist, state.leagueStats, dispatchAction]);

  // Auto-sync: when engine state proves a phase is done, flip the
  // corresponding row to 'done' so the user doesn't see pending rows for
  // things already handled. Runs every render — cheap, only dispatches when
  // a status actually needs to change. Hooks must run before any early-return,
  // so the useEffect lives here even though the component bails out below.
  const lotteryDone = !!(state.draftLotteryResult && state.draftLotteryResult.length > 0);
  const draftDone = !!state.draftComplete;
  // Rookie contracts: in real NBA, R1 picks are guaranteed per CBA (mandatory
  // signing) and R2 defaults are handled by autoRunDraft + AI logic. Once the
  // draft is complete, the GM has nothing to actively decide here.
  const rookieContractsDone = draftDone;
  // Team options: row is done when no expiring team options remain for the
  // user team OR rollover has already advanced the year past them.
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
  // Training camp: marked done once the calendar reaches opening night-ish
  // (mid-October) — the user has had the camp window to set drills.
  // ALSO marked done when the user has actively engaged with training
  // (set a calendar plan, assigned a mentor, picked dev focus, or changed
  // training intensity from default). This way clicking "auto-resolve all"
  // after engaging won't overwrite the user's manual work.
  //
  // Phase-driven instead of inline cMonth/cDay math. The orchestrator's
  // getOffseasonState already handles training-camp window (preCamp) and
  // post-camp transition (back to inSeason) including the Manila-timezone
  // edge case via parseGameDate internally.
  const offseasonPhase = state.date
    ? getOffseasonState(state.date, state.leagueStats as any, state.schedule as any).phase
    : 'inSeason';
  // Camp window itself = preCamp phase (Sep 29 – Oct 20). After that the
  // calendar transitions to inSeason — that's "camp done" within our offseason
  // checklist mounting window (Jun 15 – Oct 21).
  const isInCampWindow = offseasonPhase === 'preCamp';
  // trainingCamp row only auto-completes when calendar has actually transitioned
  // PAST camp (phase = 'inSeason' = Oct 22+). Don't trust `hasTrainingEngagement`
  // alone — a user with training plans set BEFORE camp opened would otherwise
  // skip past the entire camp window the moment they "Enter" it (S56 bug:
  // End Day FA → "Open Training Camp" auto-completed instantly → flipped to
  // "Enter Preseason" → user jumped past camp without playing any of it).
  const calendarTrainingCampDone = offseasonPhase === 'inSeason';
  const hasTrainingEngagement = React.useMemo(() => {
    if (!isInCampWindow) return false;
    if (state.gameMode !== 'gm' || state.userTeamId == null) return false;
    const userTeam = state.teams.find((t: any) => t.id === state.userTeamId) as any;
    if (userTeam?.trainingCalendar && Object.keys(userTeam.trainingCalendar).length > 0) return true;
    return state.players.some((p: any) =>
      p.tid === state.userTeamId && (
        !!p.devFocus ||
        !!p.mentorId ||
        (p.trainingIntensity && p.trainingIntensity !== 'Normal')
      )
    );
  }, [state.gameMode, state.userTeamId, state.teams, state.players, isInCampWindow]);
  // Calendar-only auto-mark. hasTrainingEngagement is kept on the books for
  // future use (e.g. surfacing "training camp engaged" badges) but does NOT
  // gate the row's done-ness — that's calendar-driven only.
  const trainingCampDone = calendarTrainingCampDone;
  // Qualifying offers: empty candidate list = nothing to decide → done.
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
    // Mark a row done if its engine signal fires AND status is anything
    // other than already-resolved (done/skipped). User may have clicked
    // Enter (→ 'in-progress') BEFORE the signal fires (e.g. clicks Run
    // Draft, simulates to draft day, last pick commits → draftComplete=true
    // → row should auto-flip to 'done' even though it's currently 'in-progress').
    const isUnresolved = (s: OffseasonRowStatus) => s === 'pending' || s === 'in-progress';
    if (lotteryDone && isUnresolved(checklist.draftLottery)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'draftLottery' } } as any);
    }
    if (draftDone && isUnresolved(checklist.draft)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'draft' } } as any);
    }
    if (rookieContractsDone && isUnresolved(checklist.rookieContracts)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'rookieContracts' } } as any);
    }
    if (noPendingTeamOptions && isUnresolved(checklist.options)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'options' } } as any);
    }
    if (trainingCampDone && isUnresolved(checklist.trainingCamp)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'trainingCamp' } } as any);
    }
    if (noQOCandidates && isUnresolved(checklist.qualifyingOffers)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'qualifyingOffers' } } as any);
    }
    if (draftDone && isUnresolved(checklist.pbaDraft)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'pbaDraft' } } as any);
    }
  }, [lotteryDone, draftDone, rookieContractsDone, noPendingTeamOptions, trainingCampDone, noQOCandidates, checklist?.draftLottery, checklist?.draft, checklist?.rookieContracts, checklist?.options, checklist?.trainingCamp, checklist?.qualifyingOffers, checklist?.pbaDraft]);

  // Expansion-Draft Future-Year-Trigger: ein Schedule mit `year === ls.year`
  // aktiviert die Row beim Erreichen des Jahres (auch wenn das Schedule schon
  // letzte Saison gesetzt wurde). Beidseitig idempotent — kein dispatch wenn
  // Row bereits 'pending' ist.
  useEffect(() => {
    if (!checklist) return;
    const schedule = (state as any).expansionSchedule;
    const lsYear = state.leagueStats?.year;
    if (!schedule || lsYear == null) return;
    if (schedule.year === lsYear && checklist.expansionDraft === 'skipped') {
      // OFFSEASON_RESET_CHECKLIST oder direct setRowStatus — wir nutzen den
      // ENTER-Pattern via SCHEDULE_EXPANSION-Replay, der die Row korrekt setzt.
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
  }, [(state as any).expansionSchedule, state.leagueStats?.year, checklist?.expansionDraft]);

  if (!checklist) return null;

  const currentRow = firstUnfinishedRow(checklist, sidebarSignals, visibleRows);
  // Options modal — opens when user clicks "Enter" on the options row.
  // Reuses the existing TeamOptionGateModal which is already wired into
  // PlayButton's guards; this is a second mount-point for offseason flow.
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  // Tycoon: sponsor-renewal modal — opened from the sponsorRenewals offseason row.
  const [sponsorModalOpen, setSponsorModalOpen] = useState(false);
  const [retiredReviewOpen, setRetiredReviewOpen] = useState(false);
  const [hofCeremonyOpen, setHofCeremonyOpen] = useState(false);
  const [exercisedIds, setExercisedIds] = useState<Set<string>>(new Set());
  const [declinedIds, setDeclinedIds] = useState<Set<string>>(new Set());
  // Qualifying Offer modal — opens when user clicks "Enter" on the QO row.
  const [qoModalOpen, setQoModalOpen] = useState(false);
  const [youthPromotionOpen, setYouthPromotionOpen] = useState(false);
  const [budgetReviewOpen, setBudgetReviewOpen] = useState(false);
  const [qoSubmittedIds, setQoSubmittedIds] = useState<Set<string>>(new Set());
  const [qoSkippedIds, setQoSkippedIds] = useState<Set<string>>(new Set());
  const [autoResolveConfirmOpen, setAutoResolveConfirmOpen] = useState(false);
  const [stepConfirm, setStepConfirm] = useState<OffseasonConfirmSpec | null>(null);
  // Rookie contracts disclaimer — auto-pops once after draft completes,
  // explains the R1-mandatory / R2-non-guaranteed CBA defaults.
  const [rookieDisclaimerOpen, setRookieDisclaimerOpen] = useState(false);
  const rookieDisclaimerKey = `rookie-disclaimer-${state.saveId ?? 'default'}-${state.leagueStats?.year ?? 0}`;

  // RFA-eligible expiring rookies on user team. Real NBA rule: only R1
  // picks coming off rookie scale are RFA-eligible (max 4 yrs of service).
  // R2 picks default to UFA — no QO available.
  const rfaCandidates = React.useMemo<NBAPlayer[]>(() => {
    if (state.gameMode !== 'gm' || state.userTeamId == null) return [];
    // RFA system + qualifying offers are NBA-CBA constructs. Euro contracts use
    // buyout clauses and direct multi-year deals instead. Suppress in Euro-Isolated.
    if (state.leagueStats?.uiMode === 'euro_isolated') return [];
    const currentYear = lsYearOf(state);
    return state.players.filter((p: any) => {
      if (p.tid !== state.userTeamId || p.status !== 'Active') return false;
      if (!p.contract) return false;
      // Expiring this offseason
      if ((p.contract.exp ?? 0) !== currentYear) return false;
      // R1 rookie scale (R2 picks not RFA-eligible)
      const isR1Rookie = !!(p.contract.rookie && p.draft?.round === 1);
      if (!isR1Rookie) return false;
      // Already opted out via skip — hide
      if (p.contract.qualifyingOfferSkipped) return false;
      return true;
    });
  }, [state.gameMode, state.userTeamId, state.players, state.leagueStats?.year, state.leagueStats?.uiMode]);

  const pendingTeamOptions = React.useMemo<NBAPlayer[]>(() => {
    if (state.gameMode !== 'gm' || state.userTeamId == null) return [];
    // Team options also NBA-only (see useTeamOptionGate for the same reasoning).
    if (state.leagueStats?.uiMode === 'euro_isolated') return [];
    const currentYear = lsYearOf(state);
    const nextYear = currentYear + 1;
    return state.players.filter((p: any) => {
      if (p.tid !== state.userTeamId || p.status !== 'Active') return false;
      if (!p.contract?.hasTeamOption) return false;
      const teamOptionExp = Number(p.contract?.teamOptionExp ?? p.contract?.exp ?? 0);
      return teamOptionExp === nextYear;
    });
  }, [state.gameMode, state.userTeamId, state.players, state.leagueStats?.year]);

  // Helper: simulate forward to a target date if the calendar isn't there yet.
  // Lands ON the target date with games unplayed (stopBefore=true) so the
  // user can watch/run the event manually after navigating.
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

  const hasTransferMarketEngagement = (): boolean => {
    const userTid = state.userTeamId;
    if (userTid == null) return false;
    const hasListing = (state.transferListings ?? []).some((l: any) => l.sellerTid === userTid);
    const hasBid = (state.transferBids ?? []).some((b: any) => b.sellerTid === userTid || b.bidderTid === userTid);
    const hasActivity = (state.transferActivity ?? []).some((a: any) => a.fromTid === userTid || a.toTid === userTid);
    return hasListing || hasBid || hasActivity;
  };

  const handleMarkTransferMarketDone = () => {
    const engaged = hasTransferMarketEngagement();
    openStepConfirm({
      eyebrow: 'Transfer Window',
      title: 'Mark Transfer Market Complete',
      body: engaged
        ? 'This marks the transfer-market review complete and moves the offseason checklist to the next task.'
        : 'No user listings, bids, accepted transfers, or release-clause activity were found for your club. Mark the transfer market complete anyway?',
      confirmLabel: 'Mark Done',
    }, () => {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'transferMarket' } } as any);
    });
  };

  const getStepConfirmSpec = (row: OffseasonChecklistRow, status: OffseasonRowStatus): OffseasonConfirmSpec => {
    const resume = status === 'in-progress';
    switch (row) {
      case 'retiredPlayersReview':
        return {
          eyebrow: 'Offseason Flow',
          title: resume ? 'Resume Legacy Review' : 'Open Legacy Review',
          body: 'Honor this season\'s retirees, see which jerseys go up to the rafters, and check who\'s next in line for the Hall.',
          confirmLabel: resume ? 'Resume Review' : 'Open Review',
        };
      case 'hofCeremony':
        return {
          eyebrow: 'Hall of Fame Weekend',
          title: resume ? 'Resume Enshrinement' : 'Attend the Ceremony',
          body: 'Welcome this year\'s Hall of Fame class on enshrinement weekend. Once concluded, the step is cleared from your checklist.',
          confirmLabel: resume ? 'Resume Ceremony' : 'Enter Ceremony',
        };
      case 'draftLottery':
        return {
          eyebrow: 'Offseason Flow',
          title: resume ? 'Resume Draft Lottery' : 'Open Draft Lottery',
          body: 'This moves you into the draft lottery step. Continue only if you want to handle the lottery flow now.',
          confirmLabel: resume ? 'Resume Lottery' : 'Open Lottery',
        };
      case 'expansionDraft':
        return {
          eyebrow: 'Offseason Flow',
          title: resume ? 'Resume Expansion Draft' : 'Run Expansion Draft',
          body: 'This opens the player protection modal for the scheduled expansion. AI teams are pre-filled — review and confirm to advance to the actual draft.',
          confirmLabel: resume ? 'Resume Expansion' : 'Run Expansion',
        };
      case 'options':
        return {
          eyebrow: 'Offseason Flow',
          title: resume ? 'Resume Team Options' : 'Open Team Options',
          body: 'This opens your team option decisions. Continue only if you want to review or change those option calls now.',
          confirmLabel: resume ? 'Resume Options' : 'Open Options',
        };
      case 'qualifyingOffers':
        return {
          eyebrow: 'Offseason Flow',
          title: resume ? 'Resume Qualifying Offers' : 'Open Qualifying Offers',
          body: 'This opens your restricted free agency decisions. Continue only if you want to submit or skip qualifying offers now.',
          confirmLabel: resume ? 'Resume QOs' : 'Open QOs',
        };
      case 'myFAs':
        return {
          eyebrow: 'Offseason Flow',
          title: resume ? 'Resume Expiring Contracts' : 'Review Expiring Contracts',
          body: 'This re-opens your departing free agents and expiring contracts. Continue only if you want to make those decisions now.',
          confirmLabel: resume ? 'Resume Review' : 'Review Contracts',
        };
      case 'draft':
        return {
          eyebrow: 'Offseason Flow',
          title: resume ? 'Resume NBA Draft' : 'Enter NBA Draft',
          body: 'This takes you into the draft step. Continue only if you want to handle the draft flow now.',
          confirmLabel: resume ? 'Resume Draft' : 'Enter Draft',
        };
      case 'rookieContracts':
        return {
          eyebrow: 'Offseason Flow',
          title: resume ? 'Resume Rookie Contracts' : 'Open Rookie Contracts',
          body: 'This advances into the rookie-contract step. Continue only if you want to review that phase now.',
          confirmLabel: resume ? 'Resume Rookies' : 'Open Rookies',
        };
      case 'freeAgency':
        return {
          eyebrow: 'Offseason Flow',
          title: resume ? 'Resume Free Agency' : 'Enter Free Agency',
          body: 'This opens the free agency flow and may initialize the day counter if it has not started yet.',
          confirmLabel: resume ? 'Resume Free Agency' : 'Enter Free Agency',
        };
      case 'transferMarket':
        return {
          eyebrow: 'Transfer Window',
          title: resume ? 'Resume Transfer Market' : 'Open Transfer Market',
          body: 'This opens the Euro transfer window for listings, bids, release clauses, and unattached-player review before camp.',
          confirmLabel: resume ? 'Resume Market' : 'Open Market',
        };
      case 'trainingCamp':
        return {
          eyebrow: 'Offseason Flow',
          title: resume ? 'Resume Training Camp' : 'Open Training Camp',
          body: 'This moves you into training camp. Continue only if you want to work on camp decisions now.',
          confirmLabel: resume ? 'Resume Camp' : 'Open Camp',
        };
      case 'sponsorRenewals': {
        const expiredSlots = (() => {
          const s = (userTeam as any)?.tycoon?.sponsorships;
          if (!s) return [] as string[];
          return (['kit', 'sleeve', 'stadium'] as const).filter(k => s[k] === null);
        })();
        if (expiredSlots.length === 0) {
          return {
            eyebrow: 'Front Office',
            title: 'Sponsorship Review',
            body: 'All 3 core sponsors are active — no renewals needed this offseason. You can review deals anytime in the Front Office.',
            confirmLabel: 'Continue',
          };
        }
        const slotList = expiredSlots.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
        return {
          eyebrow: 'Front Office',
          title: 'Sponsorship Renewals',
          body: `${expiredSlots.length} of 3 sponsorship slot${expiredSlots.length === 1 ? '' : 's'} expired: ${slotList}. Open negotiations to accept market offers — or decline and fall back to default sponsors at ~50% of your tier floor.`,
          confirmLabel: 'Open Negotiations',
        };
      }
      case 'facilityUpgrades':
        return {
          eyebrow: 'Front Office',
          title: 'Facility Review',
          body: 'Open the facilities desk to review upgrades before players report.',
          confirmLabel: 'Open Facilities',
        };
      case 'budgetLock':
        return {
          eyebrow: 'Front Office',
          title: 'Annual Budget Review',
          body: 'Finalize next season\'s ticketing, travel, medical, scouting, and academy operating budgets after staff payroll is known.',
          confirmLabel: 'Open Review',
        };
      case 'preseasonFriendlies':
        return {
          eyebrow: 'Offseason Flow',
          title: 'Preseason Friendlies',
          body: 'Open the schedule desk to review preseason and friendly slots before camp.',
          confirmLabel: 'Open Schedule',
        };
      case 'youthPromotion':
        return {
          eyebrow: 'Youth Academy',
          title: resume ? 'Resume Youth Promotion' : 'Open Youth Promotion',
          body: 'Decide which academy prospects earn a senior roster spot. Promote A/A+ talents now if you have an open slot, or leave them another year to develop.',
          confirmLabel: resume ? 'Resume Promotion' : 'Open Academy',
        };
      case 'pbaDraft':
        return {
          eyebrow: 'PBA Offseason',
          title: resume ? 'Resume PBA Draft' : 'Enter PBA Draft',
          body: 'Select your rookies from the pool of Filipino draft prospects.',
          confirmLabel: resume ? 'Resume Draft' : 'Enter Draft',
        };
      case 'pbaLocalFreeAgency':
        return {
          eyebrow: 'PBA Offseason',
          title: resume ? 'Resume Local Free Agency' : 'Enter Local Free Agency',
          body: 'Sign local Filipino free agents before the new conference begins.',
          confirmLabel: resume ? 'Resume Signings' : 'Enter Free Agency',
        };
      case 'pbaImportSearch':
        return {
          eyebrow: 'Conference Break',
          title: resume ? 'Resume Import Search' : 'Search for Imports',
          body: 'Browse the free agent pool for a conference import player.',
          confirmLabel: resume ? 'Resume Search' : 'Open Free Agents',
        };
      case 'pbaImportDecision':
        return {
          eyebrow: 'Conference Break',
          title: 'Finalize Import Decision',
          body: 'Confirm your import signing or proceed without one.',
          confirmLabel: 'Continue',
        };
      case 'pbaOpeningCeremony':
        return {
          eyebrow: 'Conference Break',
          title: 'Opening Ceremony',
          body: 'Watch the conference opening ceremony and team parade.',
          confirmLabel: 'Watch Ceremony',
        };
      case 'pbaMuseSelection':
        return {
          eyebrow: 'PBA Offseason',
          title: 'Muse Selection',
          body: 'Choose your team muse for the conference opening.',
          confirmLabel: 'Select Muse',
        };
      case 'pbaAllStarWeekend':
        return {
          eyebrow: 'PBA Events',
          title: 'All-Star Weekend',
          body: 'Enjoy the PBA All-Star Weekend festivities.',
          confirmLabel: 'Watch Event',
        };
      case 'pbaConferenceAwards':
        return {
          eyebrow: 'Conference End',
          title: 'Conference Awards',
          body: 'Review conference awards and the champion.',
          confirmLabel: 'View Awards',
        };
      case 'coachingSignings': {
        if (expiringCoachCount === 0) {
          return {
            eyebrow: 'Coaching Staff',
            title: 'Coaching Signings',
            body: 'No coaching contracts are expiring this offseason. Fire a coach to open a position, then return here.',
            confirmLabel: 'Continue',
          };
        }
        return {
          eyebrow: 'Coaching Staff',
          title: resume ? 'Resume Coaching Signings' : 'Coaching Signings',
          body: `${expiringCoachCount} coaching role${expiringCoachCount === 1 ? '' : 's'} open or expiring. Head coaches typically sign in May–June, right after the season ends.`,
          confirmLabel: resume ? 'Resume' : 'Review Coaching',
        };
      }
      case 'staffSignings': {
        if (expiringStaffCount === 0) {
          return {
            eyebrow: 'Support Staff',
            title: 'Support Staff Signings',
            body: 'No support contracts are expiring this offseason. Fire a staff member to open a position, then return here.',
            confirmLabel: 'Continue',
          };
        }
        return {
          eyebrow: 'Support Staff',
          title: resume ? 'Resume Support Signings' : 'Support Staff Signings',
          body: `${expiringStaffCount} support role${expiringStaffCount === 1 ? '' : 's'} open or expiring. Sports science, physio, scouting, and analytics staff sign in July–August before camp.`,
          confirmLabel: resume ? 'Resume' : 'Review Staff',
        };
      }
    }
  };

  const handleEnter = (row: OffseasonChecklistRow) => {
    // Expansion-Draft im GM-Mode: direkt das Protect-Modal öffnen, weil die
    // Actions-Tab im GM nicht existiert (commissioner-only). Realignment +
    // Add-Team läuft hier statt im ActionsView Confirm-Path.
    if (row === 'expansionDraft' && state.gameMode === 'gm') {
      dispatchAction({ type: 'APPLY_EXPANSION_REALIGNMENT' } as any);
      setExpansionProtectOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'options') {
      // Special-case options: open the existing TeamOptionGateModal in-place
      // instead of navigating away. Mark in-progress so sidebar reflects state.
      setOptionsModalOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'myFAs') {
      // Open the existing ExpiringResignGateModal — same one PlayButton uses
      // when sim is about to cross FA-open. Surfaces every expiring contract
      // with mood + offer suggestion + Make Offer / Reject per row, plus an
      // Assistant GM bulk path. Row marks done when modal closes (useEffect
      // above watches isOpen transitions).
      if (!expiringGate.hasRows) {
        // No expiring contracts at all — auto-complete (nothing to review).
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any);
        return;
      }
      myFAsModalShown.current = true;
      expiringGate.forceOpen();
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'qualifyingOffers') {
      // Open the QO modal in-place. If no eligible R1 rookies expire this
      // year, instantly mark done — there's nothing for the GM to decide.
      if (rfaCandidates.length === 0) {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any);
        return;
      }
      setQoModalOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'coachingSignings') {
      if (expiringCoachCount === 0) {
        openStepConfirm(
          {
            eyebrow: 'Coaching Staff',
            title: 'Coaching Signings',
            body: 'No coaching contracts are expiring this offseason. Fire a coach to open a position, then return here.',
            confirmLabel: 'Continue',
          },
          () => {
            dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'coachingSignings' } } as any);
          },
        );
        return;
      }
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'staffSignings') {
      if (expiringStaffCount === 0) {
        openStepConfirm(
          {
            eyebrow: 'Support Staff',
            title: 'Support Staff Signings',
            body: 'No support contracts are expiring this offseason. Fire a staff member to open a position, then return here.',
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
    if (row === 'sponsorRenewals') {
      // Only auto-complete when (a) no expiring sponsors AND (b) every typed slot
      // (kit/sleeve/back/shorts/training/court/stadium/practice) is filled. Endorsement
      // placeholders are not counted. An empty slot forces the user to enter the flow
      // and either renegotiate, find replacement, or browse the open market.
      const sponsorships = (userTeam as any)?.tycoon?.sponsorships ?? {};
      const TYPED_SLOTS: SponsorshipSlot[] = ['kit', 'sleeve', 'back', 'shorts', 'training', 'court', 'stadium', 'practice'];
      const emptySlotCount = TYPED_SLOTS.filter((s) => !sponsorships[s]).length;
      if (expiredSponsorCount === 0 && emptySlotCount === 0) {
        const activeEndorsements = ((userTeam as any)?.tycoon?.oneTimePayouts ?? []).filter((p: any) => p.kind === 'endorsement').length;
        const endorsementSlotsLeft = Math.max(0, 4 - activeEndorsements);
        openStepConfirm(
          {
            eyebrow: 'Front Office',
            title: 'Sponsorship Review',
            body: endorsementSlotsLeft > 0
              ? `No sponsorship slots expire this year, but you still have ${endorsementSlotsLeft}/4 extra endorsement slot${endorsementSlotsLeft === 1 ? '' : 's'} open for one-year brand campaigns. Review the open market before closing sponsor renewals.`
              : 'All sponsorship slots are active and your four extra endorsement slots are already used for this season.',
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
      setHofCeremonyOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'freeAgency') {
      // Enter FA: deep-link to TeamIntel → Free Agency dashboard, then
      // auto-skip moratorium silently to Tag 1/13. ADVANCE_FA_TAG with
      // counter=0 handles the skip + counter init.
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
    // PBA null-tab rows — auto-complete on Enter (flavor-only for MVP)
    if (row === 'pbaImportDecision' || row === 'pbaMuseSelection' || row === 'pbaOpeningCeremony' || row === 'pbaAllStarWeekend' || row === 'pbaConferenceAwards') {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any);
      return;
    }
    // Calendar-anchored phases: advance to the event date if we're before it
    // so the user lands ON the relevant day instead of staring at June 23.
    const ls = state.leagueStats as any;
    const lsYear = lsYearOf(state);
    if (row === 'draftLottery') {
      simToDateIfBefore(toISODateString(getDraftLotteryDate(lsYear, ls)));
    } else if (row === 'draft') {
      simToDateIfBefore(toISODateString(getDraftDate(lsYear, ls)));
    } else if (row === 'trainingCamp') {
      simToDateIfBefore(getUpcomingTrainingCampISO(state));
    }
    dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
  };
  // Options modal handlers — exercise/decline dispatch existing reducer cases,
  // then mark the options row as done when user clicks Save & Close.
  const handleOptionsAssistant = async () => {
    for (const p of pendingTeamOptions) {
      await dispatchAction({ type: 'EXERCISE_TEAM_OPTION', payload: { playerId: p.internalId } } as any);
    }
    setExercisedIds(new Set());
    setDeclinedIds(new Set());
    setOptionsModalOpen(false);
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'options' } } as any);
  };
  const handleOptionsExerciseOne = async (playerId: string) => {
    await dispatchAction({ type: 'EXERCISE_TEAM_OPTION', payload: { playerId } } as any);
    setExercisedIds(prev => { const n = new Set(prev); n.add(playerId); return n; });
  };
  const handleOptionsDeclineOne = async (playerId: string) => {
    await dispatchAction({ type: 'DECLINE_TEAM_OPTION', payload: { playerId } } as any);
    setDeclinedIds(prev => { const n = new Set(prev); n.add(playerId); return n; });
  };
  const handleOptionsDismiss = () => {
    // If everything got resolved, mark done; otherwise leave as in-progress.
    const totalResolved = exercisedIds.size + declinedIds.size;
    if (totalResolved >= pendingTeamOptions.length && pendingTeamOptions.length > 0) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'options' } } as any);
    }
    setExercisedIds(new Set());
    setDeclinedIds(new Set());
    setOptionsModalOpen(false);
  };
  const handleOptionsManual = () => {
    // "Review Manually" → close modal, navigate to TeamIntel Expiring tab
    setOptionsModalOpen(false);
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: {},  // no-op; navigation happens via setCurrentView caller
    } as any);
  };

  // ── QO modal handlers ──────────────────────────────────────────────────
  const handleQoSubmitOne = (playerId: string) => {
    dispatchAction({ type: 'SUBMIT_QUALIFYING_OFFER', payload: { playerId } } as any);
    setQoSubmittedIds(prev => { const n = new Set(prev); n.add(playerId); return n; });
  };
  const handleQoSkipOne = (playerId: string) => {
    dispatchAction({ type: 'SKIP_QUALIFYING_OFFER', payload: { playerId } } as any);
    setQoSkippedIds(prev => { const n = new Set(prev); n.add(playerId); return n; });
  };
  const handleQoAssistantAll = () => {
    // AI default: submit QO for K2 ≥ 70 (worth retaining), skip below.
    rfaCandidates.forEach(p => {
      const k2 = convertTo2KRating(
        p.overallRating ?? 0,
        (p as any).ratings?.[(p as any).ratings?.length - 1]?.hgt ?? 50,
        (p as any).ratings?.[(p as any).ratings?.length - 1]?.tp ?? 50,
      );
      if (k2 >= 70) {
        handleQoSubmitOne(p.internalId);
      } else {
        handleQoSkipOne(p.internalId);
      }
    });
    setQoModalOpen(false);
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'qualifyingOffers' } } as any);
  };
  const handleQoDismiss = () => {
    const totalDecided = qoSubmittedIds.size + qoSkippedIds.size;
    if (totalDecided >= rfaCandidates.length && rfaCandidates.length > 0) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'qualifyingOffers' } } as any);
    }
    setQoSubmittedIds(new Set());
    setQoSkippedIds(new Set());
    setQoModalOpen(false);
  };

  // ── Rookie Contracts disclaimer — auto-pops once after draft completes ─
  // Mirrors the FA Moratorium heads-up modal pattern in TeamIntelFreeAgency:
  // localStorage flag keyed by save+season so it shows only once per draft.
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

  // List of rookies the user just drafted — for the disclaimer body.
  const userTeamRookies = React.useMemo<NBAPlayer[]>(() => {
    if (state.gameMode !== 'gm' || state.userTeamId == null) return [];
    const currentYear = lsYearOf(state);
    return state.players
      .filter((p: any) => p.tid === state.userTeamId && (p as any).draft?.year === currentYear)
      .sort((a: any, b: any) => ((a as any).draft?.pick ?? 99) - ((b as any).draft?.pick ?? 99));
  }, [state.players, state.userTeamId, state.gameMode, state.leagueStats?.year]);

  // ── Expiring contracts headsup ──────────────────────────────────────────
  // Count user-team players whose contracts expire this year and aren't
  // covered by team options (those have their own gate). If > 0 and we're
  // pre-FA-open, show a banner — they'll walk as UFA if not re-signed.
  // Mirrors the rows logic from useExpiringResignGate (kept inline to
  // avoid coupling the sidebar to the hook's internal state machine).
  const expiringUnsignedCount = React.useMemo(() => {
    if (state.gameMode !== 'gm' || state.userTeamId == null) return 0;
    const currentYear = lsYearOf(state);
    return state.players.filter((p: any) =>
      p.tid === state.userTeamId &&
      p.status === 'Active' &&
      p.contract &&
      (p.contract.exp ?? currentYear) === currentYear &&
      !p.contract.hasTeamOption
    ).length;
  }, [state.gameMode, state.userTeamId, state.players, state.leagueStats?.year]);
  // Only show pre-FA-entry (banner is redundant once FA opens, and stale
  // post-FA where the count would refer to NEXT year's expiring class).
  // FA row 'pending' = haven't entered FA yet → banner is timely.
  // FA row anything else = banner is for a future cycle, hide it.
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

  return (
    <aside className="w-full lg:w-[320px] shrink-0 bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
      <header className="mb-2">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/80 block">
          Offseason
        </span>
        <h2 className="text-base font-black text-white uppercase tracking-tight">
          Tasks
        </h2>
      </header>

      {/* Expiring contracts headsup — clickable banner that deep-links to
          TeamIntel/Expiring where the user can re-sign per row. Renders only
          pre-FA-open since once FA opens those players become regular FAs. */}
      {showExpiringBanner && (
        <button
          onClick={handleExpiringBanner}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/40 hover:bg-rose-500/20 transition-colors text-left"
          title="These players' contracts expire this offseason. Re-sign them before FA opens or they walk as UFA."
        >
          <AlertTriangle size={14} className="text-rose-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-black uppercase tracking-tight text-rose-200">
              {expiringUnsignedCount} expiring contract{expiringUnsignedCount === 1 ? '' : 's'}
            </div>
            <div className="text-[9px] text-rose-300/70">
              May walk as UFA — review before FA opens
            </div>
          </div>
          <ChevronRight size={12} className="text-rose-400/60 shrink-0" />
        </button>
      )}

      <ExpansionSchedulePin />

      <ol className="space-y-1.5">
        {visibleRows.map(row => {
          const status = checklist[row] ?? 'pending';
          const isCurrent = row === currentRow;
          const isResolved = status === 'done' || status === 'skipped';
          // Euro parallel rows expand even when not the currentRow
          const isParallel = isEuroMode && EURO_PARALLEL_ROWS.has(row) && !isResolved;
          const isExpanded = isCurrent || isParallel;
          return (
            <li
              key={row}
              className={`rounded-xl px-3 py-2.5 flex flex-col gap-1 transition-colors ${
                isCurrent
                  ? 'bg-amber-500/10 border border-amber-500/40'
                  : isParallel
                    ? 'bg-sky-500/5 border border-sky-500/20'
                    : 'bg-slate-900/40 border border-slate-800/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {STATUS_ICON[status]}
                  <span
                    className={`text-[11px] font-black uppercase tracking-tight truncate ${
                      isResolved ? 'text-slate-500' : 'text-white'
                    }`}
                  >
                    {OFFSEASON_ROW_LABELS[row]}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {row === 'trainingCamp' && hasTrainingEngagement && !isResolved && (
                    <span
                      title="Training changes detected on your team. Camp still completes by calendar, not by this signal."
                      className="text-[8px] uppercase tracking-widest font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded"
                    >
                      Engaged
                    </span>
                  )}
                  {row === 'sponsorRenewals' && !isResolved && (
                    expiredSponsorCount > 0 ? (
                      <span
                        title={`${expiredSponsorCount} sponsorship slot${expiredSponsorCount === 1 ? '' : 's'} expired and waiting for negotiation`}
                        className="text-[8px] uppercase tracking-widest font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded"
                      >
                        {expiredSponsorCount}/3
                      </span>
                    ) : (
                      <span
                        title="All sponsors active — no renewals needed"
                        className="text-[8px] uppercase tracking-widest font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded"
                      >
                        Active
                      </span>
                    )
                  )}
                  {STATUS_LABEL[status] && (
                    <span className="text-[8px] uppercase tracking-widest font-bold text-slate-500 shrink-0">
                      {STATUS_LABEL[status]}
                    </span>
                  )}
                </div>
              </div>

              {isExpanded && (
                <>
                  <p className="text-[10px] text-slate-400 leading-snug">
                    {OFFSEASON_ROW_DESCRIPTIONS[row]}
                  </p>
                  {/* Transfer Window day counter */}
                  {row === 'transferMarket' && tmWindowCounter && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] font-black uppercase tracking-widest text-sky-400">Transfer Window Day</span>
                      <span className="text-[9px] font-black text-white">{tmWindowCounter.current}/{tmWindowCounter.total}</span>
                      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-400 rounded-full" style={{ width: `${(tmWindowCounter.current / tmWindowCounter.total) * 100}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-1">
                    {!isResolved && (
                      <button
                        onClick={() => openStepConfirm(getStepConfirmSpec(row, status), () => handleEnter(row))}
                        title={status === 'in-progress'
                          ? 'Re-open this offseason task and continue where you left off.'
                          : 'Open this offseason task.'}
                        className="flex-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-widest transition-colors"
                      >
                        {status === 'in-progress' ? 'Resume' : 'Enter'}
                      </button>
                    )}
                    {(row === 'transferMarket' || row === 'sponsorRenewals' || row === 'facilityUpgrades') && !isResolved && (
                      <button
                        onClick={() => dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any)}
                        title="Mark complete without making changes."
                        className="flex-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-bold text-[10px] uppercase tracking-widest transition-colors"
                      >
                        Mark Done
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>

      {/* Auto-resolve all — placed BELOW the row list (away from the mobile
          sheet's X close button up top) to prevent misclicks. Hidden once
          everything is already resolved. */}
      {!isChecklistComplete(checklist, visibleRows) && (
        <button
          onClick={handleAutoResolveAll}
          title="Advance through the remaining offseason phases and land on opening night."
          className="w-full mt-4 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest transition-colors"
        >
          <FastForward size={12} />
          {state.leagueStats?.uiMode === 'pba_isolated' ? 'Skip Remaining Tasks' : 'Sim to Opening Night'}
        </button>
      )}

      {/* All-done banner + prominent advance CTA. Replaces the auto-resolve
          button once everything is checked off — at that point the only
          thing left is to drop into the new season. */}
      {isChecklistComplete(checklist, visibleRows) && (
        <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-emerald-300">
            {state.leagueStats?.uiMode === 'pba_isolated' ? 'Tasks Complete' : 'Offseason Complete'}
          </p>
          <p className="text-[10px] text-emerald-200/80 leading-snug">
            {state.leagueStats?.uiMode === 'pba_isolated'
              ? ((state.leagueStats as any)?.pbaConference === 'governors'
                ? 'All tasks resolved. Start the new PBA season.'
                : 'All tasks resolved. Enter the next conference.')
              : 'All tasks resolved. Drop into preseason and start the new season.'}
          </p>
          <button
            onClick={() => {
              dispatchAction({ type: 'OFFSEASON_EXIT' } as any);
            }}
            className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-widest transition-colors"
          >
            <Sparkles size={12} />
            {state.leagueStats?.uiMode === 'pba_isolated'
              ? ((state.leagueStats as any)?.pbaConference === 'governors' ? 'Enter New Season' : 'Enter Next Conference')
              : 'Enter Preseason'}
          </button>
        </div>
      )}

      {/* Retired Players Review — 2K-style master/detail list of this season's
          retirees with inline HOF + jersey-retirement badges. Pure review:
          Done button dispatches COMPLETE_PHASE; closing via X / backdrop
          leaves the row in-progress. */}
      <RetiredPlayersReviewModal
        isOpen={retiredReviewOpen}
        onClose={() => setRetiredReviewOpen(false)}
      />

      {/* Hall of Fame Ceremony — gold Enshrinement-Weekend modal showing the
          Class of YYYY with career highlights. Calendar-gated so it only
          surfaces in the sidebar from the first Saturday of September. */}
      <HOFCeremonyModal
        isOpen={hofCeremonyOpen}
        onClose={() => setHofCeremonyOpen(false)}
      />

      {/* SponsorshipNegotiationModal — opened from sponsorRenewals offseason row.
          Row only marks COMPLETE when every slot has been resolved (renewed or
          declined to default). Leaving expired slots keeps the row in-progress
          so the user has to come back. */}
      <SponsorshipNegotiationModal
        open={sponsorModalOpen}
        onClose={() => {
          setSponsorModalOpen(false);
          // Re-read latest team state via stateRef equivalent — userTeam is closed-over;
          // re-derive count from current state.teams.
          const latestUser = state.teams.find((t: any) => (t.id ?? t.tid) === state.userTeamId);
          const s = (latestUser as any)?.tycoon?.sponsorships;
          const remainingExpired = s
            ? (['kit', 'sleeve', 'stadium'] as const).reduce((n, k) => n + (s[k] === null ? 1 : 0), 0)
            : 0;
          if (remainingExpired === 0) {
            dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'sponsorRenewals' } } as any);
          }
          // If slots remain expired, leave the row 'in-progress' — user must reopen.
        }}
      />

      <AnnualBudgetReviewModal
        open={budgetReviewOpen}
        team={userTeam as any}
        players={state.players ?? []}
        currentYear={state.leagueStats?.year ?? new Date().getFullYear()}
        currency={state.leagueStats?.currency ?? 'EUR'}
        onClose={() => setBudgetReviewOpen(false)}
        onFinalize={(values: AnnualBudgetReviewValues) => {
          dispatchAction({
            type: 'UPDATE_STATE',
            payload: {
              teams: state.teams.map((team: any) => {
                const tid = team.id ?? team.tid;
                if (tid !== state.userTeamId || !team.tycoon) return team;
                return {
                  ...team,
                  tycoon: {
                    ...team.tycoon,
                    ticketPriceMultiplier: values.ticketPriceMultiplier,
                    travelPreferences: values.travelPreferences,
                    medicalBudget: values.medicalBudget,
                    scoutingInvestment: values.scoutingInvestment,
                    academyBudget: values.academyBudget,
                    budgetLocked: true,
                    budgetLockedYear: state.leagueStats?.year ?? new Date().getFullYear(),
                  },
                };
              }),
              nonNBATeams: (state.nonNBATeams ?? []).map((team: any) => {
                const tid = team.id ?? team.tid;
                if (tid !== state.userTeamId || !team.tycoon) return team;
                return {
                  ...team,
                  tycoon: {
                    ...team.tycoon,
                    ticketPriceMultiplier: values.ticketPriceMultiplier,
                    travelPreferences: values.travelPreferences,
                    medicalBudget: values.medicalBudget,
                    scoutingInvestment: values.scoutingInvestment,
                    academyBudget: values.academyBudget,
                    budgetLocked: true,
                    budgetLockedYear: state.leagueStats?.year ?? new Date().getFullYear(),
                  },
                };
              }),
            },
          } as any);
          setBudgetReviewOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'budgetLock' } } as any);
        }}
      />

      {/* Existing TeamOptionGateModal — second mount-point for offseason flow.
          Same modal PlayButton uses for date-blocking guard, here surfaced as
          a phase entry. */}
      <TeamOptionGateModal
        isOpen={optionsModalOpen}
        players={pendingTeamOptions}
        onAssistant={handleOptionsAssistant}
        onManual={handleOptionsManual}
        onDismiss={handleOptionsDismiss}
        onExerciseOne={handleOptionsExerciseOne}
        onDeclineOne={handleOptionsDeclineOne}
        exercisedIds={exercisedIds}
        declinedIds={declinedIds}
      />

      {/* ExpiringResignGateModal mount — same modal PlayButton uses pre-FA.
          Surfaced here as the My FAs phase entry (forceOpen path). Without
          this mount, expiringGate.forceOpen() toggles state with nothing
          to render, so the row Enter does nothing visible. */}
      {expiringGate.modal}

      {/* Qualifying Offer modal — RFA decision per expiring R1 rookie.
          Submit = retain match rights via Bird for next season's market;
          Skip = let player walk as UFA (no match rights). */}
      <QualifyingOfferModal
        isOpen={qoModalOpen}
        players={rfaCandidates}
        leagueStats={state.leagueStats}
        submittedIds={qoSubmittedIds}
        skippedIds={qoSkippedIds}
        onSubmitOne={handleQoSubmitOne}
        onSkipOne={handleQoSkipOne}
        onAssistant={handleQoAssistantAll}
        onDismiss={handleQoDismiss}
      />

      {/* Youth Promotion modal — opens from the youthPromotion offseason row.
          Shows academy prospects (ages 15-19 on user's team) with K2 OVR/POT.
          Promoting moves them onto the senior roster (regular tid signing flow)
          and any prospect kept stays for another year of academy development. */}
      {youthPromotionOpen && (() => {
        const userTeam = state.teams.find((t: any) => (t.id ?? t.tid) === state.userTeamId)
          ?? (state.nonNBATeams ?? []).find((t: any) => (t.id ?? t.tid) === state.userTeamId);
        const simYear = lsYearOf(state);
        const seniorRosterSize = (state.players ?? []).filter((p: any) =>
          p.tid === state.userTeamId && computeAge(p, simYear) > 19
        ).length;
        const youthPlayers = (state.players ?? [])
          .filter((p: any) => {
            if (p.tid !== state.userTeamId) return false;
            const age = computeAge(p, simYear);
            return age >= 15 && age <= 19;
          })
          .map((p: any) => {
            const r = Array.isArray(p.ratings) ? p.ratings[p.ratings.length - 1] : null;
            const bbgmOvr = p.overallRating ?? r?.ovr ?? 45;
            const bbgmPot = p.pot ?? r?.pot ?? 55;
            return {
              id: p.pid ?? p.internalId ?? p.id,
              name: p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
              pos: p.pos ?? r?.pos ?? '?',
              age: computeAge(p, simYear),
              ovr: convertTo2KRating(bbgmOvr, r?.hgt ?? 50, r?.tp),
              pot: convertTo2KRating(bbgmPot, r?.hgt ?? 50, r?.tp),
              face: p.face,
              imgURL: p.imgURL,
            };
          })
          .sort((a: any, b: any) => b.pot - a.pot);
        const close = () => {
          setYouthPromotionOpen(false);
          dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'youthPromotion' } } as any);
        };
        return createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={close} />
            <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <GraduationCap size={22} className="text-emerald-400" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-300">Offseason · Youth Promotion</p>
                    <h2 className="text-lg font-black text-white uppercase tracking-tight mt-1">{(userTeam as any)?.name ?? 'Academy'} Promotion Window</h2>
                  </div>
                </div>
                <button onClick={close} className="text-slate-400 hover:text-white p-1">
                  <X size={20} />
                </button>
              </div>
              <YouthPromotionPanel
                youthPlayers={youthPlayers}
                slotsAvailable={Math.max(0, 15 - seniorRosterSize)}
                seniorRosterSize={seniorRosterSize}
                maxRosterSize={15}
                onPromote={(ids) => {
                  dispatchAction({
                    type: 'PROMOTE_YOUTH',
                    payload: { playerIds: ids, teamId: state.userTeamId },
                  } as any);
                  close();
                }}
              />
            </div>
          </div>,
          document.body,
        );
      })()}
      {stepConfirm && createPortal(
        <div className="fixed inset-0 z-[121] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={closeStepConfirm} />
          <div className="relative w-full max-w-lg rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300 mb-2">{stepConfirm.eyebrow}</p>
              <h2 className="text-xl font-black uppercase tracking-tight text-white">{stepConfirm.title}</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                {stepConfirm.body}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={closeStepConfirm}
                  className="flex-1 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs py-3 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const action = confirmActionRef.current;
                    closeStepConfirm();
                    action?.();
                  }}
                  className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors"
                >
                  {stepConfirm.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {autoResolveConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[121] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setAutoResolveConfirmOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300 mb-2">
                {state.leagueStats?.uiMode === 'pba_isolated' ? 'Conference Break' : 'Offseason Flow'}
              </p>
              <h2 className="text-xl font-black uppercase tracking-tight text-white">
                {state.leagueStats?.uiMode === 'pba_isolated' ? 'Skip Remaining Tasks' : 'Sim to Opening Night'}
              </h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                {state.leagueStats?.uiMode === 'pba_isolated'
                  ? 'This skips remaining tasks and advances to the next conference.'
                  : 'This advances the remaining offseason phases in order and lands on opening night with the new season ready to start.'}
              </p>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2 text-sm text-slate-400">
                {state.leagueStats?.uiMode === 'pba_isolated' ? (
                  <>
                    <p>• remaining tasks are auto-completed</p>
                    <p>• games begin immediately in the next conference</p>
                  </>
                ) : (
                  <>
                    <p>• free agency, training camp, and late offseason cleanup continue automatically</p>
                    <p>• in GM mode, AI keeps hands off your user-team roster decisions</p>
                    <p>• roster compliance still has to be satisfied before the season can proceed</p>
                  </>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setAutoResolveConfirmOpen(false)}
                  className="flex-1 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs py-3 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setAutoResolveConfirmOpen(false);
                    dispatchAction({ type: 'OFFSEASON_AUTO_RESOLVE_ALL' } as any);
                  }}
                  className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors"
                >
                  {state.leagueStats?.uiMode === 'pba_isolated' ? 'Skip All' : 'Sim to Opening Night'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Rookie Contracts auto-disclaimer — fires once after draft completes.
          Mirrors the FA Moratorium heads-up modal styling. */}
      {rookieDisclaimerOpen && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={dismissRookieDisclaimer} />
          <div className="relative w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]">
              <h2 className="text-lg font-black uppercase tracking-tight text-white">Rookie Contracts Signed</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                Per the NBA CBA, your <span className="font-black text-amber-300">first-round picks</span> are signed automatically to the standard rookie scale — guaranteed contracts, 2 years + 2 team option years. There's no decline option.
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">
                Your <span className="font-black text-amber-300">second-round picks</span> are signed to non-guaranteed deals by default. They count against the roster but you can waive them before the <span className="font-black text-amber-300">January 10 NG guarantee deadline</span> for a free release — no dead money.
              </p>
              {userTeamRookies.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/10 max-h-40 overflow-y-auto">
                  {userTeamRookies.map((p: any) => {
                    const round = p.draft?.round;
                    const pick = p.draft?.pick;
                    const isR1 = round === 1;
                    return (
                      <div key={p.internalId} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white truncate">{p.name}</div>
                          <div className="text-[10px] text-slate-500">
                            R{round} #{pick} · {isR1 ? 'Guaranteed (rookie scale)' : 'Non-guaranteed'}
                          </div>
                        </div>
                        <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded ${isR1 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                          {isR1 ? 'GUARANTEED' : 'NG'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                onClick={dismissRookieDisclaimer}
                className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* GM-Mode Expansion-Modals — gemountet aus der Sidebar, weil im GM-Mode
          die Actions-Tab nicht existiert. fixed-positioning sorgt dafür, dass
          sie unabhängig vom <aside> über dem ganzen Viewport rendern. */}
      {expansionProtectOpen && (
        <PlayerProtectionModal
          onClose={() => setExpansionProtectOpen(false)}
          onConfirm={async (protections) => {
            setExpansionProtectOpen(false);
            await dispatchAction({ type: 'SET_EXPANSION_PROTECTIONS', payload: { protections } } as any);
            setExpansionDraftViewOpen(true);
          }}
        />
      )}
      {expansionDraftViewOpen && (
        <ExpansionDraftView
          onClose={() => {
            setExpansionDraftViewOpen(false);
            // Bei vollständigem Draft markiert ExpansionDraftView selbst die
            // Row als done (via EXPANSION_DRAFT_COMPLETE). Hier nur das Modal
            // schließen.
          }}
        />
      )}
    </aside>
  );
};

// ─── Qualifying Offer modal ────────────────────────────────────────────────
// Mirrors TeamOptionGateModal layout for visual consistency. Each row shows
// the player's last salary + projected QO amount (≈ max(lastSalary × 1.3,
// leagueMin × 1.5) — the NBA QO formula is more complex but this captures
// the right magnitude). Default recommendation: Submit for K2 ≥ 70.

interface QualifyingOfferModalProps {
  isOpen: boolean;
  players: NBAPlayer[];
  leagueStats: any;
  submittedIds: Set<string>;
  skippedIds: Set<string>;
  onSubmitOne: (playerId: string) => void;
  onSkipOne: (playerId: string) => void;
  onAssistant: () => void;
  onDismiss: () => void;
}

const QualifyingOfferModal: React.FC<QualifyingOfferModalProps> = ({
  isOpen, players, leagueStats, submittedIds, skippedIds,
  onSubmitOne, onSkipOne, onAssistant, onDismiss,
}) => {
  const computeQOAmount = (p: NBAPlayer): number => {
    const lastSalaryUSD = (p.contract?.amount ?? 0) * 1_000;
    const rawMin = leagueStats?.minContract ?? 1.273;
    const minSalaryUSD = rawMin > 1000 ? rawMin : rawMin * 1_000_000;
    return Math.max(Math.round(lastSalaryUSD * 1.3), Math.round(minSalaryUSD * 1.5));
  };
  const fmtUSD = (n: number) => n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : `$${(n / 1_000).toFixed(0)}K`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={onDismiss}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-[#0f0f0f] border border-fuchsia-500/30 rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-fuchsia-500/[0.05]">
              <div className="flex items-center gap-3">
                <FileSignature className="w-5 h-5 text-fuchsia-400" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Qualifying Offers</h3>
              </div>
              <button onClick={onDismiss} className="text-slate-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-300 mb-4">
                Submit a qualifying offer to make this expiring R1 rookie a <span className="font-black text-fuchsia-300">restricted free agent</span> — you keep match rights when other teams come calling. Skip = he walks as UFA.
              </p>
              {players.length === 0 ? (
                <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center text-sm text-emerald-200 font-bold">
                  No expiring R1 rookies on your roster — nothing to submit.
                </div>
              ) : (
                <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/10 max-h-60 overflow-y-auto">
                  {players.map(p => {
                    const submitted = submittedIds.has(p.internalId);
                    const skipped = skippedIds.has(p.internalId);
                    const decided = submitted || skipped;
                    const qoUSD = computeQOAmount(p);
                    const r = (p as any).ratings?.[(p as any).ratings?.length - 1];
                    const k2 = convertTo2KRating(p.overallRating ?? 0, r?.hgt ?? 50, r?.tp ?? 50);
                    return (
                      <div key={p.internalId} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white truncate">{p.name}</div>
                          <div className="text-[10px] text-slate-500">K2 {k2} · QO {fmtUSD(qoUSD)} / 1yr</div>
                        </div>
                        {decided ? (
                          <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2 py-1 ${submitted ? 'text-fuchsia-300' : 'text-rose-400'}`}>
                            {submitted ? 'Submitted' : 'Skipped'}
                          </span>
                        ) : (
                          <div className="shrink-0 flex items-center gap-1.5">
                            <button
                              onClick={() => onSubmitOne(p.internalId)}
                              className="px-2 py-1 bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-fuchsia-500/30"
                            >
                              Submit
                            </button>
                            <button
                              onClick={() => onSkipOne(p.internalId)}
                              className="px-2 py-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-rose-500/30"
                            >
                              Skip
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {(() => {
                  const total = players.length;
                  const decidedCount = players.filter(p => submittedIds.has(p.internalId) || skippedIds.has(p.internalId)).length;
                  const allDone = total === 0 || decidedCount === total;
                  if (allDone) {
                    return (
                      <button
                        onClick={onDismiss}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                      >
                        <CheckCircle size={14} />
                        Done
                      </button>
                    );
                  }
                  return (
                    <button
                      onClick={onAssistant}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-fuchsia-500 hover:bg-fuchsia-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                    >
                      <Bot size={14} />
                      Assistant GM: Submit Worth Keeping (K2 ≥ 70)
                    </button>
                  );
                })()}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ─── FA Tag Footer — sticky "FREE AGENCY · TAG X/13 · End Day" bar ────────
//
// Renders globally during the Free Agency phase. Shows the Tag counter +
// a big "End Day" button that advances ~5 calendar days under the hood
// via the existing SIMULATE_TO_DATE / lazy-sim path. The user never sees
// raw calendar dates during FA — just Tag X/13.

export const OffseasonFATagFooter: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const confirmActionRef = useRef<(() => void) | null>(null);
  const [confirmSpec, setConfirmSpec] = useState<OffseasonConfirmSpec | null>(null);
  // Visible only when FA phase is active and the tag counter has been init'd.
  if (!state.offseasonChecklist) return null;
  const faStatus = state.offseasonChecklist.freeAgency;
  if (faStatus !== 'pending' && faStatus !== 'in-progress') return null;
  const counter = state.faTagCounter ?? 0;
  const total = state.faTagsTotal ?? 13;
  if (counter === 0) return null;
  if (!state.date) return null;
  const os = getOffseasonState(state.date, state.leagueStats as any, state.schedule as any);
  if (os.phase !== 'moratorium' && os.phase !== 'birdRights' && os.phase !== 'openFA') return null;

  const isLast = counter >= total;
  const openConfirm = (spec: OffseasonConfirmSpec, action: () => void) => {
    confirmActionRef.current = action;
    setConfirmSpec(spec);
  };
  const closeConfirm = () => {
    confirmActionRef.current = null;
    setConfirmSpec(null);
  };
  const handleEndDay = () => {
    dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
  };
  // "To Training Camp" — escape hatch: marks FA done and advances calendar
  // to training-camp start (Sept 29). DOES NOT exit offseason — user still
  // has the trainingCamp row to engage. Previously called handleToPreseason
  // and dispatched OFFSEASON_EXIT, which jumped users PAST training camp on
  // FA Day 1/13 — they wanted to just skip remaining FA days, not the entire
  // offseason flow.
  const handleToTrainingCamp = () => {
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'freeAgency' } } as any);
    const campStartISO = getUpcomingTrainingCampISO(state);
    const todayNorm = state.date ? normalizeDate(state.date) : '';
    if (todayNorm && todayNorm < campStartISO) {
      dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: campStartISO, stopBefore: true },
      } as any);
    }
  };

  // Pending RFA decisions — when other teams submit offer sheets to YOUR
  // RFA players, those markets sit in pendingMatch state until the user
  // dispatches MATCH_RFA_OFFER or DECLINE_RFA_OFFER. Surface a badge so
  // the user notices instead of relying solely on toasts.
  const userTid = state.userTeamId ?? -999;
  const pendingMatchCount = (state.faBidding?.markets ?? []).filter((m: any) =>
    m.pendingMatch && !m.resolved && m.pendingMatchPriorTid === userTid
  ).length;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[170] flex items-center justify-center pointer-events-none px-4 pb-3">
      <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-950/95 border border-amber-500/40 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col leading-none">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-300/80">
            Free Agency
          </span>
          <span className="text-sm font-black text-white tabular-nums uppercase tracking-tight">
            Day {counter}/{total}
          </span>
        </div>
        {pendingMatchCount > 0 && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-200 font-black text-[10px] uppercase tracking-widest animate-pulse"
            title="One or more of your RFA players has a pending offer sheet — match or decline via toast"
          >
            <FileSignature size={11} />
            {pendingMatchCount} RFA to match
          </div>
        )}
        <button
          onClick={() => openConfirm(
            {
              eyebrow: 'Offseason Flow',
              title: isLast ? 'Complete Free Agency' : 'Advance Free Agency Day',
              body: isLast
                ? 'This resolves the final free agency day and closes out the free agency step.'
                : 'This advances free agency forward and resolves the next batch of offers, signings, and RFA outcomes.',
              confirmLabel: isLast ? 'Complete Free Agency' : 'End Day',
            },
            handleEndDay,
          )}
          disabled={state.isProcessing || pendingMatchCount > 0}
          title={pendingMatchCount > 0 ? 'Resolve pending RFA offer sheets before advancing.' : 'Advance ~5 days, AI signings + RFA matches resolve.'}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors ${
            state.isProcessing || pendingMatchCount > 0
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : isLast
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-amber-500 hover:bg-amber-400 text-black'
          }`}
        >
          <FastForward size={12} />
          {isLast ? 'Complete Free Agency' : 'End Day'}
        </button>
        {!isLast && (
          <button
            onClick={() => openConfirm(
              {
                eyebrow: 'Offseason Flow',
                title: 'Skip to Training Camp',
                body: 'This skips the remaining free agency days, marks free agency complete, and advances to training camp start. Use it only if you are done with the current market.',
                confirmLabel: 'To Training Camp',
              },
              handleToTrainingCamp,
            )}
            disabled={state.isProcessing || pendingMatchCount > 0}
            title="Skip the remaining FA days, mark Free Agency complete, and advance to training camp start (Sept 29). You still need to engage training camp before opening night."
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors border ${
              state.isProcessing || pendingMatchCount > 0
                ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                : 'bg-emerald-600/20 hover:bg-emerald-500/30 text-emerald-200 border-emerald-500/40'
            }`}
          >
            <Sparkles size={12} />
            To Training Camp
          </button>
        )}
      </div>
      {confirmSpec && createPortal(
        <div className="fixed inset-0 z-[171] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={closeConfirm} />
          <div className="relative w-full max-w-lg rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300 mb-2">{confirmSpec.eyebrow}</p>
              <h2 className="text-xl font-black uppercase tracking-tight text-white">{confirmSpec.title}</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                {confirmSpec.body}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={closeConfirm}
                  className="flex-1 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs py-3 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const action = confirmActionRef.current;
                    closeConfirm();
                    action?.();
                  }}
                  className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors"
                >
                  {confirmSpec.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

// ─── Transfer Market footer — Euro-only sticky "Sim Day" bar ───────────────
// Mirrors OffseasonFATagFooter. Shows during Euro offseason while the
// transferMarket row is pending/in-progress and the window is open. Advances
// one calendar day per click, which triggers the daily transferMarketTicker
// inside simulationHandler (AI bids, accepts, expiries).

export const OffseasonTransferMarketFooter: React.FC = () => {
  const { state, dispatchAction } = useGame();
  if (!state.offseasonChecklist) return null;
  if (state.leagueStats?.uiMode !== 'euro_isolated') return null;
  const status = state.offseasonChecklist.transferMarket;
  if (status !== 'pending' && status !== 'in-progress') return null;
  if (!state.date) return null;

  const ws = isInTransferWindow(state.date, state.leagueStats);
  if (!ws.open || !ws.currentClose) return null;
  const todayIso = typeof state.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.date)
    ? state.date
    : new Date(state.date as any).toISOString().slice(0, 10);
  const closeIso = ws.currentClose.toISOString().slice(0, 10);
  const msPerDay = 86_400_000;
  const daysLeft = Math.max(0, Math.round((new Date(closeIso).getTime() - new Date(todayIso).getTime()) / msPerDay));
  const total = ws.window === 'summer' ? 92 : 31;
  const current = Math.max(1, total - daysLeft + 1);
  const isLast = daysLeft <= 0;

  const handleSimDay = () => {
    dispatchAction({ type: 'ADVANCE_DAY' } as any);
  };
  const handleComplete = () => {
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'transferMarket' } } as any);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[170] flex items-center justify-center pointer-events-none px-4 pb-3">
      <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-950/95 border border-sky-500/40 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col leading-none">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-sky-300/80">
            Transfer Window
          </span>
          <span className="text-sm font-black text-white tabular-nums uppercase tracking-tight">
            Day {current}/{total}
          </span>
        </div>
        <button
          onClick={handleSimDay}
          disabled={state.isProcessing || isLast}
          title="Advance one day — AI clubs evaluate listings, place bids, accept offers."
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors ${
            state.isProcessing || isLast
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-sky-500 hover:bg-sky-400 text-black'
          }`}
        >
          <FastForward size={12} />
          Sim Day
        </button>
        <button
          onClick={handleComplete}
          disabled={state.isProcessing}
          title="Mark transfer market complete and continue with the offseason."
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors border ${
            state.isProcessing
              ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
              : 'bg-emerald-600/20 hover:bg-emerald-500/30 text-emerald-200 border-emerald-500/40'
          }`}
        >
          <CheckCircle size={12} />
          Mark Done
        </button>
      </div>
    </div>
  );
};

// ─── Training Camp footer ──────────────────────────────────────────────────
// Shows while trainingCamp row is pending/in-progress. Auto-hides once the
// calendar advances past camp start (the sidebar effect fires OFFSEASON_COMPLETE_PHASE).

export const OffseasonTrainingCampFooter: React.FC = () => {
  const { state, dispatchAction } = useGame();
  if (!state.offseasonChecklist) return null;
  if (state.leagueStats?.uiMode === 'euro_isolated') return null;
  const status = state.offseasonChecklist.trainingCamp;
  if (status !== 'pending' && status !== 'in-progress') return null;

  const userTid = state.userTeamId ?? -999;
  const rosterSize = (state.players ?? []).filter((p: any) => p.tid === userTid && !p.gLeagueAssigned).length;
  const target = state.leagueStats?.maxStandardPlayersPerTeam ?? 15;
  const needsTrim = rosterSize > target;

  const handleComplete = () => {
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'trainingCamp' } } as any);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[170] flex items-center justify-center pointer-events-none px-4 pb-3">
      <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-950/95 border border-sky-500/40 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col leading-none">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-sky-300/80">Training Camp</span>
          <span className="text-sm font-black text-white tabular-nums uppercase tracking-tight">
            {rosterSize}/{target} roster
          </span>
        </div>
        {needsTrim && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-200 font-black text-[10px] uppercase tracking-widest">
            Trim to {target}
          </div>
        )}
        <button
          onClick={handleComplete}
          disabled={needsTrim || state.isProcessing}
          title={needsTrim ? `Cut roster to ${target} before completing training camp.` : 'Complete training camp and open the regular season.'}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors ${
            needsTrim || state.isProcessing
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-sky-600 hover:bg-sky-500 text-white'
          }`}
        >
          Complete Training Camp
        </button>
      </div>
    </div>
  );
};

// ─── Mobile-only floating sheet: AUFGABEN access on small screens ──────────
// Desktop has the rail in App.tsx; mobile gets a bottom-right floating
// button that opens a slide-over sheet with the same sidebar inside.

export const OffseasonAufgabenMobileSheet: React.FC = () => {
  const { state } = useGame();
  const [open, setOpen] = useState(false);
  if (!state.offseasonChecklist) return null;

  const checklist = state.offseasonChecklist;
  const remaining = (Object.values(checklist) as string[]).filter(s => s === 'pending' || s === 'in-progress').length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-[180] flex items-center gap-2 px-4 py-3 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-widest shadow-2xl transition-colors"
      >
        <ListChecks size={14} />
        Offseason · {remaining} left
      </button>
      {open && (
        <div className="lg:hidden fixed inset-0 z-[190] flex">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative ml-auto h-full w-[320px] max-w-[88vw] bg-slate-950 border-l border-slate-800 overflow-y-auto scrollbar-hide p-3">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <X size={14} />
            </button>
            <OffseasonAufgabenSidebar />
          </div>
        </div>
      )}
    </>
  );
};
