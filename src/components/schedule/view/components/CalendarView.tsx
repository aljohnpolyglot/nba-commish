import React from 'react';
import { ChevronLeft, ChevronRight, Star, Trophy, Award, Clock, DollarSign, Shuffle, Clipboard, Zap, Globe, Timer, BookOpen } from 'lucide-react';
import { Game, NBATeam } from '../../../../types';
import { normalizeDate, getOwnTeamId } from '../../../../utils/helpers';
import { getAllStarWeekendDates } from '../../../../services/allStar/AllStarWeekendOrchestrator';
import {
  getTradeDeadlineDate, getFreeAgencyStartDate, getFreeAgencyMoratoriumEndDate,
  getDraftLotteryDate, getDraftDate, getDraftCombineStartDate, getDraftCombineEndDate,
  getTrainingCampDate, toISODateString,
} from '../../../../utils/dateUtils';

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

  const seasonYear: number = state.leagueStats?.year ?? new Date().getFullYear();

  // ── Key season dates (all derived from leagueStats with configurable defaults) ─
  const ls = state.leagueStats;
  const tradeDeadlineStr    = toISODateString(getTradeDeadlineDate(seasonYear, ls));
  const faStartStr          = toISODateString(getFreeAgencyStartDate(seasonYear, ls));
  const faMoratoriumEndStr  = toISODateString(getFreeAgencyMoratoriumEndDate(seasonYear, ls));
  const draftLotteryStr     = toISODateString(getDraftLotteryDate(seasonYear, ls));
  const draftDayStr         = toISODateString(getDraftDate(seasonYear, ls));
  const combineStartStr     = toISODateString(getDraftCombineStartDate(seasonYear, ls));
  const combineEndStr       = toISODateString(getDraftCombineEndDate(seasonYear, ls));
  const trainingCampStr     = toISODateString(getTrainingCampDate(seasonYear, ls));

  // Finals series game IDs (populated once bracket exists)
  const finalsGameIds = new Set<number>(
    (state.playoffs?.series ?? [])
      .filter((s: any) => s.conference === 'Finals')
      .flatMap((s: any) => s.gameIds ?? [])
  );

  // ── Navigable month bounds ────────────────────────────────────────────────
  let minMs = Infinity, maxMs = -Infinity;
  for (const g of (state.schedule ?? [])) {
    if (!g.date) continue;
    const ms = new Date(g.date).getTime();
    if (!isNaN(ms)) { if (ms < minMs) minMs = ms; if (ms > maxMs) maxMs = ms; }
  }
  const minScheduleDate = isFinite(minMs) ? new Date(minMs) : new Date(Date.UTC(seasonYear - 1, 7, 1));
  const offseasonEndMs = Date.UTC(seasonYear, 8, 30);
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

            const allStarDateSet = new Set<string>();
            const addWeekend = (y: number) => {
              try {
                const d = getAllStarWeekendDates(y);
                [d.risingStars, d.saturday, d.allStarGame].forEach(dt => {
                  allStarDateSet.add(normalizeDate(dt.toISOString()));
                });
              } catch { /* ignore bad years */ }
            };
            addWeekend(year);
            addWeekend(year + 1);

            return Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`;
              const dateNorm = normalizeDate(dateStr);
              const stateDateNorm = normalizeDate(state.date);
              const isToday = dateNorm === stateDateNorm;
              const isSelected = dateNorm === normalizeDate(selectedDate);

              const games = state.schedule.filter((g: Game) => normalizeDate(g.date) === dateNorm);
              const dateObj = new Date(dateStr);
              const highlighted = getHighlightedEvent(dateObj);

              const isAllStarGame = (g: Game) =>
                g.isAllStar || g.isRisingStars || g.isCelebrityGame || g.isDunkContest || g.isThreePointContest;
              const isAllStarWeekend = games.some(isAllStarGame) || allStarDateSet.has(dateNorm);

              const hasPlayoff    = games.some((g: Game) => g.isPlayoff);
              const hasPlayIn     = games.some((g: Game) => g.isPlayIn);
              const hasFinals     = games.some((g: Game) => g.isPlayoff && finalsGameIds.has(g.gid));
              const hasPreseason  = games.some((g: Game) => g.isPreseason && !g.isExhibition);
              const hasExhibition = games.some((g: Game) => g.isExhibition);

              // Fixed calendar windows
              const calMonth1 = month + 1;
              const inPlayInWindow   = (calMonth1 === 4 && day >= 15 && day <= 18);
              const inPlayoffWindow  = (calMonth1 === 4 && day >= 19) || calMonth1 === 5 || (calMonth1 === 6 && day <= 22);
              const showPlayIn  = hasPlayIn  || inPlayInWindow;
              const showPlayoff = hasPlayoff || inPlayoffWindow;

              // Key event dates
              const isTradeDeadline  = dateNorm === tradeDeadlineStr;
              const isDraftLottery   = dateNorm === draftLotteryStr;
              const inCombineWindow  = dateNorm >= combineStartStr && dateNorm <= combineEndStr;
              const isDraft          = dateNorm === draftDayStr;
              const isFAMoratorium   = dateNorm === faStartStr;
              const isFAOpen         = dateNorm === faMoratoriumEndStr;
              const isTrainingCamp   = dateNorm === trainingCampStr;

              // ── GM-mode: find user team's game for this day ────────────────
              const userGame: Game | undefined = gmTid !== null
                ? games.find((g: Game) => !isAllStarGame(g) && (g.homeTid === gmTid || g.awayTid === gmTid))
                : undefined;

              const isUserScrimmage  = !!userGame && userGame.homeTid === userGame.awayTid;
              const isUserHome       = !!userGame && !isUserScrimmage && userGame.homeTid === gmTid;
              const opponentTid      = userGame && !isUserScrimmage ? (isUserHome ? userGame.awayTid : userGame.homeTid) : -1;
              const opponent         = opponentTid >= 0 ? teamsById.get(opponentTid) : undefined;
              const userTeam         = gmTid !== null ? teamsById.get(gmTid) : undefined;
              const userPlayed       = !!userGame && userGame.played;
              const userScore        = userGame ? userGame.homeScore : 0;
              const oppScore         = userGame ? userGame.awayScore : 0;
              const userWon          = userPlayed && !isUserScrimmage && userScore > oppScore;
              const isUserFinals     = !!userGame?.isPlayoff && finalsGameIds.has(userGame.gid);
              const isUserPreseason  = !!userGame?.isPreseason && !isUserScrimmage;

              // Key league events override the GM game tile (same logic as All-Star weekend)
              const hasKeyLeagueEvent = isTradeDeadline || isDraftLottery || inCombineWindow || isDraft
                || isFAMoratorium || isFAOpen || isTrainingCamp;
              const hasRichGM = gmTid !== null && !!userGame && !isAllStarWeekend && !hasKeyLeagueEvent;

              // Tints for GM game tiles
              const isUserPlayoff = hasRichGM && !!userGame?.isPlayoff && !isUserFinals;
              const isUserPlayIn  = hasRichGM && !!userGame?.isPlayIn;

              const gmBgClass = hasRichGM
                ? (isUserScrimmage
                    ? (userPlayed ? 'bg-neutral-700/50 border-neutral-400/40' : 'bg-neutral-700/35 border-neutral-400/30 hover:bg-neutral-700/50')
                  : isUserFinals
                    ? (userPlayed ? 'bg-amber-600/55 border-yellow-300/70' : 'bg-amber-600/40 border-yellow-300/55 hover:bg-amber-600/55')
                  : isUserPlayoff
                    ? (userPlayed ? 'bg-indigo-700/55 border-amber-400/60' : 'bg-indigo-700/40 border-amber-400/50 hover:bg-indigo-700/55')
                  : isUserPlayIn
                    ? (userPlayed ? 'bg-violet-700/55 border-violet-400/60' : 'bg-violet-700/40 border-violet-400/50 hover:bg-violet-700/55')
                  : isUserPreseason
                    ? (userPlayed ? 'bg-slate-600/50 border-slate-400/40' : 'bg-slate-600/35 border-slate-400/30 hover:bg-slate-600/50')
                  : isUserHome
                    ? (userPlayed ? 'bg-sky-600/55 border-sky-400/60' : 'bg-sky-600/40 border-sky-400/50 hover:bg-sky-600/55')
                    : (userPlayed ? 'bg-rose-700/55 border-rose-500/60' : 'bg-rose-700/40 border-rose-500/50 hover:bg-rose-700/55'))
                : '';

              // Event tile backgrounds (commissioner or GM days without a user game)
              const eventBg = !hasRichGM
                ? (isAllStarWeekend
                    ? 'bg-gradient-to-br from-amber-600/35 to-amber-900/30 border-amber-400/50 hover:from-amber-500/45 hover:to-amber-900/40'
                  : hasFinals
                    ? 'bg-gradient-to-br from-amber-600/35 to-yellow-950/30 border-yellow-300/55 hover:from-amber-500/45'
                  : hasPlayoff
                    ? 'bg-gradient-to-br from-indigo-700/35 to-indigo-950/40 border-amber-400/40 hover:from-indigo-600/45'
                  : hasPlayIn
                    ? 'bg-gradient-to-br from-violet-700/35 to-violet-950/40 border-violet-400/40 hover:from-violet-600/45'
                  : isTradeDeadline
                    ? 'bg-gradient-to-br from-orange-700/40 to-orange-950/35 border-orange-400/55 hover:from-orange-600/50'
                  : isDraftLottery
                    ? 'bg-gradient-to-br from-purple-700/40 to-purple-950/35 border-purple-400/55 hover:from-purple-600/50'
                  : inCombineWindow
                    ? 'bg-gradient-to-br from-teal-700/35 to-teal-950/30 border-teal-400/45 hover:from-teal-600/45'
                  : isDraft
                    ? 'bg-gradient-to-br from-blue-700/40 to-blue-950/35 border-blue-400/55 hover:from-blue-600/50'
                  : isFAMoratorium
                    ? 'bg-gradient-to-br from-yellow-700/35 to-amber-950/30 border-yellow-400/50 hover:from-yellow-600/45'
                  : isFAOpen
                    ? 'bg-gradient-to-br from-emerald-700/40 to-emerald-950/35 border-emerald-400/55 hover:from-emerald-600/50'
                  : isTrainingCamp
                    ? 'bg-gradient-to-br from-orange-600/35 to-orange-950/30 border-orange-400/45 hover:from-orange-500/45'
                  : hasPreseason
                    ? 'bg-gradient-to-br from-slate-600/30 to-slate-900/25 border-slate-400/35 hover:from-slate-500/40'
                  : hasExhibition
                    ? 'bg-gradient-to-br from-purple-800/30 to-purple-950/25 border-purple-400/35 hover:from-purple-700/40'
                  : inPlayoffWindow
                    ? 'bg-gradient-to-br from-indigo-900/20 to-indigo-950/25 border-amber-500/15 hover:from-indigo-800/30'
                  : inPlayInWindow
                    ? 'bg-gradient-to-br from-violet-900/20 to-violet-950/25 border-violet-500/15 hover:from-violet-800/30'
                  : '')
                : '';

              // Day number text color
              const dayColor = isToday ? 'text-emerald-400'
                : isSelected ? 'text-white'
                : isAllStarWeekend ? 'text-amber-300'
                : hasFinals && !hasRichGM ? 'text-yellow-200'
                : (hasPlayoff || inPlayoffWindow) && !hasRichGM ? 'text-amber-200'
                : (hasPlayIn || inPlayInWindow) && !hasRichGM ? 'text-violet-200'
                : isTradeDeadline && !hasRichGM ? 'text-orange-300'
                : isDraftLottery && !hasRichGM ? 'text-purple-300'
                : (inCombineWindow || isDraft) && !hasRichGM ? 'text-blue-300'
                : (isFAMoratorium || isFAOpen) && !hasRichGM ? 'text-emerald-300'
                : isTrainingCamp && !hasRichGM ? 'text-orange-300'
                : hasRichGM ? 'text-white/90'
                : 'text-slate-500 group-hover:text-slate-300';

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
                  <span className={`relative z-10 text-xs md:text-lg font-black ${dayColor}`}>
                    {day}
                  </span>

                  {/* All-Star weekend: Star icon (no official logo) */}
                  {isAllStarWeekend && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Star size={28} className="text-amber-300/70 md:w-8 md:h-8" fill="currentColor" strokeWidth={1} />
                    </div>
                  )}

                  {/* Finals tile: gold Trophy (no official logo) */}
                  {!isAllStarWeekend && !hasRichGM && hasFinals && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Trophy size={24} className="md:w-7 md:h-7 text-yellow-300/65" strokeWidth={1.5} fill="currentColor" />
                    </div>
                  )}

                  {/* Playoff tile (non-Finals, scheduled OR window): Trophy icon (no official logo) */}
                  {!isAllStarWeekend && !hasRichGM && !hasFinals && showPlayoff && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Trophy size={24} className={`md:w-7 md:h-7 ${hasPlayoff ? 'text-amber-300/55' : 'text-amber-300/25'}`} strokeWidth={1.5} />
                    </div>
                  )}

                  {/* Play-in tile (scheduled OR window): Award icon */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && showPlayIn && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Award size={26} className={`md:w-7 md:h-7 ${hasPlayIn ? 'text-violet-200/70' : 'text-violet-200/30'}`} strokeWidth={1.5} />
                    </div>
                  )}

                  {/* Trade Deadline tile */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && isTradeDeadline && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <Clock size={20} className="md:w-6 md:h-6 text-orange-300/75" strokeWidth={1.5} />
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-orange-300/70">Deadline</span>
                    </div>
                  )}

                  {/* Draft Lottery tile */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && isDraftLottery && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <Shuffle size={20} className="md:w-6 md:h-6 text-purple-300/75" strokeWidth={1.5} />
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-purple-300/70">Lottery</span>
                    </div>
                  )}

                  {/* Draft Combine tile */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && inCombineWindow && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <Clipboard size={20} className="md:w-6 md:h-6 text-teal-300/75" strokeWidth={1.5} />
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-teal-300/70">Combine</span>
                    </div>
                  )}

                  {/* NBA Draft tile */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && isDraft && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <BookOpen size={20} className="md:w-6 md:h-6 text-blue-300/75" strokeWidth={1.5} />
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-blue-300/70">Draft</span>
                    </div>
                  )}

                  {/* FA Moratorium tile (Jul 1 — negotiations open, signings locked) */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && !isDraft && isFAMoratorium && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <Timer size={20} className="md:w-6 md:h-6 text-yellow-300/75" strokeWidth={1.5} />
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-yellow-300/70">FA Opens</span>
                    </div>
                  )}

                  {/* FA Moratorium End tile (signings begin) */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && !isDraft && !isFAMoratorium && isFAOpen && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <DollarSign size={20} className="md:w-6 md:h-6 text-emerald-300/75" strokeWidth={1.5} />
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-emerald-300/70">Signings</span>
                    </div>
                  )}

                  {/* Training Camp tile */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && !isDraft && !isFAMoratorium && !isFAOpen && isTrainingCamp && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <Zap size={20} className="md:w-6 md:h-6 text-orange-300/75" strokeWidth={1.5} />
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-orange-300/70">Camp</span>
                    </div>
                  )}

                  {/* Preseason game tile */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && !isDraft && !isFAMoratorium && !isFAOpen && !isTrainingCamp && hasPreseason && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <span className="text-[16px] md:text-[20px] opacity-50">🏀</span>
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-slate-400/70">Preseason</span>
                    </div>
                  )}

                  {/* Exhibition / Global game tile */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && !isDraft && !isFAMoratorium && !isFAOpen && !isTrainingCamp && !hasPreseason && hasExhibition && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <Globe size={20} className="md:w-6 md:h-6 text-purple-300/75" strokeWidth={1.5} />
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-purple-300/70">Global</span>
                    </div>
                  )}

                  {/* Fallback: highlighted event label (e.g. Christmas) */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && !isDraft && !isFAMoratorium && !isFAOpen && !isTrainingCamp && !hasPreseason && !hasExhibition && highlighted && (
                    <div className={`hidden md:block absolute top-1 right-1 text-[8px] font-black uppercase tracking-tighter ${highlighted.color}`}>
                      {highlighted.icon}
                    </div>
                  )}

                  {/* GM-mode rich cell — scrimmage (intra-squad): own logo + SCR tag */}
                  {hasRichGM && isUserScrimmage && (
                    <>
                      {userTeam && (userTeam.logoUrl || (userTeam as any).imgURL) && (
                        <img
                          src={userTeam.logoUrl || (userTeam as any).imgURL}
                          alt={userTeam.name}
                          referrerPolicy="no-referrer"
                          onError={e => { e.currentTarget.style.display = 'none'; }}
                          className="absolute inset-0 m-auto w-8 h-8 md:w-12 md:h-12 object-contain opacity-40 pointer-events-none"
                        />
                      )}
                      <span className="absolute top-1 right-1 text-[7px] font-black uppercase tracking-widest text-neutral-400">
                        SCR
                      </span>
                      {userPlayed && (
                        <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
                          <span className="text-[8px] md:text-[10px] font-bold text-white/70 tabular-nums">
                            {userScore}-{oppScore}
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {/* GM-mode rich cell: opponent logo backdrop + W/L badge */}
                  {hasRichGM && !isUserScrimmage && opponent && (
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
                      {/* Game type tag */}
                      {isUserFinals && (
                        <span className="absolute top-1 right-1 md:right-auto md:left-1 text-[7px] font-black uppercase tracking-widest text-yellow-300">
                          {`FINALS${userGame.playoffGameNumber ? ` G${userGame.playoffGameNumber}` : ''}`}
                        </span>
                      )}
                      {!isUserFinals && (userGame.isPlayoff || userGame.isPlayIn) && (
                        <span className="absolute top-1 right-1 md:right-auto md:left-1 text-[7px] font-black uppercase tracking-widest text-amber-300">
                          {userGame.isPlayIn ? 'P-IN' : `PO${userGame.playoffGameNumber ? ` G${userGame.playoffGameNumber}` : ''}`}
                        </span>
                      )}
                      {isUserPreseason && (
                        <span className="absolute top-1 right-1 md:right-auto md:left-1 text-[7px] font-black uppercase tracking-widest text-slate-400">
                          PRE
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
                      {games.slice(0, 4).map((g: Game) => (
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
