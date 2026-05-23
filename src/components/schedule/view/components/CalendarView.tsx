import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Game } from '../../../../types';
import { getOwnTeamId } from '../../../../utils/helpers';
import {
  getTradeDeadlineDate, getCurrentOffseasonEffectiveFAStart, getCurrentOffseasonFAMoratoriumEnd,
  getDraftLotteryDate, getDraftDate, getDraftCombineStartDate, getDraftCombineEndDate,
  getTrainingCampDate, isDraftBlockedByUnresolvedPlayoffs, toISODateString,
} from '../../../../utils/dateUtils';
import { isNoDraftLeague } from '../../../../services/offseason/offseasonState';
import { isEuroIsolatedMode } from '../../../../utils/uiMode';
import { isEuroVisibleScheduleGame } from '../../../../utils/euroLeagueDefaults';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { CompetitionDetailPanel } from './CompetitionDetailPanel';

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
  useEffect(() => {
    setActiveTab('Calendar');
  }, [state.saveId, state.leagueStats?.uiMode]);

  const visibleSchedule = euroIsolated
    ? (state.schedule ?? []).filter((g: Game) => isEuroVisibleScheduleGame(state, g))
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
  const monthPicker = (
    <div className={euroIsolated ? 'flex items-center gap-2 bg-slate-950/80 p-1 rounded-xl border border-slate-800' : 'flex items-center gap-2 bg-[#111] p-1 rounded-xl border border-white/5'}>
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
  );

  return (
    <div className={`flex-1 flex flex-col p-4 md:p-6 ${euroIsolated ? 'bg-slate-950 text-white' : 'bg-[#0a0a0a]'}`}>
      <div className={euroIsolated ? 'w-full max-w-[1680px] mx-auto space-y-5' : 'w-full'}>
        {euroIsolated ? (
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
        ) : (
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">{title}</h1>
              <p className="text-slate-500 font-medium mt-1 text-[10px] md:text-sm">Current Date: {formatDateDisplay(state.date)}</p>
            </div>
            {monthPicker}
          </div>
        )}

        <div className={euroIsolated ? 'rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden' : ''}>
          {euroIsolated && (
          <div className="px-4 pt-3 border-b border-slate-800">
            <div className="flex gap-3 overflow-x-auto">
              {['Overview', 'Calendar', 'Endesa', 'EuroLeague', 'Copa del Rey', 'Supercopa', 'All Fixtures'].map(tab => (
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
          )}

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
          {euroIsolated && (
          <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800">
          {monthPicker}
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
          )}

        <CalendarMonthGrid
          year={year}
          month={month}
          firstDay={firstDay}
          daysInMonth={daysInMonth}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          setViewMode={setViewMode}
          state={state}
          focusTeamId={focusTeamId}
          visibleSchedule={visibleSchedule}
          euroIsolated={euroIsolated}
          noDraft={noDraft}
          finalsGameIds={finalsGameIds}
          tradeDeadlineStr={tradeDeadlineStr}
          faStartStr={faStartStr}
          faMoratoriumEndStr={faMoratoriumEndStr}
          draftLotteryStr={draftLotteryStr}
          combineStartStr={combineStartStr}
          combineEndStr={combineEndStr}
          draftDayStr={draftDayStr}
          draftBlockedByPlayoffs={draftBlockedByPlayoffs}
          trainingCampStr={trainingCampStr}
          getDotColor={getDotColor}
          getHighlightedEvent={getHighlightedEvent}
          onDateClick={onDateClick}
          renderDayOverlay={renderDayOverlay}
        />
            </>
          )}
      </div>
    </div>
    </div>
  );
};
