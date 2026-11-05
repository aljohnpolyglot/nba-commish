import { useState } from 'react';
import { Group, Game } from '../../../data/fiba/groupsData';
import { getFlagUrl } from '../../../data/fiba/data';
import { Info } from 'lucide-react';

interface GroupStandingsProps {
  groups: Group[];
}

export default function GroupStandings({ groups }: GroupStandingsProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const renderGameCard = (game: Game) => (
    <div key={game.id} className="bg-white rounded-[4px] shadow-sm flex mb-3 p-3 text-black">
      <div className="flex-grow flex flex-col space-y-3 justify-center">
        <div className="flex justify-between text-[10px] md:text-[11px] text-gray-500 font-bold uppercase tracking-wide">
          <span>{game.groupPhase}</span>
          <span>{game.status}</span>
        </div>
        <div className="flex flex-col space-y-2">
          <div className="flex justify-between items-center pr-3">
            <div className="flex items-center space-x-2">
              <img src={game.team1FlagUrl || getFlagUrl(game.team1FlagId)} alt="" className="w-[24px] h-[16px] object-cover rounded-sm border border-gray-200" />
              <span className="font-bold text-[14px]">{game.team1Code}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-[15px]">{game.team1Score}</span>
              {typeof game.team1Score === 'number' && typeof game.team2Score === 'number' && game.team1Score > game.team2Score ? (
                <div className="w-0 h-0 border-t-[4px] border-t-transparent border-r-[5px] border-r-[#e43a45] border-b-[4px] border-b-transparent"></div>
              ) : <div className="w-[5px]"></div>}
            </div>
          </div>
          <div className="flex justify-between items-center pr-3">
            <div className="flex items-center space-x-2">
              <img src={game.team2FlagUrl || getFlagUrl(game.team2FlagId)} alt="" className="w-[24px] h-[16px] object-cover rounded-sm border border-gray-200" />
              <span className="font-bold text-[14px]">{game.team2Code}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-[15px]">{game.team2Score}</span>
              {typeof game.team1Score === 'number' && typeof game.team2Score === 'number' && game.team2Score > game.team1Score ? (
                <div className="w-0 h-0 border-t-[4px] border-t-transparent border-r-[5px] border-r-[#e43a45] border-b-[4px] border-b-transparent"></div>
              ) : <div className="w-[5px]"></div>}
            </div>
          </div>
        </div>
      </div>
      <div className="border-l border-gray-100 pl-3 ml-1 flex items-center justify-center">
        <button className="bg-[#f0f2f5] hover:bg-[#e4e6e9] text-[#4b5563] font-medium text-[13px] px-3 py-1.5 rounded transition-colors whitespace-nowrap">
          + More
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 pb-16 space-y-8 mt-6">
      {groups.map((group) => {
        const isExpanded = expandedGroups[group.name];
        
        // Group games by date string
        const gamesByDate = group.games?.reduce((acc, game) => {
          if (!acc[game.dateStr]) acc[game.dateStr] = [];
          acc[game.dateStr].push(game);
          return acc;
        }, {} as Record<string, Game[]>) || {};

        return (
          <div key={group.name} className="bg-[#222a36] rounded-xl overflow-hidden shadow-md">
            <div className="flex justify-between items-start px-5 py-5 bg-[#222a36]">
              <div className="flex flex-col">
                <h2 className="text-white font-bold text-xl tracking-tight leading-none mb-1">{group.name}</h2>
                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">{group.games?.filter(game => game.status.toLowerCase() === 'final').length ?? 0}/{group.games?.length ?? 0} GAMES PLAYED</span>
              </div>
              <button className="text-gray-400 hover:text-white transition-colors p-1">
                <Info size={18} />
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-[#80ffd4] text-[#111720]">
                    <th colSpan={2} className="py-2 px-3 border-r border-[#6be0b5] border-opacity-50"></th>
                    <th colSpan={4} className="py-2 px-3 text-center text-[10px] font-bold uppercase tracking-wide border-r border-[#6be0b5] border-opacity-50">Games</th>
                    <th colSpan={1} className="py-2 px-3 text-center text-[10px] font-bold uppercase tracking-wide border-r border-[#6be0b5] border-opacity-50">Streak</th>
                    <th colSpan={5} className="py-2 px-3 text-center text-[10px] font-bold uppercase tracking-wide border-r border-[#6be0b5] border-opacity-50">Game Points</th>
                    <th colSpan={1} className="py-2 px-3 text-center text-[10px] font-bold uppercase tracking-wide border-r border-[#6be0b5] border-opacity-50">Points</th>
                    <th colSpan={1} className="py-2 px-3 text-center text-[10px] font-bold uppercase tracking-wide">Next</th>
                  </tr>
                  <tr className="bg-[#80ffd4] text-[#111720] border-t border-[#6be0b5] border-opacity-50">
                    <th className="py-2 px-4 text-center text-[10px] font-bold uppercase w-8">#</th>
                    <th className="py-2 px-2 text-left text-[10px] font-bold uppercase">Team</th>
                    <th className="py-2 px-2 text-center text-[10px] font-bold uppercase w-10">GP</th>
                    <th className="py-2 px-2 text-center text-[10px] font-bold uppercase w-10">W</th>
                    <th className="py-2 px-2 text-center text-[10px] font-bold uppercase w-10">L</th>
                    <th className="py-2 px-2 text-center text-[10px] font-bold uppercase w-12">%</th>
                    <th className="py-2 px-3 text-center text-[10px] font-bold uppercase w-24">Last 5</th>
                    <th className="py-2 px-2 text-center text-[10px] font-bold uppercase w-12">For</th>
                    <th className="py-2 px-2 text-center text-[10px] font-bold uppercase w-12">Agt</th>
                    <th className="py-2 px-2 text-center text-[10px] font-bold uppercase w-12">+/-</th>
                    <th className="py-2 px-2 text-center text-[10px] font-bold uppercase w-12">FA</th>
                    <th className="py-2 px-2 text-center text-[10px] font-bold uppercase w-12">AA</th>
                    <th className="py-2 px-3 text-center text-[10px] font-bold uppercase w-12"></th>
                    <th className="py-2 px-3 text-center text-[10px] font-bold uppercase w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a3445]">
                  {group.teams.map((team, index) => {
                    const points = team.w * 2 + team.l * 1;
                    const fa = team.gp > 0 ? (team.forPts / team.gp).toFixed(1) : '—';
                    const aa = team.gp > 0 ? (team.agtPts / team.gp).toFixed(1) : '—';

                    return (
                      <tr key={team.code} className={index % 2 === 0 ? 'bg-[#2b3341]' : 'bg-[#222a36]'}>
                        <td className="py-3 px-4 text-center font-medium text-white text-[13px]">
                          {team.rank}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center space-x-2">
                            <img 
                              src={team.flagUrl || getFlagUrl(team.flagId)}
                              alt=""
                              className="w-[20px] h-[14px] object-cover rounded-[1px] shadow-sm" 
                            />
                            <span className="font-bold text-white text-[14px] tracking-tight">{team.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center text-gray-200 text-[13px]">{team.gp}</td>
                        <td className="py-3 px-2 text-center text-gray-200 text-[13px]">{team.w}</td>
                        <td className="py-3 px-2 text-center text-gray-200 text-[13px]">{team.l}</td>
                        <td className="py-3 px-2 text-center text-gray-200 text-[13px]">{team.pct}</td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex justify-center items-center space-x-1 h-full mt-1">
                            {Array.from({ length: 5 }).map((_, i) => {
                              let colorClass = 'bg-[#6b7280]'; // gray default
                              if (i < team.w) colorClass = 'bg-[#10b981]'; // green win
                              else if (i < team.w + team.l) colorClass = 'bg-[#ef4444]'; // red loss
                              return <div key={i} className={`w-[5px] h-[5px] rounded-full ${colorClass}`}></div>;
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center text-gray-300 text-[13px]">{team.forPts}</td>
                        <td className="py-3 px-2 text-center text-gray-300 text-[13px]">{team.agtPts}</td>
                        <td className="py-3 px-2 text-center text-gray-300 text-[13px]">{team.diff}</td>
                        <td className="py-3 px-2 text-center text-gray-300 text-[13px]">{fa}</td>
                        <td className="py-3 px-2 text-center text-gray-300 text-[13px]">{aa}</td>
                        <td className="py-3 px-3 text-center text-white text-[14px] font-bold">{points}</td>
                        <td className="py-3 px-3 text-center text-gray-400 text-[13px]">-</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {isExpanded && group.games && (
              <div className="bg-[#1b2330] p-5 flex flex-col space-y-6">
                {Object.entries(gamesByDate).map(([date, games]) => (
                  <div key={date}>
                    <div className="text-[#8d939e] text-[10px] font-bold uppercase mb-3 tracking-wider">{date}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {games.map(renderGameCard)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {group.games && group.games.length > 0 && (
              <div className="border-t border-[#343e4f]">
                <button 
                  className="w-full px-6 py-3.5 bg-transparent hover:bg-[#2b3341] transition-colors flex items-center justify-center font-bold text-[14px] text-white"
                  onClick={() => toggleGroup(group.name)}
                >
                  {isExpanded ? 'Hide games' : 'Show games'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
