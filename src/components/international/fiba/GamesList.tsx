import React from 'react';
import { Tv } from 'lucide-react';
import { gamesData } from '../../../data/fiba/gamesData';
import { getFlagUrl } from '../../../data/fiba/data';
import type { GameResult } from '../../../types';

export interface FibaGameSelection {
  team1Code: string;
  team2Code: string;
  team1Score: number;
  team2Score: number;
  team1FlagId: string;
  team1FlagUrl?: string;
  team2FlagId: string;
  team2FlagUrl?: string;
  phaseAndGroup: string;
  date: string;
  boxScore?: GameResult;
}

export interface FibaGameCard {
  id?: string;
  date: string;
  scheduledDate?: string;
  phaseAndGroup: string;
  status: string;
  team1Code: string;
  team1Score: number | string;
  team1FlagId: string;
  team1FlagUrl?: string;
  team2Code: string;
  team2Score: number | string;
  team2FlagId: string;
  team2FlagUrl?: string;
  winner: number;
  boxScore?: GameResult;
}

interface GamesListProps {
  phase?: string;
  teamCode?: string;
  games?: readonly FibaGameCard[];
  onOpenBoxScore: (game: FibaGameSelection) => void;
  onWatchGame?: (gameId: string) => void;
  currentDate?: string;
}

