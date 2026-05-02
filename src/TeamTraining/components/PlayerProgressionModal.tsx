//see @playerratingsmodal for visual consistency.
import React, { useState, useMemo } from 'react';
import { Player, Team, TrainingParadigm } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, Activity, Crosshair, Calendar, Target } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from 'recharts';
import type { NBAPlayer } from '../../types';
import { calculatePlayerOverallForYear, getDisplayPotential } from '../../utils/playerRatings';
import { convertTo2KRating } from '../../utils/helpers';
import { calculateK2 } from '../../services/simulation/convert2kAttributes';

interface Props {
  player: Player | null; // Pass null to hide or pass it via wrapper
  /** Optional NBA player — when provided, all mock data is replaced with real history. */
  nbaPlayer?: NBAPlayer;
  /** Current league year — needed for "x years ago" snapshot computation. */
  currentYear?: number;
  team?: Team;
  currentDate?: string;
  trainingCalendar?: Record<string, { intensity: number; paradigm: TrainingParadigm; allocations?: any; auto?: boolean }>;
  onClose: () => void;
}

const MOCK_HISTORY_OVR = [
  { year: 2021, ovr: 58, pot: 75 },
  { year: 2022, ovr: 65, pot: 78 },
  { year: 2023, ovr: 72, pot: 80 },
  { year: 2024, ovr: 78, pot: 82 },
  { year: 2025, ovr: 83, pot: 85 },
];

type K2Category = "Inside Scoring" | "Outside Scoring" | "Playmaking" | "Defending" | "Athleticism" | "Rebounding";

const K2_MOCK: Record<string, Record<K2Category, Record<string, number>>> = {
  "current": {
    "Inside Scoring": { "Close Shot": 85, "Driving Layup": 82, "Driving Dunk": 85, "Standing Dunk": 60, "Post Hook": 65, "Post Fade": 60, "Post Control": 62, "Draw Foul": 80 },
    "Outside Scoring": { "Free Throw": 80, "Mid-Range Shot": 82, "Three-Point Shot": 85, "Shot IQ": 88, "Offensive Consistency": 85 },
    "Playmaking": { "Pass Accuracy": 75, "Pass Vision": 78, "Pass IQ": 80, "Ball Handle": 85, "Speed with Ball": 88, "Offensive Awareness": 85 },
    "Defending": { "Perimeter Defense": 75, "Interior Defense": 60, "Help Defense IQ": 65, "Lateral Quickness": 82, "Pass Perception": 70, "Block": 55, "Shot Contest": 65, "Defensive Consistency": 70 },
    "Athleticism": { "Speed": 88, "Acceleration": 85, "Strength": 70, "Vertical": 85, "Stamina": 88, "Hustle": 85, "Hands": 80 },
    "Rebounding": { "Offensive Rebound": 55, "Defensive Rebound": 60, "Boxout": 65 }
  },
  "1 Year Ago": {
    "Inside Scoring": { "Close Shot": 82, "Driving Layup": 80, "Driving Dunk": 82, "Standing Dunk": 58, "Post Hook": 60, "Post Fade": 55, "Post Control": 58, "Draw Foul": 75 },
    "Outside Scoring": { "Free Throw": 78, "Mid-Range Shot": 80, "Three-Point Shot": 82, "Shot IQ": 85, "Offensive Consistency": 82 },
    "Playmaking": { "Pass Accuracy": 72, "Pass Vision": 75, "Pass IQ": 78, "Ball Handle": 82, "Speed with Ball": 85, "Offensive Awareness": 82 },
    "Defending": { "Perimeter Defense": 72, "Interior Defense": 58, "Help Defense IQ": 62, "Lateral Quickness": 80, "Pass Perception": 68, "Block": 52, "Shot Contest": 62, "Defensive Consistency": 68 },
    "Athleticism": { "Speed": 85, "Acceleration": 82, "Strength": 68, "Vertical": 82, "Stamina": 85, "Hustle": 82, "Hands": 78 },
    "Rebounding": { "Offensive Rebound": 52, "Defensive Rebound": 58, "Boxout": 62 }
  },
  "3 Years Ago": {
    "Inside Scoring": { "Close Shot": 75, "Driving Layup": 72, "Driving Dunk": 75, "Standing Dunk": 50, "Post Hook": 50, "Post Fade": 45, "Post Control": 48, "Draw Foul": 65 },
    "Outside Scoring": { "Free Throw": 70, "Mid-Range Shot": 72, "Three-Point Shot": 70, "Shot IQ": 75, "Offensive Consistency": 70 },
    "Playmaking": { "Pass Accuracy": 65, "Pass Vision": 68, "Pass IQ": 70, "Ball Handle": 75, "Speed with Ball": 78, "Offensive Awareness": 72 },
    "Defending": { "Perimeter Defense": 65, "Interior Defense": 50, "Help Defense IQ": 55, "Lateral Quickness": 75, "Pass Perception": 60, "Block": 45, "Shot Contest": 55, "Defensive Consistency": 60 },
    "Athleticism": { "Speed": 80, "Acceleration": 78, "Strength": 60, "Vertical": 78, "Stamina": 75, "Hustle": 75, "Hands": 70 },
    "Rebounding": { "Offensive Rebound": 45, "Defensive Rebound": 50, "Boxout": 55 }
  },
  "Rookie Year": {
    "Inside Scoring": { "Close Shot": 65, "Driving Layup": 60, "Driving Dunk": 65, "Standing Dunk": 45, "Post Hook": 40, "Post Fade": 35, "Post Control": 40, "Draw Foul": 55 },
    "Outside Scoring": { "Free Throw": 60, "Mid-Range Shot": 60, "Three-Point Shot": 55, "Shot IQ": 65, "Offensive Consistency": 60 },
    "Playmaking": { "Pass Accuracy": 55, "Pass Vision": 55, "Pass IQ": 60, "Ball Handle": 65, "Speed with Ball": 68, "Offensive Awareness": 60 },
    "Defending": { "Perimeter Defense": 55, "Interior Defense": 45, "Help Defense IQ": 48, "Lateral Quickness": 68, "Pass Perception": 50, "Block": 40, "Shot Contest": 48, "Defensive Consistency": 50 },
    "Athleticism": { "Speed": 75, "Acceleration": 75, "Strength": 55, "Vertical": 75, "Stamina": 65, "Hustle": 65, "Hands": 60 },
    "Rebounding": { "Offensive Rebound": 40, "Defensive Rebound": 45, "Boxout": 50 }
  }
};

