import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  K2_CATS, getRadarValues, RADAR_AXES,
} from '../../../services/simulation/convert2kAttributes';
import { convertTo2KRating, getTimelineK2Rating } from '../../../utils/helpers';
import type { NBAPlayer } from '../../../types';
import { useGame } from '../../../store/GameContext';
import {
  ensurePlayerRatingData,
  resolvePlayerRatingBundle,
  usePlayerRatingStore,
} from '../../../store/playerRatingStore';
import { getScoutedDisplayOverall, getScoutedDisplayPotential, getScoutedK2Data, fuzzRatingValue } from '../../../utils/scoutingFuzz';
import {
  ensureBiosLoaded,
  getNativeHistoricalRatingsForIdentity,
} from '../../../data/realPlayerDataFetcher';
import { getHistoricalNbaCompletedSeasonCutoff } from '../../../services/playerDevelopment/hofHistoryWindow';
import { alignCurrentDisplayOverall, buildRatingProgressionSeries } from '../../../services/playerDevelopment/progressionTimeline';

// ─── Radar ───────────────────────────────────────────────────────────────────

function BioRadarChart({ values }: { values: number[] }) {
  const cx = 250, cy = 250, maxR = 180, n = 7;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) => ({ x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) });
  const polyPoints = (r: number) => Array.from({ length: n }, (_, i) => pt(i, r)).map(p => `${p.x},${p.y}`).join(' ');
  const scale = (v: number) => ((v - 25) / 74) * maxR;
  const dataPoints = values.map((v, i) => pt(i, scale(Math.max(25, Math.min(99, v)))));
  const rc = (val: number) => val >= 90 ? '#3b82f6' : val >= 80 ? '#22c55e' : val >= 70 ? '#eab308' : val >= 50 ? '#f97316' : '#f43f5e';
  const axisLabelPt = (i: number) => pt(i, maxR + 28);
  return (
    <svg viewBox="0 0 500 500" width="100%" className="max-w-xs mx-auto">
      {[0.33, 0.66, 1].map(frac => <polygon key={frac} points={polyPoints(maxR * frac)} fill="none" stroke="#334155" strokeWidth="1" />)}
      {Array.from({ length: n }, (_, i) => { const tip = pt(i, maxR); return <line key={i} x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="#334155" strokeWidth="1" />; })}
      <polygon points={dataPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="rgba(59,130,246,0.25)" stroke="#3b82f6" strokeWidth="2" />
      {dataPoints.map((p, i) => <circle key={`d${i}`} cx={p.x} cy={p.y} r="4" fill="#3b82f6" />)}
      {dataPoints.map((p, i) => {
        const v = values[i]; const color = rc(v);
        return <g key={`v${i}`}><circle cx={p.x} cy={p.y} r="11" fill="#0f172a" stroke={color} strokeWidth="1.5" /><text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="9" fontWeight="bold" fill={color}>{v}</text></g>;
      })}
      {Array.from({ length: n }, (_, i) => {
        const lp = axisLabelPt(i);
        const anchor: 'start' | 'middle' | 'end' = lp.x < cx - 20 ? 'end' : lp.x > cx + 20 ? 'start' : 'middle';
        return <text key={`l${i}`} x={lp.x} y={lp.y} textAnchor={anchor} fontSize="11" fontWeight="600" fill="#94a3b8">{RADAR_AXES[i]}</text>;
      })}
    </svg>
  );
}

