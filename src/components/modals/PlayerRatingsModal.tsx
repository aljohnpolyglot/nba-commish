import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Edit2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { NBAPlayer } from '../../types';
import { useGame } from '../../store/GameContext';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import {
  calculateK2,
  K2_CATS,
  K2Data,
  getRadarValues,
  RADAR_AXES,
} from '../../services/simulation/convert2kAttributes';
import { convertTo2KRating } from '../../utils/helpers';
import { getDisplayPotential } from '../../utils/playerRatings';
import { getPlayerRealK2 } from '../../data/NBA2kRatings';
import { useLeagueScaledRatings, LEAGUE_DISPLAY_MULTIPLIERS, applyLeagueDisplayScale } from '../../hooks/useLeagueScaledRatings';
import { getRealDurability, applyDurabilityToK2 } from '../../utils/durabilityUtils';

interface PlayerRatingsModalProps {
  player: NBAPlayer;
  season: number;
  onClose: () => void;
}

const BBGM_DISPLAY_NAMES: Record<string, string> = {
  hgt: 'Height',
  stre: 'Strength',
  spd: 'Speed',
  jmp: 'Jumping',
  endu: 'Endurance',
  ins: 'Inside Scoring',
  dnk: 'Dunking',
  ft: 'Free Throw',
  fg: 'Mid-Range',
  tp: 'Three-Point',
  oiq: 'Offensive IQ',
  diq: 'Defensive IQ',
  drb: 'Dribbling',
  pss: 'Passing',
  reb: 'Rebounding',
};

// hgt is not editable in BBGM — shown as static bar only
const BBGM_EDITABLE_KEYS = ['stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'];

