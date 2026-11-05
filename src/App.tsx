import React, { useState, useEffect, useRef } from 'react';
import { GameProvider, useGame } from './store/GameContext';
import { Sidebar } from './components/Sidebar';
import { SimDateDisplay } from './components/common/SimDateDisplay';
import { ActionProcessingOverlay } from './components/actions/ActionProcessingOverlay';
import { ActionResultModal } from './components/actions/ActionResultModal';
import { CommissionerSetup } from './components/CommissionerSetup';
import { MainContent } from './components/layout/MainContent';
import { MainMenu } from './components/MainMenu';
import { ClubEffect } from './components/effects/ClubEffect';
import { ToastNotifier } from './components/shared/ToastNotifier';
import { RFAOfferSheetModal } from './components/modals/RFAOfferSheetModal';
import { PlayButton } from './components/shared/PlayButton';
import { TycoonWelcomeModal, hasSeenTycoonWelcome } from './components/tycoon/TycoonWelcomeModal';
import { TycoonEventToast } from './components/tycoon/TycoonEventToast';
import { EuroBankruptcyModal } from './components/tycoon/EuroBankruptcyModal';
import { FinanceRecapModal } from './components/tycoon/FinanceRecapModal';
import { PressConferenceModal } from './components/tycoon/PressConferenceModal';
import { isEuroIsolatedMode } from './utils/uiMode';
import { OffseasonPhaseBadge, OffseasonAufgabenSidebar, OffseasonAufgabenMobileSheet } from './components/offseason/OffseasonAufgaben';
import { getVisibleOffseasonRows, withGovernorsBoardMeetingTask } from './services/offseason/offseasonState';
import { TransferResolutionModal } from './components/transferMarket/EuroTransferMarketView';
import { LazySimLoadingScreen } from './components/setup/LazySimLoadingScreen';
import { LeagueTypeSelector, type LeagueType, type ModdedLeagueBase, type EuropeMarket } from './components/setup/LeagueTypeSelector';
import { stopModdedSetupTrack } from './components/setup/moddedSetupAudio';
import { useLeagueLabels } from './utils/leagueLabels';
import { Loader2, Menu, Trophy, X } from 'lucide-react';
import { SaveManager } from './services/SaveManager';
import { buildPersistableGameState } from './services/saveExport';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { TeamSwitchModal } from './components/modals/TeamSwitchModal';
import { FreeAgencyDailySummaryModal } from './components/modals/FreeAgencyDailySummaryModal';
import { TransferMarketDailySummaryModal } from './components/modals/TransferMarketDailySummaryModal';
import { resolveAnyTeam } from './utils/teamLookup';
import {
  CommissionerOffseasonPhaseBadge,
  CommissionerOffseasonTasksMobileSheet,
  CommissionerOffseasonTasksSidebar,
} from './components/commissioner-tasks/CommissionerOffseasonTasks';
import { shouldShowCommissionerOffseasonTasks } from './services/commissionerTasks/taskRegistry';
import { isHistoricalNbaStart } from './data/historicalNbaSeasons';
import { GmCareerOverlay } from './components/gmCareer/GmCareerOverlay';
import { ChampionshipCelebrationHost } from './components/modals/ChampionshipCelebrationModal';
import { isOffseasonTaskRailActive, resolveLeagueSeasonLifecycle } from './services/lifecycle/leagueSeasonLifecycle';
import { resolveAutosaveRevisionCheckpoint } from './services/saveAutosavePolicy';
import { isInternationalPlayButtonAvailable } from './services/fiba/playTournament';
import {
  persistCommittedSimulationState,
} from './services/simulation/durableSimulationCheckpoint';

const EuroCashChip: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { state } = useGame();
  if (!isEuroIsolatedMode(state) || state.gameMode !== 'gm') return null;
  const team = state.teams.find(t => t.id === state.userTeamId)
    ?? state.nonNBATeams?.find(t => t.tid === state.userTeamId);
  const cash = team?.tycoon?.cashOnHand;
  if (cash == null) return null;
  const tone = cash < 0 ? 'border-rose-500/50 bg-rose-500/10 text-rose-200'
    : cash < 2_000_000 ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  return (
    <button
      onClick={onClick}
      className={`h-9 shrink-0 px-3 rounded-xl border ${tone} text-xs font-black uppercase tracking-widest tabular-nums hover:bg-white/10 transition-colors`}
      title="Open Front Office"
    >
      Cash €{(cash / 1_000_000).toFixed(1)}M
    </button>
  );
};

