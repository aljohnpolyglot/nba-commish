import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Star, Trophy, Award, Clock, DollarSign, Shuffle, Clipboard, Zap, Globe, Timer, BookOpen } from 'lucide-react';
import { Game, NBATeam } from '../../../../types';
import { normalizeDate, getOwnTeamId } from '../../../../utils/helpers';
import { getAllStarWeekendDates } from '../../../../services/allStar/AllStarWeekendOrchestrator';
import {
  getTradeDeadlineDate, getCurrentOffseasonEffectiveFAStart, getCurrentOffseasonFAMoratoriumEnd,
  getDraftLotteryDate, getDraftDate, getDraftCombineStartDate, getDraftCombineEndDate,
  getTrainingCampDate, isDraftBlockedByUnresolvedPlayoffs, toISODateString,
} from '../../../../utils/dateUtils';
import { isNoDraftLeague } from '../../../../services/offseason/offseasonState';
import { isEuroIsolatedMode } from '../../../../utils/uiMode';
import { userQualifiesForContinental } from '../../../../utils/euroLeagueDefaults';
import { resolveAnyTeam } from '../../../../utils/teamLookup';

interface CalendarViewProps {
  calendarMonth: Date;
  setCalendarMonth: (date: Date) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  setViewMode: (mode: 'calendar' | 'day' | 'watching') => void;
  state: any;
  title?: string;
  focusTeamId?: number | null;
  formatDateDisplay: (dateStr: string) => string;
  getDotColor: (g: Game) => string;
  getHighlightedEvent: (date: Date) => { label: string; color: string; icon: string } | null;
  onDateClick?: (args: { date: string; dateObj: Date; games: Game[]; focusTeamGame?: Game }) => boolean | void;
  renderDayOverlay?: (args: { date: string; dateObj: Date; games: Game[]; focusTeamGame?: Game }) => React.ReactNode;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  calendarMonth,
  setCalendarMonth,
  selectedDate,
  setSelectedDate,
  setViewMode,
  state,
  title = 'Season Schedule',
  focusTeamId,
  formatDateDisplay,
  getDotColor,
  getHighlightedEvent,
  onDateClick,
  renderDayOverlay
}) => {
  const [activeTab, setActiveTab] = useState('Calendar');
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = calendarMonth.toLocaleString('default', { month: 'long' });

  const seasonYear: number = state.leagueStats?.year ?? new Date().getFullYear();
  const euroIsolated = isEuroIsolatedMode(state);
  const noDraft = isNoDraftLeague(state.leagueStats);
  const userInEL = userQualifiesForContinental(state as any);
  useEffect(() => {
    setActiveTab('Calendar');
  }, [state.saveId, state.leagueStats?.uiMode]);

  const visibleSchedule = euroIsolated
    ? (state.schedule ?? []).filter((g: Game) => {
        if (!userInEL && g.competitionId === 'euroleague') return false;
        return !!g.competitionId
          || (!!(g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100));
      })
    : (state.schedule ?? []);

  // ── Key season dates (all derived from leagueStats with configurable defaults) ─
  const ls = state.leagueStats;
  const tradeDeadlineStr    = toISODateString(getTradeDeadlineDate(seasonYear, ls));
  const currentDateForFA    = state.date ? new Date(state.date) : new Date();
  const faStartStr          = toISODateString(getCurrentOffseasonEffectiveFAStart(currentDateForFA, ls, state.schedule));
  const faMoratoriumEndStr  = toISODateString(getCurrentOffseasonFAMoratoriumEnd(currentDateForFA, ls, state.schedule));
  const draftLotteryStr     = toISODateString(getDraftLotteryDate(seasonYear, ls));
  const draftDayStr         = toISODateString(getDraftDate(seasonYear, ls));
  const draftBlockedByPlayoffs = isDraftBlockedByUnresolvedPlayoffs(state);
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
  for (const g of visibleSchedule) {
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
  const monthGames = visibleSchedule.filter((g: Game) => {
    const d = new Date(g.date);
    return d.getUTCFullYear() === year && d.getUTCMonth() === month;
  });
  const ownMonthGames = monthGames.filter((g: Game) => {
    const ownTid = getOwnTeamId(state);
    return ownTid !== null && ownTid !== undefined && (g.homeTid === ownTid || g.awayTid === ownTid);
  });
  const euroGames = monthGames.filter((g: Game) => g.competitionId === 'euroleague').length;
  const domesticGames = monthGames.filter((g: Game) => g.competitionId === 'endesa').length;
  const congestion = ownMonthGames.length >= 8 ? 'High' : ownMonthGames.length >= 5 ? 'Medium' : 'Low';
  const competitionTabId = !euroIsolated ? null
    : activeTab === 'EuroLeague' ? 'euroleague'
    : activeTab === 'Endesa' ? 'endesa'
    : activeTab === 'Copa del Rey' ? 'copa-del-rey'
    : activeTab === 'Supercopa' ? 'supercopa'
    : null;

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 bg-slate-950 text-white">
      <div className="w-full max-w-[1680px] mx-auto space-y-5">
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight">{title === 'Season Schedule' ? 'Schedule' : title}</h1>
            <p className="text-slate-400 font-medium mt-1 text-sm">View all fixtures, results and calendar across all competitions.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 w-full xl:w-auto">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-5 py-3 min-w-[170px]">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">Season</div>
              <div className="text-lg font-black text-white">{seasonYear}-{String(seasonYear + 1).slice(-2)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-5 py-3 min-w-[190px]">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">Fixture Congestion</div>
              <div className={`text-lg font-black ${congestion === 'High' ? 'text-rose-300' : congestion === 'Medium' ? 'text-amber-300' : 'text-emerald-300'}`}>{congestion}</div>
            </div>
            <button
              onClick={() => setViewMode('day')}
              className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-5 py-3 text-left hover:bg-amber-400/15"
            >
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">Current Date</div>
              <div className="text-lg font-black text-amber-300">{formatDateDisplay(state.date).replace(',', '')}</div>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="px-4 pt-3 border-b border-slate-800">
            <div className="flex gap-3 overflow-x-auto">
              {(euroIsolated
                ? ['Overview', 'Calendar', 'Endesa', 'EuroLeague', 'Copa del Rey', 'Supercopa', 'All Fixtures']
                : ['Overview', 'Calendar', 'All Fixtures']
              ).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-3 text-xs font-black uppercase tracking-widest border-b-2 whitespace-nowrap ${
                    tab === activeTab ? 'border-amber-400 text-amber-300' : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {competitionTabId ? (
            <CompetitionDetailPanel
              competitionId={competitionTabId}
              state={state}
              seasonYear={seasonYear}
              onJumpToDate={(date) => {
                setSelectedDate(date);
                setViewMode('day');
              }}
            />
          ) : (
            <>
          <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-center gap-2 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
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
            <div className="flex flex-wrap items-center gap-4 text-xs">
              {euroIsolated ? (
                <>
                  <span className="inline-flex items-center gap-2 text-slate-300"><i className="w-3 h-3 rounded-full bg-sky-500" /> Endesa {domesticGames}</span>
                  <span className="inline-flex items-center gap-2 text-slate-300"><i className="w-3 h-3 rounded-full bg-orange-500" /> EuroLeague {euroGames}</span>
                  <span className="inline-flex items-center gap-2 text-slate-300"><i className="w-3 h-3 rounded-full bg-amber-400" /> Cup</span>
                </>
              ) : (
                <span className="inline-flex items-center gap-2 text-slate-300"><i className="w-3 h-3 rounded-full bg-sky-500" /> {monthGames.length} games</span>
              )}
              <button className="ml-auto rounded-lg border border-slate-700 px-4 py-2 text-slate-300 hover:text-white">Filter</button>
            </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-800">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="bg-slate-950/95 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest py-3">{day}</div>
          ))}

          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square bg-slate-950/70" />
          ))}

          {(() => {
            const ownTid = getOwnTeamId(state);
            const gmTid = focusTeamId !== undefined ? focusTeamId : ownTid;
            const resolveTeam = (tid: number): NBATeam | null =>
              resolveAnyTeam(tid, state.teams ?? [], state.nonNBATeams ?? []);

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

              const games = visibleSchedule.filter((g: Game) => normalizeDate(g.date) === dateNorm);
              const dateObj = new Date(dateStr);
              const highlighted = getHighlightedEvent(dateObj);

              const isAllStarGame = (g: Game) =>
                g.isAllStar || g.isRisingStars || g.isCelebrityGame || g.isDunkContest || g.isThreePointContest;
              const isAllStarWeekend = !euroIsolated && (games.some(isAllStarGame) || allStarDateSet.has(dateNorm));

              const hasPlayoff    = games.some((g: Game) => g.isPlayoff);
              const hasPlayIn     = games.some((g: Game) => g.isPlayIn);
              const hasFinals     = games.some((g: Game) => g.isPlayoff && finalsGameIds.has(g.gid));
              const hasPreseason  = games.some((g: Game) => g.isPreseason && !g.isExhibition);
              const hasExhibition = games.some((g: Game) => g.isExhibition);
              const hasCupFinal   = games.some((g: Game) => (g as any).isNBACup && (g as any).nbaCupRound === 'Final');
              const hasCupKO      = games.some((g: Game) => (g as any).isNBACup && ((g as any).nbaCupRound === 'QF' || (g as any).nbaCupRound === 'SF'));
              const hasCupGroup   = games.some((g: Game) => (g as any).isNBACup && (g as any).nbaCupRound === 'group');
              const hasCupTBD     = games.some((g: Game) => (g as any).isCupTBD);

              // Fixed calendar windows
              const calMonth1 = month + 1;
              const inPlayInWindow   = (calMonth1 === 4 && day >= 15 && day <= 18);
              const inPlayoffWindow  = (calMonth1 === 4 && day >= 19) || calMonth1 === 5 || (calMonth1 === 6 && day <= 22);
              const showPlayIn  = !euroIsolated && ls?.playIn !== false && (hasPlayIn || inPlayInWindow);
              const showPlayoff = !euroIsolated && (hasPlayoff || inPlayoffWindow);

              // Key event dates
              const isTradeDeadline  = !euroIsolated && dateNorm === tradeDeadlineStr;
              const isDraftLottery   = !noDraft && dateNorm === draftLotteryStr;
              const inCombineWindow  = !noDraft && dateNorm >= combineStartStr && dateNorm <= combineEndStr;
              const isDraft          = !noDraft && dateNorm === draftDayStr && !draftBlockedByPlayoffs;
              const isFAMoratorium   = dateNorm === faStartStr;
              const isFAOpen         = dateNorm === faMoratoriumEndStr;
              const isTrainingCamp   = dateNorm === trainingCampStr;

              // ── GM-mode: find user team's game for this day ────────────────
              const userGame: Game | undefined = gmTid !== null
                ? games.find((g: Game) => !isAllStarGame(g) && !(g as any).isCupTBD && (g.homeTid === gmTid || g.awayTid === gmTid))
                : undefined;

              const isUserScrimmage  = !!userGame && userGame.homeTid === userGame.awayTid;
              const isUserHome       = !!userGame && !isUserScrimmage && userGame.homeTid === gmTid;
              const opponentTid      = userGame && !isUserScrimmage ? (isUserHome ? userGame.awayTid : userGame.homeTid) : -1;
              const opponent         = opponentTid >= 0 ? resolveTeam(opponentTid) : undefined;
              const userTeam         = gmTid !== null ? resolveTeam(gmTid) : undefined;
              const userPlayed       = !!userGame && userGame.played;
              // Score from USER's perspective — home/away matters. Without
              // this, a road win (Breogan 143 @ Bilbao 105) renders as
              // "105-143 · L" because the tile read homeScore as userScore.
              const userScore        = userGame ? (isUserHome ? userGame.homeScore : userGame.awayScore) : 0;
              const oppScore         = userGame ? (isUserHome ? userGame.awayScore : userGame.homeScore) : 0;
              const userWon          = userPlayed && !isUserScrimmage && userScore > oppScore;
              const isUserFinals     = !!userGame?.isPlayoff && finalsGameIds.has(userGame.gid);
              const isUserPreseason  = !!userGame?.isPreseason && !isUserScrimmage;
              const featureCompetitionGame = euroIsolated
                ? games.find((g: Game) => !!g.competitionId && !(g as any).isCupTBD)
                : undefined;
              const featureAway = featureCompetitionGame ? resolveTeam(featureCompetitionGame.awayTid) : null;
              const featureHome = featureCompetitionGame ? resolveTeam(featureCompetitionGame.homeTid) : null;

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
                    const handled = onDateClick?.({ date: dateNorm, dateObj, games, focusTeamGame: userGame });
                    if (handled) return;
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

                  {/* Multi-game All-Star Sunday: count badge for round-robin/knockout formats */}
                  {isAllStarWeekend && games.filter(isAllStarGame).length > 1 && (
                    <span className="absolute bottom-1 left-1 right-1 mx-auto w-fit px-1.5 py-0.5 rounded-full bg-amber-500/90 text-black text-[8px] md:text-[9px] font-black uppercase tracking-widest pointer-events-none">
                      {games.filter(isAllStarGame).length} games
                    </span>
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

                  {/* Cup Final tile — golden Trophy */}
                  {!isAllStarWeekend && !hasRichGM && !hasFinals && !showPlayoff && !showPlayIn && hasCupFinal && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <Trophy size={22} className="md:w-7 md:h-7 text-amber-300/80" strokeWidth={1.5} fill="currentColor" />
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-amber-300/80">Cup Final</span>
                    </div>
                  )}

                  {/* Cup KO tile (QF/SF) */}
                  {!isAllStarWeekend && !hasRichGM && !hasFinals && !showPlayoff && !showPlayIn && !hasCupFinal && hasCupKO && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <Trophy size={20} className="md:w-6 md:h-6 text-orange-300/70" strokeWidth={1.5} />
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-orange-300/70">Cup KO</span>
                    </div>
                  )}

                  {/* Cup Night tile (group stage) */}
                  {!isAllStarWeekend && !hasRichGM && !hasFinals && !showPlayoff && !showPlayIn && !hasCupFinal && !hasCupKO && hasCupGroup && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <span className="text-[16px] md:text-[20px] opacity-50">🏆</span>
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-orange-300/70">Cup Night</span>
                    </div>
                  )}

                  {/* Cup KO Window TBD (Dec 9-11 placeholders, before group resolves) */}
                  {!isAllStarWeekend && !hasRichGM && !hasFinals && !showPlayoff && !showPlayIn && !hasCupFinal && !hasCupKO && !hasCupGroup && hasCupTBD && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <Trophy size={20} className="md:w-6 md:h-6 text-amber-300/40" strokeWidth={1.5} />
                      <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-amber-300/50">Cup TBD</span>
                    </div>
                  )}

                  {/* Trade Deadline tile */}
                  {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !hasCupFinal && !hasCupKO && !hasCupGroup && isTradeDeadline && (
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
                      {(userGame as any).isNBACup && (
                        <span className="absolute top-1 right-1 md:right-auto md:left-1 text-[7px] font-black uppercase tracking-widest text-amber-300 inline-flex items-center gap-0.5">
                          <Trophy size={9} className="md:w-2.5 md:h-2.5" />
                          {(userGame as any).nbaCupRound === 'Final' ? 'CUP F'
                            : (userGame as any).nbaCupRound === 'SF' ? 'CUP SF'
                            : (userGame as any).nbaCupRound === 'QF' ? 'CUP QF'
                            : 'CUP'}
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

                  {!hasRichGM && featureCompetitionGame && featureAway && featureHome && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
                      <div className="flex items-center justify-center gap-1.5">
                        {(featureAway.logoUrl || (featureAway as any).imgURL) && (
                          <img
                            src={featureAway.logoUrl || (featureAway as any).imgURL}
                            alt={featureAway.abbrev}
                            referrerPolicy="no-referrer"
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                            className="w-6 h-6 md:w-9 md:h-9 object-contain opacity-75"
                          />
                        )}
                        <span className="hidden md:block text-[8px] font-black text-white/35">v</span>
                        {(featureHome.logoUrl || (featureHome as any).imgURL) && (
                          <img
                            src={featureHome.logoUrl || (featureHome as any).imgURL}
                            alt={featureHome.abbrev}
                            referrerPolicy="no-referrer"
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                            className="w-6 h-6 md:w-9 md:h-9 object-contain opacity-75"
                          />
                        )}
                      </div>
                      <span className="hidden md:block max-w-[90%] truncate text-[7px] font-black uppercase tracking-widest text-white/40">
                        {featureCompetitionGame.competitionId === 'euroleague' ? 'EuroLeague' : 'Endesa'}
                        {games.length > 1 ? ` +${games.length - 1}` : ''}
                      </span>
                    </div>
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

                  {renderDayOverlay?.({ date: dateNorm, dateObj, games, focusTeamGame: userGame })}
                </button>
              );
            });
          })()}
        </div>
            </>
          )}
      </div>
    </div>
    </div>
  );
};

