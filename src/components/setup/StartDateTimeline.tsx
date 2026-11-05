import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  getKeyDates, getPbaKeyDates, getEuroKeyDates,
  EURO_TIMELINE_MIN, EURO_TIMELINE_MAX, EURO_TIMELINE_DISPLAY_END,
  ZONE_COLORS, ZONE_LABELS, PBA_ZONE_COLORS, PBA_ZONE_LABELS, EURO_ZONE_COLORS, EURO_ZONE_LABELS,
  DateZone, PbaDateZone, KeyDate,
  getPbaDateContext, getPbaSeasonLabel,
} from './keyDates';
import { getAllStarWeekendStartDate, toISODateString } from '../../utils/dateUtils';
import { getPlayableInternationalWindowForSeason } from '../../services/fiba/tournamentWindows';
import { playModdedSetupSound } from './moddedSetupAudio';
import type { ModdedLeagueBase } from '../../types';

interface StartDateTimelineProps {
  onSelect: (date: string) => void;
  onBack: () => void;
  leagueType?: 'fictional' | 'modded';
  moddedLeagueBase?: ModdedLeagueBase;
  seasonEndYear?: number;
}

// ─── Date math helpers ────────────────────────────────────────────────────
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);

const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
};

// ─── Layout constants ─────────────────────────────────────────────────────
const TRACK_WIDTH = 1600;

// NBA-specific zone segments
const getNbaZoneSegments = (seasonEndYear: number, timelineStart: string): { start: string; end: string; zone: DateZone }[] => {
  const startYear = seasonEndYear - 1;
  const allStarStart = toISODateString(getAllStarWeekendStartDate(seasonEndYear));
  const allStarEnd = addDays(allStarStart, 3);
  return [
    { start: timelineStart, end: `${startYear}-10-23`, zone: 'offseason' },
    { start: `${startYear}-10-24`, end: `${seasonEndYear}-01-13`, zone: 'early' },
    { start: `${seasonEndYear}-01-14`, end: addDays(allStarStart, -1), zone: 'mid' },
    { start: allStarStart, end: allStarEnd, zone: 'allstar' },
    { start: addDays(allStarEnd, 1), end: `${seasonEndYear}-04-15`, zone: 'late' },
    { start: `${seasonEndYear}-04-16`, end: `${seasonEndYear}-07-10`, zone: 'late' },
  ];
};

const EURO_ZONE_SEGMENTS = [
  { start: '2025-07-01', end: '2025-08-31', zone: 'transfer' },
  { start: '2025-09-01', end: '2025-09-27', zone: 'preseason' },
  { start: '2025-09-28', end: '2026-02-12', zone: 'endesa' },
  { start: '2025-10-01', end: '2026-04-17', zone: 'euroleague' },
  { start: '2026-02-13', end: '2026-02-16', zone: 'cup' },
  { start: '2026-04-18', end: '2026-06-28', zone: 'postseason' },
  { start: '2026-06-29', end: EURO_TIMELINE_DISPLAY_END, zone: 'offseason' },
] as const;

// NBA month ticks
const getNbaMonthTicks = (seasonEndYear: number): { date: string; label: string }[] => {
  const startYear = seasonEndYear - 1;
  return [
    { date: `${startYear}-08-01`, label: 'AUG' }, { date: `${startYear}-09-01`, label: 'SEP' },
    { date: `${startYear}-10-01`, label: 'OCT' }, { date: `${startYear}-11-01`, label: 'NOV' },
    { date: `${startYear}-12-01`, label: 'DEC' }, { date: `${seasonEndYear}-01-01`, label: 'JAN' },
    { date: `${seasonEndYear}-02-01`, label: 'FEB' }, { date: `${seasonEndYear}-03-01`, label: 'MAR' },
    { date: `${seasonEndYear}-04-01`, label: 'APR' }, { date: `${seasonEndYear}-05-01`, label: 'MAY' },
    { date: `${seasonEndYear}-06-01`, label: 'JUN' }, { date: `${seasonEndYear}-07-01`, label: 'JUL' },
  ];
};

