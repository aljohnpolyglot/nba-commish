import React, { useMemo, useState } from 'react';
import { CalendarOff, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Allocations, DayType, ScheduleDay, TrainingParadigm } from '../../TeamTraining/types';
import type { NBATeam } from '../../types';
import { TrainingActivityIcon } from './TrainingActivityIcon';

type DailyPlan = { intensity: number; paradigm: TrainingParadigm; allocations: Allocations; auto?: boolean };

interface Props {
  team: NBATeam;
  scheduleByIso: Map<string | undefined, ScheduleDay>;
  dailyPlansISO: Record<string, DailyPlan>;
  calendarMonth: Date;
  setCalendarMonth: (d: Date) => void;
  selectedDate: string;
  currentDateISO: string;
  isReadOnly: boolean;
  onCellClick: (iso: string, scheduleDay: ScheduleDay | undefined) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Activity → cell background + accent strip color. Auto-scheduled (no user plan).
const ACTIVITY_TINT: Record<DayType, { bg: string; strip: string; label: string }> = {
  'Game':                { bg: 'bg-rose-950/40 hover:bg-rose-900/60',           strip: 'bg-rose-500',     label: 'GAME' },
  'Shootaround':         { bg: 'bg-amber-950/30 hover:bg-amber-900/50',         strip: 'bg-amber-500',    label: 'SHOOT' },
  'Off Day':             { bg: 'bg-slate-900/40 hover:bg-slate-800/60',         strip: 'bg-slate-600',    label: 'REST' },
  'Recovery':            { bg: 'bg-emerald-950/30 hover:bg-emerald-900/50',     strip: 'bg-emerald-500',  label: 'REC' },
  'Recovery Practice':   { bg: 'bg-emerald-950/30 hover:bg-emerald-900/50',     strip: 'bg-emerald-500',  label: 'REC' },
  'Light Practice':      { bg: 'bg-indigo-950/30 hover:bg-indigo-900/50',       strip: 'bg-indigo-500',   label: 'LIGHT' },
  'Balanced Practice':   { bg: 'bg-sky-950/30 hover:bg-sky-900/50',             strip: 'bg-sky-500',      label: 'BAL' },
  'Structured Practice': { bg: 'bg-purple-950/30 hover:bg-purple-900/50',       strip: 'bg-purple-500',   label: 'STR' },
  'Full Training':       { bg: 'bg-orange-950/30 hover:bg-orange-900/50',       strip: 'bg-orange-500',   label: 'FULL' },
};

// User-set paradigm → cell background + accent strip color. Stronger saturation
// so user overrides visually outweigh auto-scheduled defaults.
const PARADIGM_TINT: Record<TrainingParadigm, { bg: string; strip: string; label: string }> = {
  Balanced:   { bg: 'bg-sky-900/50 hover:bg-sky-800/70',         strip: 'bg-sky-400',     label: 'BAL' },
  Offensive:  { bg: 'bg-rose-900/50 hover:bg-rose-800/70',       strip: 'bg-rose-400',    label: 'OFF' },
  Defensive:  { bg: 'bg-indigo-900/50 hover:bg-indigo-800/70',   strip: 'bg-indigo-400',  label: 'DEF' },
  Biometrics: { bg: 'bg-purple-900/50 hover:bg-purple-800/70',   strip: 'bg-purple-400',  label: 'BIO' },
  Recovery:   { bg: 'bg-emerald-900/50 hover:bg-emerald-800/70', strip: 'bg-emerald-400', label: 'REC' },
};

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
}

