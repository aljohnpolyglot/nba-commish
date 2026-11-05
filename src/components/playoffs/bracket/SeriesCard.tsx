import React from 'react';
import { motion } from 'motion/react';
import { BracketSeriesNode, BracketSource, Game, PlayoffSeries, NBATeam } from '../../../types';
import { normalizeDate } from '../../../utils/helpers';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { getTeamFullName } from '../../../utils/teamNames';

interface SeriesCardProps {
  series: PlayoffSeries | null;
  teams: NBATeam[];
  schedule: Game[];
  stateDate: string;
  isSelected: boolean;
  onClick: () => void;
  label?: string;
  delay?: number;
  ownTid?: number | null;
  season?: number;
  allSeries?: PlayoffSeries[];
  node?: BracketSeriesNode;
}

// ── TeamRow ─────────────────────────────────────────────────────────────────
const TeamRow = ({
  team,
  seed,
  wins,
  isTop,
  isWinner,
  isLoser,
  isOwn,
  placeholder,
}: {
  team: NBATeam | null | undefined;
  seed?: number;
  wins?: number;
  isTop?: boolean;
  isWinner?: boolean;
  isLoser?: boolean;
  isOwn?: boolean;
  placeholder?: string;
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
      <div className="flex items-baseline gap-2">
        {seed != null && <span className="text-[10px] font-bold text-slate-500 w-3 text-right">{seed}</span>}
        <span
          className={`text-xs font-semibold tracking-wide ${
            isWinner ? 'text-white font-bold' : 'text-slate-300'
          }`}
        >
          {team?.abbrev ?? placeholder ?? 'TBD'}
        </span>
        {isOwn && <span className="text-[8px] font-black uppercase tracking-wider bg-violet-500/20 text-violet-200 px-1 py-0.5 rounded border border-violet-400/40">You</span>}
      </div>
    </div>
    {wins != null && <span
      className={`text-xs font-black pr-1 ${isWinner ? 'text-emerald-400' : 'text-slate-400'}`}
    >
      {wins}
    </span>}
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
  ownTid,
  season,
  allSeries = [],
  node,
}) => {
  const datedTeam = (tid: number) => {
    const team = teams.find(t => t.id === tid);
    return team && season != null ? getHistoricalTeamSnapshot(team, season) as NBATeam : team;
  };
  const sourceText = (source: BracketSource | undefined): string | undefined => {
    if (!source) return undefined;
    if (source.kind === 'team') {
      const team = datedTeam(source.teamId);
      return `${source.seed} ${team?.abbrev ?? (getTeamFullName(team) || 'TBD')}`;
    }
    if (source.kind === 'winnerOf' || source.kind === 'loserOf') {
      const feeder = allSeries.find(row => row.id === source.seriesId);
      if (feeder?.status === 'complete' && feeder.winnerId != null) {
        const teamId = source.kind === 'winnerOf'
          ? feeder.winnerId
          : feeder.winnerId === feeder.higherSeedTid ? feeder.lowerSeedTid : feeder.higherSeedTid;
        const team = datedTeam(teamId);
        const seed = teamId === feeder.higherSeedTid ? feeder.higherSeed : feeder.lowerSeed;
        return `${seed} ${team?.abbrev ?? 'TBD'}`;
      }
      return 'TBD';
    }
    return 'TBD';
  };
  if (!series) {
    const sourceA = sourceText(node?.sourceA) ?? label ?? 'TBD';
    const sourceB = sourceText(node?.sourceB) ?? 'TBD';
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay }}
        className="flex flex-col rounded-lg overflow-hidden border border-slate-700/30 bg-[#0f131c] w-48 shrink-0 min-h-[76px]"
      >
        <TeamRow team={null} placeholder={sourceA} isTop />
        <TeamRow team={null} placeholder={sourceB} />
        <div className="border-t border-slate-700/60 bg-slate-900/60 py-1 text-center">
          <span className="text-[9px] font-black tracking-wider text-slate-600">MATCHUP TBD</span>
        </div>
      </motion.div>
    );
  }

  const higherSeedTid = Number(series.higherSeedTid);
  const lowerSeedTid = Number(series.lowerSeedTid);
  const winnerTid = series.winnerId == null ? null : Number(series.winnerId);
  const higher = datedTeam(higherSeedTid);
  const lower = datedTeam(lowerSeedTid);
  const isComplete = series.status === 'complete';
  const higherWon = isComplete && winnerTid === higherSeedTid;
  const lowerWon = isComplete && winnerTid === lowerSeedTid;
  const isFinals = series.conference === 'Finals';
  const hasOwnTeam = ownTid != null && (higherSeedTid === ownTid || lowerSeedTid === ownTid);
  const sourceA = sourceText(series.sourceA);
  const sourceB = sourceText(series.sourceB);

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
    resultText = series.status === 'pending' ? 'MATCHUP TBD' : 'NOT STARTED';
  }

  const borderClass = isSelected
    ? isFinals
      ? 'border-amber-400/60'
      : 'border-indigo-400/60'
    : hasOwnTeam
    ? 'border-violet-400/60'
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
      aria-label={`${higher ? `${series.higherSeed} ${getTeamFullName(higher)}` : sourceA ?? 'TBD'} versus ${lower ? `${series.lowerSeed} ${getTeamFullName(lower)}` : sourceB ?? 'TBD'}`}
      className={`flex flex-col rounded-lg overflow-hidden border ${borderClass} bg-[#0f131c] transition-all duration-300 hover:border-slate-400 hover:shadow-xl w-48 shrink-0 text-left ${
        isSelected ? `ring-1 ring-inset ${isFinals ? 'ring-amber-400/30' : 'ring-indigo-400/20'}` : ''
      } ${hasOwnTeam ? 'shadow-[0_0_14px_rgba(139,92,246,0.18)]' : isToday && !isComplete ? 'shadow-[0_0_12px_rgba(99,102,241,0.15)]' : 'shadow-md'}`}
    >
      <TeamRow
        team={higher}
        seed={series.higherSeed}
        wins={series.higherSeedWins}
        isTop
        isWinner={higherWon}
        isLoser={lowerWon}
        isOwn={ownTid != null && higher?.id === ownTid}
        placeholder={!higher ? sourceA : undefined}
      />
      <TeamRow
        team={lower}
        seed={series.lowerSeed}
        wins={series.lowerSeedWins}
        isWinner={lowerWon}
        isLoser={higherWon}
        isOwn={ownTid != null && lower?.id === ownTid}
        placeholder={!lower ? sourceB : undefined}
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