// ── 2K Direct Edit: for each sub-attribute, which BBGM key drives it and how much
// multiplier = Δ2k per ΔBBGM (i.e. Δbbgm = Δ2k / multiplier)
// hgtLimited = hgt is the true dominant but locked, so response will be sluggish
const K2_DRIVERS: { catKey: string; subIdx: number; bbgmKey: string; multiplier: number; hgtLimited?: boolean }[] = [
  { catKey: 'OS', subIdx: 0, bbgmKey: 'ins',  multiplier: 0.30 },            // Close Shot
  { catKey: 'OS', subIdx: 1, bbgmKey: 'fg',   multiplier: 0.48 },            // Mid-Range
  { catKey: 'OS', subIdx: 2, bbgmKey: 'tp',   multiplier: 0.48 },            // Three-Point
  { catKey: 'OS', subIdx: 3, bbgmKey: 'ft',   multiplier: 0.60 },            // Free Throw
  { catKey: 'OS', subIdx: 4, bbgmKey: 'oiq',  multiplier: 0.60 },            // Shot IQ
  { catKey: 'OS', subIdx: 5, bbgmKey: 'oiq',  multiplier: 0.24 },            // Off. Consistency
  { catKey: 'AT', subIdx: 0, bbgmKey: 'spd',  multiplier: 0.60 },            // Speed
  { catKey: 'AT', subIdx: 1, bbgmKey: 'spd',  multiplier: 0.42 },            // Agility
  { catKey: 'AT', subIdx: 2, bbgmKey: 'stre', multiplier: 0.48 },            // Strength
  { catKey: 'AT', subIdx: 3, bbgmKey: 'jmp',  multiplier: 0.60 },            // Vertical
  { catKey: 'AT', subIdx: 4, bbgmKey: 'endu', multiplier: 0.60 },            // Stamina
  { catKey: 'AT', subIdx: 5, bbgmKey: 'endu', multiplier: 0.36 },            // Hustle
  { catKey: 'AT', subIdx: 6, bbgmKey: 'endu', multiplier: 0.60 },            // Toughness (body frame / endurance ceiling)
  { catKey: 'IS', subIdx: 0, bbgmKey: 'ins',  multiplier: 0.48 },            // Layup
  { catKey: 'IS', subIdx: 1, bbgmKey: 'dnk',  multiplier: 0.24, hgtLimited: true }, // Standing Dunk
  { catKey: 'IS', subIdx: 2, bbgmKey: 'dnk',  multiplier: 0.54 },            // Driving Dunk
  { catKey: 'IS', subIdx: 3, bbgmKey: 'ins',  multiplier: 0.48 },            // Post Hook
  { catKey: 'IS', subIdx: 4, bbgmKey: 'fg',   multiplier: 0.36 },            // Post Fade
  { catKey: 'IS', subIdx: 5, bbgmKey: 'stre', multiplier: 0.36 },            // Post Control
  { catKey: 'IS', subIdx: 6, bbgmKey: 'ins',  multiplier: 0.18 },            // Draw Foul
  { catKey: 'IS', subIdx: 7, bbgmKey: 'oiq',  multiplier: 0.42 },            // Hands
  { catKey: 'PL', subIdx: 0, bbgmKey: 'pss',  multiplier: 0.60 },            // Pass Accuracy
  { catKey: 'PL', subIdx: 1, bbgmKey: 'drb',  multiplier: 0.60 },            // Ball Handle
  { catKey: 'PL', subIdx: 2, bbgmKey: 'drb',  multiplier: 0.36 },            // Speed w/ Ball
  { catKey: 'PL', subIdx: 3, bbgmKey: 'pss',  multiplier: 0.30 },            // Pass IQ
  { catKey: 'PL', subIdx: 4, bbgmKey: 'oiq',  multiplier: 0.42 },            // Pass Vision
  { catKey: 'DF', subIdx: 0, bbgmKey: 'diq',  multiplier: 0.135, hgtLimited: true }, // Interior Def
  { catKey: 'DF', subIdx: 1, bbgmKey: 'diq',  multiplier: 0.72 },            // Perimeter Def
  { catKey: 'DF', subIdx: 2, bbgmKey: 'diq',  multiplier: 0.54 },            // Steal
  { catKey: 'DF', subIdx: 3, bbgmKey: 'jmp',  multiplier: 0.24, hgtLimited: true }, // Block
  { catKey: 'DF', subIdx: 4, bbgmKey: 'diq',  multiplier: 0.90 },            // Help Def IQ
  { catKey: 'DF', subIdx: 5, bbgmKey: 'diq',  multiplier: 0.54 },            // Pass Perception
  { catKey: 'DF', subIdx: 6, bbgmKey: 'diq',  multiplier: 0.36, hgtLimited: true }, // Def Consistency
  { catKey: 'RB', subIdx: 0, bbgmKey: 'reb',  multiplier: 0.18, hgtLimited: true }, // Off. Rebound
  { catKey: 'RB', subIdx: 1, bbgmKey: 'reb',  multiplier: 0.18, hgtLimited: true }, // Def. Rebound
];

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

function RatingBar({ value, label }: { value: number; label: string }) {
  const color = getRatingColor(value);
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-slate-400 w-32 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-bold w-7 text-right" style={{ color }}>{value}</span>
    </div>
  );
}

