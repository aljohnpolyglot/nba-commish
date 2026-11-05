import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Star, ChevronDown, ChevronRight } from 'lucide-react';
import type { NBAPlayer } from '../../types';
import type {
  SummerLeagueHistoryEntry,
  SummerLeagueTournamentState,
} from '../../services/summerLeague/types';
import { normalizeFibaPersonName } from '../../services/fiba/countryIdentity';
import { getSummerLeagueTeamLogo } from '../../services/summerLeague/teamIdentity';
import { useGame } from '../../store/GameContext';
import { getPlayerImage } from '../../utils/playerImage';
import { getPlayerPortraitUrl } from './utils';
import SummerLeagueRosterModal from './SummerLeagueRosterModal';
import TournamentView from './TournamentView';
import { getLeagueCalendarDates } from '../../services/leagueCalendar';
import { formatGameDateShort } from '../../utils/dateUtils';

interface SummerLeagueAppProps {
  entries: readonly SummerLeagueHistoryEntry[];
  players: readonly NBAPlayer[];
  currentTournament?: SummerLeagueTournamentState;
  isCommissionerMode: boolean;
  onFinalizeRoster: (playerIds: string[]) => void;
  onReviewDraftChange: (draft: NonNullable<SummerLeagueTournamentState['rosterReviewDraft']>) => void;
  onSimulate: () => void;
  onComplete: () => void;
  onPlayerSelect: (player: NBAPlayer) => void;
}

