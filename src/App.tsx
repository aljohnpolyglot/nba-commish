import React, { useState, useEffect, useRef } from 'react';
import { GameProvider, useGame } from './store/GameContext';
import { Sidebar } from './components/Sidebar';
import { OutcomeView } from './components/OutcomeView';
import { LoadingOverlay } from './components/common/LoadingOverlay';
import { CommissionerSetup } from './components/CommissionerSetup';
import { MainContent } from './components/layout/MainContent';
import { MainMenu } from './components/MainMenu';
import { ClubEffect } from './components/effects/ClubEffect';
import { LazySimLoadingScreen } from './components/setup/LazySimLoadingScreen';
import { Tab } from './types';
import { Menu, ArrowRight } from 'lucide-react';
import { SaveManager } from './services/SaveManager';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { fetchStatmuseData } from './data/social/statmuseImages';
import { fetchAvatarData } from './data/avatars';
import { fetchCharaniaPhotos } from './services/social/charaniaphotos';
import { fetchNBAMemes } from './services/social/nbaMemesFetcher';
import { fetchInjuryData } from './services/injuryService';
import { fetchPlayerInjuryData } from './data/playerInjuryData';
import { prewarmRoster } from './services/rosterService';
import { SettingsManager } from './services/SettingsManager';

function GameLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const { state, dispatchAction, currentView, setCurrentView } = useGame();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Game-results modal dismissal: when LLM is off, isProcessing flips false so fast
  // the ticker never animates. Keep the overlay mounted past the sim until the user
  // clicks Continue — only for LLM-off runs with actual game results to show.
  const [tickerAwaitingDismiss, setTickerAwaitingDismiss] = useState(false);
  const prevIsProcessingRef = useRef(state.isProcessing);
  useEffect(() => {
    const was = prevIsProcessingRef.current;
    prevIsProcessingRef.current = state.isProcessing;
    if (was && !state.isProcessing) {
      const llmOff = !SettingsManager.getSettings().enableLLM;
      const hasResults = (state.lastSimResults?.length ?? 0) > 0;
      if (llmOff && hasResults) setTickerAwaitingDismiss(true);
    }
  }, [state.isProcessing, state.lastSimResults]);

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

    return <MainMenu
      onStartNew={() => { prewarmRoster(); setShowSetup(true); }}
      onLoadSave={(loadedState) => dispatchAction({ type: 'LOAD_GAME', payload: loadedState })}
    />;
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
        {/* Mobile Header */}
        <div className="md:hidden p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <button 
            onClick={() => setIsSidebarOpen(true)} 
            className="p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Menu size={24} />
          </button>
          <span className="text-white font-bold text-lg tracking-tight">BasketCommissionerSim</span>
          <div className="w-8" /> {/* Spacer for visual balance */}
        </div>

        <div className="flex-1 min-h-0">
          <MainContent currentView={currentView} onViewChange={setCurrentView} />
        </div>

        {/* Lazy sim progress overlay — takes priority over generic LoadingOverlay */}
        {state.lazySimProgress && (
          <div className="fixed inset-0 z-[9999] bg-slate-950/95 flex items-center justify-center">
            <LazySimLoadingScreen progress={state.lazySimProgress} />
          </div>
        )}
        {(() => {
          if (state.isWatchingGame || state.lazySimProgress) return null;
          if (!state.isProcessing && !tickerAwaitingDismiss) return null;
          const hasTicker =
            (state.tickerSimResults && state.tickerSimResults.length > 0) ||
            (state.lastSimResults && state.lastSimResults.length > 0) ||
            tickerAwaitingDismiss;
          // GM mode: only show when there's actual ticker content (sim results to review).
          // Bare "Processing Transaction" is retired — transactions are instant by default.
          if (state.gameMode === 'gm' && !hasTicker) return null;
          const activeSimResults =
            state.tickerSimResults && state.tickerSimResults.length > 0
              ? state.tickerSimResults
              : state.lastSimResults;
          return (
            <LoadingOverlay
              simResults={activeSimResults}
              teams={state.teams}
              players={state.players}
              actionType={state.lastActionType}
              actionPayload={state.lastActionPayload}
              gameMode={state.gameMode}
              showDismiss={tickerAwaitingDismiss}
              onDismiss={() => setTickerAwaitingDismiss(false)}
            />
          );
        })()}
        {state.isClubbing && <ClubEffect />}
        {state.lastOutcome && state.gameMode !== 'gm' && !state.isProcessing && !tickerAwaitingDismiss && <OutcomeView />}
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