const CompetitionDetailPanel: React.FC<{
  competitionId: string;
  state: any;
  seasonYear: number;
  onJumpToDate: (date: string) => void;
}> = ({ competitionId, state, seasonYear, onJumpToDate }) => {
  const spec = state.activeCompetitions?.find((c: any) => c.id === competitionId);
  const games: Game[] = (state.schedule ?? []).filter((g: Game) => g.competitionId === competitionId);
  const teamIds = Array.from(new Set(games.flatMap(g => [g.homeTid, g.awayTid]))).filter(tid => tid >= 0);
  const rows = new Map<number, { tid: number; wins: number; losses: number; pf: number; pa: number }>();
  teamIds.forEach(tid => rows.set(tid, { tid, wins: 0, losses: 0, pf: 0, pa: 0 }));
  (state.boxScores ?? []).forEach((b: any) => {
    if (b.competitionId !== competitionId) return;
    if (b.season !== undefined && b.season !== seasonYear) return;
    const home = rows.get(b.homeTeamId) ?? { tid: b.homeTeamId, wins: 0, losses: 0, pf: 0, pa: 0 };
    const away = rows.get(b.awayTeamId) ?? { tid: b.awayTeamId, wins: 0, losses: 0, pf: 0, pa: 0 };
    const homeWon = b.homeScore > b.awayScore;
    home.wins += homeWon ? 1 : 0;
    home.losses += homeWon ? 0 : 1;
    home.pf += b.homeScore;
    home.pa += b.awayScore;
    away.wins += homeWon ? 0 : 1;
    away.losses += homeWon ? 1 : 0;
    away.pf += b.awayScore;
    away.pa += b.homeScore;
    rows.set(home.tid, home);
    rows.set(away.tid, away);
  });
  const standings = [...rows.values()].sort((a, b) => b.wins - a.wins || (b.pf - b.pa) - (a.pf - a.pa));
  const today = normalizeDate(state.date);
  const upcoming = games
    .filter(g => !g.played && normalizeDate(g.date) >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 8);
  const next = upcoming[0];
  const playedCount = (state.boxScores ?? []).filter((b: any) => b.competitionId === competitionId && (b.season === undefined || b.season === seasonYear)).length;
  const ownTid = getOwnTeamId(state);
  const ownRow = ownTid !== null ? standings.find(r => r.tid === ownTid) : undefined;
  const resolveTeam = (tid: number): NBATeam | null => resolveAnyTeam(tid, state.teams ?? [], state.nonNBATeams ?? []);
  const formatShortDate = (dateStr: string) => {
    const norm = normalizeDate(dateStr);
    const d = norm ? new Date(`${norm}T00:00:00Z`) : new Date(dateStr);
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  };
  const topPerformers = (state.players ?? [])
    .filter((p: any) => teamIds.includes(p.tid))
    .sort((a: any, b: any) => (b.ratings?.at(-1)?.ovr ?? b.ovr ?? 0) - (a.ratings?.at(-1)?.ovr ?? a.ovr ?? 0))
    .slice(0, 4);
  const accent = spec?.accentColor ?? '#f59e0b';
  const nextHome = next ? resolveTeam(next.homeTid) : null;
  const nextAway = next ? resolveTeam(next.awayTid) : null;
  return (
    <div className="p-5 space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: accent }}>{spec?.shortName ?? competitionId}</div>
          <h2 className="text-3xl font-black text-white mt-1">{spec?.displayName ?? competitionId}</h2>
          <p className="text-sm text-slate-400 mt-1">Competition dashboard with fixtures, standings, team form, and player storylines.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 min-w-[420px]">
          <CompetitionKpi label="Your Record" value={ownRow ? `${ownRow.wins}-${ownRow.losses}` : '0-0'} sub="Current competition" />
          <CompetitionKpi label="Games Played" value={String(playedCount)} sub={`${games.length} scheduled`} />
          <CompetitionKpi label="Next Fixture" value={next ? formatShortDate(next.date) : 'TBD'} sub={next ? 'Ready to preview' : 'No games queued'} />
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_370px] gap-5">
        <div className="space-y-5">
          {next && (
            <button onClick={() => onJumpToDate(next.date)} className="w-full text-left rounded-2xl border border-slate-800 bg-slate-900/70 p-5 hover:border-amber-400/40">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500">Next Match</div>
                <span className="text-xs font-black text-amber-300">{formatShortDate(next.date)} · {next.tipoffTime ?? 'Tipoff TBD'}</span>
              </div>
              <div className="mt-5 grid grid-cols-[1fr_72px_1fr] gap-4 items-center">
                <TeamMini team={nextAway} align="right" />
                <div className="h-16 rounded-full border border-slate-700 bg-slate-950 flex items-center justify-center text-sm font-black text-slate-400">VS</div>
                <TeamMini team={nextHome} align="left" />
              </div>
            </button>
          )}

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Fixtures</div>
              <div className="text-xs text-slate-500">{upcoming.length} upcoming shown</div>
            </div>
            <div className="divide-y divide-slate-800">
              {upcoming.map(g => {
                const home = resolveTeam(g.homeTid);
                const away = resolveTeam(g.awayTid);
                return (
                  <button key={g.gid} onClick={() => onJumpToDate(g.date)} className="w-full grid grid-cols-[110px_1fr_90px] items-center gap-3 p-4 text-left hover:bg-white/[0.03]">
                    <div className="text-xs font-black text-slate-400">{formatShortDate(g.date)}</div>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-bold text-slate-300 truncate">{away?.name ?? `Team ${g.awayTid}`}</span>
                      <span className="text-slate-600">at</span>
                      <span className="font-bold text-white truncate">{home?.name ?? `Team ${g.homeTid}`}</span>
                    </div>
                    <div className="text-right text-[10px] font-black uppercase tracking-widest text-slate-500">{g.competitionPhase ?? 'League'}</div>
                  </button>
                );
              })}
              {upcoming.length === 0 && <div className="p-6 text-sm text-slate-400">No upcoming fixtures for this competition.</div>}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <CompetitionGauge label="Team Form" value={ownRow ? Math.min(100, ownRow.wins * 12 + 45) : 50} />
            <CompetitionGauge label="Qualification Outlook" value={ownRow && standings.indexOf(ownRow) < 8 ? 78 : 46} />
            <CompetitionGauge label="Schedule Pressure" value={Math.min(100, upcoming.filter(g => ownTid !== null && (g.homeTid === ownTid || g.awayTid === ownTid)).length * 12)} />
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Standings</div>
            <div className="space-y-1.5">
              {standings.slice(0, 10).map((row, index) => {
                const team = resolveTeam(row.tid);
                return (
                  <div key={row.tid} className={`grid grid-cols-[24px_1fr_52px_42px] items-center gap-2 rounded-lg px-2 py-2 text-xs ${row.tid === ownTid ? 'bg-amber-400/10 text-amber-200' : 'text-slate-300'}`}>
                    <span className="font-black text-slate-500">{index + 1}</span>
                    <span className="font-bold truncate">{team?.name ?? `Team ${row.tid}`}</span>
                    <span className="font-black tabular-nums text-right">{row.wins}-{row.losses}</span>
                    <span className="text-slate-500 tabular-nums text-right">{row.pf - row.pa > 0 ? '+' : ''}{row.pf - row.pa}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Top Performers</div>
            <div className="space-y-3">
              {topPerformers.map((p: any) => {
                const team = resolveTeam(p.tid);
                const ovr = p.ratings?.at(-1)?.ovr ?? p.ovr ?? 0;
                return (
                  <div key={p.internalId ?? p.pid ?? p.name} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white truncate">{p.name}</div>
                      <div className="text-xs text-slate-500 truncate">{team?.name ?? 'Club'} · {p.pos ?? 'G/F'}</div>
                    </div>
                    <div className="w-11 h-11 rounded-full border border-emerald-400/40 bg-emerald-400/10 flex items-center justify-center text-sm font-black text-emerald-300">{ovr}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

const CompetitionKpi: React.FC<{ label: string; value: string; sub: string }> = ({ label, value, sub }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
    <div className="text-xl font-black text-white mt-1">{value}</div>
    <div className="text-xs text-slate-500">{sub}</div>
  </div>
);

const TeamMini: React.FC<{ team: NBATeam | null; align: 'left' | 'right' }> = ({ team, align }) => (
  <div className={`flex items-center gap-3 ${align === 'right' ? 'justify-end text-right' : ''}`}>
    {align === 'right' && <div className="min-w-0"><div className="text-lg font-black text-white truncate">{team?.name ?? 'TBD'}</div><div className="text-xs text-slate-500">{team?.abbrev ?? ''}</div></div>}
    {team?.logoUrl ? <img src={team.logoUrl} className="w-16 h-16 object-contain shrink-0" alt={team.abbrev} referrerPolicy="no-referrer" /> : <div className="w-16 h-16 rounded-full border border-slate-700 bg-slate-800 shrink-0" />}
    {align === 'left' && <div className="min-w-0"><div className="text-lg font-black text-white truncate">{team?.name ?? 'TBD'}</div><div className="text-xs text-slate-500">{team?.abbrev ?? ''}</div></div>}
  </div>
);

const CompetitionGauge: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
    <div className="flex items-center justify-between text-sm">
      <span className="font-black text-white">{label}</span>
      <span className="font-black text-amber-300">{value}%</span>
    </div>
    <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-amber-300" style={{ width: `${Math.max(5, Math.min(100, value))}%` }} /></div>
  </div>
);