// SVG heptagon radar chart — 7 axes
function RadarChart({ values }: { values: number[] }) {
  const cx = 250;
  const cy = 250;
  const maxR = 180;
  const n = 7;

  // Compute angle for each axis (start at top, go clockwise)
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const pt = (i: number, r: number) => {
    const a = angle(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const polyPoints = (r: number) =>
    Array.from({ length: n }, (_, i) => pt(i, r))
      .map(p => `${p.x},${p.y}`)
      .join(' ');

  // Scale 25-99 to 0-maxR
  const scale = (v: number) => ((v - 25) / 74) * maxR;

  const dataPoints = values.map((v, i) => pt(i, scale(Math.max(25, Math.min(99, v)))));
  const dataPolyStr = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  const axisLabelPt = (i: number) => pt(i, maxR + 28);

  return (
    <svg viewBox="0 0 500 500" width="100%" className="max-w-xs mx-auto">
      {/* Reference polygons */}
      {[0.33, 0.66, 1].map(frac => (
        <polygon
          key={frac}
          points={polyPoints(maxR * frac)}
          fill="none"
          stroke="#334155"
          strokeWidth="1"
        />
      ))}

      {/* Axis lines */}
      {Array.from({ length: n }, (_, i) => {
        const tip = pt(i, maxR);
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={tip.x} y2={tip.y}
            stroke="#334155"
            strokeWidth="1"
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={dataPolyStr}
        fill="rgba(59,130,246,0.25)"
        stroke="#3b82f6"
        strokeWidth="2"
      />

      {/* Data point dots */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="#3b82f6" />
      ))}

      {/* Value badges */}
      {dataPoints.map((p, i) => {
        const v = values[i];
        const color = getRatingColor(v);
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="11" fill="#0f172a" stroke={color} strokeWidth="1.5" />
            <text
              x={p.x} y={p.y + 4}
              textAnchor="middle"
              fontSize="9"
              fontWeight="bold"
              fill={color}
            >
              {v}
            </text>
          </g>
        );
      })}

      {/* Axis labels */}
      {Array.from({ length: n }, (_, i) => {
        const lp = axisLabelPt(i);
        // Adjust text anchor based on position
        let anchor: 'start' | 'middle' | 'end' = 'middle';
        const a = angle(i) * (180 / Math.PI);
        if (a > 20 && a < 160) anchor = 'middle';
        else if (a >= 160 || a <= -160) anchor = 'middle';
        else if (a > -160 && a < -20) anchor = 'middle';
        if (lp.x < cx - 20) anchor = 'end';
        else if (lp.x > cx + 20) anchor = 'start';

        return (
          <text
            key={i}
            x={lp.x}
            y={lp.y}
            textAnchor={anchor}
            fontSize="11"
            fontWeight="600"
            fill="#94a3b8"
          >
            {RADAR_AXES[i]}
          </text>
        );
      })}
    </svg>
  );
}

export const PlayerRatingsModal: React.FC<PlayerRatingsModalProps> = ({ player, season, onClose }) => {
  const { state, updatePlayerRatings } = useGame();

  const currentRatings = useMemo(() => {
    const r = player.ratings?.find((r: any) => r.season === season)
      ?? player.ratings?.[player.ratings.length - 1]
      ?? {};
    // Ensure all keys exist with defaults
    const defaults: Record<string, number> = {
      hgt: 50, stre: 50, spd: 50, jmp: 50, endu: 50,
      ins: 50, dnk: 50, ft: 50, fg: 50, tp: 50,
      oiq: 50, diq: 50, drb: 50, pss: 50, reb: 50,
    };
    return { ...defaults, ...r };
  }, [player, season]);

  const [editMode, setEditMode] = useState(false);
  const [k2EditMode, setK2EditMode] = useState(true); // default to 2K (Detailed) mode
  const [localRatings, setLocalRatings] = useState<Record<string, number>>(currentRatings);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [viewTab, setViewTab] = useState<'K2' | 'Simple' | 'Progression'>('K2');
  const [progressPeriod, setProgressPeriod] = useState<'Career' | '3Y' | '1Y'>('Career');

  const ratingHistory = useMemo(() => {
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
    // Force last point to actual live OVR so endpoint always matches the badge
    if (history.length > 0) {
      history[history.length - 1] = { ...history[history.length - 1], ovr: convertTo2KRating(player.overallRating ?? 60, currentRatings.hgt, currentRatings.tp) };
    }
    return history;
  }, [player.ratings, player.overallRating, currentRatings.hgt, currentRatings.tp]);
  const team = state.teams.find(t => t.id === player.tid)
    ?? (state.nonNBATeams ?? []).find((t: any) => t.tid === player.tid);

  const teamColor = (team as any)?.primaryColor ?? '#6366f1';

  // For external-league players apply the same sim-scale multiplier to ratings before
  // computing K2, so the displayed attributes match in-game performance levels.
  // In edit mode we still scale — the user sees effective values as they tweak BBGM numbers.
  const isExternalLeague = !!LEAGUE_DISPLAY_MULTIPLIERS[player.status ?? ''];
  const scaledRatings = useLeagueScaledRatings(player.status, localRatings);

  // Durability is sourced from real injury history, not the `endu`/height formula.
  // `applyDurabilityToK2` overrides AT.sub[6] with the injury-based value; AT.ovr
  // still averages all 7 subs so durability contributes to the Athleticism overall.
  const realDur = useMemo(() => getRealDurability(player), [player]);
  const k2 = useMemo(() => {
    const raw = calculateK2(scaledRatings as any, {
      pos: player.pos,
      heightIn: player.hgt,
      weightLbs: player.weight,
      age: player.age,
    });
    return applyDurabilityToK2(raw, realDur);
  }, [scaledRatings, player, realDur]);

  // Real 2K data from gist — used as the launch baseline
  const real2KSubs = useMemo(() => getPlayerRealK2(player.name), [player.name]);

  // K2 from the player's earliest season rating — used to compute the progression delta.
  // Apply the durability override here too so the blend math (display = real + (cur - base))
  // produces a zero delta for DUR, leaving the injury-based value intact downstream.
  const baseK2 = useMemo(() => {
    const firstRating = player.ratings?.[0] ?? currentRatings;
    const defaults: Record<string, number> = {
      hgt: 50, stre: 50, spd: 50, jmp: 50, endu: 50,
      ins: 50, dnk: 50, ft: 50, fg: 50, tp: 50,
      oiq: 50, diq: 50, drb: 50, pss: 50, reb: 50,
    };
    const base = { ...defaults, ...firstRating };
    const scaled = applyLeagueDisplayScale(player.status, base);
    const raw = calculateK2(scaled as any, {
      pos: player.pos,
      heightIn: player.hgt,
      weightLbs: player.weight,
      age: player.age,
    });
    return applyDurabilityToK2(raw, realDur);
  }, [player, currentRatings, realDur]);

  // Blended K2: gist as launch baseline + full progression delta from computed K2.
  // Formula: display[i] = gist[i] + (computed[i] - base[i])
  // Then forces DUR (AT.sub[6]) to the injury-history value so it matches the bio.
  const displayK2 = useMemo((): K2Data => {
    if (!real2KSubs) return k2;
    const blended: any = {};
    for (const catKey of Object.keys(k2) as (keyof K2Data)[]) {
      const computedSubs = k2[catKey].sub;
      const baseSubs = baseK2[catKey].sub;
      const realSubs = real2KSubs[catKey] ?? [];
      const blendedSubs = computedSubs.map((computed, i) => {
        const real = realSubs[i];
        if (real === null || real === undefined) return computed;
        const base = baseSubs[i] ?? computed;
        const delta = computed - base;
        return Math.round(Math.max(0, Math.min(99, real + delta)));
      });
      blended[catKey] = {
        sub: blendedSubs,
        ovr: Math.round(blendedSubs.reduce((a: number, b: number) => a + b, 0) / blendedSubs.length),
      };
    }
    // Force DUR to the injury-history value after the blend.
    return applyDurabilityToK2(blended as K2Data, realDur);
  }, [k2, baseK2, real2KSubs, realDur]);

  const overall2k = convertTo2KRating(
    player.overallRating ?? 60,
    localRatings.hgt,
    localRatings.tp
  );

  // K2 overall: weighted avg of all category overalls (blended with real 2K where available)
  const k2Overall = useMemo(() => {
    const cats = Object.values(displayK2) as { ovr: number; sub: number[] }[];
    return Math.round(cats.reduce((sum, c) => sum + c.ovr, 0) / cats.length);
  }, [displayK2]);

  const radarValues = getRadarValues(displayK2, k2Overall);

  const handleSliderChange = (key: string, val: number) => {
    setLocalRatings(prev => ({ ...prev, [key]: val }));
  };

  const handleK2SliderChange = (catKey: string, subIdx: number, newK2Val: number) => {
    const driver = K2_DRIVERS.find(d => d.catKey === catKey && d.subIdx === subIdx);
    if (!driver) return;
    const currentK2 = (k2 as any)[catKey].sub[subIdx] as number;
    const delta2k = newK2Val - currentK2;
    if (delta2k === 0) return;
    const deltaRating = delta2k / driver.multiplier;
    const currentRating = localRatings[driver.bbgmKey] ?? 50;
    const newRating = Math.max(0, Math.min(100, Math.round(currentRating + deltaRating)));
    setLocalRatings(prev => ({ ...prev, [driver.bbgmKey]: newRating }));
  };

  const handleSave = () => {
    updatePlayerRatings(player.internalId, season, localRatings);
    setEditMode(false);
    setK2EditMode(false);
  };

  const toggleCat = (k: string) => {
    setCollapsedCats(prev => ({ ...prev, [k]: !prev[k] }));
  };

  const simYear = state.leagueStats?.year ?? new Date().getFullYear();
  const playerAge = (player as any).born?.year ? simYear - (player as any).born.year : (player.age ?? 25);
  // Canonical POT — single source of truth across all views.
  const potK2 = getDisplayPotential(player, simYear);
  const ovrColor = getRatingColor(overall2k);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[70] flex items-center justify-center p-0 md:p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.96, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 20 }}
          className="bg-slate-900 border border-slate-800 w-full h-full md:h-auto md:max-h-[92vh] md:max-w-2xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex-shrink-0 p-4 md:p-6 border-b border-slate-800 bg-slate-900/80">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <PlayerPortrait
                  imgUrl={player.imgURL}
                  face={(player as any).face}
                  teamLogoUrl={team?.logoUrl}
                  overallRating={player.overallRating}
                  ratings={player.ratings}
                  playerName={player.name}
                  size={56}
                />
                <div className="min-w-0">
                  <h2 className="text-lg font-black uppercase tracking-tight text-white leading-none truncate">
                    {player.name}
                  </h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {player.pos} &bull; {team?.name ?? 'Free Agent'} &bull; Age {(player as any).born?.year ? simYear - (player as any).born.year : player.age}
                  </p>
                  {isExternalLeague && (
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/25 rounded-full text-[9px] font-black text-amber-400 uppercase tracking-widest">
                      {player.status}
                    </span>
                  )}
                </div>
                {/* 2K OVR badge */}
                <div
                  className="flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl border-2 shadow-lg ml-1"
                  style={{ borderColor: ovrColor, backgroundColor: `${ovrColor}18` }}
                >
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">OVR</span>
                  <span className="text-2xl font-black leading-none mt-0.5" style={{ color: ovrColor }}>{overall2k}</span>
                </div>
                {/* POT badge */}
                {(() => {
                  const potColor = potK2 >= 90 ? '#3b82f6' : potK2 >= 80 ? '#22c55e' : potK2 >= 70 ? '#eab308' : '#94a3b8';
                  return (
                    <div
                      className="flex-shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl border border-slate-700 bg-slate-800/50 ml-1"
                    >
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">POT</span>
                      <span className="text-lg font-black leading-none mt-0.5" style={{ color: potColor }}>{potK2}</span>
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {state.gameMode !== 'gm' && (
                <button
                  onClick={() => {
                    if (editMode) {
                      // Cancel edit
                      setLocalRatings(currentRatings);
                      setEditMode(false);
                      setK2EditMode(false);
                    } else {
                      setEditMode(true);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    editMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-violet-600 text-white hover:bg-violet-500'
                  }`}
                >
                  <Edit2 size={12} />
                  {editMode ? 'Cancel' : 'Edit'}
                </button>
                )}
                {editMode && (
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-green-600 text-white hover:bg-green-500 transition-all"
                  >
                    <Save size={12} />
                    Save
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-4 md:p-6 space-y-4">
              {/* Radar Chart — always visible */}
              <RadarChart values={radarValues} />

              {editMode ? (
                /* ── Edit Mode ── */
                <div className="space-y-3">
                  {/* Mode toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Edit via</span>
                    <div className="flex rounded-xl overflow-hidden border border-slate-700">
                      <button
                        onClick={() => setK2EditMode(false)}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                          !k2EditMode ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        Simple
                      </button>
                      <button
                        onClick={() => setK2EditMode(true)}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                          k2EditMode ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        Detailed
                      </button>
                    </div>
                    {k2EditMode && (
                      <span className="text-[9px] text-slate-600 italic">related attrs move together</span>
                    )}
                  </div>

                  {!k2EditMode ? (
                    /* Simple sliders */
                    <div className="space-y-2">
                      <p className="text-[9px] text-slate-500 font-medium uppercase tracking-widest">
                        Core attributes
                      </p>
                      <div className="flex items-center gap-3 opacity-50">
                        <span className="text-xs font-bold text-slate-400 w-32 flex-shrink-0">Height (locked)</span>
                        <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full bg-slate-600" style={{ width: `${localRatings.hgt ?? 50}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-500 w-8 text-right tabular-nums">{Math.round(localRatings.hgt ?? 50)}</span>
                      </div>
                      {BBGM_EDITABLE_KEYS.map(key => (
                        <div key={key} className="flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-300 w-32 flex-shrink-0">
                            {BBGM_DISPLAY_NAMES[key]}
                          </span>
                          <input
                            type="range" min={0} max={100}
                            value={Math.round(localRatings[key] ?? 50)}
                            onChange={e => handleSliderChange(key, Number(e.target.value))}
                            className="flex-1 accent-violet-500 h-1.5"
                          />
                          <span className="text-xs font-black text-violet-400 w-8 text-right tabular-nums">
                            {Math.round(localRatings[key] ?? 50)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* 2K attribute sliders, grouped by category */
                    <div className="space-y-4">
                      {K2_CATS.map(cat => {
                        const color = K2_CAT_COLORS[cat.k];
                        return (
                          <div key={cat.k}>
                            <p className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color }}>
                              {cat.n}
                            </p>
                            <div className="space-y-1.5">
                              {cat.sub.map((subName, subIdx) => {
                                const driver = K2_DRIVERS.find(d => d.catKey === cat.k && d.subIdx === subIdx);
                                const currentK2Val = (k2 as any)[cat.k].sub[subIdx] as number;
                                return (
                                  <div key={subName} className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-300 w-28 flex-shrink-0 truncate">
                                      {subName}
                                    </span>
                                    <input
                                      type="range" min={25} max={99}
                                      value={currentK2Val}
                                      onChange={e => handleK2SliderChange(cat.k, subIdx, Number(e.target.value))}
                                      className="flex-1 h-1.5"
                                      style={{ accentColor: color }}
                                    />
                                    <span className="text-[10px] font-black w-7 text-right tabular-nums" style={{ color: getRatingColor(currentK2Val) }}>
                                      {currentK2Val}
                                    </span>
                                    {driver ? (
                                      <span className={`text-[8px] font-bold w-16 text-right ${driver.hgtLimited ? 'text-amber-600' : 'text-slate-600'}`}>
                                        →{driver.hgtLimited ? '⚠' : ''} {BBGM_DISPLAY_NAMES[driver.bbgmKey] ?? driver.bbgmKey}
                                      </span>
                                    ) : cat.k === 'MI' && subIdx === 0 ? (
                                      <span className="text-[8px] font-bold w-16 text-right text-cyan-600 italic">
                                        injury hist.
                                      </span>
                                    ) : (
                                      <span className="w-16" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* ── View Mode: K2 / Simple / Progression tabs ── */
                <div className="space-y-3">
                  {/* Tab strip */}
                  <div className="flex rounded-xl overflow-hidden border border-slate-700">
                    {(['K2', 'Simple', 'Progression'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setViewTab(tab)}
                        className={`flex-1 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                          viewTab === tab
                            ? tab === 'K2' ? 'bg-sky-600 text-white'
                              : tab === 'Simple' ? 'bg-violet-600 text-white'
                              : 'bg-emerald-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {viewTab === 'K2' && (
                    <div className="space-y-3">
                      {real2KSubs && (
                        <p className="text-[9px] text-sky-500/70 font-medium">★ Blended with real 2K data</p>
                      )}
                      {K2_CATS.map(cat => {
                        const catData = displayK2[cat.k as keyof typeof displayK2];
                        const isCollapsed = collapsedCats[cat.k] ?? false;
                        const catColor = getRatingColor(catData.ovr);
                        return (
                          <div key={cat.k} className="bg-slate-800/50 rounded-2xl overflow-hidden border border-slate-800">
                            <button
                              onClick={() => toggleCat(cat.k)}
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-black uppercase tracking-widest w-6 text-center" style={{ color: catColor }}>{cat.k}</span>
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
                                  <RatingBar key={subName} value={catData.sub[idx] ?? 50} label={subName} />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* POT bar — always at bottom of K2 tab */}
                      {(() => {
                        const potColor = potK2 >= 90 ? '#3b82f6' : potK2 >= 80 ? '#22c55e' : potK2 >= 70 ? '#eab308' : '#94a3b8';
                        return (
                          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Potential</span>
                              <span className="text-sm font-black" style={{ color: potColor }}>{potK2}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-700/60 rounded-full h-2 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${potK2}%`, backgroundColor: potColor }}
                                />
                              </div>
                              <span className="text-[9px] text-slate-500 font-bold w-20 text-right">
                                {playerAge >= 29 ? 'Peak (29+)' : `Age ${playerAge} proj.`}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {viewTab === 'Simple' && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-3 opacity-40">
                        <span className="text-xs text-slate-400 w-32 flex-shrink-0">Height (locked)</span>
                        <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full bg-slate-600" style={{ width: `${localRatings.hgt ?? 50}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-500 w-8 text-right">{Math.round(localRatings.hgt ?? 50)}</span>
                      </div>
                      {BBGM_EDITABLE_KEYS.map(key => (
                        <RatingBar key={key} value={Math.round((scaledRatings as any)[key] ?? 50)} label={BBGM_DISPLAY_NAMES[key] ?? key} />
                      ))}
                    </div>
                  )}

                  {viewTab === 'Progression' && (() => {
                    // 1Y: use weekly ovrTimeline snapshots — convert with same formula as header badge
                    const MON_ABB = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    const weeklyData = (player.ovrTimeline ?? []).map((s: { date: string; ovr: number }) => {
                      const [, mm, dd] = s.date.split('-');
                      return {
                        season: `${MON_ABB[parseInt(mm)]} ${parseInt(dd)}`,
                        ovr: convertTo2KRating(s.ovr, currentRatings.hgt ?? 50, currentRatings.tp ?? 50),
                      };
                    });
                    const rawChartData = progressPeriod === 'Career' ? ratingHistory
                      : progressPeriod === '3Y' ? ratingHistory.slice(-3)
                      : weeklyData.length > 0 ? weeklyData : ratingHistory.slice(-1);
                    // Always show chart — pad to 2 points with flat line if not enough history
                    const chartData = rawChartData.length >= 2
                      ? rawChartData
                      : rawChartData.length === 1
                        ? [{ season: 'yr-1', ovr: rawChartData[0].ovr }, rawChartData[0]]
                        : [{ season: 'yr-1', ovr: overall2k }, { season: 'now', ovr: overall2k }];
                    const prevSeasonOvr = ratingHistory[ratingHistory.length - 2]?.ovr ?? overall2k;
                    const delta = overall2k - prevSeasonOvr;
                    const deltaColor = delta > 0 ? '#22c55e' : delta < 0 ? '#f43f5e' : '#64748b';
                    return (
                      <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 space-y-3">
                        {/* Header: period toggle + delta */}
                        <div className="flex items-center justify-between">
                          <div className="flex gap-1">
                            {(['Career', '3Y', '1Y'] as const).map(p => (
                              <button
                                key={p}
                                onClick={() => setProgressPeriod(p)}
                                className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md transition-all ${
                                  progressPeriod === p ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
                                }`}
                              >
                                {p}
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
                        {/* Chart — always visible */}
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={chartData} margin={{ top: 4, right: 12, left: -24, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis
                              dataKey="season"
                              tick={{ fill: '#64748b', fontSize: 9, fontWeight: 700 }}
                              axisLine={false} tickLine={false}
                              interval={progressPeriod === '1Y' ? Math.floor(chartData.length / 6) : 0}
                            />
                            <YAxis
                              domain={['dataMin - 1', 'dataMax + 1']}
                              tick={{ fill: '#64748b', fontSize: 9 }}
                              axisLine={false} tickLine={false}
                              tickFormatter={(v: number) => Math.round(v).toString()}
                            />
                            <Tooltip
                              contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                              labelStyle={{ color: '#94a3b8', fontWeight: 700 }}
                              formatter={(val: any) => [`${Math.round(val)} OVR`, '']}
                            />
                            <Line type="monotone" dataKey="ovr" stroke={teamColor} strokeWidth={2.5}
                              dot={progressPeriod === '1Y' ? false : { fill: teamColor, r: 3, strokeWidth: 0 }}
                              activeDot={{ r: 5, strokeWidth: 0 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
