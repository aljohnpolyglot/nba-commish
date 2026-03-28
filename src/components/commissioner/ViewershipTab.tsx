import React, { useState } from 'react';
import { useGame } from '../../store/GameContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Users, TrendingUp, TrendingDown, Activity, Calendar, Clock } from 'lucide-react';
import { getGamePhase } from '../../utils/helpers';
import { VIEWERSHIP_MEANS } from '../../services/logic/ViewershipService';

const ViewershipTab: React.FC = () => {
  const { state } = useGame();
  const [timeRange, setTimeRange] = useState<7 | 30 | 90 | 'all'>(7);

  if (!state) return null;

  const history = state.leagueStats.viewershipHistory || [];

  // Filter history based on time range
  const filteredHistory = timeRange === 'all' ? history : history.slice(-timeRange);

  // Format data for chart
  const chartData = filteredHistory.map(point => ({
    date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    viewers: point.viewers,
    fullDate: point.date
  }));

  const currentPhase = getGamePhase(state.date);
  const currentBaseline = VIEWERSHIP_MEANS[currentPhase] || 1.8;
  const currentViewership = state.leagueStats.viewership;
  
  const isAboveBaseline = currentViewership >= currentBaseline;
  
  // Calculate 7-day average
  let sevenDayAvg = currentViewership;
  if (history.length >= 7) {
    const last7 = history.slice(-7);
    sevenDayAvg = last7.reduce((sum, p) => sum + p.viewers, 0) / 7;
  } else if (history.length > 0) {
    sevenDayAvg = history.reduce((sum, p) => sum + p.viewers, 0) / history.length;
  }

  const formatViewers = (val: number) => `${val.toFixed(2)}M`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Viewership Analytics</h2>
          <p className="text-slate-400 text-sm">Monitor daily national viewership and seasonal trends</p>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
              <Users size={20} />
            </div>
          </div>
          <p className="text-sm font-medium text-slate-400 mb-1">Current Daily Viewers</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-white">{formatViewers(currentViewership)}</h3>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div className={`p-2 rounded-lg ${isAboveBaseline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
              {isAboveBaseline ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            </div>
          </div>
          <p className="text-sm font-medium text-slate-400 mb-1">vs Phase Baseline</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-white">
              {isAboveBaseline ? '+' : ''}{(currentViewership - currentBaseline).toFixed(2)}M
            </h3>
            <span className="text-sm text-slate-500">({formatViewers(currentBaseline)} base)</span>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
              <Activity size={20} />
            </div>
          </div>
          <p className="text-sm font-medium text-slate-400 mb-1">7-Day Average</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-white">{formatViewers(sevenDayAvg)}</h3>
          </div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-lg font-bold text-white">Season Viewership Trend</h3>
          
          <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-700">
            {([7, 30, 90, 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  timeRange === range
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {range === 'all' ? 'Season' : `${range}D`}
              </button>
            ))}
          </div>
        </div>
        
        {chartData.length > 0 ? (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorViewers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#94a3b8" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={30}
                />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val}M`}
                  domain={['auto', 'auto']}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.5rem' }}
                  itemStyle={{ color: '#818cf8' }}
                  labelStyle={{ color: '#94a3b8', marginBottom: '0.25rem' }}
                  formatter={(value: number) => [`${value.toFixed(2)}M`, 'Viewers']}
                />
                <Area 
                  type="monotone" 
                  dataKey="viewers" 
                  stroke="#6366f1" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorViewers)" 
                  activeDot={{ r: 6, fill: '#818cf8', stroke: '#312e81', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80 flex items-center justify-center text-slate-500">
            <p>Not enough data to display chart. Advance the simulation.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewershipTab;
