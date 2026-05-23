import React from 'react';
import { Award, BookOpen, Clipboard, Clock, DollarSign, Globe, Shuffle, Star, Timer, Trophy, Zap } from 'lucide-react';
import { Game, NBATeam } from '../../../../types';
import { normalizeDate, getOwnTeamId } from '../../../../utils/helpers';
import { getAllStarWeekendDates } from '../../../../services/allStar/AllStarWeekendOrchestrator';
import { resolveAnyTeam } from '../../../../utils/teamLookup';

interface CalendarMonthGridProps {
  year: number;
  month: number;
  firstDay: number;
  daysInMonth: number;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  setViewMode: (mode: 'calendar' | 'day' | 'watching') => void;
  state: any;
  focusTeamId?: number | null;
  visibleSchedule: Game[];
  euroIsolated: boolean;
  noDraft: boolean;
  finalsGameIds: Set<number>;
  tradeDeadlineStr: string;
  faStartStr: string;
  faMoratoriumEndStr: string;
  draftLotteryStr: string;
  combineStartStr: string;
  combineEndStr: string;
  draftDayStr: string;
  draftBlockedByPlayoffs: boolean;
  trainingCampStr: string;
  getDotColor: (g: Game) => string;
  getHighlightedEvent: (date: Date) => { label: string; color: string; icon: string } | null;
  onDateClick?: (args: { date: string; dateObj: Date; games: Game[]; focusTeamGame?: Game }) => boolean | void;
  renderDayOverlay?: (args: { date: string; dateObj: Date; games: Game[]; focusTeamGame?: Game }) => React.ReactNode;
}

