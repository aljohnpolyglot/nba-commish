import React from 'react';
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
}

export const PlayInCard: React.FC<PlayInCardProps> = ({
  pig,
  teams,
  schedule,
  stateDate,
  isSelected,
  onClick,
  label,
}) => {
  if (!pig) {
    return (
      <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-2.5 flex items-center justify-center h-[68px]">
        <span className="text-slate-700 text-[10px] font-bold">TBD</span>
      </div>
    );
  }

  const t1 = pig.team1Tid > 0 ? teams.find(t => t.id === pig.team1Tid) : null;
  const t2 = pig.team2Tid > 0 ? teams.find(t => t.id === pig.team2Tid) : null;
  const game = pig.gameId ? schedule.find(g => g.gid === pig.gameId) : null;
  const isToday = game ? normalizeDate(game.date) === normalizeDate(stateDate) : false;
  const winner = pig.played && pig.winnerId ? teams.find(t => t.id === pig.winnerId) : null;
  const teamsReady = pig.team1Tid > 0 && pig.team2Tid > 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-[#111] border ${isSelected ? 'border-indigo-400/60' : pig.played ? 'border-white/5' : 'border-indigo-500/20'} rounded-xl overflow-hidden transition-all hover:bg-white/[0.04] ${isSelected ? 'ring-1 ring-inset ring-indigo-400/20' : ''}`}
    >
      <div className="px-2.5 pt-1.5 pb-0">
        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{label}</span>
      </div>
      <div className="px-2.5 pb-2 pt-1">
        {/* Team 1 */}
        <div className={`flex items-center gap-1.5 mb-1 ${winner && winner.id !== pig.team1Tid ? 'opacity-30' : ''}`}>
          {t1
            ? <img src={t1.logoUrl} className="w-5 h-5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
            : <div className="w-5 h-5 bg-slate-800 rounded-full shrink-0" />}
          <span className="text-xs font-bold text-white flex-1 truncate">{t1?.abbrev ?? 'TBD'}</span>
          {pig.played && game && (
            <span className={`text-xs font-black shrink-0 ${winner?.id === pig.team1Tid ? 'text-emerald-400' : 'text-slate-600'}`}>
              {game.homeScore}
            </span>
          )}
        </div>
        {/* Team 2 */}
        <div className={`flex items-center gap-1.5 ${winner && winner.id !== pig.team2Tid ? 'opacity-30' : ''}`}>
          {t2
            ? <img src={t2.logoUrl} className="w-5 h-5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
            : <div className="w-5 h-5 bg-slate-800 rounded-full shrink-0" />}
          <span className="text-xs font-bold text-white flex-1 truncate">{t2?.abbrev ?? 'TBD'}</span>
          {pig.played && game && (
            <span className={`text-xs font-black shrink-0 ${winner?.id === pig.team2Tid ? 'text-emerald-400' : 'text-slate-600'}`}>
              {game.awayScore}
            </span>
          )}
        </div>

        {!pig.played && teamsReady && isToday ? (
          <div className="mt-1 text-[9px] font-black text-indigo-400 uppercase tracking-wide text-center">Today</div>
        ) : !pig.played && teamsReady && game ? (
          <div className="mt-1 text-[9px] text-slate-600 text-center">
            {new Date(game.date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })}
          </div>
        ) : pig.played && winner ? (
          <div className="mt-1 text-[9px] text-emerald-400 font-bold text-center">{winner.abbrev} wins</div>
        ) : null}
      </div>
    </button>
  );
};