function RatingBar({ value, label, getRatingColor }: { value: number; label: string; getRatingColor: (v: number) => string }) {
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

// ─── Public component ────────────────────────────────────────────────────────

interface PlayerBioRatingsTabProps {
  player: NBAPlayer;
  currentYear: number;
  teamColor: string;
}

const K2_CAT_COLORS: Record<string, string> = {
  OS: '#f97316', AT: '#22c55e', IS: '#ef4444',
  PL: '#3b82f6', DF: '#8b5cf6', RB: '#eab308',
  MI: '#06b6d4',
};

function getRatingColor(val: number): string {
  if (val >= 90) return '#3b82f6';
  if (val >= 80) return '#22c55e';
  if (val >= 70) return '#eab308';
  if (val >= 50) return '#f97316';
  return '#f43f5e';
}

const MON = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Check if a hex color is too dark for dark backgrounds */
function ensureVisibleColor(hex: string): string {
  if (!hex || hex.length < 4) return '#6366f1';
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  // Relative luminance (ITU-R BT.709)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.25 ? '#e2e8f0' : hex; // swap to light slate if too dark
}

export const PlayerBioRatingsTab: React.FC<PlayerBioRatingsTabProps> = ({ player, currentYear, teamColor: rawTeamColor }) => {
  const { state } = useGame();
  const teamColor = ensureVisibleColor(rawTeamColor);
  const ratingVersion = usePlayerRatingStore(s => s.version);
  const [period, setPeriod] = React.useState<'Career' | '3Y' | '1Y'>('Career');
  const [collapsedCats, setCollapsedCats] = React.useState<Record<string, boolean>>({});
  const [nativeRatingHistory, setNativeRatingHistory] = React.useState<NonNullable<NBAPlayer['ratings']>>([]);
  const toggleCat = (k: string) => setCollapsedCats(prev => ({ ...prev, [k]: !prev[k] }));

  React.useEffect(() => {
    ensurePlayerRatingData();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setNativeRatingHistory([]);
    if (state.leagueType === 'fictional') return () => { cancelled = true; };
    const cutoff = getHistoricalNbaCompletedSeasonCutoff({
      currentYear,
      leagueType: state.leagueType,
      moddedLeagueBase: state.moddedLeagueBase,
      nbaStartYear: state.nbaStartYear,
    }) ?? currentYear;
    ensureBiosLoaded()
      .then(() => {
        if (!cancelled) setNativeRatingHistory(getNativeHistoricalRatingsForIdentity(player, cutoff));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentYear, player.internalId, player.name, player.srID, state.leagueType, state.moddedLeagueBase, state.nbaStartYear]);

  const visibleRatings = React.useMemo(() => {
    const bySeason = new Map<number, NonNullable<NBAPlayer['ratings']>[number]>();
    for (const rating of nativeRatingHistory) bySeason.set(Number(rating.season), rating);
    for (const rating of player.ratings ?? []) bySeason.set(Number(rating.season), rating);
    return [...bySeason.values()].sort((left, right) => Number(left.season) - Number(right.season));
  }, [nativeRatingHistory, player.ratings]);

  const ratingBundle = React.useMemo(() => {
    return resolvePlayerRatingBundle(player, currentYear, currentYear);
  }, [player, currentYear, ratingVersion]);
  const currentRating = ratingBundle.currentRatings;
  const k2 = ratingBundle.displayK2;
  const fuzzedK2 = React.useMemo(
    () => getScoutedK2Data(state, player, k2),
    [k2, state, player],
  );
  const overall2k = getScoutedDisplayOverall(state, player, currentYear);

  const attrKeys = ['stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'];
  const ratingHistory = (() => {
    const ovrHist: any[] = (player as any).ovrHistory ?? [];
    const ovrHistSeasons = new Set(ovrHist.map((h: any) => h.season));
    const _h = currentRating?.hgt ?? 50;
    const _t = currentRating?.tp;

    // Step 1: Historical seasons from ratings[] (BBGM pre-game data — 2020, 2021, etc.)
    // Only include seasons NOT already in ovrHistory (ovrHistory is more accurate for sim years)
    const ratingsEntries = visibleRatings
      .filter((r: any) => r.season != null && !ovrHistSeasons.has(r.season))
      .filter((r: any) => !player.retiredYear || r.season <= player.retiredYear)
      .sort((a: any, b: any) => a.season - b.season)
      .map((r: any) => {
        const baseOvr = (r.ovr && r.ovr > 0 && r.ovr <= 100)
          ? r.ovr
          : Math.round(attrKeys.reduce((s: number, k: string) => s + (r[k] ?? 50), 0) / attrKeys.length);
        return {
          season: r.season as number,
          label: `'${String(r.season).slice(-2)}`,
          ovr: fuzzRatingValue(convertTo2KRating(baseOvr, r.hgt ?? 50, r.tp), state, player, 'ovr'),
        };
      });

    // Step 2: Sim-generated seasons from ovrHistory[] (snapshotted at each rollover)
    const ovrEntries = ovrHist
      .filter((h: any) => !player.retiredYear || h.season <= player.retiredYear)
      .sort((a: any, b: any) => a.season - b.season)
      .map((h: any) => ({
        season: h.season as number,
        label: `'${String(h.season).slice(-2)}`,
        ovr: fuzzRatingValue(convertTo2KRating(h.ovr, _h, _t), state, player, 'ovr'),
      }));

    // Step 3: Merge, sort, dedupe by season
    const merged = [...ratingsEntries, ...ovrEntries].sort((a, b) => a.season - b.season);
    const seen = new Set<number>();
    const deduped = merged.filter(e => { if (seen.has(e.season)) return false; seen.add(e.season); return true; });

    // Step 4: Append current season if not yet snapshotted (skip for retired players)
    if (!player.retiredYear) {
      const lastSeason = deduped[deduped.length - 1]?.season;
      if (lastSeason !== currentYear) {
        deduped.push({ season: currentYear, label: `'${String(currentYear).slice(-2)}`, ovr: overall2k });
      } else {
        // Update last entry to current live OVR
        deduped[deduped.length - 1] = { ...deduped[deduped.length - 1], ovr: overall2k };
      }
    }

    return deduped.map(e => ({ season: e.label, ovr: e.ovr }));
  })();

  const _hgt = currentRating?.hgt ?? 50;
  const _tp  = currentRating?.tp  ?? 50;
  const weeklyTimeline = buildRatingProgressionSeries(player, state.date)
    .filter((s: { date: string; ovr: number }) => {
      if (!player.retiredYear) return true;
      const dateYear = parseInt(s.date.split('-')[0]);
      return dateYear <= player.retiredYear;
    })
    .map((s: { date: string; ovr: number }) => {
      const [, mm, dd] = s.date.split('-');
      return {
        season: `${MON[parseInt(mm)]} ${parseInt(dd)}`,
        ovr: fuzzRatingValue(getTimelineK2Rating(s, _hgt, _tp), state, player, 'ovr'),
      };
    });
  const alignedWeeklyTimeline = player.retiredYear
    ? weeklyTimeline
    : alignCurrentDisplayOverall(weeklyTimeline, overall2k);
  const weeklyData = alignedWeeklyTimeline;

  const rawChartData = period === 'Career' ? ratingHistory
    : period === '3Y' ? ratingHistory.slice(-3)
    : weeklyData.length > 0 ? weeklyData : ratingHistory.slice(-1);
  const chartData = rawChartData.length >= 2
    ? rawChartData
    : rawChartData.length === 1
      ? [{ season: 'yr-1', ovr: rawChartData[0].ovr }, rawChartData[0]]
      : [{ season: 'yr-1', ovr: overall2k }, { season: 'now', ovr: overall2k }];

  const prevSeasonOvr = ratingHistory[ratingHistory.length - 2]?.ovr ?? overall2k;
  const delta = overall2k - prevSeasonOvr;
  const deltaColor = delta > 0 ? '#22c55e' : delta < 0 ? '#f43f5e' : '#64748b';

  const pot = getScoutedDisplayPotential(state, player, currentYear, currentYear);
  const potColor = pot >= 90 ? '#3b82f6' : pot >= 80 ? '#22c55e' : pot >= 70 ? '#eab308' : '#94a3b8';

  const radarValues = getRadarValues(fuzzedK2, overall2k);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Radar + chart */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <BioRadarChart values={radarValues} />
        </div>
        <div className="flex-1 min-w-0 bg-slate-800/30 border border-slate-800 rounded-xl p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex gap-1">
              {(['Career', '3Y', '1Y'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md transition-all ${period === p ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}>
                  {p}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">OVR</span>
                <span className="text-sm font-black leading-none" style={{ color: getRatingColor(overall2k) }}>{overall2k}</span>
              </div>
              <span className="text-xs font-black" style={{ color: deltaColor }}>{delta > 0 ? '+' : ''}{delta}</span>
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">POT</span>
                <span className="text-sm font-black leading-none" style={{ color: potColor }}>{pot}</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="season" tick={{ fill: '#64748b', fontSize: 8, fontWeight: 700 }} axisLine={false} tickLine={false}
                interval={period === '1Y' ? Math.floor(chartData.length / 6) : 0} />
              <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: '#64748b', fontSize: 8 }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => Math.round(v).toString()} />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }}
                labelStyle={{ color: '#94a3b8', fontWeight: 700 }}
                formatter={(val: any) => [`${Math.round(val)} OVR`, '']}
              />
              <Line type="monotone" dataKey="ovr" stroke={teamColor || '#6366f1'} strokeWidth={2}
                dot={period === '1Y' ? false : { fill: teamColor || '#6366f1', r: 2.5, strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {fuzzedK2 ? (
          <div className="space-y-3">
            {K2_CATS.map(cat => {
              const catData = (fuzzedK2 as any)[cat.k];
              const isCollapsed = collapsedCats[cat.k] ?? false;
              const catColor = getRatingColor(catData.ovr);
              const accentColor = K2_CAT_COLORS[cat.k];
              return (
                <div key={cat.k} className="bg-slate-800/50 rounded-2xl overflow-hidden border border-slate-800">
                  <button onClick={() => toggleCat(cat.k)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black uppercase tracking-widest w-6 text-center" style={{ color: accentColor }}>{cat.k}</span>
                      <span className="text-sm font-bold text-white">{cat.n}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black" style={{ color: catColor }}>{catData.ovr}</span>
                      {isCollapsed ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronUp size={14} className="text-slate-500" />}
                    </div>
                  </button>
                  {!isCollapsed && (
                    <div className="px-4 pb-3 pt-1 border-t border-slate-700/50">
                      {cat.sub.map((subName, idx) => (
                        <RatingBar key={subName} value={catData.sub[idx] ?? 50} label={subName} getRatingColor={getRatingColor} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
      ) : <div className="text-center py-8 text-slate-600 text-sm">No rating data available.</div>}
    </div>
  );
};
