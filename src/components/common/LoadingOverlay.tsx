import React from 'react';
import LoadingSpinner from './LoadingSpinner';
import { SimulationTicker } from './SimulationTicker';

interface Props {
  simResults?: any[];
  teams?: any[];
  prevTeams?: any[];
  players?: any[];
  actionType?: string;
  actionPayload?: any;
}

export const LoadingOverlay: React.FC<Props> = ({ simResults, teams, prevTeams, players, actionType, actionPayload }) => {
  const hasTicker = simResults && simResults.length > 0;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[200] flex flex-col items-center justify-center transition-all duration-500">
      <div className={`bg-slate-900/80 rounded-[3rem] border border-slate-800 shadow-2xl flex flex-col items-center gap-6 ${hasTicker ? 'p-8 w-full max-w-lg' : 'p-12'}`}>
        {hasTicker ? (
          <SimulationTicker
            allSimResults={simResults!}
            teams={teams || []}
            prevTeams={prevTeams}
            players={players || []}
            actionType={actionType}
            actionPayload={actionPayload}
          />
        ) : (
          <>
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full animate-pulse"></div>
              <LoadingSpinner size={64} color="text-indigo-500" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <h3 className="text-xl font-black text-white tracking-tight uppercase">Processing Executive Order</h3>
              <p className="text-slate-400 text-sm font-medium animate-pulse">Consulting with the league office...</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
