import React from 'react';
import { motion } from 'motion/react';
import { Game, PlayInGame, NBATeam } from '../../../types';
import { normalizeDate } from '../../../utils/helpers';

interface PlayInCardProps {
  pig: PlayInGame | undefined;
  teams: NBATeam[];
  schedule: Game[];
  stateDate: string;
  isSelected: boolean;
  onClick: () => void;
  label: string;
  delay?: number;
  ownTid?: number | null;
}

// ── TeamRow (play-in variant) ────────────────────────────────────────────────
const PITeamRow = ({
  team,
  score,
  isTop,
  isWinner,
  isLoser,
  isOwn,
}: {
  team: NBATeam | null | undefined;
  score?: number;
  isTop?: boolean;
  isWinner?: boolean;
  isLoser?: boolean;
  isOwn?: boolean;
}) => (
  <div
    className={`flex items-center justify-between p-2.5 ${
      isOwn ? 'bg-violet-500/15 border-l-2 border-l-violet-400' : 'bg-[#131823]'
    } ${isTop ? 'border-b border-slate-800' : ''} ${isLoser ? 'opacity-35' : ''}`}
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
      <span
        className={`text-xs font-semibold tracking-wide ${
          isWinner ? 'text-white font-bold' : 'text-slate-300'
        }`}
      >
        {team?.abbrev ?? 'TBD'}
      </span>
      {isOwn && <span className="text-[8px] font-black uppercase tracking-wider bg-violet-500/20 text-violet-200 px-1 py-0.5 rounded border border-violet-400/40">You</span>}
    </div>
    {score !== undefined && (
      <span
        className={`text-xs font-black pr-1 ${isWinner ? 'text-emerald-400' : 'text-slate-400'}`}
      >
        {score}
      </span>
    )}
  </div>
);

// ── PlayInCard ───────────────────────────────────────────────────────────────
export const PlayInCard: React.FC<PlayInCardProps> = ({
  pig,
  teams,
  schedule,
  stateDate,
  isSelected,
  onClick,
  label,
  delay = 0,
  ownTid,
}) => {
  if (!pig) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay }}
        className="flex flex-col rounded-lg overflow-hidden border border-indigo-500/20 bg-[#0f131c] w-48 shrink-0 min-h-[76px] items-center justify-center"
      >
        <span className="text-slate-700 text-[10px] font-bold">TBD</span>
      </motion.div>
    );
  }

  const game = pig.gameId ? schedule.find(g => g.gid === pig.gameId) : null;
  // Use Number() coercion to handle potential string→number mismatch after JSON deserialization
  // Use !== -1 (not > 0) because team ID 0 is valid in BBGM
  const t1Tid = Number(pig.team1Tid);
  const t2Tid = Number(pig.team2Tid);
  let t1 = t1Tid !== -1 ? teams.find(t => t.id === t1Tid) : null;
  let t2 = t2Tid !== -1 ? teams.find(t => t.id === t2Tid) : null;
  // Fallback: if game exists and team still not found, resolve via game's home/away TIDs
  const gameHomeTid = game ? Number(game.homeTid) : null;
  const gameAwayTid = game ? Number(game.awayTid) : null;
  if (game && !t1 && gameHomeTid !== -1) t1 = teams.find(t => t.id === gameHomeTid) ?? null;
  if (game && !t2 && gameAwayTid !== -1) t2 = teams.find(t => t.id === gameAwayTid) ?? null;
  const isToday = game ? normalizeDate(game.date) === normalizeDate(stateDate) : false;
  const winnerTid = pig.winnerId == null ? null : Number(pig.winnerId);
  const hasWinner = pig.played && winnerTid != null;
  const winner = hasWinner ? teams.find(t => t.id === winnerTid) : null;
  const hasOwnTeam = ownTid != null && (t1Tid === ownTid || t2Tid === ownTid || gameHomeTid === ownTid || gameAwayTid === ownTid);

  let resultText = '';
  if (pig.played && winner) {
    resultText = `${winner.abbrev} WINS`;
  } else if (isToday) {
    resultText = 'TODAY';
  } else if (game) {
    resultText = new Date(game.date).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    });
  } else {
    resultText = label.toUpperCase();
  }

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay }}
      onClick={onClick}
      className={`flex flex-col rounded-lg overflow-hidden border ${
        isSelected
          ? 'border-indigo-400/60'
          : hasOwnTeam
          ? 'border-violet-400/60'
          : pig.played
          ? 'border-slate-700/40'
          : 'border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.05)]'
      } bg-[#0f131c] transition-all duration-300 hover:border-slate-400 hover:shadow-xl w-48 shrink-0 text-left ${
        isSelected ? 'ring-1 ring-inset ring-indigo-400/20' : ''
      } ${hasOwnTeam ? 'shadow-[0_0_14px_rgba(139,92,246,0.18)]' : isToday && !pig.played ? 'shadow-[0_0_12px_rgba(99,102,241,0.15)]' : 'shadow-md'}`}
    >
      <PITeamRow
        team={t1}
        score={pig.played && game ? game.homeScore : undefined}
        isTop
        isWinner={hasWinner && winnerTid === t1Tid}
        isLoser={hasWinner && winnerTid !== t1Tid}
        isOwn={ownTid != null && t1?.id === ownTid}
      />
      <PITeamRow
        team={t2}
        score={pig.played && game ? game.awayScore : undefined}
        isWinner={hasWinner && winnerTid === t2Tid}
        isLoser={hasWinner && winnerTid !== t2Tid}
        isOwn={ownTid != null && t2?.id === ownTid}
      />
      <div
        className={`text-center py-1 border-t border-slate-700/60 ${
          pig.played
            ? 'bg-slate-800/90'
            : isToday
            ? 'bg-indigo-900/40'
            : 'bg-slate-900/60'
        }`}
      >
        <span
          className={`text-[9px] font-black tracking-wider uppercase ${
            pig.played
              ? 'text-slate-300'
              : isToday
              ? 'text-indigo-300'
              : 'text-indigo-400/70'
          }`}
        >
          {resultText}
        </span>
      </div>
    </motion.button>
  );
};
