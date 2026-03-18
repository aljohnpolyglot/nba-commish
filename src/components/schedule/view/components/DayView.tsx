import React from 'react';
import { ChevronLeft, ChevronRight, Play, MonitorPlay, FastForward } from 'lucide-react';
import { Game, NBATeam } from '../../../../types';
import { normalizeDate, getTeamForGame } from '../../../../utils/helpers';
import { AllStarDayView } from './AllStarDayView';
import { AllStarGameCard } from './AllStarGameCard';

interface DayViewProps {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  setViewMode: (mode: 'calendar' | 'day' | 'watching') => void;
  state: any;
  formatDateDisplay: (dateStr: string) => string;
  gamesForSelectedDate: Game[];
  simulateDay: () => Promise<void>;
  simulateToDate: (date: string) => Promise<void>;
  handleWatchGame: (game: Game) => void;
  setSelectedBoxScoreGame: (game: Game) => void;
  onNavigateToAllStar: () => void;
  onViewRosters: (tab: string) => void;
  onWatchDunkContest: () => void;
  onWatchThreePoint: () => void;
  onViewContestDetails: (type: 'dunk' | 'three') => void;
  onViewBoxScore: (game: Game) => void;
  maxSimulatableDate: Date;
  openConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
}

export const DayView: React.FC<DayViewProps> = ({
  selectedDate,
  setSelectedDate,
  setViewMode,
  state,
  formatDateDisplay,
  gamesForSelectedDate,
  simulateDay,
  simulateToDate,
  handleWatchGame,
  setSelectedBoxScoreGame,
  onNavigateToAllStar,
  onViewRosters,
  onWatchDunkContest,
  onWatchThreePoint,
  onViewContestDetails,
  onViewBoxScore,
  maxSimulatableDate,
  openConfirmModal
}) => {
  const stateDateNorm = normalizeDate(state.date);
  const selectedDateNorm = normalizeDate(selectedDate);
  const isActuallyToday = selectedDateNorm === stateDateNorm;

  const [year, month, day] = selectedDateNorm.split('-').map(Number);
  const isRisingStarsDay = month === 2 && day === 13;
  const isSaturdayEventsDay = month === 2 && day === 14;
  const isAllStarGameDay = month === 2 && day === 15;
  const isCelebrityGameDay = month === 2 && day === 13;

  const isAllStarWeekend = isRisingStarsDay || isSaturdayEventsDay || isAllStarGameDay || isCelebrityGameDay;

  const selectedDateUTC = new Date(`${selectedDateNorm}T00:00:00Z`);
  const stateDateUTC = new Date(`${stateDateNorm}T00:00:00Z`);
  const canSimulateToSelected = !isActuallyToday && selectedDateUTC > stateDateUTC && selectedDateUTC <= maxSimulatableDate;

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 bg-[#0a0a0a]">
      <div className="w-full">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setViewMode('calendar')}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">{formatDateDisplay(selectedDate)}</h2>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${isActuallyToday ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {isActuallyToday ? 'Current Day' : 'Viewing Schedule'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                const d = new Date(selectedDateUTC);
                d.setUTCDate(d.getUTCDate() - 1);
                setSelectedDate(d.toISOString());
              }}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all"
            >
              <ChevronLeft size={18} />
            </button>
            <button 
              onClick={() => {
                const d = new Date(selectedDateUTC);
                d.setUTCDate(d.getUTCDate() + 1);
                setSelectedDate(d.toISOString());
              }}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-8">
          <button
            onClick={() => simulateDay()}
            disabled={state.isSimulating || !isActuallyToday}
            className={`px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
              state.isSimulating || !isActuallyToday
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
            }`}
          >
            <Play size={14} fill="currentColor" />
            Simulate Day
          </button>
          
          <button
            onClick={() => openConfirmModal('Simulate to Date', `Simulate until ${formatDateDisplay(selectedDate)}?`, () => simulateToDate(selectedDate))}
            disabled={state.isSimulating || !canSimulateToSelected}
            className={`px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
              state.isSimulating || !canSimulateToSelected
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
            }`}
          >
            <FastForward size={14} />
            To Date
          </button>

        </div>

        {isAllStarWeekend ? (
          <AllStarDayView 
            selectedDateObj={selectedDateUTC}
            isRisingStarsDay={isRisingStarsDay}
            isSaturdayEventsDay={isSaturdayEventsDay}
            isAllStarGameDay={isAllStarGameDay}
            isCelebrityGameDay={isCelebrityGameDay}
            allStar={state.allStar}
            onNavigateToAllStar={onNavigateToAllStar}
            onViewRosters={onViewRosters}
            onWatchGame={handleWatchGame}
            onWatchDunkContest={onWatchDunkContest}
            onWatchThreePoint={onWatchThreePoint}
            onViewContestDetails={onViewContestDetails}
            onViewBoxScore={onViewBoxScore}
            state={state}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {gamesForSelectedDate.length === 0 ? (
              <div className="col-span-full text-center py-20 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                <div className="text-4xl mb-4">🌙</div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">No Games Scheduled</h3>
                <p className="text-slate-500 text-xs">There are no NBA games on this date.</p>
              </div>
            ) : (
              gamesForSelectedDate.map(game => {
                if ((game as any).isDunkContest || (game as any).isThreePointContest) {
                  return null;
                }
                
                if (game.isAllStar || game.isRisingStars || (game as any).isCelebrityGame) {
                  return <AllStarGameCard 
                    key={game.gid} 
                    game={game} 
                    allStar={state.allStar}
                    onViewDetails={() => handleWatchGame(game)}
                    onWatchGame={handleWatchGame}
                  />;
                }

                const homeTeam = getTeamForGame(game.homeTid, state.teams);
                const awayTeam = getTeamForGame(game.awayTid, state.teams);
                if (!homeTeam || !awayTeam) return null;

                const series = (game.isPlayoff && game.playoffSeriesId)
                  ? state.playoffs?.series.find((s: any) => s.id === game.playoffSeriesId)
                  : null;
                const pigame = (game.isPlayIn && game.playoffSeriesId)
                  ? state.playoffs?.playInGames.find((p: any) => p.id === game.playoffSeriesId)
                  : null;

                return (
                  <div key={game.gid} className={`bg-[#111] border rounded-2xl p-4 transition-all hover:border-white/10 ${game.isPlayoff || game.isPlayIn ? 'border-indigo-500/20' : 'border-white/5'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {game.played ? 'Final' : 'Scheduled'}
                        </div>
                        {(game.isPlayoff || game.isPlayIn) && (
                          <img
                            src="https://content.sportslogos.net/logos/6/981/full/_nba_playoffs_logo_primary_2022_sportslogosnet-4785.png"
                            className="w-6 h-6 object-contain"
                            alt="Playoffs"
                          />
                        )}
                      </div>
                      {game.played && (
                        <button
                          onClick={() => setSelectedBoxScoreGame(game)}
                          className="text-[10px] font-black text-emerald-400 uppercase tracking-widest hover:underline"
                        >
                          Box Score
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      {/* Away Team */}
                      <div className="flex-1 flex flex-col items-center gap-2">
                        <img 
                          src={awayTeam.logoUrl} 
                          className="w-12 h-12 object-contain" 
                          alt={awayTeam.name}
                          referrerPolicy="no-referrer"
                        />
                        <div className="text-center">
                          <div className="text-sm font-black text-white">{awayTeam.abbrev}</div>
                          <div className="text-[10px] text-slate-500 font-bold">{awayTeam.name}</div>
                        </div>
                        {game.played && (
                          <div className={`text-2xl font-black ${game.awayScore > game.homeScore ? 'text-white' : 'text-slate-700'}`}>
                            {game.awayScore}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-center gap-2">
                        <div className="text-xs font-black text-slate-800 italic">VS</div>
                        {!game.played && isActuallyToday && (
                          <button 
                            onClick={() => handleWatchGame(game)}
                            className="p-2 rounded-full bg-white text-black hover:bg-emerald-400 transition-all"
                          >
                            <MonitorPlay size={16} fill="currentColor" />
                          </button>
                        )}
                      </div>

                      {/* Home Team */}
                      <div className="flex-1 flex flex-col items-center gap-2">
                        <img 
                          src={homeTeam.logoUrl} 
                          className="w-12 h-12 object-contain" 
                          alt={homeTeam.name}
                          referrerPolicy="no-referrer"
                        />
                        <div className="text-center">
                          <div className="text-sm font-black text-white">{homeTeam.abbrev}</div>
                          <div className="text-[10px] text-slate-500 font-bold">{homeTeam.name}</div>
                        </div>
                        {game.played && (
                          <div className={`text-2xl font-black ${game.homeScore > game.awayScore ? 'text-white' : 'text-slate-700'}`}>
                            {game.homeScore}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Series context for playoff/play-in games */}
                    {(series || pigame) && (
                      <div className="mt-3 pt-3 border-t border-white/5 text-center">
                        {series && (() => {
                          const higher = state.teams.find((t: any) => t.id === series.higherSeedTid);
                          const lower = state.teams.find((t: any) => t.id === series.lowerSeedTid);
                          const gameNum = game.playoffGameNumber || 1;
                          let text = `Game ${gameNum}`;
                          if (series.higherSeedWins > 0 || series.lowerSeedWins > 0) {
                            if (series.higherSeedWins > series.lowerSeedWins)
                              text += ` · ${higher?.abbrev} leads ${series.higherSeedWins}-${series.lowerSeedWins}`;
                            else if (series.lowerSeedWins > series.higherSeedWins)
                              text += ` · ${lower?.abbrev} leads ${series.lowerSeedWins}-${series.higherSeedWins}`;
                            else
                              text += ` · Tied ${series.higherSeedWins}-${series.lowerSeedWins}`;
                          }
                          return <span className="text-[10px] font-bold text-indigo-400">{text}</span>;
                        })()}
                        {pigame && !series && (
                          <span className="text-[10px] font-bold text-indigo-400">
                            Play-In · {pigame.gameType === '7v8' ? '7v8 · Winner → 7 Seed' : pigame.gameType === '9v10' ? '9v10 · Loser Eliminated' : 'Loser Game · Winner → 8 Seed'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
