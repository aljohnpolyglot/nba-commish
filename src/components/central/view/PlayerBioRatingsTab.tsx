import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  calculateK2, K2_CATS, getRadarValues, RADAR_AXES,
} from '../../../services/simulation/convert2kAttributes';
import { applyLeagueDisplayScale } from '../../../hooks/useLeagueScaledRatings';
import { convertTo2KRating } from '../../../utils/helpers';
import { getDisplayPotential } from '../../../utils/playerRatings';
import { getRealDurability, applyDurabilityToK2 } from '../../../utils/durabilityUtils';
import type { NBAPlayer } from '../../../types';

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

const BBGM_LABELS: Record<string, string> = {
  spd: 'Speed', jmp: 'Jumping', endu: 'Endurance', ins: 'Inside Scoring',
  dnk: 'Dunking', ft: 'Free Throw', fg: 'Mid-Range', tp: 'Three-Point',
  oiq: 'Off. IQ', diq: 'Def. IQ', drb: 'Dribbling', pss: 'Passing',
  reb: 'Rebounding', stre: 'Strength', hgt: 'Height',
};
const BBGM_ALL = ['hgt', 'ins', 'dnk', 'ft', 'fg', 'tp', 'spd', 'jmp', 'endu', 'stre', 'oiq', 'diq', 'drb', 'pss', 'reb'];

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
  const teamColor = ensureVisibleColor(rawTeamColor);
  const [view, setView] = React.useState<'K2' | 'Simple'>('K2');
  const [period, setPeriod] = React.useState<'Career' | '3Y' | '1Y'>('Career');
  const [collapsedCats, setCollapsedCats] = React.useState<Record<string, boolean>>({});
  const toggleCat = (k: string) => setCollapsedCats(prev => ({ ...prev, [k]: !prev[k] }));

  const currentRating = player.ratings?.find((r: any) => r.season === currentYear) ?? player.ratings?.[player.ratings.length - 1];
  const prevRating = player.ratings?.find((r: any) => r.season === currentYear - 1);

  const scaledRatingForK2 = currentRating ? applyLeagueDisplayScale(player.status, currentRating) : null;
  const k2 = React.useMemo(() => {
    if (!scaledRatingForK2) return null;
    const raw = calculateK2(scaledRatingForK2 as any, { pos: player.pos, heightIn: player.hgt, weightLbs: player.weight, age: player.age });
    // Durability is sourced from injury history (see durabilityUtils), not K2
    return applyDurabilityToK2(raw, getRealDurability(player));
  }, [scaledRatingForK2, player.pos, player.hgt, player.weight, player.age, player.name, player.durability, player.stats]);

  const overall2k = convertTo2KRating(
    player.overallRating ?? 60,
    currentRating?.hgt ?? 50,
    currentRating?.tp ?? 50,
  );

  const attrKeys = ['stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'];
  const ratingHistory = (() => {
    const ovrHist: any[] = (player as any).ovrHistory ?? [];
    const ovrHistSeasons = new Set(ovrHist.map((h: any) => h.season));
    const _h = currentRating?.hgt ?? 50;
    const _t = currentRating?.tp;

    // Step 1: Historical seasons from ratings[] (BBGM pre-game data — 2020, 2021, etc.)
    // Only include seasons NOT already in ovrHistory (ovrHistory is more accurate for sim years)
    const ratingsEntries = (player.ratings ?? [])
      .filter((r: any) => r.season != null && !ovrHistSeasons.has(r.season))
      .sort((a: any, b: any) => a.season - b.season)
      .map((r: any) => {
        const baseOvr = (r.ovr && r.ovr > 0 && r.ovr <= 100)
          ? r.ovr
          : Math.round(attrKeys.reduce((s: number, k: string) => s + (r[k] ?? 50), 0) / attrKeys.length);
        return { season: r.season as number, label: `'${String(r.season).slice(-2)}`, ovr: convertTo2KRating(baseOvr, r.hgt ?? 50, r.tp) };
      });

    // Step 2: Sim-generated seasons from ovrHistory[] (snapshotted at each rollover)
    const ovrEntries = ovrHist
      .sort((a: any, b: any) => a.season - b.season)
      .map((h: any) => ({ season: h.season as number, label: `'${String(h.season).slice(-2)}`, ovr: convertTo2KRating(h.ovr, _h, _t) }));

    // Step 3: Merge, sort, dedupe by season
    const merged = [...ratingsEntries, ...ovrEntries].sort((a, b) => a.season - b.season);
    const seen = new Set<number>();
    const deduped = merged.filter(e => { if (seen.has(e.season)) return false; seen.add(e.season); return true; });

    // Step 4: Append current season if not yet snapshotted
    const lastSeason = deduped[deduped.length - 1]?.season;
    if (lastSeason !== currentYear) {
      deduped.push({ season: currentYear, label: `'${String(currentYear).slice(-2)}`, ovr: overall2k });
    } else {
      // Update last entry to current live OVR
      deduped[deduped.length - 1] = { ...deduped[deduped.length - 1], ovr: overall2k };
    }

    return deduped.map(e => ({ season: e.label, ovr: e.ovr }));
  })();

  const _hgt = currentRating?.hgt ?? 50;
  const _tp  = currentRating?.tp  ?? 50;
  const weeklyData = (player.ovrTimeline ?? []).map((s: { date: string; ovr: number }) => {
    const [, mm, dd] = s.date.split('-');
    return { season: `${MON[parseInt(mm)]} ${parseInt(dd)}`, ovr: convertTo2KRating(s.ovr, _hgt, _tp) };
  });

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

  // Canonical POT — same as PlayerRatingsView / everywhere else.
  const pot = getDisplayPotential(player, currentYear);
  const potColor = pot >= 90 ? '#3b82f6' : pot >= 80 ? '#22c55e' : pot >= 70 ? '#eab308' : '#94a3b8';

  const radarValues = k2 ? getRadarValues(k2, overall2k) : Array(7).fill(60);

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

      {/* K2 / Simple toggle */}
      <div className="flex rounded-xl overflow-hidden border border-slate-700">
        {(['K2', 'Simple'] as const).map(tab => (
          <button key={tab} onClick={() => setView(tab)}
            className={`flex-1 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
              view === tab
                ? tab === 'K2' ? 'bg-sky-600 text-white' : 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {view === 'K2' && (
        k2 ? (
          <div className="space-y-3">
            {K2_CATS.map(cat => {
              const catData = (k2 as any)[cat.k];
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
        ) : <div className="text-center py-8 text-slate-600 text-sm">No rating data available.</div>
      )}

      {view === 'Simple' && currentRating && (
        <div className="space-y-1">
          {BBGM_ALL.map(attr => {
            const val = Math.round(currentRating[attr] ?? 0);
            const prevVal = prevRating ? Math.round(prevRating[attr] ?? 0) : null;
            const d = prevVal !== null ? val - prevVal : null;
            return (
              <div key={attr} className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-28 shrink-0">{BBGM_LABELS[attr] ?? attr}</span>
                <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${val}%`, backgroundColor: getRatingColor(val) }} />
                </div>
                <span className="text-xs font-black w-7 text-right shrink-0" style={{ color: getRatingColor(val) }}>{val}</span>
                <span className={`text-[9px] font-black w-8 text-right shrink-0 ${d !== null && d > 0 ? 'text-emerald-400' : d !== null && d < 0 ? 'text-rose-400' : 'text-transparent'}`}>
                  {d !== null && d !== 0 ? `${d > 0 ? '+' : ''}${d}` : '—'}
                </span>
              </div>
            );
          })}
          {/* Durability — derived from real injury data (90 = iron man ceiling) */}
          {(() => {
            const rawDur = getRealDurability(player) ?? 70;
            const durVal = Math.max(0, Math.min(99, rawDur));
            const barPct = (durVal / 99) * 100;
            return (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800">
                <span className="text-[10px] text-slate-400 w-28 shrink-0">Durability</span>
                <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${barPct}%`, backgroundColor: getRatingColor(durVal) }} />
                </div>
                <span className="text-xs font-black w-7 text-right shrink-0" style={{ color: getRatingColor(durVal) }}>{durVal}</span>
                <span className="text-[9px] text-slate-600 w-8 text-right shrink-0">inj.</span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
