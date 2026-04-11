import React, { useState, useEffect, useMemo } from 'react';
import { NBAPlayer, Game } from '../../../types';
import { ArrowLeft, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { calculateK2, K2_CATS, getRadarValues, RADAR_AXES } from '../../../services/simulation/convert2kAttributes';
import { applyLeagueDisplayScale } from '../../../hooks/useLeagueScaledRatings';
import { convertTo2KRating } from '../../../utils/helpers';
import { useGame } from '../../../store/GameContext';
import { AwardsView } from './AwardsView';
import { PlayerBioHero } from './PlayerBioHero';
import { TabBar } from '../../shared/ui/TabBar';
import { BoxScoreModal } from '../../modals/BoxScoreModal';

interface PlayerBioViewProps {
  player: NBAPlayer;
  onBack: () => void;
  onGameClick?: (game: Game) => void;
  onTeamClick?: (teamId: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

import { memCache, isCacheValid, fetchWithDedup, prefetchPlayerBio, getPlayerImage, getNonNBABioData } from './bioCache';
import { ensureNonNBAFetched, getNonNBAGistData } from './nonNBACache';
import { extractNbaId, hdPortrait } from '../../../utils/helpers';

// Request queue — max 1 concurrent fetch to avoid AllOrigins rate limits
const MAX_CONCURRENT = 1;

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function deepGet(obj: any, ...paths: string[][]): any {
  for (const path of paths) {
    try {
      let cur = obj;
      for (const key of path) { cur = cur[key]; if (cur == null) break; }
      if (cur != null) return cur;
    } catch (_) {}
  }
  return null;
}

const getBestStat = (stats: any[] | undefined, season: number) => {
  if (!stats) return undefined;
  const seasonStats = stats.filter(s => s.season === season && !s.playoffs);
  if (seasonStats.length === 0) return undefined;
  return seasonStats.reduce((prev, current) => (prev.gp >= current.gp) ? prev : current);
};

function calcAge(birthStr: string, currentYear: number): { label: string; age: string } {
  const bD = new Date(birthStr);
  let age  = currentYear - bD.getFullYear();
  // We don't have a precise sim date anymore, so we'll just use the year difference
  // or a default month/day if we want to be fancy.
  return {
    label: bD.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    age:   `${age} years`,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// CACHE VALIDITY
// A cache entry is only trusted if it actually has bio text.
// Birthdate/country alone (from old partial fetches) is NOT a valid hit.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CORE FETCH  (pure async — shared by prefetch + component)
// ────

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICATED FETCH WRAPPER
// Both prefetch() and the component call this so only one HTTP request fires
// per player regardless of how many callers are waiting.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC PREFETCH API
//
// Call from your roster/player-list component to warm the cache for visible
// players before the user taps through. Import like:
//
//   import { prefetchPlayerBio } from './PlayerBioView';
//
//   useEffect(() => {
//     visiblePlayers.slice(0, 10).forEach(p => prefetchPlayerBio(p));
//   }, [visiblePlayers]);
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// PROGRESSION TAB COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ProgressionTabProps {
  ratingHistory: { season: string; ovr: number }[];
  ovrTimeline: { date: string; ovr: number }[];
  k2: ReturnType<typeof calculateK2> | null;
  currentRating: any;
  prevRating: any;
  teamColor: string | undefined;
  radarValues: number[];
  K2_CAT_COLORS: Record<string, string>;
  getRatingColor: (val: number) => string;
  BBGM_LABELS: Record<string, string>;
  BBGM_ALL: string[];
  pot: number;
  currentK2Ovr: number;
}

// Inline radar chart
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

function ProgressionRatingBar({ value, label, getRatingColor }: { value: number; label: string; getRatingColor: (v: number) => string }) {
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

function ProgressionTabContent({
  ratingHistory, ovrTimeline, k2, currentRating, prevRating, teamColor,
  radarValues, K2_CAT_COLORS, getRatingColor, BBGM_LABELS, BBGM_ALL,
  pot, currentK2Ovr,
}: ProgressionTabProps) {
  const [view, setView] = React.useState<'K2' | 'Simple'>('K2');
  const [period, setPeriod] = React.useState<'Career' | '3Y' | '1Y'>('Career');
  const [collapsedCats, setCollapsedCats] = React.useState<Record<string, boolean>>({});
  const toggleCat = (k: string) => setCollapsedCats(prev => ({ ...prev, [k]: !prev[k] }));

  // 1Y: use weekly ovrTimeline snapshots (raw BBGM float → K2 float for smooth trend)
  const MON = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const weeklyData = ovrTimeline.map((s: { date: string; ovr: number }) => {
    const [, mm, dd] = s.date.split('-');
    return {
      season: `${MON[parseInt(mm)]} ${parseInt(dd)}`,
      ovr: parseFloat((0.88 * s.ovr + 31).toFixed(2)), // K2 float — preserves sub-1pt trends
    };
  });
  const rawChartData = period === 'Career' ? ratingHistory
    : period === '3Y' ? ratingHistory.slice(-3)
    : weeklyData.length > 0 ? weeklyData : ratingHistory.slice(-1);
  // Always show chart — pad to 2 points with a flat line if not enough history
  const chartData = rawChartData.length >= 2
    ? rawChartData
    : rawChartData.length === 1
      ? [{ season: 'yr-1', ovr: rawChartData[0].ovr }, rawChartData[0]]
      : [{ season: 'yr-1', ovr: currentK2Ovr }, { season: 'now', ovr: currentK2Ovr }];

  const prevSeasonOvr = ratingHistory[ratingHistory.length - 2]?.ovr ?? currentK2Ovr;
  const delta = currentK2Ovr - prevSeasonOvr;
  const deltaColor = delta > 0 ? '#22c55e' : delta < 0 ? '#f43f5e' : '#64748b';
  const potColor = pot >= 90 ? '#3b82f6' : pot >= 80 ? '#22c55e' : pot >= 70 ? '#eab308' : '#94a3b8';

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Spider web + progression chart side by side */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <BioRadarChart values={radarValues} />
        </div>

        {/* Progression chart */}
        <div className="flex-1 min-w-0 bg-slate-800/30 border border-slate-800 rounded-xl p-3 flex flex-col">
          {/* Header row: period toggle + OVR badges */}
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex gap-1">
              {(['Career', '3Y', '1Y'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md transition-all ${
                    period === p ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {/* OVR + delta */}
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">OVR</span>
                <span className="text-sm font-black leading-none" style={{ color: getRatingColor(currentK2Ovr) }}>{currentK2Ovr}</span>
              </div>
              <span className="text-xs font-black" style={{ color: deltaColor }}>
                {delta > 0 ? '+' : ''}{delta}
              </span>
              {/* POT badge */}
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">POT</span>
                <span className="text-sm font-black leading-none" style={{ color: potColor }}>{pot}</span>
              </div>
            </div>
          </div>

          {/* Chart — always visible, padded to 2 points if needed */}
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="season"
                tick={{ fill: '#64748b', fontSize: 8, fontWeight: 700 }}
                axisLine={false} tickLine={false}
                interval={period === '1Y' ? Math.floor(chartData.length / 6) : 0}
              />
              <YAxis
                domain={['dataMin - 1', 'dataMax + 1']}
                tick={{ fill: '#64748b', fontSize: 8 }}
                axisLine={false} tickLine={false}
                tickFormatter={(v: number) => Math.round(v).toString()}
              />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }}
                labelStyle={{ color: '#94a3b8', fontWeight: 700 }}
                formatter={(val: any) => [`${Math.round(val)} OVR`, '']}
              />
              <Line type="monotone" dataKey="ovr" stroke={teamColor || '#6366f1'} strokeWidth={2}
                dot={period === '1Y' ? false : { fill: teamColor || '#6366f1', r: 2.5, strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* K2 / Simple tab strip */}
      <div className="flex rounded-xl overflow-hidden border border-slate-700">
        {(['K2', 'Simple'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setView(tab)}
            className={`flex-1 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
              view === tab
                ? tab === 'K2' ? 'bg-sky-600 text-white' : 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
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
                  <button
                    onClick={() => toggleCat(cat.k)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800 transition-colors"
                  >
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
                        <ProgressionRatingBar key={subName} value={catData.sub[idx] ?? 50} label={subName} getRatingColor={getRatingColor} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-600 text-sm">No rating data available.</div>
        )
      )}

      {view === 'Simple' && currentRating && (
        <div className="space-y-1">
          {BBGM_ALL.map(attr => {
            const val = Math.round(currentRating[attr] ?? 0);
            const prevVal = prevRating ? Math.round(prevRating[attr] ?? 0) : null;
            const delta = prevVal !== null ? val - prevVal : null;
            return (
              <div key={attr} className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-28 shrink-0">{BBGM_LABELS[attr] ?? attr}</span>
                <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${val}%`, backgroundColor: getRatingColor(val) }} />
                </div>
                <span className="text-xs font-black w-7 text-right shrink-0" style={{ color: getRatingColor(val) }}>{val}</span>
                <span className={`text-[9px] font-black w-8 text-right shrink-0 ${delta !== null && delta > 0 ? 'text-emerald-400' : delta !== null && delta < 0 ? 'text-rose-400' : 'text-transparent'}`}>
                  {delta !== null && delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const PlayerBioView: React.FC<PlayerBioViewProps> = ({ player, onBack, onGameClick, onTeamClick }) => {
  const { state } = useGame();
  const [bioData,     setBioData]    = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(() => !!extractNbaId(player.imgURL || "", player.name));
  const [fetchDone, setFetchDone] = useState(false);
  const [portraitSrc, setPortraitSrc] = useState<string>(() => getPlayerImage(player) || "");
  const [activeTab, setActiveTab] = useState<'Overview' | 'Historical Data' | 'Game Log' | 'Awards' | 'Ratings'>('Historical Data');
  const [showPlayoffs, setShowPlayoffs] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [gameLogSort, setGameLogSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'date', dir: 'desc' });
  const [localBoxScoreGame, setLocalBoxScoreGame] = useState<Game | null>(null);

  const OPENING_NIGHT_MS = new Date('2025-10-24T00:00:00Z').getTime();

  const gameLog = useMemo(() => {
    const logs: any[] = [];

    // Build earliest-played-game date per team for this player, to avoid showing
    // DNP rows for games that occurred before the player joined the team (post-trade).
    const firstGameForTeam = new Map<number, number>(); // teamId → ms timestamp
    state.boxScores.forEach(game => {
      const isHome = game.homeStats.some(p => p.playerId === player.internalId);
      const isAway = game.awayStats.some(p => p.playerId === player.internalId);
      if (isHome || isAway) {
        const tid = isHome ? game.homeTeamId : game.awayTeamId;
        const ms = (() => { try { return new Date(game.date).getTime(); } catch { return 0; } })();
        if (ms > 0 && (!firstGameForTeam.has(tid) || ms < firstGameForTeam.get(tid)!)) {
          firstGameForTeam.set(tid, ms);
        }
      }
    });

    state.boxScores.forEach(game => {
      const isHome = game.homeStats.some(p => p.playerId === player.internalId);
      const isAway = game.awayStats.some(p => p.playerId === player.internalId);

      if (isHome || isAway) {
        const stats = isHome
          ? game.homeStats.find(p => p.playerId === player.internalId)
          : game.awayStats.find(p => p.playerId === player.internalId);

        if (stats) {
          const teamId = isHome ? game.homeTeamId : game.awayTeamId;
          const oppId = isHome ? game.awayTeamId : game.homeTeamId;
          const team = state.teams.find(t => t.id === teamId);
          const opp = state.teams.find(t => t.id === oppId);

          const schedGame = state.schedule.find((g: any) => g.gid === game.gameId);
          const gameTimeMs = (() => { try { return new Date(game.date).getTime(); } catch { return 0; } })();
          // Never flag as preseason if the game date is on or after opening night
          const isPreseason = gameTimeMs > 0 && gameTimeMs < OPENING_NIGHT_MS &&
            (schedGame?.isPreseason === true || !schedGame);

          const isWin = isHome ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
          const resultStr = `${isWin ? 'W' : 'L'}, ${isHome ? game.homeScore : game.awayScore}-${isHome ? game.awayScore : game.homeScore}`;

          const fgm = stats.fgm || 0;
          const fga = stats.fga || 0;
          const tpm = stats.threePm || 0;
          const tpa = stats.threePa || 0;
          const ftm = stats.ftm || 0;
          const fta = stats.fta || 0;

          const twom = fgm - tpm;
          const twoa = fga - tpa;

          const fgp = fga > 0 ? (fgm / fga).toFixed(3).replace(/^0+/, '') : '.000';
          const tpp = tpa > 0 ? (tpm / tpa).toFixed(3).replace(/^0+/, '') : '.000';
          const twop = twoa > 0 ? (twom / twoa).toFixed(3).replace(/^0+/, '') : '.000';
          const efgp = fga > 0 ? ((fgm + 0.5 * tpm) / fga).toFixed(3).replace(/^0+/, '') : '.000';
          const ftp = fta > 0 ? (ftm / fta).toFixed(3).replace(/^0+/, '') : '.000';

          const isAllStarGame = !!(schedGame?.isAllStar);

          logs.push({
            date: game.date,
            isPreseason,
            isAllStar: isAllStarGame,
            isDNP: false,
            gameId: game.gameId,
            teamId,
            oppTeamId: oppId,
            teamAbbrev: isAllStarGame ? 'ASG' : (team?.abbrev || 'UNK'),
            isAway: !isHome,
            oppAbbrev: isAllStarGame ? 'ASG' : (opp?.abbrev || 'UNK'),
            result: game.isOT
              ? `${resultStr}${game.otCount && game.otCount > 1 ? ` ${game.otCount}OT` : ' OT'}`
              : resultStr,
            isWin,
            gs: stats.gs > 0,
            mp: Math.floor(stats.min) + ':' + String(Math.floor((stats.min % 1) * 60)).padStart(2, '0'),
            fgm, fga, fgp,
            tpm, tpa, tpp,
            twom, twoa, twop,
            efgp,
            ftm, fta, ftp,
            orb: stats.orb || 0,
            drb: stats.drb || 0,
            trb: stats.reb || 0,
            ast: stats.ast || 0,
            stl: stats.stl || 0,
            blk: stats.blk || 0,
            tov: stats.tov || 0,
            pf: stats.pf || 0,
            pts: stats.pts || 0,
            gmsc: (stats.gameScore || 0).toFixed(1),
            plusMinus: stats.pm != null ? stats.pm : null,
          });
        }
      } else if (game.homeTeamId === player.tid || game.awayTeamId === player.tid) {
        const isHomeTeam = game.homeTeamId === player.tid;
        // Skip DNP rows for games that occurred before the player joined this team
        const gameMsDNP = (() => { try { return new Date(game.date).getTime(); } catch { return 0; } })();
        const joinMs = firstGameForTeam.get(player.tid) ?? 0;
        if (gameMsDNP > 0 && joinMs > 0 && gameMsDNP < joinMs) return;
        const oppId = isHomeTeam ? game.awayTeamId : game.homeTeamId;
        const team = state.teams.find(t => t.id === player.tid);
        const opp = state.teams.find(t => t.id === oppId);
        const schedGame = state.schedule.find((g: any) => g.gid === game.gameId);
        const gameMs2 = (() => { try { return new Date(game.date).getTime(); } catch { return 0; } })();
        const isPreseason = gameMs2 > 0 && gameMs2 < OPENING_NIGHT_MS &&
          (schedGame?.isPreseason === true || !schedGame);
        const isWin = isHomeTeam ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
        const score = isHomeTeam
          ? `${game.homeScore}-${game.awayScore}`
          : `${game.awayScore}-${game.homeScore}`;
        logs.push({
          date: game.date,
          isPreseason,
          isDNP: true,
          gameId: game.gameId,
          teamId: player.tid,
          oppTeamId: oppId,
          dnpReason: game.playerDNPs?.[player.internalId] ??
            ((player.injury?.gamesRemaining ?? 0) > 0
              ? `DNP — Injury (${player.injury!.type})`
              : "DNP — Coach's Decision"),
          teamAbbrev: team?.abbrev || 'UNK',
          isAway: !isHomeTeam,
          oppAbbrev: opp?.abbrev || 'UNK',
          result: game.isOT
            ? `${isWin ? 'W' : 'L'}, ${score}${game.otCount && game.otCount > 1 ? ` ${game.otCount}OT` : ' OT'}`
            : `${isWin ? 'W' : 'L'}, ${score}`,
          isWin,
          gs: false,
          mp: '—', fgm: 0, fga: 0, fgp: '—', tpm: 0, tpa: 0, tpp: '—',
          twom: 0, twoa: 0, twop: '—', efgp: '—', ftm: 0, fta: 0, ftp: '—',
          orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0,
          gmsc: '—', plusMinus: null,
        });
      }
    });

    const reversed = logs.reverse();
    const rsTotal = reversed.filter(l => !l.isPreseason && !l.isDNP).length;
    let rsRank = rsTotal;
    return reversed.map(l => ({
      ...l,
      rank: l.isPreseason || l.isDNP ? null : rsRank--,
    }));
  }, [state.boxScores, state.schedule, player.internalId, player.tid, player.injury, state.teams]);

  const sortedGameLog = useMemo(() => {
    return [...gameLog].sort((a, b) => {
      const dir = gameLogSort.dir === 'asc' ? 1 : -1;
      if (gameLogSort.field === 'date') {
        return (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir;
      }
      const getVal = (l: any): number => {
        switch (gameLogSort.field) {
          case 'pts': return l.pts;
          case 'trb': return l.trb;
          case 'ast': return l.ast;
          case 'stl': return l.stl;
          case 'blk': return l.blk;
          case 'tov': return l.tov;
          case 'pf': return l.pf;
          case 'orb': return l.orb;
          case 'drb': return l.drb;
          case 'fgm': return l.fgm;
          case 'fga': return l.fga;
          case 'fgp': return parseFloat('0' + l.fgp) || 0;
          case 'tpm': return l.tpm;
          case 'tpa': return l.tpa;
          case 'tpp': return parseFloat('0' + l.tpp) || 0;
          case 'twom': return l.twom;
          case 'twoa': return l.twoa;
          case 'twop': return parseFloat('0' + l.twop) || 0;
          case 'efgp': return parseFloat('0' + l.efgp) || 0;
          case 'ftm': return l.ftm;
          case 'fta': return l.fta;
          case 'ftp': return parseFloat('0' + l.ftp) || 0;
          case 'gmsc': return parseFloat(l.gmsc) || 0;
          case 'min': {
            if (l.mp === '—') return -1;
            const parts = l.mp.split(':');
            return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
          }
          default: return 0;
        }
      };
      return (getVal(a) - getVal(b)) * dir;
    });
  }, [gameLog, gameLogSort]);

  const team = useMemo(() => {
    const isNBA = !["WNBA","Euroleague","PBA","B-League","G-League","Endesa","Draft Prospect","Prospect"].includes(player.status || "");
    const current = isNBA
      ? state.teams.find(t => t.id === player.tid)
      : state.nonNBATeams.find(t => t.tid === player.tid && t.league === player.status);
    if (current) return current;
    // Retired / Free Agent — use team with most career regular-season GP
    if (isNBA && player.stats?.length) {
      const gpByTid = new Map<number, number>();
      for (const s of player.stats) {
        if (s.playoffs || (s.tid ?? -1) < 0) continue;
        gpByTid.set(s.tid, (gpByTid.get(s.tid) ?? 0) + (s.gp ?? 0));
      }
      let bestTid = -1, bestGP = 0;
      gpByTid.forEach((gp, tid) => { if (gp > bestGP) { bestGP = gp; bestTid = tid; } });
      if (bestTid >= 0) return state.teams.find(t => t.id === bestTid) ?? null;
    }
    return null;
  }, [player.tid, player.status, player.stats, state.teams, state.nonNBATeams]);

  const teamColor = team?.colors?.[0] || "#CE1141";
  const teamLogo  = (team as any)?.logoUrl || (team as any)?.imgURL;
  // NBATeam.name already includes city ("Cleveland Cavaliers"); NonNBATeam stores region+name separately
  const isNBATeam = !["WNBA","Euroleague","PBA","B-League","G-League","Endesa","Draft Prospect","Prospect"].includes(player.status || "");
  const teamFullName = team
    ? (!isNBATeam && (team as any).region ? `${(team as any).region} ${team.name}`.trim() : team.name)
    : null;

  const maxSeason = useMemo(() => {
    return state.players.reduce((max, p) => {
      const pMax = p.stats?.reduce((m, s) => Math.max(m, s.season), 0) || 0;
      return Math.max(max, pMax);
    }, state.leagueStats.year);
  }, [state.players, state.leagueStats.year]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const run = async () => {
      console.log(`%c[Scout Intel] Opening bio: ${player.name}`, "color:#00d4ff;font-weight:bold");

      // ── 1. Instant BBGM data ─────────────────────────────────────────────
      const curYear = maxSeason;
      const bY = player.born?.year  || 1995;
      const dY = player.draft?.year || 2026;
      const ss = getBestStat(player.stats, curYear);

      const nonNBABio = getNonNBABioData(player);
      const isProspect = player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect';
      // College: use BBGM college field, or parse "School (Yr)" from pre_draft e.g. "North Carolina (Sr)"
      const preDraftRaw = (player as any).pre_draft as string | undefined;
      const collegeName = (player as any).college
        || (preDraftRaw ? preDraftRaw.replace(/\s*\([^)]*\)\s*$/, '').trim() : null)
        || "None";
      // For prospects, show college as team label
      const teamLabel = isProspect ? (collegeName !== "None" ? collegeName : "Draft Prospect") : (teamFullName || "Free Agent");
      const baseData = {
        n: player.name,
        m: `${teamLabel} | #${player.jerseyNumber || "—"} | ${player.pos}`,
        h: player.hgt    ? `${Math.floor(player.hgt / 12)}'${player.hgt % 12}"` : "Unknown",
        w: player.weight ? `${player.weight}lb` : "Unknown",
        c: player.born?.loc || "Unknown",
        s: collegeName,
        a: `${curYear - bY} years`,
        b: `${bY}`,
        d: isProspect
          ? (player.draft?.year ? `Draft Eligible: ${player.draft.year}` : 'Draft Prospect')
          : (player.draft?.year
            ? `${player.draft.year} R${player.draft.round ?? '?'} P${player.draft.pick ?? '?'}`
            : "Undrafted"),
        e: `${curYear - dY} Years`,
        stats: (() => {
          if (ss) {
            const g = ss.gp || 1;
            return {
              PTS: ((ss.pts || 0) / g).toFixed(1),
              REB: (((ss.trb || (ss as any).reb || (ss.orb || 0) + (ss.drb || 0))) / g).toFixed(1),
              AST: ((ss.ast || 0) / g).toFixed(1),
              STL: ((ss.stl || 0) / g).toFixed(1),
              BLK: ((ss.blk || 0) / g).toFixed(1),
            };
          }
          // No current-season stats → compute career averages (retired players)
          const regStats = (player.stats || []).filter((s: any) => !s.playoffs && (s.tid ?? -1) >= 0);
          const tot = regStats.reduce((acc: any, s: any) => ({
            gp:  acc.gp  + (s.gp  || 0),
            pts: acc.pts + (s.pts || 0),
            trb: acc.trb + (s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0))),
            ast: acc.ast + (s.ast || 0),
            stl: acc.stl + (s.stl || 0),
            blk: acc.blk + (s.blk || 0),
          }), { gp: 0, pts: 0, trb: 0, ast: 0, stl: 0, blk: 0 });
          const g = tot.gp || 1;
          return {
            PTS: (tot.pts / g).toFixed(1),
            REB: (tot.trb / g).toFixed(1),
            AST: (tot.ast / g).toFixed(1),
            STL: (tot.stl / g).toFixed(1),
            BLK: (tot.blk / g).toFixed(1),
          };
        })(),
        bio: nonNBABio?.bio || { pro: "", pre: "", per: "" },
      };

      if (isMounted) setBioData(baseData);

      // ── Non-NBA players: enrich hero stats + info + bio from gist ─────────
      if (nonNBABio) {
        if (isMounted) setIsSyncing(true);
        try {
          await ensureNonNBAFetched(player.status!);
          const gist = getNonNBAGistData(player.status!, player.name);
          if (isMounted && gist) {
            setBioData((prev: any) => ({
              ...prev,
              // Override hero stats bar with real league stats
              stats: {
                PTS: gist.stats.PTS,
                REB: gist.stats.REB,
                AST: gist.stats.AST,
                STL: gist.stats.STL ?? prev.stats.STL,
                BLK: gist.stats.BLK ?? prev.stats.BLK,
              },
              // Override info grid fields if gist has better data
              ...(gist.h && { h: gist.h }),
              ...(gist.w && { w: gist.w }),
              ...(gist.c && { c: gist.c }),
              ...(gist.s && { s: gist.s }),
              ...(gist.b && { b: gist.b }),
              ...(gist.a && { a: gist.a }),
              ...(gist.d && { d: gist.d }),
              // Recompute experience from gist draft year when player.draft.year was missing
              ...(gist.d && !player.draft?.year && (() => {
                const m = gist.d!.match(/^(\d{4})/);
                return m ? { e: `${Math.max(0, curYear - parseInt(m[1]))} Years` } : {};
              })()),
              // Bio section
              bio: { pro: gist.proBio || prev.bio.pro, pre: '', per: '' },
            }));
          }
        } catch (_) {}
        if (isMounted) { setIsSyncing(false); setFetchDone(true); }
        return;
      }

      // ── 2. Extract NBA ID ────────────────────────────────────────────────
      const nbaId = extractNbaId(player.imgURL || "", player.name);
      console.log(`%c[Scout Intel] imgURL="${player.imgURL}" → nbaId=${nbaId}`, "color:#94a3b8");

      if (!nbaId) {
        console.log(`%c[Scout Intel] No NBA ID for ${player.name} — BBGM only`, "color:#f59e0b");
        return;
      }

      // Upgrade portrait to HD immediately (before network fetch)
      if (isMounted) setPortraitSrc(hdPortrait(nbaId));

      // ── 3. Fetch (deduped — returns instantly from cache if available) ───
      setIsSyncing(true);
      try {
    const payload = await fetchWithDedup(nbaId);
        if (isMounted) {
          setBioData((prev: any) => ({ ...prev, ...payload }));
          if (payload.imgHD) setPortraitSrc(payload.imgHD);
          console.log(`%c[Scout Intel] Bio applied for ${player.name}`, "color:#10b981;font-weight:bold");
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error(`[Scout Intel] FAILED for ${player.name}:`, err.message);
        }
      } finally {
        if (isMounted) { setIsSyncing(false); setFetchDone(true); }
      }
    };

    run();
    return () => { isMounted = false; controller.abort(); };
  }, [player, team]);

  if (!bioData) return null;

  return (
    <>
    <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] text-white overflow-hidden rounded-[2.5rem] border border-white/10 relative shadow-2xl">
      <button onClick={onBack} className="absolute top-6 left-6 z-50 w-10 h-10 bg-black/50 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors">
        <ArrowLeft size={20} />
      </button>

      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* ── HERO ── */}
        <PlayerBioHero
          bioData={bioData}
          teamColor={teamColor}
          teamLogo={teamLogo}
          teamFullName={teamFullName}
          portraitSrc={portraitSrc}
          playerImgURL={player.imgURL}
          isSyncing={isSyncing}
          fetchDone={fetchDone}
          isHoF={!!player.hof}
        />

        {/* ── TABS ── */}
        <TabBar
          className="px-4 md:px-8 mt-5"
          tabs={[
            { id: 'Historical Data', label: 'Historical Data' },
            { id: 'Ratings',         label: 'Ratings' },
            { id: 'Overview',        label: 'Overview' },
            { id: 'Game Log',        label: 'Game Log' },
            { id: 'Awards',          label: 'Awards' },
          ]}
          active={activeTab}
          onChange={id => setActiveTab(id as typeof activeTab)}
        />

        {activeTab === 'Overview' && (
          <div className="p-6 md:p-12 bg-[#080808]">
            {[
              { title: "Professional Career Report", key: "pro", empty: "Scout report pending official update." },
              { title: "Before NBA / College",        key: "pre", empty: "No historical collegiate data found." },
              { title: "Personal Records",            key: "per", empty: "No personal records on file." },
            ].map(({ title, key, empty }) => (
              <React.Fragment key={key}>
                <div className="flex justify-between items-center mb-6 pb-2 border-b border-white/5">
                  <div className="text-xs font-black uppercase tracking-[3px]" style={{ color: teamColor }}>{title}</div>
                  {key === "pro" && isSyncing && (
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono tracking-widest">
                      <Loader2 size={12} className="animate-spin text-[#00ffaa]" /> SYNCING…
                    </div>
                  )}
                </div>
                <ul className="bio-list mb-12">
                  {(bioData.bio as any)[key]
                    ? <div dangerouslySetInnerHTML={{ __html: (bioData.bio as any)[key] }} />
                    : <li className="text-zinc-600 italic">
                        {fetchDone ? "No data on file for this player." : empty}
                      </li>
                  }
                </ul>
              </React.Fragment>
            ))}
          </div>
        )}
        
        {activeTab === 'Historical Data' && (
          <div className="p-4 md:p-8 bg-[#080808]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                {showPlayoffs ? 'Playoff Stats' : 'Regular Season Stats'}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-colors"
                >
                  {showAdvanced ? 'Basic Stats' : 'Advanced Stats'}
                </button>
                <button
                  onClick={() => setShowPlayoffs(!showPlayoffs)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-colors"
                >
                  Switch to {showPlayoffs ? 'Regular Season' : 'Playoffs'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[60vh] md:max-h-[70vh] custom-scrollbar">
              <table className="w-full text-sm text-left text-slate-300">
                <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Season</th>
                    <th className="px-4 py-3 font-semibold">Team</th>
                    <th className="px-4 py-3 font-semibold text-right">GP</th>
                    <th className="px-4 py-3 font-semibold text-right">GS</th>
                    <th className="px-4 py-3 font-semibold text-right">MIN</th>
                    {!showAdvanced ? (
                      <>
                        <th className="px-4 py-3 font-semibold text-right text-white">PTS</th>
                        <th className="px-4 py-3 font-semibold text-right">ORB</th>
                        <th className="px-4 py-3 font-semibold text-right">DRB</th>
                        <th className="px-4 py-3 font-semibold text-right">REB</th>
                        <th className="px-4 py-3 font-semibold text-right">AST</th>
                        <th className="px-4 py-3 font-semibold text-right">STL</th>
                        <th className="px-4 py-3 font-semibold text-right">BLK</th>
                        <th className="px-4 py-3 font-semibold text-right">TOV</th>
                        <th className="px-4 py-3 font-semibold text-right">PF</th>
                        <th className="px-4 py-3 font-semibold text-right">FGM</th>
                        <th className="px-4 py-3 font-semibold text-right">FGA</th>
                        <th className="px-4 py-3 font-semibold text-right">FG%</th>
                        <th className="px-4 py-3 font-semibold text-right">3PM</th>
                        <th className="px-4 py-3 font-semibold text-right">3PA</th>
                        <th className="px-4 py-3 font-semibold text-right">3P%</th>
                        <th className="px-4 py-3 font-semibold text-right">FTM</th>
                        <th className="px-4 py-3 font-semibold text-right">FTA</th>
                        <th className="px-4 py-3 font-semibold text-right">FT%</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 font-semibold text-right text-white">PER</th>
                        <th className="px-4 py-3 font-semibold text-right">TS%</th>
                        <th className="px-4 py-3 font-semibold text-right">eFG%</th>
                        <th className="px-4 py-3 font-semibold text-right">ORtg</th>
                        <th className="px-4 py-3 font-semibold text-right">DRtg</th>
                        <th className="px-4 py-3 font-semibold text-right">AST%</th>
                        <th className="px-4 py-3 font-semibold text-right">REB%</th>
                        <th className="px-4 py-3 font-semibold text-right">STL%</th>
                        <th className="px-4 py-3 font-semibold text-right">BLK%</th>
                        <th className="px-4 py-3 font-semibold text-right">TOV%</th>
                        <th className="px-4 py-3 font-semibold text-right">USG%</th>
                        <th className="px-4 py-3 font-semibold text-right">OWS</th>
                        <th className="px-4 py-3 font-semibold text-right">DWS</th>
                        <th className="px-4 py-3 font-semibold text-right">WS</th>
                        <th className="px-4 py-3 font-semibold text-right">WS/48</th>
                        <th className="px-4 py-3 font-semibold text-right">OBPM</th>
                        <th className="px-4 py-3 font-semibold text-right">DBPM</th>
                        <th className="px-4 py-3 font-semibold text-right">BPM</th>
                        <th className="px-4 py-3 font-semibold text-right">VORP</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {player.stats?.filter(s => !!s.playoffs === showPlayoffs).map((s, i) => {
                    const t = state.teams.find(team => team.id === s.tid);
                    const gp = s.gp || 1;
                    return (
                      <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">{(s.season - 1)}-{String(s.season).slice(2)}</td>
                        <td className="px-4 py-3">{t?.abbrev || 'FA'}</td>
                        <td className="px-4 py-3 text-right">{s.gp || 0}</td>
                        <td className="px-4 py-3 text-right">{s.gs || 0}</td>
                        <td className="px-4 py-3 text-right">{((s.min || 0) / gp).toFixed(1)}</td>
                        {!showAdvanced ? (
                          <>
                            <td className="px-4 py-3 text-right font-bold text-white">{((s.pts || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">
                              {((s.orb || 0) + (s.drb || 0) > 0) ? ((s.orb || 0) / gp).toFixed(1) : (((s.trb || (s as any).reb || 0)) * 0.22 / gp).toFixed(1)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {((s.orb || 0) + (s.drb || 0) > 0) ? ((s.drb || 0) / gp).toFixed(1) : (((s.trb || (s as any).reb || 0)) * 0.78 / gp).toFixed(1)}
                            </td>
                            <td className="px-4 py-3 text-right">{(((s.trb || (s as any).reb || (s.orb || 0) + (s.drb || 0))) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.ast || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.stl || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.blk || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.tov || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.pf || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.fg || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.fga || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.fga > 0 ? ((s.fg || 0) / s.fga) * 100 : 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.tp || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.tpa || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.tpa > 0 ? ((s.tp || 0) / s.tpa) * 100 : 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.ft || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{((s.fta || 0) / gp).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.fta > 0 ? ((s.ft || 0) / s.fta) * 100 : 0).toFixed(1)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-right font-bold text-white">{(s.per || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.tsPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.efgPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.ortg || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.drtg || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.astPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.rebPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.stlPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.blkPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.tovPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.usgPct || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.ows || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.dws || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.ws || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.ws48 || 0).toFixed(3)}</td>
                            <td className="px-4 py-3 text-right">{(s.obpm || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.dbpm || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.bpm || 0).toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{(s.vorp || 0).toFixed(1)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {!player.stats?.filter(s => !!s.playoffs === showPlayoffs).length && (
                    <tr>
                      <td colSpan={23} className="px-4 py-8 text-center text-slate-500">
                        No historical data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'Game Log' && (
          <div className="p-4 md:p-8 bg-[#080808] flex flex-col" style={{ minHeight: 0 }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                {state.leagueStats.year}-{String(state.leagueStats.year + 1).slice(2)} Game Log
                {gameLog.filter(g => !g.isPreseason && !g.isDNP).length > 0 && (
                  <span className="ml-3 text-xs font-normal text-slate-400 normal-case tracking-normal">
                    {gameLog.filter(g => !g.isPreseason && !g.isDNP).length} regular season games
                  </span>
                )}
              </h3>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[60vh] md:max-h-[70vh] custom-scrollbar">
              <table className="w-full text-sm text-left text-slate-300">
                <thead className="text-[10px] text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800 whitespace-nowrap">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Rk</th>
                    {(['date'] as const).map(field => (
                      <th key={field}
                        className={`px-3 py-2 font-semibold cursor-pointer hover:text-white select-none${gameLogSort.field === field ? ' text-indigo-400' : ''}`}
                        onClick={() => setGameLogSort(s => ({ field, dir: s.field === field && s.dir === 'desc' ? 'asc' : 'desc' }))}
                      >Date{gameLogSort.field === field ? (gameLogSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}</th>
                    ))}
                    <th className="px-3 py-2 font-semibold">Team</th>
                    <th className="px-3 py-2 font-semibold"></th>
                    <th className="px-3 py-2 font-semibold">Opp</th>
                    <th className="px-3 py-2 font-semibold">Result</th>
                    <th className="px-3 py-2 font-semibold">GS</th>
                    {(['min'] as const).map(f => (
                      <th key={f} className={`px-3 py-2 font-semibold text-right cursor-pointer hover:text-white select-none${gameLogSort.field === f ? ' text-indigo-400' : ''}`}
                        onClick={() => setGameLogSort(s => ({ field: f, dir: s.field === f && s.dir === 'desc' ? 'asc' : 'desc' }))}>
                        MP{gameLogSort.field === f ? (gameLogSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                      </th>
                    ))}
                    {(['fgm','fga','fgp','tpm','tpa','tpp','twom','twoa','twop','efgp','ftm','fta','ftp','orb','drb','trb','ast','stl','blk','tov','pf','pts','gmsc'] as const).map(f => {
                      const label: Record<string,string> = { fgm:'FG',fga:'FGA',fgp:'FG%',tpm:'3P',tpa:'3PA',tpp:'3P%',twom:'2P',twoa:'2PA',twop:'2P%',efgp:'eFG%',ftm:'FT',fta:'FTA',ftp:'FT%',orb:'ORB',drb:'DRB',trb:'TRB',ast:'AST',stl:'STL',blk:'BLK',tov:'TOV',pf:'PF',pts:'PTS',gmsc:'GmSc' };
                      return (
                        <th key={f} className={`px-3 py-2 font-semibold text-right cursor-pointer hover:text-white select-none${gameLogSort.field === f ? ' text-indigo-400' : ''}`}
                          onClick={() => setGameLogSort(s => ({ field: f, dir: s.field === f && s.dir === 'desc' ? 'asc' : 'desc' }))}>
                          {label[f]}{gameLogSort.field === f ? (gameLogSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                        </th>
                      );
                    })}
                    <th className="px-3 py-2 font-semibold text-right">+/-</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {sortedGameLog.map((log, i) => {
                    const showPreseasonDivider = gameLogSort.field === 'date' && log.isPreseason && (i === 0 || !sortedGameLog[i - 1].isPreseason);
                    return (
                    <React.Fragment key={i}>
                      {showPreseasonDivider && (
                        <tr>
                          <td colSpan={32} className="px-3 py-2 bg-slate-900/80 border-y border-slate-700">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">
                              Preseason
                            </span>
                          </td>
                        </tr>
                      )}
                      {log.isDNP ? (
                        <tr className="hover:bg-slate-800/50 transition-colors whitespace-nowrap text-xs opacity-50">
                          <td className="px-3 py-2">
                            <span className="text-[10px] font-bold text-slate-500">DNP</span>
                          </td>
                          <td className="px-3 py-2">{log.date}</td>
                          <td className={`px-3 py-2${onTeamClick && log.teamId ? ' cursor-pointer hover:text-indigo-400' : ''}`}
                            onClick={() => onTeamClick && log.teamId && onTeamClick(log.teamId)}
                          >{log.teamAbbrev}</td>
                          <td className="px-3 py-2">{log.isAway ? '@' : ''}</td>
                          <td className={`px-3 py-2${onTeamClick && log.oppTeamId ? ' cursor-pointer hover:text-indigo-400' : ''}`}
                            onClick={() => onTeamClick && log.oppTeamId && onTeamClick(log.oppTeamId)}
                          >{log.oppAbbrev}</td>
                          <td
                            className={`px-3 py-2 ${log.isWin ? 'text-emerald-400' : 'text-red-400'}${log.gameId ? ' cursor-pointer hover:underline' : ''}`}
                            onClick={() => {
                              if (log.gameId) {
                                const sg = state.schedule.find((g: any) => g.gid === log.gameId);
                                if (sg) {
                                  if (onGameClick) onGameClick(sg);
                                  else setLocalBoxScoreGame(sg);
                                }
                              }
                            }}
                          >{log.result}</td>
                          <td colSpan={26} className="px-3 py-2 text-slate-500 italic">{log.dnpReason}</td>
                        </tr>
                      ) : (
                        <tr className={`hover:bg-slate-800/50 transition-colors whitespace-nowrap text-xs ${log.isPreseason ? 'opacity-70' : ''}`}>
                          <td className="px-3 py-2">
                            {(log as any).isAllStar
                              ? <span title="All-Star Game">⭐</span>
                              : log.rank !== null
                                ? log.rank
                                : <span className="text-[10px] font-bold text-amber-500/70">PRE</span>}
                          </td>
                          <td className="px-3 py-2">{log.date}</td>
                          <td className={`px-3 py-2${onTeamClick && log.teamId ? ' cursor-pointer hover:text-indigo-400' : ''}`}
                            onClick={() => onTeamClick && log.teamId && onTeamClick(log.teamId)}
                          >{log.teamAbbrev}</td>
                          <td className="px-3 py-2">{log.isAway ? '@' : ''}</td>
                          <td className={`px-3 py-2${onTeamClick && log.oppTeamId ? ' cursor-pointer hover:text-indigo-400' : ''}`}
                            onClick={() => onTeamClick && log.oppTeamId && onTeamClick(log.oppTeamId)}
                          >{log.oppAbbrev}</td>
                          <td
                            className={`px-3 py-2 ${log.isWin ? 'text-emerald-400' : 'text-red-400'}${log.gameId ? ' cursor-pointer hover:underline' : ''}`}
                            onClick={() => {
                              if (log.gameId) {
                                const sg = state.schedule.find((g: any) => g.gid === log.gameId);
                                if (sg) {
                                  if (onGameClick) onGameClick(sg);
                                  else setLocalBoxScoreGame(sg);
                                }
                              }
                            }}
                          >{log.result}</td>
                          <td className="px-3 py-2">{log.gs ? '*' : ''}</td>
                          <td className="px-3 py-2 text-right">{log.mp}</td>
                          <td className="px-3 py-2 text-right">{log.fgm}</td>
                          <td className="px-3 py-2 text-right">{log.fga}</td>
                          <td className="px-3 py-2 text-right">{log.fgp}</td>
                          <td className="px-3 py-2 text-right">{log.tpm}</td>
                          <td className="px-3 py-2 text-right">{log.tpa}</td>
                          <td className="px-3 py-2 text-right">{log.tpp}</td>
                          <td className="px-3 py-2 text-right">{log.twom}</td>
                          <td className="px-3 py-2 text-right">{log.twoa}</td>
                          <td className="px-3 py-2 text-right">{log.twop}</td>
                          <td className="px-3 py-2 text-right">{log.efgp}</td>
                          <td className="px-3 py-2 text-right">{log.ftm}</td>
                          <td className="px-3 py-2 text-right">{log.fta}</td>
                          <td className="px-3 py-2 text-right">{log.ftp}</td>
                          <td className="px-3 py-2 text-right">{log.orb}</td>
                          <td className="px-3 py-2 text-right">{log.drb}</td>
                          <td className="px-3 py-2 text-right">{log.trb}</td>
                          <td className="px-3 py-2 text-right">{log.ast}</td>
                          <td className="px-3 py-2 text-right">{log.stl}</td>
                          <td className="px-3 py-2 text-right">{log.blk}</td>
                          <td className="px-3 py-2 text-right">{log.tov}</td>
                          <td className="px-3 py-2 text-right">{log.pf}</td>
                          <td className="px-3 py-2 text-right font-bold text-white">{log.pts}</td>
                          <td
                            className={`px-3 py-2 text-right${log.gameId ? ' cursor-pointer hover:underline' : ''}`}
                            onClick={() => {
                              if (log.gameId) {
                                const sg = state.schedule.find((g: any) => g.gid === log.gameId);
                                if (sg) {
                                  if (onGameClick) onGameClick(sg);
                                  else setLocalBoxScoreGame(sg);
                                }
                              }
                            }}
                          >{log.gmsc}</td>
                          <td className={`px-3 py-2 text-right ${log.plusMinus != null && log.plusMinus > 0 ? 'text-emerald-400' : log.plusMinus != null && log.plusMinus < 0 ? 'text-red-400' : ''}`}>
                            {log.plusMinus != null ? (log.plusMinus > 0 ? `+${log.plusMinus}` : log.plusMinus) : '—'}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    );
                  })}
                  {sortedGameLog.length === 0 && (
                    <tr>
                      <td colSpan={32} className="px-3 py-8 text-center text-slate-500">
                        No game log available for this season.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'Ratings' && (() => {
          const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

          const currentRating = player.ratings?.find((r: any) => r.season === currentYear) ?? player.ratings?.[player.ratings.length - 1];
          const prevRating = player.ratings?.find((r: any) => r.season === currentYear - 1);

          // K2 calculation (apply league scale for overseas players)
          const scaledRatingForK2 = currentRating
            ? applyLeagueDisplayScale(player.status, currentRating)
            : null;
          const k2 = scaledRatingForK2
            ? calculateK2(scaledRatingForK2 as any, {
                pos: player.pos,
                heightIn: player.hgt,
                weightLbs: player.weight,
                age: player.age,
              })
            : null;

          const K2_CAT_COLORS: Record<string, string> = {
            OS: '#f97316', AT: '#22c55e', IS: '#ef4444',
            PL: '#3b82f6', DF: '#8b5cf6', RB: '#eab308',
          };
          const getRatingColor = (val: number) => {
            if (val >= 90) return '#3b82f6';
            if (val >= 80) return '#22c55e';
            if (val >= 70) return '#eab308';
            if (val >= 50) return '#f97316';
            return '#f43f5e';
          };

          // Build career OVR chart as K2 display ratings
          // Use stored r.ovr if available (NBA players), else compute from attrs
          const overall2k = convertTo2KRating(
            player.overallRating ?? 60,
            currentRating?.hgt ?? 50,
            currentRating?.tp ?? 50,
          );

          const ratingHistory = (() => {
            const attrKeys = ['stre','spd','jmp','endu','ins','dnk','ft','fg','tp','oiq','diq','drb','pss','reb'];
            const history = (player.ratings ?? [])
              .filter((r: any) => r.season != null)
              .sort((a: any, b: any) => a.season - b.season)
              .map((r: any) => {
                const baseOvr = (r.ovr && r.ovr > 0 && r.ovr <= 100)
                  ? r.ovr
                  : Math.round(attrKeys.reduce((s: number, k: string) => s + (r[k] ?? 50), 0) / attrKeys.length);
                return { season: `'${String(r.season).slice(-2)}`, ovr: convertTo2KRating(baseOvr, r.hgt ?? 50, r.tp) };
              });
            // Force last point = actual live OVR so endpoint always matches the badge
            if (history.length > 0) history[history.length - 1] = { ...history[history.length - 1], ovr: overall2k };
            return history;
          })();
          const radarValues = k2 ? getRadarValues(k2, overall2k) : Array(7).fill(60);

          const BBGM_LABELS: Record<string, string> = {
            spd: 'Speed', jmp: 'Jumping', endu: 'Endurance', ins: 'Inside Scoring',
            dnk: 'Dunking', ft: 'Free Throw', fg: 'Mid-Range', tp: 'Three-Point',
            oiq: 'Off. IQ', diq: 'Def. IQ', drb: 'Dribbling', pss: 'Passing',
            reb: 'Rebounding', stre: 'Strength', hgt: 'Height',
          };
          const BBGM_ALL = ['ins', 'dnk', 'ft', 'fg', 'tp', 'spd', 'jmp', 'endu', 'stre', 'oiq', 'diq', 'drb', 'pss', 'reb'];

          // POT: BBGM potEstimator (age + OVR), then convert to K2 scale
          const playerAge = (player as any).born?.year ? currentYear - (player as any).born.year : player.age ?? 25;
          const rawBbgmOvr = player.overallRating ?? 60;
          const potBbgm = playerAge >= 29 ? rawBbgmOvr : Math.max(rawBbgmOvr, Math.round(72.31428908571982 + (-2.33062761 * playerAge) + (0.83308748 * rawBbgmOvr)));
          const pot = convertTo2KRating(Math.min(99, Math.max(40, potBbgm)), currentRating?.hgt ?? 50, currentRating?.tp ?? 50);
          const currentK2Ovr = overall2k;

          return (
            <ProgressionTabContent
              ratingHistory={ratingHistory}
              ovrTimeline={player.ovrTimeline ?? []}
              k2={k2}
              currentRating={currentRating}
              prevRating={prevRating}
              teamColor={teamColor}
              radarValues={radarValues}
              K2_CAT_COLORS={K2_CAT_COLORS}
              getRatingColor={getRatingColor}
              BBGM_LABELS={BBGM_LABELS}
              BBGM_ALL={BBGM_ALL}
              pot={pot}
              currentK2Ovr={currentK2Ovr}
            />
          );
        })()}

        {activeTab === 'Awards' && (
          <AwardsView awards={player.awards || []} teamColor={teamColor} />
        )}

      </div>
    </div>

    {localBoxScoreGame && (() => {
      const bsResult = state.boxScores.find((b: any) => b.gameId === localBoxScoreGame.gid);
      const homeTeam = state.teams.find((t: any) => t.id === localBoxScoreGame.homeTid);
      const awayTeam = state.teams.find((t: any) => t.id === localBoxScoreGame.awayTid);
      if (!homeTeam || !awayTeam) return null;
      return (
        <BoxScoreModal
          game={localBoxScoreGame}
          result={bsResult}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          players={state.players}
          onClose={() => setLocalBoxScoreGame(null)}
          onPlayerClick={() => setLocalBoxScoreGame(null)}
        />
      );
    })()}
    </>
  );
};