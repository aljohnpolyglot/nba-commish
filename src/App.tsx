import React, { useState, useEffect, useRef } from 'react';
import { GameProvider, useGame } from './store/GameContext';
import { Sidebar } from './components/Sidebar';
import { OutcomeView } from './components/OutcomeView';
import { SimDateDisplay } from './components/common/SimDateDisplay';
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
import { OffseasonNextActionButton, OffseasonPhaseBadge, OffseasonAufgabenSidebar, OffseasonAufgabenMobileSheet, OffseasonFATagFooter, OffseasonTrainingCampFooter, OffseasonTransferMarketFooter } from './components/offseason/OffseasonAufgaben';
import { getVisibleOffseasonRows } from './services/offseason/offseasonState';
import { TransferResolutionModal } from './components/transferMarket/EuroTransferMarketView';
import { LazySimLoadingScreen } from './components/setup/LazySimLoadingScreen';
import { LeagueTypeSelector, type LeagueType, type ModdedLeagueBase, type EuropeMarket } from './components/setup/LeagueTypeSelector';
import { useLeagueLabels } from './utils/leagueLabels';
import { Menu, Trophy, X } from 'lucide-react';
import { SaveManager } from './services/SaveManager';
import { ErrorBoundary } from './components/common/ErrorBoundary';

function buildPersistableState(state: any) {
  const {
    isProcessing,
    isClubbing,
    isWatchingGame,
    lazySimProgress,
    pendingStartPayload,
    prevTeams,
    lastSimResults,
    simCurrentDate,
    lastActionType,
    lastActionPayload,
    ...persistable
  } = state;
  void isProcessing;
  void isClubbing;
  void isWatchingGame;
  void lazySimProgress;
  void pendingStartPayload;
  void prevTeams;
  void lastSimResults;
  void simCurrentDate;
  void lastActionType;
  void lastActionPayload;
  return persistable;
}

const EuroCashChip: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { state } = useGame();
  if (!isEuroIsolatedMode(state) || state.gameMode !== 'gm') return null;
  const team = state.teams.find(t => t.id === state.userTeamId);
  const cash = team?.tycoon?.cashOnHand;
  if (cash == null) return null;
  const tone = cash < 0 ? 'border-rose-500/50 bg-rose-500/10 text-rose-200'
    : cash < 2_000_000 ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  return (
    <button
      onClick={onClick}
      className={`h-9 px-3 rounded-xl border ${tone} text-xs font-black uppercase tracking-widest tabular-nums hover:bg-white/10 transition-colors`}
      title="Open Front Office"
    >
      Cash €{(cash / 1_000_000).toFixed(1)}M
    </button>
  );
};

