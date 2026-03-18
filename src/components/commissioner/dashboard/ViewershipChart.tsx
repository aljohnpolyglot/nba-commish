import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HistoricalStatPoint } from '../../../types';

interface ViewershipChartProps {
  data: HistoricalStatPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-2xl backdrop-blur-md">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-8 mb-1">
            <span className="text-xs font-bold text-slate-400">{entry.name}:</span>
            <span className="text-xs font-mono font-bold" style={{ color: entry.color }}>
              {entry.value}M
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const ViewershipChart: React.FC<ViewershipChartProps> = ({ data }) => {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm h-[400px] flex flex-col">
        <h3 className="text-lg font-bold text-white tracking-tight mb-6">Viewership Trends</h3>
        <div className="flex-1 min-h-0 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <AreaChart data={data}>
                <defs>
                    <linearGradient id="colorViewership" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tick={{ fontWeight: 'bold' }} padding={{ left: 20, right: 20 }} minTickGap={50} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tick={{ fontWeight: 'bold' }} tickFormatter={(value) => `${value}M`} />
                <Tooltip content={<CustomTooltip />} />
                <Area name="Viewership" type="monotone" dataKey="viewership" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorViewership)" connectNulls />
            </AreaChart>
        </ResponsiveContainer>
        </div>
    </div>
  );
};
