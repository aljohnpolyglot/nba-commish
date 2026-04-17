import React, { useRef, useState, useCallback } from 'react';
import { KEY_DATES, TIMELINE_MIN, TIMELINE_MAX, TIMELINE_DISPLAY_END, ZONE_COLORS, ZONE_LABELS, DateZone, KeyDate } from './keyDates';

interface StartDateTimelineProps {
  onSelect: (date: string) => void;
  onBack: () => void;
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

const clampDate = (date: string) => {
  if (date < TIMELINE_MIN) return TIMELINE_MIN;
  if (date > TIMELINE_MAX) return TIMELINE_MAX;
  return date;
};

const snapAllStarZone = (date: string): string => {
  if (date >= '2026-02-13' && date <= '2026-02-16') return '2026-02-13';
  return date;
};

// ─── Layout constants ─────────────────────────────────────────────────────
const TRACK_WIDTH = 1600;
const TRACK_TOTAL_DAYS = daysBetween(TIMELINE_MIN, TIMELINE_DISPLAY_END);

const dateToX = (iso: string): number =>
  Math.round((daysBetween(TIMELINE_MIN, iso) / TRACK_TOTAL_DAYS) * TRACK_WIDTH);

// Zone segments for the colored track background
const ZONE_SEGMENTS: { start: string; end: string; zone: DateZone }[] = [
  { start: '2025-08-06', end: '2025-10-23', zone: 'offseason' },
  { start: '2025-10-24', end: '2026-01-13', zone: 'early' },
  { start: '2026-01-14', end: '2026-02-12', zone: 'mid' },
  { start: '2026-02-13', end: '2026-02-16', zone: 'allstar' },
  { start: '2026-02-17', end: '2026-04-15', zone: 'late' },
  { start: '2026-04-16', end: TIMELINE_DISPLAY_END, zone: 'late' },
];

// Month ticks
const MONTH_TICKS: { date: string; label: string }[] = [
  { date: '2025-08-01', label: 'AUG' },
  { date: '2025-09-01', label: 'SEP' },
  { date: '2025-10-01', label: 'OCT' },
  { date: '2025-11-01', label: 'NOV' },
  { date: '2025-12-01', label: 'DEC' },
  { date: '2026-01-01', label: 'JAN' },
  { date: '2026-02-01', label: 'FEB' },
  { date: '2026-03-01', label: 'MAR' },
  { date: '2026-04-01', label: 'APR' },
  { date: '2026-05-01', label: 'MAY' },
  { date: '2026-06-01', label: 'JUN' },
  { date: '2026-07-01', label: 'JUL' },
];

// De-duplicate key dates by label+zone so we don't stack identical markers
const DISPLAY_MARKERS = KEY_DATES.filter((kd, i, arr) =>
  arr.findIndex(k => k.date === kd.date && k.label === kd.label) === i
);

export const StartDateTimeline: React.FC<StartDateTimelineProps> = ({ onSelect, onBack }) => {
  const [selectedDate, setSelectedDate] = useState<string>(TIMELINE_MIN);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const applyDate = useCallback((raw: string) => {
    const clamped = clampDate(raw);
    const snapped = snapAllStarZone(clamped);
    setSelectedDate(snapped);
  }, []);

  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const xRel = e.clientX - rect.left;
    const fraction = xRel / rect.width;
    const dayOffset = Math.round(fraction * TRACK_TOTAL_DAYS);
    const clicked = addDays(TIMELINE_MIN, dayOffset);
    if (clicked > TIMELINE_MAX) return;
    applyDate(clicked);
  }, [applyDate]);

  const handleMarkerClick = useCallback((kd: KeyDate) => {
    if (kd.locked || kd.placeholder) return;
    applyDate(kd.date);
  }, [applyDate]);

  const daysSkipped = daysBetween(TIMELINE_MIN, selectedDate);
  const estSeconds = Math.max(1, Math.ceil(daysSkipped / 25));
  const isDay1 = selectedDate === TIMELINE_MIN;

  const selectedX = dateToX(selectedDate);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative z-10 w-full max-w-5xl">

        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-white tracking-tight mb-2">Choose Your Start Date</h2>
          <p className="text-slate-400 text-sm">
            Pick any date from the offseason to the end of the regular season.
            Everything before it gets simulated automatically.
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
            {ZONE_SEGMENTS.map((seg, i) => {
              const x1 = dateToX(seg.start);
              const x2 = dateToX(seg.end);
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 opacity-20"
                  style={{ left: x1, width: x2 - x1, background: ZONE_COLORS[seg.zone] }}
                />
              );
            })}

            {/* Colored track bar */}
            <div className="absolute" style={{ top: '105px', left: 0, right: 0, height: '6px' }}>
              {ZONE_SEGMENTS.map((seg, i) => {
                const x1 = dateToX(seg.start);
                const x2 = dateToX(seg.end);
                return (
                  <div
                    key={i}
                    className="absolute h-full"
                    style={{ left: x1, width: x2 - x1, background: ZONE_COLORS[seg.zone] }}
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
            {MONTH_TICKS.map(mt => {
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
            {ZONE_SEGMENTS.map((seg, i) => {
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
                    color: ZONE_COLORS[seg.zone],
                    opacity: 0.8,
                  }}
                >
                  {ZONE_LABELS[seg.zone]}
                </div>
              );
            })}

            {/* Key date markers */}
            {DISPLAY_MARKERS.map((kd, i) => {
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
                      background: isLocked ? '#1e293b' : isPlaceholder ? '#334155' : isSelected ? '#fff' : ZONE_COLORS[kd.zone],
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
              min={TIMELINE_MIN}
              max="2029-06-29"
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
