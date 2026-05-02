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
import { LazySimLoadingScreen } from './components/setup/LazySimLoadingScreen';
import { Menu, X } from 'lucide-react';
import { SaveManager } from './services/SaveManager';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Lazy load mini-games
const TheThroneView = React.lazy(() => import('./throne/components/TheThroneGame'));
const DunkContestView = React.lazy(() => import('./minigames/dunk/DunkContestMiniGame'));
const ThreePointContestView = React.lazy(() => import('./minigames/threepoint/ThreePointContestMiniGame'));
import { fetchStatmuseData } from './data/social/statmuseImages';
import { fetchAvatarData } from './data/avatars';
import { fetchCharaniaPhotos } from './services/social/charaniaphotos';
import { fetchNBAMemes } from './services/social/nbaMemesFetcher';
import { fetchInjuryData } from './services/injuryService';
import { fetchPlayerInjuryData } from './data/playerInjuryData';
import { prewarmRoster } from './services/rosterService';

function GameLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [activeMiniGame, setActiveMiniGame] = useState<'throne' | 'dunk' | '3point' | null>(null);
  const { state, dispatchAction, currentView, setCurrentView } = useGame();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchStatmuseData();
    fetchAvatarData();
    fetchCharaniaPhotos();
    fetchNBAMemes();
    fetchInjuryData();
    fetchPlayerInjuryData();
  }, []);

  // Auto-save effect (Debounced)
  useEffect(() => {
    if (state.isDataLoaded && !state.isProcessing && state.commissionerName) {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout for 2 seconds
      saveTimeoutRef.current = setTimeout(() => {
        const modePrefix = state.gameMode === 'gm' ? 'GM' : 'Commissioner';
        const saveName = `${modePrefix}: ${state.commissionerName}'s Legacy`;
        SaveManager.saveGame(state, saveName).then(id => {
          if (!state.saveId) {
            dispatchAction({ type: 'UPDATE_SAVE_ID', payload: id });
          }
        }).catch(console.error);
      }, 2000);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state, dispatchAction]); // Run on any state change

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
            Initializing NBA Commissioner Simulator
          </h1>
          
          <div className="h-6 flex items-center justify-center">
            <p className="text-slate-400 font-medium animate-pulse">
              {loadingMessages[loadingMessageIndex]}
            </p>
          </div>

        </div>
      );
    }
    
    if (showSetup) {
      return <CommissionerSetup 
        onStart={(payload) => {
          setShowSetup(false);
          dispatchAction({ type: 'START_GAME', payload });
        }} 
        onBack={() => setShowSetup(false)}
      />;
    }

    const miniGameNames: Record<string, string> = { throne: 'The Throne', dunk: 'Dunk Contest', '3point': '3-Point Contest' };
    const miniGameComponents: Record<string, React.ReactNode> = {
      throne: <TheThroneView />,
      dunk: <DunkContestView />,
      '3point': <ThreePointContestView />,
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
            onStartNew={() => { prewarmRoster(); setShowSetup(true); }}
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
        {/* Mobile Header: hamburger + Play button */}
        <div className="md:hidden px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-3 shrink-0">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
          >
            <Menu size={20} />
          </button>
          <PlayButton setCurrentView={setCurrentView} />
        </div>

        {/* Desktop Play bar */}
        <div className="hidden md:flex px-4 py-2 bg-slate-900/50 border-b border-slate-800/60 items-center shrink-0">
          <PlayButton setCurrentView={setCurrentView} />
        </div>

        <div className="flex-1 min-h-0">
          <MainContent currentView={currentView} onViewChange={setCurrentView} />
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
