import React from 'react';
import { Activity } from 'lucide-react';
import { NBAPlayer, NBATeam } from '../../../types';
import { convertTo2KRating } from '../../../utils/helpers';
import { getPlayerImage } from './bioCache';

interface PlayerCardProps {
  player: NBAPlayer;
  team?: NBATeam;
  onActionClick: (player: NBAPlayer) => void;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({ player, team, onActionClick }) => {
  const isInjured = player.injury && player.injury.type !== 'Healthy' && player.injury.gamesRemaining > 0;
  const isSuspended = player.suspension && player.suspension.gamesRemaining > 0;
  const isAvailable = !isInjured && !isSuspended;

  // Determine status label
  let statusLabel = 'Free Agent';
  if (team) {
    statusLabel = team.name;
  } else if (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') {
    statusLabel = 'Draft Prospect';
  } else if (player.status === 'WNBA') {
    statusLabel = 'WNBA';
  } else if (player.status === 'Euroleague') {
    statusLabel = 'Euroleague';
  } else if (player.status === 'PBA') {
    statusLabel = 'PBA';
  }

  // Handle image source safely
  const imageSrc = getPlayerImage(player);

  let statusText = 'Available';
  if (isInjured) {
    statusText = `Out - ${player.injury.type}`;
  } else if (isSuspended) {
    statusText = 'OUT - SUSPENDED';
  }

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-6 hover:border-indigo-500/30 transition-all duration-300 group relative overflow-hidden">
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-all duration-500"></div>
      
      <div className="flex items-center gap-6 relative z-10">
        <div className="relative">
          {imageSrc ? (
            <img 
              src={imageSrc} 
              alt={player.name} 
              className="w-20 h-20 rounded-[2rem] object-cover bg-slate-800 border-2 border-slate-700 group-hover:scale-105 transition-transform duration-300 shadow-xl" 
              referrerPolicy="no-referrer"
            />
          ) : (
             <div className="w-20 h-20 rounded-[2rem] bg-slate-800 border-2 border-slate-700 flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform duration-300">
                <span className="text-xl font-bold text-slate-500">{player.name.charAt(0)}</span>
             </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-slate-950 rounded-full flex items-center justify-center border-2 border-slate-800">
            <span className="text-[10px] font-black text-white">{convertTo2KRating(player.overallRating, player.hgt || 50)}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-lg font-black text-white truncate tracking-tight mb-1">{player.name}</h4>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            {statusLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">
              {player.pos}
            </span>
            <span className="bg-slate-500/10 text-slate-400 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">
              {new Date().getFullYear() - (player.born?.year || 2000)} YRS
            </span>
          </div>
        </div>
      </div>
      
      <div className="mt-6 pt-4 border-t border-slate-800/50 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isAvailable ? 'text-slate-600' : 'text-rose-500'}`}>
            {statusText}
          </span>
        </div>
        <button 
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onActionClick(player);
          }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black px-4 py-2 rounded-xl transition-all duration-200 uppercase tracking-[0.2em] shadow-lg shadow-indigo-600/20 md:opacity-0 md:group-hover:opacity-100 md:translate-y-2 md:group-hover:translate-y-0 opacity-100 translate-y-0"
        >
          <Activity size={12} />
          Actions
        </button>
      </div>
    </div>
  );
};
