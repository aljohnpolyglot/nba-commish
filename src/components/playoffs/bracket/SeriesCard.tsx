import React from 'react';
import { motion } from 'motion/react';
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
  delay?: number;
}

// ── TeamRow ─────────────────────────────────────────────────────────────────
const TeamRow = ({
  team,
  seed,
  wins,
  isTop,
  isWinner,
  isLoser,
}: {
  team: NBATeam | null | undefined;
  seed: number;
  wins: number;
  isTop?: boolean;
  isWinner?: boolean;
  isLoser?: boolean;
}) => (
  <div
    className={`flex items-center justify-between p-2.5 bg-[#131823] ${isTop ? 'border-b border-slate-800' : ''} ${isLoser ? 'opacity-35' : ''}`}
  >
    <div className="flex items-center gap-3">
      {team ? (
        <img
          src={team.logoUrl}
          className="w-7 h-7 object-contain drop-shadow-md"
          alt={team.abbrev}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-7 h-7 flex items-center justify-center bg-slate-800/50 rounded-full border border-slate-700/50">
          <span className="text-slate-500 text-[10px] font-bold">?</span>
        </div>
      )}
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-bold text-slate-500 w-3 text-right">{seed}</span>
        <span
          className={`text-xs font-semibold tracking-wide ${
            isWinner ? 'text-white font-bold' : 'text-slate-300'
          }`}
        >
          {team?.abbrev ?? 'TBD'}
        </span>
      </div>
    </div>
    <span
      className={`text-xs font-black pr-1 ${isWinner ? 'text-emerald-400' : 'text-slate-400'}`}
    >
      {wins}
    </span>
  </div>
);

// ── SeriesCard ───────────────────────────────────────────────────────────────
export const SeriesCard: React.FC<SeriesCardProps> = ({
  series,
  teams,
  schedule,
  stateDate,
  isSelected,
  onClick,
  label,
  delay = 0,
}) => {
  if (!series) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay }}
        className="flex flex-col rounded-lg overflow-hidden border border-slate-700/30 bg-[#0f131c] w-48 shrink-0 min-h-[76px] items-center justify-center"
      >
        <span className="text-slate-700 text-[10px] font-bold px-2 text-center">
          {label || 'TBD'}
        </span>
      </motion.div>
    );
  }

  const higher = teams.find(t => t.id === series.higherSeedTid);
  const lower = teams.find(t => t.id === series.lowerSeedTid);
  const isComplete = series.status === 'complete';
  const higherWon = isComplete && series.winnerId === series.higherSeedTid;
  const lowerWon = isComplete && series.winnerId === series.lowerSeedTid;
  const isFinals = series.conference === 'Finals';

  const nextGame = schedule.find(g => g.playoffSeriesId === series.id && !g.played);
  const isToday = nextGame ? normalizeDate(nextGame.date) === normalizeDate(stateDate) : false;

  // Result footer text
  let resultText = '';
  if (isComplete) {
    const winner = higherWon ? higher : lower;
    const wW = higherWon ? series.higherSeedWins : series.lowerSeedWins;
    const lW = higherWon ? series.lowerSeedWins : series.higherSeedWins;
    resultText = `${winner?.abbrev ?? 'TBD'} WINS ${wW}-${lW}`;
  } else if (isToday && nextGame) {
    resultText = `GAME ${nextGame.playoffGameNumber} · TODAY`;
  } else if (nextGame) {
    const d = new Date(nextGame.date);
    resultText = d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  } else if (series.higherSeedWins > 0 || series.lowerSeedWins > 0) {
    resultText = `SERIES IN PROGRESS`;
  } else {
    resultText = 'NOT STARTED';
  }

  const borderClass = isSelected
    ? isFinals
      ? 'border-amber-400/60'
      : 'border-indigo-400/60'
    : isToday && !isComplete
    ? 'border-indigo-500/40'
    : isFinals && isComplete
    ? 'border-amber-400/30'
    : 'border-slate-700/60';

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay }}
      onClick={onClick}
      className={`flex flex-col rounded-lg overflow-hidden border ${borderClass} bg-[#0f131c] transition-all duration-300 hover:border-slate-400 hover:shadow-xl w-48 shrink-0 text-left ${
        isSelected ? `ring-1 ring-inset ${isFinals ? 'ring-amber-400/30' : 'ring-indigo-400/20'}` : ''
      } ${isToday && !isComplete ? 'shadow-[0_0_12px_rgba(99,102,241,0.15)]' : 'shadow-md'}`}
    >
      <TeamRow
        team={higher}
        seed={series.higherSeed}
        wins={series.higherSeedWins}
        isTop
        isWinner={higherWon}
        isLoser={lowerWon}
      />
      <TeamRow
        team={lower}
        seed={series.lowerSeed}
        wins={series.lowerSeedWins}
        isWinner={lowerWon}
        isLoser={higherWon}
      />
      <div
        className={`text-center py-1 border-t border-slate-700/60 ${
          isComplete
            ? 'bg-slate-800/90'
            : isToday
            ? 'bg-indigo-900/40'
            : 'bg-slate-900/60'
        }`}
      >
        <span
          className={`text-[9px] font-black tracking-wider uppercase ${
            isComplete
              ? 'text-slate-300'
              : isToday
              ? 'text-indigo-300'
              : 'text-slate-600'
          }`}
        >
          {resultText}
        </span>
      </div>
    </motion.button>
  );
};
