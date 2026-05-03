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
      .filter((r: any) => !player.retiredYear || r.season <= player.retiredYear)
      .sort((a: any, b: any) => a.season - b.season)
      .map((r: any) => {
        const baseOvr = (r.ovr && r.ovr > 0 && r.ovr <= 100)
          ? r.ovr
          : Math.round(attrKeys.reduce((s: number, k: string) => s + (r[k] ?? 50), 0) / attrKeys.length);
        return { season: `'${String(r.season).slice(-2)}`, ovr: convertTo2KRating(baseOvr, r.hgt ?? 50, r.tp) };
      });
    // Force last point to actual live OVR so endpoint always matches the badge (skip for retired players)
    if (!player.retiredYear && history.length > 0) {
      history[history.length - 1] = { ...history[history.length - 1], ovr: convertTo2KRating(player.overallRating ?? 60, currentRatings.hgt, currentRatings.tp) };
    }
    return history;
  }, [player.ratings, player.overallRating, player.retiredYear, currentRatings.hgt, currentRatings.tp]);
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

  const simYear = state.leagueStats?.year ?? new Date().getFullYear();
  const playerAge = (player as any).born?.year ? simYear - (player as any).born.year : (player.age ?? 25);

  // ── Progression-tab snapshots: K2 at a comparison year, blended the same way
  // as `displayK2` so the bars/radar show what the player WAS, not raw ratings.
  // Pivot year derives from `progressPeriod` (Career=rookie, 3Y=now-3, 1Y=now-1).
  const snapshotInfo = useMemo(() => {
    const ratings = (player.ratings ?? []) as any[];
    if (ratings.length === 0) return { displayK2: displayK2, year: simYear, label: 'Now' };
    const sorted = [...ratings].filter(r => r.season != null).sort((a, b) => a.season - b.season);
    let target: any | undefined;
    let label = 'Rookie';
    if (progressPeriod === 'Career') {
      target = sorted[0];
      label = `Rookie '${String(target?.season ?? '').slice(-2)}`;
    } else if (progressPeriod === '3Y') {
      const yr = simYear - 3;
      target = sorted.find(r => r.season === yr) ?? [...sorted].reverse().find(r => r.season <= yr) ?? sorted[0];
      label = `'${String(yr).slice(-2)}`;
    } else {
      const yr = simYear - 1;
      target = sorted.find(r => r.season === yr) ?? [...sorted].reverse().find(r => r.season <= yr) ?? sorted[0];
      label = `'${String(yr).slice(-2)}`;
    }
    if (!target) return { displayK2: displayK2, year: simYear, label: 'Now' };
    const defaults: Record<string, number> = {
      hgt: 50, stre: 50, spd: 50, jmp: 50, endu: 50,
      ins: 50, dnk: 50, ft: 50, fg: 50, tp: 50,
      oiq: 50, diq: 50, drb: 50, pss: 50, reb: 50,
    };
    const base = { ...defaults, ...target };
    const scaled = applyLeagueDisplayScale(player.status, base);
    const rawK2 = calculateK2(scaled as any, {
      pos: player.pos,
      heightIn: player.hgt,
      weightLbs: player.weight,
      age: player.age,
    });
    const computedK2 = applyDurabilityToK2(rawK2, realDur);
    // Apply the same "real 2K + delta from base" blend used for displayK2 so the
    // numbers are comparable. Without this, the snapshot K2 would use raw scale
    // while displayK2 uses blended scale.
    if (!real2KSubs) {
      return { displayK2: computedK2, year: target.season ?? simYear, label };
    }
    const blended: K2Data = JSON.parse(JSON.stringify(computedK2));
    for (const catKey of Object.keys(computedK2) as (keyof K2Data)[]) {
      const computedSubs = computedK2[catKey].sub;
      const baseSubs = baseK2[catKey].sub;
      const realSubs = (real2KSubs as any)[catKey]?.sub ?? null;
      blended[catKey].sub = computedSubs.map((c, i) => {
        const r = realSubs?.[i];
        const b = baseSubs[i] ?? c;
        if (r == null) return c;
        return Math.max(25, Math.min(99, Math.round(r + (c - b))));
      });
      blended[catKey].ovr = Math.round(blended[catKey].sub.reduce((s, v) => s + v, 0) / blended[catKey].sub.length);
    }
    return {
      displayK2: applyDurabilityToK2(blended, realDur),
      year: target.season ?? simYear,
      label,
    };
  }, [player, progressPeriod, simYear, realDur, baseK2, real2KSubs, displayK2]);

  // Mentors with portrait + EXP — drawn from the player's mentor history.
  const mentorEntries = useMemo(() => {
    const history = player.mentorHistory ?? [];
    if (history.length === 0 && !player.mentorId) return [];
    const playerById = new Map<string, any>();
    for (const p of state.players) playerById.set((p as any).internalId, p);
    // Synthesize an entry for the current mentorId if no open history entry exists yet
    // (saves created before the history field was added).
    const open = history.find(h => !h.endDate);
    let entries = history;
    if (player.mentorId && !open) {
      entries = [...history, { mentorId: player.mentorId, startDate: 'unknown' }];
    }
    return entries.map(h => ({
      ...h,
      mentor: playerById.get(h.mentorId) ?? null,
    }));
  }, [player.mentorHistory, player.mentorId, state.players]);

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
                  teamLogoUrl={team && 'logoUrl' in team ? team.logoUrl : undefined}
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
                    const weeklyData = (player.ovrTimeline ?? [])
                      .filter((s: { date: string; ovr: number }) => {
                        if (!player.retiredYear) return true;
                        const dateYear = parseInt(s.date.split('-')[0]);
                        return dateYear <= player.retiredYear;
                      })
                      .map((s: { date: string; ovr: number }) => {
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
                      <>
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

                      {/* ── K2 SUB-ATTRIBUTE DELTAS ─────────────────────────────── */}
                      {/* Same K2 bar layout as the K2 tab, but each bar shows the
                          comparison-year value plus the +/- delta to current.
                          Lets the user verify training is actually moving sub-
                          attributes vs masking regressions inside category averages. */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                            K2 Deltas · vs {snapshotInfo.label}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                            Now − Then
                          </span>
                        </div>
                        {K2_CATS.map(cat => {
                          const catData = displayK2[cat.k as keyof typeof displayK2];
                          const snapData = snapshotInfo.displayK2[cat.k as keyof typeof snapshotInfo.displayK2];
                          const isCollapsed = collapsedCats[`prog_${cat.k}`] ?? false;
                          const catDelta = catData.ovr - snapData.ovr;
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
                                    const cur = catData.sub[idx] ?? 50;
                                    const prev = snapData.sub[idx] ?? cur;
                                    const diff = cur - prev;
                                    const color = getRatingColor(cur);
                                    return (
                                      <div key={subName} className="flex items-center gap-2 py-0.5">
                                        <span className="text-[10px] text-slate-400 w-28 flex-shrink-0 truncate">{subName}</span>
                                        <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${cur}%`, backgroundColor: color }} />
                                        </div>
                                        <span className="text-[10px] font-black w-8 text-right tabular-nums" style={{ color }}>{cur}</span>
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

                      {/* ── COMPARISON RADAR ─────────────────────────────────────── */}
                      {/* Current 7-axis polygon overlaid with the snapshot polygon
                          for the selected period. Snapshot is gray dashed so the
                          eye reads "before vs after" at a glance. */}
                      {(() => {
                        const k2OverallSnap = Math.round(
                          (Object.values(snapshotInfo.displayK2) as { ovr: number }[]).reduce((s, c) => s + c.ovr, 0) /
                          Object.keys(snapshotInfo.displayK2).length,
                        );
                        const snapValues = getRadarValues(snapshotInfo.displayK2, k2OverallSnap);
                        return (
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
                            <RadarCompareChart current={radarValues} previous={snapValues} />
                          </div>
                        );
                      })()}

                      {/* ── MENTOR HISTORY ───────────────────────────────────────── */}
                      {mentorEntries.length > 0 && (
                        <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                              Mentors
                            </span>
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
                                const endStr = isActive ? 'PRESENT' : formatMentorDate(entry.endDate!);
                                return (
                                  <div
                                    key={`${entry.mentorId}-${idx}`}
                                    className={`relative p-3 rounded-xl border ${
                                      isActive
                                        ? 'bg-indigo-500/10 border-indigo-500/40'
                                        : 'bg-slate-950/40 border-slate-800'
                                    }`}
                                  >
                                    {isActive && (
                                      <div className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-indigo-500 text-[8px] font-black uppercase tracking-widest text-white">
                                        Active
                                      </div>
                                    )}
                                    <div className="flex items-start gap-3">
                                      <PlayerPortrait
                                        imgUrl={mentor?.imgURL}
                                        playerName={mentor?.name ?? 'Unknown'}
                                        size={40}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-black text-white truncate">
                                          {mentor?.name ?? 'Unknown mentor'}
                                        </div>
                                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                          {mentor?.pos ?? '—'}
                                        </div>
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

// Format YYYY-MM-DD as "M/D/YYYY". Returns "—" for unknown.
function formatMentorDate(iso: string | undefined): string {
  if (!iso || iso === 'unknown') return '—';
  const norm = iso.slice(0, 10);
  const [y, m, d] = norm.split('-').map(s => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

// Two-polygon radar: current (blue solid) vs previous (slate dashed).
// Same heptagon shape as the existing RadarChart so the visual language matches.
function RadarCompareChart({ current, previous }: { current: number[]; previous: number[] }) {
  const cx = 250;
  const cy = 250;
  const maxR = 180;
  const n = 7;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) => ({ x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) });
  const polyPoints = (r: number) => Array.from({ length: n }, (_, i) => pt(i, r)).map(p => `${p.x},${p.y}`).join(' ');
  const scale = (v: number) => ((Math.max(25, Math.min(99, v)) - 25) / 74) * maxR;

  const curPts = current.map((v, i) => pt(i, scale(v)));
  const prevPts = previous.map((v, i) => pt(i, scale(v)));

  return (
    <svg viewBox="0 0 500 500" width="100%" className="max-w-xs mx-auto">
      {[0.33, 0.66, 1].map(frac => (
        <polygon key={frac} points={polyPoints(maxR * frac)} fill="none" stroke="#334155" strokeWidth="1" />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const tip = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="#334155" strokeWidth="1" />;
      })}

      {/* Previous (snapshot) polygon — slate dashed underlay */}
      <polygon
        points={prevPts.map(p => `${p.x},${p.y}`).join(' ')}
        fill="rgba(100,116,139,0.12)"
        stroke="#64748b"
        strokeWidth="1.5"
        strokeDasharray="6 4"
      />

      {/* Current polygon — blue overlay */}
      <polygon
        points={curPts.map(p => `${p.x},${p.y}`).join(' ')}
        fill="rgba(59,130,246,0.25)"
        stroke="#3b82f6"
        strokeWidth="2"
      />
      {curPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#3b82f6" />
      ))}

      {Array.from({ length: n }, (_, i) => {
        const lp = pt(i, maxR + 28);
        return (
          <text key={i} x={lp.x} y={lp.y} textAnchor="middle" fontSize="11" fontWeight="600" fill="#94a3b8">
            {RADAR_AXES[i]}
          </text>
        );
      })}
    </svg>
  );
}
