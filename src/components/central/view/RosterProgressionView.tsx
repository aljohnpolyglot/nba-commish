import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { NBAPlayer } from '../../../types';
import { convertTo2KRating } from '../../../utils/helpers';

const MON_ABB = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PALETTE = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#f97316',
  '#06b6d4', '#ec4899', '#84cc16', '#14b8a6', '#f43f5e', '#8b5cf6',
  '#10b981', '#fbbf24', '#6366f1', '#0ea5e9', '#d946ef', '#f472b6',
  '#60a5fa', '#fb7185',
];

interface RosterProgressionViewProps {
  players: NBAPlayer[];
}

export const RosterProgressionView: React.FC<RosterProgressionViewProps> = ({ players }) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const { chartData, playerMeta } = useMemo(() => {
    const withData = players.filter(p => (p.ovrTimeline?.length ?? 0) > 0);

    const meta = withData.map((p, i) => {
      const latest = p.ratings?.[p.ratings.length - 1];
      return {
        key: `p${p.internalId}`,
        name: p.name,
        pos: p.pos,
        age: (p as any).born?.year ? new Date().getFullYear() - (p as any).born.year : (p.age ?? 25),
        color: PALETTE[i % PALETTE.length],
        hgt: latest?.hgt ?? 50,
        tp: latest?.tp ?? 50,
        player: p,
      };
    });

    const dateSet = new Set<string>();
    withData.forEach(p => p.ovrTimeline!.forEach(s => dateSet.add(s.date)));
    const sortedDates = Array.from(dateSet).sort();

    const data = sortedDates.map(date => {
      const [, mm, dd] = date.split('-');
      const row: any = { label: `${MON_ABB[parseInt(mm)]} ${parseInt(dd)}` };
      meta.forEach(m => {
        const snap = m.player.ovrTimeline!.find(s => s.date === date);
        if (snap != null) {
          row[m.key] = convertTo2KRating(snap.ovr, m.hgt, m.tp);
        }
      });
      return row;
    });

    return { chartData: data, playerMeta: meta };
  }, [players]);

  const rookies = useMemo(
    () => players.filter(p => (p.ovrTimeline?.length ?? 0) === 0),
    [players]
  );

  if (chartData.length === 0) {
    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-sm font-bold text-slate-400">No progression data yet — check back after some games.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Past 1 Year · K2</span>
        <span className="text-[10px] font-bold text-slate-600">{playerMeta.length} players</span>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={chartData} margin={{ top: 4, right: 12, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#64748b', fontSize: 9, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            interval={Math.max(0, Math.floor(chartData.length / 8))}
          />
          <YAxis
            domain={['dataMin - 1', 'dataMax + 1']}
            tick={{ fill: '#64748b', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => Math.round(v).toString()}
          />
          <Tooltip
            cursor={hoveredKey ? { stroke: 'rgba(255,255,255,0.15)' } : false}
            content={(props: any) => {
              if (!hoveredKey || !props?.active || !props?.payload?.length) return null;
              const item = props.payload.find((p: any) => p.dataKey === hoveredKey);
              if (!item || item.value == null) return null;
              return (
                <div className="px-3 py-2 rounded-lg text-[11px]" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="text-slate-400 font-bold mb-0.5">{props.label}</div>
                  <div className="flex items-center gap-2 font-black" style={{ color: item.color }}>
                    <span>{item.name}</span>
                    <span className="text-white">{Math.round(item.value)} K2</span>
                  </div>
                </div>
              );
            }}
          />
          {playerMeta.map(m => {
            const dimmed = hoveredKey != null && hoveredKey !== m.key;
            return (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                name={m.name}
                stroke={m.color}
                strokeWidth={hoveredKey === m.key ? 3 : 2}
                strokeOpacity={dimmed ? 0.08 : 1}
                dot={false}
                connectNulls={false}
                activeDot={hoveredKey === m.key ? { r: 5, strokeWidth: 0 } : false}
                onMouseEnter={() => setHoveredKey(m.key)}
                onMouseLeave={() => setHoveredKey(null)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {playerMeta.map(m => {
          const dimmed = hoveredKey != null && hoveredKey !== m.key;
          return (
            <span
              key={m.key}
              onMouseEnter={() => setHoveredKey(m.key)}
              onMouseLeave={() => setHoveredKey(null)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700/50 text-[10px] font-bold text-slate-300 cursor-pointer transition-opacity"
              style={{ opacity: dimmed ? 0.25 : 1 }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
              {m.name}
              <span className="text-slate-500">· {m.pos}</span>
            </span>
          );
        })}
        {rookies.map(r => (
          <span
            key={`rk_${r.internalId}`}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/30 border border-slate-700/30 text-[10px] font-bold text-slate-500 italic"
          >
            <span className="w-2 h-2 rounded-full bg-slate-600" />
            {r.name}
            <span className="text-slate-600">· rookie · no history</span>
          </span>
        ))}
      </div>
    </div>
  );
};
