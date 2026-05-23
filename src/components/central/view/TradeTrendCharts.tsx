import React, { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { NBAPlayer, NBATeam } from '../../../types';

const CHART_COLORS = ['#60a5fa', '#fb923c', '#a78bfa', '#34d399'];

export const TradeTrendCharts: React.FC<{ teamSlots: { team: NBATeam | null; players: NBAPlayer[] }[]; tradeYear: number }> = ({ teamSlots, tradeYear }) => {
  const slots = teamSlots.filter(slot => slot.team !== null) as { team: NBATeam; players: NBAPlayer[] }[];
  if (slots.length < 2) return null;

  const years = useMemo(() => {
    const values: number[] = [];
    for (let year = tradeYear - 1; year <= tradeYear + 5; year += 1) values.push(year);
    return values;
  }, [tradeYear]);

  const winPctData = useMemo(() => years.map(year => {
    const row: Record<string, number | string> = { season: year };
    for (const slot of slots) {
      const seasonRecord = (slot.team.seasons ?? []).find(season => season.season === year);
      if (seasonRecord) {
        const total = seasonRecord.won + seasonRecord.lost;
        if (total > 0) row[slot.team.abbrev] = +(seasonRecord.won / total).toFixed(3);
      } else if (year === tradeYear) {
        const total = slot.team.wins + slot.team.losses;
        if (total > 0) row[slot.team.abbrev] = +(slot.team.wins / total).toFixed(3);
      }
    }
    return row;
  }), [slots, tradeYear, years]);

  const wsTotalData = useMemo(() => years.map(year => {
    const row: Record<string, number | string> = { season: year };
    for (const slot of slots) {
      let total = 0;
      for (const player of slot.players) {
        for (const stat of (player.stats ?? [])) {
          if ((stat.season ?? 0) === year && (stat.gp ?? 0) > 0) total += (stat as { ws?: number }).ws ?? 0;
        }
      }
      if (total > 0) row[slot.team.abbrev] = +total.toFixed(2);
    }
    return row;
  }), [slots, years]);

  const wsWithTeamData = useMemo(() => years.map(year => {
    const row: Record<string, number | string> = { season: year };
    for (const slot of slots) {
      let total = 0;
      for (const player of slot.players) {
        for (const stat of (player.stats ?? [])) {
          if ((stat.season ?? 0) === year && (stat.gp ?? 0) > 0 && stat.tid === slot.team.id) total += (stat as { ws?: number }).ws ?? 0;
        }
      }
      if (total > 0) row[slot.team.abbrev] = +total.toFixed(2);
    }
    return row;
  }), [slots, years]);

  const teamColors = new Map<string, string>();
  slots.forEach((slot, index) => teamColors.set(slot.team.abbrev, slot.team.colors?.[0] ?? CHART_COLORS[index % CHART_COLORS.length]));

  const renderChart = (title: string, data: typeof winPctData, yFormatter: (value: number) => string, baseline?: number) => (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 text-center">{title}</h4>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="season" stroke="#475569" fontSize={10} tickLine={false} axisLine={{ stroke: '#334155' }} tick={{ fontWeight: 'bold' }} />
            <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tick={{ fontWeight: 'bold' }} tickFormatter={yFormatter} width={45} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }} labelStyle={{ color: '#cbd5e1', fontWeight: 700 }} />
            <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} iconType="line" />
            {baseline !== undefined && <ReferenceLine y={baseline} stroke="#475569" strokeDasharray="4 4" />}
            <ReferenceLine x={tradeYear} stroke="#fb7185" strokeDasharray="3 3" label={{ value: 'Trade', position: 'top', fill: '#fb7185', fontSize: 10, fontWeight: 700 }} />
            {slots.map(slot => (
              <Line key={slot.team.abbrev} type="monotone" dataKey={slot.team.abbrev} stroke={teamColors.get(slot.team.abbrev)} strokeWidth={2} dot={{ r: 3, strokeWidth: 1 }} activeDot={{ r: 5 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {renderChart('Team winning percentages before and after the trade', winPctData, value => value.toFixed(3).replace(/^0/, ''), 0.5)}
      {renderChart('WS by assets received in trade (total)', wsTotalData, value => value.toFixed(1))}
      {renderChart('WS by assets received in trade (with team)', wsWithTeamData, value => value.toFixed(1))}
    </div>
  );
};
