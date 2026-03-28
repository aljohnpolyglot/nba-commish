import React from 'react';
import { Game, NBATeam } from '../../../types';
import { PlayCircle, CalendarDays } from 'lucide-react';

interface DailyGamesBarProps {
    games: Game[];
    teams: NBATeam[];
    onWatch: (game: Game) => void;
    onTeamClick?: (teamId: number) => void;
}

export const DailyGamesBar: React.FC<DailyGamesBarProps> = ({ games, teams, onWatch, onTeamClick }) => {
    if (games.length === 0) return null;

    return (
        <div className="w-full mb-6">
            <div className="flex items-center gap-2 mb-2 px-1">
                <CalendarDays size={12} className="text-indigo-500" />
                <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Games Today</h3>
            </div>
            
            <div className="w-full overflow-x-auto custom-scrollbar pb-2 px-1">
                <div className="flex gap-2">
                    {games.map(game => {
                        const homeTeam = teams.find(t => t.id === game.homeTid);
                        const awayTeam = teams.find(t => t.id === game.awayTid);

                        if (!homeTeam || !awayTeam) return null;

                        return (
                            <div
                                key={game.gid}
                                onClick={() => onWatch(game)}
                                className="group relative flex-shrink-0 bg-slate-900/40 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/60 transition-all rounded-xl p-3 flex flex-col items-center gap-2 min-w-[120px] cursor-pointer"
                            >
                                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <PlayCircle size={12} className="text-indigo-400" />
                                </div>
                                
                                <div className="flex items-center justify-between w-full px-0.5 gap-2">
                                    <div className="flex flex-col items-center gap-0.5">
                                        <img src={awayTeam.logoUrl} alt={awayTeam.abbrev} className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />
                                        <span className="text-[9px] font-black text-white uppercase tracking-tighter">{awayTeam.abbrev}</span>
                                        <span className="text-[8px] text-slate-500 font-mono">{awayTeam.wins ?? 0}-{awayTeam.losses ?? 0}</span>
                                    </div>

                                    <span className="text-[10px] font-black text-slate-700">@</span>

                                    <div className="flex flex-col items-center gap-0.5">
                                        <img src={homeTeam.logoUrl} alt={homeTeam.abbrev} className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />
                                        <span className="text-[9px] font-black text-white uppercase tracking-tighter">{homeTeam.abbrev}</span>
                                        <span className="text-[8px] text-slate-500 font-mono">{homeTeam.wins ?? 0}-{homeTeam.losses ?? 0}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
