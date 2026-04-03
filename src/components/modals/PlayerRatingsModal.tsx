import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Edit2, Save, ChevronDown, ChevronUp } from 'lucide-react';
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
import { getPlayerRealK2 } from '../../data/NBA2kRatings';

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
  { catKey: 'AT', subIdx: 6, bbgmKey: 'endu', multiplier: 0.60 },            // Durability
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

  const team = state.teams.find(t => t.id === player.tid);

  const k2 = useMemo(() => calculateK2(localRatings as any, {
    pos: player.pos,
    heightIn: player.hgt,
    weightLbs: player.weight,
    age: player.age,
  }), [localRatings, player]);

  // Real 2K data from gist — averaged with computed k2 for display (UI-only, no gameplay effect)
  const real2KSubs = useMemo(() => getPlayerRealK2(player.name), [player.name]);

  // Blended K2: (computed + real) / 2 where real data exists, else just computed
  const displayK2 = useMemo((): K2Data => {
    if (!real2KSubs) return k2;
    const blended: any = {};
    for (const catKey of Object.keys(k2) as (keyof K2Data)[]) {
      const computedSubs = k2[catKey].sub;
      const realSubs = real2KSubs[catKey] ?? [];
      const blendedSubs = computedSubs.map((computed, i) => {
        const real = realSubs[i];
        if (real === null || real === undefined) return computed;
        return Math.round((computed + real) / 2);
      });
      blended[catKey] = {
        sub: blendedSubs,
        ovr: Math.round(blendedSubs.reduce((a: number, b: number) => a + b, 0) / blendedSubs.length),
      };
    }
    return blended as K2Data;
  }, [k2, real2KSubs]);

  const overall2k = convertTo2KRating(
    player.overallRating ?? 60,
    localRatings.hgt,
    localRatings.tp
  );

  const radarValues = getRadarValues(displayK2, overall2k);

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
                  teamLogoUrl={team?.logoURL}
                  overallRating={player.overallRating}
                  ratings={player.ratings}
                  size={56}
                />
                <div className="min-w-0">
                  <h2 className="text-lg font-black uppercase tracking-tight text-white leading-none truncate">
                    {player.name}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {player.pos} &bull; {team?.name ?? 'Free Agent'} &bull; Age {(player as any).born?.year ? new Date().getFullYear() - (player as any).born.year : player.age}
                  </p>
                </div>
                {/* 2K OVR badge */}
                <div
                  className="flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl border-2 shadow-lg ml-1"
                  style={{ borderColor: ovrColor, backgroundColor: `${ovrColor}18` }}
                >
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">OVR</span>
                  <span className="text-2xl font-black leading-none mt-0.5" style={{ color: ovrColor }}>{overall2k}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
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
            <div className="p-4 md:p-6 space-y-6">
              {/* Radar Chart — always visible */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Attribute Radar</h3>
                <RadarChart values={radarValues} />
              </div>

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
                        <span className="text-xs font-bold text-slate-500 w-8 text-right tabular-nums">{localRatings.hgt ?? 50}</span>
                      </div>
                      {BBGM_EDITABLE_KEYS.map(key => (
                        <div key={key} className="flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-300 w-32 flex-shrink-0">
                            {BBGM_DISPLAY_NAMES[key]}
                          </span>
                          <input
                            type="range" min={0} max={100}
                            value={localRatings[key] ?? 50}
                            onChange={e => handleSliderChange(key, Number(e.target.value))}
                            className="flex-1 accent-violet-500 h-1.5"
                          />
                          <span className="text-xs font-black text-violet-400 w-8 text-right tabular-nums">
                            {localRatings[key] ?? 50}
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
                                    {driver && (
                                      <span className={`text-[8px] font-bold w-16 text-right ${driver.hgtLimited ? 'text-amber-600' : 'text-slate-600'}`}>
                                        →{driver.hgtLimited ? '⚠' : ''} {BBGM_DISPLAY_NAMES[driver.bbgmKey] ?? driver.bbgmKey}
                                      </span>
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
                /* ── View Mode: Category bars (blended with real 2K where available) ── */
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
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
