import React from 'react';
import { ArrowLeft, Plane } from 'lucide-react';
// Added NBAPlayer and calculateTeamStrength import
import { NBATeam, Game, NBAPlayer } from '../../../types';
import { calculateTeamStrength } from '../../../utils/playerRatings';
import { useGame } from '../../../store/GameContext';

interface TeamDetailHeaderProps {
  team: NBATeam;
  players: NBAPlayer[]; // Added this prop
  gameToday: Game | undefined;
  opponent: NBATeam | null | undefined;
  onBack: () => void;
  onVisit: (team: NBATeam) => void;
  onTeamClick?: (teamId: number) => void;
}

export const TeamDetailHeader: React.FC<TeamDetailHeaderProps> = ({
  team,
  players, // Add this line here
  gameToday,
  opponent,
  onBack,
  onVisit,
  onTeamClick
}) => {
  const { state } = useGame();
  const isGM = state.gameMode === 'gm';
  return (
    <div className="p-4 md:p-10 border-b border-slate-800 bg-slate-900/50 flex flex-col md:flex-row items-start md:items-center justify-between backdrop-blur-md gap-4">
      <div className="flex items-center gap-4 md:gap-6">
        <button 
          onClick={onBack}
          className="p-3 md:p-4 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all duration-200 text-slate-400 hover:text-white shadow-lg shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-950 rounded-2xl md:rounded-[2rem] border border-slate-800 flex items-center justify-center p-3 md:p-4 shadow-2xl shrink-0">
            <img src={team.logoUrl} alt={team.abbrev} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h2 className="text-xl md:text-3xl font-black text-white tracking-tighter uppercase">{team.name}</h2>
            <div className="flex items-center gap-2 md:gap-3 mt-1 flex-wrap">
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] bg-indigo-500/10 px-2 py-1 rounded-lg">{team.conference}ern Conf</span>
              <div className="w-1 h-1 rounded-full bg-slate-700 hidden md:block"></div>
              <span className="text-xs font-bold text-slate-500">{team.wins}W - {team.losses}L</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4 self-end md:self-auto">
          {!isGM && (
          <button
            onClick={() => onVisit(team)}
            className={`group flex items-center gap-3 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95 ${
                gameToday
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20 hover:shadow-amber-500/40'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20 hover:shadow-indigo-500/40'
            }`}
          >
            <Plane size={14} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            {gameToday ? (
              <span>
                Watch vs{' '}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onTeamClick && opponent) onTeamClick(opponent.id);
                  }}
                  className="underline hover:text-white transition-colors cursor-pointer"
                >
                  {opponent?.abbrev || 'OPP'}
                </span>
              </span>
            ) : 'Visit Team (Off Day)'}
          </button>
          )}
        <div className="bg-slate-950 border border-slate-800 px-4 md:px-6 py-2 md:py-3 rounded-2xl flex flex-col items-end">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Strength</span>

            <span className="text-lg md:text-xl font-black text-indigo-400 tracking-tighter">
                {calculateTeamStrength(team.id, players)}
            </span>
         </div>
      </div>
    </div>
  );
};