const MOCK_TRAINING_HISTORY = [
  { program: "Limitless Sniper", start: "2024-05", end: "Present", duration: 120, team: "ATL" },
  { program: "Primary Creator", start: "2023-08", end: "2024-05", duration: 280, team: "ATL" },
  { program: "Generalist", start: "2021-08", end: "2023-08", duration: 730, team: "HOU" },
];

type TrainingHistoryItem = {
  program: string;
  start: string;
  end: string;
  duration: number;
  team: string;
  teamLogoUrl?: string;
};

type TargetTuple = "Rookie Year" | "3 Years Ago" | "1 Year Ago";
const TARGETS: TargetTuple[] = ["Rookie Year", "3 Years Ago", "1 Year Ago"];

export function PlayerProgressionModal({ player, nbaPlayer, currentYear, team, currentDate, trainingCalendar, onClose }: Props) {
  const [comparisonTarget, setComparisonTarget] = useState<TargetTuple>("1 Year Ago");

  // Real K2 + OVR/POT history derived from `nbaPlayer.ratings[]`. Falls back to
  // the legacy MOCK constants only when nbaPlayer / currentYear aren't supplied
  // (e.g. someone calls this modal from a context that hasn't wired the NBA data).
  const realData = useMemo(() => {
    if (!nbaPlayer || !currentYear) return null;
    const ratings = nbaPlayer.ratings ?? [];
    if (ratings.length === 0) return null;

    // OVR/POT history per season recorded on the player.
    const history: { year: number; ovr: number; pot: number }[] = [];
    for (const r of ratings) {
      const season = (r as any).season ?? currentYear;
      const ovrBbgm = calculatePlayerOverallForYear(nbaPlayer as any, season);
      const ovr2K = convertTo2KRating(ovrBbgm, (r as any).hgt ?? 50, (r as any).tp ?? 50);
      const pot = getDisplayPotential(nbaPlayer, season, season);
      history.push({ year: season, ovr: ovr2K, pot });
    }

    // K2 snapshots — current + 1Y/3Y/Rookie matched against ratings array.
    const pickSnapshot = (targetYear: number): any | null => {
      const sorted = [...ratings].sort((a: any, b: any) => ((a.season ?? 0) - (b.season ?? 0)));
      return sorted.find((rr: any) => rr.season === targetYear)
        ?? [...sorted].reverse().find((rr: any) => (rr.season ?? 0) <= targetYear)
        ?? sorted[0]
        ?? null;
    };
    const k2ForSeason = (targetYear: number): Record<K2Category, Record<string, number>> | null => {
      const r = pickSnapshot(targetYear);
      if (!r) return null;
      const season = (r as any).season ?? targetYear;
      const k2 = calculateK2(r as any, {
        pos: nbaPlayer.pos ?? 'F',
        heightIn: nbaPlayer.hgt ?? 78,
        weightLbs: nbaPlayer.weight ?? 220,
        age: season - (nbaPlayer.born?.year ?? season - 25),
      });
      return {
        'Inside Scoring':  Object.fromEntries(['Layup', 'Standing Dunk', 'Driving Dunk', 'Post Hook', 'Post Fade', 'Post Control', 'Draw Foul', 'Hands'].map((n, i) => [n, k2.IS.sub[i] ?? 50])) as any,
        'Outside Scoring': Object.fromEntries(['Close Shot', 'Mid-Range', 'Three-Point', 'Free Throw', 'Shot IQ', 'Off Consistency'].map((n, i) => [n, k2.OS.sub[i] ?? 50])) as any,
        'Playmaking':      Object.fromEntries(['Pass Accuracy', 'Ball Handle', 'Speed w/ Ball', 'Pass IQ', 'Pass Vision'].map((n, i) => [n, k2.PL.sub[i] ?? 50])) as any,
        'Defending':       Object.fromEntries(['Interior Def', 'Perimeter Def', 'Steal', 'Block', 'Help Def IQ', 'Pass Perception', 'Def Consistency'].map((n, i) => [n, k2.DF.sub[i] ?? 50])) as any,
        'Athleticism':     Object.fromEntries(['Speed', 'Agility', 'Strength', 'Vertical', 'Stamina', 'Hustle', 'Toughness'].map((n, i) => [n, k2.AT.sub[i] ?? 50])) as any,
        'Rebounding':      Object.fromEntries(['Off Rebound', 'Def Rebound'].map((n, i) => [n, k2.RB.sub[i] ?? 50])) as any,
      };
    };
    const rookieSeason = (ratings[0] as any)?.season ?? currentYear;

    const k2Map: Record<string, Record<K2Category, Record<string, number>> | null> = {
      'current': k2ForSeason(currentYear),
      '1 Year Ago': k2ForSeason(currentYear - 1),
      '3 Years Ago': k2ForSeason(currentYear - 3),
      'Rookie Year': k2ForSeason(rookieSeason),
    };

    const teamAbbrev = team?.abbrev ?? '';
    const teamLogoUrl = team?.logoUrl;
    const currentISO = (currentDate ?? '').slice(0, 10);
    const trainingHist: TrainingHistoryItem[] = [];
    const devFocus = (nbaPlayer as any).devFocus ?? 'Balanced';
    trainingHist.push({
      program: `${devFocus} Individual Focus`,
      start: history[0]?.year ? `${history[0].year}` : `${currentYear}`,
      end: 'Present',
      duration: Math.max(1, history.length * 365),
      team: teamAbbrev,
      teamLogoUrl,
    });

    const grouped = new Map<TrainingParadigm, { start: string; end: string; count: number }>();
    for (const [iso, plan] of Object.entries(trainingCalendar ?? {})) {
      if (!plan || (currentISO && iso > currentISO)) continue;
      if (plan.intensity <= 0) continue;
      const prev = grouped.get(plan.paradigm);
      if (prev) {
        prev.start = iso < prev.start ? iso : prev.start;
        prev.end = iso > prev.end ? iso : prev.end;
        prev.count += 1;
      } else {
        grouped.set(plan.paradigm, { start: iso, end: iso, count: 1 });
      }
    }

    const teamPrograms = [...grouped.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([paradigm, span]) => ({
        program: `${paradigm} Team Training`,
        start: span.start.slice(0, 7),
        end: span.end === currentISO ? 'Present' : span.end.slice(0, 7),
        duration: span.count,
        team: teamAbbrev,
        teamLogoUrl,
      }));
    trainingHist.push(...teamPrograms);

    return { history, k2Map, trainingHist };
  }, [nbaPlayer, currentYear, team, currentDate, trainingCalendar]);

  if (!player) return null;

  // Pull either real or mock data based on availability.
  const HISTORY = realData?.history ?? MOCK_HISTORY_OVR;
  const TRAINING_HISTORY = (realData?.trainingHist ?? MOCK_TRAINING_HISTORY) as TrainingHistoryItem[];
  const K2_DATA: Record<string, Record<K2Category, Record<string, number>>> = realData
    ? Object.fromEntries(
        Object.entries(realData.k2Map).map(([k, v]) => [k, v ?? K2_MOCK[k as keyof typeof K2_MOCK]])
      ) as any
    : K2_MOCK;

  // Calculate average for a category for given target
  const getCategoryAvg = (target: string, category: K2Category) => {
    const data = K2_DATA[target]?.[category] ?? K2_MOCK[target as keyof typeof K2_MOCK]?.[category] ?? {};
    const values = Object.values(data);
    if (values.length === 0) return 50;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  };

  const radarData = [
    { subject: 'Inside', fullMark: 100, current: getCategoryAvg('current', 'Inside Scoring'), compared: getCategoryAvg(comparisonTarget, 'Inside Scoring') },
    { subject: 'Outside', fullMark: 100, current: getCategoryAvg('current', 'Outside Scoring'), compared: getCategoryAvg(comparisonTarget, 'Outside Scoring') },
    { subject: 'Playmaking', fullMark: 100, current: getCategoryAvg('current', 'Playmaking'), compared: getCategoryAvg(comparisonTarget, 'Playmaking') },
    { subject: 'Athletic', fullMark: 100, current: getCategoryAvg('current', 'Athleticism'), compared: getCategoryAvg(comparisonTarget, 'Athleticism') },
    { subject: 'Defense', fullMark: 100, current: getCategoryAvg('current', 'Defending'), compared: getCategoryAvg(comparisonTarget, 'Defending') },
    { subject: 'Rebound', fullMark: 100, current: getCategoryAvg('current', 'Rebounding'), compared: getCategoryAvg(comparisonTarget, 'Rebounding') },
  ];

  const trainingHistorySection = (
    <div className="bg-slate-950/40 border border-slate-800/50 rounded-3xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-indigo-600/20 p-2 rounded-lg">
          <Calendar size={16} className="text-indigo-400" />
        </div>
        <div>
          <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest">Training Programs Undertook</h4>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Historical Development Focus</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TRAINING_HISTORY.map((program, idx) => (
          <div key={idx} className="flex flex-col gap-3 p-5 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden group hover:border-indigo-500/50 transition-colors shadow-lg">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 to-purple-500" />

            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-xs font-black uppercase text-white tracking-widest truncate">{program.program}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                   <Target size={10} className="text-indigo-400" /> Development Focus
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{program.team}</span>
                {program.teamLogoUrl ? (
                  <img
                    src={program.teamLogoUrl}
                    alt=""
                    className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 object-contain p-1 shadow-inner"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-black text-white shadow-inner">
                    {program.team.charAt(0)}
                  </div>
                )}
              </div>
            </div>

            <div className="h-px w-full bg-slate-800/80 my-1" />

            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                <Calendar size={12} className="text-indigo-400" />
                <span>{program.start} <span className="text-slate-600 mx-1">-&gt;</span> {program.end}</span>
              </div>
              <div className="flex items-center gap-1.5 text-indigo-400 bg-indigo-500/10 px-2.5 py-1.5 rounded-lg border border-indigo-500/20">
                <Activity size={12} />
                {program.duration} Days
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" 
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-6xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="p-6 border-b border-slate-800/60 flex justify-between items-center bg-slate-900/50">
           <div className="flex items-center gap-4">
              <div className="relative">
                {player.imgURL ? (
                  <img src={player.imgURL} alt="" className="w-12 h-12 rounded-full object-cover border border-slate-700 bg-slate-800" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 font-black text-xl">
                    {player.name.charAt(0)}
                  </div>
                )}
              </div>
              <div>
                 <h3 className="text-xl font-black text-white uppercase tracking-tight">{player.name}</h3>
                 <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Player Progression & Development Tracker</p>
              </div>
           </div>
           
           {/* Timeline Toggle */}
           <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 hidden md:flex">
             {TARGETS.map(target => (
               <button 
                 key={target}
                 onClick={() => setComparisonTarget(target)}
                 className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                   comparisonTarget === target 
                     ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                     : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                 }`}
               >
                 {target}
               </button>
             ))}
           </div>

           <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
              <X size={20} className="text-slate-500" />
           </button>
        </div>

        {/* Mobile toggle */}
        <div className="flex md:hidden p-4 border-b border-slate-800 justify-center">
             <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 w-full overflow-x-auto custom-scrollbar">
               {TARGETS.map(target => (
                 <button 
                   key={target}
                   onClick={() => setComparisonTarget(target)}
                   className={`flex-1 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                     comparisonTarget === target 
                       ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                       : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                   }`}
                 >
                   {target}
                 </button>
               ))}
             </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            
            {/* Left Col: Historical Graph & Radar */}
            <div className="xl:col-span-2 flex flex-col gap-8">
              {/* OVR vs POT Growth Curve */}
              <div className="bg-slate-950/40 border border-slate-800/50 rounded-3xl p-6 flex flex-col h-[350px]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-emerald-600/20 p-2 rounded-lg">
                    <TrendingUp size={16} className="text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest">OVR / POT Growth Curve</h4>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Historical Development Trajectory</p>
                  </div>
                </div>
                
                <div className="flex-1 min-h-0 w-full" style={{ position: 'relative' }}>
                  {/* DOCUMENTATION: Pass game state history here */}
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={HISTORY} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <XAxis 
                         dataKey="year" 
                         stroke="#475569" 
                         fontSize={10} 
                         tickLine={false}
                         axisLine={false}
                         tickMargin={10}
                      />
                      <YAxis 
                         stroke="#475569"
                         fontSize={10}
                         tickLine={false}
                         axisLine={false}
                         domain={[40, 100]}
                         tickCount={7}
                      />
                      <RechartsTooltip 
                        contentStyle={{ 
                          backgroundColor: '#0f172a', 
                          border: '1px solid #1e293b', 
                          borderRadius: '1rem',
                          fontFamily: 'inherit',
                          fontWeight: 'bold',
                          fontSize: '12px'
                        }}
                        itemStyle={{ color: '#f8fafc' }}
                        labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="pot" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ fill: '#0f172a', stroke: '#10b981', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, fill: '#10b981' }}
                        name="Potential"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="ovr" 
                        stroke="#3b82f6" 
                        strokeWidth={3}
                        dot={{ fill: '#0f172a', stroke: '#3b82f6', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, fill: '#3b82f6' }}
                        name="Overall"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Spider Chart Comparison */}
              <div className="bg-slate-950/40 border border-slate-800/50 rounded-3xl p-6 flex flex-col h-[400px]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-blue-600/20 p-2 rounded-lg">
                    <Crosshair size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest">Skill Evolution Radar</h4>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Category Progression Comparison</p>
                  </div>
                </div>
                
                <div className="flex-1 w-full min-h-0 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#1e293b" />
                      <PolarAngleAxis 
                        dataKey="subject" 
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900, textAnchor: 'middle' }} 
                      />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Current Form" dataKey="current" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                      <Radar name={comparisonTarget} dataKey="compared" stroke="#64748b" fill="#64748b" fillOpacity={0.1} strokeDasharray="5 5" />
                      <Legend 
                         wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {trainingHistorySection}
            </div>

            {/* Right Col: Delta Attributes */}
            <div className="flex flex-col gap-4 bg-slate-950/40 border border-slate-800/50 rounded-3xl p-6">
               <div className="flex items-center justify-between mb-2">
                 <div className="flex items-center gap-3">
                   <div className="bg-purple-600/20 p-2 rounded-lg">
                     <Activity size={16} className="text-purple-400" />
                   </div>
                   <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest">Attribute Deltas</h4>
                 </div>
               </div>

               <p className="text-[10px] text-slate-500 font-bold leading-relaxed mb-4">
                 Changes in key K2 sub-attributes since <span className="text-slate-300">{comparisonTarget}</span>.
               </p>

               <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                 {(Object.keys(K2_DATA.current ?? K2_MOCK.current) as K2Category[]).map(category => (
                   <div key={category} className="space-y-2">
                     <h5 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest pl-1 mb-3">{category}</h5>
                     {Object.keys((K2_DATA.current ?? K2_MOCK.current)[category] ?? {}).map(attr => {
                       const curr = (K2_DATA.current ?? K2_MOCK.current)[category]?.[attr] ?? 50;
                       const prev = (K2_DATA[comparisonTarget] ?? K2_MOCK[comparisonTarget])?.[category]?.[attr] ?? curr;
                       const diff = curr - prev;

                       return (
                         <div key={attr} className="flex justify-between items-center py-2 px-3 bg-slate-900 border border-slate-800/80 rounded-xl">
                           <span className="text-[9px] font-bold uppercase text-slate-300 tracking-widest">{attr}</span>
                           <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-white w-5 text-right tabular-nums">{curr}</span>
                              <div className={`flex items-center justify-center min-w-[32px] px-1.5 py-0.5 rounded text-[9px] font-black tabular-nums ${
                                diff > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                                diff < 0 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                                'bg-slate-800 text-slate-500 border border-slate-700'
                              }`}>
                                {diff > 0 ? '+' : ''}{diff}
                              </div>
                           </div>
                         </div>
                       );
                     })}
                   </div>
                 ))}
               </div>
            </div>

          </div>

        </div>
      </motion.div>
    </div>
  );
}
