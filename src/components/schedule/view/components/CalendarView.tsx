import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Game } from '../../../../types';
import { normalizeDate } from '../../../../utils/helpers';

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

  const isEarliestMonth = year === 2025 && month === 7; // August 2025
  const isLatestMonth = year > 2026 || (year === 2026 && month >= 5); // June 2026

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
          
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`;
            const dateNorm = normalizeDate(dateStr);
            const stateDateNorm = normalizeDate(state.date);
            const isToday = dateNorm === stateDateNorm;
            const isSelected = dateNorm === normalizeDate(selectedDate);

            const games = state.schedule.filter(g => normalizeDate(g.date) === dateNorm);
            const dateObj = new Date(dateStr);
            const highlighted = getHighlightedEvent(dateObj);

            const isAllStarWeekend = games.some(g => g.isAllStar || g.isRisingStars || (g as any).isCelebrity);

            return (
              <button
                key={day}
                onClick={() => {
                  setSelectedDate(dateStr);
                  setViewMode('day');
                }}
                className={`
                  relative aspect-square p-1 md:p-2 rounded-lg border transition-all flex flex-col items-start group
                  ${isToday ? 'bg-emerald-500/10 border-emerald-500/30' :
                    isSelected ? 'bg-white/10 border-white/20' :
                    isAllStarWeekend ? 'bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/20 hover:border-amber-500/40' :
                    'bg-white/[0.03] border-white/[0.05] hover:bg-white/[0.08] hover:border-white/10'}
                `}
              >
                <span className={`text-xs md:text-lg font-black ${isToday ? 'text-emerald-400' : isSelected ? 'text-white' : isAllStarWeekend ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                  {day}
                </span>

                {isAllStarWeekend && (
                  <img
                    src="https://content.sportslogos.net/logos/6/980/full/4585__nba_all-star_game-secondary-2021.png"
                    alt="All-Star"
                    className="hidden md:block absolute top-1 right-1 w-5 h-5 object-contain opacity-80"
                  />
                )}

                {!isAllStarWeekend && highlighted && (
                  <div className={`hidden md:block absolute top-1 right-1 text-[8px] font-black uppercase tracking-tighter ${highlighted.color}`}>
                    {highlighted.icon}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap gap-0.5">
                  {games.slice(0, 4).map(g => (
                    <div
                      key={g.gid}
                      className={`w-1 h-1 rounded-full ${getDotColor(g)}`}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
