import React, { useState } from 'react';
import { Game, GameResult, NBATeam, NBAPlayer } from '../../../types';

interface SeriesBoxScoreProps {
  game: Game;
  result: GameResult;
  homeTeam: NBATeam;
  awayTeam: NBATeam;
  players: NBAPlayer[];
}

export const SeriesBoxScore: React.FC<SeriesBoxScoreProps> = ({
  game,
  result,
  homeTeam,
  awayTeam,
  players,
}) => {
  const [viewingTeam, setViewingTeam] = useState<'home' | 'away'>('home');

  const homeWon = result.winnerId === homeTeam.id;
  const awayWon = result.winnerId === awayTeam.id;

  const quarters = result.quarterScores
    ? result.quarterScores
    : { home: [0, 0, 0, 0], away: [0, 0, 0, 0] };

  const homeQs = quarters.home;
  const awayQs = quarters.away;
  const hasOT = result.isOT && result.otCount > 0;

  const activeStats = viewingTeam === 'home' ? result.homeStats : result.awayStats;
  const sorted = [...activeStats].sort((a, b) => b.min - a.min);

  return (
    <div className="mt-3 space-y-3">

      {/* Quarter scores */}
      <div className="bg-white/[0.03] rounded-xl overflow-hidden">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left px-3 py-2 text-slate-500 font-bold w-16">TEAM</th>
              <th className="px-2 py-2 text-slate-500 font-bold">Q1</th>
              <th className="px-2 py-2 text-slate-500 font-bold">Q2</th>
              <th className="px-2 py-2 text-slate-500 font-bold">Q3</th>
              <th className="px-2 py-2 text-slate-500 font-bold">Q4</th>
              {hasOT && Array.from({ length: result.otCount }).map((_, i) => (
                <th key={i} className="px-2 py-2 text-slate-500 font-bold">OT{result.otCount > 1 ? i + 1 : ''}</th>
              ))}
              <th className="px-3 py-2 text-slate-400 font-black">TOT</th>
            </tr>
          </thead>
          <tbody>
            <tr className={`border-b border-white/5 ${awayWon ? 'opacity-50' : ''}`}>
              <td className={`px-3 py-2 font-black ${homeWon ? 'text-white' : 'text-slate-400'}`}>{homeTeam.abbrev}</td>
              {homeQs.map((q, i) => (
                <td key={i} className={`px-2 py-2 text-center ${homeWon ? 'text-white' : 'text-slate-400'}`}>{q}</td>
              ))}
              <td className={`px-3 py-2 text-center font-black text-base ${homeWon ? 'text-white' : 'text-slate-400'}`}>{result.homeScore}</td>
            </tr>
            <tr className={awayWon ? '' : 'opacity-50'}>
              <td className={`px-3 py-2 font-black ${awayWon ? 'text-white' : 'text-slate-400'}`}>{awayTeam.abbrev}</td>
              {awayQs.map((q, i) => (
                <td key={i} className={`px-2 py-2 text-center ${awayWon ? 'text-white' : 'text-slate-400'}`}>{q}</td>
              ))}
              <td className={`px-3 py-2 text-center font-black text-base ${awayWon ? 'text-white' : 'text-slate-400'}`}>{result.awayScore}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Team toggle */}
      <div className="flex gap-1">
        {([
          { key: 'home' as const, team: homeTeam },
          { key: 'away' as const, team: awayTeam },
        ]).map(({ key, team }) => (
          <button
            key={key}
            onClick={() => setViewingTeam(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-black transition-all ${viewingTeam === key ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white'}`}
          >
            <img src={team.logoUrl} className="w-4 h-4 object-contain" alt="" referrerPolicy="no-referrer" />
            {team.abbrev}
          </button>
        ))}
      </div>

      {/* Player stats */}
      <div className="bg-white/[0.03] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] min-w-[480px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-2 py-1.5 text-slate-500 font-bold w-24">PLAYER</th>
                <th className="px-1 py-1.5 text-slate-500 font-bold text-center">MIN</th>
                <th className="px-1 py-1.5 text-slate-500 font-bold text-center">PTS</th>
                <th className="px-1 py-1.5 text-slate-500 font-bold text-center">REB</th>
                <th className="px-1 py-1.5 text-slate-500 font-bold text-center">AST</th>
                <th className="px-1 py-1.5 text-slate-500 font-bold text-center">STL</th>
                <th className="px-1 py-1.5 text-slate-500 font-bold text-center">BLK</th>
                <th className="px-1 py-1.5 text-slate-500 font-bold text-center">TO</th>
                <th className="px-1 py-1.5 text-slate-500 font-bold text-center">FG</th>
                <th className="px-1 py-1.5 text-slate-500 font-bold text-center">3P</th>
                <th className="px-1 py-1.5 text-slate-500 font-bold text-center">FT</th>
                <th className="px-1 py-1.5 text-slate-500 font-bold text-center">+/-</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((ps, i) => {
                const isDNP = ps.min === 0;
                const isStarter = ps.gs === 1;
                return (
                  <tr key={ps.playerId} className={`border-b border-white/5 ${isDNP ? 'opacity-30' : isStarter ? 'text-white' : 'text-slate-400'}`}>
                    <td className="px-2 py-1.5 font-bold truncate max-w-[96px]">{ps.name.split(' ').pop()}</td>
                    <td className="px-1 py-1.5 text-center">{Math.floor(ps.min)}:{Math.floor((ps.min % 1) * 60).toString().padStart(2, '0')}</td>
                    <td className="px-1 py-1.5 text-center font-black text-white">{ps.pts}</td>
                    <td className="px-1 py-1.5 text-center">{ps.reb}</td>
                    <td className="px-1 py-1.5 text-center">{ps.ast}</td>
                    <td className="px-1 py-1.5 text-center">{ps.stl}</td>
                    <td className="px-1 py-1.5 text-center">{ps.blk}</td>
                    <td className="px-1 py-1.5 text-center">{ps.tov}</td>
                    <td className="px-1 py-1.5 text-center">{ps.fgm}-{ps.fga}</td>
                    <td className="px-1 py-1.5 text-center">{ps.threePm}-{ps.threePa}</td>
                    <td className="px-1 py-1.5 text-center">{ps.ftm}-{ps.fta}</td>
                    <td className={`px-1 py-1.5 text-center font-bold ${ps.pm > 0 ? 'text-emerald-400' : ps.pm < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                      {ps.pm > 0 ? '+' : ''}{ps.pm}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Game winner callout */}
      {result.gameWinner && (
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-400/10 border border-yellow-400/20 rounded-xl">
          <span>🏀</span>
          <span className="text-[10px] font-bold text-yellow-300">
            {result.gameWinner.playerName} —{' '}
            {result.gameWinner.shotType === 'clutch_ft' ? 'Clutch FTs' :
             result.gameWinner.shotType === 'clutch_2' ? 'Clutch 2' :
             result.gameWinner.shotType === 'clutch_3' ? 'Clutch 3' : 'Walk-off'}{' '}
            with {result.gameWinner.clockRemaining} remaining
          </span>
        </div>
      )}
    </div>
  );
};
