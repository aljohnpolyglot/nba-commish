import React from 'react';
import { motion } from 'motion/react';
import { Play } from 'lucide-react';
import { Game } from '../../../../types';

const EAST_LOGO_URL = 'https://static.wikia.nocookie.net/logopedia/images/8/89/Eastern_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191748';
const WEST_LOGO_URL = 'https://static.wikia.nocookie.net/logopedia/images/0/06/Western_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191726';

interface AllStarGameCardProps {
  game: Game;
  allStar: any;
  onViewDetails: () => void;
  onWatchGame?: (game: Game) => void;
}

export const AllStarGameCard: React.FC<AllStarGameCardProps> = ({ game, allStar, onViewDetails, onWatchGame }) => {
  const isRisingStars = game.isRisingStars;
  const isAllStar = game.isAllStar;
  const isCelebrity = game.isCelebrityGame;
  const isDunk = game.isDunkContest;
  const isThreePoint = game.isThreePointContest;

  const title = isRisingStars ? 'Rising Stars Game' : isAllStar ? 'All-Star Game' : isCelebrity ? 'Celebrity Game' : isDunk ? 'Dunk Contest' : isThreePoint ? '3-Point Contest' : 'All-Star Event';
  const colorClass = isRisingStars ? 'text-sky-400' : isAllStar ? 'text-amber-400' : isCelebrity ? 'text-fuchsia-400' : isDunk ? 'text-orange-400' : isThreePoint ? 'text-indigo-400' : 'text-slate-400';
  
  const badgeClass = isRisingStars
    ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
    : isAllStar ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : isCelebrity ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20' : isDunk ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';

  const textClass = isRisingStars ? 'text-sky-400 hover:text-sky-300' : isAllStar ? 'text-amber-400 hover:text-amber-300' : isCelebrity ? 'text-fuchsia-400 hover:text-fuchsia-300' : isDunk ? 'text-orange-400 hover:text-orange-300' : 'text-indigo-400 hover:text-indigo-300';

  const homeConf = game.homeTid === -1 
    ? 'East' 
    : game.homeTid === -3 
      ? 'Rookies'
      : 'Home';
  const awayConf = game.awayTid === -2
    ? 'West'
    : game.awayTid === -4
      ? 'Sophs'
      : 'Away';

  const homeLogo = game.homeTid === -1 
    ? EAST_LOGO_URL
    : game.homeTid === -3
      ? EAST_LOGO_URL  // rookies use east logo
      : '';
  const awayLogo = game.awayTid === -2
    ? WEST_LOGO_URL
    : game.awayTid === -4
      ? WEST_LOGO_URL  // sophs use west logo
      : '';

  return (
    <div 
      onClick={onViewDetails}
      className={`bg-[#111] border rounded-2xl p-4 flex flex-col relative overflow-hidden group transition-all cursor-pointer ${isRisingStars ? 'border-sky-500/30 hover:border-sky-500/50' : isAllStar ? 'border-amber-500/30 hover:border-amber-500/50' : 'border-fuchsia-500/30 hover:border-fuchsia-500/50'}`}
    >
      <div className="flex justify-between items-center mb-4">
        <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${badgeClass}`}>
          {game.played ? 'Final' : title}
        </span>
        <div className="flex gap-2">
          {!game.played && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onWatchGame?.(game);
              }}
              className="flex items-center gap-1 text-[9px] font-black text-white hover:text-indigo-300 transition-colors uppercase tracking-widest bg-indigo-600 px-2 py-1 rounded-lg"
            >
              <Play size={10} fill="currentColor" />
              Watch
            </button>
          )}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
            className={`flex items-center gap-1 text-[9px] font-black transition-colors uppercase tracking-widest ${textClass}`}
          >
            Rosters
          </button>
        </div>
      </div>
      
      <div className="flex flex-row items-center justify-between px-1 w-full">
        <div className="flex flex-col items-center gap-2 w-1/3">
          <img src={awayLogo} alt={awayConf} className="w-10 h-10 object-contain" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="text-center">
            <div className="font-black text-[10px] text-white tracking-tight leading-tight">{awayConf}</div>
          </div>
        </div>
        
        <div className="flex flex-col items-center justify-center w-1/3">
          {game.played ? (
            <div className="flex items-center gap-2">
              <span className={`text-xl font-black font-mono tracking-tighter ${game.awayScore > game.homeScore ? 'text-white' : 'text-slate-700'}`}>{game.awayScore}</span>
              <span className="text-slate-800 font-black text-sm">-</span>
              <span className={`text-xl font-black font-mono tracking-tighter ${game.homeScore > game.awayScore ? 'text-white' : 'text-slate-700'}`}>{game.homeScore}</span>
            </div>
          ) : (
            <div className="text-lg font-black text-slate-800 italic tracking-tighter">VS</div>
          )}
        </div>
        
        <div className="flex flex-col items-center gap-2 w-1/3">
          <img src={homeLogo} alt={homeConf} className="w-10 h-10 object-contain" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="text-center">
            <div className="font-black text-[10px] text-white tracking-tight leading-tight">{homeConf}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