const ViewLoadingFallback = () => (
  <div className="flex h-full min-h-48 w-full items-center justify-center bg-slate-950 text-slate-400">
    <div className="flex items-center gap-3 text-sm font-bold">
      <Loader2 size={20} className="animate-spin text-indigo-400" />
      Opening view...
    </div>
  </div>
);

const EuroleagueWelcomeModal: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const pending = state.pendingEuroleagueWelcome;
  if (!pending || state.gameMode !== 'gm') return null;

  const domesticSpec = state.activeCompetitions?.find(spec => spec.id === state.euroPrimaryCompetitionId);
  const domesticName = pending.domesticCompetitionName || domesticSpec?.displayName || state.leagueStats.leagueName || 'your domestic league';
  const domesticFinish = pending.domesticFinish ?? pending.endesaFinish;
  const finishText = domesticFinish ? `after finishing #${domesticFinish} in ${domesticName}` : `through your ${domesticName} campaign`;
  const close = () => {
    void dispatchAction({ type: 'UPDATE_STATE' as any, payload: { pendingEuroleagueWelcome: undefined } });
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl border border-amber-400/30 bg-slate-950 shadow-2xl">
        <button onClick={close} className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
          <X size={18} />
        </button>
        <div className="p-6 sm:p-7">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20">
            <Trophy size={28} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300">New Invitation</p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">Welcome to EuroLeague</h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            {pending.teamName} earned an open EuroLeague place {finishText}. Next season adds a continental calendar, tougher travel, and bigger nights before the Final Four.
          </p>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
            Board target: prove this belongs. Compete at home, survive the EuroLeague regular season, and make the club harder to push out next summer.
          </div>
          <button
            onClick={close}
            className="mt-6 w-full rounded-2xl bg-amber-400 py-3 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300 transition-colors"
          >
            Start The Season
          </button>
        </div>
      </div>
    </div>
  );
};

// Lazy load mini-games
const TheThroneView = React.lazy(() => import('./throne/components/TheThroneGame'));
const DunkContestView = React.lazy(() => import('./minigames/dunk/DunkContestMiniGame'));
const ThreePointContestView = React.lazy(() => import('./minigames/threepoint/ThreePointContestMiniGame'));
const ShootingStarsView = React.lazy(() => import('./minigames/shootingstars/ShootingStarsMiniGame'));
const SkillsChallengeView = React.lazy(() => import('./minigames/skills/SkillsChallengeMiniGame'));
const HorseView = React.lazy(() => import('./minigames/horse/HorseMiniGame'));
const OlympicsView = React.lazy(() => import('./minigames/olympics/OlympicsMiniGame'));
const DanceContestView = React.lazy(() => import('./minigames/pbadance/DanceContestStandalone'));
import { fetchStatmuseData } from './data/social/statmuseImages';
import { fetchAvatarData } from './data/avatars';
import { fetchCharaniaPhotos } from './services/social/charaniaphotos';
import { fetchNBAMemes } from './services/social/nbaMemesFetcher';
import { fetchInjuryData } from './services/injuryService';
import { fetchPlayerInjuryData } from './data/playerInjuryData';
import { prewarmRoster } from './services/rosterService';
import { loadSponsorCatalog } from './data/sponsorCatalogFetcher';

function GameLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [setupPhase, setSetupPhase] = useState<null | 'leagueType' | 'commish'>(null);
  const [leagueType, setLeagueType] = useState<LeagueType | null>(null);
  const [moddedLeagueBase, setModdedLeagueBase] = useState<ModdedLeagueBase>('nba');
  const [europeMarket, setEuropeMarket] = useState<EuropeMarket | undefined>(undefined);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupPending, setStartupPending] = useState(false);
  const [activeMiniGame, setActiveMiniGame] = useState<'throne' | 'dunk' | '3point' | 'shooting-stars' | 'skills' | 'horse' | 'olympics' | 'dance' | null>(null);
  const [tycoonWelcomeOpen, setTycoonWelcomeOpen] = useState(false);
  const {
    state,
    dispatchAction,
    currentView,
    setCurrentView,
    navigationBootstrapPending,
    navigationError,
    closeDeepLink,
    externalSaveNotice,
    reloadExternallyUpdatedSave,
  } = useGame();
  const labels = useLeagueLabels();
  const seasonLifecycle = React.useMemo(() => resolveLeagueSeasonLifecycle(state), [state]);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestStateRef = useRef(state);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const loadedSaveRevisionRef = useRef<string | null>(null);
  const hasOffseasonRows = React.useMemo(() => {
    const checklist = withGovernorsBoardMeetingTask(
      state.offseasonChecklist,
      state.pendingGovernorsBoardMeeting,
      state.leagueStats?.year,
    );
    if (!checklist) return false;
    return getVisibleOffseasonRows(
      state.leagueStats,
      null,
      state.date,
      (state as any).expansionSchedule,
      checklist,
      {
        lotteryResolved: !!(state.draftLotteryResult && state.draftLotteryResult.length > 0),
        draftComplete: seasonLifecycle.draft.draft === 'complete',
      },
    ).length > 0;
  }, [
    state.offseasonChecklist,
    state.pendingGovernorsBoardMeeting,
    state.leagueStats,
    state.date,
    (state as any).expansionSchedule,
    state.draftLotteryResult,
    seasonLifecycle.draft.draft,
  ]);
  const offseasonTaskRailActive = isOffseasonTaskRailActive(seasonLifecycle);
  const useLegacyOffseasonTasks = state.gameMode === 'gm'
    && offseasonTaskRailActive
    && hasOffseasonRows;
  const useCommissionerOffseasonTasks = state.gameMode !== 'gm'
    && offseasonTaskRailActive
    && shouldShowCommissionerOffseasonTasks(state);
  const showInternationalPlayButton = currentView === 'International'
    && isInternationalPlayButtonAvailable(state.internationalTournament);
  const initialFantasyDraftActive = state.gameMode === 'gm' && ((state.leagueStats.openingRosterMode === 'fantasy_draft'
    && state.leagueStats.openingFantasyDraftCompleted !== true)
    || (state.leagueType === 'fictional'
      && state.leagueStats.fictionalRosterMode === 'fantasy_draft'
      && state.leagueStats.fictionalFantasyDraftCompleted !== true));
  const needsManagedTeamRecovery = React.useMemo(() => {
    if (!state.isDataLoaded || state.gameMode !== 'gm' || state.userTeamId == null) return false;
    const team = resolveAnyTeam(Number(state.userTeamId), state.teams ?? [], state.nonNBATeams ?? []);
    return !team || (team as any).disabled === true || (team as any).archivedTeam === true;
  }, [state.isDataLoaded, state.gameMode, state.userTeamId, state.teams, state.nonNBATeams]);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (state.isDataLoaded) stopModdedSetupTrack();
  }, [state.isDataLoaded]);

  useEffect(() => {
    let recovering = false;
    const handlePreloadError = (event: Event) => {
      event.preventDefault();
      if (recovering) return;
      recovering = true;
      void (async () => {
        const snapshot = latestStateRef.current;
        try {
          if (snapshot.isDataLoaded && snapshot.commissionerName) {
            const modePrefix = snapshot.gameMode === 'gm' ? 'GM' : 'Commissioner';
            await SaveManager.saveGame(
              buildPersistableGameState(snapshot),
              `${modePrefix}: ${snapshot.commissionerName}'s Legacy`,
            );
          }
        } catch (error) {
          console.warn('[CHUNK_RECOVERY] Autosave before reload failed.', error);
        }
        window.location.reload();
      })();
    };
    window.addEventListener('vite:preloadError', handlePreloadError);
    return () => window.removeEventListener('vite:preloadError', handlePreloadError);
  }, []);

  useEffect(() => {
    fetchInjuryData();
    loadSponsorCatalog();
  }, []);

  useEffect(() => {
    if (!state.isDataLoaded || state.leagueType === 'fictional') return;
    fetchStatmuseData();
    fetchAvatarData();
    fetchNBAMemes();
    fetchPlayerInjuryData();
    fetchCharaniaPhotos();
  }, [state.isDataLoaded, state.leagueType]);

  useEffect(() => {
    if (!state.isDataLoaded) return;
    if (!isEuroIsolatedMode(state)) return;
    if (hasSeenTycoonWelcome(state.saveId)) return;
    setTycoonWelcomeOpen(true);
  }, [state.isDataLoaded, state.leagueStats?.uiMode, state.saveId]);

  useEffect(() => {
    if (!state.durableSavePending) return;
    const protectUnsavedSimulation = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectUnsavedSimulation);
    return () => window.removeEventListener('beforeunload', protectUnsavedSimulation);
  }, [state.durableSavePending]);

  useEffect(() => {
    let backgroundSaveInterval: number | null = null;
    const revisionCheckpoint = resolveAutosaveRevisionCheckpoint(loadedSaveRevisionRef.current, state);
    loadedSaveRevisionRef.current = revisionCheckpoint.key;
    const runAutosave = async () => {
      if (externalSaveNotice || revisionCheckpoint.suppressAutosave) return;
      const snapshot = latestStateRef.current;
      if (!snapshot.isDataLoaded || snapshot.isProcessing || !snapshot.commissionerName) return;
      if (saveInFlightRef.current) {
        pendingSaveRef.current = true;
        return;
      }
      saveInFlightRef.current = true;
      try {
        const durable = await persistCommittedSimulationState(snapshot);
        await dispatchAction({
          type: 'UPDATE_STATE',
          payload: {
            saveId: durable.save.id,
            saveRevision: durable.save.saveRevision,
            durableSavePending: false,
            lastDurableSaveError: undefined,
          },
        } as any);
      } catch (error) {
        console.error(error);
      } finally {
        saveInFlightRef.current = false;
        if (pendingSaveRef.current) {
          pendingSaveRef.current = false;
          void runAutosave();
        }
      }
    };

    if (!revisionCheckpoint.suppressAutosave && state.isDataLoaded && !state.isProcessing && state.commissionerName) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        void runAutosave();
      }, 500);
    }

    const flushAutosave = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      void runAutosave();
    };

    const handleVisibilityChange = () => {
      if (backgroundSaveInterval != null) {
        window.clearInterval(backgroundSaveInterval);
        backgroundSaveInterval = null;
      }
      if (document.visibilityState === 'hidden') {
        flushAutosave();
        backgroundSaveInterval = window.setInterval(flushAutosave, 15_000);
      } else if (latestStateRef.current.durableSavePending) {
        flushAutosave();
      }
    };

    window.addEventListener('pagehide', flushAutosave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (backgroundSaveInterval != null) window.clearInterval(backgroundSaveInterval);
      window.removeEventListener('pagehide', flushAutosave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state, dispatchAction, externalSaveNotice]);

  if (!state.isDataLoaded) {
    if (navigationError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-slate-200">
          <div className="w-full max-w-lg rounded-3xl border border-rose-400/30 bg-slate-900 p-6 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-300">Game link unavailable</p>
            <h1 className="mt-2 text-2xl font-black text-white">This view could not be opened</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{navigationError}</p>
            <button
              type="button"
              onClick={() => closeDeepLink('Schedule')}
              className="mt-6 w-full rounded-xl bg-indigo-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-400"
            >
              Return to saves
            </button>
          </div>
        </div>
      );
    }
    if (state.lazySimProgress) {
      return <LazySimLoadingScreen progress={state.lazySimProgress} />;
    }
    if (navigationBootstrapPending) {
      return <LazySimLoadingScreen progress={{
        kind: 'save-load',
        currentDate: '',
        targetDate: '',
        daysComplete: 0,
        daysTotal: 12,
        currentPhase: 'Opening linked universe...',
        percentComplete: 2,
      }} />;
    }

    if (startupPending || state.isProcessing) {
      return <LazySimLoadingScreen progress={{
        kind: 'league-start',
        currentDate: '',
        targetDate: '',
        daysComplete: 0,
        daysTotal: 10,
        currentPhase: `Starting ${labels.appTitle}...`,
        percentComplete: 1,
      }} />;
    }
    
    if (setupPhase === 'leagueType') {
      return <LeagueTypeSelector
        onSelect={({ leagueType: type, moddedLeagueBase: base, europeMarket: market }) => {
          setStartupError(null);
          setLeagueType(type);
          setModdedLeagueBase(base ?? 'nba');
          setEuropeMarket(market);
          if (type === 'modded' && (base ?? 'nba') === 'nba') prewarmRoster();
          setSetupPhase('commish');
        }}
        onBack={() => { setStartupError(null); setSetupPhase(null); setLeagueType(null); setModdedLeagueBase('nba'); setEuropeMarket(undefined); }}
      />;
    }

    if (setupPhase === 'commish' && leagueType) {
      return (
        <>
          {startupError && (
            <div className="fixed inset-x-3 top-3 z-[200] mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border border-rose-400/40 bg-rose-950/95 p-4 text-rose-100 shadow-2xl backdrop-blur sm:inset-x-6 sm:top-6" role="alert">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-widest text-rose-300">League creation stopped</p>
                <p className="mt-1 text-sm">{startupError}</p>
              </div>
              <button
                type="button"
                onClick={() => setStartupError(null)}
                className="rounded-lg p-1 text-rose-300 hover:bg-white/10 hover:text-white"
                aria-label="Dismiss message"
              >
                <X size={18} />
              </button>
            </div>
          )}
          <CommissionerSetup
            leagueType={leagueType}
            onStart={async (payload) => {
              if (startupPending) return;
              const { euroCareerSeed, euroCareerLeagueId, ...startPayload } = payload as any;
              setStartupError(null);
              setStartupPending(true);
              try {
                await dispatchAction({ type: 'START_GAME', payload: startPayload });
                if (startPayload.gameMode === 'gm' && (startPayload.openingRosterMode === 'fantasy_draft' || startPayload.fictionalRosterMode === 'fantasy_draft')) {
                  setCurrentView('Draft Board');
                } else if (
                  startPayload.gameMode !== 'gm'
                  && startPayload.leagueType === 'modded'
                  && startPayload.moddedLeagueBase === 'nba'
                  && isHistoricalNbaStart(Number(startPayload.nbaStartYear))
                ) {
                  setCurrentView('League News');
                } else if (startPayload.gameMode !== 'gm') {
                  setCurrentView('Commissioner Tasks');
                }
                if (euroCareerSeed && startPayload.userTeamId != null) {
                  await dispatchAction({
                    type: 'INIT_EURO_CAREER',
                    payload: {
                      teamId: startPayload.userTeamId,
                      leagueId: euroCareerLeagueId ?? 'endesa',
                      seed: euroCareerSeed,
                    },
                  });
                }
                if (startPayload.moddedLeagueBase === 'philippines' && startPayload.userTeamId != null) {
                  await dispatchAction({
                    type: 'INIT_PBA_CAREER',
                    payload: {
                      teamId: startPayload.userTeamId,
                      startDate: startPayload.startDate,
                      assistantGM: startPayload.assistantGM === true,
                    },
                  });
                }
                setSetupPhase(null);
              } catch (error) {
                console.error('[START_GAME] League creation failed.', error);
                setStartupError('The league could not be created. Your setup choices are still here, so you can try again.');
                setSetupPhase('commish');
              } finally {
                setStartupPending(false);
              }
            }}
            onBack={() => { setStartupError(null); setSetupPhase('leagueType'); }}
            moddedLeagueBase={moddedLeagueBase}
            europeMarket={europeMarket}
          />
        </>
      );
    }

    const miniGameNames: Record<string, string> = {
      throne: 'The Throne',
      dunk: 'Dunk Contest',
      '3point': '3-Point Contest',
      'shooting-stars': 'Shooting Stars',
      skills: 'Skills Challenge',
      horse: 'H-O-R-S-E',
      olympics: 'Olympics',
      dance: 'Dance Contest',
    };
    const miniGameComponents: Record<string, React.ReactNode> = {
      throne: <TheThroneView />,
      dunk: <DunkContestView />,
      '3point': <ThreePointContestView />,
      'shooting-stars': <ShootingStarsView />,
      skills: <SkillsChallengeView />,
      horse: <HorseView />,
      olympics: <OlympicsView />,
      dance: <DanceContestView />,
    };

    return (
      <>
        {activeMiniGame && miniGameComponents[activeMiniGame] && (
          <div className="fixed inset-0 z-[9999] w-full h-full bg-[#050505] overflow-y-auto">
            <React.Suspense fallback={<div className="w-full h-full bg-slate-950 flex items-center justify-center text-white">Loading {miniGameNames[activeMiniGame]}...</div>}>
              <div className="relative w-full min-h-full">
                {miniGameComponents[activeMiniGame]}
                <button
                  onClick={() => setActiveMiniGame(null)}
                  className="fixed top-4 right-4 z-[10000] p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"
                  title={`Exit ${miniGameNames[activeMiniGame]}`}
                >
                  <X size={24} />
                </button>
              </div>
            </React.Suspense>
          </div>
        )}
        {!activeMiniGame && (
          <MainMenu
            onStartNew={() => setSetupPhase('leagueType')}
            onLoadSave={(save) => dispatchAction({ type: 'LOAD_GAME', payload: save })}
            onPlayMiniGame={(game) => setActiveMiniGame(game)}
          />
        )}
      </>
    );
  }

  if (initialFantasyDraftActive) {
    return (
      <div className="h-screen w-full overflow-hidden bg-slate-950 font-sans text-slate-200 selection:bg-amber-500/30">
        <main className="h-full w-full overflow-hidden">
          <React.Suspense fallback={<ViewLoadingFallback />}>
            <MainContent currentView="Draft Board" onViewChange={setCurrentView} />
          </React.Suspense>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-200 font-sans overflow-hidden selection:bg-indigo-500/30">
      <Sidebar 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Mobile Header: hamburger + Play button (or Offseason CTA + badge). */}
        <div className="md:hidden px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-3 shrink-0">
          <button
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open navigation"
            className="p-2 -ml-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
          >
            <Menu size={20} />
          </button>
          {useLegacyOffseasonTasks && !showInternationalPlayButton ? (
            <OffseasonPhaseBadge />
          ) : useCommissionerOffseasonTasks && !showInternationalPlayButton ? (
            <CommissionerOffseasonPhaseBadge />
          ) : (
              <PlayButton setCurrentView={setCurrentView} />
          )}
          <EuroCashChip onClick={() => setCurrentView('Front Office')} />
        </div>

        {/* Desktop Play bar — same swap, calendar UI hidden when offseason. */}
        <div className="hidden md:flex px-4 py-2 bg-slate-900/50 border-b border-slate-800/60 items-center gap-3 shrink-0">
          {useLegacyOffseasonTasks && !showInternationalPlayButton ? (
            <OffseasonPhaseBadge />
          ) : useCommissionerOffseasonTasks && !showInternationalPlayButton ? (
            <CommissionerOffseasonPhaseBadge />
          ) : (
              <PlayButton setCurrentView={setCurrentView} />
          )}
          <EuroCashChip onClick={() => setCurrentView('Front Office')} />
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-hidden">
            <React.Suspense fallback={<ViewLoadingFallback />}>
              <MainContent currentView={currentView} onViewChange={setCurrentView} />
            </React.Suspense>
          </div>
          {/* Global Offseason AUFGABEN rail — desktop only, always visible
              during offseason regardless of which view the user is on. */}
          {useLegacyOffseasonTasks && (
            <div className="hidden lg:block w-[320px] shrink-0 border-l border-slate-800 overflow-y-auto scrollbar-hide p-3 bg-slate-950/40">
              <OffseasonAufgabenSidebar />
            </div>
          )}
          {useCommissionerOffseasonTasks && (
            <div className="hidden lg:block w-[320px] shrink-0 border-l border-slate-800 overflow-y-auto scrollbar-hide p-3 bg-slate-950/40">
              <CommissionerOffseasonTasksSidebar onNavigate={setCurrentView} />
            </div>
          )}
        </div>

        {/* Long-sim progress overlay (>30 days) */}
        {state.lazySimProgress && (
          <div className="fixed inset-0 z-[9999] bg-slate-950/95 flex items-center justify-center">
            <LazySimLoadingScreen progress={state.lazySimProgress} />
          </div>
        )}
        {!state.isWatchingGame && !state.lazySimProgress && <SimDateDisplay />}
        <ActionProcessingOverlay />
        {state.isClubbing && <ClubEffect />}
        <ToastNotifier
          externalSaveNotice={externalSaveNotice}
          onReloadExternalSave={reloadExternallyUpdatedSave}
          onReturnToSaves={() => window.location.assign('/')}
        />
        <FreeAgencyDailySummaryModal />
        <TransferMarketDailySummaryModal />
        <RFAOfferSheetModal />
        <TycoonWelcomeModal open={tycoonWelcomeOpen} onClose={() => setTycoonWelcomeOpen(false)} saveId={state.saveId} />
        <EuroleagueWelcomeModal />
        <GmCareerOverlay />
        <ChampionshipCelebrationHost />
        <EuroBankruptcyModal />
        <FinanceRecapModal />
        <PressConferenceModal />
        {isEuroIsolatedMode(state) && <TycoonEventToast />}
        {state.gameMode === 'gm' && <OffseasonAufgabenMobileSheet />}
        {state.gameMode !== 'gm' && (
          <CommissionerOffseasonTasksMobileSheet onNavigate={setCurrentView} />
        )}
        <TransferResolutionModal />
        <TeamSwitchModal
          isOpen={needsManagedTeamRecovery}
          onClose={() => {}}
          forceSelection
          reason="dissolved"
        />
        {/* OffseasonTrainingCampFooter removed — the floating "Trim to 15"
            bar nagged the user even when the training-camp pool allows 20.
            The same action lives in the offseason rail; no need to duplicate. */}
        {state.gameMode === 'commissioner' && state.lastActionEffect && !state.isProcessing && <ActionResultModal />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GameProvider>
        <GameLayout />
      </GameProvider>
    </ErrorBoundary>
  );
}
