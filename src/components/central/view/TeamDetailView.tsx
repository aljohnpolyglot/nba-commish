import React, { useMemo, useState } from 'react';
import { Star, Calendar, LayoutGrid, BarChart2 } from 'lucide-react';
import { NBATeam, Game, NBAPlayer } from '../../../types';
import { calculateTeamStrength } from '../../../utils/playerRatings';
import { convertTo2KRating, normalizeDate } from '../../../utils/helpers';
import { PlayerCard } from './PlayerCard';
import { GameBar } from './GameBar';
import { TeamDetailHeader } from './TeamDetailHeader';
import { TeamStatsCards } from './TeamStatsCards';

interface TeamDetailViewProps {
  team: NBATeam;
  players: NBAPlayer[];
  allTeams: NBATeam[];
  schedule: Game[];
  currentDate: string;
  onBack: () => void;
  onContact: (player: NBAPlayer) => void;
  onViewBio?: (player: NBAPlayer) => void;
  onVisit: (team: NBATeam) => void;
  onGameClick?: (game: Game) => void;
  onTeamClick?: (teamId: number) => void;
}

export const TeamDetailView: React.FC<TeamDetailViewProps> = ({ 
  team, players, allTeams, schedule, currentDate, onBack, onContact, onViewBio, onVisit, onGameClick, onTeamClick 
}) => {
  const [activeTab, setActiveTab] = useState<'roster' | 'stats'>('roster');

  const teamPlayers = useMemo(() => {
    return players
      .filter(p => 
        p.tid === team.id && 
        p.status !== 'WNBA' && 
        p.status !== 'Euroleague' && 
        p.status !== 'PBA'
      )
      .sort((a, b) => {
        const ratingA = convertTo2KRating(a.overallRating, a.ratings?.[a.ratings.length - 1]?.hgt ?? 50);
        const ratingB = convertTo2KRating(b.overallRating, b.ratings?.[b.ratings.length - 1]?.hgt ?? 50);
        return ratingB - ratingA;
      });
  }, [players, team.id]);

const currentSeason = useMemo(() => {
    const date = new Date(currentDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    // Season 2025-26 starts in Oct 2025.
    return month >= 10 ? year + 1 : year;
  }, [currentDate]);

  const playerStats = useMemo(() => {
    return teamPlayers.map(player => {
      const stat = player.stats?.find(s => s.season === currentSeason && !s.playoffs);
      return { player, stat };
    }).filter(p => p.stat && p.stat.gp > 0)
    .sort((a, b) => (b.stat?.pts || 0) / (b.stat?.gp || 1) - (a.stat?.pts || 0) / (a.stat?.gp || 1));
  }, [teamPlayers, currentSeason]);

  const conferenceRank = useMemo(() => {
    return allTeams
      .filter(t => t.conference === team.conference)
      .sort((a, b) => (b.wins / (b.wins + b.losses || 1)) - (a.wins / (a.wins + a.losses || 1)))
      .findIndex(t => t.id === team.id) + 1;
  }, [allTeams, team]);

  const gameToday = useMemo(() => {
      const normalizedCurrent = normalizeDate(currentDate);
      return schedule.find(g => 
          (g.homeTid === team.id || g.awayTid === team.id) && 
          !g.played && 
          normalizeDate(g.date) === normalizedCurrent
      );
  }, [schedule, team.id, currentDate]);

  const opponent = useMemo(() => {
      if (!gameToday) return null;
      const oppId = gameToday.homeTid === team.id ? gameToday.awayTid : gameToday.homeTid;
      return allTeams.find(t => t.id === oppId);
  }, [gameToday, allTeams, team.id]);

  const isScheduleRevealed = useMemo(() => {
    const date = new Date(currentDate);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    // Season opener is Oct 24. Revealed 3 days before (Oct 21).
    if (month === 10) return day >= 21;
    if (month > 10 || month < 7) return true;
    return false;
  }, [currentDate]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-300 overflow-hidden rounded-[2.5rem] border border-slate-800 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
    <TeamDetailHeader 
        team={team}
        players={players} // <-- This connects the data
        gameToday={gameToday}
        opponent={opponent}
        onBack={onBack}
        onVisit={onVisit}
        onTeamClick={onTeamClick}
      />
      <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-6 md:space-y-10 custom-scrollbar">
        <TeamStatsCards 
          conferenceRank={conferenceRank}
          rosterSize={teamPlayers.length}
        />

        <div className="bg-slate-900/40 border border-slate-800 p-3 md:p-6 rounded-2xl md:rounded-3xl backdrop-blur-sm">
          <h3 className="text-sm md:text-xl font-black text-white flex items-center gap-2 md:gap-3 uppercase tracking-tight mb-3">
            <Calendar size={14} className="text-indigo-500" />
            Schedule
          </h3>
          {isScheduleRevealed ? (
            <GameBar 
              teamId={team.id} 
              schedule={schedule} 
              currentDate={currentDate} 
              allTeams={allTeams} 
              onGameClick={onGameClick} 
              onTeamClick={onTeamClick}
            />
          ) : (
            <div className="py-8 flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-600">
                <Calendar size={24} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-400 uppercase tracking-tight">Schedule Not Yet Revealed</p>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1">Check back on October 21st</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 md:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h3 className="text-lg md:text-xl font-black text-white flex items-center gap-2 md:gap-3 uppercase tracking-tight">
                <Star size={18} className="text-indigo-500" />
                {activeTab === 'roster' ? 'Active Roster' : 'Team Statistics'}
              </h3>
              
              <div className="flex bg-slate-900/80 border border-slate-800 p-1 rounded-xl">
                <button 
                  onClick={() => setActiveTab('roster')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === 'roster' 
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <LayoutGrid size={12} />
                  Roster
                </button>
                <button 
                  onClick={() => setActiveTab('stats')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === 'stats' 
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <BarChart2 size={12} />
                  Stats
                </button>
              </div>
            </div>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Season 2025-26</span>
          </div>
          
          {activeTab === 'roster' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
              {teamPlayers.map(player => (
                <PlayerCard 
                  key={player.internalId} 
                  player={player} 
                  team={team}
                  onActionClick={onContact} 
                />
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-xs text-left min-w-[1000px]">
                  <thead className="text-[10px] text-slate-500 uppercase bg-slate-900/50 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-4 font-black tracking-widest">Player</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">GP</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">GS</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">MIN</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right text-white">PTS</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">ORB</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">DRB</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">REB</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">AST</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">STL</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">BLK</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">FGM</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">FGA</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">FG%</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">3PM</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">3PA</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">3P%</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">FTM</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">FTA</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">FT%</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">TOV</th>
                      <th className="px-4 py-4 font-black tracking-widest text-right">PF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {playerStats.map((item) => {
                      const s = item.stat!;
                      return (
                        <tr key={item.player.internalId} className="hover:bg-slate-800/40 transition-colors">
                          <td 
                            className="px-6 py-4 font-bold text-indigo-400 cursor-pointer hover:text-indigo-300 hover:underline"
                            onClick={() => onViewBio ? onViewBio(item.player) : onContact(item.player)}
                          >
                            {item.player.name}
                          </td>
                          <td className="px-4 py-4 text-right font-mono">{s.gp}</td>
                          <td className="px-4 py-4 text-right font-mono">{s.gs || 0}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.min / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono font-bold text-white">{(s.pts / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.orb / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.drb / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{((s.trb || (s.orb || 0) + (s.drb || 0)) / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.ast / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.stl / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.blk / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.fg / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.fga / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.fga > 0 ? (s.fg / s.fga) * 100 : 0).toFixed(1)}%</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.tp / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.tpa / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.tpa > 0 ? (s.tp / s.tpa) * 100 : 0).toFixed(1)}%</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.ft / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.fta / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.fta > 0 ? (s.ft / s.fta) * 100 : 0).toFixed(1)}%</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.tov / s.gp).toFixed(1)}</td>
                          <td className="px-4 py-4 text-right font-mono">{(s.pf / s.gp).toFixed(1)}</td>
                        </tr>
                      );
                    })}
                    {playerStats.length === 0 && (
                      <tr>
                        <td colSpan={22} className="px-6 py-12 text-center text-slate-500 font-bold uppercase tracking-widest">
                          No statistics recorded for this season
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
