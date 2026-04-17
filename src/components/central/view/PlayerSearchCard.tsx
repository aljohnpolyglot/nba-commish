import React from 'react';
import { motion } from 'motion/react';
import { NBAPlayer, NBATeam, NonNBATeam } from '../../../types';
import { getCountryCode } from '../../../utils/helpers';
import { getPlayerImage } from './bioCache';

interface PlayerSearchCardProps {
  player: NBAPlayer & { displayOvr: number; calculatedAge: number; extractedCountry: string };
  teams: NBATeam[];
  nonNBATeams: NonNBATeam[];
  onClick: (player: NBAPlayer) => void;
  onTeamClick?: (teamId: number) => void;
}

export const PlayerSearchCard: React.FC<PlayerSearchCardProps> = ({ player, teams, nonNBATeams, onClick, onTeamClick }) => {
  const isNBA = !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || '');
  const team = isNBA ? teams.find(t => t.id === player.tid) : null;
  const nonNBATeam = !isNBA ? nonNBATeams.find(t => t.tid === player.tid && t.league === player.status) : null;
  
  let teamName = 'Free Agent';
  if (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') {
    teamName = 'Draft Prospect';
  } else if (team) {
    teamName = team.name;
  } else if (nonNBATeam) {
    teamName = nonNBATeam.name;
  }

  const isInjured = player.injury && player.injury.type !== 'Healthy' && player.injury.gamesRemaining > 0;
  const isSuspended = player.suspension && player.suspension.gamesRemaining > 0;
  const isAvailable = !isInjured && !isSuspended;

  let statusText = '';
  if (isInjured) {
    statusText = `OUT - ${player.injury.type}`;
  } else if (isSuspended) {
    statusText = 'OUT - SUSPENDED';
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-slate-900/40 border ${isAvailable ? 'border-slate-800/50' : 'border-rose-500/30'} p-4 rounded-3xl hover:border-indigo-500/50 transition-all group cursor-pointer relative overflow-hidden`}
      onClick={() => onClick(player)}
    >
      {!isAvailable && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500/50 z-20" />
      )}
      <div className="flex items-center gap-4 relative z-10">
        <div className="relative">
          <div className={`w-16 h-16 rounded-2xl bg-slate-800 overflow-hidden border ${isAvailable ? 'border-slate-700' : 'border-rose-500/50'}`}>
            <img 
              src={getPlayerImage(player) || `https://picsum.photos/seed/${player.name}/100/100`} 
              alt={player.name}
              className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${!isAvailable ? 'grayscale-[0.5]' : ''}`}
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="absolute -top-2 -right-2 w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center border-2 border-slate-900 shadow-xl">
            <span className="text-xs font-black text-white">{player.displayOvr}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-white truncate group-hover:text-indigo-400 transition-colors">{player.name}</h4>
            {!isAvailable && (
              <span className="text-[8px] font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded uppercase tracking-tighter whitespace-nowrap">
                {statusText}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{player.pos}</span>
            <span className="text-[10px] text-slate-600">•</span>
            {team && onTeamClick ? (
              <button 
                onClick={(e) => { e.stopPropagation(); onTeamClick(team.id); }}
                className="text-[10px] font-bold text-slate-500 truncate hover:text-indigo-400 transition-colors"
              >
                {teamName}
              </button>
            ) : (
              <span className="text-[10px] font-bold text-slate-500 truncate">
                {teamName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-medium text-slate-600">{player.calculatedAge}</span>
            <span className="text-[10px] text-slate-700">|</span>
            <span className="text-[10px] font-medium text-slate-600 truncate flex items-center gap-1">
              {getCountryCode(player.extractedCountry) && (
                <img 
                  src={`https://flagcdn.com/w20/${getCountryCode(player.extractedCountry)}.png`}
                  alt=""
                  className="w-3 h-2 object-cover rounded-[1px]"
                />
              )}
              {player.extractedCountry}
            </span>
          </div>
        </div>
      </div>
      {/* Background Accent */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-3xl rounded-full -mr-12 -mt-12 group-hover:bg-indigo-500/10 transition-all" />
    </motion.div>
  );
};