export const CalendarMonthGrid: React.FC<CalendarMonthGridProps> = ({
  year,
  month,
  firstDay,
  daysInMonth,
  selectedDate,
  setSelectedDate,
  setViewMode,
  state,
  focusTeamId,
  visibleSchedule,
  euroIsolated,
  noDraft,
  finalsGameIds,
  tradeDeadlineStr,
  faStartStr,
  faMoratoriumEndStr,
  draftLotteryStr,
  combineStartStr,
  combineEndStr,
  draftDayStr,
  draftBlockedByPlayoffs,
  trainingCampStr,
  getDotColor,
  getHighlightedEvent,
  onDateClick,
  renderDayOverlay,
}) => {
  const ownTid = getOwnTeamId(state);
  const gmTid = focusTeamId !== undefined ? focusTeamId : ownTid;
  const resolveTeam = (tid: number): NBATeam | null => resolveAnyTeam(tid, state.teams ?? [], state.nonNBATeams ?? []);
  const allStarDateSet = new Set<string>();
  const addWeekend = (targetYear: number) => {
    try {
      const dates = getAllStarWeekendDates(targetYear);
      [dates.risingStars, dates.saturday, dates.allStarGame].forEach(date => {
        allStarDateSet.add(normalizeDate(date.toISOString()));
      });
    } catch {}
  };
  addWeekend(year);
  addWeekend(year + 1);

  return (
    <div className={`grid grid-cols-7 ${euroIsolated ? 'gap-px bg-slate-800' : 'gap-1 md:gap-2'}`}>
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
        <div key={day} className={euroIsolated ? 'bg-slate-950/95 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest py-3' : 'text-center text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2'}>{day}</div>
      ))}

      {Array.from({ length: firstDay }).map((_, i) => (
        <div key={`empty-${i}`} className={euroIsolated ? 'aspect-square bg-slate-950/70' : 'aspect-square bg-white/[0.02] rounded-lg border border-white/[0.02]'} />
      ))}

      {Array.from({ length: daysInMonth }).map((_, i) => {
        const day = i + 1;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`;
        const dateNorm = normalizeDate(dateStr);
        const stateDateNorm = normalizeDate(state.date);
        const isToday = dateNorm === stateDateNorm;
        const isSelected = dateNorm === normalizeDate(selectedDate);
        const games = visibleSchedule.filter((g: Game) => normalizeDate(g.date) === dateNorm);
        const dateObj = new Date(dateStr);
        const highlighted = getHighlightedEvent(dateObj);
        const isAllStarGame = (g: Game) => g.isAllStar || g.isRisingStars || g.isCelebrityGame || g.isDunkContest || g.isThreePointContest;
        const isAllStarWeekend = !euroIsolated && (games.some(isAllStarGame) || allStarDateSet.has(dateNorm));
        const hasPlayoff = games.some((g: Game) => g.isPlayoff);
        const hasPlayIn = games.some((g: Game) => g.isPlayIn);
        const hasFinals = games.some((g: Game) => g.isPlayoff && finalsGameIds.has(g.gid));
        const hasPreseason = games.some((g: Game) => g.isPreseason && !g.isExhibition);
        const hasExhibition = games.some((g: Game) => g.isExhibition);
        const hasCupFinal = games.some((g: Game) => (g as any).isNBACup && (g as any).nbaCupRound === 'Final');
        const hasCupKO = games.some((g: Game) => (g as any).isNBACup && ((g as any).nbaCupRound === 'QF' || (g as any).nbaCupRound === 'SF'));
        const hasCupGroup = games.some((g: Game) => (g as any).isNBACup && (g as any).nbaCupRound === 'group');
        const hasCupTBD = games.some((g: Game) => (g as any).isCupTBD);
        const calMonth1 = month + 1;
        const inPlayInWindow = calMonth1 === 4 && day >= 15 && day <= 18;
        const inPlayoffWindow = (calMonth1 === 4 && day >= 19) || calMonth1 === 5 || (calMonth1 === 6 && day <= 22);
        const showPlayIn = !euroIsolated && state.leagueStats?.playIn !== false && (hasPlayIn || inPlayInWindow);
        const showPlayoff = !euroIsolated && (hasPlayoff || inPlayoffWindow);
        const showNbaCalendarEvents = state.leagueStats?.uiMode !== 'euro_isolated' && state.leagueStats?.uiMode !== 'pba_isolated';
        const isTradeDeadline = !euroIsolated && dateNorm === tradeDeadlineStr;
        const isDraftLottery = showNbaCalendarEvents && !noDraft && dateNorm === draftLotteryStr;
        const inCombineWindow = showNbaCalendarEvents && !noDraft && dateNorm >= combineStartStr && dateNorm <= combineEndStr;
        const isDraft = showNbaCalendarEvents && !noDraft && dateNorm === draftDayStr && !draftBlockedByPlayoffs;
        const isFAMoratorium = showNbaCalendarEvents && dateNorm === faStartStr;
        const isFAOpen = showNbaCalendarEvents && dateNorm === faMoratoriumEndStr;
        const isTrainingCamp = dateNorm === trainingCampStr;
        const userGame: Game | undefined = gmTid !== null
          ? games.find((g: Game) => !isAllStarGame(g) && !(g as any).isCupTBD && (g.homeTid === gmTid || g.awayTid === gmTid))
          : undefined;
        const isUserScrimmage = !!userGame && userGame.homeTid === userGame.awayTid;
        const isUserHome = !!userGame && !isUserScrimmage && userGame.homeTid === gmTid;
        const opponentTid = userGame && !isUserScrimmage ? (isUserHome ? userGame.awayTid : userGame.homeTid) : -1;
        const opponent = opponentTid >= 0 ? resolveTeam(opponentTid) : undefined;
        const userTeam = gmTid !== null ? resolveTeam(gmTid) : undefined;
        const userPlayed = !!userGame && userGame.played;
        const userScore = userGame ? (isUserHome ? userGame.homeScore : userGame.awayScore) : 0;
        const oppScore = userGame ? (isUserHome ? userGame.awayScore : userGame.homeScore) : 0;
        const userWon = userPlayed && !isUserScrimmage && userScore > oppScore;
        const isUserFinals = !!userGame?.isPlayoff && finalsGameIds.has(userGame.gid);
        const isUserPreseason = !!userGame?.isPreseason && !isUserScrimmage;
        const featureCompetitionGame = euroIsolated ? games.find((g: Game) => !!g.competitionId && !(g as any).isCupTBD) : undefined;
        const featureAway = featureCompetitionGame ? resolveTeam(featureCompetitionGame.awayTid) : null;
        const featureHome = featureCompetitionGame ? resolveTeam(featureCompetitionGame.homeTid) : null;
        const hasKeyLeagueEvent = isTradeDeadline || isDraftLottery || inCombineWindow || isDraft || isFAMoratorium || isFAOpen || isTrainingCamp;
        const hasRichGM = gmTid !== null && !!userGame && !isAllStarWeekend && !hasKeyLeagueEvent;
        const isUserPlayoff = hasRichGM && !!userGame?.isPlayoff && !isUserFinals;
        const isUserPlayIn = hasRichGM && !!userGame?.isPlayIn;
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
            <span className={`relative z-10 text-xs md:text-lg font-black ${dayColor}`}>{day}</span>

            {isAllStarWeekend && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Star size={28} className="text-amber-300/70 md:w-8 md:h-8" fill="currentColor" strokeWidth={1} />
              </div>
            )}

            {isAllStarWeekend && games.filter(isAllStarGame).length > 1 && (
              <span className="absolute bottom-1 left-1 right-1 mx-auto w-fit px-1.5 py-0.5 rounded-full bg-amber-500/90 text-black text-[8px] md:text-[9px] font-black uppercase tracking-widest pointer-events-none">
                {games.filter(isAllStarGame).length} games
              </span>
            )}

            {!isAllStarWeekend && !hasRichGM && hasFinals && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Trophy size={24} className="md:w-7 md:h-7 text-yellow-300/65" strokeWidth={1.5} fill="currentColor" />
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !hasFinals && showPlayoff && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Trophy size={24} className={`md:w-7 md:h-7 ${hasPlayoff ? 'text-amber-300/55' : 'text-amber-300/25'}`} strokeWidth={1.5} />
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !showPlayoff && showPlayIn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Award size={26} className={`md:w-7 md:h-7 ${hasPlayIn ? 'text-violet-200/70' : 'text-violet-200/30'}`} strokeWidth={1.5} />
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !hasFinals && !showPlayoff && !showPlayIn && hasCupFinal && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <Trophy size={22} className="md:w-7 md:h-7 text-amber-300/80" strokeWidth={1.5} fill="currentColor" />
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-amber-300/80">Cup Final</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !hasFinals && !showPlayoff && !showPlayIn && !hasCupFinal && hasCupKO && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <Trophy size={20} className="md:w-6 md:h-6 text-orange-300/70" strokeWidth={1.5} />
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-orange-300/70">Cup KO</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !hasFinals && !showPlayoff && !showPlayIn && !hasCupFinal && !hasCupKO && hasCupGroup && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <span className="text-[16px] md:text-[20px] opacity-50">🏆</span>
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-orange-300/70">Cup Night</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !hasFinals && !showPlayoff && !showPlayIn && !hasCupFinal && !hasCupKO && !hasCupGroup && hasCupTBD && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <Trophy size={20} className="md:w-6 md:h-6 text-amber-300/40" strokeWidth={1.5} />
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-amber-300/50">Cup TBD</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !hasCupFinal && !hasCupKO && !hasCupGroup && isTradeDeadline && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <Clock size={20} className="md:w-6 md:h-6 text-orange-300/75" strokeWidth={1.5} />
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-orange-300/70">Deadline</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && isDraftLottery && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <Shuffle size={20} className="md:w-6 md:h-6 text-purple-300/75" strokeWidth={1.5} />
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-purple-300/70">Lottery</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && inCombineWindow && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <Clipboard size={20} className="md:w-6 md:h-6 text-teal-300/75" strokeWidth={1.5} />
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-teal-300/70">Combine</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && isDraft && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <BookOpen size={20} className="md:w-6 md:h-6 text-blue-300/75" strokeWidth={1.5} />
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-blue-300/70">Draft</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && !isDraft && isFAMoratorium && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <Timer size={20} className="md:w-6 md:h-6 text-yellow-300/75" strokeWidth={1.5} />
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-yellow-300/70">FA Opens</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && !isDraft && !isFAMoratorium && isFAOpen && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <DollarSign size={20} className="md:w-6 md:h-6 text-emerald-300/75" strokeWidth={1.5} />
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-emerald-300/70">Signings</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && !isDraft && !isFAMoratorium && !isFAOpen && isTrainingCamp && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <Zap size={20} className="md:w-6 md:h-6 text-orange-300/75" strokeWidth={1.5} />
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-orange-300/70">Camp</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && !isDraft && !isFAMoratorium && !isFAOpen && !isTrainingCamp && hasPreseason && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <span className="text-[16px] md:text-[20px] opacity-50">🏀</span>
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-slate-400/70">Preseason</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && !isDraft && !isFAMoratorium && !isFAOpen && !isTrainingCamp && !hasPreseason && hasExhibition && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                <Globe size={20} className="md:w-6 md:h-6 text-purple-300/75" strokeWidth={1.5} />
                <span className="hidden md:block text-[7px] font-black uppercase tracking-widest text-purple-300/70">Global</span>
              </div>
            )}

            {!isAllStarWeekend && !hasRichGM && !showPlayoff && !showPlayIn && !isTradeDeadline && !isDraftLottery && !inCombineWindow && !isDraft && !isFAMoratorium && !isFAOpen && !isTrainingCamp && !hasPreseason && !hasExhibition && highlighted && (
              <div className={`hidden md:block absolute top-1 right-1 text-[8px] font-black uppercase tracking-tighter ${highlighted.color}`}>
                {highlighted.icon}
              </div>
            )}

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
                <span className="absolute top-1 right-1 text-[7px] font-black uppercase tracking-widest text-neutral-400">SCR</span>
                {userPlayed && (
                  <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
                    <span className="text-[8px] md:text-[10px] font-bold text-white/70 tabular-nums">{userScore}-{oppScore}</span>
                  </div>
                )}
              </>
            )}

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
                <span className="hidden md:block absolute top-1 right-1 text-[7px] font-black uppercase tracking-widest text-white/60">
                  {isUserHome ? 'vs' : '@'}
                </span>
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
                  <span className="absolute top-1 right-1 md:right-auto md:left-1 text-[7px] font-black uppercase tracking-widest text-slate-400">PRE</span>
                )}
                {userPlayed && (
                  <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 flex items-center justify-between bg-black/55 backdrop-blur-[2px]">
                    <span className={`text-[8px] md:text-[10px] font-black ${userWon ? 'text-emerald-400' : 'text-rose-400'}`}>{userWon ? 'W' : 'L'}</span>
                    <span className="text-[8px] md:text-[10px] font-bold text-white/90 tabular-nums">{userScore}-{oppScore}</span>
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

            {!hasRichGM && (
              <div className="mt-auto flex flex-wrap gap-0.5">
                {games.slice(0, 4).map((g: Game) => (
                  <div key={g.gid} className={`w-1 h-1 rounded-full ${getDotColor(g)}`} />
                ))}
              </div>
            )}

            {renderDayOverlay?.({ date: dateNorm, dateObj, games, focusTeamGame: userGame })}
          </button>
        );
      })}
    </div>
  );
};
