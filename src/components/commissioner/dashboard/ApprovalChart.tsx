import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HistoricalStatPoint } from '../../../types';

interface ApprovalChartProps {
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
            <span className="text-xs font-mono font-bold" style={{ color: entry.color }}>{entry.value}%</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const ApprovalChart: React.FC<ApprovalChartProps> = ({ data }) => {
  return (
    <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm">
      <div className="flex items-center justify-between mb-8">
        <div className="flex flex-col">
          <h3 className="text-lg font-bold text-white tracking-tight">Approval Trends</h3>
          <p className="text-xs text-slate-500 font-medium">Historical performance across key demographics</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-sky-500"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Public</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Owners</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Players</span>
          </div>
        </div>
      </div>
      
      <div className="h-[300px] w-full min-h-0 min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorPublic" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorOwners" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorPlayers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis 
              dataKey="date" 
              stroke="#475569" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false}
              tick={{ fontWeight: 'bold' }}
              padding={{ left: 20, right: 20 }}
              minTickGap={50}
            />
            <YAxis 
              stroke="#475569" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false}
              tick={{ fontWeight: 'bold' }}
              domain={[0, 100]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area name="Public" type="monotone" dataKey="publicApproval" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorPublic)" connectNulls />
            <Area name="Owners" type="monotone" dataKey="ownerApproval" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorOwners)" connectNulls />
            <Area name="Players" type="monotone" dataKey="playerApproval" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorPlayers)" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
