import React from 'react';

export function letterColor(score: number): string {
  if (score >= 82) return '#3b82f6';
  if (score >= 70) return '#22c55e';
  if (score >= 58) return '#eab308';
  if (score >= 46) return '#f97316';
  return '#f43f5e';
}

export function tierColor(label: string): string {
  if (/franchise|all-star/i.test(label)) return '#3b82f6';
  if (/starter|rotation/i.test(label)) return '#22c55e';
  if (/bench contributor|reserve/i.test(label)) return '#eab308';
  if (/developmental|practice/i.test(label)) return '#f97316';
  if (/superstar|all-star/i.test(label)) return '#3b82f6';
  if (/quality starter|borderline/i.test(label)) return '#22c55e';
  if (/solid starter|bench rotation/i.test(label)) return '#eab308';
  if (/g-league|deep bench/i.test(label)) return '#f97316';
  return '#94a3b8';
}

export function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const value = n % 100;
  return n + (suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]);
}

export function HybridRadarChart({
  values,
  baseline,
  axes,
}: {
  values: number[];
  baseline: number[];
  axes: string[];
}) {
  const cx = 250;
  const cy = 250;
  const maxR = 175;
  const n = axes.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });
  const polyPoints = (r: number) =>
    Array.from({ length: n }, (_, i) => pt(i, r))
      .map((point) => `${point.x},${point.y}`).join(' ');
  const scale = (v: number) => Math.max(0, Math.min(1, (v - 25) / 55)) * maxR;
  const dataPoly = values.map((value, i) => pt(i, scale(value))).map((point) => `${point.x},${point.y}`).join(' ');
  const basePoly = baseline.map((value, i) => pt(i, scale(value))).map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <svg viewBox="0 0 500 500" width="100%" className="max-w-sm mx-auto">
      {[0.33, 0.66, 1].map((factor) => (
        <polygon key={factor} points={polyPoints(maxR * factor)} fill="none" stroke="#334155" strokeWidth="1" />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const tip = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="#334155" strokeWidth="1" />;
      })}
      <polygon points={basePoly} fill="rgba(148,163,184,0.10)" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />
      <polygon points={dataPoly} fill="rgba(59,130,246,0.30)" stroke="#3b82f6" strokeWidth="2.5" />
      {values.map((value, i) => {
        const point = pt(i, scale(value));
        return <circle key={i} cx={point.x} cy={point.y} r="4" fill="#60a5fa" />;
      })}
      {Array.from({ length: n }, (_, i) => {
        const labelPoint = pt(i, maxR + 30);
        let anchor: 'start' | 'middle' | 'end' = 'middle';
        if (labelPoint.x < cx - 20) anchor = 'end';
        else if (labelPoint.x > cx + 20) anchor = 'start';
        return (
          <text key={i} x={labelPoint.x} y={labelPoint.y} textAnchor={anchor} fontSize="11" fontWeight="700" fill="#cbd5e1">
            {axes[i]}
          </text>
        );
      })}
    </svg>
  );
}
