import React, { useMemo } from 'react';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import type { LeagueCalendar, LeagueCalendarDate } from '../../../../types';
import { leagueCalendarDateString, validateLeagueCalendar } from '../../../../services/leagueCalendar';

type CalendarDateKey =
  | 'scheduleRelease'
  | 'freeAgencyStart'
  | 'draftDate'
  | 'nonGuaranteedGuaranteeDate'
  | 'playoffEligibilityDeadline'
  | 'trainingCampStart'
  | 'preseasonStart'
  | 'preseasonEnd'
  | 'regularSeasonStart'
  | 'cupStart'
  | 'cupFinal'
  | 'allStarStart'
  | 'allStarGame'
  | 'allStarEnd'
  | 'summerLeagueStart'
  | 'summerLeagueEnd'
  | 'regularSeasonEnd'
  | 'playInStart'
  | 'playoffStart'
  | 'rollover';

interface SeasonCalendarSectionProps {
  calendar: LeagueCalendar;
  onChange: (calendar: LeagueCalendar) => void;
  seasonYear: number;
  gamesPerSeason: number;
  playInEnabled: boolean;
  cupEnabled: boolean;
  allStarEnabled: boolean;
  summerLeagueEnabled: boolean;
}

const fromIsoDate = (value: string, seasonYear: number): LeagueCalendarDate | undefined => {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return undefined;
  return { month, day, yearOffset: Math.min(1, Math.max(-1, year - seasonYear)) };
};

const DateField: React.FC<{
  label: string;
  value?: LeagueCalendarDate;
  seasonYear: number;
  required?: boolean;
  onChange: (value?: LeagueCalendarDate) => void;
}> = ({ label, value, seasonYear, required = false, onChange }) => (
  <label className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-700/70 bg-slate-950/70 p-3">
    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
    <input
      type="date"
      required={required}
      min={`${seasonYear - 1}-01-01`}
      max={`${seasonYear + 1}-12-31`}
      value={value ? leagueCalendarDateString(seasonYear, value) : ''}
      onChange={event => onChange(fromIsoDate(event.target.value, seasonYear))}
      className="min-h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-white outline-none focus:border-indigo-500"
    />
  </label>
);

const NumberField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, onChange }) => (
  <label className="flex flex-col gap-2 rounded-xl border border-slate-700/70 bg-slate-950/70 p-3">
    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={event => onChange(Math.min(max, Math.max(min, Math.round(Number(event.target.value) || 0))))}
      className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-center font-mono text-sm text-white outline-none focus:border-indigo-500"
    />
  </label>
);

