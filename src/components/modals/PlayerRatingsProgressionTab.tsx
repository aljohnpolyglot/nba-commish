import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NBAPlayer } from '../../types';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { K2_CATS, getRadarValues, type K2Data } from '../../services/simulation/convert2kAttributes';
import { convertTo2KRating } from '../../utils/helpers';
import { formatMentorDate, getRatingColor, RadarCompareChart } from './PlayerRatingsModalShared';

type MentorEntry = {
  mentorId: string;
  startDate?: string;
  endDate?: string;
  mentor: (NBAPlayer & { mentorExp?: number }) | null;
};

export const PlayerRatingsProgressionTab: React.FC<{
  player: NBAPlayer;
  currentRatings: Record<string, number>;
  ratingHistory: Array<{ season: string; ovr: number }>;
  overall2k: number;
  teamColor: string;
  progressPeriod: 'Career' | '3Y' | '1Y';
  setProgressPeriod: React.Dispatch<React.SetStateAction<'Career' | '3Y' | '1Y'>>;
  snapshotInfo: {
    displayK2: K2Data;
    year: number;
    label: string;
  };
  displayK2: K2Data;
  collapsedCats: Record<string, boolean>;
  setCollapsedCats: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  radarValues: number[];
  mentorEntries: MentorEntry[];
}> = ({
  player,
  currentRatings,
  ratingHistory,
  overall2k,
  teamColor,
  progressPeriod,
  setProgressPeriod,
  snapshotInfo,
  displayK2,
  collapsedCats,
  setCollapsedCats,
  radarValues,
  mentorEntries,
}) => {
  const monthAbbrevs = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weeklyData = (player.ovrTimeline ?? [])
    .filter((snapshot: { date: string; ovr: number }) => {
      if (!player.retiredYear) return true;
      const dateYear = parseInt(snapshot.date.split('-')[0]);
      return dateYear <= player.retiredYear;
    })
    .map((snapshot: { date: string; ovr: number }) => {
      const [, month, day] = snapshot.date.split('-');
      return {
        season: `${monthAbbrevs[parseInt(month)]} ${parseInt(day)}`,
        ovr: convertTo2KRating(snapshot.ovr, currentRatings.hgt ?? 50, currentRatings.tp ?? 50),
      };
    });

  const rawChartData = progressPeriod === 'Career'
    ? ratingHistory
    : progressPeriod === '3Y'
      ? ratingHistory.slice(-3)
      : weeklyData.length > 0
        ? weeklyData
        : ratingHistory.slice(-1);

  const chartData = rawChartData.length >= 2
    ? rawChartData
    : rawChartData.length === 1
      ? [{ season: 'yr-1', ovr: rawChartData[0].ovr }, rawChartData[0]]
      : [{ season: 'yr-1', ovr: overall2k }, { season: 'now', ovr: overall2k }];

  const prevSeasonOvr = ratingHistory[ratingHistory.length - 2]?.ovr ?? overall2k;
  const delta = overall2k - prevSeasonOvr;
  const deltaColor = delta > 0 ? '#22c55e' : delta < 0 ? '#f43f5e' : '#64748b';
  const k2OverallSnapshot = Math.round(
    (Object.values(snapshotInfo.displayK2) as { ovr: number }[]).reduce((sum, category) => sum + category.ovr, 0) /
    Object.keys(snapshotInfo.displayK2).length,
  );
  const snapshotRadarValues = getRadarValues(snapshotInfo.displayK2, k2OverallSnapshot);

  return (
    <>
      <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {(['Career', '3Y', '1Y'] as const).map(period => (
              <button
                key={period}
                onClick={() => setProgressPeriod(period)}
                className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md transition-all ${
                  progressPeriod === period ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {period}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">vs last yr</span>
            <span className="text-sm font-black" style={{ color: deltaColor }}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 4, right: 12, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="season"
              tick={{ fill: '#64748b', fontSize: 9, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
              interval={progressPeriod === '1Y' ? Math.floor(chartData.length / 6) : 0}
            />
            <YAxis
              domain={['dataMin - 1', 'dataMax + 1']}
              tick={{ fill: '#64748b', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => Math.round(value).toString()}
            />
            <Tooltip
              contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#94a3b8', fontWeight: 700 }}
              formatter={(value: number | string) => [`${Math.round(Number(value))} OVR`, '']}
            />
            <Line
              type="monotone"
              dataKey="ovr"
              stroke={teamColor}
              strokeWidth={2.5}
              dot={progressPeriod === '1Y' ? false : { fill: teamColor, r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
            K2 Deltas · vs {snapshotInfo.label}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Now − Then</span>
        </div>
        {K2_CATS.map(cat => {
          const catData = displayK2[cat.k];
          const snapshotData = snapshotInfo.displayK2[cat.k];
          const isCollapsed = collapsedCats[`prog_${cat.k}`] ?? false;
          const catDelta = catData.ovr - snapshotData.ovr;
          const catColor = getRatingColor(catData.ovr);
          return (
            <div key={cat.k} className="bg-slate-800/40 rounded-xl overflow-hidden border border-slate-800">
              <button
                onClick={() => setCollapsedCats(prev => ({ ...prev, [`prog_${cat.k}`]: !isCollapsed }))}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-widest w-6 text-center" style={{ color: catColor }}>{cat.k}</span>
                  <span className="text-xs font-bold text-white">{cat.n}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black tabular-nums" style={{ color: catColor }}>{catData.ovr}</span>
                  <span className={`text-[10px] font-black tabular-nums px-1.5 rounded ${
                    catDelta > 0 ? 'bg-emerald-500/15 text-emerald-400' :
                    catDelta < 0 ? 'bg-rose-500/15 text-rose-400' :
                    'bg-slate-700/50 text-slate-500'
                  }`}>
                    {catDelta > 0 ? '+' : ''}{catDelta}
                  </span>
                  {isCollapsed ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronUp size={12} className="text-slate-500" />}
                </div>
              </button>
              {!isCollapsed && (
                <div className="px-3 pb-2 pt-1 border-t border-slate-700/50 space-y-1">
                  {cat.sub.map((subName, idx) => {
                    const currentValue = catData.sub[idx] ?? 50;
                    const previousValue = snapshotData.sub[idx] ?? currentValue;
                    const diff = currentValue - previousValue;
                    const color = getRatingColor(currentValue);
                    return (
                      <div key={subName} className="flex items-center gap-2 py-0.5">
                        <span className="text-[10px] text-slate-400 w-28 flex-shrink-0 truncate">{subName}</span>
                        <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${currentValue}%`, backgroundColor: color }} />
                        </div>
                        <span className="text-[10px] font-black w-8 text-right tabular-nums" style={{ color }}>{currentValue}</span>
                        <span className={`text-[10px] font-black w-10 text-right tabular-nums px-1.5 rounded ${
                          diff > 0 ? 'bg-emerald-500/10 text-emerald-400' :
                          diff < 0 ? 'bg-rose-500/10 text-rose-400' :
                          'text-slate-600'
                        }`}>
                          {diff > 0 ? '+' : ''}{diff || 0}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">
            Skill Radar · Now vs {snapshotInfo.label}
          </span>
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest">
            <span className="flex items-center gap-1 text-blue-400">
              <span className="w-2 h-2 rounded-full bg-blue-500" />Now
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <span className="w-2 h-0.5 bg-slate-500" />{snapshotInfo.label}
            </span>
          </div>
        </div>
        <RadarCompareChart current={radarValues} previous={snapshotRadarValues} />
      </div>

      {mentorEntries.length > 0 && (
        <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Mentors</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 tabular-nums">
              {mentorEntries.length} {mentorEntries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <div className="space-y-2">
            {mentorEntries
              .slice()
              .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
              .map((entry, idx) => {
                const mentor = entry.mentor;
                const isActive = !entry.endDate;
                const startStr = formatMentorDate(entry.startDate);
                const endStr = isActive ? 'PRESENT' : formatMentorDate(entry.endDate);
                return (
                  <div
                    key={`${entry.mentorId}-${idx}`}
                    className={`relative p-3 rounded-xl border ${
                      isActive ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-slate-950/40 border-slate-800'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-indigo-500 text-[8px] font-black uppercase tracking-widest text-white">
                        Active
                      </div>
                    )}
                    <div className="flex items-start gap-3">
                      <PlayerPortrait imgUrl={mentor?.imgURL} playerName={mentor?.name ?? 'Unknown'} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-white truncate">{mentor?.name ?? 'Unknown mentor'}</div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{mentor?.pos ?? '—'}</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1 tabular-nums">
                          {startStr} <span className="text-slate-700 mx-1">→</span> {endStr}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">EXP</span>
                        <span className={`text-xl font-black tabular-nums ${isActive ? 'text-indigo-300' : 'text-slate-300'}`}>
                          {mentor?.mentorExp != null ? Math.round(mentor.mentorExp) : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </>
  );
};
