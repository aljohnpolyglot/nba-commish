import React from 'react';
import LoadingSpinner from './LoadingSpinner';
import { SimulationTicker } from './SimulationTicker';

interface Props {
  simResults?: any[];
  teams?: any[];
  players?: any[];
  actionType?: string;
  actionPayload?: any;
  gameMode?: 'commissioner' | 'gm';
  showDismiss?: boolean;
  onDismiss?: () => void;
}

export const LoadingOverlay: React.FC<Props> = ({
  simResults, teams, players, actionType, actionPayload, gameMode, showDismiss, onDismiss
}) => {
  const hasTicker = simResults && simResults.length > 0;
  const isGM = gameMode === 'gm';

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex flex-col items-center justify-center p-4">
      <div className={`
        bg-slate-900/95 rounded-[2rem] border border-slate-800 shadow-2xl
        flex flex-col items-center w-full
        ${hasTicker
          ? 'max-w-lg max-h-[85vh] overflow-hidden'
          : 'max-w-sm p-12 gap-6'
        }
      `}>
        {hasTicker ? (
          <div className="w-full flex flex-col overflow-hidden">
            {/* Fixed header */}
            <div className="px-6 pt-5 pb-3 border-b border-slate-800/50 shrink-0">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-center">
                {showDismiss ? '🏀 Game Results' : '🏀 Simulating...'}
              </p>
            </div>
            {/* Scrollable ticker */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
              <SimulationTicker
                allSimResults={simResults!}
                teams={teams || []}
                players={players || []}
                actionType={actionType}
                actionPayload={actionPayload}
                isStreaming={!showDismiss}
                gameMode={gameMode}
              />
            </div>
            {showDismiss && (
              <div className="px-6 py-4 border-t border-slate-800/50 shrink-0 bg-slate-900/80">
                <button
                  onClick={onDismiss}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm uppercase tracking-wider transition-colors"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full animate-pulse" />
              <LoadingSpinner size={64} color="text-indigo-500" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <h3 className="text-xl font-black text-white tracking-tight uppercase">
                {isGM ? 'Processing Transaction' : 'Processing Executive Order'}
              </h3>
              <p className="text-slate-400 text-sm font-medium animate-pulse">
                {isGM ? 'Updating roster...' : 'Consulting with the league office...'}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