export default function App({
  entries,
  players,
  currentTournament,
  isCommissionerMode,
  onFinalizeRoster,
  onReviewDraftChange,
  onSimulate,
  onComplete,
  onPlayerSelect,
}: SummerLeagueAppProps) {
  const { state } = useGame();
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showCurrentTournament, setShowCurrentTournament] = useState(false);
  const [selectedTournamentYear, setSelectedTournamentYear] = useState<number | null>(null);
  const openedTournamentEntry = useRef<string | null>(null);

  const historyData = useMemo(() => entries.map(entry => ({
    year: entry.year,
    champion: entry.champion ?? 'N/A',
    runnerUp: entry.runnerUp ?? 'N/A',
    championshipMvp: entry.championshipMvp ?? 'N/A',
    mvp: entry.mvp ?? 'N/A',
    firstTeam: entry.firstTeam,
    secondTeam: entry.secondTeam,
  })), [entries]);
  const summerLeagueDateLabels = useMemo(() => new Map(entries.map(entry => {
    const dates = getLeagueCalendarDates(entry.year, state.leagueStats);
    const label = dates.summerLeagueStart && dates.summerLeagueEnd
      ? `${formatGameDateShort(dates.summerLeagueStart)} – ${formatGameDateShort(dates.summerLeagueEnd)}`
      : 'Dates unavailable';
    return [entry.year, label] as const;
  })), [entries, state.leagueStats]);

  useEffect(() => {
    if (!currentTournament || currentTournament.reviewed) return;
    const entryKey = `${currentTournament.id}:${currentTournament.reviewEntryVersion ?? 0}`;
    if (openedTournamentEntry.current === entryKey) return;
    openedTournamentEntry.current = entryKey;
    if (currentTournament.status === 'roster-selection' && !isCommissionerMode) {
      setShowRosterModal(true);
      return;
    }
    setShowCurrentTournament(true);
  }, [currentTournament, isCommissionerMode]);

  const playerPortrait = (name: string, year: number): string => {
    const normalized = normalizeFibaPersonName(name);
    const player = players.find(candidate => normalizeFibaPersonName(candidate.name) === normalized);
    const entry = entries.find(candidate => candidate.year === year);
    const sourcePlayer = entry?.sourceStats?.find(candidate => normalizeFibaPersonName(candidate.name) === normalized)
      ?? entry?.sourceTeams?.flatMap(team => team.roster).find(candidate => normalizeFibaPersonName(candidate.name) === normalized);
    const sourceImage = sourcePlayer
      ? 'portraitUrl' in sourcePlayer
        ? sourcePlayer.portraitUrl
        : 'imageUrl' in sourcePlayer
          ? sourcePlayer.imageUrl
          : undefined
      : undefined;
    return (player && getPlayerImage(player, { portraitSeason: year }))
      || sourceImage
      || getPlayerPortraitUrl(name);
  };

  const openPlayer = (name: string, year: number) => {
    const normalized = normalizeFibaPersonName(name);
    const player = entries.find(entry => entry.year === year)?.sourcePlayers
      ?.find(candidate => normalizeFibaPersonName(candidate.name) === normalized);
    if (player) onPlayerSelect(player);
  };

  const teamLogo = (teamName: string, year: number): string => {
    const entry = entries.find(candidate => candidate.year === year);
    const team = entry?.tournament?.teams.find(candidate => candidate.name === teamName);
    return team?.logoUrl || getSummerLeagueTeamLogo(state.teams, teamName, year);
  };

  const playerTeamName = (name: string, year: number): string => {
    const normalized = normalizeFibaPersonName(name);
    const entry = entries.find(candidate => candidate.year === year);
    const savedTeam = entry?.tournament?.teams.find(team =>
      [...team.players, ...team.reserves].some(player =>
        normalizeFibaPersonName(player.name) === normalized
      ),
    );
    if (savedTeam) return savedTeam.name;
    return entry?.sourceTeams?.find(team =>
      team.roster.some(player => normalizeFibaPersonName(player.name) === normalized)
    )?.name ?? '';
  };

  const openDetails = (year: number) => {
    if (year <= 2012) {
      window.open(`https://en.wikipedia.org/wiki/${year}_NBA_Summer_League`, '_blank', 'noopener,noreferrer');
      return;
    }
    setSelectedTournamentYear(year);
  };

  return (
    <div className="min-h-screen bg-white pb-20 font-sans text-slate-900">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        <header className="mb-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight flex items-center gap-4">
              <img src="https://upload.wikimedia.org/wikipedia/en/2/27/NBA_Summer_League_logo.png" alt="NBA Summer League" className="h-12 w-auto object-contain" />
              Summer League History
            </h1>
          </div>
        </header>

        {/* Header row */}
        <div className="hidden xl:grid grid-cols-[80px_minmax(200px,2fr)_minmax(180px,1.5fr)_minmax(180px,1.5fr)_minmax(200px,2fr)_minmax(200px,2fr)_120px] gap-6 px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
          <div>Year</div>
          <div>Finals</div>
          <div>Championship MVP</div>
          <div>League MVP</div>
          <div>All-Summer League First Team</div>
          <div>Second Team</div>
          <div className="text-right"></div>
        </div>

        <div className="space-y-4">
          {historyData.map((row, index) => (
            <motion.div
              key={row.year}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col xl:grid xl:grid-cols-[80px_minmax(200px,2fr)_minmax(180px,1.5fr)_minmax(180px,1.5fr)_minmax(200px,2fr)_minmax(200px,2fr)_120px] gap-6 p-6 relative overflow-hidden group hover:shadow-md transition-shadow"
            >
              {/* Left Accent border */}
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-500 rounded-l-xl"></div>

              {/* 1. Year */}
              <div className="flex flex-col justify-center pl-2">
                <div className="text-2xl font-black text-slate-900 tracking-tight">{row.year}</div>
                <div className="text-sm font-medium text-slate-600 mt-1">Las Vegas</div>
                <div className="text-xs text-slate-500">{summerLeagueDateLabels.get(row.year)}</div>
              </div>

              {/* 2. Finals */}
              <div className="flex flex-col justify-center gap-3">
                {row.champion !== 'N/A' && (
                  <div className="flex items-center gap-4">
                    <img src={teamLogo(row.champion, row.year)} alt={row.champion} className="w-12 h-12 object-contain drop-shadow-sm" />
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-600 leading-tight">{row.champion.split(' ').slice(0, -1).join(' ')}</span>
                      <span className="text-lg font-bold text-slate-900 leading-tight">{row.champion.split(' ').pop()}</span>
                      <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mt-0.5">Champions</span>
                    </div>
                  </div>
                )}
                {row.runnerUp !== 'N/A' && (
                  <div className="flex items-center gap-4 relative">
                    <div className="absolute -top-3 left-4 text-[10px] font-bold text-slate-400 bg-white px-1">VS.</div>
                    <img src={teamLogo(row.runnerUp, row.year)} alt={row.runnerUp} className="w-10 h-10 object-contain opacity-80 ml-1" />
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-500 leading-tight">{row.runnerUp.split(' ').slice(0, -1).join(' ')}</span>
                      <span className="text-base font-bold text-slate-700 leading-tight">{row.runnerUp.split(' ').pop()}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Runner-Up</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Championship MVP */}
              <div className="flex items-center">
                {row.championshipMvp !== 'N/A' ? (
                  <div className="flex items-center gap-4">
                    <button type="button" onClick={() => openPlayer(row.championshipMvp, row.year)} className="relative shrink-0">
                      <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                        <img src={playerPortrait(row.championshipMvp, row.year)} alt={row.championshipMvp} className="w-full h-full object-cover relative z-10 bg-white" onError={(e) => { e.currentTarget.style.display='none' }} />
                      </div>
                      <Crown className="w-5 h-5 text-orange-500 absolute -top-1 -right-1 bg-white rounded-full p-[2px] shadow-sm" />
                    </button>
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-bold text-slate-900 text-base leading-tight truncate">{row.championshipMvp}</span>
                      <span className="text-sm text-slate-500 truncate">{playerTeamName(row.championshipMvp, row.year)}</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-400 text-sm italic">N/A</span>
                )}
              </div>

              {/* 4. League MVP */}
              <div className="flex items-center">
                {row.mvp !== 'N/A' ? (
                  <div className="flex flex-col gap-4 w-full">
                    {row.mvp.split(' & ').map(mvp => (
                      <div key={mvp} className="flex items-center gap-4">
                        <button type="button" onClick={() => openPlayer(mvp, row.year)} className="relative shrink-0">
                          <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                            <img src={playerPortrait(mvp, row.year)} alt={mvp} className="w-full h-full object-cover relative z-10 bg-white" onError={(e) => { e.currentTarget.style.display='none' }} />
                          </div>
                          <Star className="w-5 h-5 text-amber-500 absolute -top-1 -right-1 bg-white rounded-full p-[2px] shadow-sm fill-amber-500" />
                        </button>
                        <div className="flex flex-col overflow-hidden">
                          <span className="font-bold text-slate-900 text-base leading-tight truncate">{mvp}</span>
                          <span className="text-sm text-slate-500 truncate">{playerTeamName(mvp, row.year)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 text-sm italic">N/A</span>
                )}
              </div>

              {/* 5. First Team */}
              <div className="flex flex-col justify-center">
                <div className="flex flex-col gap-2.5 w-full">
                  {row.firstTeam.length > 0 ? row.firstTeam.map((player, idx) => (
                    <button key={`first-${idx}`} type="button" onClick={() => openPlayer(player, row.year)} className="flex items-center gap-3 text-left">
                      <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center relative">
                        <img src={playerPortrait(player, row.year)} alt={player} className="w-full h-full object-cover relative z-10 bg-white" onError={(e) => { e.currentTarget.style.display='none' }} />
                      </div>
                      <span className="text-sm font-medium text-slate-700 truncate">{player}</span>
                    </button>
                  )) : (
                    <span className="text-slate-400 text-sm italic">N/A</span>
                  )}
                </div>
              </div>

              {/* 6. Second Team */}
              <div className="flex flex-col justify-center">
                <div className="flex flex-col gap-2.5 w-full">
                  {row.secondTeam.length > 0 ? row.secondTeam.map((player, idx) => (
                    <button key={`second-${idx}`} type="button" onClick={() => openPlayer(player, row.year)} className="flex items-center gap-3 text-left">
                      <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center relative">
                        <img src={playerPortrait(player, row.year)} alt={player} className="w-full h-full object-cover relative z-10 bg-white" onError={(e) => { e.currentTarget.style.display='none' }} />
                      </div>
                      <span className="text-sm font-medium text-slate-600 truncate">{player}</span>
                    </button>
                  )) : (
                    <span className="text-slate-400 text-sm italic">N/A</span>
                  )}
                </div>
              </div>

              {/* 7. View Details */}
              {(row.year !== 2011 && row.year !== 2020) && <div className="xl:flex hidden items-center justify-end">
                <button
                  onClick={() => openDetails(row.year)}
                  className="flex items-center gap-2 border border-orange-200 rounded-lg px-4 py-2 text-sm font-bold text-orange-600 hover:bg-orange-50 transition-colors whitespace-nowrap"
                >
                  View Details <ChevronDown className="w-4 h-4" />
                </button>
              </div>}
              {(row.year !== 2011 && row.year !== 2020) && <button
                onClick={() => openDetails(row.year)}
                className="xl:hidden w-full mt-4 flex items-center justify-center gap-2 bg-slate-100 rounded-lg px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                View Details <ChevronRight className="w-4 h-4" />
              </button>}

            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {showRosterModal && currentTournament && (
          <SummerLeagueRosterModal
            tournament={currentTournament}
            players={players}
            onDraftChange={onReviewDraftChange}
            onClose={() => setShowRosterModal(false)}
            onFinalize={playerIds => {
              onFinalizeRoster(playerIds);
              setShowRosterModal(false);
              setShowCurrentTournament(true);
            }}
            onPlayerSelect={onPlayerSelect}
          />
        )}
        {selectedTournamentYear !== null && (
          <TournamentView 
            entry={entries.find(entry => entry.year === selectedTournamentYear)}
            players={players}
            onPlayerSelect={onPlayerSelect}
            onClose={() => setSelectedTournamentYear(null)} 
          />
        )}
        {showCurrentTournament && currentTournament && (
          <TournamentView
            entry={entries.find(entry => entry.year === currentTournament.year)}
            tournament={currentTournament}
            players={players}
            onPlayerSelect={onPlayerSelect}
            onSimulate={onSimulate}
            onDone={() => {
              onComplete();
              setShowCurrentTournament(false);
            }}
            onClose={() => setShowCurrentTournament(false)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
