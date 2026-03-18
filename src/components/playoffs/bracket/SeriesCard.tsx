import React from 'react';
import { Game, PlayoffSeries, NBATeam } from '../../../types';
import { normalizeDate } from '../../../utils/helpers';

interface SeriesCardProps {
  series: PlayoffSeries | null;
  teams: NBATeam[];
  schedule: Game[];
  stateDate: string;
  isSelected: boolean;
  onClick: () => void;
  label?: string;
}

export const SeriesCard: React.FC<SeriesCardProps> = ({
  series,
  teams,
  schedule,
  stateDate,
  isSelected,
  onClick,
  label,
}) => {
  if (!series) {
    return (
      <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-3 flex items-center justify-center min-h-[120px]">
        <span className="text-slate-700 text-[10px] font-bold">{label || 'TBD'}</span>
      </div>
    );
  }

  const higher = teams.find(t => t.id === series.higherSeedTid);
  const lower = teams.find(t => t.id === series.lowerSeedTid);
  const isComplete = series.status === 'complete';
  const higherWon = isComplete && series.winnerId === series.higherSeedTid;
  const lowerWon = isComplete && series.winnerId === series.lowerSeedTid;
  const nextGame = schedule.find(g => g.playoffSeriesId === series.id && !g.played);
  const isToday = nextGame ? normalizeDate(nextGame.date) === normalizeDate(stateDate) : false;
  const isFinals = series.conference === 'Finals';

  let borderClass = 'border-white/10';
  if (isSelected) {
    borderClass = isFinals ? 'border-yellow-400/60' : 'border-indigo-400/60';
  } else if (isToday && !isComplete) {
    borderClass = 'border-indigo-500/40 animate-pulse';
  } else if (isComplete && isFinals) {
    borderClass = 'border-yellow-400/30';
  } else if (isComplete) {
    borderClass = 'border-white/5';
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-[#111] border ${borderClass} rounded-xl p-2.5 flex flex-col gap-1 transition-all hover:bg-white/[0.04] ${isSelected ? 'ring-1 ring-inset ' + (isFinals ? 'ring-yellow-400/30' : 'ring-indigo-400/20') : ''}`}
    >
      {/* Higher seed */}
      <div className={`flex items-center gap-1.5 ${lowerWon ? 'opacity-30' : ''}`}>
        <span className="text-[9px] text-slate-600 w-3.5 font-mono shrink-0">{series.higherSeed}</span>
        {higher
          ? <img src={higher.logoUrl} className="w-5 h-5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
          : <div className="w-5 h-5 bg-slate-800 rounded-full shrink-0" />}
        <span className="text-xs font-bold text-white truncate flex-1">{higher?.abbrev ?? 'TBD'}</span>
        <span className={`text-xs font-black shrink-0 ${higherWon ? 'text-emerald-400' : 'text-white'}`}>
          {series.higherSeedWins}{higherWon ? ' 🏆' : ''}
        </span>
      </div>

      {/* Lower seed */}
      <div className={`flex items-center gap-1.5 ${higherWon ? 'opacity-30' : ''}`}>
        <span className="text-[9px] text-slate-600 w-3.5 font-mono shrink-0">{series.lowerSeed}</span>
        {lower
          ? <img src={lower.logoUrl} className="w-5 h-5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
          : <div className="w-5 h-5 bg-slate-800 rounded-full shrink-0" />}
        <span className="text-xs font-bold text-white truncate flex-1">{lower?.abbrev ?? 'TBD'}</span>
        <span className={`text-xs font-black shrink-0 ${lowerWon ? 'text-emerald-400' : 'text-white'}`}>
          {series.lowerSeedWins}{lowerWon ? ' 🏆' : ''}
        </span>
      </div>

      {/* Status footer */}
      <div className="border-t border-white/5 pt-1 mt-0.5">
        {isToday && !isComplete ? (
          <div className="text-[9px] font-black text-indigo-400 uppercase tracking-wide">
            Game {nextGame?.playoffGameNumber} — Today
          </div>
        ) : isComplete ? (
          <div className="text-[9px] font-bold text-emerald-400 truncate">
            {series.winnerId === series.higherSeedTid
              ? `${higher?.abbrev} wins ${series.higherSeedWins}-${series.lowerSeedWins}`
              : `${lower?.abbrev} wins ${series.lowerSeedWins}-${series.higherSeedWins}`}
          </div>
        ) : nextGame ? (
          <div className="text-[9px] text-slate-600">
            {new Date(nextGame.date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })}
          </div>
        ) : (
          <div className="text-[9px] text-slate-700">Not started</div>
        )}
      </div>
    </button>
  );
};
