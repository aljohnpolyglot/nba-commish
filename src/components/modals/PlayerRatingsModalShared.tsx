import React from 'react';
import { RADAR_AXES } from '../../services/simulation/convert2kAttributes';

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
  const scale = (v: number) => Math.max(0, Math.min(100, v)) / 100 * maxR;
  const dataPoints = values.map((v, i) => pt(i, scale(v)));
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