export const SeasonCalendarSection: React.FC<SeasonCalendarSectionProps> = ({
  calendar,
  onChange,
  seasonYear,
  gamesPerSeason,
  playInEnabled,
  cupEnabled,
  allStarEnabled,
  summerLeagueEnabled,
}) => {
  const validation = useMemo(() => validateLeagueCalendar(calendar, seasonYear, gamesPerSeason, {
    playInEnabled,
    cupEnabled,
    allStarEnabled,
    summerLeagueEnabled,
  }), [allStarEnabled, calendar, cupEnabled, gamesPerSeason, playInEnabled, seasonYear, summerLeagueEnabled]);

  const setDate = (key: CalendarDateKey, value?: LeagueCalendarDate) => {
    if (!value && ['regularSeasonStart', 'regularSeasonEnd', 'playInStart', 'playoffStart', 'rollover'].includes(key)) return;
    onChange({ ...calendar, [key]: value });
  };

  const addBreak = () => {
    const index = (calendar.seasonBreaks ?? []).length + 1;
    const start = calendar.allStarEnd ?? calendar.allStarGame ?? calendar.regularSeasonStart;
    onChange({
      ...calendar,
      seasonBreaks: [...(calendar.seasonBreaks ?? []), {
        id: `league-break-${Date.now()}`,
        name: `League Break ${index}`,
        start,
        end: start,
        seasonYears: [seasonYear],
      }],
    });
  };

  return (
    <section className="space-y-5 rounded-2xl border border-slate-800/50 bg-slate-800/40 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-200">
            <CalendarDays size={15} className="text-indigo-400" /> Season Calendar
          </div>
          <p className="mt-1 text-[10px] font-medium text-slate-500">
            Dates repeat each season and move automatically with the league year.
          </p>
        </div>
        <div className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${validation.valid ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-rose-500/30 bg-rose-500/5 text-rose-300'}`}>
          {validation.valid
            ? `${gamesPerSeason} games fit in the ${validation.regularSeasonWindowDays}-day window`
            : 'Calendar needs changes before it can be saved'}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-700/70 bg-slate-950/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Offseason Order</p>
          <p className="mt-1 text-[9px] text-slate-600">Choose which event must occur first.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...calendar, draftBeforeFreeAgency: true })}
            className={`min-h-10 rounded-lg border px-3 text-[10px] font-black uppercase ${calendar.draftBeforeFreeAgency !== false ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100' : 'border-slate-700 bg-slate-900 text-slate-500'}`}
          >
            Draft, then FA
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...calendar, draftBeforeFreeAgency: false })}
            className={`min-h-10 rounded-lg border px-3 text-[10px] font-black uppercase ${calendar.draftBeforeFreeAgency === false ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100' : 'border-slate-700 bg-slate-900 text-slate-500'}`}
          >
            FA, then Draft
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <DateField label="Schedule Release" value={calendar.scheduleRelease} seasonYear={seasonYear} onChange={value => setDate('scheduleRelease', value)} />
        <DateField label="Free Agency Opens" value={calendar.freeAgencyStart} seasonYear={seasonYear} onChange={value => setDate('freeAgencyStart', value)} />
        <DateField label="Draft" value={calendar.draftDate} seasonYear={seasonYear} onChange={value => setDate('draftDate', value)} />
        <DateField label="Non-Guaranteed Guarantee Deadline" value={calendar.nonGuaranteedGuaranteeDate ?? undefined} seasonYear={seasonYear} onChange={value => onChange({ ...calendar, nonGuaranteedGuaranteeDate: value ?? null })} />
        <DateField label="Playoff Eligibility Deadline" value={calendar.playoffEligibilityDeadline ?? undefined} seasonYear={seasonYear} onChange={value => onChange({ ...calendar, playoffEligibilityDeadline: value ?? null })} />
        <DateField label="Training Camp" value={calendar.trainingCampStart} seasonYear={seasonYear} onChange={value => setDate('trainingCampStart', value)} />
        <DateField label="Preseason Opens" value={calendar.preseasonStart} seasonYear={seasonYear} onChange={value => setDate('preseasonStart', value)} />
        <DateField label="Preseason Ends" value={calendar.preseasonEnd} seasonYear={seasonYear} onChange={value => setDate('preseasonEnd', value)} />
        <DateField label="Opening Day" value={calendar.regularSeasonStart} seasonYear={seasonYear} required onChange={value => setDate('regularSeasonStart', value)} />
        {cupEnabled && <DateField label="Cup Window Opens" value={calendar.cupStart} seasonYear={seasonYear} onChange={value => setDate('cupStart', value)} />}
        {cupEnabled && <DateField label="Cup Final" value={calendar.cupFinal} seasonYear={seasonYear} onChange={value => setDate('cupFinal', value)} />}
        {allStarEnabled && <DateField label="All-Star Break Opens" value={calendar.allStarStart} seasonYear={seasonYear} onChange={value => setDate('allStarStart', value)} />}
        {allStarEnabled && <DateField label="All-Star Game" value={calendar.allStarGame} seasonYear={seasonYear} onChange={value => setDate('allStarGame', value)} />}
        {allStarEnabled && <DateField label="All-Star Break Ends" value={calendar.allStarEnd} seasonYear={seasonYear} onChange={value => setDate('allStarEnd', value)} />}
        <DateField label="Regular Season Ends" value={calendar.regularSeasonEnd} seasonYear={seasonYear} required onChange={value => setDate('regularSeasonEnd', value)} />
        {playInEnabled && <DateField label="Play-In Opens" value={calendar.playInStart} seasonYear={seasonYear} required onChange={value => setDate('playInStart', value)} />}
        <DateField label="Playoffs Open" value={calendar.playoffStart} seasonYear={seasonYear} required onChange={value => setDate('playoffStart', value)} />
        <DateField label="Next Season Begins" value={calendar.rollover} seasonYear={seasonYear} required onChange={value => setDate('rollover', value)} />
        {summerLeagueEnabled && <DateField label="Summer League Opens" value={calendar.summerLeagueStart} seasonYear={seasonYear} onChange={value => setDate('summerLeagueStart', value)} />}
        {summerLeagueEnabled && <DateField label="Summer League Ends" value={calendar.summerLeagueEnd} seasonYear={seasonYear} onChange={value => setDate('summerLeagueEnd', value)} />}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NumberField label="Postseason Closing Days" value={calendar.rolloverGraceDays ?? 7} min={0} max={30} onChange={value => onChange({ ...calendar, rolloverGraceDays: value })} />
        <NumberField label="Rest Days Between Games" value={calendar.minimumRestDaysBetweenGames ?? 0} min={0} max={7} onChange={value => onChange({ ...calendar, minimumRestDaysBetweenGames: value })} />
        <NumberField label="Event Buffer Days" value={calendar.eventBufferDays ?? 2} min={0} max={14} onChange={value => onChange({ ...calendar, eventBufferDays: value })} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">League Breaks</p>
            <p className="mt-1 text-[9px] text-slate-600">Olympics, World Cups, or other pauses inside the regular season.</p>
          </div>
          <button type="button" onClick={addBreak} className="flex min-h-10 items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 text-[10px] font-black uppercase text-indigo-200">
            <Plus size={14} /> Add Break
          </button>
        </div>
        {(calendar.seasonBreaks ?? []).map((leagueBreak, index) => (
          <div key={leagueBreak.id} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Break Name</span>
              <input
                value={leagueBreak.name}
                onChange={event => onChange({
                  ...calendar,
                  seasonBreaks: (calendar.seasonBreaks ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item),
                })}
                className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-white outline-none focus:border-indigo-500"
              />
            </label>
            <DateField label="Starts" value={leagueBreak.start} seasonYear={seasonYear} required onChange={value => value && onChange({
              ...calendar,
              seasonBreaks: (calendar.seasonBreaks ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, start: value } : item),
            })} />
            <DateField label="Ends" value={leagueBreak.end} seasonYear={seasonYear} required onChange={value => value && onChange({
              ...calendar,
              seasonBreaks: (calendar.seasonBreaks ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, end: value } : item),
            })} />
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Season Years</span>
              <input
                key={`${leagueBreak.id}-${leagueBreak.seasonYears?.join('-') ?? 'all'}`}
                inputMode="numeric"
                placeholder="Blank = every season"
                defaultValue={leagueBreak.seasonYears?.join(', ') ?? ''}
                onBlur={event => onChange({
                  ...calendar,
                  seasonBreaks: (calendar.seasonBreaks ?? []).map((item, itemIndex) => itemIndex === index
                    ? {
                        ...item,
                        seasonYears: event.target.value.trim()
                          ? event.target.value.split(',').map(Number).filter(Number.isFinite).map(Math.round)
                          : undefined,
                      }
                    : item),
                })}
                className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-white outline-none focus:border-indigo-500"
              />
            </label>
            <button
              type="button"
              aria-label={`Remove ${leagueBreak.name}`}
              onClick={() => onChange({ ...calendar, seasonBreaks: (calendar.seasonBreaks ?? []).filter((_, itemIndex) => itemIndex !== index) })}
              className="flex min-h-10 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 text-rose-300 xl:self-end"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {!validation.valid && (
        <div className="space-y-1 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-xs font-semibold text-rose-200">
          {validation.errors.map(error => <p key={error}>{error}</p>)}
        </div>
      )}
    </section>
  );
};
