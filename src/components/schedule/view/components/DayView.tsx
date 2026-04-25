import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Play, MonitorPlay, FastForward, Globe, Ticket, Star, Trophy } from 'lucide-react';
import { Game, NBATeam, NBAPlayer, NonNBATeam } from '../../../../types';
import { normalizeDate, getTeamForGame, getOwnTeamId } from '../../../../utils/helpers';
import { getDraftLotteryDate, getDraftDate, getAllStarGameDate, toISODateString } from '../../../../utils/dateUtils';
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
  boxScores?: any[];
  players?: NBAPlayer[];
  nonNBATeams?: NonNBATeam[];
  onNavigateToDraftLottery?: () => void;
  onNavigateToDraftBoard?: () => void;
  onNavigateToSeasonPreview?: () => void;
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
  openConfirmModal,
  boxScores,
  players,
  nonNBATeams = [],
  onNavigateToDraftLottery,
  onNavigateToDraftBoard,
  onNavigateToSeasonPreview,
}) => {
  const stateDateNorm = normalizeDate(state.date);
  const selectedDateNorm = normalizeDate(selectedDate);
  const isActuallyToday = selectedDateNorm === stateDateNorm;
  const ownTid = getOwnTeamId(state);

  const [year, month, day] = selectedDateNorm.split('-').map(Number);
  const ls = state?.leagueStats;
  const seasonYear: number = ls?.year ?? year;
  const allStarGameDate   = getAllStarGameDate(seasonYear, ls);
  const allStarGameStr    = toISODateString(allStarGameDate);
  const allStarSatStr     = toISODateString(new Date(allStarGameDate.getTime() - 1 * 86_400_000));
  const allStarFriStr     = toISODateString(new Date(allStarGameDate.getTime() - 2 * 86_400_000));
  const isRisingStarsDay    = selectedDateNorm === allStarFriStr;
  const isSaturdayEventsDay = selectedDateNorm === allStarSatStr;
  const isAllStarGameDay    = selectedDateNorm === allStarGameStr;
  const isCelebrityGameDay  = selectedDateNorm === allStarFriStr;

  const isAllStarWeekend = isRisingStarsDay || isSaturdayEventsDay || isAllStarGameDay || isCelebrityGameDay;

  // Draft calendar events — derived from leagueStats so dates update when scheduler changes
  const draftLotteryDateStr = toISODateString(getDraftLotteryDate(seasonYear, ls));
  const draftDateStr        = toISODateString(getDraftDate(seasonYear, ls));
  const isDraftLotteryDay   = selectedDateNorm === draftLotteryDateStr;
  const isNBADraftDay       = selectedDateNorm === draftDateStr;

  // Season Preview — shows throughout October (training camp → opening night) until dismissed
  const isPreseasonMonth = month === 10;
  const showSeasonPreviewCard = isPreseasonMonth && !state?.seasonPreviewDismissed && !!state?.seasonHistory?.length;

  // Non-playoff teams sorted by worst record (for lottery odds display)
  const lotteryTeams = useMemo(() => {
    if (!isDraftLotteryDay || !state?.teams || !state?.playoffs) return [];
    const playoffTeamIds = new Set<number>();
    (state.playoffs?.series ?? []).forEach((s: any) => {
      playoffTeamIds.add(s.higherSeedTid);
      playoffTeamIds.add(s.lowerSeedTid);
    });
    // Also add play-in teams that advanced
    (state.playoffs?.playInGames ?? []).forEach((p: any) => {
      if (p.winner) playoffTeamIds.add(p.winner);
    });
    const nonPlayoff = (state.teams as NBATeam[]).filter(t => !playoffTeamIds.has(t.id));
    return nonPlayoff.sort((a, b) => (a.wins - a.losses) - (b.wins - b.losses)).slice(0, 14);
  }, [isDraftLotteryDay, state?.teams, state?.playoffs]);

  // Top draft prospects for NBA Draft card — only undrafted (tid === -2) players, excludes
  // anyone who has already been picked (tid changed to a real team by DraftSimulatorView).
  const topProspects = useMemo(() => {
    if (!players) return [];
    return players
      .filter(p => p.tid === -2)
      .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))
      .slice(0, 5);
  }, [players]);

  const selectedDateUTC = new Date(`${selectedDateNorm}T00:00:00Z`);
  const stateDateUTC = new Date(`${stateDateNorm}T00:00:00Z`);
  const canSimulateToSelected = !isActuallyToday && selectedDateUTC > stateDateUTC && selectedDateUTC <= maxSimulatableDate;

  const getWinnerBestPerformer = (game: Game) => {
    if (!game.played || !boxScores || !players) return null;
    const boxScore = boxScores.find(b => b.gameId === game.gid);
    if (!boxScore) return null;
    const winnerId = game.homeScore > game.awayScore ? game.homeTid : game.awayTid;
    const winnerStats = winnerId === game.homeTid
      ? boxScore.homeStats
      : boxScore.awayStats;
    if (!winnerStats || winnerStats.length === 0) return null;
    const best = [...winnerStats].sort((a: any, b: any) =>
      (b.gameScore ?? 0) - (a.gameScore ?? 0)
    )[0];
    if (!best) return null;
    const player = players.find(p => p.internalId === best.playerId);
    const parts: string[] = [];
    if (best.pts != null) parts.push(`${best.pts} PTS`);
    if (best.reb != null && best.reb >= 5) parts.push(`${best.reb} REB`);
    if (best.ast != null && best.ast >= 5) parts.push(`${best.ast} AST`);
    return {
      name: best.name,
      statLine: parts.join(' · '),
      imgURL: player?.imgURL,
    };
  };

  return (
    <div className="flex flex-col bg-[#0a0a0a]">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 flex flex-col min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
            {/* Draft Lottery Event Card */}
            {isDraftLotteryDay && (
              <div className="col-span-full bg-gradient-to-br from-indigo-950/80 to-purple-950/80 border border-indigo-500/30 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-xl">
                      <Ticket size={20} className="text-indigo-400" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Tonight</div>
                      <h3 className="text-xl font-black text-white uppercase tracking-tight">Draft Lottery</h3>
                    </div>
                  </div>
                  {onNavigateToDraftLottery && (
                    <button
                      onClick={onNavigateToDraftLottery}
                      className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-black text-[10px] uppercase tracking-widest transition-all"
                    >
                      View Lottery
                    </button>
                  )}
                </div>
                <p className="text-slate-400 text-xs mb-5">
                  The {year} NBA Draft Lottery determines the pick order for the {year} Draft. The 14 non-playoff teams compete for the top picks.
                </p>
                {lotteryTeams.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Lottery Teams</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {lotteryTeams.map((team, idx) => {
                        // NBA lottery odds: top 4 teams share highest odds, simplified display
                        const oddsTable = [14.0, 14.0, 14.0, 12.5, 10.5, 9.0, 7.5, 6.0, 4.5, 3.0, 2.0, 1.5, 1.0, 0.5];
                        const odds = oddsTable[idx] ?? 0.5;
                        return (
                          <div key={team.id} className="flex items-center gap-2 bg-white/5 rounded-lg p-2">
                            <span className="text-[10px] font-black text-slate-600 w-4 text-right">{idx + 1}</span>
                            {(team as any).logoUrl && (
                              <img src={(team as any).logoUrl} className="w-5 h-5 object-contain shrink-0" alt={team.abbrev} referrerPolicy="no-referrer" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-black text-white truncate">{team.abbrev}</div>
                              <div className="text-[9px] text-slate-500">{team.wins}-{team.losses}</div>
                            </div>
                            <div className="text-[9px] font-mono text-indigo-400 shrink-0">{odds}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* NBA Draft Event Card */}
            {isNBADraftDay && (
              <div className="col-span-full bg-gradient-to-br from-amber-950/80 to-orange-950/80 border border-amber-500/30 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/20 rounded-xl">
                      <Star size={20} className="text-amber-400" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Tonight</div>
                      <h3 className="text-xl font-black text-white uppercase tracking-tight">{year} NBA Draft</h3>
                    </div>
                  </div>
                  {onNavigateToDraftBoard && (
                    <button
                      onClick={onNavigateToDraftBoard}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[10px] uppercase tracking-widest transition-all"
                    >
                      Watch Draft
                    </button>
                  )}
                </div>
                <p className="text-slate-400 text-xs mb-5">
                  The {year} NBA Draft. 30 teams, 60 picks, 2 rounds. Teams select the next generation of NBA talent.
                </p>
                {topProspects.length > 0 && (
                  <div>
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Top Prospects</div>
                    <div className="space-y-2">
                      {topProspects.map((prospect, idx) => (
                        <div key={prospect.internalId ?? prospect.name} className="flex items-center gap-3 bg-white/5 rounded-lg p-2">
                          <span className="text-[10px] font-black text-slate-600 w-4 text-right">#{idx + 1}</span>
                          {prospect.imgURL && (
                            <img src={prospect.imgURL} className="w-7 h-7 rounded-full object-cover border border-slate-700 shrink-0" alt={prospect.name} referrerPolicy="no-referrer" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-black text-white truncate">{prospect.name}</div>
                            <div className="text-[9px] text-slate-500">
                              {prospect.ratings?.[prospect.ratings.length - 1]?.pos ?? ''}{prospect.age ? ` · Age ${prospect.age}` : ''}
                            </div>
                          </div>
                          <div className="text-xs font-mono text-amber-400 font-black shrink-0">{prospect.overallRating ?? '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Season Preview Card */}
            {showSeasonPreviewCard && (
              <div className="col-span-full bg-gradient-to-br from-amber-950/60 via-[#0f0a00] to-[#111] border border-amber-500/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest">New Season</div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">{year} Season Preview</h3>
                    <p className="text-slate-500 text-xs mt-1">Power rankings, offseason recap & retirement announcements</p>
                  </div>
                  {onNavigateToSeasonPreview && (
                    <button
                      onClick={onNavigateToSeasonPreview}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-amber-500/20"
                    >
                      Open Preview
                    </button>
                  )}
                </div>
                {/* Retirement teasers */}
                {state?.retirementAnnouncements && state.retirementAnnouncements.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-amber-500/10">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Notable Retirements</div>
                    <div className="flex flex-wrap gap-2">
                      {state.retirementAnnouncements.slice(0, 5).map((r: any) => (
                        <div key={r.pid ?? r.name} className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2 py-1">
                          {r.imgURL && (
                            <img src={r.imgURL} className="w-5 h-5 rounded-full object-cover border border-slate-700" alt={r.name} referrerPolicy="no-referrer" />
                          )}
                          <span className="text-[10px] font-bold text-white">{r.name}</span>
                          <span className="text-[9px] text-slate-500">Age {r.age}</span>
                        </div>
                      ))}
                      {state.retirementAnnouncements.length > 5 && (
                        <div className="flex items-center px-2 py-1">
                          <span className="text-[10px] text-slate-600">+{state.retirementAnnouncements.length - 5} more</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {gamesForSelectedDate.length === 0 && !isDraftLotteryDay && !isNBADraftDay ? (
              <div className="col-span-full text-center py-20 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                <div className="text-4xl mb-4">🌙</div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">No Games Scheduled</h3>
                <p className="text-slate-500 text-xs">There are no NBA games on this date.</p>
              </div>
            ) : gamesForSelectedDate.length > 0 ? (
              gamesForSelectedDate.map(game => {
                if ((game as any).isDunkContest || (game as any).isThreePointContest) {
                  return null;
                }

                // For playoff games: only show the next unplayed game in the series.
                // All 7 games are pre-scheduled at round start, so hide any game beyond "played + 1".
                if (game.isPlayoff && game.playoffSeriesId) {
                  const ser = state.playoffs?.series.find((s: any) => s.id === game.playoffSeriesId);
                  if (ser) {
                    // Hide if series is complete and game isn't played
                    if (ser.status === 'complete' && !game.played) return null;
                    // Hide if this game is more than 1 ahead of the games already played
                    const playedInSeries = (ser.higherSeedWins ?? 0) + (ser.lowerSeedWins ?? 0);
                    const gameNum = (game as any).playoffGameNumber ?? 1;
                    if (!game.played && gameNum > playedInSeries + 1) return null;
                  }
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

                const isIntlPreseason = (game as any).isPreseason && (game.homeTid >= 100 || game.awayTid >= 100);

                // Resolve teams — NBA teams from state.teams, non-NBA clubs from nonNBATeams
                const resolveTeam = (tid: number) => {
                  if (tid >= 100) {
                    const nonNba = nonNBATeams.find(t => t.tid === tid);
                    if (nonNba) return { id: tid, name: nonNba.name, abbrev: nonNba.abbrev, logoUrl: nonNba.imgURL, conference: nonNba.league };
                    return null;
                  }
                  return getTeamForGame(tid, state.teams);
                };

                const homeTeam = resolveTeam(game.homeTid);
                const awayTeam = resolveTeam(game.awayTid);
                if (!homeTeam || !awayTeam) return null;

                const isIntraSquad = game.homeTid === game.awayTid;
                const awayLabel = isIntraSquad ? `${awayTeam.abbrev} B` : awayTeam.abbrev;
                const awayName  = isIntraSquad ? `${awayTeam.name} B` : awayTeam.name;
                const homeLabel = isIntraSquad ? `${homeTeam.abbrev} A` : homeTeam.abbrev;
                const homeName  = isIntraSquad ? `${homeTeam.name} A` : homeTeam.name;

                const series = (game.isPlayoff && game.playoffSeriesId)
                  ? state.playoffs?.series.find((s: any) => s.id === game.playoffSeriesId)
                  : null;
                const pigame = (game.isPlayIn && game.playoffSeriesId)
                  ? state.playoffs?.playInGames.find((p: any) => p.id === game.playoffSeriesId)
                  : null;

                const isUserGame = ownTid !== null && (game.homeTid === ownTid || game.awayTid === ownTid);
                const userIsHome = isUserGame && game.homeTid === ownTid;
                const userIsAway = isUserGame && game.awayTid === ownTid;

                return (
                  <div key={game.gid} className={`border rounded-2xl p-4 transition-all ${
                    isUserGame
                      ? 'bg-indigo-950/40 border-indigo-500/50 ring-1 ring-indigo-500/30 shadow-lg shadow-indigo-500/10'
                      : `bg-[#111] hover:border-white/10 ${game.isPlayoff || game.isPlayIn ? 'border-indigo-500/20' : (game as any).isNBACup ? 'border-amber-500/30' : isIntlPreseason ? 'border-emerald-500/20' : 'border-white/5'}`
                  }`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {isIntraSquad ? 'Scrimmage'
                            : (game as any).isNBACup ? (
                                (game as any).nbaCupRound === 'Final' ? `Cup Final · Las Vegas${game.played ? ' · Final' : ''}`
                                : (game as any).nbaCupRound === 'SF'  ? `Cup Semifinal · Las Vegas${game.played ? ' · Final' : ''}`
                                : (game as any).nbaCupRound === 'QF'  ? `Cup Quarterfinal${game.played ? ' · Final' : ''}`
                                :                                       `Cup Night · Group ${(game as any).nbaCupGroupId ?? ''}${game.played ? ' · Final' : ''}`
                              )
                            : isIntlPreseason ? (game.played ? 'Intl Preseason · Final' : `Intl Preseason${(game as any).city ? ` · ${(game as any).city}` : ''}`)
                            : game.played ? (() => {
                                const bs = boxScores?.find(b => b.gameId === game.gid);
                                if (!bs?.isOT) return 'Final';
                                return bs.otCount && bs.otCount > 1 ? `Final ${bs.otCount}OT` : 'Final OT';
                              })()
                            : 'Scheduled'}
                        </div>
                        {isUserGame && (
                          <span className="text-[8px] font-black uppercase tracking-widest bg-indigo-500/25 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40">
                            {userIsHome ? 'Home Game' : 'Road Game'}
                          </span>
                        )}
                        {isIntlPreseason && (
                          <Globe size={14} className="text-emerald-500" />
                        )}
                        {(game.isPlayoff || game.isPlayIn) && (
                          <img
                            src="https://content.sportslogos.net/logos/6/981/full/_nba_playoffs_logo_primary_2022_sportslogosnet-4785.png"
                            className="w-6 h-6 object-contain"
                            alt="Playoffs"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        {(game as any).isNBACup && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30">
                            <Trophy size={10} className="text-amber-400" />
                            <span className="text-[8px] font-black uppercase tracking-widest text-amber-300">NBA Cup</span>
                          </span>
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
                        {(awayTeam as any).logoUrl ? (
                          <img src={(awayTeam as any).logoUrl} className="w-12 h-12 object-contain" alt={awayName} referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-emerald-900/30 border border-emerald-500/30 flex items-center justify-center">
                            <Globe size={20} className="text-emerald-400" />
                          </div>
                        )}
                        <div className="text-center">
                          <div className={`text-sm font-black ${userIsAway ? 'text-indigo-300' : 'text-white'}`}>{awayLabel}</div>
                          <div className={`text-[10px] font-bold ${userIsAway ? 'text-indigo-400/80' : 'text-slate-500'}`}>{awayName}</div>
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
                        {(homeTeam as any).logoUrl ? (
                          <img src={(homeTeam as any).logoUrl} className="w-12 h-12 object-contain" alt={homeName} referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-emerald-900/30 border border-emerald-500/30 flex items-center justify-center">
                            <Globe size={20} className="text-emerald-400" />
                          </div>
                        )}
                        <div className="text-center">
                          <div className={`text-sm font-black ${userIsHome ? 'text-indigo-300' : 'text-white'}`}>{homeLabel}</div>
                          <div className={`text-[10px] font-bold ${userIsHome ? 'text-indigo-400/80' : 'text-slate-500'}`}>{homeName}</div>
                        </div>
                        {game.played && (
                          <div className={`text-2xl font-black ${game.homeScore > game.awayScore ? 'text-white' : 'text-slate-700'}`}>
                            {game.homeScore}
                          </div>
                        )}
                      </div>
                    </div>

                    {game.played && (() => {
                      const best = getWinnerBestPerformer(game);
                      if (!best) return null;
                      return (
                        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
                          {best.imgURL && (
                            <img
                              src={best.imgURL}
                              alt={best.name}
                              className="w-5 h-5 rounded-full object-cover border border-slate-700 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <span className="text-[10px] font-bold text-slate-400 truncate">
                            ⭐ {best.name}
                          </span>
                          <span className="text-[10px] font-mono text-indigo-400 ml-auto shrink-0">
                            {best.statLine}
                          </span>
                        </div>
                      );
                    })()}

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
            ) : null}
          </div>
        )}

        <div className="h-8 bg-gradient-to-b from-transparent to-black/10 mt-4"></div>
      </div>
      </div>
    </div>
  );
};
