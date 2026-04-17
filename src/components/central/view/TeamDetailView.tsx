import React, { useMemo, useState } from 'react';
import { Star, Calendar, LayoutGrid, BarChart2, DollarSign, ArrowRightLeft } from 'lucide-react';
import { NBATeam, Game, NBAPlayer } from '../../../types';
import { convertTo2KRating, normalizeDate } from '../../../utils/helpers';
import { PlayerCard } from './PlayerCard';
import { GameBar } from './GameBar';
import { TeamDetailHeader } from './TeamDetailHeader';
import { TeamStatsCards } from './TeamStatsCards';
import { ContractTimeline } from './TeamFinancesViewDetailed';
import { TeamTransactionsTab } from './TransactionsView';
import { PlayerStatsView } from './PlayerStatsView';
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
  const [activeTab, setActiveTab] = useState<'roster' | 'stats' | 'contracts' | 'transactions'>('roster');

  const teamPlayers = useMemo(() => {
    return players
      .filter(p => 
        p.tid === team.id && 
        !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || '')
      )
      .sort((a, b) => {
        const ratingA = convertTo2KRating(a.overallRating, a.ratings?.[a.ratings.length - 1]?.hgt ?? 50, a.ratings?.[a.ratings.length - 1]?.tp);
        const ratingB = convertTo2KRating(b.overallRating, b.ratings?.[b.ratings.length - 1]?.hgt ?? 50, b.ratings?.[b.ratings.length - 1]?.tp);
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

  // Percentile-based market size: top 33% = High, middle = Medium, bottom = Low
  // Only compare against NBA teams (East/West) — external league teams have pop=0 and skew rankings
  const marketTier = useMemo((): 'High' | 'Medium' | 'Low' => {
    const nbaTeams = allTeams.filter(t => t.conference === 'East' || t.conference === 'West');
    const pops = nbaTeams.map(t => (t as any).pop ?? 0).sort((a, b) => a - b);
    if (pops.length === 0) return 'Medium';
    const thisPop = (team as any).pop ?? 0;
    const rank = pops.filter(p => p <= thisPop).length; // 1-indexed rank (lowest=1)
    const pct = rank / pops.length; // 0–1
    if (pct >= 0.667) return 'High';
    if (pct >= 0.333) return 'Medium';
    return 'Low';
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
          marketTier={marketTier}
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
                {activeTab === 'roster' ? 'Active Roster' : activeTab === 'stats' ? 'Player Stats' : activeTab === 'contracts' ? 'Contracts' : 'Transactions'}
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
                <button
                  onClick={() => setActiveTab('contracts')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === 'contracts'
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <DollarSign size={12} />
                  Contracts
                </button>
                <button
                  onClick={() => setActiveTab('transactions')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === 'transactions'
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <ArrowRightLeft size={12} />
                  Moves
                </button>
              </div>
            </div>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Season 2025-26</span>
          </div>
          
          {activeTab === 'contracts' ? (
            <ContractTimeline teamId={team.id} />
          ) : activeTab === 'transactions' ? (
            <TeamTransactionsTab team={team} />
          ) : activeTab === 'roster' ? (
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
            <PlayerStatsView initialTeamFilter={team.abbrev} />
          )}
        </div>
      </div>
    </div>
  );
};