const EuroleagueWelcomeModal: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const pending = state.pendingEuroleagueWelcome;
  if (!pending || state.gameMode !== 'gm') return null;

  const finishText = pending.endesaFinish ? `after finishing #${pending.endesaFinish} in Liga Endesa` : 'through your Liga Endesa finish';
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
            {pending.teamName} earned Spain's open EuroLeague place {finishText}. Next season adds a continental calendar, tougher travel, and bigger nights before the Final Four.
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
  const [activeMiniGame, setActiveMiniGame] = useState<'throne' | 'dunk' | '3point' | 'shooting-stars' | 'skills' | 'horse' | 'olympics' | null>(null);
  const [tycoonWelcomeOpen, setTycoonWelcomeOpen] = useState(false);
  const { state, dispatchAction, currentView, setCurrentView } = useGame();
  const labels = useLeagueLabels();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestStateRef = useRef(state);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const hasOffseasonRows = React.useMemo(() => {
    if (!state.offseasonChecklist) return false;
    return getVisibleOffseasonRows(
      state.leagueStats,
      null,
      state.date,
      (state as any).expansionSchedule,
      state.offseasonChecklist,
      {
        lotteryResolved: !!(state.draftLotteryResult && state.draftLotteryResult.length > 0),
        draftComplete: !!state.draftComplete,
      },
    ).length > 0;
  }, [
    state.offseasonChecklist,
    state.leagueStats,
    state.date,
    (state as any).expansionSchedule,
    state.draftLotteryResult,
    state.draftComplete,
  ]);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    fetchStatmuseData();
    fetchAvatarData();
    fetchNBAMemes();
    fetchInjuryData();
    fetchPlayerInjuryData();
    loadSponsorCatalog();
  }, []);

  useEffect(() => {
    if (state.isDataLoaded && state.leagueType !== 'fictional') {
      fetchCharaniaPhotos();
    }
  }, [state.isDataLoaded, state.leagueType]);

  // Tycoon Welcome: fire 3-slide intro on first Euro-Isolated save load (per-browser, once).
  useEffect(() => {
    if (!state.isDataLoaded) return;
    if (!isEuroIsolatedMode(state)) return;
    if (hasSeenTycoonWelcome()) return;
    setTycoonWelcomeOpen(true);
  }, [state.isDataLoaded, state.leagueStats?.uiMode]);

  useEffect(() => {
    const runAutosave = async () => {
      const snapshot = latestStateRef.current;
      if (!snapshot.isDataLoaded || snapshot.isProcessing || !snapshot.commissionerName) return;
      if (saveInFlightRef.current) {
        pendingSaveRef.current = true;
        return;
      }
      saveInFlightRef.current = true;
      try {
        const modePrefix = snapshot.gameMode === 'gm' ? 'GM' : 'Commissioner';
        const saveName = `${modePrefix}: ${snapshot.commissionerName}'s Legacy`;
        const persistableState = buildPersistableState(snapshot);
        const id = await SaveManager.saveGame(persistableState, saveName);
        if (!latestStateRef.current.saveId) {
          await dispatchAction({ type: 'UPDATE_SAVE_ID', payload: id } as any);
        }
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

    if (state.isDataLoaded && !state.isProcessing && state.commissionerName) {
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
      if (document.visibilityState === 'hidden') flushAutosave();
    };

    window.addEventListener('pagehide', flushAutosave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      window.removeEventListener('pagehide', flushAutosave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.isDataLoaded, state.isProcessing, state.commissionerName, state.gameMode, dispatchAction]);

  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const loadingMessages = [
    "Loading rosters, staff, and league data...",
    "Negotiating TV rights with major networks...",
    "Reviewing collective bargaining agreements...",
    "Scouting top prospects for the next draft...",
    "Consulting with team owners on league expansion...",
    "Finalizing the schedule for the upcoming season...",
    "Briefing the referees on new rule changes...",
    "Preparing the commissioner's inaugural address...",
    "Checking in with the players' union representatives...",
    "Setting up the luxury tax distribution model..."
  ];

  useEffect(() => {
    if (state.isProcessing && !state.isDataLoaded) {
      const interval = setInterval(() => {
        setLoadingMessageIndex(prev => (prev + 1) % loadingMessages.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [state.isProcessing, state.isDataLoaded]);

  if (!state.isDataLoaded) {
    // Rich lazy-sim progress screen
    if (state.lazySimProgress) {
      return <LazySimLoadingScreen progress={state.lazySimProgress} />;
    }

    if (state.isProcessing) {
      return (
        <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-slate-200 p-6">
          <div className="relative mb-8">
            <div className="w-20 h-20 border-4 border-indigo-500/20 rounded-full"></div>
            <div className="absolute inset-0 w-20 h-20 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
            </div>
          </div>
          
          <h1 className="text-3xl font-black tracking-tight mb-2 text-center bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-slate-400">
            Initializing {labels.appTitle}
          </h1>
          
          <div className="h-6 flex items-center justify-center">
            <p className="text-slate-400 font-medium animate-pulse">
              {loadingMessages[loadingMessageIndex]}
            </p>
          </div>

        </div>
      );
    }
    
    if (setupPhase === 'leagueType') {
      return <LeagueTypeSelector
        onSelect={({ leagueType: type, moddedLeagueBase: base, europeMarket: market }) => {
          setLeagueType(type);
          setModdedLeagueBase(base ?? 'nba');
          setEuropeMarket(market);
          if (type === 'modded') prewarmRoster();
          setSetupPhase('commish');
        }}
        onBack={() => { setSetupPhase(null); setLeagueType(null); setModdedLeagueBase('nba'); setEuropeMarket(undefined); }}
      />;
    }

    if (setupPhase === 'commish' && leagueType) {
      return <CommissionerSetup
        leagueType={leagueType}
        onStart={async (payload) => {
          const { euroCareerSeed, euroCareerLeagueId, ...startPayload } = payload as any;
          setSetupPhase(null);
          await dispatchAction({ type: 'START_GAME', payload: startPayload });
          if (euroCareerSeed && startPayload.userTeamId != null) {
            await dispatchAction({
              type: 'INIT_EURO_CAREER',
              payload: {
                teamId: startPayload.userTeamId,
                leagueId: euroCareerLeagueId ?? 'endesa',
                seed: euroCareerSeed,
                startDate: startPayload.startDate,
                assistantGM: startPayload.assistantGM === true,
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
        }}
        onBack={() => setSetupPhase('leagueType')}
        moddedLeagueBase={moddedLeagueBase}
        europeMarket={europeMarket}
      />;
    }

    const miniGameNames: Record<string, string> = {
      throne: 'The Throne',
      dunk: 'Dunk Contest',
      '3point': '3-Point Contest',
      'shooting-stars': 'Shooting Stars',
      skills: 'Skills Challenge',
      horse: 'H-O-R-S-E',
      olympics: 'Olympics',
    };
    const miniGameComponents: Record<string, React.ReactNode> = {
      throne: <TheThroneView />,
      dunk: <DunkContestView />,
      '3point': <ThreePointContestView />,
      'shooting-stars': <ShootingStarsView />,
      skills: <SkillsChallengeView />,
      horse: <HorseView />,
      olympics: <OlympicsView />,
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
            onLoadSave={(loadedState) => dispatchAction({ type: 'LOAD_GAME', payload: loadedState })}
            onPlayMiniGame={(game) => setActiveMiniGame(game)}
          />
        )}
      </>
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
            className="p-2 -ml-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
          >
            <Menu size={20} />
          </button>
          {hasOffseasonRows ? (
            <>
              <OffseasonNextActionButton setCurrentView={setCurrentView} />
              <OffseasonPhaseBadge />
            </>
          ) : (
              <PlayButton setCurrentView={setCurrentView} />
          )}
          <EuroCashChip onClick={() => setCurrentView('Front Office')} />
        </div>

        {/* Desktop Play bar — same swap, calendar UI hidden when offseason. */}
        <div className="hidden md:flex px-4 py-2 bg-slate-900/50 border-b border-slate-800/60 items-center gap-3 shrink-0">
          {hasOffseasonRows ? (
            <>
              <OffseasonNextActionButton setCurrentView={setCurrentView} />
              <OffseasonPhaseBadge />
            </>
          ) : (
              <PlayButton setCurrentView={setCurrentView} />
          )}
          <EuroCashChip onClick={() => setCurrentView('Front Office')} />
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-hidden">
            <MainContent currentView={currentView} onViewChange={setCurrentView} />
          </div>
          {/* Global Offseason AUFGABEN rail — desktop only, always visible
              during offseason regardless of which view the user is on. */}
          {hasOffseasonRows && (
            <div className="hidden lg:block w-[320px] shrink-0 border-l border-slate-800 overflow-y-auto scrollbar-hide p-3 bg-slate-950/40">
              <OffseasonAufgabenSidebar />
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
        {state.isClubbing && <ClubEffect />}
        <ToastNotifier />
        <RFAOfferSheetModal />
        <TycoonWelcomeModal open={tycoonWelcomeOpen} onClose={() => setTycoonWelcomeOpen(false)} />
        <EuroleagueWelcomeModal />
        <EuroBankruptcyModal />
        <FinanceRecapModal />
        <PressConferenceModal />
        {isEuroIsolatedMode(state) && <TycoonEventToast />}
        <OffseasonAufgabenMobileSheet />
        <OffseasonFATagFooter />
        <OffseasonTransferMarketFooter />
        <TransferResolutionModal />
        {/* OffseasonTrainingCampFooter removed — the floating "Trim to 15"
            bar nagged the user even when the training-camp pool allows 20.
            The same action lives in the offseason rail; no need to duplicate. */}
        {state.lastOutcome && state.gameMode !== 'gm' && !state.isProcessing && <OutcomeView />}
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
