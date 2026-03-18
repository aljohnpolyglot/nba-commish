import React from 'react';
import { Play, Zap, FastForward, Trophy, BarChart2 } from 'lucide-react';
import { Game, PlayoffSeries } from '../../../types';

interface SeriesActionMenuProps {
  series: PlayoffSeries | null;
  nextGame: Game | null;
  isToday: boolean;
  isProcessing: boolean;
  isComplete: boolean;
  hasPlayedGames: boolean;
  onWatch: () => void;
  onSimGame: () => void;
  onSimRound: () => void;
  onSimPlayoffs: () => void;
  onViewStats: () => void;
}

export const SeriesActionMenu: React.FC<SeriesActionMenuProps> = ({
  series,
  nextGame,
  isToday,
  isProcessing,
  isComplete,
  hasPlayedGames,
  onWatch,
  onSimGame,
  onSimRound,
  onSimPlayoffs,
  onViewStats,
}) => {
  const gameNum = nextGame?.playoffGameNumber;

  return (
    <div className="flex flex-col gap-1.5 mt-3">
      {isToday && !isComplete && nextGame && (
        <>
          <button
            onClick={onWatch}
            disabled={isProcessing}
            className="w-full flex items-center gap-3 px-4 py-2.5 bg-white text-black font-black text-xs rounded-xl hover:bg-emerald-400 transition-all disabled:opacity-50"
          >
            <Play size={14} fill="currentColor" />
            Watch Game {gameNum}
          </button>
          <button
            onClick={onSimGame}
            disabled={isProcessing}
            className="w-full flex items-center gap-3 px-4 py-2.5 bg-white/[0.06] text-white font-bold text-xs rounded-xl hover:bg-white/10 transition-all disabled:opacity-50"
          >
            <Zap size={14} />
            Sim This Game
          </button>
        </>
      )}

      {!isComplete && (
        <>
          <button
            onClick={onSimRound}
            disabled={isProcessing}
            className="w-full flex items-center gap-3 px-4 py-2.5 bg-white/[0.06] text-white font-bold text-xs rounded-xl hover:bg-white/10 transition-all disabled:opacity-50"
          >
            <FastForward size={14} />
            Sim This Round
          </button>
          <button
            onClick={onSimPlayoffs}
            disabled={isProcessing}
            className="w-full flex items-center gap-3 px-4 py-2.5 bg-white/[0.04] text-slate-300 font-bold text-xs rounded-xl hover:bg-white/8 transition-all disabled:opacity-50"
          >
            <Trophy size={14} />
            Sim Playoffs
          </button>
        </>
      )}

      {hasPlayedGames && (
        <button
          onClick={onViewStats}
          className="w-full flex items-center gap-3 px-4 py-2.5 bg-white/[0.03] text-slate-400 font-bold text-xs rounded-xl hover:bg-white/[0.06] hover:text-white transition-all"
        >
          <BarChart2 size={14} />
          View Box Score
        </button>
      )}
    </div>
  );
};
