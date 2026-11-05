import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Bet, BetLeg, GameState, Tab } from '../types';
import { initialState } from './initialState';
import { useGameActions } from './useGameActions';
import { useGameDispatchAction } from './gameContext/useGameDispatchAction';
import { useGameProviderBootstrapEffects, useGameProviderPostLoadEffects } from './providers/gameProviderEffects';
import { useOffseasonChecklistLifecycle } from './providers/useOffseasonChecklistLifecycle';
import { useCommissionerTaskLifecycle } from './providers/useCommissionerTaskLifecycle';
import { useEuroScoutingLifecycle } from './providers/useEuroScoutingLifecycle';
import { useHistoricalEndesaLifecycle } from './providers/useHistoricalEndesaLifecycle';
import { useHistoricalPbaLifecycle } from './providers/useHistoricalPbaLifecycle';
import { useEuroBasketballUniverseLifecycle } from './providers/useEuroBasketballUniverseLifecycle';
import { preloadHOFData } from '../data/HOFData';
import { GameContext, type PendingStatSort } from './gameContextCore';
import { shouldAdvanceAfterAllStarEventDay } from '../services/allStar/allStarSaturdayCompletion';
import { useFranchiseLifecycle } from './providers/useFranchiseLifecycle';
import { getLeagueCalendarDates } from '../services/leagueCalendar';
import { toISODateString } from '../utils/dateUtils';
import { getLongSimCheckpoint, hasActiveLongSim } from '../services/simulation/longSimCoordinator';
import { getMediaRuntimeDiagnostics, resetMediaRuntimeDiagnostics } from '../services/media/mediaRuntimeDiagnostics';
import {
  clearMediaReadModelCache,
  getMediaReadModelDiagnostics,
  resetMediaReadModelDiagnostics,
} from '../services/media/mediaReadModel';
import {
  buildCompletedEuroSeasonReviewPatch,
  getCompletedManagedEuroSeasonResolutions,
  shouldPrepareCompletedEuroSeasonRollover,
} from '../services/competition/euroSeasonReview';
import { getUnresolvedEuroSeasonCompetitionIds, resolveCompetitionSeason } from '../services/competition/competitionResolver';
import { getManagedEuroCompetitions } from '../utils/euroLeagueDefaults';
import { selectCompetitionTeamTids } from '../services/competition/competitionScheduler';
import { matchesBoxScoreSeason, matchesScheduleSeason } from '../services/competition/competitionSeasonState';
import { loadNbaEraPortraitCatalog, setNbaEraPortraitRuntimeContext } from '../services/nbaEraPortraitCatalog';
import {
  SaveManager,
  isExternalSaveRevisionNewer,
  reconcileExternalSaveNoticeAfterReload,
  subscribeToExternalSaveNotices,
  type ExternalSaveNotice,
} from '../services/SaveManager';
import {
  buildGameDeepLink,
  createEntitySlug,
  getGameDeepLinkTab,
  parseGameDeepLink,
  type GameDeepLinkRoute,
} from '../services/navigation/gameDeepLinks';
import { resolveCanonicalPersonId } from '../utils/playerIdentity';

