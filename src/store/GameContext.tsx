import React, { createContext, useContext, useState, ReactNode, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { GameState, UserAction, Tab, Bet, BetLeg, NBAPlayer } from '../types';
import { processTurn, handleStartGame, handleAnnounceChange } from './logic/gameLogic';
import { useGameActions } from './useGameActions';
import { migrateAllEuroTeams } from '../services/tycoon/migrate';
import { initialState } from './initialState';
import { sendChatMessage } from '../services/llm/llm';
import { prefetchPlayerBio } from '../components/central/view/bioCache';
import { SettingsManager } from '../services/SettingsManager';
import { initImageCache } from '../services/imageCache';
import { normalizeDate } from '../utils/helpers';
import { setActiveSaveId } from './gameplanStore';
import { setActiveSaveId as setTradingBlockSaveId } from './tradingBlockStore';
import { setActiveSaveId as setScoringOptionsSaveId } from './scoringOptionsStore';
import { setActiveSaveId as setCoachStrategySaveId } from './coachStrategyLockStore';
import { setActiveSaveId as setIdealRotationSaveId } from './idealRotationStore';
import { setActiveSaveId as setCoachSystemSaveId } from './coachSystemStore';
import { setActiveSaveId as setDefenseGameplanSaveId } from './defenseGameplanStore';
import { setActiveSaveId as setMatchupAssignmentsSaveId } from './matchupAssignmentsStore';
import { setActiveSaveId as setDefenderDetailSaveId } from './defenderDetailStore';
import { setRefereeData } from '../data/photos/referees';
import { setActiveSaveId as setRivalGameplanSaveId } from './rivalGameplanStore';
import { enforceExternalMinRoster, repairGeneratedExternalPlayer } from '../services/externalLeagueSustainer';
import { applyCupAwardsToPlayers } from '../services/nbaCup/awards';
import { defaultAwardSettings } from '../services/awards/AwardEngine';
import { computeRookieSalaryUSD } from '../utils/rookieContractUtils';
import { generateAIBids, isPlausibleActiveMarket, MAX_FA_MARKET_DECISION_WINDOW_DAYS } from '../services/freeAgencyBidding';
import { setAssistantGMActive } from '../services/assistantGMFlag';
import { getCurrentOffseasonEffectiveFAStart, getCurrentOffseasonFAMoratoriumEnd, getDraftDate, getTrainingCampDate, parseGameDate, toISODateString } from '../utils/dateUtils';
import { clearWaiverMarkers, hasLiveContractAfterWaive, stripLiveContractAfterWaive } from '../utils/contractCleanup';
import { repairBirdRightsForLoadedPlayer } from '../utils/playerBirdRights';
import { resolveAnyTeam } from '../utils/teamLookup';
import {
  defaultOffseasonChecklist,
  initialPreseasonChecklist,
  setRowStatus,
  OFFSEASON_ROW_TAB,
  getOffseasonState,
  computeUpcomingSeasonYear,
  isNoDraftLeague,
} from '../services/offseason/offseasonState';
import type { OffseasonChecklist, OffseasonChecklistRow } from '../types';
import { SEED_2029_TEAMS, SEED_2029_YEAR, SEED_2029_SETTINGS, ZENGM_2029_REALIGNMENT } from '../data/expansion2029';

interface GameContextType {
  state: GameState;
  dispatchAction: (action: UserAction) => Promise<void>;
  markEmailRead: (id: string) => void;
  clearOutcome: () => void;
  saveSocialThread: (postId: string, replies: any[]) => void;
  toggleLike: (postId: string) => void;
  toggleRetweet: (postId: string) => void;
  markSocialRead: () => void;
  markNewsRead: () => void;
  markChatRead: (chatId: string) => void;
  followUser: (handle: string) => void;
  unfollowUser: (handle: string) => void;
  markPayslipsRead: () => void;
  currentView: Tab;
  setCurrentView: (view: Tab) => void;
  selectedTeamId: number | null;
  setSelectedTeamId: (id: number | null) => void;
  navigateToTeam: (teamId: number) => void;
  navigateToTeamFinances: (teamId: number) => void;
  pendingStatSort: { type: 'player' | 'team'; field: string; order: 'asc' | 'desc' } | null;
  setPendingStatSort: (sort: { type: 'player' | 'team'; field: string; order: 'asc' | 'desc' } | null) => void;
  placeBet: (bet: { type: Bet['type']; wager: number; potentialPayout: number; legs: BetLeg[] }) => void;
  updatePlayerRatings: (playerId: string, season: number, ratings: Record<string, number>) => void;
  createPlayer: (player: import('../types').NBAPlayer) => void;
  healPlayer: (playerId: string) => void;
  updateProfile: (profile: Partial<import('../types').UserProfile>) => void;
  addPost: (post: import('../types').SocialPost) => void;
  addReply: (postId: string, reply: import('../types').SocialPost) => void;
  generateReplies: (postId: string) => Promise<void>;
  isGeneratingReplies: Record<string, boolean>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<GameState>(initialState);
  const [currentView, setCurrentView] = useState<Tab>('Schedule');
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [pendingStatSort, setPendingStatSort] = useState<{ type: 'player' | 'team'; field: string; order: 'asc' | 'desc' } | null>(null);
  const generationIdRef = useRef(0);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
    // Expose live state for debug cheats (SPAM/WARP/STUCK need post-dispatch snapshots).
    (window as any).__nbaGetLiveState = () => stateRef.current;
  }, [state]);

  useEffect(() => {
    setActiveSaveId(state.saveId);
    setTradingBlockSaveId(state.saveId);
    setScoringOptionsSaveId(state.saveId);
    setCoachStrategySaveId(state.saveId);
    setIdealRotationSaveId(state.saveId);
    setCoachSystemSaveId(state.saveId);
    setDefenseGameplanSaveId(state.saveId);
    setMatchupAssignmentsSaveId(state.saveId);
    setDefenderDetailSaveId(state.saveId);
    setRivalGameplanSaveId(state.saveId);
  }, [state.saveId]);

  // Set default view for GM mode when game first loads
  useEffect(() => {
    if (state.isDataLoaded && state.gameMode === 'gm' && currentView === 'Schedule') {
      setCurrentView('Team Office');
    }
  }, [state.isDataLoaded, state.gameMode]);

  // ── Offseason 2K-style checklist auto-lifecycle ────────────────────────
  // Lazy-init when calendar enters an offseason phase (anything besides
  // 'inSeason'); tear down when calendar returns to 'inSeason'. GM mode only
  // — commissioners see the regular calendar UI. Skipped if state isn't
  // loaded yet to avoid spurious init during game-start.
  useEffect(() => {
    if (!state.isDataLoaded) return;
    if (state.gameMode !== 'gm') return;
    if (!state.date) return;
    // Pass playoffsActive signal so bracketComplete inside the offseason
    // calendar window correctly flips us out of 'inSeason' (Finals overrun).
    const playoffsActive = !!(state.playoffs?.series ?? []).some(
      (s: any) => s.status !== 'complete',
    );
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
    // Offseason mode triggers ONLY post-Finals (phase != inSeason). Lottery
    // happens mid-May during playoffs, but the sidebar should not appear until
    // the bracket completes — otherwise the user is staring at offseason tasks
    // while still managing playoff rotations.
    const inOffseason = phase !== 'inSeason';
    // Suppress re-creation if the user manually exited the offseason this
    // calendar year (clicked "Enter Preseason"). We compare against cYear,
    // not lsYear: the initial Aug preseason and the post-Finals Jun-Oct
    // offseason of the FOLLOWING calendar year both share the same lsYear
    // pre-rollover — using lsYear would let an Aug exit suppress the next
    // year's Finals→draft offseason gate too.
    const cYearForExit = state.date ? new Date(state.date).getUTCFullYear() : 0;
    const userManuallyExited = state.offseasonExitedYear === cYearForExit;
    // Initial-start mode: stale BBGM imports load straight into the calendar
    // offseason window (Aug preseason) of their starting season. That season's
    // offseason already happened in real life — show the gate but with only
    // Training Camp actionable; everything else is marked skipped. Detected
    // via empty seasonHistory (populated on bracketComplete, so empty = no
    // completed in-sim season yet).
    const isInitialFirstSeason = !state.seasonHistory || state.seasonHistory.length === 0;
    // Tear-down condition: only when calendar is past opening night AND no
    // pending checklist activity (avoid wiping the user's mid-FA progress).
    const isFullyInSeason = phase === 'inSeason' && !inOffseason;
    const hasChecklist = !!state.offseasonChecklist;
    // Real-offseason signal: lottery resolved + draft not yet executed = the
    // post-Finals window is live (lottery fires May 14 via lazy sim during
    // playoffs, draft fires ~Jun 26). When this is true, the gate must show
    // the FULL checklist regardless of what mode it's currently in — and
    // the userManuallyExited flag is ignored, because exiting the initial
    // Aug preseason should not suppress the post-Finals offseason that
    // arrives months later in the same calendar year.
    const noDraftLeague = isNoDraftLeague(state.leagueStats);
    const lotteryResolved = noDraftLeague || !!(state.draftLotteryResult && state.draftLotteryResult.length > 0);
    const draftNotDone = !noDraftLeague && !state.draftComplete;
    const isRealOffseasonNow = lotteryResolved && draftNotDone;
    // Hard guarantee: if calendar is on/past dynamic draft date AND draft
    // not done → force the gate. Catches edge cases where lottery state is
    // missing/stale (e.g. user simulated past lottery without lazy sim
    // firing it, or draftLotteryResult got cleared somewhere).
    //
    // Upper-bound guard: forceGate must NOT fire once the calendar has
    // entered the training-camp window. Post-rollover (Jul–Dec) the computed
    // draftSeasonYear=cYear references the *past* June draft whose
    // draftComplete flag was wiped by seasonRollover — without this guard,
    // every Oct preseason save would re-create the offseason checklist
    // forever (lottery+draft can never auto-flip → stuck pending).
    let forceGate = false;
    let pastTrainingCampOpen = false;
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
      pastTrainingCampOpen = !!todayStr && !!campStr && todayStr >= campStr;
      forceGate = !noDraftLeague && !!todayStr && !!draftStr && todayStr >= draftStr && !state.draftComplete && !pastTrainingCampOpen;
    } catch {}
    if (inOffseason && !hasChecklist && (!userManuallyExited || isRealOffseasonNow || forceGate)) {
      const checklist = isInitialFirstSeason && !isRealOffseasonNow
        ? initialPreseasonChecklist()
        : defaultOffseasonChecklist(state.leagueStats);
      setState(prev => ({ ...prev, offseasonChecklist: checklist }));
    } else if (inOffseason && hasChecklist && pastTrainingCampOpen && !isRealOffseasonNow) {
      // Stale-save recovery: checklist exists in the camp window with
      // pre-camp rows still pending/in-progress, and engine state has no
      // live offseason signal (lottery+draft cleared by rollover months
      // ago). Force-skip every pre-camp row so the checklist completes
      // and the user can click "Enter Preseason" without being stuck.
      const c = state.offseasonChecklist!;
      const isUnresolved = (s: any) => s === 'pending' || s === 'in-progress';
      const preCampRows: OffseasonChecklistRow[] = [
        'draftLottery', 'options', 'qualifyingOffers', 'myFAs',
        'draft', 'rookieContracts', 'freeAgency',
      ];
      const hasStalePreCamp = preCampRows.some(r => isUnresolved(c[r]));
      if (hasStalePreCamp) {
        const next: OffseasonChecklist = { ...c };
        for (const r of preCampRows) {
          if (isUnresolved((next as any)[r])) (next as any)[r] = 'skipped';
        }
        setState(prev => ({ ...prev, offseasonChecklist: next }));
      }
    } else if (inOffseason && hasChecklist && noDraftLeague) {
      const c = state.offseasonChecklist!;
      const next: OffseasonChecklist = { ...c };
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
    } else if (inOffseason && hasChecklist && isRealOffseasonNow) {
      // Upgrade-path: stale initial-preseason checklist (rows skipped from
      // a prior initial cycle) must promote to the full default checklist
      // now that lottery is done + draft is pending. Otherwise the user
      // sees stale 'skipped' rows that should be 'pending' for this cycle.
      const c = state.offseasonChecklist!;
      // ANY non-camp row marked 'skipped' = leftover from initial mode.
      // Default checklist never has these as skipped (auto-sync only marks
      // 'done', never 'skipped').
      const hasInitialModeArtifacts =
        c.myFAs === 'skipped' || c.freeAgency === 'skipped' ||
        c.qualifyingOffers === 'skipped' || c.options === 'skipped';
      // Camp wrongly marked done outside the camp window (Sept 29 - Oct 20).
      // Pre-camp June saves can have this from a hasTrainingEngagement flip
      // that fired before the window-gate fix.
      const cMonthNow = new Date(state.date).getUTCMonth() + 1;
      const cDayNow = new Date(state.date).getUTCDate();
      const isInCampWindowNow = (cMonthNow === 9 && cDayNow >= 29) || (cMonthNow === 10 && cDayNow <= 20);
      const campWronglyDone = c.trainingCamp === 'done' && !isInCampWindowNow && cMonthNow < 10;
      if (hasInitialModeArtifacts || campWronglyDone) {
        // Preserve genuine progress (draftLottery=done from auto-sync,
        // user-completed rows in this cycle) but reset stale flags.
        const fresh = defaultOffseasonChecklist(state.leagueStats);
        setState(prev => ({
          ...prev,
          offseasonChecklist: {
            ...fresh,
            draftLottery: c.draftLottery === 'done' ? 'done' : fresh.draftLottery,
            draft: c.draft === 'done' ? 'done' : fresh.draft,
          },
        }));
      }
    } else if (inOffseason && hasChecklist && isInitialFirstSeason && !isRealOffseasonNow) {
      // Migrate stale saves: pre-existing checklist created by older code
      // (everything pending) needs to flip to initial-preseason mode where
      // only Training Camp is actionable. Detect by: any non-trainingCamp row
      // still 'pending' (initial mode marks them all 'skipped').
      const c = state.offseasonChecklist!;
      const needsMigration =
        c.draftLottery === 'pending' || c.options === 'pending' ||
        c.qualifyingOffers === 'pending' || c.myFAs === 'pending' ||
        c.draft === 'pending' || c.rookieContracts === 'pending' ||
        c.freeAgency === 'pending';
      if (needsMigration) {
        setState(prev => ({ ...prev, offseasonChecklist: initialPreseasonChecklist() }));
      }
    } else if (isFullyInSeason && hasChecklist) {
      setState(prev => ({
        ...prev,
        offseasonChecklist: undefined,
        faTagCounter: undefined,
        pendingOfferDecisions: [],
      }));
    }
  }, [state.isDataLoaded, state.gameMode, state.date, state.offseasonChecklist, state.playoffs, state.draftComplete, state.draftLotteryResult, state.offseasonExitedYear, state.leagueStats?.year, state.leagueStats?.draftType, state.seasonHistory]);

  // ── Auto-2029-Expansion-Seed (BBGM Real-Player-Mode Default) ─────────────
  // Setzt einmalig pro Save ein Seattle-+Vegas-Schedule für Saison 2029, sobald
  // ein Game läuft. Cancel via X-Button im Sidebar-Pin setzt das Seed-Flag,
  // damit der Effect nicht erneut feuert. Skipped wenn Save bereits ≥2029 ist.
  useEffect(() => {
    if (!state.isDataLoaded) return;
    if (state.leagueStats?.auto2029ExpansionSeeded) return;
    if (state.expansionSchedule) return;
    // Expansion drafts are NBA-only. Don't seed phantom Seattle/Vegas expansion
    // in Euro-Isolated saves — those clubs aren't part of the Endesa league at all.
    if (state.leagueStats?.uiMode === 'euro_isolated') {
      setState(prev => ({
        ...prev,
        leagueStats: prev.leagueStats
          ? { ...prev.leagueStats, auto2029ExpansionSeeded: true }
          : prev.leagueStats,
      }));
      return;
    }
    const lsYear = state.leagueStats?.year;
    if (lsYear == null || lsYear >= SEED_2029_YEAR) {
      // Save ist schon ≥2029 — Flag setzen ohne Schedule
      setState(prev => ({
        ...prev,
        leagueStats: prev.leagueStats
          ? { ...prev.leagueStats, auto2029ExpansionSeeded: true }
          : prev.leagueStats,
      }));
      return;
    }
    setState(prev => ({
      ...prev,
      expansionSchedule: {
        year: SEED_2029_YEAR,
        teams: SEED_2029_TEAMS,
        realignment: ZENGM_2029_REALIGNMENT,
      },
      expansionProtectionSettings: SEED_2029_SETTINGS,
      leagueStats: prev.leagueStats
        ? { ...prev.leagueStats, auto2029ExpansionSeeded: true }
        : prev.leagueStats,
    }));
  }, [state.isDataLoaded, state.leagueStats?.year, state.expansionSchedule, state.leagueStats?.auto2029ExpansionSeeded]);

