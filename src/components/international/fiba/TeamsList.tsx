import React, { useState } from 'react';
import { teamsData, Team } from '../../../data/fiba/teamsData';
import { CountryFlag } from '../../shared/CountryFlag';
import TeamDetail from './TeamDetail';
import type { FibaGameCard } from './GamesList';
import type { FibaPlayerCard } from './PlayersList';
import type { LeaderCategory } from '../../../data/fiba/leadersData';
import type { PlayerStatRow } from './StatsTable';
import type { InternationalTournamentState } from '../../../services/fiba/types';

interface TeamsListProps {
  teams?: readonly Team[];
  games?: readonly FibaGameCard[];
  players?: readonly FibaPlayerCard[];
  leaders?: readonly LeaderCategory[];
  stats?: readonly PlayerStatRow[];
  tournament?: InternationalTournamentState;
  tournamentYear?: number;
  onOpenBoxScore?: (game: {
    team1Code: string;
    team2Code: string;
    team1Score: number;
    team2Score: number;
    team1FlagId: string;
    team2FlagId: string;
    phaseAndGroup: string;
    date: string;
  }) => void;
  onPlayerSelect?: (playerId: string) => void;
  selectedTeamCode?: string | null;
  onSelectedTeamChange?: (teamCode: string | null) => void;
}

export default function TeamsList({ teams = teamsData, games, players, leaders, stats, tournament, tournamentYear, onOpenBoxScore, onPlayerSelect, selectedTeamCode, onSelectedTeamChange }: TeamsListProps) {
  const [internalSelectedTeam, setInternalSelectedTeam] = useState<Team | null>(null);
  const selectedTeam = selectedTeamCode
    ? teams.find(team => team.code === selectedTeamCode) ?? null
    : internalSelectedTeam;
  const selectTeam = (team: Team | null) => {
    setInternalSelectedTeam(team);
    onSelectedTeamChange?.(team?.code ?? null);
  };

  /*
    DEVELOPER COMMENT: ALL TEAMS CLICKABLE
    Every team item is clickable. Clicking a team launches the TeamDetail view, which showcases
    fully interactive leaders boards, roster cards, game results history, and togglable statistics.
  */

  if (selectedTeam) {
    return (
      <TeamDetail 
        team={selectedTeam} 
        games={games}
        players={players}
        leaders={leaders}
        stats={stats}
        tournament={tournament}
        tournamentYear={tournamentYear}
        onBack={() => selectTeam(null)}
        onOpenBoxScore={onOpenBoxScore || (() => {})} 
        onPlayerSelect={onPlayerSelect}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((team) => (
          <button
            key={team.code}
            onClick={() => selectTeam(team)}
            className="flex items-center justify-between bg-[#222a36] hover:bg-[#2c3645] transition-colors p-4 rounded-xl cursor-pointer w-full text-left focus:outline-none"
          >
            <div className="flex items-center space-x-5">
              <CountryFlag
                country={team.name}
                className="inline-flex h-7 w-10 rounded-[2px] bg-[#111720] shadow-sm"
                imageClassName="h-full w-full object-cover"
              />
              <span className="text-white font-medium text-[16px]">{team.name}</span>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="bg-[#1b222d] text-gray-300 text-[11px] font-bold tracking-wider px-2 py-1 rounded-[4px]">
                {team.code}
              </div>
              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