export const TrainingCalendarView: React.FC<Props> = ({
  team,
  scheduleByIso,
  dailyPlansISO,
  calendarMonth,
  setCalendarMonth,
  selectedDate,
  currentDateISO,
  isReadOnly,
  onCellClick,
}) => {
  const { year, month, daysInMonth, leadingBlanks } = useMemo(() => {
    const d = new Date(calendarMonth);
    const y = d.getFullYear();
    const m = d.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const firstWeekday = new Date(y, m, 1).getDay();
    return { year: y, month: m, daysInMonth: days, leadingBlanks: firstWeekday };
  }, [calendarMonth]);

  const selectedISO = (selectedDate ?? '').slice(0, 10);

  // Schedule release window — real NBA training schedules are typically only
  // released ~1 month ahead. Anything beyond that we render as "not yet released"
  // unless the user explicitly opts in to project. Prevents the "every cell is
  // off-day" wall when navigating Dec → June etc.
  const isFarFuture = useMemo(() => {
    const today = new Date(currentDateISO + 'T00:00:00Z');
    const todayKey = today.getUTCFullYear() * 12 + today.getUTCMonth();
    const calKey = year * 12 + month;
    return calKey - todayKey > 1;
  }, [currentDateISO, year, month]);
  const [forceShow, setForceShow] = useState(false);
  const showGrid = !isFarFuture || forceShow;

  const goPrev = () => { setForceShow(false); setCalendarMonth(new Date(year, month - 1, 1)); };
  const goNext = () => { setForceShow(false); setCalendarMonth(new Date(year, month + 1, 1)); };
  const goToday = () => {
    setForceShow(false);
    const today = new Date(currentDateISO + 'T00:00:00Z');
    setCalendarMonth(new Date(today.getUTCFullYear(), today.getUTCMonth(), 1));
  };

  return (
    <div className="bg-black border border-slate-800 rounded-2xl overflow-hidden">
      {/* Month header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-slate-800 bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={goNext}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={goToday}
            className="ml-1 px-3 py-1.5 rounded-lg bg-[#FDB927]/10 border border-[#FDB927]/30 text-[#FDB927] hover:bg-[#FDB927]/20 transition-colors text-[10px] font-black uppercase tracking-widest"
          >
            Today
          </button>
        </div>

        <div className="text-right">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
            Training Calendar
          </div>
          <div className="text-base md:text-xl font-black uppercase tracking-tight text-white">
            {formatMonthLabel(calendarMonth)}
          </div>
        </div>
      </div>

      {/* Far-future empty state — schedule not yet released. */}
      {!showGrid && (
        <div className="px-6 md:px-10 py-12 md:py-16 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-slate-900/60 border border-slate-800 mb-4">
            <CalendarOff size={24} className="text-slate-500" />
          </div>
          <h3 className="text-base md:text-lg font-black uppercase tracking-tight text-white mb-2">
            Schedule Not Yet Released
          </h3>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest max-w-md mx-auto leading-relaxed">
            {formatMonthLabel(calendarMonth)} is more than a month out. Real schedules drop ~30 days ahead — opponents and game days aren't locked.
          </p>
          <button
            onClick={() => setForceShow(true)}
            className="mt-6 px-4 py-2 rounded-lg bg-[#FDB927]/10 border border-[#FDB927]/30 text-[#FDB927] hover:bg-[#FDB927]/20 transition-colors text-[10px] font-black uppercase tracking-widest"
          >
            Project Anyway
          </button>
        </div>
      )}

      {showGrid && (
        <>
      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 md:gap-2 px-2 md:px-4 pt-3 pb-2">
        {WEEKDAYS.map(d => (
          <div
            key={d}
            className="text-center text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1 md:gap-2 px-2 md:px-4 pb-4">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} className="aspect-square" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const scheduleDay = scheduleByIso.get(iso);
          const userPlan = dailyPlansISO[iso];
          const activity: DayType = scheduleDay?.activity ?? 'Off Day';

          const isToday = iso === currentDateISO;
          const isSelected = iso === selectedISO;
          const isPast = iso < currentDateISO;

          const tint = userPlan
            ? PARADIGM_TINT[userPlan.paradigm]
            : ACTIVITY_TINT[activity];

          const isGame = activity === 'Game';
          const opponent = scheduleDay?.opponent;

          const ringClasses = isToday
            ? 'ring-2 ring-[#FDB927] shadow-[0_0_16px_rgba(253,185,39,0.35)]'
            : isSelected
            ? 'ring-2 ring-white'
            : '';

          return (
            <button
              key={iso}
              onClick={() => onCellClick(iso, scheduleDay)}
              disabled={isReadOnly && !isGame}
              className={`relative aspect-square min-h-[64px] md:min-h-[88px] p-1.5 md:p-2 rounded-lg border border-slate-800/60 ${tint.bg} ${ringClasses} transition-all duration-200 text-left flex flex-col overflow-hidden ${
                isPast && !userPlan ? 'opacity-60' : ''
              } ${isReadOnly && !isGame ? 'cursor-default' : 'cursor-pointer'}`}
            >
              {/* Left accent strip — yellow on today for stronger anchoring */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${isToday ? 'bg-[#FDB927]' : tint.strip} ${isToday ? '' : 'opacity-80'}`} />

              {/* Today badge — corner ribbon */}
              {isToday && (
                <div className="absolute -top-1 -right-1 z-20 px-1.5 py-0.5 rounded-md bg-[#FDB927] text-black text-[7px] font-black uppercase tracking-widest shadow-lg">
                  Today
                </div>
              )}

              {/* Date — top-left */}
              <div className="flex items-start justify-between gap-1 relative z-10">
                <div className="pl-1.5">
                  <div className={`text-[10px] md:text-xs font-black uppercase tracking-tight ${
                    isToday ? 'text-[#FDB927]' : 'text-white'
                  }`}>
                    {day}
                  </div>
                </div>
                {/* Tiny activity label, hidden on small viewports to keep cells uncluttered */}
                {!isToday && (
                  <span className="hidden md:inline text-[7px] font-black uppercase tracking-widest text-slate-500/80 mt-0.5">
                    {tint.label}
                  </span>
                )}
              </div>

              {/* Illustration — center-right */}
              <div className="flex-1 flex items-center justify-center relative z-10">
                {isGame ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest text-rose-300/80">
                      {opponent?.isHome ? 'vs' : '@'}
                    </span>
                    {opponent?.logoUrl ? (
                      <img
                        src={opponent.logoUrl}
                        alt={opponent.abbrev}
                        className="w-7 h-7 md:w-9 md:h-9 object-contain drop-shadow-lg"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-[10px] md:text-sm font-black text-white tracking-tight">
                        {opponent?.abbrev ?? 'TBD'}
                      </span>
                    )}
                  </div>
                ) : (
                  <TrainingActivityIcon
                    activity={activity}
                    paradigm={userPlan?.paradigm}
                    hasUserPlan={!!userPlan}
                    size={28}
                  />
                )}
              </div>

              {/* Plan badge — bottom-right when user-set */}
              {userPlan && !isGame && (
                <div className="flex items-center justify-end relative z-10">
                  <span className={`text-[7px] md:text-[8px] font-black uppercase tracking-widest text-white/80 px-1 py-0.5 rounded ${tint.strip} bg-opacity-30`}>
                    {tint.label} · {Math.round(userPlan.intensity)}%
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
        </>
      )}

      {/* Legend strip */}
      <div className="border-t border-slate-800 bg-[#0a0a0a] px-4 md:px-6 py-3 flex flex-wrap gap-x-4 gap-y-2 items-center">
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-600">Legend</span>
        {[
          { label: 'Game',     color: 'bg-rose-500' },
          { label: 'Practice', color: 'bg-sky-500' },
          { label: 'Recovery', color: 'bg-emerald-500' },
          { label: 'Off Day',  color: 'bg-slate-600' },
          { label: 'Set Plan', color: 'bg-orange-500' },
        ].map(item => (
          <span key={item.label} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <span className={`w-2 h-2 rounded-sm ${item.color}`} />
            {item.label}
          </span>
        ))}
        <span className="ml-auto text-[9px] text-slate-600 font-bold uppercase tracking-widest">
          {team.abbrev} · {Object.keys(dailyPlansISO).length} plans set
        </span>
      </div>
    </div>
  );
};
