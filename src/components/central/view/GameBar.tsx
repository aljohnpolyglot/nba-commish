import React, { useEffect, useRef } from 'react';
import { Game, NBATeam } from '../../../types';
import { normalizeDate } from '../../../utils/helpers';

interface GameBarProps {
  teamId: number;
  schedule: Game[];
  currentDate: string;
  allTeams: NBATeam[];
  onGameClick?: (game: Game) => void;
  onTeamClick?: (teamId: number) => void;
}

export const GameBar: React.FC<GameBarProps> = ({ teamId, schedule, currentDate, allTeams, onGameClick, onTeamClick }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter games for this team
  const teamGames = schedule.filter(g => g.homeTid === teamId || g.awayTid === teamId);
  
  // Sort by date
  teamGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const normalizedCurrent = normalizeDate(currentDate);

  // Find the index of the next game (first unplayed game or game today)
  const nextGameIndex = teamGames.findIndex(g => {
      const gameDate = normalizeDate(g.date);
      return gameDate >= normalizedCurrent;
  });

  useEffect(() => {
    if (scrollRef.current && nextGameIndex !== -1) {
      const container = scrollRef.current;
      const cardWidth = 90; // Approx width of a card + gap
      const scrollPos = (nextGameIndex * cardWidth) - (container.clientWidth / 2) + (cardWidth / 2);
      container.scrollTo({ left: Math.max(0, scrollPos), behavior: 'smooth' });
    }
  }, [nextGameIndex, teamId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '??';
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  return (
    <div ref={scrollRef} className="flex gap-2 md:gap-3 overflow-x-auto pb-2 md:pb-4 pt-2 custom-scrollbar px-1">
      {teamGames.map((game, index) => {
        const isHome = game.homeTid === teamId;
        const opponentId = isHome ? game.awayTid : game.homeTid;
        const opponent = allTeams.find(t => t.id === opponentId);
        const gameDate = normalizeDate(game.date);
        const isToday = gameDate === normalizedCurrent;
        const isNext = index === nextGameIndex && !isToday;
        const isPast = normalizeDate(game.date) < normalizedCurrent && !isToday;
        
        return (
          <div 
            key={game.gid} 
            onClick={() => onGameClick && onGameClick(game)}
            className={`
                flex-shrink-0 w-20 md:w-24 p-2 md:p-3 rounded-xl border flex flex-col items-center gap-1.5 md:gap-2 relative transition-all duration-300 ${onGameClick ? 'cursor-pointer hover:scale-105' : ''}
                ${isToday 
                    ? 'bg-indigo-900/40 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)] scale-105 z-10' 
                    : isNext
                        ? 'bg-slate-800 border-slate-600'
                        : isPast 
                            ? 'bg-slate-900/50 border-slate-800 opacity-70 grayscale-[0.5]' 
                            : 'bg-slate-800 border-slate-700'
                }
            `}
          >
            {isToday && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[8px] md:text-[9px] font-black px-1.5 md:px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm whitespace-nowrap">
                    Today
                </div>
            )}
            {isNext && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-slate-600 text-white text-[8px] md:text-[9px] font-black px-1.5 md:px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm whitespace-nowrap">
                    Next
                </div>
            )}

            <div className={`text-[9px] md:text-[10px] font-bold uppercase ${isToday ? 'text-indigo-300' : 'text-slate-500'}`}>
                {formatDate(game.date)}
            </div>
            
            {opponent?.logoUrl && (
              <div className="transition-transform">
                <img src={opponent.logoUrl} alt={opponent.abbrev} className="w-7 h-7 md:w-8 md:h-8 object-contain" referrerPolicy="no-referrer" />
              </div>
            )}
            
            <div className="font-bold text-white text-[10px] md:text-xs">
              {isHome ? 'vs' : '@'} 
              <span className="ml-1 transition-colors">
                {opponent?.abbrev || '??'}
              </span>
            </div>

            {game.played ? (
              <div className="flex items-center gap-0.5 md:gap-1 mt-0.5 md:mt-1">
                <span className={`text-[8px] md:text-[9px] font-black px-1 md:px-1.5 py-0.5 rounded ${
                  (isHome ? (game.homeScore! > game.awayScore!) : (game.awayScore! > game.homeScore!)) 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {(isHome ? (game.homeScore! > game.awayScore!) : (game.awayScore! > game.homeScore!)) ? 'W' : 'L'}
                </span>
                <span className="text-[9px] md:text-[10px] font-bold text-slate-400">
                  {isHome ? `${game.homeScore}-${game.awayScore}` : `${game.awayScore}-${game.homeScore}`}
                </span>
              </div>
            ) : (
                <div className="h-4 md:h-5 flex items-center">
                    <span className="text-[9px] md:text-[10px] text-slate-600 font-medium">--</span>
                </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
