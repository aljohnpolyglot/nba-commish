import React from 'react';
import { RADAR_AXES } from '../../services/simulation/convert2kAttributes';

export const BBGM_DISPLAY_NAMES: Record<string, string> = {
  hgt: 'Height',
  stre: 'Strength',
  spd: 'Speed',
  jmp: 'Jumping',
  endu: 'Endurance',
  ins: 'Inside Scoring',
  dnk: 'Dunking',
  ft: 'Free Throw',
  fg: 'Mid-Range',
  tp: 'Three-Point',
  oiq: 'Offensive IQ',
  diq: 'Defensive IQ',
  drb: 'Dribbling',
  pss: 'Passing',
  reb: 'Rebounding',
};

export const BBGM_EDITABLE_KEYS = ['stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'];

export const K2_DRIVERS: { catKey: string; subIdx: number; bbgmKey: string; multiplier: number; hgtLimited?: boolean }[] = [
  { catKey: 'OS', subIdx: 0, bbgmKey: 'ins', multiplier: 0.30 },
  { catKey: 'OS', subIdx: 1, bbgmKey: 'fg', multiplier: 0.48 },
  { catKey: 'OS', subIdx: 2, bbgmKey: 'tp', multiplier: 0.48 },
  { catKey: 'OS', subIdx: 3, bbgmKey: 'ft', multiplier: 0.60 },
  { catKey: 'OS', subIdx: 4, bbgmKey: 'oiq', multiplier: 0.60 },
  { catKey: 'OS', subIdx: 5, bbgmKey: 'oiq', multiplier: 0.24 },
  { catKey: 'AT', subIdx: 0, bbgmKey: 'spd', multiplier: 0.60 },
  { catKey: 'AT', subIdx: 1, bbgmKey: 'spd', multiplier: 0.42 },
  { catKey: 'AT', subIdx: 2, bbgmKey: 'stre', multiplier: 0.48 },
  { catKey: 'AT', subIdx: 3, bbgmKey: 'jmp', multiplier: 0.60 },
  { catKey: 'AT', subIdx: 4, bbgmKey: 'endu', multiplier: 0.60 },
  { catKey: 'AT', subIdx: 5, bbgmKey: 'endu', multiplier: 0.36 },
  { catKey: 'AT', subIdx: 6, bbgmKey: 'endu', multiplier: 0.60 },
  { catKey: 'IS', subIdx: 0, bbgmKey: 'ins', multiplier: 0.48 },
  { catKey: 'IS', subIdx: 1, bbgmKey: 'dnk', multiplier: 0.24, hgtLimited: true },
  { catKey: 'IS', subIdx: 2, bbgmKey: 'dnk', multiplier: 0.54 },
  { catKey: 'IS', subIdx: 3, bbgmKey: 'ins', multiplier: 0.48 },
  { catKey: 'IS', subIdx: 4, bbgmKey: 'fg', multiplier: 0.36 },
  { catKey: 'IS', subIdx: 5, bbgmKey: 'stre', multiplier: 0.36 },
  { catKey: 'IS', subIdx: 6, bbgmKey: 'ins', multiplier: 0.18 },
  { catKey: 'IS', subIdx: 7, bbgmKey: 'oiq', multiplier: 0.42 },
  { catKey: 'PL', subIdx: 0, bbgmKey: 'pss', multiplier: 0.60 },
  { catKey: 'PL', subIdx: 1, bbgmKey: 'drb', multiplier: 0.60 },
  { catKey: 'PL', subIdx: 2, bbgmKey: 'drb', multiplier: 0.36 },
  { catKey: 'PL', subIdx: 3, bbgmKey: 'pss', multiplier: 0.30 },
  { catKey: 'PL', subIdx: 4, bbgmKey: 'oiq', multiplier: 0.42 },
  { catKey: 'DF', subIdx: 0, bbgmKey: 'diq', multiplier: 0.135, hgtLimited: true },
  { catKey: 'DF', subIdx: 1, bbgmKey: 'diq', multiplier: 0.72 },
  { catKey: 'DF', subIdx: 2, bbgmKey: 'diq', multiplier: 0.54 },
  { catKey: 'DF', subIdx: 3, bbgmKey: 'jmp', multiplier: 0.24, hgtLimited: true },
  { catKey: 'DF', subIdx: 4, bbgmKey: 'diq', multiplier: 0.90 },
  { catKey: 'DF', subIdx: 5, bbgmKey: 'diq', multiplier: 0.54 },
  { catKey: 'DF', subIdx: 6, bbgmKey: 'diq', multiplier: 0.36, hgtLimited: true },
  { catKey: 'RB', subIdx: 0, bbgmKey: 'reb', multiplier: 0.18, hgtLimited: true },
  { catKey: 'RB', subIdx: 1, bbgmKey: 'reb', multiplier: 0.18, hgtLimited: true },
];

