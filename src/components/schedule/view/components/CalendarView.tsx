import React from 'react';
import { ChevronLeft, ChevronRight, Star, Trophy, Award } from 'lucide-react';
import { Game, NBATeam } from '../../../../types';
import { normalizeDate, getOwnTeamId } from '../../../../utils/helpers';
import { getAllStarWeekendDates } from '../../../../services/allStar/AllStarWeekendOrchestrator';

interface CalendarViewProps {
  calendarMonth: Date;
  setCalendarMonth: (date: Date) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  setViewMode: (mode: 'calendar' | 'day' | 'watching') => void;
  state: any;
  formatDateDisplay: (dateStr: string) => string;
  getDotColor: (g: Game) => string;
  getHighlightedEvent: (date: Date) => { label: string; color: string; icon: string } | null;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  calendarMonth,
  setCalendarMonth,
  selectedDate,
  setSelectedDate,
  setViewMode,
  state,
  formatDateDisplay,
  getDotColor,
  getHighlightedEvent
}) => {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = calendarMonth.toLocaleString('default', { month: 'long' });

  // ── Navigable month bounds ────────────────────────────────────────────────
  // Earliest: the first game ever in the schedule (or Aug of the first season year).
  // Latest: the furthest of (last scheduled game, end of current season's offseason).
  //   We always allow browsing through June of leagueStats.year regardless of whether
  //   new-season games have been generated yet (schedule gen fires on Aug 14, but
  //   the offseason months Jul–Sep should still be browsable after rollover).
  const seasonYear: number = state.leagueStats?.year ?? new Date().getFullYear();

  // Scan schedule once for min/max using reduce (avoids spread stack overflow on large arrays)
  let minMs = Infinity, maxMs = -Infinity;
  for (const g of (state.schedule ?? [])) {
    if (!g.date) continue;
    const ms = new Date(g.date).getTime();
    if (!isNaN(ms)) { if (ms < minMs) minMs = ms; if (ms > maxMs) maxMs = ms; }
  }
  const minScheduleDate = isFinite(minMs) ? new Date(minMs) : new Date(Date.UTC(seasonYear - 1, 7, 1));

  // Upper bound: max of (last game date, end of current season's offseason = Sep of seasonYear)
  const offseasonEndMs = Date.UTC(seasonYear, 8, 30); // Sep 30 of the season year (offseason ceiling)
  const maxMs2 = isFinite(maxMs) ? Math.max(maxMs, offseasonEndMs) : offseasonEndMs;
  const maxScheduleDate = new Date(maxMs2);

  const isEarliestMonth = year < minScheduleDate.getUTCFullYear() ||
    (year === minScheduleDate.getUTCFullYear() && month <= minScheduleDate.getUTCMonth());
  const isLatestMonth = year > maxScheduleDate.getUTCFullYear() ||
    (year === maxScheduleDate.getUTCFullYear() && month >= maxScheduleDate.getUTCMonth());

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 bg-[#0a0a0a]">
      <div className="w-full">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">Season Schedule</h1>
            <p className="text-slate-500 font-medium mt-1 text-[10px] md:text-sm">Current Date: {formatDateDisplay(state.date)}</p>
          </div>
          <div className="flex items-center gap-2 bg-[#111] p-1 rounded-xl border border-white/5">
            <button 
              onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
              disabled={isEarliestMonth}
              className={`p-2 rounded-lg transition-colors ${isEarliestMonth ? 'text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-sm md:text-lg font-black text-white uppercase tracking-tight min-w-[120px] text-center">
              {monthName} {year}
            </div>
            <button 
              onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
              disabled={isLatestMonth}
              className={`p-2 rounded-lg transition-colors ${isLatestMonth ? 'text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">{day}</div>
          ))}
          
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square bg-white/[0.02] rounded-lg border border-white/[0.02]" />
          ))}
          
          {(() => {
            const gmTid = getOwnTeamId(state);
            const teamsById = new Map<number, NBATeam>();
            for (const t of (state.teams ?? [])) teamsById.set(t.id, t);

            // Precompute All-Star weekend dates (Rising Stars Fri, Sat events, All-Star Sun)
            // for the two season years that can appear in any given calendar month.
            // This lets the calendar light up the tiles *before* the All-Star games are
            // actually injected into the schedule (injection happens when the sim reaches breakStart).
            const allStarDateSet = new Set<string>();
            const addWeekend = (y: number) => {
              try {
                const d = getAllStarWeekendDates(y);
                [d.risingStars, d.saturday, d.allStarGame].forEach(dt => {
                  allStarDateSet.add(normalizeDate(dt.toISOString()));
                });
              } catch { /* ignore bad years */ }
            };
            // NBA season `y` plays All-Star weekend in Feb of calendar year `y`, so we
            // just need the weekend dates for the calendar years we render.
            addWeekend(year);
            addWeekend(year + 1);

            return Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`;
              const dateNorm = normalizeDate(dateStr);
              const stateDateNorm = normalizeDate(state.date);
              const isToday = dateNorm === stateDateNorm;
              const isSelected = dateNorm === normalizeDate(selectedDate);

              const games = state.schedule.filter(g => normalizeDate(g.date) === dateNorm);
              const dateObj = new Date(dateStr);
              const highlighted = getHighlightedEvent(dateObj);

              // All-Star weekend = any All-Star Game, Rising Stars, Celebrity Game,
              // Dunk Contest, or 3-Pt Contest on this date.
              const isAllStarGame = (g: Game) =>
                g.isAllStar || g.isRisingStars || g.isCelebrityGame || g.isDunkContest || g.isThreePointContest;
              // Detect by game flag (injected) OR by the deterministic date set
              // (covers future Februarys before the schedule injects All-Star games).
              const isAllStarWeekend = games.some(isAllStarGame) || allStarDateSet.has(dateNorm);
              const hasPlayoff = games.some(g => g.isPlayoff);
              const hasPlayIn  = games.some(g => g.isPlayIn);

              // Fixed calendar windows (align with simulationHandler + keyDates):
              //   Play-In Tournament:  Apr 15 – Apr 18
              //   Playoffs (all rounds, incl. Finals): Apr 19 – Jun 22
              // Tiles inside these windows get the playoff/play-in tint even before
              // the bracket-specific games are injected into the schedule.
              const calMonth1 = month + 1;
              const inPlayInWindow   = (calMonth1 === 4 && day >= 15 && day <= 18);
              const inPlayoffWindow  = (calMonth1 === 4 && day >= 19) || calMonth1 === 5 || (calMonth1 === 6 && day <= 22);
              const showPlayIn  = hasPlayIn  || inPlayInWindow;
              const showPlayoff = hasPlayoff || inPlayoffWindow;

              // ── GM-mode: find user team's game for this day ────────────────
              // Exclude exhibition/All-Star events so they don't override the All-Star tile.
              const userGame: Game | undefined = gmTid !== null
                ? games.find(g => !isAllStarGame(g) && (g.homeTid === gmTid || g.awayTid === gmTid))
                : undefined;

              const isUserHome = !!userGame && userGame.homeTid === gmTid;
              const opponentTid = userGame ? (isUserHome ? userGame.awayTid : userGame.homeTid) : -1;
              const opponent = opponentTid >= 0 ? teamsById.get(opponentTid) : undefined;
              const userPlayed = !!userGame && userGame.played;
              const userScore = userGame ? (isUserHome ? userGame.homeScore : userGame.awayScore) : 0;
              const oppScore  = userGame ? (isUserHome ? userGame.awayScore : userGame.homeScore) : 0;
              const userWon = userPlayed && userScore > oppScore;

              const hasRichGM = gmTid !== null && !!userGame && !isAllStarWeekend;

              // Tint: home = blue (cool), away = red (hot). Playoff/Play-in override to purple/violet.
              const isUserPlayoff = hasRichGM && !!userGame?.isPlayoff;
              const isUserPlayIn  = hasRichGM && !!userGame?.isPlayIn;
              const gmBgClass = hasRichGM
                ? (isUserPlayoff
                    ? (userPlayed ? 'bg-indigo-700/55 border-amber-400/60' : 'bg-indigo-700/40 border-amber-400/50 hover:bg-indigo-700/55')
                  : isUserPlayIn
                    ? (userPlayed ? 'bg-violet-700/55 border-violet-400/60' : 'bg-violet-700/40 border-violet-400/50 hover:bg-violet-700/55')
                  : isUserHome
                    ? (userPlayed ? 'bg-sky-600/55 border-sky-400/60' : 'bg-sky-600/40 border-sky-400/50 hover:bg-sky-600/55')
                    : (userPlayed ? 'bg-rose-700/55 border-rose-500/60' : 'bg-rose-700/40 border-rose-500/50 hover:bg-rose-700/55'))
                : '';

              // Event tile colors (commissioner mode or GM days without a user game).
              // Playoff/Play-in: use strong tint when a game exists, softer tint inside the window
              // with no scheduled game yet ("reserved" look) — both still get the icon.
              const eventBg = !hasRichGM
                ? (isAllStarWeekend
                    ? 'bg-gradient-to-br from-amber-600/35 to-amber-900/30 border-amber-400/50 hover:from-amber-500/45 hover:to-amber-900/40'
                  : hasPlayoff
                    ? 'bg-gradient-to-br from-indigo-700/35 to-indigo-950/40 border-amber-400/40 hover:from-indigo-600/45'
                  : hasPlayIn
                    ? 'bg-gradient-to-br from-violet-700/35 to-violet-950/40 border-violet-400/40 hover:from-violet-600/45'
                  : inPlayoffWindow
                    ? 'bg-gradient-to-br from-indigo-900/20 to-indigo-950/25 border-amber-500/15 hover:from-indigo-800/30'
                  : inPlayInWindow
                    ? 'bg-gradient-to-br from-violet-900/20 to-violet-950/25 border-violet-500/15 hover:from-violet-800/30'
                  : '')
                : '';

              return (
                <button
                  key={day}
                  onClick={() => {
                    setSelectedDate(dateStr);
                    setViewMode('day');
                  }}
                  className={`
                    relative aspect-square p-1 md:p-2 rounded-lg border transition-all flex flex-col items-start group overflow-hidden
                    ${isToday ? 'bg-emerald-500/10 border-emerald-500/30' :
                      isSelected ? 'bg-white/10 border-white/20' :
                      hasRichGM ? gmBgClass :
                      eventBg ? eventBg :
                      'bg-white/[0.03] border-white/[0.05] hover:bg-white/[0.08] hover:border-white/10'}
                  `}
                >
                  <span className={`relative z-10 text-xs md:text-lg font-black ${
                    isToday ? 'text-emerald-400' :
                    isSelected ? 'text-white' :
                    isAllStarWeekend ? 'text-amber-300' :
                    hasPlayoff && !hasRichGM ? 'text-amber-200' :
                    hasPlayIn && !hasRichGM ? 'text-violet-200' :
                    hasRichGM ? 'text-white/90' :
                    'text-slate-500 group-hover:text-slate-300'
                  }`}>
                    {day}
                  </span>

                  {/* All-Star weekend: Star icon + image overlay (image hides on error, icon remains) */}
                  {isAllStarWeekend && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Star size={28} className="text-amber-300/60 md:w-8 md:h-8" fill="currentColor" strokeWidth={1} />
                      <img
                        src="https://content.sportslogos.net/logos/6/980/full/4585__nba_all-star_game-secondary-2021.png"
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        className="absolute w-7 h-7 md:w-9 md:h-9 object-contain opacity-80"
                      />
                    </div>
                  )}

                  {/* Playoff tile (scheduled game OR in Apr 19–Jun 22 window): Trophy + logo overlay */}
                  {!isAllStarWeekend && !hasRichGM && showPlayoff && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Trophy size={24} className={`md:w-7 md:h-7 ${hasPlayoff ? 'text-amber-300/55' : 'text-amber-300/25'}`} strokeWidth={1.5} />
                      {hasPlayoff && (
                        <img
                          src="https://content.sportslogos.net/logos/6/981/full/_nba_playoffs_logo_primary_2022_sportslogosnet-4785.png"
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          className="absolute w-7 h-7 md:w-9 md:h-9 object-contain opacity-80"
                        />
                      )}
                    </div>
                  )}

                  {/* Play-in tile (scheduled OR in Apr 15–18 window): Award icon */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && showPlayIn && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Award size={26} className={`md:w-7 md:h-7 ${hasPlayIn ? 'text-violet-200/70' : 'text-violet-200/30'}`} strokeWidth={1.5} />
                    </div>
                  )}

                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && highlighted && (
                    <div className={`hidden md:block absolute top-1 right-1 text-[8px] font-black uppercase tracking-tighter ${highlighted.color}`}>
                      {highlighted.icon}
                    </div>
                  )}

                  {/* GM-mode rich cell: opponent logo backdrop + W/L badge */}
                  {hasRichGM && opponent && (
                    <>
                      {(opponent.logoUrl || (opponent as any).imgURL) && (
                        <img
                          src={opponent.logoUrl || (opponent as any).imgURL}
                          alt={opponent.name}
                          referrerPolicy="no-referrer"
                          onError={e => { e.currentTarget.style.display = 'none'; }}
                          className="absolute inset-0 m-auto w-8 h-8 md:w-12 md:h-12 object-contain opacity-80 pointer-events-none"
                        />
                      )}
                      {/* Home/Away indicator */}
                      <span className="hidden md:block absolute top-1 right-1 text-[7px] font-black uppercase tracking-widest text-white/60">
                        {isUserHome ? 'vs' : '@'}
                      </span>
                      {/* Playoff/Play-in tag */}
                      {(userGame.isPlayoff || userGame.isPlayIn) && (
                        <span className="absolute top-1 right-1 md:right-auto md:left-1 text-[7px] font-black uppercase tracking-widest text-amber-300">
                          {userGame.isPlayIn ? 'P-IN' : `PO${userGame.playoffGameNumber ? ` G${userGame.playoffGameNumber}` : ''}`}
                        </span>
                      )}
                      {/* W/L + score footer */}
                      {userPlayed && (
                        <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 flex items-center justify-between bg-black/55 backdrop-blur-[2px]">
                          <span className={`text-[8px] md:text-[10px] font-black ${userWon ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {userWon ? 'W' : 'L'}
                          </span>
                          <span className="text-[8px] md:text-[10px] font-bold text-white/90 tabular-nums">
                            {userScore}-{oppScore}
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Commissioner mode (or GM with no game): keep dot strip */}
                  {!hasRichGM && (
                    <div className="mt-auto flex flex-wrap gap-0.5">
                      {games.slice(0, 4).map(g => (
                        <div
                          key={g.gid}
                          className={`w-1 h-1 rounded-full ${getDotColor(g)}`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
};