export default function GamesList({ phase, teamCode, games = gamesData, onOpenBoxScore, onWatchGame, currentDate }: GamesListProps) {
  // Filter games based on phase and teamCode
  let filteredGames = [...games];

  if (teamCode) {
    filteredGames = filteredGames.filter(g => g.team1Code === teamCode || g.team2Code === teamCode);
  }

  if (phase === 'First Round') {
    filteredGames = filteredGames.filter(g => g.phaseAndGroup.startsWith('First Round'));
  } else if (phase === 'Second Round') {
    filteredGames = filteredGames.filter(g => g.phaseAndGroup.startsWith('Second Round'));
  } else if (phase === 'Class. Games 17-32') {
    filteredGames = filteredGames.filter(g => g.phaseAndGroup.startsWith('Class. Games 17-32'));
  } else if (phase === 'Class. Games') {
    filteredGames = filteredGames.filter(g => g.phaseAndGroup.startsWith('Class. Games 5-') || g.phaseAndGroup.startsWith('Class. Games 7-'));
  } else if (phase === 'Bracket') {
    filteredGames = filteredGames.filter(g => ['Quarter-Finals', 'Semi-Finals', '3rd Place Game', 'Final'].includes(g.phaseAndGroup));
  }

  // Group by date
  const groupedGames: Record<string, FibaGameCard[]> = {};
  filteredGames.forEach(game => {
    if (!groupedGames[game.date]) {
      groupedGames[game.date] = [];
    }
    groupedGames[game.date].push(game);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {Object.entries(groupedGames).map(([date, games]) => (
        <div key={date} className="mb-8">
          <h2 className="text-white text-[15px] font-medium mb-3">{date}</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {games.map((game, idx) => {
              const canOpen = typeof game.team1Score === 'number' && typeof game.team2Score === 'number';
              const canWatch = !canOpen && !!game.id && !!onWatchGame && game.scheduledDate === currentDate;
              const openBoxScore = () => {
                /* 
                  DEVELOPER COMMENT: BOX SCORE TRIGGER
                  Clicking any resolved tournament game opens the box score modal popup
                */
                if (!canOpen) return;
                onOpenBoxScore({
                  team1Code: game.team1Code,
                  team2Code: game.team2Code,
                  team1Score: game.team1Score as number,
                  team2Score: game.team2Score as number,
                  team1FlagId: game.team1FlagId,
                  team1FlagUrl: game.team1FlagUrl,
                  team2FlagId: game.team2FlagId,
                  team2FlagUrl: game.team2FlagUrl,
                  phaseAndGroup: game.phaseAndGroup,
                  date: game.date,
                  boxScore: game.boxScore,
                });
              };
              const openGame = () => {
                if (canOpen) openBoxScore();
                else if (canWatch && game.id) onWatchGame?.(game.id);
              };
              return (
              <div 
                key={game.id ?? idx}
                onClick={openGame}
                className={`bg-white rounded-[10px] overflow-hidden flex flex-col shadow-sm border border-transparent transition-colors ${(canOpen || canWatch) ? 'hover:border-gray-300 cursor-pointer' : ''}`}
              >
                <div className="p-4 md:p-5 flex flex-col flex-1">
                  {/* Card Header */}
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[#555] text-[10px] md:text-xs font-bold tracking-widest uppercase">{game.phaseAndGroup}</span>
                    <span className="text-[#a0a5aa] text-[10px] md:text-xs font-bold tracking-widest uppercase">{game.status}</span>
                  </div>
                  
                  {/* Card Body */}
                  <div className="flex items-stretch justify-between flex-1">
                    <div className="flex-1 flex flex-col justify-center space-y-4 pr-5">
                      {/* Team 1 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-[30px] h-[20px] rounded-sm overflow-hidden flex items-center justify-center bg-gray-100 shadow-[0_0_2px_rgba(0,0,0,0.1)]">
                            <img 
                              src={game.team1FlagUrl || getFlagUrl(game.team1FlagId, game.team1Code)}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="text-[#111] font-bold text-[16px] md:text-[18px]">{game.team1Code}</span>
                        </div>
                        <div className="flex items-center">
                          <span className={`text-[#111] font-bold text-[16px] md:text-[18px] w-8 text-right`}>{game.team1Score}</span>
                          {game.winner === 1 ? (
                            <div className="w-0 h-0 border-t-[5px] border-t-transparent border-r-[6px] border-r-[#ea002a] border-b-[5px] border-b-transparent ml-2"></div>
                          ) : (
                            <div className="w-2 ml-2"></div>
                          )}
                        </div>
                      </div>
                      
                      {/* Team 2 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-[30px] h-[20px] rounded-sm overflow-hidden flex items-center justify-center bg-gray-100 shadow-[0_0_2px_rgba(0,0,0,0.1)]">
                            <img 
                              src={game.team2FlagUrl || getFlagUrl(game.team2FlagId, game.team2Code)}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="text-[#111] font-bold text-[16px] md:text-[18px]">{game.team2Code}</span>
                        </div>
                        <div className="flex items-center">
                          <span className="text-[#111] font-bold text-[16px] md:text-[18px] w-8 text-right">{game.team2Score}</span>
                          {game.winner === 2 ? (
                            <div className="w-0 h-0 border-t-[5px] border-t-transparent border-r-[6px] border-r-[#ea002a] border-b-[5px] border-b-transparent ml-2"></div>
                          ) : (
                            <div className="w-2 ml-2"></div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* 
                      DEVELOPER COMMENT:
                      - The "Watch" button (or "Enter Game") is only for games that are NOT yet simmed.
                      - Once a game is resolved/simmed, it is shown as "Details" (or "+ More") 
                        which triggers the Box Score modal.
                      - Unsimmed games in the schedule view get the Watch button.
                    */}
                    <div className="pl-5 border-l border-gray-200 flex items-center justify-center">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation(); // prevent double trigger
                          openGame();
                        }}
                        disabled={!canOpen && !canWatch}
                        className="bg-[#e4e7eb] enabled:hover:bg-[#d1d5db] disabled:text-gray-500 transition-colors text-black text-sm font-medium py-1.5 px-3 md:px-4 rounded-[4px] whitespace-nowrap"
                      >
                        {canOpen ? '+ More' : canWatch ? <span className="flex items-center gap-1.5"><Tv size={15} /> TV</span> : 'Scheduled'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );})}
          </div>
        </div>
      ))}
      
      {filteredGames.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          No games found for this phase.
        </div>
      )}
    </div>
  );
}