export const K2_CAT_COLORS: Record<string, string> = {
  OS: '#f97316',
  AT: '#22c55e',
  IS: '#ef4444',
  PL: '#3b82f6',
  DF: '#8b5cf6',
  RB: '#eab308',
  MI: '#06b6d4',
};

export function getRatingColor(val: number): string {
  if (val >= 90) return '#3b82f6';
  if (val >= 80) return '#22c55e';
  if (val >= 70) return '#eab308';
  if (val >= 50) return '#f97316';
  return '#f43f5e';
}

export function RatingBar({ value, label }: { value: number; label: string }) {
  const color = getRatingColor(value);
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-slate-400 w-32 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold w-7 text-right" style={{ color }}>{value}</span>
    </div>
  );
}

export function RadarChart({ values }: { values: number[] }) {
  const cx = 250;
  const cy = 250;
  const maxR = 180;
  const n = 7;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) => {
    const a = angle(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const polyPoints = (r: number) => Array.from({ length: n }, (_, i) => pt(i, r)).map(p => `${p.x},${p.y}`).join(' ');
  const scale = (v: number) => ((v - 25) / 74) * maxR;
  const dataPoints = values.map((v, i) => pt(i, scale(Math.max(25, Math.min(99, v)))));
  const dataPolyStr = dataPoints.map(p => `${p.x},${p.y}`).join(' ');
  const axisLabelPt = (i: number) => pt(i, maxR + 28);

  return (
    <svg viewBox="0 0 500 500" width="100%" className="max-w-xs mx-auto">
      {[0.33, 0.66, 1].map(frac => (
        <polygon key={frac} points={polyPoints(maxR * frac)} fill="none" stroke="#334155" strokeWidth="1" />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const tip = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="#334155" strokeWidth="1" />;
      })}
      <polygon points={dataPolyStr} fill="rgba(59,130,246,0.25)" stroke="#3b82f6" strokeWidth="2" />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="#3b82f6" />
      ))}
      {dataPoints.map((p, i) => {
        const v = values[i];
        const color = getRatingColor(v);
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="11" fill="#0f172a" stroke={color} strokeWidth="1.5" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="9" fontWeight="bold" fill={color}>
              {v}
            </text>
          </g>
        );
      })}
      {Array.from({ length: n }, (_, i) => {
        const lp = axisLabelPt(i);
        let anchor: 'start' | 'middle' | 'end' = 'middle';
        const a = angle(i) * (180 / Math.PI);
        if (a > 20 && a < 160) anchor = 'middle';
        else if (a >= 160 || a <= -160) anchor = 'middle';
        else if (a > -160 && a < -20) anchor = 'middle';
        if (lp.x < cx - 20) anchor = 'end';
        else if (lp.x > cx + 20) anchor = 'start';
        return (
          <text key={i} x={lp.x} y={lp.y} textAnchor={anchor} fontSize="11" fontWeight="600" fill="#94a3b8">
            {RADAR_AXES[i]}
          </text>
        );
      })}
    </svg>
  );
}

export function formatMentorDate(iso: string | undefined): string {
  if (!iso || iso === 'unknown') return '—';
  const norm = iso.slice(0, 10);
  const [y, m, d] = norm.split('-').map(s => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function RadarCompareChart({ current, previous }: { current: number[]; previous: number[] }) {
  const cx = 250;
  const cy = 250;
  const maxR = 180;
  const n = 7;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) => ({ x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) });
  const polyPoints = (r: number) => Array.from({ length: n }, (_, i) => pt(i, r)).map(p => `${p.x},${p.y}`).join(' ');
  const scale = (v: number) => ((Math.max(25, Math.min(99, v)) - 25) / 74) * maxR;
  const curPts = current.map((v, i) => pt(i, scale(v)));
  const prevPts = previous.map((v, i) => pt(i, scale(v)));

  return (
    <svg viewBox="0 0 500 500" width="100%" className="max-w-xs mx-auto">
      {[0.33, 0.66, 1].map(frac => (
        <polygon key={frac} points={polyPoints(maxR * frac)} fill="none" stroke="#334155" strokeWidth="1" />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const tip = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="#334155" strokeWidth="1" />;
      })}
      <polygon
        points={prevPts.map(p => `${p.x},${p.y}`).join(' ')}
        fill="rgba(100,116,139,0.12)"
        stroke="#64748b"
        strokeWidth="1.5"
        strokeDasharray="6 4"
      />
      <polygon
        points={curPts.map(p => `${p.x},${p.y}`).join(' ')}
        fill="rgba(59,130,246,0.25)"
        stroke="#3b82f6"
        strokeWidth="2"
      />
      {curPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#3b82f6" />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const lp = pt(i, maxR + 28);
        return (
          <text key={i} x={lp.x} y={lp.y} textAnchor="middle" fontSize="11" fontWeight="600" fill="#94a3b8">
            {RADAR_AXES[i]}
          </text>
        );
      })}
    </svg>
  );
}
