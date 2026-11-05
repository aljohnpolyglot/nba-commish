import React, { useState, useMemo } from 'react';
import { gamesData } from '../../../data/fiba/gamesData';
import { CountryFlag } from '../../shared/CountryFlag';
import Leaders from './Leaders';
import PlayersList from './PlayersList';
import GamesList from './GamesList';
import StatsTable from './StatsTable';
import type { FibaGameCard } from './GamesList';
import type { FibaPlayerCard } from './PlayersList';
import type { LeaderCategory } from '../../../data/fiba/leadersData';
import type { PlayerStatRow } from './StatsTable';
import type { InternationalTournamentState } from '../../../services/fiba/types';
import { buildFibaPlayerStatRowsByPhase } from './fibaStatsData';
import { internationalTournamentTitle } from '../../../services/fiba/competitionIdentity';

interface TeamDetailProps {
  team: {
    name: string;
    code: string;
    flagId: string;
    flagUrl?: string;
  };
  games?: readonly FibaGameCard[];
  players?: readonly FibaPlayerCard[];
  leaders?: readonly LeaderCategory[];
  stats?: readonly PlayerStatRow[];
  tournament?: InternationalTournamentState;
  tournamentYear?: number;
  onBack: () => void;
  onOpenBoxScore: (game: any) => void;
  onPlayerSelect?: (playerId: string) => void;
}

export default function TeamDetail({ team, games, players, leaders, stats, tournament, tournamentYear = 2019, onBack, onOpenBoxScore, onPlayerSelect }: TeamDetailProps) {
  const [activeTab, setActiveTab] = useState<'Leaders' | 'Players' | 'Games' | 'Statistics'>('Leaders');

  // Calculate record from gamesData
  const record = useMemo(() => {
    let wins = 0;
    let losses = 0;
    (games ?? gamesData).forEach(game => {
      const isTeam1 = game.team1Code === team.code;
      const isTeam2 = game.team2Code === team.code;
      if (isTeam1 || isTeam2) {
        if (game.winner === 1) {
          if (isTeam1) wins++;
          else losses++;
        } else if (game.winner === 2) {
          if (isTeam2) wins++;
          else losses++;
        }
      }
    });
    return { wins, losses };
  }, [games, team.code]);
  const phaseRows = useMemo(
    () => tournament && stats ? buildFibaPlayerStatRowsByPhase(tournament, stats) : undefined,
    [stats, tournament],
  );
  const competitionTitle = tournament
    ? internationalTournamentTitle(tournament.kind)
    : 'International Basketball';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Breadcrumbs */}
      <nav className="text-gray-400 text-xs sm:text-sm flex flex-wrap items-center space-x-2 mb-6 font-medium">
        <span className="hover:text-white transition-colors cursor-pointer" onClick={onBack}>Home</span>
        <span>&gt;</span>
        <span className="hover:text-white transition-colors cursor-pointer" onClick={onBack}>History</span>
        <span>&gt;</span>
        <span className="hover:text-white transition-colors cursor-pointer" onClick={onBack}>{competitionTitle}</span>
        <span>&gt;</span>
        <span className="hover:text-white transition-colors cursor-pointer" onClick={onBack}>{tournamentYear}</span>
        <span>&gt;</span>
        <span className="text-[#3bf0b4] font-bold">{team.name}</span>
      </nav>

      {/* Team Banner */}
      <div className="relative bg-gradient-to-r from-[#172d23] to-[#111720] rounded-2xl p-6 sm:p-10 border border-emerald-950 overflow-hidden shadow-2xl mb-8">
        <span className="text-white/5 font-black text-[90px] sm:text-[140px] absolute right-6 top-1/2 -translate-y-1/2 select-none tracking-widest pointer-events-none">
          {team.code}
        </span>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center space-x-6">
            <CountryFlag
              country={team.name}
              className="inline-flex h-[55px] w-[80px] rounded-lg border border-white/10 bg-[#0f141d] shadow-2xl sm:h-[85px] sm:w-[130px]"
              imageClassName="h-full w-full object-cover"
            />
            
            <div>
              <h1 className="text-white font-black tracking-tight text-3xl sm:text-5xl mb-2">
                {team.name}
              </h1>
              <div className="flex items-center space-x-3 text-gray-400 text-xs sm:text-sm font-semibold uppercase tracking-wider">
                <span className="bg-emerald-950/80 text-[#3bf0b4] px-2.5 py-1 rounded-[4px] border border-emerald-900/60 font-bold">
                  W/L: {record.wins}-{record.losses}
                </span>
                <span>•</span>
                <span>FIBA ID: {team.flagId}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-800/80 mb-6 overflow-x-auto scrollbar-none">
        {(['Leaders', 'Players', 'Games', 'Statistics'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-3.5 px-6 font-extrabold text-[14px] uppercase tracking-wider border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab
                ? 'border-[#3bf0b4] text-[#3bf0b4] bg-[#3bf0b4]/5'
                : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content Panels - Reusing existing components with filtering */}
      <div className="min-h-[400px]">
        {activeTab === 'Leaders' && (
          <Leaders teamCode={team.code} categories={leaders} stats={stats} onPlayerSelect={onPlayerSelect} />
        )}

        {activeTab === 'Players' && (
          <PlayersList teamCode={team.code} players={players} onPlayerSelect={onPlayerSelect} />
        )}

        {activeTab === 'Games' && (
          <GamesList teamCode={team.code} games={games} onOpenBoxScore={onOpenBoxScore} />
        )}

        {activeTab === 'Statistics' && (
          <StatsTable teamCode={team.code} rows={stats} phaseRows={phaseRows} onPlayerSelect={onPlayerSelect} />
        )}
      </div>
    </div>
  );
}
