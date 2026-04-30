import React from 'react';
import { Trophy, Play, Star } from 'lucide-react';
import { Game } from '../../../../types';
import { normalizeDate } from '../../../../utils/helpers';

const EAST_LOGO_URL = 'https://static.wikia.nocookie.net/logopedia/images/8/89/Eastern_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191748';
const WEST_LOGO_URL = 'https://static.wikia.nocookie.net/logopedia/images/0/06/Western_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191726';

interface AllStarDayViewProps {
  selectedDateObj: Date;
  isRisingStarsDay: boolean;
  isSaturdayEventsDay: boolean;
  isAllStarGameDay: boolean;
  isCelebrityGameDay: boolean;
  allStar: any;
  onNavigateToAllStar: () => void;
  onViewRosters: (tab: string) => void;
  onWatchGame: (game: Game) => void;
  onWatchDunkContest: () => void;
  onWatchThreePoint: () => void;
  onViewContestDetails: (type: 'dunk' | 'three') => void;
  onViewBoxScore: (game: Game) => void;
  state: any;
}

export const AllStarDayView: React.FC<AllStarDayViewProps> = ({
  selectedDateObj,
  isRisingStarsDay,
  isSaturdayEventsDay,
  isAllStarGameDay,
  isCelebrityGameDay,
  allStar,
  onNavigateToAllStar,
  onViewRosters,
  onWatchGame,
  onWatchDunkContest,
  onWatchThreePoint,
  onViewContestDetails,
  onViewBoxScore,
  state
}) => {
  const allStarGames = state.schedule.filter((g: Game) => g.isAllStar);
  const allStarGame = allStarGames[0];
  const bracket = allStar?.bracket;
  const risingStarsBracket = allStar?.risingStarsBracket;
  const rsIsTournament = !!risingStarsBracket;
  const risingStarsGames: Game[] = rsIsTournament
    ? state.schedule.filter((g: Game) => (g as any).isRisingStars)
    : [];
  const risingStarsGame = rsIsTournament ? null : state.schedule.find((g: Game) => g.isRisingStars);
  const celebrityGame = state.schedule.find((g: Game) => (g as any).isCelebrityGame);

  const stateDateNorm = normalizeDate(state.date);
  const y = selectedDateObj.getUTCFullYear();
  const m = String(selectedDateObj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(selectedDateObj.getUTCDate()).padStart(2, '0');
  const selectedDateNorm = `${y}-${m}-${d}`;
  const isActuallyToday = selectedDateNorm === stateDateNorm;

  // Box scores — only match by current season's game IDs (no hardcoded team ID fallbacks,
  // which would match stale box scores from previous seasons after allStar state is cleared)
  const risingStarsBoxScore = allStar?.risingStarsGameId
    ? state.boxScores?.find((b: any) => b.gameId === allStar.risingStarsGameId)
    : null;
  const allStarBoxScore = allStar?.allStarGameId
    ? state.boxScores?.find((b: any) => b.gameId === allStar.allStarGameId)
    : null;
  const celebrityBoxScore = allStar?.celebrityGameId
    ? state.boxScores?.find((b: any) => b.gameId === allStar.celebrityGameId)
    : null;
  const celebrityGameResult = allStar?.celebrityGameResult || (celebrityBoxScore ? {
    homeScore: celebrityBoxScore.homeScore,
    awayScore: celebrityBoxScore.awayScore,
    homeTeamName: celebrityBoxScore.homeTeamName,
    awayTeamName: celebrityBoxScore.awayTeamName,
  } : null);

  const risingStarsTeams = allStar?.risingStarsTeams ?? ['Team USA', 'Team World'];

  return (
    <div className="flex-1 flex flex-col p-0 md:p-0">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-1">All-Star Weekend</h2>
          <p className="text-amber-400 font-bold tracking-widest uppercase text-xs">
            {selectedDateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* ── RISING STARS (Friday) ── */}
        {isRisingStarsDay && rsIsTournament && risingStarsBracket && (() => {
          const mvp = allStar?.risingStarsMvp;
          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black text-sky-400 uppercase tracking-[0.2em]">Rising Stars Challenge · Tournament</div>
                <button
                  onClick={() => onViewRosters('rising-stars')}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all"
                >
                  View Rosters
                </button>
              </div>
              {risingStarsBracket.games.map((g: any) => {
                const bs = state.boxScores?.find((b: any) => b.gameId === g.gid);
                const homeT = risingStarsBracket.teams?.find((t: any) => t.tid === g.homeTid);
                const awayT = risingStarsBracket.teams?.find((t: any) => t.tid === g.awayTid);
                const isFinal = g.round === 'final';
                const schedGame = risingStarsGames.find((sg: any) => sg.gid === g.gid);
                return (
                  <div key={g.gid} className={`bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border ${isFinal ? 'border-sky-400/40' : 'border-blue-500/20'} rounded-2xl p-5`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${isFinal ? 'text-sky-300' : 'text-blue-400'}`}>
                        {isFinal ? 'Final' : 'Semifinal'} · First to {g.targetScore}
                      </span>
                      {isFinal && mvp && g.played && (
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-wide">
                          MVP: {mvp.name} {mvp.pts}pts
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex-1 text-center">
                        <div className={`text-3xl font-black mb-0.5 ${bs ? (bs.homeScore >= bs.awayScore ? 'text-white' : 'text-slate-600') : 'text-slate-300'}`}>
                          {bs ? bs.homeScore : '—'}
                        </div>
                        <div className="text-[9px] text-sky-400 font-black uppercase tracking-widest leading-tight">
                          {homeT?.name ?? 'TBD'}
                        </div>
                        {homeT?.coachName && <div className="text-[8px] text-slate-500 mt-0.5">Coach {homeT.coachName.split(' ').pop()}</div>}
                      </div>
                      <div className="text-lg font-black text-slate-700 italic">VS</div>
                      <div className="flex-1 text-center">
                        <div className={`text-3xl font-black mb-0.5 ${bs ? (bs.awayScore > bs.homeScore ? 'text-white' : 'text-slate-600') : 'text-slate-300'}`}>
                          {bs ? bs.awayScore : '—'}
                        </div>
                        <div className="text-[9px] text-emerald-400 font-black uppercase tracking-widest leading-tight">
                          {awayT?.name ?? 'TBD'}
                        </div>
                        {awayT?.coachName && <div className="text-[8px] text-slate-500 mt-0.5">Coach {awayT.coachName.split(' ').pop()}</div>}
                      </div>
                    </div>
                    {(bs || (isActuallyToday && schedGame && !schedGame.played)) && (
                      <div className="flex gap-2 justify-center mt-3">
                        {bs ? (
                          <button onClick={() => schedGame && onViewBoxScore(schedGame)} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold text-[10px] transition-all flex items-center gap-1">
                            <Trophy size={10} /> Box Score
                          </button>
                        ) : (
                          <button onClick={() => onWatchGame(schedGame!)} className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-black rounded-lg font-bold text-[10px] transition-all flex items-center gap-1">
                            <Play size={10} fill="currentColor" /> Watch
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {isRisingStarsDay && !rsIsTournament && (
          risingStarsBoxScore ? (
            // POST-GAME: score card with box score button
            <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border border-blue-500/20 rounded-2xl p-6">
              <div className="text-[10px] font-black text-sky-400 uppercase tracking-[0.2em] mb-4">Rising Stars Challenge · Final</div>
              <div className="flex items-center justify-between gap-8 mb-6">
                <div className="flex-1 text-center">
                  <div className={`text-4xl font-black mb-1 ${risingStarsBoxScore.homeScore > risingStarsBoxScore.awayScore ? 'text-white' : 'text-slate-600'}`}>
                    {risingStarsBoxScore.homeScore}
                  </div>
                  <div className="text-[10px] text-sky-400 font-black uppercase tracking-widest">
                    {risingStarsTeams[0] || risingStarsBoxScore.homeTeamName}
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-800 italic">VS</div>
                <div className="flex-1 text-center">
                  <div className={`text-4xl font-black mb-1 ${risingStarsBoxScore.awayScore > risingStarsBoxScore.homeScore ? 'text-white' : 'text-slate-600'}`}>
                    {risingStarsBoxScore.awayScore}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">
                    {risingStarsTeams[1] || risingStarsBoxScore.awayTeamName}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => onViewRosters('rising-stars')}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all"
                >
                  View Rosters
                </button>
                {risingStarsGame && (
                  <button
                    onClick={() => onViewBoxScore(risingStarsGame)}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold text-xs transition-all flex items-center gap-1.5"
                  >
                    <Trophy size={12} />
                    Box Score
                  </button>
                )}
              </div>
            </div>
          ) : (
            // PRE-GAME: info + watch button
            <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border border-blue-500/20 rounded-2xl p-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-2xl">🌟</div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Rising Stars Challenge</h3>
                    <p className="text-blue-400 text-xs font-bold uppercase tracking-widest">Friday Night</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => onViewRosters('rising-stars')}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all"
                  >
                    View Rosters
                  </button>
                  {isActuallyToday && risingStarsGame && !risingStarsGame.played && (
                    <button
                      onClick={() => onWatchGame(risingStarsGame)}
                      className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-black rounded-lg font-bold text-xs transition-all flex items-center gap-1.5"
                    >
                      <Play size={12} fill="currentColor" />
                      Watch Live
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {/* ── CELEBRITY GAME (Friday) ── */}
        {isCelebrityGameDay && (
          celebrityGameResult ? (
            <div className="bg-gradient-to-br from-fuchsia-900/40 to-purple-900/40 border border-fuchsia-500/20 rounded-2xl p-6">
              <div className="text-[10px] font-black text-fuchsia-400 uppercase tracking-[0.2em] mb-4">Celebrity Game · Final</div>
              <div className="flex items-center justify-between gap-8 mb-6">
                <div className="flex-1 text-center">
                  <div className={`text-4xl font-black mb-1 ${celebrityGameResult.homeScore > celebrityGameResult.awayScore ? 'text-white' : 'text-slate-600'}`}>
                    {celebrityGameResult.homeScore}
                  </div>
                  <div className="text-[10px] text-fuchsia-400 font-black uppercase tracking-widest">
                    {celebrityGameResult.homeTeamName || 'Team A'}
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-800 italic">VS</div>
                <div className="flex-1 text-center">
                  <div className={`text-4xl font-black mb-1 ${celebrityGameResult.awayScore > celebrityGameResult.homeScore ? 'text-white' : 'text-slate-600'}`}>
                    {celebrityGameResult.awayScore}
                  </div>
                  <div className="text-[10px] text-pink-400 font-black uppercase tracking-widest">
                    {celebrityGameResult.awayTeamName || 'Team B'}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => onViewRosters('celebrity')}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all"
                >
                  View Rosters
                </button>
                {celebrityGame && (
                  <button
                    onClick={() => onViewBoxScore(celebrityGame)}
                    className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg font-bold text-xs transition-all flex items-center gap-1.5"
                  >
                    <Trophy size={12} />
                    Box Score
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-fuchsia-900/40 to-purple-900/40 border border-fuchsia-500/20 rounded-2xl p-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-fuchsia-500/20 flex items-center justify-center text-2xl">🎭</div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Celebrity Game</h3>
                    <p className="text-fuchsia-400 text-xs font-bold uppercase tracking-widest">Friday Night</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => onViewRosters('celebrity')}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all"
                  >
                    View Rosters
                  </button>
                  {isActuallyToday && celebrityGame && !celebrityGame.played && (
                    <button
                      onClick={() => onWatchGame(celebrityGame)}
                      className="px-4 py-2 bg-fuchsia-500 hover:bg-fuchsia-400 text-black rounded-lg font-bold text-xs transition-all flex items-center gap-1.5"
                    >
                      <Play size={12} fill="currentColor" />
                      Watch Live
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {/* ── SATURDAY CONTESTS ── */}
        {isSaturdayEventsDay && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Dunk Contest */}
            {allStar?.dunkContest?.complete ? (
              <div className="bg-gradient-to-br from-orange-900/40 to-amber-900/40 border border-orange-500/30 rounded-2xl p-6">
                <div className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em] mb-3">Slam Dunk Champion · Final</div>
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-2xl">🏆</div>
                  <div className="text-2xl font-black text-white uppercase tracking-tight leading-tight">
                    {allStar.dunkContest.winnerName}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => onViewContestDetails('dunk')}
                    className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-black rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Trophy size={12} />
                    View Results
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-orange-900/40 to-amber-900/40 border border-orange-500/20 rounded-2xl p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-2xl">🏀</div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Slam Dunk Contest</h3>
                    <p className="text-orange-400 text-xs font-bold uppercase tracking-widest">Saturday Night</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => onViewContestDetails('dunk')}
                    className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all"
                  >
                    Details
                  </button>
                  {isActuallyToday && (
                    <button
                      onClick={onWatchDunkContest}
                      className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-black rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                    >
                      <Play size={12} fill="currentColor" />
                      Watch Live
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 3-Point Contest */}
            {allStar?.threePointContest?.complete ? (
              <div className="bg-gradient-to-br from-indigo-900/40 to-violet-900/40 border border-indigo-500/30 rounded-2xl p-6">
                <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-3">3-Point Champion · Final</div>
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-2xl">🎯</div>
                  <div className="text-2xl font-black text-white uppercase tracking-tight leading-tight">
                    {allStar.threePointContest.winnerName}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => onViewContestDetails('three')}
                    className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-black rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Trophy size={12} />
                    View Results
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-indigo-900/40 to-violet-900/40 border border-indigo-500/20 rounded-2xl p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-2xl">🎯</div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">3-Point Contest</h3>
                    <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest">Saturday Night</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => onViewContestDetails('three')}
                    className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all"
                  >
                    Details
                  </button>
                  {isActuallyToday && (
                    <button
                      onClick={onWatchThreePoint}
                      className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-black rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                    >
                      <Play size={12} fill="currentColor" />
                      Watch Live
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ALL-STAR BRACKET GAMES (Sunday) ── multi-card iterator for round-robin / knockout */}
        {isAllStarGameDay && allStarGames.length > 1 && allStarGames.map((g: any) => {
          const bs = state.boxScores?.find((b: any) => b.gameId === g.gid);
          const homeT = bracket?.teams?.find((t: any) => t.tid === g.homeTid);
          const awayT = bracket?.teams?.find((t: any) => t.tid === g.awayTid);
          const homeName = homeT?.name ?? (g.homeTid === -1 ? 'East' : 'TBD');
          const awayName = awayT?.name ?? (g.awayTid === -2 ? 'West' : 'TBD');
          const isFinal = !!g.isAllStarChampionship;
          return (
            <div key={g.gid} className={`bg-gradient-to-br from-slate-900 to-black border ${isFinal ? 'border-amber-500/30' : 'border-slate-500/20'} rounded-2xl p-6`}>
              <div className={`text-[10px] font-black ${isFinal ? 'text-amber-400' : 'text-slate-400'} uppercase tracking-[0.2em] mb-3`}>
                {isFinal ? 'All-Star Championship' : 'All-Star Round Robin'} {bs ? '· Final' : ''}
              </div>
              <div className="flex items-center justify-between gap-8">
                <div className="flex-1 text-center">
                  {homeT?.logoUrl && (
                    <img src={homeT.logoUrl} className="w-10 h-10 mx-auto mb-2 object-contain" alt={homeName} referrerPolicy="no-referrer" />
                  )}
                  <div className={`text-3xl font-black mb-1 ${bs ? (bs.homeScore > bs.awayScore ? 'text-white' : 'text-slate-600') : 'text-slate-300'}`}>
                    {bs ? bs.homeScore : '—'}
                  </div>
                  <div className="text-[10px] text-slate-300 font-black uppercase tracking-widest">{homeName}</div>
                  {homeT && <div className="text-[9px] text-slate-500 mt-0.5">{homeT.wins}-{homeT.losses}</div>}
                </div>
                <div className="text-xl font-black text-slate-800 italic">VS</div>
                <div className="flex-1 text-center">
                  {awayT?.logoUrl && (
                    <img src={awayT.logoUrl} className="w-10 h-10 mx-auto mb-2 object-contain" alt={awayName} referrerPolicy="no-referrer" />
                  )}
                  <div className={`text-3xl font-black mb-1 ${bs ? (bs.awayScore > bs.homeScore ? 'text-white' : 'text-slate-600') : 'text-slate-300'}`}>
                    {bs ? bs.awayScore : '—'}
                  </div>
                  <div className="text-[10px] text-slate-300 font-black uppercase tracking-widest">{awayName}</div>
                  {awayT && <div className="text-[9px] text-slate-500 mt-0.5">{awayT.wins}-{awayT.losses}</div>}
                </div>
              </div>
              <div className="flex gap-3 justify-center mt-4">
                {bs ? (
                  <button onClick={() => onViewBoxScore(g)} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs transition-all flex items-center gap-1.5">
                    <Trophy size={12} />Box Score
                  </button>
                ) : isActuallyToday && !g.played ? (
                  <button onClick={() => onWatchGame(g)} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-bold text-xs transition-all flex items-center gap-1.5">
                    <Play size={12} fill="currentColor" />Watch
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {/* ── ALL-STAR GAME (Sunday) — classic single-game card path ── */}
        {isAllStarGameDay && allStarGames.length <= 1 && (
          allStarBoxScore ? (
            // POST-GAME: final score with box score
            <div className="bg-gradient-to-br from-slate-900 to-black border border-white/10 rounded-2xl p-8">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em] mb-4">NBA All-Star Game · Final</div>
                <div className="flex items-center justify-center gap-12 mb-6">
                  <div className="text-center">
                    <img src={EAST_LOGO_URL} className="w-12 h-12 mx-auto mb-3 object-contain" alt="East" referrerPolicy="no-referrer" />
                    <div className={`text-5xl font-black mb-1 ${allStarBoxScore.homeScore > allStarBoxScore.awayScore ? 'text-white' : 'text-slate-600'}`}>
                      {allStarBoxScore.homeScore}
                    </div>
                    <div className="text-[10px] text-blue-400 font-black uppercase tracking-widest">East</div>
                  </div>
                  <div className="text-3xl font-black text-slate-800 italic">VS</div>
                  <div className="text-center">
                    <img src={WEST_LOGO_URL} className="w-12 h-12 mx-auto mb-3 object-contain" alt="West" referrerPolicy="no-referrer" />
                    <div className={`text-5xl font-black mb-1 ${allStarBoxScore.awayScore > allStarBoxScore.homeScore ? 'text-white' : 'text-slate-600'}`}>
                      {allStarBoxScore.awayScore}
                    </div>
                    <div className="text-[10px] text-red-400 font-black uppercase tracking-widest">West</div>
                  </div>
                </div>
                {/* MVP */}
                {(() => {
                  const mvp = [...(allStarBoxScore.homeStats || []), ...(allStarBoxScore.awayStats || [])]
                    .sort((a: any, b: any) => (b.pts || 0) - (a.pts || 0))[0];
                  if (!mvp) return null;
                  return (
                    <div className="flex flex-col items-center mb-4">
                      <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">All-Star Game MVP</div>
                      <div className="px-6 py-2 bg-amber-500 text-black rounded-full text-sm font-black uppercase tracking-tight shadow-xl shadow-amber-500/20">
                        {mvp.name} · {mvp.pts} PTS
                      </div>
                    </div>
                  );
                })()}
                <div className="flex gap-3">
                  <button
                    onClick={() => onViewRosters('all-star')}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all"
                  >
                    View Rosters
                  </button>
                  {allStarGame && (
                    <button
                      onClick={() => onViewBoxScore(allStarGame)}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs transition-all flex items-center gap-1.5"
                    >
                      <Trophy size={12} />
                      Box Score
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // PRE-GAME: info + watch button
            <div className="bg-gradient-to-br from-slate-900 to-black border border-white/10 rounded-2xl p-8">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center text-4xl mb-4">⭐</div>
                <h3 className="text-3xl font-black text-white uppercase tracking-tight">75th NBA All-Star Game</h3>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">East vs West · Sunday Night</p>
              </div>

              <div className="flex items-center justify-center gap-4 mb-8">
                <button
                  onClick={() => onViewRosters('all-star')}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition-all"
                >
                  View Rosters
                </button>
                {isActuallyToday && allStarGame && !allStarGame.played && (
                  <button
                    onClick={() => onWatchGame(allStarGame)}
                    className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl font-bold text-sm transition-all flex items-center gap-2"
                  >
                    <Star size={16} fill="currentColor" />
                    Watch Game
                  </button>
                )}
              </div>

              <div className="flex items-center justify-center gap-12 opacity-50">
                <img src={EAST_LOGO_URL} className="w-16 h-16 grayscale" alt="East" referrerPolicy="no-referrer" />
                <div className="text-xl font-black text-slate-800 italic">VS</div>
                <img src={WEST_LOGO_URL} className="w-16 h-16 grayscale" alt="West" referrerPolicy="no-referrer" />
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
