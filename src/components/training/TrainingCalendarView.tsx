import React, { useMemo } from 'react';
import type { Allocations, DayType, ScheduleDay, TrainingParadigm } from '../../TeamTraining/types';
import type { NBATeam } from '../../types';
import { TrainingActivityIcon } from './TrainingActivityIcon';

type DailyPlan = { intensity: number; paradigm: TrainingParadigm; allocations: Allocations; auto?: boolean };

interface Props {
  team: NBATeam;
  scheduleByIso: Map<string | undefined, ScheduleDay>;
  dailyPlansISO: Record<string, DailyPlan>;
  /** Sunday of the week anchoring the visible 4-week (28-day) window. */
  weekAnchor: Date;
  setWeekAnchor: (d: Date) => void;
  selectedDate: string;
  currentDateISO: string;
  isReadOnly: boolean;
  onCellClick: (iso: string, scheduleDay: ScheduleDay | undefined) => void;
}

const VISIBLE_WEEKS = 4;
const VISIBLE_DAYS = VISIBLE_WEEKS * 7;

// Any plan ≤ this intensity reads as a Load Management day, regardless of the
// nominal paradigm. Mirrors real NBA load-management: a 15% Offensive plan is
// just an excuse-name for a recovery day. Threshold inclusive.
const LOAD_MGMT_INTENSITY_MAX = 20;
function isLoadManagement(plan?: { intensity?: number }): boolean {
  return !!plan && typeof plan.intensity === 'number' && plan.intensity <= LOAD_MGMT_INTENSITY_MAX;
}

function isValidDate(d: Date): boolean {
  return !isNaN(d.getTime());
}

/** Parse a YYYY-MM-DD string to a UTC Date, or fall back to *now* when the
 *  input is blank/invalid. Without this guard a single bad sim date cascades
 *  into Invalid Date everywhere — chevron comparisons return false, range
 *  formatter throws "Invalid time value", and the grid renders blank cells. */