const EURO_MONTH_TICKS: { date: string; label: string }[] = [
  { date: '2025-07-01', label: 'JUL' }, { date: '2025-08-01', label: 'AUG' },
  { date: '2025-09-01', label: 'SEP' }, { date: '2025-10-01', label: 'OCT' },
  { date: '2025-11-01', label: 'NOV' }, { date: '2025-12-01', label: 'DEC' },
  { date: '2026-01-01', label: 'JAN' }, { date: '2026-02-01', label: 'FEB' },
  { date: '2026-03-01', label: 'MAR' }, { date: '2026-04-01', label: 'APR' },
  { date: '2026-05-01', label: 'MAY' }, { date: '2026-06-01', label: 'JUN' },
  { date: '2026-07-01', label: 'JUL' },
];

export const StartDateTimeline: React.FC<StartDateTimelineProps> = ({ onSelect, onBack, leagueType, moddedLeagueBase, seasonEndYear = 2026 }) => {
  const isModded = leagueType === 'modded';
  const isPba = moddedLeagueBase === 'philippines';
  const isEuro = moddedLeagueBase === 'europe';
  const internationalWindow = !isPba && !isEuro && leagueType === 'modded'
    ? getPlayableInternationalWindowForSeason(seasonEndYear - 1)
    : undefined;
  const pbaKeyDates = useMemo(() => getPbaKeyDates(seasonEndYear), [seasonEndYear]);
  const pbaMin = pbaKeyDates[0]?.date ?? `${seasonEndYear - 1}-10-05`;
  const pbaAwards = pbaKeyDates[pbaKeyDates.length - 1]?.date ?? `${seasonEndYear}-10-01`;
  const pbaAllStar = pbaKeyDates.find(item => item.zone === 'allstar')?.date ?? pbaMin;
  const pbaCommissioners = pbaKeyDates.find(item => item.zone === 'commissionersCup')?.date ?? pbaAllStar;
  const pbaGovernors = pbaKeyDates.find(item => item.zone === 'governorsCup')?.date ?? pbaCommissioners;
  const pbaCupStarts = useMemo(() => [
    { date: pbaMin, label: 'Philippine Cup', copy: 'Begin with the season-opening All-Filipino conference.' },
    { date: pbaCommissioners, label: "Commissioner's Cup", copy: 'Begin on opening day of the first import conference.' },
    { date: pbaGovernors, label: "Governors' Cup", copy: 'Begin on opening day of the height-restricted import conference.' },
  ], [pbaCommissioners, pbaGovernors, pbaMin]);
  const nbaBaseStart = `${seasonEndYear - 1}-08-06`;
  const nbaTimelineStart = internationalWindow?.markerDate && internationalWindow.markerDate < nbaBaseStart
    ? internationalWindow.markerDate
    : nbaBaseStart;
  const tlMin = isEuro ? EURO_TIMELINE_MIN : isPba ? pbaMin : nbaTimelineStart;
  const tlMax = isEuro ? EURO_TIMELINE_MAX : isPba ? pbaAwards : `${seasonEndYear}-06-29`;
  const tlDisplayEnd = isEuro ? EURO_TIMELINE_DISPLAY_END : isPba ? addDays(pbaAwards, 3) : `${seasonEndYear}-07-10`;
  const zoneSegments = isEuro
    ? EURO_ZONE_SEGMENTS
    : isPba
      ? [
          { start: pbaMin, end: addDays(pbaAllStar, -1), zone: 'philippineCup' as PbaDateZone },
          { start: pbaAllStar, end: addDays(pbaCommissioners, -1), zone: 'allstar' as PbaDateZone },
          { start: pbaCommissioners, end: addDays(pbaGovernors, -1), zone: 'commissionersCup' as PbaDateZone },
          { start: pbaGovernors, end: addDays(pbaAwards, -1), zone: 'governorsCup' as PbaDateZone },
          { start: pbaAwards, end: addDays(pbaAwards, 3), zone: 'offseason' as PbaDateZone },
        ]
      : getNbaZoneSegments(seasonEndYear, nbaTimelineStart);
  const pbaMonthTicks = useMemo(() => {
    const ticks: Array<{ date: string; label: string }> = [];
    const cursor = new Date(`${pbaMin.slice(0, 7)}-01T00:00:00Z`);
    const end = new Date(`${addDays(pbaAwards, 3).slice(0, 7)}-01T00:00:00Z`);
    while (cursor <= end) {
      ticks.push({ date: cursor.toISOString().slice(0, 10), label: cursor.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase() });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return ticks;
  }, [pbaAwards, pbaMin]);
  const monthTicks = isEuro
    ? EURO_MONTH_TICKS
    : isPba
      ? pbaMonthTicks
      : getNbaMonthTicks(seasonEndYear);
  const zoneColors: Record<string, string> = isEuro ? EURO_ZONE_COLORS : isPba ? PBA_ZONE_COLORS : ZONE_COLORS;
  const zoneLabels: Record<string, string> = isEuro ? EURO_ZONE_LABELS : isPba ? PBA_ZONE_LABELS : ZONE_LABELS;

  const trackTotalDays = useMemo(() => daysBetween(tlMin, tlDisplayEnd), [tlMin, tlDisplayEnd]);
  const dateToX = useCallback((iso: string): number =>
    Math.round((daysBetween(tlMin, iso) / trackTotalDays) * TRACK_WIDTH), [tlMin, trackTotalDays]);

  const keyDates = useMemo(() => isEuro
    ? getEuroKeyDates()
    : isPba
      ? pbaKeyDates
      : getKeyDates(leagueType, seasonEndYear), [isEuro, isPba, leagueType, seasonEndYear]);
  const displayMarkers = useMemo(() => {
    const unique = keyDates.filter((kd, i, arr) =>
      arr.findIndex(k => k.date === kd.date && k.label === kd.label) === i
    );
    if (!isPba) return unique;
    const openingDates = new Set(pbaCupStarts.map(choice => choice.date));
    return unique.filter((marker, index, markers) =>
      openingDates.has(marker.date)
      && !marker.placeholder
      && markers.findIndex(candidate => candidate.date === marker.date && !candidate.placeholder) === index
    );
  }, [isPba, keyDates, pbaCupStarts]);
  const [selectedDate, setSelectedDate] = useState<string>(tlMin);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const allStarStart = useMemo(() => toISODateString(getAllStarWeekendStartDate(seasonEndYear)), [seasonEndYear]);
  const allStarEnd = useMemo(() => addDays(allStarStart, 3), [allStarStart]);

  const applyDate = useCallback((raw: string) => {
    const clamped = raw < tlMin ? tlMin : raw > tlMax ? tlMax : raw;
    if (isPba) {
      const selected = pbaCupStarts.reduce((closest, choice) => {
        const choiceDistance = Math.abs(new Date(`${choice.date}T00:00:00Z`).getTime() - new Date(`${clamped}T00:00:00Z`).getTime());
        const closestDistance = Math.abs(new Date(`${closest.date}T00:00:00Z`).getTime() - new Date(`${clamped}T00:00:00Z`).getTime());
        return choiceDistance < closestDistance ? choice : closest;
      });
      setSelectedDate(selected.date);
    } else if (!isEuro && clamped >= allStarStart && clamped <= allStarEnd) {
      setSelectedDate(allStarStart);
    } else {
      setSelectedDate(clamped);
    }
  }, [allStarEnd, allStarStart, tlMin, tlMax, isPba, isEuro, pbaCupStarts]);

  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const xRel = e.clientX - rect.left;
    const fraction = xRel / rect.width;
    const dayOffset = Math.round(fraction * trackTotalDays);
    const clicked = addDays(tlMin, dayOffset);
    if (clicked > tlMax) return;
    applyDate(clicked);
  }, [applyDate, trackTotalDays, tlMin, tlMax]);

  const handleMarkerClick = useCallback((kd: KeyDate) => {
    if (kd.locked || kd.placeholder) return;
    applyDate(kd.date);
  }, [applyDate]);

  const daysSkipped = daysBetween(tlMin, selectedDate);
  const estSeconds = Math.max(1, Math.ceil(daysSkipped / 25));
  const isDay1 = selectedDate === tlMin;
  const pbaDateContext = isPba ? getPbaDateContext(selectedDate) : null;
  const pbaSeasonLabel = isPba ? getPbaSeasonLabel(selectedDate) : null;
  const pbaTimelineSeasonLabel = isPba ? getPbaSeasonLabel(pbaMin) : null;

  const selectedX = dateToX(selectedDate);
  const selectedAccentColor = displayMarkers.find(kd => kd.date === selectedDate && !kd.locked && !kd.placeholder)?.accentColor;

  return (
    <div className={`${isModded ? 'modded-setup modded-scanlines bg-[#07090e]' : 'bg-slate-950'} min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden`}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative z-10 w-full max-w-5xl">

        {/* Header */}
        <div className="text-center mb-8">
          <h2 className={`${isModded ? 'modded-font-sport text-yellow-400 italic uppercase' : 'text-white'} text-3xl font-black tracking-tight mb-2`}>
            Choose Your Start Date
          </h2>
          <p className="text-slate-400 text-sm">
            {isEuro
              ? 'Pick any date across the Euro offseason, domestic season, cups, and playoffs. Everything before it is simulated automatically.'
              : isPba
              ? `Choose which ${pbaTimelineSeasonLabel} PBA conference opens your career. You start on that conference's first day without simulating the earlier cups.`
              : internationalWindow
              ? `Pick any date through the ${internationalWindow.label} window. Everything before it gets simulated automatically.`
              : 'Pick any date from the offseason to the end of the regular season. Everything before it gets simulated automatically.'}
          </p>
        </div>

        {/* Timeline scroll container */}
        <div className={`relative overflow-x-auto mb-6 custom-scrollbar ${isModded ? 'rounded-xl border-2 border-blue-600 bg-[#0b1021] shadow-[0_0_36px_rgba(37,99,235,0.2)]' : 'rounded-2xl border border-slate-800 bg-slate-900/60'}`}>
          {/* Inner track area */}
          <div
            ref={trackRef}
            onClick={handleTrackClick}
            className="relative cursor-crosshair select-none"
            style={{ width: `${TRACK_WIDTH}px`, height: '220px' }}
          >
            {/* Zone segment backgrounds */}
            {zoneSegments.map((seg, i) => {
              const x1 = dateToX(seg.start);
              const x2 = dateToX(seg.end);
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 opacity-20"
                  style={{ left: x1, width: x2 - x1, background: zoneColors[seg.zone] }}
                />
              );
            })}

            {internationalWindow && (
              <div
                className="pointer-events-none absolute inset-y-0 border-x border-emerald-400/30 bg-emerald-400/10"
                style={{
                  left: dateToX(internationalWindow.markerDate),
                  width: dateToX(internationalWindow.tournamentEndDate) - dateToX(internationalWindow.markerDate),
                }}
              />
            )}

            {/* Colored track bar */}
            <div className="absolute" style={{ top: '105px', left: 0, right: 0, height: '6px' }}>
              {zoneSegments.map((seg, i) => {
                const x1 = dateToX(seg.start);
                const x2 = dateToX(seg.end);
                return (
                  <div
                    key={i}
                    className="absolute h-full"
                    style={{ left: x1, width: x2 - x1, background: zoneColors[seg.zone] }}
                  />
                );
              })}
              {internationalWindow && (
                <div
                  className="absolute h-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]"
                  style={{
                    left: dateToX(internationalWindow.markerDate),
                    width: dateToX(internationalWindow.tournamentEndDate) - dateToX(internationalWindow.markerDate),
                  }}
                />
              )}
            </div>

            {/* Selected date thumb */}
            <div
              className="absolute pointer-events-none"
              style={{ left: selectedX - 1, top: 0, bottom: 0, width: '2px', background: selectedAccentColor ?? '#fff', zIndex: 20 }}
            >
              {/* Dot */}
              <div
                className="absolute w-4 h-4 rounded-full border-2 border-slate-900 shadow-lg"
                style={{ top: '97px', left: '-7px', background: selectedAccentColor ?? '#fff' }}
              />
              {/* Date label above */}
              <div className="absolute px-2 py-1 bg-white text-black text-[10px] font-black rounded-md whitespace-nowrap shadow-lg"
                style={{ top: isPba ? '58px' : '68px', left: '-30px', transform: 'translateX(-50%)', minWidth: isPba ? '112px' : '80px', textAlign: 'center' }}>
                <div>{formatDate(selectedDate)}</div>
                {pbaSeasonLabel && <div className="text-[8px] text-amber-700 leading-none mt-0.5">{pbaSeasonLabel} season</div>}
              </div>
            </div>

            {/* Month ticks */}
            {monthTicks.map(mt => {
              const x = dateToX(mt.date);
              if (x < 0 || x > TRACK_WIDTH) return null;
              return (
                <div key={mt.date} className="absolute pointer-events-none" style={{ left: x, top: '118px' }}>
                  <div className="w-px h-2 bg-slate-700" />
                  <div className="text-[8px] text-slate-600 font-bold uppercase" style={{ marginLeft: '-10px' }}>
                    {mt.label}
                  </div>
                </div>
              );
            })}

            {/* Zone labels */}
            {zoneSegments.map((seg, i) => {
              const x1 = dateToX(seg.start);
              const x2 = dateToX(seg.end);
              const cx = (x1 + x2) / 2;
              if (x2 - x1 < 30) return null;
              return (
                <div
                  key={i}
                  className="absolute text-[8px] font-black uppercase tracking-widest pointer-events-none"
                  style={{
                    left: cx,
                    top: '156px',
                    transform: 'translateX(-50%)',
                    color: zoneColors[seg.zone],
                    opacity: 0.8,
                  }}
                >
                  {zoneLabels[seg.zone]}
                </div>
              );
            })}

            {/* Key date markers */}
            {displayMarkers.map((kd, i) => {
              const x = dateToX(kd.date);
              const isLocked = !!kd.locked;
              const isPlaceholder = !!kd.placeholder;
              const isInactive = isLocked || isPlaceholder;
              const isSelected = kd.date === selectedDate && !isInactive;
              const markerColor = kd.accentColor ?? zoneColors[kd.zone] ?? '#475569';

              // Alternate label rows to reduce overlap: even above, odd below
              const labelAbove = i % 2 === 0;

              return (
                <div
                  key={`${kd.date}-${kd.label}`}
                  className={`absolute ${isInactive ? 'pointer-events-none' : 'cursor-pointer'}`}
                  style={{ left: x, top: 0, bottom: 0, zIndex: 10 }}
                  onClick={e => { e.stopPropagation(); handleMarkerClick(kd); }}
                  onMouseEnter={e => {
                    if (isPlaceholder && kd.placeholderLabel) {
                      setTooltip({ x: e.clientX, y: e.clientY, text: kd.placeholderLabel });
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {/* Vertical line */}
                  <div
                    className="absolute w-px"
                    style={{
                      left: 0,
                      top: labelAbove ? '32px' : '54px',
                      height: labelAbove ? '68px' : '48px',
                      background: isLocked ? '#1e293b' : isPlaceholder ? '#334155' : isSelected && !kd.accentColor ? '#fff' : markerColor,
                    }}
                  />
                  {/* Dot */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      left: '-4px',
                      top: '102px',
                      width: '8px',
                      height: '8px',
                      background: isLocked ? '#1e293b' : isPlaceholder ? '#334155' : isSelected && !kd.accentColor ? '#fff' : markerColor,
                      border: isPlaceholder ? '1px dashed #64748b' : isSelected ? `2px solid ${markerColor}` : `1px solid ${markerColor}`,
                      opacity: isLocked ? 0.3 : isPlaceholder ? 0.5 : 1,
                    }}
                  />
                  {/* Label */}
                  {labelAbove ? (
                    <div
                      className="absolute text-center"
                      style={{ top: '4px', left: '-28px', width: '56px', opacity: isLocked ? 0.25 : isPlaceholder ? 0.45 : 1 }}
                    >
                      <div style={{ fontSize: '10px' }}>{kd.icon}</div>
                      <div className="text-[8px] font-bold leading-tight" style={{ color: kd.accentColor ?? '#cbd5e1' }}>{kd.label}</div>
                    </div>
                  ) : (
                    <div
                      className="absolute text-center"
                      style={{ top: '118px', left: '-28px', width: '56px', opacity: isLocked ? 0.25 : isPlaceholder ? 0.45 : 1 }}
                    >
                      <div style={{ fontSize: '10px' }}>{kd.icon}</div>
                      <div className="text-[8px] font-bold leading-tight" style={{ color: kd.accentColor ?? '#cbd5e1' }}>{kd.label}</div>
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        </div>

        {isPba && (
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {pbaCupStarts.map(choice => {
              const selected = choice.date === selectedDate;
              return (
                <button
                  type="button"
                  key={choice.date}
                  onClick={() => setSelectedDate(choice.date)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? 'border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-950/30'
                      : 'border-slate-700 bg-slate-900/50 hover:border-slate-500'
                  }`}
                >
                  <div className={`text-sm font-black ${selected ? 'text-amber-200' : 'text-white'}`}>{choice.label}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">{choice.copy}</div>
                  <div className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {formatDate(choice.date)}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {internationalWindow && (
          <div className="mb-5 flex justify-center">
            <button
              onClick={() => applyDate(internationalWindow.markerDate)}
              className={`flex w-full max-w-xl flex-col items-start justify-between gap-1 rounded-xl border px-4 py-3 text-left transition-colors sm:flex-row sm:items-center sm:gap-4 ${
                selectedDate === internationalWindow.markerDate
                  ? 'border-emerald-400 bg-emerald-500/15'
                  : 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10'
              }`}
            >
              <span className="font-black text-white">🌍 {internationalWindow.label}</span>
              <span className="text-xs font-bold text-emerald-300 sm:shrink-0">
                Land {formatDate(internationalWindow.markerDate)} →
              </span>
            </button>
          </div>
        )}

        {/* Summary */}
        <div className="text-center mb-6">
          {isPba ? (
            <p className="text-slate-400 text-sm">
              Starting directly on <span className="font-bold text-white">{formatDate(selectedDate)}</span>
              {pbaDateContext && <span> · <span className="font-bold text-amber-300">{pbaDateContext}</span></span>}
              {' · '}No earlier conference is simulated
            </p>
          ) : isDay1 ? (
            <p className="text-slate-400 text-sm">
              <span className="text-emerald-400 font-bold">Starting from Day 1</span> — no simulation needed
              {pbaDateContext && <span> · <span className="text-amber-300 font-bold">{pbaDateContext}</span></span>}
            </p>
          ) : (
            <p className="text-slate-400 text-sm">
              Selected: <span className="text-white font-bold">{formatDate(selectedDate)}</span>
              {pbaDateContext && (
                <>
                  {' · '}
                  <span className="text-amber-300 font-bold">{pbaDateContext}</span>
                </>
              )}
              {' · '}
              Skipping <span className="text-indigo-400 font-bold">{daysSkipped} days</span>
              {' · '}
              ~{Math.round(daysSkipped * 1.2)} games simmed
              {' · '}
              ~{estSeconds}s to load
            </p>
          )}
        </div>

        {/* Date input + buttons */}
        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
          <button
            onClick={() => {
              if (isModded) playModdedSetupSound('back');
              onBack();
            }}
            className="px-5 py-2.5 text-slate-400 hover:text-white text-sm font-bold transition-colors"
          >
            ← Back
          </button>

          <div className="flex flex-1 items-center gap-2">
            {isPba ? (
              <select
                value={selectedDate}
                onChange={event => setSelectedDate(event.target.value)}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-white outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
              >
                {pbaCupStarts.map(choice => (
                  <option key={choice.date} value={choice.date}>{choice.label} · {formatDate(choice.date)}</option>
                ))}
              </select>
            ) : (
              <input
                type="date"
                value={selectedDate}
                min={tlMin}
                max={tlMax}
                onChange={e => applyDate(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm font-mono focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none"
              />
            )}
          </div>

          <button
            onClick={() => {
              if (isModded) playModdedSetupSound('success');
              onSelect(selectedDate);
            }}
            className={`${isModded ? 'modded-font-sport rounded-lg border border-blue-400/50 bg-gradient-to-r from-blue-700 to-indigo-900 italic shadow-[0_0_24px_rgba(37,99,235,0.28)] hover:from-blue-600 hover:to-indigo-800' : 'rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/20 hover:bg-indigo-500'} px-6 py-2.5 text-white text-sm font-black transition-all flex items-center gap-2`}
          >
            Continue →
          </button>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-[10px] text-slate-300 pointer-events-none shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
};