const actions = useGameActions(setState, () => stateRef.current);

  const navigateToTeam = (teamId: number) => {
    setSelectedTeamId(teamId);
    setCurrentView('NBA Central');
  };

  const navigateToTeamFinances = (teamId: number) => {
    setSelectedTeamId(teamId);
    setCurrentView('Team Finances');
  };

  const dispatchAction = async (action: UserAction) => {
    const portalBlockedActions = new Set<string>([
      'SIGN_FREE_AGENT',
      'SUBMIT_FA_BID',
      'MATCH_RFA_OFFER',
      'DECLINE_RFA_OFFER',
      'WAIVE_PLAYER',
      'EXECUTIVE_TRADE',
      'FORCE_TRADE',
      'SET_TRAINING_DAILY_PLAN',
      'SET_TRAINING_NORMAL_DEFAULT',
      'SET_PLAYER_DEV_FOCUS',
      'SET_PLAYER_MENTOR',
      'SET_PLAYER_TRAINING_INTENSITY',
      'AUTOFILL_TEAM_TRAINING_CALENDAR',
    ]);
    const portalAllowsUpdateState = action.type === 'UPDATE_STATE'
      && action.payload
      && Object.keys(action.payload as Record<string, unknown>).every(key => key === 'portalTarget');
    if (stateRef.current.portalTarget != null && !portalAllowsUpdateState && portalBlockedActions.has(action.type)) {
      setState(prev => ({ ...prev, lastOutcome: 'Close the Portal to make changes.' }));
      return;
    }

    if (action.type === 'CLEAR_OUTCOME') {
      actions.clearOutcome();
      return;
    }

    if (action.type === 'SAVE_SOCIAL_THREAD') {
      actions.saveSocialThread(action.payload.postId, action.payload.replies);
      return;
    }

    if (action.type === 'SET_TRAINING_DAILY_PLAN') {
      // ISO-date-keyed (`YYYY-MM-DD`). User-set plans are marked `auto: false`
      // so the auto-scheduler never clobbers them.
      const { teamId, dayKey, plan } = action.payload as { teamId: number; dayKey: string; plan: any };
      setState(prev => ({
        ...prev,
        teams: prev.teams.map(t => t.id === teamId
          ? { ...t, trainingCalendar: { ...(t.trainingCalendar || {}), [dayKey]: { ...plan, auto: false } } }
          : t),
      }));
      return;
    }

    if (action.type === 'SET_TRAINING_NORMAL_DEFAULT') {
      const { teamId, template } = action.payload as { teamId: number; template: any };
      setState(prev => ({
        ...prev,
        teams: prev.teams.map(t => t.id === teamId ? { ...t, normalDayDefault: template } : t),
      }));
      return;
    }

    if (action.type === 'SET_PLAYER_TRAINING_INTENSITY') {
      const { playerId, intensity } = action.payload as { playerId: string; intensity: 'Rest' | 'Half' | 'Normal' | 'Double' };
      setState(prev => ({
        ...prev,
        players: prev.players.map(p => p.internalId === playerId ? { ...p, trainingIntensity: intensity } : p),
      }));
      return;
    }

    if (action.type === 'AUTOFILL_TEAM_TRAINING_CALENDAR') {
      // Manual trigger from the UI — regenerate the auto-fill for the given team
      // (preserving any user-set plans).
      //
      // Date-format gotcha: `prev.date` is locale-formatted ("Oct 27, 2026"),
      // but autoGenerateTrainingCalendar expects ISO. Without normalizeDate,
      // `new Date("Oct 27, 2026T00:00:00Z")` returns Invalid Date and the
      // scheduler bails, wiping every auto-plan from the calendar — which is
      // why stale saves looked empty / fell back to ACTIVITY_TINT renderings.
      const { teamId } = action.payload as { teamId: number };
      const { autoGenerateTrainingCalendar } = await import('../services/training/trainingScheduler');
      const { normalizeDate } = await import('../utils/helpers');
      setState(prev => {
        const team = prev.teams.find(t => t.id === teamId);
        if (!team) return prev;
        const preservedUserPlans = Object.fromEntries(
          Object.entries((team.trainingCalendar as any) ?? {}).filter(([, plan]: [string, any]) => plan?.auto === false)
        );
        const startISO = normalizeDate(prev.date);
        const calendar = autoGenerateTrainingCalendar(prev.schedule || [], teamId, startISO, 365, preservedUserPlans as any);
        return {
          ...prev,
          teams: prev.teams.map(t => t.id === teamId ? { ...t, trainingCalendar: calendar } : t),
        };
      });
      return;
    }

    if (action.type === 'SET_PLAYER_DEV_FOCUS') {
      const { playerId, devFocus } = action.payload as { playerId: string; devFocus: string };
      setState(prev => ({
        ...prev,
        players: prev.players.map(p => p.internalId === playerId ? { ...p, devFocus } : p),
      }));
      return;
    }

    if (action.type === 'SET_PLAYER_MENTOR') {
      const { playerId, mentorId } = action.payload as { playerId: string; mentorId: string | null };
      // One mentor per player (docs/mentorship.md §1) — enforce uniqueness at the
      // dispatch boundary so the relationship is atomic. Assigning mentor X to
      // player A automatically clears X from any other mentee.
      setState(prev => {
        const today = (prev.date ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);
        const closeOpenEntry = (history: NBAPlayer['mentorHistory']) =>
          (history ?? []).map(h => (h.endDate ? h : { ...h, endDate: today }));
        return {
          ...prev,
          players: prev.players.map(p => {
            if (p.internalId === playerId) {
              const closed = closeOpenEntry(p.mentorHistory);
              const next = mentorId
                ? [...closed, { mentorId, startDate: today }]
                : closed;
              return { ...p, mentorId, mentorHistory: next };
            }
            // Mentor reassigned away from a previous mentee — close their open entry too.
            if (mentorId && p.mentorId === mentorId) {
              return { ...p, mentorId: null, mentorHistory: closeOpenEntry(p.mentorHistory) };
            }
            return p;
          }),
        };
      });
      return;
    }

    if (action.type === 'RESET_PLAYER_FAMILIARITY') {
      // Reserved for trade / coach-fire "Clean Slate" hook (docs/training.md §2).
      // Currently familiarity lives on team, not player — this is a no-op stub
      // until Phase 3 wires per-player familiarity tracking.
      return;
    }

    if (action.type === 'ADD_PENDING_HYPNOSIS') {
      setState(prev => ({
        ...prev,
        pendingHypnosis: [...(prev.pendingHypnosis || []), action.payload]
      }));
      return;
    }

    if (action.type === 'UPDATE_SAVE_ID') {
      setState(prev => ({ ...prev, saveId: action.payload }));
      return;
    }

    if (action.type === 'SAVE_CONTEST_RESULT') {
      const { contest, result } = action.payload;
      setState(prev => {
        if (!prev.allStar) return prev;
        return {
          ...prev,
          allStar: {
            ...prev.allStar,
            ...(contest === 'dunk' ? { dunkContest: result } : { threePointContest: result }),
          }
        };
      });
      return;
    }

    if (action.type === 'SAVE_THRONE_RESULT') {
      const { result } = action.payload;
      setState(prev => prev.allStar
        ? { ...prev, allStar: { ...prev.allStar, throne: result } }
        : prev);
      return;
    }

    // Catch-up dispatch when the toggle was enabled mid-lifecycle (after a phase
    // start date had already passed). Merges an arbitrary partial onto state.allStar
    // — used by ThroneContestView's catch-up effect to seed signups / lock field
    // when the daily tick missed it.
    if (action.type === 'MERGE_THRONE_LIFECYCLE') {
      const patch = action.payload?.allStarPatch ?? {};
      setState(prev => prev.allStar
        ? { ...prev, allStar: { ...prev.allStar, ...patch } }
        : prev);
      return;
    }

    if (action.type === 'RECORD_WATCHED_GAME') {
      const { gameId, result } = action.payload;
      setState(prev => {
        const watchedGame = prev.schedule.find((g: any) => g.gid === gameId);
        const newSchedule = prev.schedule.map((g: any) =>
          g.gid === gameId ? { ...g, played: true, homeScore: result.homeScore, awayScore: result.awayScore } : g
        );
        const boxScoreEntry = {
          ...result,
          gameId,
          date: prev.date,
          competitionId: watchedGame?.competitionId ?? result.competitionId,
          competitionPhase: watchedGame?.competitionPhase ?? result.competitionPhase,
        };
        const existing = (prev.boxScores || []).findIndex((b: any) => b.gameId === gameId);
        const newBoxScores = existing >= 0
          ? (prev.boxScores || []).map((b: any, i: number) => i === existing ? boxScoreEntry : b)
          : [...(prev.boxScores || []), boxScoreEntry];
        // NOTE: wins/losses are NOT updated here — ADVANCE_DAY handles that via the watchedGameResult
        // injection in simulateGames to avoid double-counting (RECORD_WATCHED_GAME + ADVANCE_DAY race).
        return { ...prev, schedule: newSchedule, boxScores: newBoxScores };
      });

      // Fire photo fetch for watched game — non-blocking
      const watchedHome = resolveAnyTeam(result.homeTeamId, state.teams, state.nonNBATeams ?? []);
      const watchedAway = resolveAnyTeam(result.awayTeamId, state.teams, state.nonNBATeams ?? []);
      if (watchedHome && watchedAway) {
        import('../services/ImagnPhotoService').then(({ fetchGamePhotos }) => {
          fetchGamePhotos({ homeTeam: watchedHome, awayTeam: watchedAway }).catch(() => {});
        });
      }
      return;
    }

    if (action.type === 'STORE_PURCHASE') {
      const { amountMillion } = action.payload as { amountMillion: number };
      setState(prev => ({
        ...prev,
        stats: {
          ...prev.stats,
          personalWealth: Math.max(0, Number((prev.stats.personalWealth - amountMillion).toFixed(4))),
        },
      }));
      return;
    }

    if (action.type === 'REAL_ESTATE_INVENTORY_UPDATE') {
      setState(prev => ({ ...prev, realEstateInventory: action.payload.inventory }));
      return;
    }

    if (action.type === 'COMMISH_STORE_INVENTORY_UPDATE') {
      setState(prev => ({ ...prev, commishStoreInventory: action.payload.inventory }));
      return;
    }

    if (action.type === 'RIG_ALL_STAR_VOTING') {
      const { playerId, ghostVotes } = action.payload as { playerId: string; ghostVotes: number };
      setState(prev => ({
        ...prev,
        allStar: prev.allStar ? {
          ...prev.allStar,
          hasRiggedVoting: true,
          votes: prev.allStar.votes.map(v =>
            v.playerId === playerId ? { ...v, votes: v.votes + ghostVotes } : v
          ),
        } : prev.allStar,
      }));
      return;
    }

    if (action.type === 'SET_DUNK_CONTESTANTS') {
      const { contestants } = action.payload as { contestants: any[] };
      setState(prev => ({
        ...prev,
        allStar: prev.allStar ? { ...prev.allStar, dunkContestContestants: contestants, dunkContestAnnounced: true } : prev.allStar,
      }));
      return;
    }

    if (action.type === 'SET_THREE_POINT_CONTESTANTS') {
      const { contestants } = action.payload as { contestants: any[] };
      setState(prev => ({
        ...prev,
        allStar: prev.allStar ? { ...prev.allStar, threePointContestants: contestants, threePointAnnounced: true } : prev.allStar,
      }));
      return;
    }

    if (action.type === 'ADD_ALL_STAR_REPLACEMENT') {
      const { injuredId, replacementId, replacementName, conference, position } = action.payload as any;
      setState(prev => {
        if (!prev.allStar) return prev;
        const replacementPlayer = prev.players.find(p => p.internalId === replacementId);
        const replacementTeam = prev.teams.find(t => t.id === replacementPlayer?.tid);
        // Mark injured player as DNP
        const updatedRoster = prev.allStar.roster.map(r =>
          r.playerId === injuredId ? { ...r, isInjuredDNP: true } : r
        );
        // Only add replacement if not already in roster
        const alreadyIn = updatedRoster.some(r => r.playerId === replacementId);
        if (!alreadyIn && replacementPlayer) {
          updatedRoster.push({
            playerId: replacementPlayer.internalId,
            playerName: replacementPlayer.name,
            teamAbbrev: replacementTeam?.abbrev ?? '',
            nbaId: null,
            teamNbaId: null,
            conference: conference || (replacementTeam?.conference ?? 'East'),
            isStarter: false,
            position: replacementPlayer.pos ?? 'F',
            category: (replacementPlayer.pos?.includes('G') ? 'Guard' : 'Frontcourt') as 'Guard' | 'Frontcourt',
            ovr: replacementPlayer.overallRating,
            isInjuryReplacement: true,
            injuredPlayerId: injuredId,
          });
        }
        return { ...prev, allStar: { ...prev.allStar, roster: updatedRoster } };
      });
      return;
    }

    if (action.type === 'LOAD_GAME') {
      const loaded = action.payload as any;
      // Portrait migration: external league players whose imgURL came from bio gists
      // (non-ProBallers URLs) get cleared so they show initials rather than wrong headshots.
      // The externalRosterService now correctly prefers item.imgURL (ProBallers) over bio.image,
      // but existing saves may still have bio.image stored. Clear them here.
      const EXTERNAL_STATUSES_SET = new Set(['WNBA','Euroleague','PBA','B-League','G-League','Endesa','China CBA','NBL Australia']);
      // Clear bad portrait URLs: only the ProBallers default "no photo" placeholder (head-par-defaut)
      // and NBA CDN headshots on external-league players (those are passport-style shots of wrong player).
      // Do NOT clear other URLs — external gists store legit portrait URLs (basketball-ref, ESPN, etc.)
      const isBadPortrait = (p: any) => {
        if (!p.imgURL) return false;
        if (p.imgURL.includes('head-par-defaut')) return true; // ProBallers default placeholder
        // NBA CDN headshots on external players = wrong person's passport photo,
        // UNLESS the player has a srID (real Basketball-Reference slug) — then it's
        // a real NBA player demoted to G-League/Euroleague and the photo is correct.
        if (EXTERNAL_STATUSES_SET.has(p.status ?? '') && p.imgURL.includes('cdn.nba.com/headshots') && !p.srID) return true;
        return false;
      };
      // Contract amount sync: update contract.amount from contractYears[] for the current season.
      // Without this, saved games always use the year the save was first created (e.g. $13.9M rookie opt
      // for Cade Cunningham in year 1, even after he signs a max extension for $46M+ in year 2+).
      const currentSeasonYear: number = loaded.leagueStats?.year ?? new Date().getFullYear();
      const currentSeasonStr = `${currentSeasonYear - 1}-${String(currentSeasonYear).slice(-2)}`;

      // Contract.amount is stored in BBGM thousands — even the richest max
      // contract tops out near 80,000 (= $80M). Anything above 250,000 (= $250M)
      // is garbage. The user reported Season-2 payrolls in the trillions per
      // team, which means some flow leaked a USD or inflated value into the
      // thousands slot. We don't know the upstream source yet, but we can
      // repair the save on LOAD_GAME: prefer contractYears[currentSeason]
      // (the source of truth), fall back to the closest season with a sane
      // guaranteed value, else clamp to a plausible max.
      const SANE_CONTRACT_CAP_THOUSANDS = 250_000; // $250M
      const SANE_GUARANTEED_CAP_USD     = 250_000_000; // $250M

      const recoverAmountFromContractYears = (p: any): number | undefined => {
        const cy = p.contractYears as Array<{ season: string; guaranteed: number }> | undefined;
        if (!Array.isArray(cy) || cy.length === 0) return undefined;
        // Exact current-season match first.
        const exact = cy.find(e => e.season === currentSeasonStr);
        const candidates: number[] = [];
        if (exact && exact.guaranteed > 0 && exact.guaranteed <= SANE_GUARANTEED_CAP_USD) {
          candidates.push(Math.round(exact.guaranteed / 1000));
        }
        // Any other season entry whose USD value looks sane (back-up path if the
        // exact-season entry itself is corrupt — grab the first reasonable one).
        for (const e of cy) {
          if (e === exact) continue;
          if (e.guaranteed > 0 && e.guaranteed <= SANE_GUARANTEED_CAP_USD) {
            candidates.push(Math.round(e.guaranteed / 1000));
          }
        }
        return candidates.find(v => v > 0 && v <= SANE_CONTRACT_CAP_THOUSANDS);
      };

      let normalizedFreeAgentTypoCount = 0;
      let healedWaivedGhostContractCount = 0;
      const migratedPlayers = (loaded.players as any[] | undefined)?.map(p => {
        let updated = isBadPortrait(p) ? { ...p, imgURL: undefined } : p;
        updated = repairGeneratedExternalPlayer(updated as any, currentSeasonYear) as any;
        // Sync contract.amount to current season from contractYears[] if available.
        // Guard against corrupt guaranteed values — only apply the sync if the
        // result falls in a sane range.
        if (updated.contract && Array.isArray(updated.contractYears)) {
          const entry = updated.contractYears.find((cy: any) => cy.season === currentSeasonStr);
          if (entry && entry.guaranteed > 0 && entry.guaranteed <= SANE_GUARANTEED_CAP_USD) {
            const syncedAmount = Math.round(entry.guaranteed / 1000);
            if (syncedAmount > 0 && syncedAmount <= SANE_CONTRACT_CAP_THOUSANDS && syncedAmount !== updated.contract.amount) {
              updated = { ...updated, contract: { ...updated.contract, amount: syncedAmount } };
            }
          }
        }
        // Rookie contract heal: prior to the rookieContractUtils unit fix,
        // computeRookieSalaryUSD treated salaryCap (USD) as millions, inflating
        // every drafted rookie contract by ~1,000,000×. Saves with that
        // damage have garbage contract.amount AND garbage contractYears.
        // Recompute both from pickSlot when we can identify the rookie.
        if (
          updated.contract?.rookie &&
          updated.draft?.round && updated.draft?.pick &&
          updated.draft?.year &&
          typeof updated.contract.amount === 'number' &&
          updated.contract.amount > SANE_CONTRACT_CAP_THOUSANDS
        ) {
          const round: number = Number(updated.draft.round);
          const pickInRound: number = Number(updated.draft.pick);
          const pickSlot = (round - 1) * 30 + pickInRound;
          const fixedUSD = computeRookieSalaryUSD(pickSlot, loaded.leagueStats);
          const fixedAmount = Math.round(fixedUSD / 1000);
          const draftYear: number = Number(updated.draft.year);
          const expYear: number = Number(updated.contract.exp ?? 0);
          const totalYrs = expYear > draftYear && expYear - draftYear <= 6 ? expYear - draftYear : null;
          const teamOptExp = updated.contract.teamOptionExp;
          const firstOptionYr = updated.contract.hasTeamOption && teamOptExp ? Number(teamOptExp) : undefined;
          const rebuiltCY = totalYrs
            ? Array.from({ length: totalYrs }, (_, i) => {
                const yr = draftYear + i;
                const leagueYr = yr + 1;
                return {
                  season: `${yr}-${String(yr + 1).slice(-2)}`,
                  guaranteed: Math.round(fixedUSD * Math.pow(1.05, i)),
                  option: firstOptionYr != null && leagueYr >= firstOptionYr ? 'Team' : '',
                };
              })
            : updated.contractYears;
          console.warn(`[LOAD_GAME] Repaired inflated rookie contract for ${updated.name}: ${updated.contract.amount} → ${fixedAmount}`);
          updated = {
            ...updated,
            contract: { ...updated.contract, amount: fixedAmount },
            ...(rebuiltCY ? { contractYears: rebuiltCY } : {}),
          };
        }
        // Repair corrupt contract.amount — see comment above. Kicks in when a
        // prior session left the value in USD-like units, producing $16.7T
        // payrolls. Try contractYears first; if no sane source, fall back to
        // the league min ($1.3M = 1300 thousand).
        const amt = updated.contract?.amount;
        if (updated.contract && typeof amt === 'number' && (amt > SANE_CONTRACT_CAP_THOUSANDS || amt < 0 || !Number.isFinite(amt))) {
          const recovered = recoverAmountFromContractYears(updated) ?? 1300;
          console.warn(`[LOAD_GAME] Repaired corrupt contract.amount for ${updated.name}: ${amt} → ${recovered}`);
          updated = { ...updated, contract: { ...updated.contract, amount: recovered } };
        }
        // First-season two-way detection: BBGM data doesn't set twoWay:true, but two-way players
        // have ~$625K salary (< $800K threshold for grace). Mark them so roster-trim excludes them.
        // Skipped in Euro-Isolated mode — no two-way contracts in FIBA/Endesa/EuroLeague, and the
        // salary-threshold heuristic would false-positive a lot of legitimate Euro deals.
        if (loaded.leagueStats?.uiMode !== 'euro_isolated'
            && !updated.twoWay && updated.tid >= 0
            && (updated.contract?.amount ?? 0) > 0 && (updated.contract?.amount ?? 9999) < 800) {
          updated = { ...updated, twoWay: true };
        }
        // FA purgatory repair: `simulationHandler.autoTrimOversizedRosters` used to
        // write `status: 'FreeAgent'` (no space) — the canonical FA status is
        // `'Free Agent'` (with space) per types.ts and every FA signing filter.
        // Trim-released players became invisible to Pass 1/2/3/4/5 and got stuck
        // as FAs forever. Fixed upstream 2026-04-24; normalize existing saves here.
        if ((updated as any).status === 'FreeAgent') {
          updated = { ...updated, status: 'Free Agent' };
          normalizedFreeAgentTypoCount++;
        }
        if (updated.tid === -1 && updated.status === 'Free Agent' && updated.recentlyWaivedDate) {
          if (hasLiveContractAfterWaive(updated, currentSeasonYear)) {
            healedWaivedGhostContractCount++;
            updated = {
              ...stripLiveContractAfterWaive(updated, currentSeasonYear),
              twoWay: undefined,
              nonGuaranteed: false,
              gLeagueAssigned: false,
              mleSignedVia: undefined,
              hasBirdRights: false,
              yearsWithTeam: 0,
              signedDate: undefined,
              tradeEligibleDate: undefined,
            };
          }
        }
        // Repair off-by-one teamOptionExp for sim-generated draft picks.
        // Old formula: teamOptionExp = draftYear + guaranteedYrs  → fires 1 yr too early.
        // Correct:     teamOptionExp = draftYear + guaranteedYrs + 1 (after all guaranteed years).
        // exp had the same -1 error: old = draftYear + totalYrs - 1, correct = draftYear + totalYrs.
        // Only applies when hasTeamOption is still set (option not yet exercised/declined).
        if (updated.contract?.hasTeamOption && updated.draft?.year) {
          const draftYear: number = Number(updated.draft.year);
          const guaranteedYrs: number = loaded.leagueStats?.rookieContractLength ?? 2;
          if (updated.contract.teamOptionExp === draftYear + guaranteedYrs) {
            updated = {
              ...updated,
              contract: {
                ...updated.contract,
                teamOptionExp: draftYear + guaranteedYrs + 1,
                exp: (updated.contract.exp ?? 0) + 1,
              },
            };
          }
        }
        // Backfill contractYears[] for already-drafted rookies. Prior to the draft-
        // pick fix, computeDraftPickFields never seeded per-season rows, so Path A
        // in PlayerBioContractTab had nothing to render and Path B's currentYear..exp
        // loop silently dropped past rookie seasons. Synthesize from draft.year +
        // contract.exp + contract.amount so salary history shows every rookie year.
        if (
          updated.contract?.rookie &&
          updated.draft?.year &&
          updated.contract?.exp &&
          (!Array.isArray(updated.contractYears) || updated.contractYears.length === 0)
        ) {
          const draftYear: number = Number(updated.draft.year);
          const expYear: number = Number(updated.contract.exp);
          // exp is the last season's leagueStats year (= end year). First season
          // is "draftYear-(draftYear+1)" whose leagueStats year = draftYear + 1.
          // totalYrs = exp - (draftYear + 1) + 1 = exp - draftYear.
          const totalYrs = expYear - draftYear;
          if (totalYrs > 0 && totalYrs <= 6) {
            const baseUSD = (updated.contract.amount ?? 0) * 1000;
            if (baseUSD > 0) {
              const teamOptExp: number | undefined = updated.contract.teamOptionExp;
              // Option years sit at the tail of the deal. When hasTeamOption is
              // still set, teamOptionExp marks the FIRST option year (leagueStats
              // year convention). Post-exercise, the flag is cleared — we don't
              // know which years were options, so fall back to no option labels
              // (salaries still render; option annotation lost is acceptable).
              const firstOptionYr = updated.contract.hasTeamOption && teamOptExp ? teamOptExp : undefined;
              const backfilled = Array.from({ length: totalYrs }, (_, i) => {
                const yr = draftYear + i;
                const leagueYr = yr + 1; // "2026-27" row represents leagueStats.year = 2027
                return {
                  season: `${yr}-${String(yr + 1).slice(-2)}`,
                  guaranteed: Math.round(baseUSD * Math.pow(1.05, i)),
                  option: firstOptionYr != null && leagueYr >= firstOptionYr ? 'Team' : '',
                };
              });
              updated = { ...updated, contractYears: backfilled };
            }
          }
        }
        // Backfill contractYears[] for active NBA players who slipped through without
        // gist coverage (e.g. SGA — name mismatch, not in gist). Without this,
        // Path B in PlayerBioContractTab renders currentYear→exp, which shrinks
        // to 1 row by the final contract season. Seeds from contract.amount (BBGM
        // thousands) + 5% escalator to match the rosterService.ts fallback.
        if (
          updated.tid >= 0 && updated.tid < 100 &&
          updated.contract?.amount &&
          updated.contract?.exp &&
          (!Array.isArray((updated as any).contractYears) || (updated as any).contractYears.length === 0) &&
          !updated.contract.rookie // rookies handled by the block above
        ) {
          const amt: number = updated.contract.amount;
          const exp: number = updated.contract.exp;
          if (amt > 0 && exp >= currentSeasonYear) {
            const salaryUSD = amt * 1_000;
            const backfilled = Array.from({ length: exp - currentSeasonYear + 1 }, (_, i) => {
              const yr = currentSeasonYear + i;
              return {
                season: `${yr - 1}-${String(yr).slice(-2)}`,
                guaranteed: Math.round(salaryUSD * Math.pow(1.05, i)),
                option: '',
              };
            });
            updated = { ...updated, contractYears: backfilled } as any;
          }
        }
        // Age-bloat cleanup: retired players that aged past plausible lifespan in
        // saves predating Fix 13 (mortalityChecker). One-shot retroactive fix.
        if ((updated as any).status === 'Retired' && !(updated as any).diedYear) {
          const currentAge = currentSeasonYear - ((updated as any).born?.year ?? 2000);
          if (currentAge > 95) {
            const assumedDeathAge = Math.max(85, currentAge - 8);
            updated = { ...updated, diedYear: ((updated as any).born?.year ?? 2000) + assumedDeathAge } as any;
          }
        }
        return updated;
      }) ?? loaded.players;

      if (normalizedFreeAgentTypoCount > 0) {
        console.log(`[LOAD_GAME] Healed ${normalizedFreeAgentTypoCount} legacy 'FreeAgent' status records → 'Free Agent'.`);
      }
      if (healedWaivedGhostContractCount > 0) {
        console.log(`[LOAD_GAME] Healed ${healedWaivedGhostContractCount} waived FA ghost contract(s).`);
      }

      let healedPhantomUserRosterCount = 0;
      const dedupePlayerStats = (stats: any[] | undefined) => {
        if (!stats?.length) return stats ?? [];
        const grouped = new Map<string, any[]>();
        for (const row of stats) {
          const key = `${row.season}|${row.tid}|${row.playoffs ? 1 : 0}`;
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(row);
        }
        return Array.from(grouped.values()).map(rows =>
          rows.reduce((best, row) => ((row?.gp ?? 0) > (best?.gp ?? 0) ? row : best), rows[0])
        );
      };

      const loadedPlayers = ((migratedPlayers ?? loaded.players ?? []) as any[]).map((p: any) => {
        const userTid = loaded.gameMode === 'gm' ? Number(loaded.userTeamId) : -999;
        const normalizedStats = dedupePlayerStats(p.stats);
        if (!Number.isFinite(userTid) || p.tid !== userTid || p.status !== 'Free Agent') {
          return normalizedStats === p.stats ? p : { ...p, stats: normalizedStats };
        }
        const hasCommittedContract =
          !!p.contract &&
          Number(p.contract.amount ?? 0) > 0 &&
          Number(p.contract.exp ?? 0) >= currentSeasonYear;
        if (hasCommittedContract) return normalizedStats === p.stats ? p : { ...p, stats: normalizedStats };
        healedPhantomUserRosterCount++;
        return {
          ...p,
          stats: normalizedStats,
          tid: -1,
          twoWay: undefined,
          nonGuaranteed: false,
          gLeagueAssigned: false,
          signedDate: undefined,
          tradeEligibleDate: undefined,
        };
      });
      if (healedPhantomUserRosterCount > 0) {
        console.warn(`[LOAD_GAME] Released ${healedPhantomUserRosterCount} phantom user-roster FA(s) back to free agency.`);
      }
      const { additions: externalRosterRepairs } = enforceExternalMinRoster({
        ...loaded,
        players: loadedPlayers,
      } as any, currentSeasonYear);
      const finalPlayers = (externalRosterRepairs.length > 0
        ? [...loadedPlayers, ...externalRosterRepairs]
        : loadedPlayers
      ).map((p: any) => repairBirdRightsForLoadedPlayer(p));

      // Backfill Cup awards from all historical cups + current cup.
      // Needed because the ID-mismatch bug (numeric internalId) meant real players
      // like Jokic/Doncic/Sengun never received their awards at cup completion.
      const allHistoricalCups = Object.values((loaded.nbaCupHistory ?? {}) as Record<string, any>);
      if (loaded.nbaCup?.mvpPlayerId) allHistoricalCups.push(loaded.nbaCup);
      const backfilledPlayers = allHistoricalCups.reduce(
        (players: any[], cup: any) => cup?.mvpPlayerId || cup?.allTournamentTeam?.length || cup?.championTid != null
          ? applyCupAwardsToPlayers(cup, players)
          : players,
        finalPlayers,
      );

      // Legacy exhibition-rules migration. The seeds in constants.ts are now correct,
      // but saves from before the default flip persist the old values. Three patterns
      // get rewritten to the modern tournament defaults:
      //   - allStarMirrorLeagueRules=true  (legacy seed) — keep at the old 4×12=48 min,
      //     unless QL is explicitly the legacy 12; flip to mirror=false + QL=3.
      //   - allStarMirrorLeagueRules=false + QL=12 — incoherent (12 IS league mirror).
      //   - risingStarsFormat='tournament' or 'rookies_vs_sophomores' — invalid /
      //     legacy; replace with the canonical '4team_tournament'.
      const ls: any = loaded.leagueStats ?? {};
      const migratedLeagueStats = { ...ls };
      let staleRulesMigrated = false;

      // Award settings self-heal — derive defaults from uiMode when missing.
      if (!migratedLeagueStats.awardSettings) {
        const uiMode = migratedLeagueStats.uiMode ?? 'nba';
        migratedLeagueStats.awardSettings = defaultAwardSettings(
          uiMode === 'euro_isolated' || uiMode === 'fictional' ? uiMode : 'nba'
        );
        console.log(`[LOAD_GAME] Seeded default awardSettings for uiMode=${uiMode}`);
      }

      if (migratedLeagueStats.allStarGameTargetScore == null) {
        migratedLeagueStats.allStarGameTargetScore =
          ls.allStarGameFormat === 'target_score'
            ? Math.max(40, ls.allStarOvertimeTargetPoints ?? 40)
            : 40;
        staleRulesMigrated = true;
      }
      if (migratedLeagueStats.gameTargetScore == null || migratedLeagueStats.gameTargetScore <= 0) {
        migratedLeagueStats.gameTargetScore = 100;
      }
      if (ls.allStarMirrorLeagueRules === true && ls.allStarQuarterLength === 12) {
        migratedLeagueStats.allStarMirrorLeagueRules = false;
        migratedLeagueStats.allStarQuarterLength = 3;
        staleRulesMigrated = true;
      }
      if (ls.allStarMirrorLeagueRules === false && ls.allStarQuarterLength === 12) {
        migratedLeagueStats.allStarQuarterLength = 3;
        staleRulesMigrated = true;
      }
      if (ls.risingStarsMirrorLeagueRules === false && ls.risingStarsQuarterLength === 12) {
        migratedLeagueStats.risingStarsQuarterLength = 3;
        staleRulesMigrated = true;
      }
      if (ls.risingStarsFormat === 'rookies_vs_sophomores' || ls.risingStarsFormat === 'tournament') {
        migratedLeagueStats.risingStarsFormat = '4team_tournament';
        staleRulesMigrated = true;
      }
      if (staleRulesMigrated) {
        console.log('[LOAD_GAME] Migrated stale exhibition rules to tournament defaults.');
      }

      const healedSchedule = (loaded.schedule ?? []).map((g: any) => {
        if (g?.isRisingStars && g.gid === 91001) return { ...g, gameFormat: 'target_score', targetScore: g.targetScore ?? 40 };
        if (g?.isRisingStars && g.gid === 91002) return { ...g, gameFormat: 'target_score', targetScore: g.targetScore ?? 40 };
        if (g?.isRisingStars && g.gid === 91099) return { ...g, gameFormat: 'target_score', targetScore: g.targetScore ?? 25 };
        if (g?.isAllStar && migratedLeagueStats.allStarGameFormat && migratedLeagueStats.allStarGameFormat !== 'timed') {
          return {
            ...g,
            gameFormat: migratedLeagueStats.allStarGameFormat,
            targetScore: migratedLeagueStats.allStarGameFormat === 'target_score'
              ? (g.targetScore ?? migratedLeagueStats.allStarGameTargetScore ?? 40)
              : g.targetScore,
          };
        }
        return g;
      });

      // Strip rounding-noise dead-money entries from existing saves: any year-row
      // below $50K, plus any entry whose total drops below $50K after the cleanup.
      // New waivers already filter at write time.
      const DEAD_MONEY_FLOOR_USD = 50_000;
      let deadMoneyTrimmed = 0;
      const teamsWithCleanDeadMoney = (loaded.teams ?? []).map((t: any) => {
        if (!t.deadMoney || t.deadMoney.length === 0) return t;
        const cleanedEntries = t.deadMoney
          .map((e: any) => ({
            ...e,
            remainingByYear: (e.remainingByYear ?? []).filter((y: any) => (y.amountUSD ?? 0) >= DEAD_MONEY_FLOOR_USD),
          }))
          .filter((e: any) => {
            if (!e.remainingByYear || e.remainingByYear.length === 0) return false;
            const total = e.remainingByYear.reduce((s: number, y: any) => s + y.amountUSD, 0);
            return total >= DEAD_MONEY_FLOOR_USD;
          });
        const removed = t.deadMoney.length - cleanedEntries.length;
        if (removed > 0) deadMoneyTrimmed += removed;
        return { ...t, deadMoney: cleanedEntries };
      });
      if (deadMoneyTrimmed > 0) {
        console.log(`[LOAD_GAME] Stripped ${deadMoneyTrimmed} zero-amount dead-money entries.`);
      }

      const loadedForMarketCheck = {
        ...initialState,
        ...loaded,
        leagueStats: migratedLeagueStats,
        schedule: healedSchedule,
        players: backfilledPlayers,
        teams: teamsWithCleanDeadMoney as any,
      } as GameState;
      const playerById = new Map(backfilledPlayers.map((p: any) => [p.internalId, p]));
      let purgedResolvedFAMarkets = 0;
      let purgedExpiredFAMarkets = 0;
      let purgedSignedFAMarkets = 0;
      const cleanedFAMarkets = (loaded.faBidding?.markets ?? []).filter((m: any) => {
        const player = playerById.get(m.playerId) as any;
        if (m.resolved) {
          purgedResolvedFAMarkets++;
          return false;
        }
        if (player && player.tid >= 0) {
          purgedSignedFAMarkets++;
          return false;
        }
        if (m.openedDay != null && ((loadedForMarketCheck.day ?? 0) - m.openedDay) > MAX_FA_MARKET_DECISION_WINDOW_DAYS) {
          purgedExpiredFAMarkets++;
          return false;
        }
        if (!isPlausibleActiveMarket(m, loadedForMarketCheck, player)) {
          purgedExpiredFAMarkets++;
          return false;
        }
        return true;
      });
      const removedFAMarkets = purgedResolvedFAMarkets + purgedExpiredFAMarkets + purgedSignedFAMarkets;
      if (removedFAMarkets > 0) {
        console.log(`[LOAD_GAME] Purged ${removedFAMarkets} stale FA markets (resolved=${purgedResolvedFAMarkets}, expired=${purgedExpiredFAMarkets}, signed=${purgedSignedFAMarkets})`);
      }

      const seenOptionHistory = new Set<string>();
      let removedOptionHistory = 0;
      const cleanedHistory = [...(loaded.history ?? [])].reverse().filter((entry: any) => {
        const text = String(entry?.text ?? '').toLowerCase();
        const isOptionDecision =
          text.includes('player option') ||
          text.includes('team option');
        if (!isOptionDecision) return true;
        const playerKey = Array.isArray(entry.playerIds) && entry.playerIds.length > 0
          ? entry.playerIds.join(',')
          : text.replace(/\$[\d.]+m/g, '').replace(/\s+/g, ' ').trim();
        const kind = text.includes('player option') ? 'player-option' : 'team-option';
        const key = `${kind}|${entry.date ?? ''}|${playerKey}`;
        if (seenOptionHistory.has(key)) {
          removedOptionHistory++;
          return false;
        }
        seenOptionHistory.add(key);
        return true;
      }).reverse();
      if (removedOptionHistory > 0) {
        console.log(`[LOAD_GAME] Removed ${removedOptionHistory} duplicate option transaction(s).`);
      }

      // Training calendar migration — purge legacy numeric-keyed entries (pre-ISO format)
      // and re-run the auto-scheduler to clear stale July/transactions plans on old saves.
      // User overrides marked `auto: false` are preserved by the scheduler.
      let teamsWithFreshTraining: any[] = teamsWithCleanDeadMoney as any;
      try {
        const { autoGenerateTrainingCalendarsForAllTeams } = await import('../services/training/trainingScheduler');
        let migratedCount = 0;
        teamsWithFreshTraining = teamsWithFreshTraining.map((t: any) => {
          const cal = t.trainingCalendar;
          if (!cal) return t;
          // Strip any non-ISO keys (legacy numeric format) and entries with no ISO `YYYY-MM-DD` shape.
          const isoOnly: Record<string, any> = {};
          for (const [k, v] of Object.entries(cal)) {
            if (typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)) isoOnly[k] = v;
            else migratedCount++;
          }
          return { ...t, trainingCalendar: isoOnly };
        });
        if (migratedCount > 0) {
          console.log(`[LOAD_GAME] Stripped ${migratedCount} legacy training-calendar entries (numeric-keyed).`);
        }
        // Re-run auto-scheduler so banned-phase days (July FA, offseason, trade week)
        // get cleared and missing days get filled. Preserves user-set plans (auto: false).
        // Critical: state.date is locale-formatted ("Oct 27, 2026") — must
        // normalize to ISO or the scheduler bails on its first parse and wipes
        // every auto-plan to {}, leaving the calendar visually empty.
        if (loaded.schedule && Array.isArray(loaded.schedule) && loaded.date) {
          const { normalizeDate } = await import('../utils/helpers');
          const startISO = normalizeDate(loaded.date);
          teamsWithFreshTraining = autoGenerateTrainingCalendarsForAllTeams(
            teamsWithFreshTraining,
            loaded.schedule,
            startISO,
            365
          );
          console.log(`[LOAD_GAME] Refreshed training calendars via auto-scheduler (startISO=${startISO}).`);
        }
      } catch (e) {
        console.warn('[LOAD_GAME] training-calendar migration failed', e);
      }

      // AI auto-setup: backfill devFocus + mentor pairings on AI teams when
      // saves don't have them yet (new save / pre-feature load). Skips user
      // team in GM mode. Phase 2 will rerun this annually at training camp.
      let playersWithAISetup = backfilledPlayers;
      try {
        const { applyAIAutoSetup, shouldRunAIAutoSetup } = await import('../services/training/aiAutoSetup');
        if (shouldRunAIAutoSetup(playersWithAISetup, loaded.userTeamId, loaded.gameMode)) {
          playersWithAISetup = applyAIAutoSetup(
            playersWithAISetup,
            teamsWithFreshTraining as any,
            loaded.leagueStats?.year ?? new Date().getFullYear(),
            loaded.userTeamId,
            loaded.gameMode,
          );
          console.log('[LOAD_GAME] AI auto-setup applied: dev-focus + mentor pairings for AI teams.');
        }
      } catch (e) {
        console.warn('[LOAD_GAME] AI auto-setup failed', e);
      }

      // Restore fictional refs into the module-level cache so getAllReferees()
      // returns them without hitting the gist (which holds real NBA names).
      if (loaded.leagueType === 'fictional' && loaded.staff?.referees?.length) {
        setRefereeData(loaded.staff.referees);
        console.log(`[LOAD_GAME] Restored ${loaded.staff.referees.length} fictional referees.`);
      }

      // Heal fictional-league saves that still carry real NBA handles.
      const NBA_TO_FICTIONAL_HANDLES: Record<string, string> = {
        'nba':            'TheLeagueOfficial',
        'NBA':            'TheLeagueOfficial',
        'wojespn':        'KowalskiESPN',
        'ShamsCharania':  'TariqHassan',
        'shamscharania':  'TariqHassan',
      };
      const healedFollowedHandles =
        loaded.leagueType === 'fictional' && Array.isArray(loaded.followedHandles)
          ? loaded.followedHandles.map((h: string) => NBA_TO_FICTIONAL_HANDLES[h] ?? h)
          : loaded.followedHandles;

      // Self-heal legacy saves toggled to no_draft mid-cycle: the persisted
      // checklist may still hold pending/in-progress draft rows from before
      // the toggle. Flip them to 'skipped' so the offseason completion gate
      // can close — otherwise the GM is permanently stuck on phantom tasks.
      const persistedChecklist = loaded.offseasonChecklist as OffseasonChecklist | undefined;
      let healedOffseasonChecklist = persistedChecklist;
      if (persistedChecklist && isNoDraftLeague(loaded.leagueStats)) {
        const isUnfinished = (s: string | undefined) => s === 'pending' || s === 'in-progress';
        const needsHeal =
          isUnfinished(persistedChecklist.draftLottery) ||
          isUnfinished(persistedChecklist.draft) ||
          isUnfinished(persistedChecklist.rookieContracts);
        if (needsHeal) {
          healedOffseasonChecklist = {
            ...persistedChecklist,
            draftLottery: 'skipped',
            draft: 'skipped',
            rookieContracts: 'skipped',
          };
          console.log('[LOAD_GAME] Healed legacy draft rows → skipped (no_draft active).');
        }
      }

      // Euro-Isolated cleanup pass: strip NBA-specific contract flags from players
      // whose status is Endesa/EuroLeague/etc. and who sit on the active roster.
      // Two-way + non-guaranteed are NBA constructs and the auto-detection above
      // can leave stale flags on Euro-mode players loaded from earlier sessions.
      if (migratedLeagueStats?.uiMode === 'euro_isolated') {
        let strippedTwoWay = 0;
        for (const p of (loaded.players ?? [])) {
          if ((p.twoWay || (p as any).nonGuaranteed) && p.tid >= 0 && p.tid < 100) {
            if (p.twoWay) { p.twoWay = false; strippedTwoWay++; }
            if ((p as any).nonGuaranteed) (p as any).nonGuaranteed = false;
          }
        }
        if (strippedTwoWay > 0) console.log(`[LOAD_GAME] [euro] stripped twoWay flag from ${strippedTwoWay} roster players`);
      }

      let healedUserTeamId = loaded.userTeamId;
      if (migratedLeagueStats?.uiMode === 'euro_isolated' && loaded.gameMode === 'gm') {
        const nonNBATeams = loaded.nonNBATeams ?? [];
        const pointsAtEuroClub = nonNBATeams.some((t: any) => t.tid === healedUserTeamId);
        if (!pointsAtEuroClub) {
          const seededTeamId = (loaded as any).euroSetupSeed?.teamId;
          const seededTeam = nonNBATeams.find((t: any) => t.tid === seededTeamId);
          const fallbackTeam = seededTeam
            ?? nonNBATeams.find((t: any) => t.league === 'Endesa')
            ?? nonNBATeams.find((t: any) => t.league === 'Euroleague')
            ?? nonNBATeams[0];
          if (fallbackTeam) {
            console.log(`[LOAD_GAME] [euro] healed userTeamId ${healedUserTeamId} → ${fallbackTeam.tid} (${fallbackTeam.name})`);
            healedUserTeamId = fallbackTeam.tid;
          }
        }
      }

      // Tycoon: seed team.tycoon for all Euro-Isolated saves (default-on, no toggle).
      if (migratedLeagueStats?.uiMode === 'euro_isolated') {
        const migrated = migrateAllEuroTeams({
          teams: teamsWithFreshTraining as any,
          nonNBATeams: loaded.nonNBATeams ?? [],
          leagueStats: migratedLeagueStats as any,
        });
        if (migrated > 0) console.log(`[LOAD_GAME] [tycoon] migrated ${migrated} teams to tycoon state`);

        // FIBA cadence: 10-min quarters. Heal saves created before the cadence
        // was seeded into EURO_ISOLATED_DEFAULTS, so the simulator stops running
        // 48-min NBA games on Endesa/EuroLeague fixtures. Existing player stats
        // logged with NBA cadence keep their values; only new games shift.
        if ((migratedLeagueStats as any).quarterLength !== 10 || (migratedLeagueStats as any).numQuarters !== 4) {
          console.log(`[LOAD_GAME] [euro] healed quarterLength ${(migratedLeagueStats as any).quarterLength} → 10, numQuarters ${(migratedLeagueStats as any).numQuarters} → 4`);
          (migratedLeagueStats as any).quarterLength = 10;
          (migratedLeagueStats as any).numQuarters = 4;
        }
      }

      setState({
        ...initialState,
        ...loaded,
        leagueStats: migratedLeagueStats,
        userTeamId: healedUserTeamId,
        schedule: healedSchedule,
        players: playersWithAISetup,
        teams: teamsWithFreshTraining as any,
        history: cleanedHistory,
        faBidding: { markets: cleanedFAMarkets },
        followedHandles: healedFollowedHandles ?? initialState.followedHandles,
        offseasonChecklist: healedOffseasonChecklist,
        isProcessing: false
      });

      // Kick off background image caching if enabled
      if (SettingsManager.getSettings().enableImageCache && finalPlayers) {
        initImageCache(finalPlayers).catch(() => {});
      }
      return;
    }
    if (action.type === 'UPDATE_STATE') {
      setState(prev => ({ ...prev, ...action.payload }));
      return;
    }

    // ── Offseason 2K-style checklist actions (Phase A) ────────────────────
    // Pure UI-state mutations: navigation + row-status flips. Heavy work
    // (auto-resolve, FA tag advance) is delegated to existing services and
    // wired in subsequent phases.
    if (action.type === 'OFFSEASON_ENTER_PHASE') {
      const row = (action.payload as { row: OffseasonChecklistRow }).row;
      setState(prev => ({
        ...prev,
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, row, 'in-progress'),
      }));
      // Auto-navigate to the right view so user lands where the action lives.
      const target = OFFSEASON_ROW_TAB[row];
      if (target) setCurrentView(target);
      return;
    }

    if (action.type === 'OFFSEASON_COMPLETE_PHASE') {
      const row = (action.payload as { row: OffseasonChecklistRow }).row;
      setState(prev => ({
        ...prev,
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, row, 'done'),
      }));
      return;
    }

    if (action.type === 'OFFSEASON_SKIP_PHASE') {
      // Skip = trust the AI auto-resolve already baked into seasonRollover /
      // autoResolvers. Phase B/C will hook actual auto-resolution per row;
      // for now this just flips the status so the sidebar advances.
      const row = (action.payload as { row: OffseasonChecklistRow }).row;
      setState(prev => ({
        ...prev,
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, row, 'skipped'),
        // Clear FA counter when FA is skipped — without this the bottom-bar
        // pill keeps reading "FREE AGENCY · DAY X/13" even after the user is
        // already in training camp. faTagsTotal also reset so a re-entry
        // starts fresh from the default (13).
        ...(row === 'freeAgency' ? { faTagCounter: undefined, faTagsTotal: undefined } : {}),
      }));
      return;
    }

    if (action.type === 'OFFSEASON_RESET_CHECKLIST') {
      // Called once when offseason starts (or by debug tools to retry a phase).
      setState(prev => ({
        ...prev,
        offseasonChecklist: defaultOffseasonChecklist(prev.leagueStats),
        faTagCounter: undefined,
        pendingOfferDecisions: [],
      }));
      return;
    }

    // ── Expansion Draft (ZenGM-style, Phase 2 plumbing) ───────────────────
    // SCHEDULE_EXPANSION speichert das Setup. Wenn year === current ls.year,
    // wird offseasonChecklist.expansionDraft sofort auf 'pending' gesetzt;
    // sonst bleibt der Row 'skipped' bis das Jahr eintrifft (geprüft beim
    // Offseason-Init in einem späteren Phase-4-Hook).
    if (action.type === 'SCHEDULE_EXPANSION') {
      const payload = action.payload as {
        teams: any[];
        realignment: Record<number, { conference: 'East' | 'West'; cid: 0 | 1; did: number }>;
        settings: { perTeamLimit: number; maxDraftedPerTeam: number; picksPerExpansionTeam: number };
        scheduleYear: number;
      };
      setState(prev => {
        const currentYear = prev.leagueStats?.year ?? new Date().getFullYear();
        const isThisYear = payload.scheduleYear === currentYear;
        return {
          ...prev,
          expansionSchedule: {
            year: payload.scheduleYear,
            teams: payload.teams,
            realignment: payload.realignment,
          },
          expansionProtectionSettings: payload.settings,
          // Aktiviere Row sofort, wenn schedule = aktuelles Jahr
          offseasonChecklist: isThisYear && prev.offseasonChecklist
            ? { ...prev.offseasonChecklist, expansionDraft: 'pending' }
            : prev.offseasonChecklist,
        };
      });
      return;
    }

    // ── Dev-Test: schedule.year sofort auf aktuelles ls.year ziehen ─────────
    // Triggert Future-Year-Trigger ohne Wartezeit. Genutzt vom Sidebar-Pin
    // Test-Now-Button für Quick-Tests des Expansion-Draft-Flows.
    if (action.type === 'ACTIVATE_EXPANSION_NOW') {
      setState(prev => {
        if (!prev.expansionSchedule) return prev;
        const lsYear = prev.leagueStats?.year;
        if (lsYear == null) return prev;
        return {
          ...prev,
          expansionSchedule: { ...prev.expansionSchedule, year: lsYear },
        };
      });
      return;
    }

    if (action.type === 'CLEAR_EXPANSION_SCHEDULE') {
      setState(prev => {
        // Cleanup stale Expansion-Teams: wenn APPLY schon Teams angelegt hat
        // (expansionTeamIds gesetzt) UND hasExpanded false ist (Draft nicht
        // komplett), entferne diese Teams + ihre Spieler. Sicher gegen Duplikate
        // aus mehrfachen APPLY-Calls (frühere Bug-Class).
        const draftDone = !!prev.leagueStats?.hasExpanded;
        const staleTids = new Set(prev.expansionTeamIds ?? []);
        const shouldCleanup = staleTids.size > 0 && !draftDone;

        const teams = shouldCleanup
          ? (prev.teams ?? []).filter((t: any) => !staleTids.has(t.id ?? t.tid))
          : prev.teams;
        const players = shouldCleanup
          ? (prev.players ?? []).map((p: any) =>
              staleTids.has(p.tid)
                ? { ...p, tid: -1, status: 'Free Agent' }
                : p
            )
          : prev.players;

        return {
          ...prev,
          teams,
          players,
          expansionTeamIds: undefined,
          expansionSchedule: undefined,
          expansionProtectionSettings: undefined,
          expansionDraftProtections: undefined,
          expansionEligiblePlayers: undefined,
          // Auto-Seed-Flag setzen, damit der Auto-2029-Effect nicht direkt
          // wieder dasselbe Schedule rein-pusht. User-Cancel ist persistent.
          leagueStats: prev.leagueStats
            ? { ...prev.leagueStats, auto2029ExpansionSeeded: true }
            : prev.leagueStats,
          offseasonChecklist: prev.offseasonChecklist
            ? { ...prev.offseasonChecklist, expansionDraft: 'skipped' }
            : prev.offseasonChecklist,
        };
      });
      return;
    }

    if (action.type === 'SET_EXPANSION_PROTECTIONS') {
      const payload = action.payload as { protections: Record<number, string[]> };
      setState(prev => {
        // Eligible-Pool = NBA-Roster-Spieler MINUS protected (alle Teams).
        // tid < 100 sperrt externe Ligen aus (Euroleague +1000, PBA +2000,
        // WNBA +3000, B-League +4000, Endesa +5000, G-League +6000, CBA +7000,
        // NBL +8000). Status-Filter als Defense-in-Depth gegen Save-Drift.
        const protectedAll = new Set(Object.values(payload.protections).flat());
        const EXTERNAL_STATUSES = new Set([
          'Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League',
          'Endesa', 'China CBA', 'NBL Australia', 'Free Agent', 'Draft Prospect', 'Prospect',
        ]);
        const eligible = (prev.players ?? [])
          .filter((p: any) => {
            if (typeof p.tid !== 'number' || p.tid < 0 || p.tid >= 100) return false;
            if (EXTERNAL_STATUSES.has(p.status)) return false;
            return !protectedAll.has(p.internalId);
          })
          .map((p: any) => p.internalId);
        return {
          ...prev,
          expansionDraftProtections: payload.protections,
          expansionEligiblePlayers: eligible,
        };
      });
      return;
    }

    // ── Expansion Draft — apply realignment + add new franchises ──────────
    // Wendet das Realignment-Mapping auf state.teams an UND pusht die neuen
    // Expansion-Teams (aus expansionSchedule.teams) mit auto-incrementierten
    // tids. Setzt state.expansionTeamIds für die folgende Draft-Phase.
    if (action.type === 'APPLY_EXPANSION_REALIGNMENT') {
      setState(prev => {
        const schedule = prev.expansionSchedule;
        if (!schedule) return prev;

        // Idempotenz: wenn JEDE Expansion-Spec bereits per abbrev in state.teams
        // existiert, ist APPLY schon einmal gelaufen. Nur Realignment auf
        // Bestandsteams (nicht-expansion) erneut anwenden — Teams nicht erneut
        // appenden. Verhindert die Duplicate-Teams-Bug-Class (s. CLAUDE.md).
        const teamsByAbbrev = new Map<string, any>();
        (prev.teams ?? []).forEach((t: any) => {
          if (t.abbrev) teamsByAbbrev.set(t.abbrev, t);
        });
        const allExpansionAlreadyExists = schedule.teams.every(spec =>
          teamsByAbbrev.has(spec.abbrev)
        );

        if (allExpansionAlreadyExists) {
          // Re-resolve expansionTeamIds aus den bereits existierenden Teams
          const reresolvedIds = schedule.teams
            .map(spec => teamsByAbbrev.get(spec.abbrev))
            .filter(Boolean)
            .map((t: any) => t.id ?? t.tid);
          // Heal: alte Saves mit `name: spec.name` (ohne Region-Prefix) auf
          // die NBATeam-Convention "Region Name" umstellen, damit Standings
          // "Las Vegas Blue Chips" statt "Blue Chips" zeigen. Plus Realignment.
          const realignedTeams = (prev.teams ?? []).map((t: any) => {
            const matchingSpec = schedule.teams.find(s => s.abbrev === t.abbrev);
            if (matchingSpec) {
              const expectedName = `${matchingSpec.region} ${matchingSpec.name}`;
              const needsHeal = t.name !== expectedName;
              return needsHeal ? { ...t, name: expectedName, region: matchingSpec.region } : t;
            }
            const move = schedule.realignment?.[t.id];
            if (!move) return t;
            return { ...t, conference: move.conference, cid: move.cid, did: move.did };
          });
          return {
            ...prev,
            teams: realignedTeams,
            expansionTeamIds: reresolvedIds,
          };
        }

        const nextTid = (prev.teams ?? []).reduce((max: number, t: any) => Math.max(max, t.id ?? 0), -1) + 1;

        // Realign bestehende Teams
        const realignedTeams = (prev.teams ?? []).map((t: any) => {
          const move = schedule.realignment?.[t.id];
          if (!move) return t;
          return { ...t, conference: move.conference, cid: move.cid, did: move.did };
        });

        // Append Expansion-Teams — überspringt Specs deren abbrev schon existiert
        const newTeams: any[] = [];
        const newTids: number[] = [];
        let nextTidCursor = nextTid;
        schedule.teams.forEach(spec => {
          const existing = teamsByAbbrev.get(spec.abbrev);
          if (existing) {
            newTids.push(existing.id ?? existing.tid);
            return;
          }
          const tid = nextTidCursor++;
          newTids.push(tid);
          // NBA-Convention: name enthält Region-Prefix ("Houston Rockets",
          // "Las Vegas Blue Chips"). spec.name ist nur Nickname → prefix mit
          // region damit Standings + alle UI korrekt rendern.
          newTeams.push({
            id: tid,
            tid,
            name: `${spec.region} ${spec.name}`,
            abbrev: spec.abbrev,
            region: spec.region,
            conference: spec.conference,
            cid: spec.cid,
            did: spec.did,
            wins: 0,
            losses: 0,
            strength: 50,
            pop: spec.pop,
            colors: spec.colors,
            logoUrl: spec.imgURL,
          });
        });

        return {
          ...prev,
          teams: [...realignedTeams, ...newTeams],
          expansionTeamIds: newTids,
        };
      });
      return;
    }

    // ── Expansion Draft — single pick (Vertrag wandert mit) ───────────────
    // Im Gegensatz zum Rookie-Draft wird KEIN neuer Vertrag gesetzt — der
    // Spieler behält contract/contractYears. Nur tid wechselt + Roster-Move-
    // Transaction wird angehängt. Drop aus expansionEligiblePlayers.
    if (action.type === 'EXPANSION_DRAFT_PICK') {
      const { tid, playerId } = action.payload as { tid: number; playerId: string };
      setState(prev => {
        const season: number = (prev.leagueStats as any)?.year ?? new Date().getFullYear();
        const updatedPlayers = (prev.players ?? []).map((p: any) => {
          if (p.internalId !== playerId) return p;
          const transactions = [...(p.transactions ?? []), { season, tid, type: 'expansion-draft', phase: 0 }];
          return { ...p, tid, transactions };
        });
        const eligible = (prev.expansionEligiblePlayers ?? []).filter((id: string) => id !== playerId);
        return {
          ...prev,
          players: updatedPlayers,
          expansionEligiblePlayers: eligible,
        };
      });
      return;
    }

    // ── Per-Team Population edit (Commissioner Rules → Team Population) ───
    if (action.type === 'UPDATE_TEAM_POP') {
      const { tid, pop } = action.payload as { tid: number; pop: number };
      setState(prev => ({
        ...prev,
        teams: (prev.teams ?? []).map((t: any) => (t.id === tid ? { ...t, pop } : t)),
      }));
      return;
    }

    // ── Expansion Draft — completion bookkeeping ──────────────────────────
    if (action.type === 'EXPANSION_DRAFT_COMPLETE') {
      setState(prev => ({
        ...prev,
        expansionSchedule: undefined,
        expansionProtectionSettings: undefined,
        expansionDraftProtections: undefined,
        expansionEligiblePlayers: undefined,
        expansionTeamIds: undefined,
        leagueStats: prev.leagueStats
          ? { ...prev.leagueStats, hasExpanded: true }
          : prev.leagueStats,
        offseasonChecklist: prev.offseasonChecklist
          ? { ...prev.offseasonChecklist, expansionDraft: 'done' }
          : prev.offseasonChecklist,
      }));
      return;
    }

    // ── Auto-resolve every remaining phase via assistantGM lazy sim ─────
    // Single button at the top of AUFGABEN. Skips straight to opening
    // night using the existing lazy-sim path with assistantGM=true so
    // every user-team transaction (re-signs, FA bids, options) is
    // handled by the AI assistant. Auto-tear-down useEffect wipes the
    // checklist when calendar phase returns to 'inSeason'.
    if (action.type === 'OFFSEASON_AUTO_RESOLVE_ALL') {
      // Same outcome as Enter Preseason BUT with assistantGM=true so the AI
      // handles every user-team transaction (re-signs, FA bids, options,
      // even trades) under the hood. OFFSEASON_EXIT does the actual sim +
      // gate teardown; the explicit flag distinguishes this path from a
      // user-driven manual Enter Preseason (which should NOT let the AI
      // trade for the user's roster).
      await dispatchAction({ type: 'OFFSEASON_EXIT', payload: { assistantGM: true } } as any);
      return;
    }

    // ── Qualifying Offer submission (Phase D — RFA decision) ─────────────
    // Submit: stamps contract.restrictedFA so the FA market gives the prior
    // team match rights when offers come in (faMarketTicker pendingMatch
    // flow already handles this).
    // Skip: clears the flag so the player walks as UFA — no match rights.
    // The default for R1 rookies is RFA via isPlayerRFA fallback; this lets
    // the GM explicitly opt out for a player they don't want to retain.
    if (action.type === 'SUBMIT_QUALIFYING_OFFER') {
      const { playerId } = (action as any).payload as { playerId: string };
      setState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.internalId === playerId
            ? { ...p, contract: { ...(p.contract as any), restrictedFA: true, isRestrictedFA: true, qualifyingOfferSubmitted: true } } as any
            : p,
        ),
      }));
      return;
    }

    if (action.type === 'SKIP_QUALIFYING_OFFER') {
      const { playerId } = (action as any).payload as { playerId: string };
      setState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.internalId === playerId
            ? { ...p, contract: { ...(p.contract as any), restrictedFA: false, isRestrictedFA: false, qualifyingOfferSkipped: true, qualifyingOfferSubmitted: false } } as any
            : p,
        ),
      }));
      return;
    }

    if (action.type === 'OFFSEASON_EXIT') {
      // Advance to the first scheduled preseason game — same logic as the
      // PlayButton's "Until preseason games" option. Falls back to Oct 1
      // when no preseason games are in state.schedule yet (pre-schedule-
      // generation dead window, Jul–Sep).
      //
      // assistantGM is OFF by default: a manual "Enter Preseason" click
      // from a GM who finished their offseason work must not let the AI
      // trade their roster behind their back during the Sep→Oct sim
      // window. OFFSEASON_AUTO_RESOLVE_ALL passes assistantGM=true to opt
      // in — that's the path where the user explicitly delegated.
      const useAssistantGM = !!(action.payload as any)?.assistantGM;
      const ls = stateRef.current.leagueStats as any;
      const lsYear: number = ls?.year ?? new Date().getFullYear();
      const cMonth = stateRef.current.date ? new Date(stateRef.current.date).getUTCMonth() + 1 : 0;
      const cYear = stateRef.current.date ? new Date(stateRef.current.date).getUTCFullYear() : lsYear;
      const preseasonYear = (cMonth <= 6 && cYear === lsYear) ? lsYear : cYear;
      const todayStr = stateRef.current.date ? normalizeDate(stateRef.current.date) : '';
      const scheduledPreseason = (stateRef.current.schedule ?? [])
        .filter((g: any) => g.isPreseason && !g.played)
        .map((g: any) => normalizeDate(g.date))
        .filter((d: string) => !!d && (!todayStr || d > todayStr))
        .sort()[0];
      const target = scheduledPreseason ?? `${preseasonYear}-10-01`;
      if (todayStr && todayStr < target) {
        await dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { targetDate: target, stopBefore: true, assistantGM: useAssistantGM },
        } as any);
      }
      // Stamp the CALENDAR year (not lsYear) so the auto-init useEffect
      // doesn't immediately re-create the checklist within this offseason
      // cycle, but DOES re-trigger when the next post-Finals offseason
      // begins in the following calendar year (different cYear).
      const exitCYear = stateRef.current.date ? new Date(stateRef.current.date).getUTCFullYear() : 0;
      setState(prev => ({
        ...prev,
        offseasonChecklist: undefined,
        faTagCounter: undefined,
        faTagsTotal: undefined,
        pendingOfferDecisions: [],
        offseasonExitedYear: exitCYear,
      }));
      return;
    }

    // ── FA Tag system (Phase C) ──────────────────────────────────────────
    // The 2K-style "Free Agency · Tag X/13" counter. Each Tag advance is
    // ~5 calendar days under the hood — but the user only ever sees the
    // counter. Reuses the existing SIMULATE_TO_DATE path so all the
    // FA market ticker / AI signing / Bird Rights logic from the
    // orchestrator fires correctly.
    //
    // Tag 1 lands on the first legal signing day (post-moratorium). On
    // initial Enter we skip the moratorium silently so the user never has
    // to look at a "signings disabled" wait period.
    if (action.type === 'OFFSEASON_ADVANCE_FA_TAG') {
      const total = stateRef.current.faTagsTotal ?? 13;
      const counter = stateRef.current.faTagCounter ?? 0;
      const currentDateStr = stateRef.current.date;
      if (!currentDateStr) return;

      // First Tag — skip moratorium. Land ON the first legal signing day
      // with that day's faMarketTicker NOT YET FIRED (stopBefore:true) so
      // the user gets a chance to submit bids on stars BEFORE AI signings
      // resolve. Without this, the sim runs through Day 1 in the same tick
      // and AI auto-signs LeBron / Harden / etc. before the user sees the
      // FA dashboard.
      if (counter === 0) {
        const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(
          currentDateStr,
          stateRef.current.leagueStats as any,
          stateRef.current.schedule as any,
        );
        const targetISO = toISODateString(moratoriumEnd);
        const currentNorm = normalizeDate(currentDateStr);
        if (currentNorm < targetISO) {
          await dispatchAction({
            type: 'SIMULATE_TO_DATE',
            payload: { targetDate: targetISO, stopBefore: true },
          } as any);
        }
        setState(prev => ({
          ...prev,
          faTagCounter: 1,
          faTagsTotal: total,
        }));
        return;
      }

      // Subsequent Tags — advance ~62/N days (≈5 for N=13)
      const daysPerTag = Math.max(1, Math.floor(62 / total));
      const currentDate = new Date(`${normalizeDate(currentDateStr)}T00:00:00Z`);
      currentDate.setUTCDate(currentDate.getUTCDate() + daysPerTag);
      const targetISO = toISODateString(currentDate);
      await dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: targetISO, stopBefore: true },
      } as any);

      const newCounter = counter + 1;
      if (newCounter >= total) {
        // Final Tag — mark FA row done, clear counter
        setState(prev => ({
          ...prev,
          offseasonChecklist: setRowStatus(prev.offseasonChecklist, 'freeAgency', 'done'),
          faTagCounter: undefined,
          faTagsTotal: undefined,
        }));
      } else {
        setState(prev => ({ ...prev, faTagCounter: newCounter }));
      }
      return;
    }

    if (action.type === 'SUBMIT_FA_BID') {
      // User enters the competitive FA market instead of signing instantly.
      // Creates a market if none exists, replaces any prior user bid on the
      // same player (only one active user bid at a time), and lets the daily
      // market ticker resolve at decidesOnDay. Does NOT mutate the player —
      // resolution is the only path that applies the contract.
      const { playerId, playerName, teamId, teamName, teamLogoUrl, salaryUSD, years, option } = action.payload as {
        playerId: string;
        playerName: string;
        teamId: number;
        teamName: string;
        teamLogoUrl?: string;
        salaryUSD: number;
        years: number;
        option: 'NONE' | 'PLAYER' | 'TEAM';
      };
      setState(prev => {
        const currentDay = prev.day ?? 0;
        const currentPlayer = prev.players.find(p => p.internalId === playerId);
        if (prev.gameMode === 'gm' && currentPlayer && (currentPlayer.tid === -1 || currentPlayer.status === 'Free Agent') && prev.date) {
          const currentDate = parseGameDate(prev.date);
          const faStart = getCurrentOffseasonEffectiveFAStart(currentDate, prev.leagueStats as any, prev.schedule as any);
          if (currentDate < faStart) return prev;
        }
        const moratoriumEndDay = (() => {
          if (!prev.date) return currentDay + 4;
          const currentDate = parseGameDate(prev.date);
          const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(currentDate, prev.leagueStats as any, prev.schedule as any);
          if (isNaN(currentDate.getTime()) || isNaN(moratoriumEnd.getTime())) return currentDay + 4;
          return currentDay + Math.max(0, Math.ceil((moratoriumEnd.getTime() - currentDate.getTime()) / 86_400_000));
        })();
        // Always give bids placed during moratorium at least 4 days post-moratorium
        // before resolution — otherwise a "skip through moratorium" lands ON the
        // boundary day, resolution fires immediately, and the user has no chance
        // to react to AI counter-bids that opened during the lockout.
        const decisionDay = Math.max(currentDay + 4, moratoriumEndDay + 4);
        const playerById = new Map(prev.players.map(p => [p.internalId, p]));
        const markets = (prev.faBidding?.markets ?? [])
          .filter((m: any) => m.resolved || isPlausibleActiveMarket(m, prev, playerById.get(m.playerId) ?? currentPlayer))
          // Drop stale resolved markets for THIS player — they pile up across
          // FA cycles (player gets signed → waived → re-enters FA) and confuse
          // the UI's "live bid tracker" which picks the first match by playerId.
          // Without this, a fresh Warren bid lands while a months-old "resolved
          // today" market is still on screen.
          .filter((m: any) => !(m.resolved && m.playerId === playerId))
          .map((m: any) => ({ ...m, bids: [...(m.bids ?? [])] }));
        const newUserBid = {
          id: `user-bid-${playerId}-${teamId}-${Date.now()}`,
          playerId,
          teamId,
          teamName,
          teamLogoUrl,
          salaryUSD,
          years,
          option,
          isUserBid: true,
          submittedDay: currentDay,
          // Stay active until the market's decision day; if market doesn't exist
          // yet we'll seed a 4-day window.
          expiresDay: decisionDay,
          status: 'active' as const,
        };
        const aiCounterBids = currentPlayer
          ? generateAIBids(currentPlayer, prev, 5)
          : [];
        const existingIdx = markets.findIndex(m => m.playerId === playerId && !m.resolved);
        if (existingIdx >= 0) {
          const existing = markets[existingIdx];
          const existingDecisionDay = Math.max(
            existing.decidesOnDay ?? decisionDay,
            decisionDay,
            ...aiCounterBids.map(b => b.expiresDay ?? decisionDay),
          );
          const withoutPrior = existing.bids.filter(b => !b.isUserBid);
          const existingAiTeamIds = new Set(withoutPrior.map(b => b.teamId));
          const newCounterBids = aiCounterBids
            .filter(b => !existingAiTeamIds.has(b.teamId))
            .map(b => ({ ...b, expiresDay: Math.max(b.expiresDay ?? existingDecisionDay, existingDecisionDay) }));
          markets[existingIdx] = {
            ...existing,
            bids: [...withoutPrior, ...newCounterBids, { ...newUserBid, expiresDay: existingDecisionDay }],
            decidesOnDay: existingDecisionDay,
            season: existing.season ?? (prev.leagueStats?.year ?? new Date().getFullYear()),
            openedDay: existing.openedDay ?? currentDay,
            openedDate: existing.openedDate ?? prev.date,
          };
        } else {
          const marketDecisionDay = Math.max(
            decisionDay,
            ...aiCounterBids.map(b => b.expiresDay ?? decisionDay),
          );
          markets.push({
            playerId,
            playerName,
            bids: [
              ...aiCounterBids.map(b => ({ ...b, expiresDay: Math.max(b.expiresDay ?? marketDecisionDay, marketDecisionDay) })),
              { ...newUserBid, expiresDay: marketDecisionDay },
            ],
            decidesOnDay: marketDecisionDay,
            resolved: false,
            season: prev.leagueStats?.year ?? new Date().getFullYear(),
            openedDay: currentDay,
            openedDate: prev.date,
          });
        }
        const stored = markets.find(m => m.playerId === playerId && !m.resolved);
        console.log(`[SUBMIT_FA_BID] Stored user bid for ${playerName} → ${teamName}: $${(salaryUSD / 1_000_000).toFixed(1)}M/${years}yr. Market entry: resolved=${stored?.resolved}, decidesOnDay=${stored?.decidesOnDay}, totalBids=${stored?.bids?.length ?? 0}`);
        return { ...prev, faBidding: { markets } };
      });
      return;
    }

    // ── RFA matching offer-sheet actions ────────────────────────────────────
    // User-owned RFA gets a winning offer from another team → market goes into
    // pending-match state. User has to MATCH (apply contract to user's team) or
    // DECLINE (let signing team have him). Both trigger the next ticker pass to
    // resolve and emit transactions/news.
    if (action.type === 'MATCH_RFA_OFFER' || action.type === 'DECLINE_RFA_OFFER') {
      const { playerId } = (action as any).payload as { playerId: string };
      const decision = action.type === 'MATCH_RFA_OFFER' ? 'match' : 'decline';
      setState(prev => {
        const markets = (prev.faBidding?.markets ?? []).slice();
        const idx = markets.findIndex(m => m.playerId === playerId && m.pendingMatch);
        if (idx < 0) return prev;
        const m = markets[idx];
        const userTid = (prev as any).userTeamId ?? -999;
        // Force the AI tick to pick up this user's decision: flip the prior tid
        // off the user's team if they declined (so the tick auto-declines next
        // pass), or leave it set to userTid + bypass the user-skip via pre-applied
        // mutation below if they matched.
        if (decision === 'match') {
          // Apply the match here directly — flip winning bid's teamId to userTid.
          const offerBid = m.bids.find(b => b.id === m.pendingMatchOfferBidId);
          if (!offerBid) return prev;
          const player = prev.players.find(p => p.internalId === playerId);
          if (!player) return prev;
          const team = prev.teams.find(t => t.id === userTid);
          if (!team) return prev;
          const finalYears = offerBid.years;
          const currentYear = prev.leagueStats?.year ?? new Date().getFullYear();
          const newContract = {
            amount: Math.round(offerBid.salaryUSD / 1_000),
            exp: currentYear + finalYears - 1,
            hasPlayerOption: offerBid.option === 'PLAYER',
          };
          const newContractYears = Array.from({ length: finalYears }, (_, i) => {
            const yr = currentYear + i;
            return {
              season: `${yr - 1}-${String(yr).slice(-2)}`,
              guaranteed: Math.round(offerBid.salaryUSD * Math.pow(1.05, i)),
              option: i === finalYears - 1 && offerBid.option === 'PLAYER' ? 'Player'
                    : i === finalYears - 1 && offerBid.option === 'TEAM' ? 'Team' : '',
            };
          });
          const histYears = ((player as any).contractYears ?? []).filter((cy: any) => {
            const yr = parseInt(cy.season.split('-')[0], 10) + 1;
            return yr < currentYear;
          });
          const updatedPlayers = prev.players.map(p =>
            p.internalId === playerId
              ? clearWaiverMarkers({
                  ...p,
                  tid: userTid,
                  status: 'Active' as const,
                  contract: newContract,
                  contractYears: [...histYears, ...newContractYears],
                } as any)
              : p,
          );
          markets[idx] = { ...m, resolved: true, pendingMatch: false, matchedByPriorTeam: true };
          const annualM = Math.round(offerBid.salaryUSD / 100_000) / 10;
          const totalM = Math.round(annualM * finalYears);
          const signingTeam = prev.teams.find(t => t.id === offerBid.teamId);
          const histEntry = {
            text: `${team.name} matched ${signingTeam?.name ?? 'opposing'} offer sheet on ${player.name}: $${totalM}M/${finalYears}yr.`,
            date: prev.date,
            type: 'Signing',
            playerIds: [player.internalId],
          };
          return {
            ...prev,
            players: updatedPlayers,
            faBidding: { markets },
            history: [...((prev as any).history ?? []), histEntry] as any,
          } as any;
        } else {
          // Decline — clear pendingMatchPriorTid so the next tick treats it as
          // an expired window and resolves to the signing team.
          markets[idx] = {
            ...m,
            pendingMatchExpiresDay: (prev.day ?? 0) - 1,  // immediate expiry
            pendingMatchPriorTid: -1,                     // unset prior to short-circuit user check
          };
          return { ...prev, faBidding: { markets } };
        }
      });
      return;
    }

    // ── Social-only actions — pure state patches, never run the simulation ──
    if (action.type === 'CACHE_PROFILE') {
      const { handle, profile } = (action as any).payload;
      setState(prev => ({
        ...prev,
        cachedProfiles: { ...(prev.cachedProfiles || {}), [handle.replace('@', '')]: profile },
      }));
      return;
    }
    if (action.type === 'TOGGLE_LIKE') {
      const id = (action as any).payload;
      setState(prev => ({
        ...prev,
        socialFeed: prev.socialFeed.map((p: any) =>
          p.id === id ? { ...p, isLiked: !p.isLiked, likes: p.isLiked ? p.likes - 1 : p.likes + 1 } : p
        ),
      }));
      return;
    }
    if (action.type === 'TOGGLE_RETWEET') {
      const id = (action as any).payload;
      setState(prev => ({
        ...prev,
        socialFeed: prev.socialFeed.map((p: any) =>
          p.id === id ? { ...p, isRetweeted: !p.isRetweeted, retweets: p.isRetweeted ? p.retweets - 1 : p.retweets + 1 } : p
        ),
      }));
      return;
    }
    if (action.type === 'ADD_POST') {
      setState(prev => ({ ...prev, socialFeed: [(action as any).payload, ...prev.socialFeed] }));
      return;
    }
    if (action.type === 'ADD_REPLY' || action.type === 'ADD_REPLIES') {
      const { replies, reply } = (action as any).payload;
      const newPosts: any[] = replies ?? (reply ? [reply] : []);
      if (newPosts.length > 0) {
        setState(prev => {
          const existingIds = new Set(prev.socialFeed.map((p: any) => p.id));
          const unique = newPosts.filter((p: any) => !existingIds.has(p.id));
          return unique.length > 0 ? { ...prev, socialFeed: [...prev.socialFeed, ...unique] } : prev;
        });
      }
      return;
    }

    if (action.type === 'RETIRE_JERSEY_NUMBER') {
      const {
        teamId, playerId, number, playerName,
        seasonsWithTeam, gamesWithTeam, allStarAppearances, championships,
        tier, reason,
      } = (action as any).payload as {
        teamId: number; playerId: string; number: string; playerName: string;
        seasonsWithTeam: number; gamesWithTeam: number;
        allStarAppearances: number; championships: number;
        tier: import('../types').RetiredJerseyRecord['tier'];
        reason: import('../types').RetiredJerseyRecord['reason'];
      };
      setState(prev => {
        const team = prev.teams.find(t => t.id === teamId);
        if (!team) return prev;
        const player = prev.players.find(p => p.internalId === playerId);
        const existing = ((team as any).retiredJerseyNumbers ?? []) as import('../types').RetiredJerseyRecord[];
        if (existing.some(j => j.playerId === playerId)) return prev;
        const newRecord: import('../types').RetiredJerseyRecord = {
          number, text: playerName,
          pid: (player as any)?.pid,
          playerId,
          seasonRetired: prev.leagueStats?.year ?? new Date(prev.date).getFullYear(),
          teamId,
          reason, tier,
        };
        const teamDisplayName = [team.region, team.name].filter(Boolean).join(' ');
        const accoladeBits: string[] = [];
        if (allStarAppearances > 0) accoladeBits.push(`${allStarAppearances}× All-Star`);
        if (championships > 0) accoladeBits.push(`${championships}× Champion`);
        const accoladeStr = accoladeBits.length
          ? ` The honor follows a franchise tenure that included ${accoladeBits.join(', ')}.`
          : '';
        const newsItem: import('../types').NewsItem = {
          id: `jersey-retire-${playerId}-${teamId}-${Date.now()}`,
          headline: `${teamDisplayName} Retire #${number} for ${playerName}`,
          content: `${teamDisplayName} have retired #${number} in honor of ${playerName}, recognizing ${seasonsWithTeam} seasons and ${gamesWithTeam} games with the franchise.${accoladeStr}`,
          date: prev.date,
          category: 'Transaction',
          isNew: true,
          read: false,
        };
        const historyEntry: import('../types').HistoryEntry = {
          text: `${teamDisplayName} retired #${number} in honor of ${playerName}.`,
          date: prev.date,
          type: 'Jersey Retirement',
          playerIds: [playerId],
        };
        return {
          ...prev,
          teams: prev.teams.map(t =>
            t.id === teamId ? { ...t, retiredJerseyNumbers: [...existing, newRecord] } : t
          ),
          news: [newsItem, ...(prev.news ?? [])],
          history: [...(prev.history ?? []), historyEntry],
        };
      });
      return;
    }

    const isClubbing = action.type === 'GO_TO_CLUB';
    const isWatchingGame = action.payload?.isWatchingGame === true;
    setState(prev => ({
      ...prev,
      isProcessing: true,
      isClubbing: isClubbing,
      isWatchingGame: isWatchingGame,
      pendingStartPayload: action.type === 'START_GAME' ? action.payload : prev.pendingStartPayload,
      lastActionType: action.type,
      lastActionPayload: action.payload,
      lastSimResults: [],
      simCurrentDate: undefined,
      prevTeams: prev.teams,
    }));

    if (isClubbing) {
        setTimeout(() => {
            setState(prev => ({ ...prev, isClubbing: false }));
        }, SettingsManager.getDelay(5000));
    }

    try {
      let newStatePatch: Partial<GameState> = {};

      if (action.type === 'START_GAME') {
        const genId = ++generationIdRef.current;
        setState(prev => ({ ...prev, isProcessing: true, pendingStartPayload: action.payload }));

        const payloadWithProgress = {
          ...action.payload,
          onProgress: (progress: any) => {
            setState(prev => ({ ...prev, lazySimProgress: progress }));
          },
        };

        const newStatePatch = await handleStartGame(payloadWithProgress);

        setState(prev => {
          if (genId === generationIdRef.current) {
            return { ...prev, ...newStatePatch, lazySimProgress: undefined, pendingStartPayload: undefined };
          }
          return prev;
        });
        return;
      } else if (action.type === 'ANNOUNCE_CHANGE') {
        newStatePatch = await handleAnnounceChange(state, action.payload);
      } else if (action.type === 'UPDATE_RULES') {
        const updatedLeagueStats = { ...state.leagueStats, ...action.payload };
        let updatedSchedule = state.schedule;
        // When a media deal is finalized, re-attach broadcasters to all unplayed games
        if (action.payload.mediaRights) {
          const { attachBroadcastersToGames } = await import('../utils/broadcastingUtils');
          updatedSchedule = attachBroadcastersToGames(state.schedule, action.payload.mediaRights, state.teams);
        }
        newStatePatch = {
          leagueStats: updatedLeagueStats,
          schedule: updatedSchedule,
          isProcessing: false
        };
      } else if (action.type === 'SEND_CHAT_MESSAGE') {
        // Handle chat message
        const { chatId, text, imageUrl, targetId, targetName, targetRole, targetOrg, avatarUrl, isHypnotized } = action.payload;
        
        // 1. Add user message immediately
        let newChats = [...stateRef.current.chats];
        let chatIndex = newChats.findIndex(c => c.id === chatId);
        let chat = chatIndex !== -1 ? { ...newChats[chatIndex] } : null;

        if (!chat && targetId) {
          // Check if a chat with this target already exists by participants
          const existingChatIndex = newChats.findIndex(c => 
            c.participants.includes('commissioner') && c.participants.includes(targetId)
          );
          
          if (existingChatIndex !== -1) {
            chat = { ...newChats[existingChatIndex] };
            chatIndex = existingChatIndex;
          }
        }

        if (!chat) {
          // Create new chat
          chat = {
            id: chatId || `chat-${Date.now()}`,
            participants: ['commissioner', targetId],
            participantDetails: [
              { id: 'commissioner', name: stateRef.current.commissionerName, role: 'Commissioner' },
              { id: targetId, name: targetName, role: targetRole, avatarUrl }
            ],
            messages: [],
            unreadCount: 0,
            isTyping: true
          };
          newChats.unshift(chat);
          chatIndex = 0;
        } else {
          chat.isTyping = true;
          chat.messages = chat.messages.map(m => ({ ...m, seen: true })); // Mark previous messages as seen when user replies
          newChats[chatIndex] = chat;
          // Move to top
          newChats.splice(chatIndex, 1);
          newChats.unshift(chat);
          chatIndex = 0;
        }

        const gameDate = new Date(stateRef.current.date);
        const now = new Date();
        gameDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        const timestamp = gameDate.toISOString();

        const userMessage = {
          id: `msg-${Date.now()}`,
          senderId: 'commissioner',
          senderName: stateRef.current.commissionerName,
          text,
          imageUrl,
          timestamp,
          read: true,
          seen: false,
          type: 'text' as const
        };

        chat.messages = [...chat.messages, userMessage];
        // Limit history to 100 messages in state (50 for prompt is handled in llm service)
        if (chat.messages.length > 100) {
          chat.messages = chat.messages.slice(-100);
        }
        chat.lastMessage = userMessage;

        setState(prev => ({ ...prev, chats: newChats, isProcessing: false })); // Update UI immediately

        // 2. Get LLM response asynchronously
        try {
          const responseText = await sendChatMessage(stateRef.current, targetName, targetRole, targetOrg, chat.messages, isHypnotized, targetId);

          // If hypnotized, add to pending hypnosis to be processed next day
          if (isHypnotized) {
              const commandText = text.replace('[HYPNOTIC COMMAND]: ', '').trim();
              dispatchAction({
                  type: 'ADD_PENDING_HYPNOSIS',
                  payload: { targetName, command: commandText }
              });
              
              // Set outcome for hypnotize so the user knows it worked
              setState(prev => ({
                  ...prev,
                  lastOutcome: `Hypnotic command transmitted to ${targetName}. They are now under your influence. The effects will manifest as the simulation progresses.`
              }));
          }

          // 3. Add bot message with realistic delay and potential splitting
          if (responseText && responseText.trim().length > 0 && !responseText.toLowerCase().includes("[seen zone]")) {
            // Split by sentences or paragraphs for realism if long
            const parts = responseText.split(/\n\n+/).filter(p => p.trim().length > 0);
            
            for (let i = 0; i < parts.length; i++) {
              // Typing delay based on length
              const part = parts[i];
              const baseDelay = Math.min(3000, Math.max(1000, part.length * 20));
              const delay = SettingsManager.getDelay(baseDelay);
              await new Promise(resolve => setTimeout(resolve, delay));

              setState(prev => {
                const updatedChats = [...prev.chats];
                const updatedChatIndex = updatedChats.findIndex(c => c.id === chat!.id);
                if (updatedChatIndex !== -1) {
                  const updatedChat = { ...updatedChats[updatedChatIndex] };
                  // Only stop typing on the last part
                  if (i === parts.length - 1) {
                    updatedChat.isTyping = false;
                  }
                  
                  const botTimestamp = new Date(timestamp);
                  botTimestamp.setSeconds(botTimestamp.getSeconds() + i + 1);

                  const botMessage = {
                    id: `msg-${Date.now()}-${i}`,
                    senderId: targetId,
                    senderName: targetName,
                    text: part,
                    timestamp: botTimestamp.toISOString(),
                    read: false,
                    seen: false,
                    type: 'text' as const
                  };
                  updatedChat.messages = [...updatedChat.messages, botMessage];
                  updatedChat.lastMessage = botMessage;
                  updatedChat.unreadCount += 1;
                  updatedChats[updatedChatIndex] = updatedChat;
                }
                return { ...prev, chats: updatedChats };
              });
            }
          } else {
            // Seen zone or empty response
            const baseDelay = 1500 + Math.random() * 2000;
            const delay = SettingsManager.getDelay(baseDelay);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            setState(prev => {
              const updatedChats = [...prev.chats];
              const updatedChatIndex = updatedChats.findIndex(c => c.id === chat!.id);
              if (updatedChatIndex !== -1) {
                const updatedChat = { ...updatedChats[updatedChatIndex], isTyping: false };
                // Mark user message as seen
                updatedChat.messages = updatedChat.messages.map(m => 
                  m.senderId === 'commissioner' ? { ...m, seen: true } : m
                );
                updatedChats[updatedChatIndex] = updatedChat;
              }
              return { ...prev, chats: updatedChats };
            });
          }
        } catch (error) {
          console.error("Chat LLM Error:", error);
          setState(prev => {
            const updatedChats = [...prev.chats];
            const updatedChatIndex = updatedChats.findIndex(c => c.id === chat!.id);
            if (updatedChatIndex !== -1) {
              const updatedChat = { ...updatedChats[updatedChatIndex], isTyping: false };
              updatedChats[updatedChatIndex] = updatedChat;
            }
            return { ...prev, chats: updatedChats };
          });
        }
        return;
      } else if (action.type === 'SIMULATE_TO_DATE') {
        // ── UNIFIED: ALL simulate-to-date goes through runLazySim ──
        // Always overlay mode — shows the progress screen (phase labels, %).
        // Short skips (≤30d) use batch=1 for precise event ordering.
        // Long skips (>30d) use batch=7 for speed.
        const targetNorm = normalizeDate(action.payload.targetDate);
        const currentNorm = normalizeDate(stateRef.current.date);
        const diffDays = Math.round(
          (new Date(`${targetNorm}T00:00:00Z`).getTime() - new Date(`${currentNorm}T00:00:00Z`).getTime()) /
          (1000 * 60 * 60 * 24)
        );
        console.log('[SIM_TO_DATE] ▶️ dispatched', {
          rawTargetDate: action.payload.targetDate,
          targetNorm,
          currentStateDate: stateRef.current.date,
          currentNorm,
          diffDays,
          stateDay: stateRef.current.day,
        });
        const genId = ++generationIdRef.current;
        // Short sims (≤30 days, e.g. playoff round) use silent mode to avoid
        // the full-screen lazy-sim overlay that looks like the jumpstart screen.
        const simMode = diffDays > 30 ? 'overlay' : 'silent';
        // stopBefore: true — land on opening night with games unplayed.
        const stopBefore = action.payload?.stopBefore === true;
        const assistantGM = action.payload?.assistantGM === true;
        console.log('[SIM_TO_DATE] ⚙️ runLazySim options', {
          simMode,
          batchSize: diffDays > 30 ? 7 : 1,
          stopBefore,
          assistantGM,
        });
        // Overlay mode: pre-seed lazySimProgress BEFORE the dynamic import so the
        // full-screen progress ring renders immediately — no "Processing Executive
        // Order" flash while the chunk loads.
        if (simMode === 'overlay') {
          flushSync(() => setState(prev => ({
            ...prev,
            lazySimProgress: {
              currentDate: currentNorm,
              targetDate: targetNorm,
              daysComplete: 0,
              daysTotal: diffDays,
              currentPhase: 'Warming up simulation...',
              percentComplete: 0,
            },
          })));
        }
        const { runLazySim } = await import('../services/logic/lazySimRunner');
        const result = await runLazySim(
          stateRef.current,
          action.payload.targetDate,
          (progress: any) => {
            if (simMode === 'overlay') {
              setState(prev => ({ ...prev, lazySimProgress: progress }));
            } else {
              // Silent mode fallback: keep the date current on no-games days.
              // On game days, onGame takes over with finer-grained per-game updates.
              setState(prev =>
                prev.simCurrentDate === progress.currentDate ? prev : { ...prev, simCurrentDate: progress.currentDate }
              );
            }
          },
          {
            mode: simMode,
            batchSize: diffDays > 30 ? 7 : 1,
            stopBefore,
            assistantGM,
            // Silent mode: fire per-game so simCurrentDate "dances" with games as they
            // finish. flushSync defeats React 18 batching so each game's date paints
            // before the next game's sync sim call. Normalize to YYYY-MM-DD to stay
            // in lockstep with the progress-callback format.
            onGame: simMode === 'silent' ? (gameResult: any) => {
              const raw = gameResult?.date;
              if (!raw) return;
              const d = normalizeDate(raw);
              flushSync(() => {
                setState(prev => (prev.simCurrentDate === d ? prev : { ...prev, simCurrentDate: d }));
              });
            } : undefined,
          }
        );
        console.log('[SIM_TO_DATE] ✅ runLazySim returned', {
          endStateDate: result.state.date,
          endStateDay: result.state.day,
          endNorm: normalizeDate(result.state.date),
          lastSimResultsCount: result.lastSimResults.length,
          lastSimResultsDates: [...new Set(result.lastSimResults.map((r: any) => r.date))],
        });
        setState(prev => {
          if (genId !== generationIdRef.current) {
            console.log('[SIM_TO_DATE] ⚠️ genId mismatch — discarding result', { genId, current: generationIdRef.current });
            return prev;
          }
          return {
            ...prev,
            ...result.state,
            lazySimProgress: undefined,
            simCurrentDate: undefined,
            isProcessing: false,
            lastSimResults: result.lastSimResults.length > 0 ? result.lastSimResults : prev.lastSimResults,
          };
        });
        return;
      } else {
        const assistantGM = action.payload?.assistantGM === true;
        if (assistantGM) setAssistantGMActive(true);
        try {
          newStatePatch = await processTurn(
            stateRef.current,
            action,
            undefined,
            undefined,
          );
        } finally {
          if (assistantGM) setAssistantGMActive(false);
        }
      }

      if (action?.type === 'WAIVE_PLAYER') {
        const targetId = (action as any).payload?.targetId ?? (action as any).payload?.contacts?.[0]?.id;
        const before = stateRef.current.players.find((p: any) => p.internalId === targetId);
        const after = newStatePatch.players?.find((p: any) => p.internalId === targetId);
        console.log('[GameContext] WAIVE_PLAYER result merge', {
          targetId,
          patchHasPlayers: !!newStatePatch.players,
          patchPlayersCount: newStatePatch.players?.length,
          beforeTid: before?.tid,
          beforeStatus: before?.status,
          afterTid: after?.tid,
          afterStatus: after?.status,
        });
      }

      // Phase 1 (immediate — show modal)
      // Sync stateRef inside the updater so back-to-back awaited dispatches
      // (e.g. WAIVE_PLAYER followed by the gate's pending ADVANCE_DAY) see
      // the post-merge state instead of the stale pre-dispatch ref. Without
      // this, the second processTurn runs against the unwaived roster and
      // overwrites the waive when its newStatePatch lands.
      setState(prev => {
        const merged = {
          ...prev,
          ...newStatePatch,
          stats: newStatePatch.stats || prev.stats,
          leagueStats: newStatePatch.leagueStats || prev.leagueStats,
          lastOutcome: newStatePatch.lastOutcome !== undefined ? newStatePatch.lastOutcome : prev.lastOutcome,
          lastConsequence: newStatePatch.lastConsequence || prev.lastConsequence,
          date: newStatePatch.date || prev.date,
          day: newStatePatch.day || prev.day,
          teams: newStatePatch.teams || prev.teams,
          players: newStatePatch.players || prev.players,
          schedule: newStatePatch.schedule || prev.schedule,
          lastSimResults: newStatePatch.lastSimResults || [],
          isProcessing: false,
        };
        stateRef.current = merged as any;
        return merged;
      });

        // Phase 2 (background — silent patch inbox/news/social)
        setTimeout(() => {
          setState(prev => {
            // Merge new chats with existing — don't overwrite if patch is empty
            const patchChats = newStatePatch.chats;
            const mergedChats = patchChats && patchChats.length > 0
              ? patchChats
              : prev.chats;
            return {
              ...prev,
              inbox: (newStatePatch.inbox ?? []).length > 0 ? newStatePatch.inbox! : prev.inbox,
              news: (newStatePatch.news ?? []).length > 0 ? newStatePatch.news! : prev.news,
              socialFeed: (newStatePatch.socialFeed ?? []).length > 0
                ? newStatePatch.socialFeed!
                : prev.socialFeed,
              chats: mergedChats,
            };
          });
        }, 100);

      // Phase 3 — fire generateLeaguePulse in background
      // Only for ADVANCE_DAY and similar non-action turns
      if (!action || action.type === 'ADVANCE_DAY') {
        const shouldRunPulse = Math.random() < ((newStatePatch as any).daysSimulated > 1 ? 0.90 : 0.60);
        if (shouldRunPulse) {
          import('../services/llm/llm').then(({ generateLeaguePulse }) => {
            generateLeaguePulse(stateRef.current, (newStatePatch as any).lastSimResults || []).then(pulse => {
              if (!pulse || (!pulse.newNews?.length && !pulse.newSocialPosts?.length && !pulse.newEmails?.length)) return;
              setState(prev => {
                const existingPostIds = new Set(prev.socialFeed.map((p: any) => p.id));
                const existingNewsIds = new Set(prev.news.map((n: any) => n.id));
                const existingEmailIds = new Set(prev.inbox.map((e: any) => e.id));
                const newPosts = (pulse.newSocialPosts || [])
                  .filter((p: any) => !existingPostIds.has(p.id))
                  .map((p: any, i: number) => ({ ...p, id: p.id || `pulse-${Date.now()}-${i}`, isNew: true }));
                const newNews = (pulse.newNews || [])
                  .filter((n: any) => !existingNewsIds.has(n.id))
                  .map((n: any, i: number) => ({ ...n, id: n.id || `pulse-news-${Date.now()}-${i}`, isNew: true }));
                const newEmails = (pulse.newEmails || [])
                  .filter((e: any) => !existingEmailIds.has(e.id));
                return {
                  ...prev,
                  socialFeed: [...newPosts, ...prev.socialFeed].slice(0, 500),
                  news: [...newNews, ...prev.news],
                  inbox: [...newEmails, ...prev.inbox],
                };
              });
            }).catch(err => console.warn('[Pulse] Background league pulse failed:', err));
          });
        }
      }
    } catch (error) {
      console.error("Failed to process action:", error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        lazySimProgress: undefined,
        lastOutcome: "An error occurred while processing your action. The simulation glitched."
      }));
    }
  };
  useEffect(() => {
    if (!state.players || state.players.length === 0) return;
    const sorted = [...state.players]
      .filter(p => p.status === 'Active')
      .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
    sorted.forEach((player, i) => {
      setTimeout(() => prefetchPlayerBio(player), i * 4000);
    });
  }, [!!state.players?.length]);

  // Lazy-load staff when the browser is idle after game init
  useEffect(() => {
    if (!state.isDataLoaded || state.staff || !state.players?.length || !state.teams?.length) return;

    const load = () => {
      Promise.all([
        import('../services/staffService'),
        import('../data/photos/coaches'),
      ]).then(([staffMod, coachesMod]) => {
        const teamNameMap = new Map(state.teams.map(t => [t.name.toLowerCase(), t]));
        Promise.all([
          staffMod.getStaffData(state.players, teamNameMap),
          coachesMod.fetchCoachData(),
          import('../services/staff/staffFallback'),
        ]).then(([staff, _, fallbackMod]) => {
          // Append synthetic staff for non-NBA clubs (Endesa, Euroleague, …)
          // so CoachingView / TeamIntel / etc. don't show "Unknown Coach".
          const nonNba = fallbackMod.generatePlaceholderNonNBAStaff(state);
          const merged = {
            ...staff,
            coaches: [...(staff.coaches ?? []), ...nonNba.coaches],
            gms: [...(staff.gms ?? []), ...nonNba.gms],
            owners: [...(staff.owners ?? []), ...nonNba.owners],
          };
          setState(prev => ({ ...prev, staff: merged }));
        });
      });
    };

    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(load, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(load, 2000);
      return () => clearTimeout(id);
    }
  }, [state.isDataLoaded, !!state.staff]);

  const placeBet = (bet: { type: Bet['type']; wager: number; potentialPayout: number; legs: BetLeg[] }) => {
    const newBet: Bet = {
      id: `bet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: state.date,
      type: bet.type,
      status: 'pending',
      wager: bet.wager,
      potentialPayout: bet.potentialPayout,
      legs: bet.legs,
    };
    setState(prev => ({
      ...prev,
      bets: [newBet, ...(prev.bets ?? [])],
      stats: {
        ...prev.stats,
        personalWealth: Math.max(0, Number((prev.stats.personalWealth - bet.wager / 1_000_000).toFixed(4))),
      },
    }));
  };

  return (
    <GameContext.Provider value={{
      state,
      dispatchAction,
      placeBet,
      currentView,
      setCurrentView,
      selectedTeamId,
      setSelectedTeamId,
      navigateToTeam,
      navigateToTeamFinances,
      pendingStatSort,
      setPendingStatSort,
      ...actions
    }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};
