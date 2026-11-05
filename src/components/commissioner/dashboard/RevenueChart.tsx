import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HistoricalStatPoint } from '../../../types';

interface RevenueChartProps {
  data: HistoricalStatPoint[];
  currencyCode?: string;
}

const CustomTooltip = ({ active, payload, label, currencyCode }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-2xl backdrop-blur-md">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-8 mb-1">
            <span className="text-xs font-bold text-slate-400">{entry.name}:</span>
            <span className="text-xs font-mono font-bold" style={{ color: entry.color }}>
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currencyCode ?? 'USD',
                maximumFractionDigits: 2,
              }).format(entry.value)}B
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const RevenueChart: React.FC<RevenueChartProps> = ({ data, currencyCode = 'USD' }) => {
  const [metric, setMetric] = useState<'revenue' | 'leagueReserve' | 'availableBudget'>('revenue');

  // Convert raw million-scale values → billions so Recharts sees small, readable numbers
  const chartData = useMemo(() =>
    data.map(d => ({
      ...d,
      revenue: d.revenue / 1000,
      leagueReserve: d.leagueReserve != null ? d.leagueReserve / 1000 : null,
      availableBudget: d.availableBudget != null ? d.availableBudget / 1000 : null,
    })),
    [data]
  );

  // Zoom Y domain to the actual data range with a small 10% padding
  const yDomain = useMemo(() => {
    const values = chartData.map(d => d[metric]).filter((value): value is number => value != null && isFinite(value));
    if (values.length === 0) return ['auto', 'auto'] as const;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.15 || max * 0.1 || 1;
    return [
      parseFloat((min - pad).toFixed(2)),
      parseFloat((max + pad).toFixed(2)),
    ] as [number, number];
  }, [chartData, metric]);

  const metricLabel = metric === 'revenue'
    ? 'Annual Revenue'
    : metric === 'leagueReserve'
      ? 'League Reserve'
      : 'Available Budget';

  return (
    <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm h-[400px] flex flex-col">
        <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white tracking-tight">League Financial History</h3>
            <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                    onClick={() => setMetric('revenue')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${metric === 'revenue' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Revenue
                </button>
                <button
                    onClick={() => setMetric('leagueReserve')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${metric === 'leagueReserve' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Reserve
                </button>
                <button
                    onClick={() => setMetric('availableBudget')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${metric === 'availableBudget' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Budget
                </button>
            </div>
        </div>
        <div className="flex-1 min-h-0 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <AreaChart data={chartData}>
                <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tick={{ fontWeight: 'bold' }} padding={{ left: 20, right: 20 }} minTickGap={50} />
                <YAxis
                  stroke="#475569"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontWeight: 'bold' }}
                  tickFormatter={(value) => `${new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: currencyCode,
                    maximumFractionDigits: 1,
                  }).format(value)}B`}
                  domain={yDomain}
                  tickCount={5}
                  width={55}
                />
                <Tooltip content={<CustomTooltip currencyCode={currencyCode} />} />
                <Area
                    name={metricLabel}
                    type="monotone"
                    dataKey={metric}
                    stroke="#10b981"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                    connectNulls
                />
            </AreaChart>
        </ResponsiveContainer>
        </div>
    </div>
  );
};