export { useGame } from './gameContextCore';

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const initialDeepLink = typeof window === 'undefined'
    ? { route: null }
    : parseGameDeepLink(window.location.pathname);
  const [state, setState] = useState<GameState>(initialState);
  const [currentView, setCurrentViewState] = useState<Tab>(() => initialDeepLink.route
    ? getGameDeepLinkTab(initialDeepLink.route)
    : 'Schedule');
  const [navigationRoute, setNavigationRoute] = useState<GameDeepLinkRoute | null>(initialDeepLink.route);
  const [navigationError, setNavigationError] = useState<string | null>(initialDeepLink.error ?? null);
  const [navigationBootstrapPending, setNavigationBootstrapPending] = useState(!!initialDeepLink.route);
  const [externalSaveNotice, setExternalSaveNotice] = useState<ExternalSaveNotice | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [injuriesTeamFilter, setInjuriesTeamFilter] = useState<number | null>(null);
  const [pendingStatSort, setPendingStatSort] = useState<PendingStatSort | null>(null);
  const [, setNbaEraPortraitVersion] = useState(0);
  const generationIdRef = useRef(0);
  const stateRef = useRef(state);
  const allStarSaturdayAdvanceRef = useRef<string | null>(null);
  const routeOriginViewRef = useRef<Tab>('Schedule');
  const navigationRouteRef = useRef<GameDeepLinkRoute | null>(initialDeepLink.route);
  const navigationLoadRef = useRef<{ saveId: string; promise: Promise<void> } | null>(null);

  const writeRoute = useCallback((route: GameDeepLinkRoute, replace = false) => {
    if (typeof window === 'undefined') return;
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({ basketCommissionerRoute: true }, '', buildGameDeepLink(route));
  }, []);

  const navigateToRoute = useCallback((route: GameDeepLinkRoute, options?: { replace?: boolean }) => {
    routeOriginViewRef.current = currentView;
    navigationRouteRef.current = route;
    setNavigationRoute(route);
    setNavigationError(null);
    setNavigationBootstrapPending(false);
    setCurrentViewState(getGameDeepLinkTab(route));
    writeRoute(route, options?.replace === true);
  }, [currentView, writeRoute]);

  const navigateToPlayer = useCallback((player: GameState['players'][number], options?: { replace?: boolean }) => {
    const saveId = stateRef.current.saveId;
    if (!saveId) return;
    navigateToRoute({
      kind: 'player',
      saveId,
      personId: resolveCanonicalPersonId(player),
      slug: createEntitySlug(player.name),
    }, options);
  }, [navigateToRoute]);

  const closeDeepLink = useCallback((fallbackView?: Tab) => {
    const nextView = fallbackView ?? routeOriginViewRef.current ?? 'Schedule';
    const wasPushedInApp = typeof window !== 'undefined'
      && window.history.state?.basketCommissionerRoute === true;
    if (wasPushedInApp && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigationRouteRef.current = null;
    setNavigationRoute(null);
    setNavigationError(null);
    setNavigationBootstrapPending(false);
    setCurrentViewState(nextView);
    const saveId = stateRef.current.isDataLoaded ? stateRef.current.saveId : undefined;
    if (typeof window !== 'undefined') {
      window.history.replaceState({ basketCommissionerView: nextView }, '', saveId ? buildGameDeepLink({ kind: 'home', saveId }) : '/');
    }
  }, []);

  const setCurrentView = useCallback((view: Tab) => {
    routeOriginViewRef.current = view;
    setCurrentViewState(view);
    if (!navigationRouteRef.current) {
      if (typeof window !== 'undefined' && stateRef.current.saveId) {
        window.history.replaceState({ basketCommissionerView: view }, '', window.location.href);
      }
      return;
    }
    navigationRouteRef.current = null;
    setNavigationRoute(null);
    setNavigationError(null);
    const saveId = stateRef.current.saveId;
    if (typeof window !== 'undefined' && saveId) {
      window.history.pushState({ basketCommissionerView: view }, '', buildGameDeepLink({ kind: 'home', saveId }));
    }
  }, []);

  useEffect(() => {
    stateRef.current = state;
    (window as any).__nbaGetLiveState = () => stateRef.current;
  }, [state]);

  useEffect(() => {
    if (state.leagueType === 'fictional') return;
    preloadHOFData().catch(() => {});
  }, [state.leagueType, state.saveId]);

  useEffect(() => {
    const enabled = state.leagueType === 'modded' && (state.moddedLeagueBase ?? 'nba') === 'nba';
    setNbaEraPortraitRuntimeContext({ enabled, season: state.leagueStats?.year });
    if (!enabled) return;
    let cancelled = false;
    loadNbaEraPortraitCatalog().then(() => {
      if (!cancelled) setNbaEraPortraitVersion(version => version + 1);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [state.leagueStats?.year, state.leagueType, state.moddedLeagueBase, state.saveId]);

  useGameProviderBootstrapEffects({
    state,
    currentView,
    setCurrentView: setCurrentViewState,
    setState,
    stateRef,
  });

  useOffseasonChecklistLifecycle(state, setState);
  useCommissionerTaskLifecycle(state, setState);
  useEuroScoutingLifecycle(state, setState);
  useHistoricalEndesaLifecycle(state, setState);
  useHistoricalPbaLifecycle(state, setState);
  useEuroBasketballUniverseLifecycle(state, setState);
  useFranchiseLifecycle(state, setState);

  const actions = useGameActions(setState, () => stateRef.current);

  const navigateToTeam = (teamId: number) => {
    setSelectedTeamId(teamId);
    setCurrentView('NBA Central');
  };

  const navigateToTeamFinances = (teamId: number) => {
    setSelectedTeamId(teamId);
    setCurrentView('Team Finances');
  };

  const dispatchAction = useGameDispatchAction({
    state,
    setState,
    setCurrentView,
    stateRef,
    generationIdRef,
    actions,
  });
  const navigationDispatchRef = useRef(dispatchAction);
  navigationDispatchRef.current = dispatchAction;

  useEffect(() => subscribeToExternalSaveNotices(notice => {
    const live = stateRef.current;
    if (!live.isDataLoaded || live.saveId !== notice.saveId) return;
    if (isExternalSaveRevisionNewer(live.saveRevision, notice)) setExternalSaveNotice(notice);
  }), []);

  useEffect(() => {
    if (!externalSaveNotice || externalSaveNotice.kind === 'deleted') return;
    if (state.saveId !== externalSaveNotice.saveId) {
      setExternalSaveNotice(null);
      return;
    }
    if (Number(state.saveRevision ?? 0) >= Number(externalSaveNotice.saveRevision ?? 0)) {
      setExternalSaveNotice(null);
    }
  }, [externalSaveNotice, state.saveId, state.saveRevision]);

  const reloadExternallyUpdatedSave = useCallback(async () => {
    const notice = externalSaveNotice;
    if (!notice || notice.kind === 'deleted') return;
    const loaded = await SaveManager.loadGame(notice.saveId);
    if (!loaded) {
      setExternalSaveNotice({ saveId: notice.saveId, kind: 'deleted' });
      return;
    }
    await dispatchAction({ type: 'LOAD_GAME', payload: loaded });
    setExternalSaveNotice(current => reconcileExternalSaveNoticeAfterReload(
      current,
      notice.saveId,
      loaded.saveRevision,
    ));
  }, [dispatchAction, externalSaveNotice]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const parsed = parseGameDeepLink(window.location.pathname);
      if (parsed.route?.kind === 'home') {
        navigationRouteRef.current = null;
        setNavigationRoute(null);
        setNavigationError(parsed.error ?? null);
        setNavigationBootstrapPending(false);
        setCurrentViewState(getGameDeepLinkTab(
          parsed.route,
          window.history.state?.basketCommissionerView ?? routeOriginViewRef.current,
        ));
        return;
      }
      navigationRouteRef.current = parsed.route;
      setNavigationRoute(parsed.route);
      setNavigationError(parsed.error ?? null);
      if (parsed.route) {
        setCurrentViewState(getGameDeepLinkTab(parsed.route));
        setNavigationBootstrapPending(
          !stateRef.current.isDataLoaded || stateRef.current.saveId !== parsed.route.saveId,
        );
      } else {
        setNavigationBootstrapPending(false);
        setCurrentViewState(routeOriginViewRef.current ?? 'Schedule');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const route = navigationRoute;
    if (!route) {
      setNavigationBootstrapPending(false);
      return;
    }
    if (state.isDataLoaded && state.saveId === route.saveId) {
      navigationLoadRef.current = null;
      setNavigationBootstrapPending(false);
      setCurrentViewState(getGameDeepLinkTab(route));
      return;
    }
    setNavigationBootstrapPending(true);
    setNavigationError(null);
    // Re-subscribe after effect cleanup (including StrictMode) without loading twice.
    if (navigationLoadRef.current?.saveId !== route.saveId) {
      navigationLoadRef.current = {
        saveId: route.saveId,
        promise: (async () => {
          const metadata = (await SaveManager.getMetadata()).find(entry => entry.id === route.saveId);
          if (!metadata) throw new Error('This saved universe is not available in this browser.');
          if (navigationRouteRef.current?.saveId !== route.saveId) return;
          await navigationDispatchRef.current({ type: 'LOAD_GAME', payload: metadata });
        })(),
      };
    }
    const request = navigationLoadRef.current;
    let cancelled = false;
    void (async () => {
      try {
        await request.promise;
        if (cancelled || navigationRouteRef.current?.saveId !== route.saveId) return;
        setCurrentViewState(getGameDeepLinkTab(navigationRouteRef.current));
        setNavigationBootstrapPending(false);
      } catch (error) {
        if (cancelled || navigationRouteRef.current?.saveId !== route.saveId) return;
        setNavigationError(error instanceof Error ? error.message : 'This saved universe could not be opened.');
        setNavigationBootstrapPending(false);
      }
    })();
    return () => { cancelled = true; };
  }, [navigationRoute, state.isDataLoaded, state.saveId]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const qaWindow = window as any;
    qaWindow.__nbaQaDispatchAction = dispatchAction;
    qaWindow.__nbaQaMediaDiagnostics = () => ({
      runtime: getMediaRuntimeDiagnostics(),
      readModel: getMediaReadModelDiagnostics(),
    });
    qaWindow.__nbaQaResetMediaDiagnostics = () => {
      resetMediaRuntimeDiagnostics();
      resetMediaReadModelDiagnostics();
    };
    qaWindow.__nbaQaClearMediaCache = clearMediaReadModelCache;
    qaWindow.__nbaQaLongSimStatus = () => {
      const checkpoint = getLongSimCheckpoint();
      return {
        active: hasActiveLongSim(),
        runId: checkpoint?.runId,
        saveKey: checkpoint?.saveKey,
        targetDate: checkpoint?.targetDate,
        currentDate: checkpoint?.state.date,
        progress: checkpoint?.progress,
        updatedAt: checkpoint?.updatedAt,
      };
    };
    qaWindow.__nbaQaLeagueCalendarDates = (season = stateRef.current.leagueStats.year) => {
      const dates = getLeagueCalendarDates(season, stateRef.current.leagueStats);
      const iso = (date?: Date) => date ? toISODateString(date) : undefined;
      return {
        trainingCampStart: iso(dates.trainingCampStart),
        regularSeasonStart: iso(dates.regularSeasonStart),
        regularSeasonEnd: iso(dates.regularSeasonEnd),
        rollover: iso(dates.rollover),
        scheduleRelease: iso(dates.scheduleRelease),
      };
    };
    qaWindow.__nbaQaEuroSeasonReviewStatus = () => {
      const live = stateRef.current;
      const season = Number(live.leagueStats.year);
      const managedCompetitions = getManagedEuroCompetitions(live as any);
      const completed = getCompletedManagedEuroSeasonResolutions(live);
      return {
        currentYear: season,
        preparedSeason: live.leagueStats.euroRolloverPreparedSeason,
        managedCompetitionIds: managedCompetitions.map(competition => competition.id),
        completedCompetitionIds: completed?.map(resolution => resolution.competitionId) ?? [],
        unresolvedCompetitionIds: getUnresolvedEuroSeasonCompetitionIds(live as any),
        reviewPatchReady: !!buildCompletedEuroSeasonReviewPatch(live),
        rolloverReady: !!completed && shouldPrepareCompletedEuroSeasonRollover(live, completed),
        competitions: managedCompetitions.map(competition => {
          const tids = selectCompetitionTeamTids(competition, live as any);
          const resolution = resolveCompetitionSeason(competition, live.boxScores, season, tids);
          const stored = ((live.competitionHistory?.[competition.id] ?? []) as Array<{
            season?: number;
            championTid?: number;
          }>)
            .find(entry => Number(entry.season) === season);
          return {
            id: competition.id,
            tids: tids.length,
            scheduleTotal: live.schedule.filter(game => game.competitionId === competition.id).length,
            scheduleSeason: live.schedule.filter(game => game.competitionId === competition.id && matchesScheduleSeason(game, season)).length,
            boxesTotal: live.boxScores.filter(game => game.competitionId === competition.id).length,
            boxesSeason: live.boxScores.filter(game => game.competitionId === competition.id && matchesBoxScoreSeason(game, season)).length,
            scheduleSeasons: [...new Set(live.schedule.filter(game => game.competitionId === competition.id).map(game => game.season))],
            boxSeasons: [...new Set(live.boxScores.filter(game => game.competitionId === competition.id).map(game => game.season))],
            storedChampionTid: stored?.championTid,
            resolvedChampionTid: resolution?.championTid,
          };
        }),
      };
    };
    qaWindow.__nbaQaOpenLeagueSettingsReview = () => {
      setState(previous => {
        const season = previous.leagueStats.year;
        const key = `qa-league-settings-${season}`;
        return {
          ...previous,
          commissionerTasks: {
            version: 2,
            records: {
              ...(previous.commissionerTasks?.records ?? {}),
              [key]: {
                key,
                taskId: 'league_settings_review',
                season,
                phase: 'offseason',
                status: 'in_progress',
                openDate: previous.date,
                dueDate: previous.date,
                league: previous.seasonLifecycle?.mode ?? previous.leagueType,
                cycleId: `${previous.seasonLifecycle?.mode ?? previous.leagueType}:${season}`,
                applicable: true,
                availableDate: previous.date,
                prerequisites: [],
                authority: 'manual',
                destination: 'league-settings',
              },
            },
          },
        };
      });
    };
    qaWindow.__nbaQaSaveReload = async (saveName: string, options?: { independent?: boolean }) => {
      const { SaveManager } = await import('../services/SaveManager');
      const before = stateRef.current;
      const checkpoint = options?.independent
        ? (await import('../services/saveIdentity')).createIndependentSaveCopy(before, {
            date: before.date,
            season: before.leagueStats.year,
            sourceRevision: `qa:${before.saveRevision ?? 0}`,
          })
        : before;
      const playerRow = (player: any) => [player.tid, player.status, player.contract?.amount, player.contract?.exp];
      const beforePlayers = new Map(before.players.map(player => [player.internalId, playerRow(player)]));
      const saveStarted = performance.now();
      const saveId = await SaveManager.saveGame(checkpoint, saveName);
      const saveMs = performance.now() - saveStarted;
      const loadStarted = performance.now();
      const loaded = await SaveManager.loadGame(saveId);
      const loadMs = performance.now() - loadStarted;
      if (!loaded) throw new Error(`QA reload returned no state for ${saveId}`);
      await dispatchAction({ type: 'LOAD_GAME', payload: loaded });
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const afterPlayers = new Map(stateRef.current.players.map(player => [player.internalId, playerRow(player)]));
      const playerDifferences = [...new Set([...beforePlayers.keys(), ...afterPlayers.keys()])].flatMap(playerId => {
        const beforeRow = beforePlayers.get(playerId);
        const afterRow = afterPlayers.get(playerId);
        return JSON.stringify(beforeRow) === JSON.stringify(afterRow) ? [] : [{ playerId, before: beforeRow, after: afterRow }];
      });
      return { saveId, saveMs, loadMs, playerDifferenceCount: playerDifferences.length, playerDifferences: playerDifferences.slice(0, 25) };
    };
    return () => {
      if (qaWindow.__nbaQaDispatchAction === dispatchAction) delete qaWindow.__nbaQaDispatchAction;
      delete qaWindow.__nbaQaLongSimStatus;
      delete qaWindow.__nbaQaLeagueCalendarDates;
      delete qaWindow.__nbaQaEuroSeasonReviewStatus;
      delete qaWindow.__nbaQaOpenLeagueSettingsReview;
      delete qaWindow.__nbaQaSaveReload;
      delete qaWindow.__nbaQaMediaDiagnostics;
      delete qaWindow.__nbaQaResetMediaDiagnostics;
      delete qaWindow.__nbaQaClearMediaCache;
    };
  }, [dispatchAction]);

  useEffect(() => {
    if (!state.isDataLoaded || state.isProcessing || !shouldAdvanceAfterAllStarEventDay(state)) return;
    const key = `${state.saveId}:${state.leagueStats.year}:${state.date}`;
    if (allStarSaturdayAdvanceRef.current === key) return;
    allStarSaturdayAdvanceRef.current = key;
    void dispatchAction({ type: 'ADVANCE_DAY' });
  }, [
    dispatchAction,
    state.allStar,
    state.date,
    state.isDataLoaded,
    state.isProcessing,
    state.leagueStats,
    state.schedule,
    state.saveId,
  ]);

  useGameProviderPostLoadEffects(state, setState);

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
    <GameContext.Provider
      value={{
        state,
        dispatchAction,
        placeBet,
        currentView,
        setCurrentView,
        selectedTeamId,
        setSelectedTeamId,
        injuriesTeamFilter,
        setInjuriesTeamFilter,
        navigateToTeam,
        navigateToTeamFinances,
        pendingStatSort,
        setPendingStatSort,
        navigationRoute,
        navigationError,
        navigationBootstrapPending,
        navigateToRoute,
        navigateToPlayer,
        closeDeepLink,
        externalSaveNotice,
        reloadExternallyUpdatedSave,
        ...actions,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};
