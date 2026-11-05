import React, { useEffect, useMemo, useState } from 'react';
import { Star, Calendar, LayoutGrid, BarChart2, DollarSign, ArrowRightLeft, Stethoscope, TrendingUp } from 'lucide-react';
import { InjuriesView } from './InjuriesView';
import { RosterProgressionView } from './RosterProgressionView';
import { NBATeam, Game, NBAPlayer } from '../../../types';
import { normalizeDate } from '../../../utils/helpers';
import { PlayerCard } from './PlayerCard';
import { GameBar } from './GameBar';
import { TeamDetailHeader } from './TeamDetailHeader';
import { TeamStatsCards } from './TeamStatsCards';
import { ContractTimeline } from '../../shared/ContractTimeline';
import { TeamTransactionsTab } from './TeamTransactionsTab';
import { PlayerStatsView } from './PlayerStatsView';
import { isOnRoster, resolveAnyTeam } from '../../../utils/teamLookup';
import { useGame } from '../../../store/GameContext';
import { getScoutedDisplayOverall } from '../../../utils/scoutingFuzz';
import { isExternalLeagueStatus } from '../../../constants';
import { getTeamCompetitionRecord } from '../../../utils/competitionRecord';
import { formatGameDateShort, parseGameDate } from '../../../utils/dateUtils';
import { getLeagueScheduleReleaseDate } from '../../../services/leagueCalendar';
import { formatLeagueSeasonLabel } from '../../../services/leagueCalendar';
import {
  buildNativeHistoricalPlayersThroughSeason,
  ensureFullRosterPlayerDataLoaded,
  ensureNativeHistoricalStatsLoaded,
  getAllFullRosterPlayers,
} from '../../../data/realPlayerDataFetcher';
import { getHistoricalNbaCompletedSeasonCutoff } from '../../../services/playerDevelopment/hofHistoryWindow';
import { buildHistoricalTeamRoster, getHistoricalTeamRosterSeasons } from './historicalTeamRoster';
import { SeasonChevronControl } from '../../shared/SeasonChevronControl';
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
  competitionId?: string;
}