function parseISOOrToday(iso: string): Date {
  const cleaned = (iso ?? '').slice(0, 10);
  if (cleaned) {
    const d = new Date(cleaned + 'T00:00:00Z');
    if (isValidDate(d)) return d;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfWeek(d: Date): Date {
  if (!isValidDate(d)) return parseISOOrToday('');
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() - out.getUTCDay()); // back up to Sunday
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function toISO(d: Date): string {
  if (!isValidDate(d)) return '';
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Activity → cell background + accent strip color. Auto-scheduled (no user plan).
const ACTIVITY_TINT: Record<DayType, { bg: string; strip: string; label: string }> = {
  'Game':                { bg: 'bg-rose-950/40 hover:bg-rose-900/60',           strip: 'bg-rose-500',     label: 'GAME' },
  // Shootaround retired from auto-schedule — kept for legacy persisted plans
  // and future pregame-routine feature. Renders like Light Practice (indigo).
  'Shootaround':         { bg: 'bg-indigo-950/30 hover:bg-indigo-900/50',       strip: 'bg-indigo-500',   label: 'LIGHT' },
  'Off Day':             { bg: 'bg-slate-900/40 hover:bg-slate-800/60',         strip: 'bg-slate-600',    label: 'REST' },
  'Recovery':            { bg: 'bg-violet-950/40 hover:bg-violet-900/50',       strip: 'bg-violet-500',   label: 'REC' },
  'Recovery Practice':   { bg: 'bg-violet-950/40 hover:bg-violet-900/50',       strip: 'bg-violet-500',   label: 'REC' },
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
  Recovery:   { bg: 'bg-violet-900/50 hover:bg-violet-800/70',   strip: 'bg-violet-400',  label: 'REC' },
};

function formatRangeLabel(anchor: Date): string {
  const last = addDays(anchor, VISIBLE_DAYS - 1);
  const aMonth = anchor.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const lMonth = last.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  if (aMonth === lMonth) {
    return `${aMonth} ${anchor.getUTCDate()}–${last.getUTCDate()} ${last.getUTCFullYear()}`.toUpperCase();
  }
  return `${aMonth} ${anchor.getUTCDate()} – ${lMonth} ${last.getUTCDate()} ${last.getUTCFullYear()}`.toUpperCase();
}

export const TrainingCalendarView: React.FC<Props> = ({
  team,
  scheduleByIso,
  dailyPlansISO,
  weekAnchor,
  setWeekAnchor,
  selectedDate,
  currentDateISO,
  isReadOnly,
  onCellClick,
}) => {
  const selectedISO = (selectedDate ?? '').slice(0, 10);

  const todayWeekStart = useMemo(
    () => startOfWeek(parseISOOrToday(currentDateISO)),
    [currentDateISO]
  );
  const safeAnchor = isValidDate(weekAnchor) ? weekAnchor : todayWeekStart;
  const goToday = () => { setWeekAnchor(todayWeekStart); };

  return (
    <div className="bg-black border border-slate-800 rounded-2xl overflow-hidden">
      {/* Range header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-slate-800 bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
          <button
            onClick={goToday}
            className="px-3 py-1.5 rounded-lg bg-[#FDB927]/10 border border-[#FDB927]/30 text-[#FDB927] hover:bg-[#FDB927]/20 transition-colors text-[10px] font-black uppercase tracking-widest"
          >
            Today
          </button>
        </div>

        <div className="text-right">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
            Training Schedule · 4 Weeks
          </div>
          <div className="text-base md:text-xl font-black uppercase tracking-tight text-white">
            {formatRangeLabel(safeAnchor)}
          </div>
        </div>
      </div>

      {/* Weekday header — desktop grid only */}
      <div className="hidden md:grid grid-cols-7 gap-2 px-4 pt-3 pb-2">
        {WEEKDAYS.map(d => (
          <div
            key={d}
            className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Mobile list — vertical day-by-day, big touch targets, TransactionsView pattern */}
      <div className="md:hidden divide-y divide-slate-800/60">
        {Array.from({ length: VISIBLE_DAYS }).map((_, i) => {
          const cellDate = addDays(safeAnchor, i);
          const iso = toISO(cellDate);
          const scheduleDay = scheduleByIso.get(iso);
          const userPlan = dailyPlansISO[iso];
          const activity: DayType = scheduleDay?.activity ?? 'Off Day';

          const isToday = iso === currentDateISO;
          const isSelected = iso === selectedISO;
          const isPast = iso < currentDateISO;

          const isGame = activity === 'Game';
          const loadMgmt = !isGame && isLoadManagement(userPlan);
          const tint = loadMgmt
            ? PARADIGM_TINT.Recovery
            : userPlan ? PARADIGM_TINT[userPlan.paradigm] : ACTIVITY_TINT[activity];
          const opponent = scheduleDay?.opponent;
          const lockEdit = (isReadOnly || isPast) && !isGame;

          const weekday = cellDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
          const monthDay = cellDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

          return (
            <button
              key={iso}
              onClick={() => onCellClick(iso, scheduleDay)}
              disabled={lockEdit}
              title={isPast && !isGame ? 'Past day — historical record' : undefined}
              className={`relative w-full flex items-center gap-3 px-3 py-3 text-left transition-colors ${tint.bg} ${
                isSelected ? 'ring-1 ring-inset ring-white' : ''
              } ${isToday ? 'ring-1 ring-inset ring-[#FDB927]' : ''} ${
                isPast && !userPlan ? 'opacity-60' : ''
              } ${lockEdit ? 'cursor-default' : 'cursor-pointer active:brightness-125'}`}
            >
              {/* Left accent strip */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${isToday ? 'bg-[#FDB927]' : tint.strip}`} />

              {/* Date column */}
              <div className="pl-2 w-14 shrink-0">
                <div className={`text-[9px] font-black uppercase tracking-widest ${isToday ? 'text-[#FDB927]' : 'text-slate-500'}`}>
                  {weekday}
                </div>
                <div className={`text-base font-black uppercase tracking-tight leading-tight ${isToday ? 'text-[#FDB927]' : 'text-white'}`}>
                  {monthDay}
                </div>
              </div>

              {/* Activity body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${tint.strip} bg-opacity-30 text-white/90`}>
                    {tint.label}
                  </span>
                  {isToday && (
                    <span className="text-[8px] font-black uppercase tracking-widest text-[#FDB927]">Today</span>
                  )}
                  {userPlan && !isGame && (
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/70">
                      {Math.round(userPlan.intensity)}%
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-300 font-medium truncate mt-0.5">
                  {isGame
                    ? (opponent?.abbrev === 'TBD'
                        ? 'vs TBD'
                        : `${opponent?.isHome ? 'vs' : '@'} ${opponent?.abbrev ?? ''}`)
                    : loadMgmt ? 'Load management — minimal load' : scheduleDay?.description ?? activity}
                </div>
              </div>

              {/* Right side — opponent logo or activity icon */}
              <div className="shrink-0 flex items-center justify-center w-10 h-10">
                {isGame ? (
                  opponent?.logoUrl ? (
                    <img
                      src={opponent.logoUrl}
                      alt={opponent.abbrev}
                      className="w-9 h-9 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-800/80 border border-slate-600 flex items-center justify-center text-rose-300 font-black text-sm">
                      ?
                    </div>
                  )
                ) : (
                  <TrainingActivityIcon
                    activity={activity}
                    paradigm={loadMgmt ? 'Recovery' : userPlan?.paradigm}
                    hasUserPlan={!!userPlan}
                    size={22}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day grid — desktop only — 4 weeks × 7 days, anchor-based, no leading blanks */}
      <div className="hidden md:grid grid-cols-7 gap-2 px-4 pb-4">
        {Array.from({ length: VISIBLE_DAYS }).map((_, i) => {
          const cellDate = addDays(safeAnchor, i);
          const iso = toISO(cellDate);
          const day = cellDate.getUTCDate();
          const scheduleDay = scheduleByIso.get(iso);
          const userPlan = dailyPlansISO[iso];
          const activity: DayType = scheduleDay?.activity ?? 'Off Day';

          const isToday = iso === currentDateISO;
          const isSelected = iso === selectedISO;
          const isPast = iso < currentDateISO;

          const isGame = activity === 'Game';
          const loadMgmt = !isGame && isLoadManagement(userPlan);
          const tint = loadMgmt
            ? PARADIGM_TINT.Recovery
            : userPlan ? PARADIGM_TINT[userPlan.paradigm] : ACTIVITY_TINT[activity];

          const opponent = scheduleDay?.opponent;

          const ringClasses = isToday
            ? 'ring-2 ring-[#FDB927] shadow-[0_0_16px_rgba(253,185,39,0.35)]'
            : isSelected
            ? 'ring-2 ring-white'
            : '';

          // Past days are historical record only — viewable but not editable.
          // Game cells stay clickable so the user can pop the day-view boxscore.
          const lockEdit = (isReadOnly || isPast) && !isGame;

          return (
            <button
              key={iso}
              onClick={() => onCellClick(iso, scheduleDay)}
              disabled={lockEdit}
              title={isPast && !isGame ? 'Past day — historical record' : undefined}
              className={`relative aspect-square min-h-[64px] md:min-h-[88px] p-1.5 md:p-2 rounded-lg border border-slate-800/60 ${tint.bg} ${ringClasses} transition-all duration-200 text-left flex flex-col overflow-hidden ${
                isPast && !userPlan ? 'opacity-60' : ''
              } ${lockEdit ? 'cursor-default' : 'cursor-pointer'}`}
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
                      {opponent?.abbrev === 'TBD' ? 'vs' : (opponent?.isHome ? 'vs' : '@')}
                    </span>
                    {opponent?.logoUrl ? (
                      <img
                        src={opponent.logoUrl}
                        alt={opponent.abbrev}
                        className="w-7 h-7 md:w-9 md:h-9 object-contain drop-shadow-lg"
                        referrerPolicy="no-referrer"
                      />
                    ) : opponent?.abbrev === 'TBD' ? (
                      // Playoff anticipation — opponent not locked yet (e.g.
                      // 7–10 seed waiting on play-in result). Generic disc with
                      // "?" stands in for the NBA logo placeholder pattern from
                      // the 2K14 reference.
                      <div
                        className="w-7 h-7 md:w-9 md:h-9 rounded-full bg-slate-800/80 border border-slate-600 flex items-center justify-center text-rose-300 font-black text-sm md:text-base"
                        title="Opponent not locked yet — pending play-in / lower-seed result"
                      >
                        ?
                      </div>
                    ) : (
                      <span className="text-[10px] md:text-sm font-black text-white tracking-tight">
                        {opponent?.abbrev ?? 'TBD'}
                      </span>
                    )}
                  </div>
                ) : (
                  <TrainingActivityIcon
                    activity={activity}
                    paradigm={loadMgmt ? 'Recovery' : userPlan?.paradigm}
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

      {/* Legend strip */}
      <div className="border-t border-slate-800 bg-[#0a0a0a] px-4 md:px-6 py-3 flex flex-wrap gap-x-4 gap-y-2 items-center">
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-600">Legend</span>
        {[
          { label: 'Game',     color: 'bg-rose-500' },
          { label: 'Practice', color: 'bg-sky-500' },
          { label: 'Recovery', color: 'bg-violet-500' },
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
