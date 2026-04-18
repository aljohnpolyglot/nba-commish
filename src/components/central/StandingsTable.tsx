import React from 'react';
import type { NBATeam, Conference } from '../../types';

interface StandingsTableProps {
    teams: NBATeam[];
    conference: Conference;
    onSelectTeam: (id: number) => void;
    selectedTeamId: number | null;
}

const StandingsTable: React.FC<StandingsTableProps> = ({ teams, conference, onSelectTeam, selectedTeamId }) => (
    <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-4">
        <h4 className="text-md font-semibold text-indigo-400 mb-4 border-b border-zinc-800 pb-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
          {conference}ern Conference
        </h4>
        <div className="space-y-1">
             <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold px-2 uppercase tracking-tighter">
                <span className="flex-1">TEAM</span>
                <div className="flex space-x-4">
                    <span className="w-6 text-center">W</span>
                    <span className="w-6 text-center">L</span>
                </div>
            </div>
            {teams.map((team, index) => (
                <div 
                    key={team.id} 
                    onClick={() => onSelectTeam(team.id)}
                    className={`flex items-center justify-between text-sm p-2 rounded-lg cursor-pointer transition-all ${selectedTeamId === team.id ? 'bg-indigo-600/20 ring-1 ring-indigo-500/50' : 'hover:bg-zinc-800/50'}`}
                >
                    <div className="flex items-center flex-1 min-w-0">
                        <span className="font-mono w-6 text-zinc-600 text-xs">{index + 1}</span>
                        <img src={team.logoUrl} alt={team.name} className="h-6 w-6 mx-2 flex-shrink-0" referrerPolicy="no-referrer"/>
                        <span className="font-medium text-zinc-200 truncate">{team.name}</span>
                    </div>
                    <div className="font-mono text-zinc-400 flex space-x-4 flex-shrink-0 text-xs">
                        <span className="font-bold text-white w-6 text-center">{team.wins}</span>
                        <span className="w-6 text-center">{team.losses}</span>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

export default StandingsTable;
