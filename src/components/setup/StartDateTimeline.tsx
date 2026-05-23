import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  getKeyDates, getPbaKeyDates, getEuroKeyDates,
  TIMELINE_MIN, TIMELINE_MAX, TIMELINE_DISPLAY_END,
  PBA_TIMELINE_MIN, PBA_TIMELINE_MAX, PBA_TIMELINE_DISPLAY_END,
  EURO_TIMELINE_MIN, EURO_TIMELINE_MAX, EURO_TIMELINE_DISPLAY_END,
  ZONE_COLORS, ZONE_LABELS, PBA_ZONE_COLORS, PBA_ZONE_LABELS, EURO_ZONE_COLORS, EURO_ZONE_LABELS,
  DateZone, PbaDateZone, KeyDate,
} from './keyDates';

const INPUT_MAX = '2035-09-30';

interface StartDateTimelineProps {
  onSelect: (date: string) => void;
  onBack: () => void;
  leagueType?: 'fictional' | 'modded';
  moddedLeagueBase?: 'nba' | 'europe' | 'philippines';
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
const NBA_ZONE_SEGMENTS: { start: string; end: string; zone: DateZone }[] = [
  { start: '2025-08-06', end: '2025-10-23', zone: 'offseason' },
  { start: '2025-10-24', end: '2026-01-13', zone: 'early' },
  { start: '2026-01-14', end: '2026-02-12', zone: 'mid' },
  { start: '2026-02-13', end: '2026-02-16', zone: 'allstar' },
  { start: '2026-02-17', end: '2026-04-15', zone: 'late' },
  { start: '2026-04-16', end: TIMELINE_DISPLAY_END, zone: 'late' },
];

// PBA-specific zone segments — 3 conferences spanning ~15 months
const PBA_ZONE_SEGMENTS: { start: string; end: string; zone: PbaDateZone }[] = [
  { start: '2025-10-05', end: '2026-02-28', zone: 'philippineCup' },
  { start: '2026-03-01', end: '2026-03-10', zone: 'allstar' },
  { start: '2026-03-11', end: '2026-08-31', zone: 'commissionersCup' },
  { start: '2026-09-01', end: '2026-12-28', zone: 'governorsCup' },
];

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
const NBA_MONTH_TICKS: { date: string; label: string }[] = [
  { date: '2025-08-01', label: 'AUG' }, { date: '2025-09-01', label: 'SEP' },
  { date: '2025-10-01', label: 'OCT' }, { date: '2025-11-01', label: 'NOV' },
  { date: '2025-12-01', label: 'DEC' }, { date: '2026-01-01', label: 'JAN' },
  { date: '2026-02-01', label: 'FEB' }, { date: '2026-03-01', label: 'MAR' },
  { date: '2026-04-01', label: 'APR' }, { date: '2026-05-01', label: 'MAY' },
  { date: '2026-06-01', label: 'JUN' }, { date: '2026-07-01', label: 'JUL' },
];

// PBA month ticks — Oct 2025 through Jan 2027
const PBA_MONTH_TICKS: { date: string; label: string }[] = [
  { date: '2025-10-01', label: 'OCT' }, { date: '2025-11-01', label: 'NOV' },
  { date: '2025-12-01', label: 'DEC' }, { date: '2026-01-01', label: 'JAN' },
  { date: '2026-02-01', label: 'FEB' }, { date: '2026-03-01', label: 'MAR' },
  { date: '2026-04-01', label: 'APR' }, { date: '2026-05-01', label: 'MAY' },
  { date: '2026-06-01', label: 'JUN' }, { date: '2026-07-01', label: 'JUL' },
  { date: '2026-08-01', label: 'AUG' }, { date: '2026-09-01', label: 'SEP' },
  { date: '2026-10-01', label: 'OCT' }, { date: '2026-11-01', label: 'NOV' },
  { date: '2026-12-01', label: 'DEC' }, { date: '2027-01-01', label: 'JAN' },
];

const EURO_MONTH_TICKS: { date: string; label: string }[] = [
  { date: '2025-07-01', label: 'JUL' }, { date: '2025-08-01', label: 'AUG' },
  { date: '2025-09-01', label: 'SEP' }, { date: '2025-10-01', label: 'OCT' },
  { date: '2025-11-01', label: 'NOV' }, { date: '2025-12-01', label: 'DEC' },
  { date: '2026-01-01', label: 'JAN' }, { date: '2026-02-01', label: 'FEB' },
  { date: '2026-03-01', label: 'MAR' }, { date: '2026-04-01', label: 'APR' },
  { date: '2026-05-01', label: 'MAY' }, { date: '2026-06-01', label: 'JUN' },
  { date: '2026-07-01', label: 'JUL' },
];

export const StartDateTimeline: React.FC<StartDateTimelineProps> = ({ onSelect, onBack, leagueType, moddedLeagueBase }) => {
  const isPba = moddedLeagueBase === 'philippines';
  const isEuro = moddedLeagueBase === 'europe';
  const tlMin = isEuro ? EURO_TIMELINE_MIN : isPba ? PBA_TIMELINE_MIN : TIMELINE_MIN;
  const tlMax = isEuro ? EURO_TIMELINE_MAX : isPba ? PBA_TIMELINE_MAX : TIMELINE_MAX;
  const tlDisplayEnd = isEuro ? EURO_TIMELINE_DISPLAY_END : isPba ? PBA_TIMELINE_DISPLAY_END : TIMELINE_DISPLAY_END;
  const zoneSegments = isEuro ? EURO_ZONE_SEGMENTS : isPba ? PBA_ZONE_SEGMENTS : NBA_ZONE_SEGMENTS;
  const monthTicks = isEuro ? EURO_MONTH_TICKS : isPba ? PBA_MONTH_TICKS : NBA_MONTH_TICKS;
  const zoneColors: Record<string, string> = isEuro ? EURO_ZONE_COLORS : isPba ? PBA_ZONE_COLORS : ZONE_COLORS;
  const zoneLabels: Record<string, string> = isEuro ? EURO_ZONE_LABELS : isPba ? PBA_ZONE_LABELS : ZONE_LABELS;

  const trackTotalDays = useMemo(() => daysBetween(tlMin, tlDisplayEnd), [tlMin, tlDisplayEnd]);
  const dateToX = useCallback((iso: string): number =>
    Math.round((daysBetween(tlMin, iso) / trackTotalDays) * TRACK_WIDTH), [tlMin, trackTotalDays]);

  const keyDates = useMemo(() => isEuro ? getEuroKeyDates() : isPba ? getPbaKeyDates() : getKeyDates(leagueType), [isEuro, isPba, leagueType]);
  const displayMarkers = useMemo(() => keyDates.filter((kd, i, arr) =>
    arr.findIndex(k => k.date === kd.date && k.label === kd.label) === i
  ), [keyDates]);
  const [selectedDate, setSelectedDate] = useState<string>(tlMin);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const applyDate = useCallback((raw: string) => {
    const clamped = raw < tlMin ? tlMin : raw > INPUT_MAX ? INPUT_MAX : raw;
    if (!isPba && !isEuro && clamped >= '2026-02-13' && clamped <= '2026-02-16') {
      setSelectedDate('2026-02-13');
    } else {
      setSelectedDate(clamped);
    }
  }, [tlMin, isPba, isEuro]);

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

  const selectedX = dateToX(selectedDate);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative z-10 w-full max-w-5xl">

        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-white tracking-tight mb-2">
            Choose Your Start Date
          </h2>
          <p className="text-slate-400 text-sm">
            {isEuro
              ? 'Pick any date across the Euro offseason, domestic season, cups, and playoffs. Everything before it gets lazy-simmed.'
              : isPba
              ? 'Pick any date across the 3-conference PBA season. Everything before it gets simulated automatically.'
              : 'Pick any date from the offseason to the end of the regular season. Everything before it gets simulated automatically.'}
          </p>
        </div>

        {/* Timeline scroll container */}
        <div className="relative overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 mb-6 custom-scrollbar">
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
            </div>

            {/* Selected date thumb */}
            <div
              className="absolute pointer-events-none"
              style={{ left: selectedX - 1, top: 0, bottom: 0, width: '2px', background: '#fff', zIndex: 20 }}
            >
              {/* Dot */}
              <div className="absolute w-4 h-4 bg-white rounded-full border-2 border-slate-900 shadow-lg"
                style={{ top: '97px', left: '-7px' }} />
              {/* Date label above */}
              <div className="absolute px-2 py-0.5 bg-white text-black text-[10px] font-black rounded-md whitespace-nowrap shadow-lg"
                style={{ top: '68px', left: '-30px', transform: 'translateX(-50%)', minWidth: '80px', textAlign: 'center' }}>
                {formatDate(selectedDate)}
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
                      background: isLocked ? '#1e293b' : isPlaceholder ? '#334155' : isSelected ? '#fff' : '#475569',
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
                      background: isLocked ? '#1e293b' : isPlaceholder ? '#334155' : isSelected ? '#fff' : (zoneColors[kd.zone] ?? '#475569'),
                      border: isPlaceholder ? '1px dashed #64748b' : isSelected ? '2px solid #6366f1' : '1px solid #475569',
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
                      <div className="text-[8px] font-bold text-slate-300 leading-tight">{kd.label}</div>
                    </div>
                  ) : (
                    <div
                      className="absolute text-center"
                      style={{ top: '118px', left: '-28px', width: '56px', opacity: isLocked ? 0.25 : isPlaceholder ? 0.45 : 1 }}
                    >
                      <div style={{ fontSize: '10px' }}>{kd.icon}</div>
                      <div className="text-[8px] font-bold text-slate-300 leading-tight">{kd.label}</div>
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        </div>

        {/* Summary */}
        <div className="text-center mb-6">
          {isDay1 ? (
            <p className="text-slate-400 text-sm">
              <span className="text-emerald-400 font-bold">Starting from Day 1</span> — no simulation needed
            </p>
          ) : (
            <p className="text-slate-400 text-sm">
              Selected: <span className="text-white font-bold">{formatDate(selectedDate)}</span>
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
            onClick={onBack}
            className="px-5 py-2.5 text-slate-400 hover:text-white text-sm font-bold transition-colors"
          >
            ← Back
          </button>

          <div className="flex items-center gap-2 flex-1">
            <input
              type="date"
              value={selectedDate}
              min={tlMin}
              max={INPUT_MAX}
              onChange={e => applyDate(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm font-mono focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none"
            />
          </div>

          <button
            onClick={() => onSelect(selectedDate)}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
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