export const TeamDetailView: React.FC<TeamDetailViewProps> = ({
  team, players, allTeams, schedule, currentDate, onBack, onContact, onViewBio, onVisit, onGameClick, onTeamClick, competitionId
}) => {
  const { state } = useGame();
  const [activeTab, setActiveTab] = useState<'roster' | 'stats' | 'contracts' | 'transactions' | 'injuries' | 'progression'>('roster');
  const isNonNBA = !state.teams.some(candidate => candidate.id === team.id);
  const currentSeason = useMemo(() => {
    if (state.leagueStats?.year) return state.leagueStats.year;
    const date = new Date(currentDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return month >= 10 ? year + 1 : year;
  }, [currentDate, state.leagueStats?.year]);
  const sourceHistoryCutoff = getHistoricalNbaCompletedSeasonCutoff({
    currentYear: currentSeason,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  }) ?? currentSeason;
  const [sourcePlayers, setSourcePlayers] = useState<NBAPlayer[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(currentSeason);

  useEffect(() => {
    setSelectedSeason(currentSeason);
  }, [currentSeason, team.id]);

  useEffect(() => {
    if (isNonNBA || state.leagueType === 'fictional') {
      setSourcePlayers([]);
      return;
    }
    let active = true;
    Promise.all([ensureFullRosterPlayerDataLoaded(), ensureNativeHistoricalStatsLoaded()])
      .then(() => {
        if (!active) return;
        setSourcePlayers([
          ...getAllFullRosterPlayers(),
          ...buildNativeHistoricalPlayersThroughSeason(sourceHistoryCutoff),
        ] as NBAPlayer[]);
      })
      .catch(() => { if (active) setSourcePlayers([]); });
    return () => { active = false; };
  }, [isNonNBA, sourceHistoryCutoff, state.leagueType]);
  const activeCompetitionId = competitionId ?? (isNonNBA ? state.euroPrimaryCompetitionId : undefined);
  const competitionRecord = useMemo(
    () => activeCompetitionId
      ? getTeamCompetitionRecord(state.boxScores ?? [], team.id, currentSeason, activeCompetitionId)
      : null,
    [activeCompetitionId, currentSeason, state.boxScores, team.id],
  );
  const displayWins = competitionRecord?.wins ?? team.wins ?? 0;
  const displayLosses = competitionRecord?.losses ?? team.losses ?? 0;
  const teamSchedule = useMemo(
    () => activeCompetitionId ? schedule.filter(game => game.competitionId === activeCompetitionId) : schedule,
    [activeCompetitionId, schedule],
  );
  const resolvedTeams = useMemo(() => {
    const byId = new Map<number, NBATeam>();
    for (const candidate of allTeams) {
      if (Number.isFinite(candidate.id)) byId.set(candidate.id, candidate);
    }
    for (const candidate of state.teams ?? []) byId.set(candidate.id, candidate);
    for (const candidate of state.nonNBATeams ?? []) {
      const resolved = resolveAnyTeam(candidate.tid, state.teams, state.nonNBATeams ?? []);
      if (resolved) byId.set(resolved.id, resolved);
    }
    return [...byId.values()];
  }, [allTeams, state.nonNBATeams, state.teams]);

  const currentTeamPlayers = useMemo(() => {
    return players
      .filter(p => p.tid === team.id && (isNonNBA ? isOnRoster(p) : !isExternalLeagueStatus(p.status)))
      .sort((a, b) => {
        const ratingA = getScoutedDisplayOverall(state, a, currentSeason);
        const ratingB = getScoutedDisplayOverall(state, b, currentSeason);
        return ratingB - ratingA || a.name.localeCompare(b.name);
      });
  }, [currentSeason, players, state, team.id, isNonNBA]);
  const availableRosterSeasons = useMemo(
    () => isNonNBA
      ? [currentSeason]
      : getHistoricalTeamRosterSeasons({
          savedPlayers: players,
          sourcePlayers,
          team,
          currentSeason,
          sourceCutoff: sourceHistoryCutoff,
        }),
    [currentSeason, isNonNBA, players, sourceHistoryCutoff, sourcePlayers, team],
  );
  const historicalRoster = selectedSeason !== currentSeason;
  const teamPlayers = useMemo(() => {
    const roster = historicalRoster
      ? buildHistoricalTeamRoster({
          savedPlayers: players,
          sourcePlayers,
          team,
          season: selectedSeason,
          sourceCutoff: sourceHistoryCutoff,
        })
      : currentTeamPlayers;
    return roster.sort((left, right) =>
      getScoutedDisplayOverall(state, right, selectedSeason)
      - getScoutedDisplayOverall(state, left, selectedSeason)
      || left.name.localeCompare(right.name),
    );
  }, [currentTeamPlayers, historicalRoster, players, selectedSeason, sourceHistoryCutoff, sourcePlayers, state, team]);
  const progressionPlayers = useMemo(() => {
    if (!isNonNBA || team.id !== state.userTeamId) return teamPlayers;
    const academyPlayers = state.euroScouting?.academyPlayers ?? [];
    const seniorIds = new Set(teamPlayers.map(player => String(player.internalId)));
    return [
      ...teamPlayers,
      ...academyPlayers.filter(player => !seniorIds.has(String(player.internalId))),
    ];
  }, [isNonNBA, state.euroScouting?.academyPlayers, state.userTeamId, team.id, teamPlayers]);

  const playerStats = useMemo(() => {
    return teamPlayers.map(player => {
      const stat = player.stats?.find(s => s.season === selectedSeason && !s.playoffs);
      return { player, stat };
    }).filter(p => p.stat && p.stat.gp > 0)
    .sort((a, b) => (b.stat?.pts || 0) / (b.stat?.gp || 1) - (a.stat?.pts || 0) / (a.stat?.gp || 1));
  }, [teamPlayers, selectedSeason]);

  const conferenceRank = useMemo(() => {
    const peers = resolvedTeams
      .filter(t => t.conference === team.conference);
    const index = peers
      .sort((a, b) => (b.wins / (b.wins + b.losses || 1)) - (a.wins / (a.wins + a.losses || 1)))
      .findIndex(t => t.id === team.id);
    return index >= 0 ? index + 1 : null;
  }, [resolvedTeams, team]);

  // Percentile-based market size: top 33% = High, middle = Medium, bottom = Low.
  const marketTier = useMemo((): 'High' | 'Medium' | 'Low' => {
    const leagueTeams = allTeams.some(candidate => candidate.id === team.id) ? allTeams : resolvedTeams;
    const pops = leagueTeams.map(t => (t as any).pop ?? 0).sort((a, b) => a - b);
    if (pops.length === 0) return 'Medium';
    const thisPop = (team as any).pop ?? 0;
    const rank = pops.filter(p => p <= thisPop).length; // 1-indexed rank (lowest=1)
    const pct = rank / pops.length; // 0–1
    if (pct >= 0.667) return 'High';
    if (pct >= 0.333) return 'Medium';
    return 'Low';
  }, [allTeams, resolvedTeams, team]);

  const gameToday = useMemo(() => {
      const normalizedCurrent = normalizeDate(currentDate);
      return teamSchedule.find(g => 
          (g.homeTid === team.id || g.awayTid === team.id) && 
          !g.played && 
          normalizeDate(g.date) === normalizedCurrent
      );
  }, [teamSchedule, team.id, currentDate]);

  const opponent = useMemo(() => {
      if (!gameToday) return null;
      const oppId = gameToday.homeTid === team.id ? gameToday.awayTid : gameToday.homeTid;
      return resolvedTeams.find(t => t.id === oppId) ?? null;
  }, [gameToday, resolvedTeams, team.id]);


  const scheduleReleaseDate = useMemo(
    () => getLeagueScheduleReleaseDate(currentSeason, state.leagueStats),
    [currentSeason, state.leagueStats],
  );
  const scheduleReleaseLabel = formatGameDateShort(scheduleReleaseDate);
  const isScheduleRevealed = useMemo(() => {
    if (isNonNBA) return teamSchedule.some(g => g.homeTid === team.id || g.awayTid === team.id);
    return parseGameDate(currentDate).getTime() >= scheduleReleaseDate.getTime();
  }, [currentDate, isNonNBA, scheduleReleaseDate, teamSchedule, team.id]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-300 overflow-hidden rounded-[2.5rem] border border-slate-800 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
    <TeamDetailHeader 
        team={team}
        players={players} // <-- This connects the data
        gameToday={gameToday}
        opponent={opponent}
        wins={displayWins}
        losses={displayLosses}
        onBack={onBack}
        onVisit={onVisit}
        onTeamClick={onTeamClick}
      />
      <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-6 md:space-y-10 custom-scrollbar">
        <TeamStatsCards
          conferenceRank={conferenceRank}
          rosterSize={teamPlayers.length}
          marketTier={marketTier}
          rankLabel={isNonNBA ? 'League Rank' : 'Conference Rank'}
        />

        <div className="bg-slate-900/40 border border-slate-800 p-3 md:p-6 rounded-2xl md:rounded-3xl backdrop-blur-sm">
          <h3 className="text-sm md:text-xl font-black text-white flex items-center gap-2 md:gap-3 uppercase tracking-tight mb-3">
            <Calendar size={14} className="text-indigo-500" />
            Schedule
          </h3>
          {isScheduleRevealed ? (
            <GameBar 
              teamId={team.id} 
              schedule={teamSchedule}
              currentDate={currentDate} 
              allTeams={resolvedTeams}
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
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1">Check back on {scheduleReleaseLabel}</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 md:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h3 className="text-lg md:text-xl font-black text-white flex items-center gap-2 md:gap-3 uppercase tracking-tight">
                <Star size={18} className="text-indigo-500" />
                {activeTab === 'roster' ? historicalRoster ? 'Historical Roster' : 'Active Roster' : activeTab === 'stats' ? 'Player Stats' : activeTab === 'contracts' ? 'Contracts' : activeTab === 'injuries' ? 'Injury Report' : activeTab === 'progression' ? 'Roster Progression' : 'Transactions'}
              </h3>
              
              <div className="flex bg-slate-900/80 border border-slate-800 p-1 rounded-xl overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <button
                  onClick={() => setActiveTab('roster')}
                  className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
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
                  className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
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
                  className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
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
                  className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === 'transactions'
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <ArrowRightLeft size={12} />
                  Moves
                </button>
                <button
                  onClick={() => setActiveTab('injuries')}
                  className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === 'injuries'
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Stethoscope size={12} />
                  Injuries
                </button>
                <button
                  onClick={() => setActiveTab('progression')}
                  className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === 'progression'
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <TrendingUp size={12} />
                  Progression
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
              Season
              <SeasonChevronControl<number>
                values={availableRosterSeasons}
                value={selectedSeason}
                onChange={value => setSelectedSeason(value)}
                formatValue={season => formatLeagueSeasonLabel(season, state.leagueStats)}
                size="md"
              />
            </div>
          </div>
          
          {activeTab === 'injuries' ? (
            historicalRoster ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm font-bold text-slate-500">
                No archived injury snapshot is available for this roster season.
              </div>
            ) : <InjuriesView filteredTeamId={team.id} embedded />
          ) : activeTab === 'progression' ? (
            <RosterProgressionView players={progressionPlayers} />
          ) : activeTab === 'contracts' ? (
            <ContractTimeline teamId={team.id} currentYear={selectedSeason} players={teamPlayers} />
          ) : activeTab === 'transactions' ? (
            <TeamTransactionsTab team={team} selectedSeason={selectedSeason} />
          ) : activeTab === 'roster' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
              {teamPlayers.map(player => (
                <PlayerCard 
                  key={player.internalId} 
                  player={player} 
                  team={team}
                  onActionClick={onContact} 
                  hideNbaContractBadges={isNonNBA}
                  displaySeason={selectedSeason}
                  historicalRoster={historicalRoster}
                />
              ))}
              {teamPlayers.length === 0 && (
                <div className="col-span-full rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm font-bold text-slate-500">
                  No roster records are available for {formatLeagueSeasonLabel(selectedSeason, state.leagueStats)}.
                </div>
              )}
            </div>
          ) : (
            <PlayerStatsView initialTeamFilter={String(team.id)} selectedSeason={selectedSeason} />
          )}
        </div>
      </div>
    </div>
  );
};

