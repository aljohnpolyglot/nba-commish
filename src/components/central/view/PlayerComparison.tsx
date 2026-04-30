import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeftRight, UserPlus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer } from '../../../types';
import { calculateK2, K2_CATS } from '../../../services/simulation/convert2kAttributes';
import { getDisplayOverall, getDisplayPotential } from '../../../utils/playerRatings';
import { PlayerSelectorGrid, PlayerSelectorItem } from '../../shared/PlayerSelectorGrid';

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');

const K2_DISPLAY_CATS = K2_CATS.filter(c => c.k !== 'MI');

type StatMode = 'perGame' | 'advanced';

const EXTERNAL_STATUSES = ['WNBA','Euroleague','PBA','B-League','G-League','Endesa','China CBA','NBL Australia'];
const MODAL_LEAGUES = ['NBA', 'Draft Prospects', ...EXTERNAL_STATUSES, 'Retired'] as const;
type ModalLeague = typeof MODAL_LEAGUES[number];

function getPlayerLeague(p: NBAPlayer): ModalLeague {
  if (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') return 'Draft Prospects';
  if (p.status === 'Retired') return 'Retired';
  if (EXTERNAL_STATUSES.includes(p.status ?? '')) return p.status as ModalLeague;
  return 'NBA';
}

interface Metric {
  id: string;
  label: string;
  title?: string;
  getValue: (p: NBAPlayer, season: number) => number;
  format: (v: number) => string;
  isBetterHigher: boolean;
}

// Raw totals → per-game
function pg(p: NBAPlayer, s: number, key: keyof typeof p.stats[0]): number {
  const stat = p.stats?.find(x => x.season === s && !x.playoffs);
  if (!stat || !stat.gp) return 0;
  return (stat[key] as number ?? 0) / stat.gp;
}
// Pre-computed rates (not per-gp)
function rate(p: NBAPlayer, s: number, key: keyof typeof p.stats[0]): number {
  return (p.stats?.find(x => x.season === s && !x.playoffs)?.[key] as number) ?? 0;
}

const fmt1 = (v: number) => v.toFixed(1);
const fmtSign = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1);
const fmtPct3 = (v: number) => v > 0 ? '.' + Math.round(v * 1000).toString().padStart(3, '0') : '—';

const PG_METRICS: Metric[] = [
  { id: 'pts',  label: 'PTS',  isBetterHigher: true,  format: fmt1,    getValue: (p, s) => pg(p, s, 'pts') },
  { id: 'reb',  label: 'REB',  isBetterHigher: true,  format: fmt1,    getValue: (p, s) => pg(p, s, 'trb') },
  { id: 'ast',  label: 'AST',  isBetterHigher: true,  format: fmt1,    getValue: (p, s) => pg(p, s, 'ast') },
  { id: 'stl',  label: 'STL',  isBetterHigher: true,  format: fmt1,    getValue: (p, s) => pg(p, s, 'stl') },
  { id: 'blk',  label: 'BLK',  isBetterHigher: true,  format: fmt1,    getValue: (p, s) => pg(p, s, 'blk') },
  { id: 'tov',  label: 'TOV',  isBetterHigher: false, format: fmt1,    getValue: (p, s) => pg(p, s, 'tov') },
  { id: 'min',  label: 'MIN',  isBetterHigher: true,  format: fmt1,    getValue: (p, s) => pg(p, s, 'min') },
  { id: 'gp',   label: 'GP',   isBetterHigher: true,  format: v => String(Math.round(v)), getValue: (p, s) => rate(p, s, 'gp') },
  { id: 'ts',   label: 'TS%',  isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'tsPct') },
  { id: 'rts',  label: 'rTS%', isBetterHigher: true,  format: v => (v > 0 ? '+' : '') + fmt1(v), getValue: (p, s) => rate(p, s, 'tsPct') - 58.0 },
  { id: 'tpp',  label: '3P%',  isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'tpp') },
  { id: 'ftp',  label: 'FT%',  isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'ftp') },
];

const ADV_METRICS: Metric[] = [
  { id: 'gp',    label: 'GP',     isBetterHigher: true,  format: v => String(Math.round(v)), getValue: (p, s) => rate(p, s, 'gp') },
  { id: 'min',   label: 'MIN',    isBetterHigher: true,  format: fmt1,    getValue: (p, s) => pg(p, s, 'min') },
  { id: 'per',   label: 'PER',    title: 'Player Efficiency Rating',         isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'per') },
  { id: 'ewa',   label: 'EWA',    title: 'Estimated Wins Added',             isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'ewa') },
  { id: 'ts',    label: 'TS%',    title: 'True Shooting %',                  isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'tsPct') },
  { id: 'usg',   label: 'USG%',   title: 'Usage Rate',                       isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'usgPct') },
  { id: 'pm',    label: '+/-',    title: 'Plus/Minus per game',              isBetterHigher: true,  format: fmtSign, getValue: (p, s) => pg(p, s, 'pm') },
  { id: 'ortg',  label: 'ORtg',   title: 'Offensive Rating',                 isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'ortg') },
  { id: 'drtg',  label: 'DRtg',   title: 'Defensive Rating (lower = better)',isBetterHigher: false, format: fmt1,    getValue: (p, s) => rate(p, s, 'drtg') },
  { id: 'orbp',  label: 'ORB%',   title: 'Offensive Rebound %',              isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'orbPct') },
  { id: 'drbp',  label: 'DRB%',   title: 'Defensive Rebound %',              isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'drbPct') },
  { id: 'trbp',  label: 'TRB%',   title: 'Total Rebound %',                  isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'rebPct') },
  { id: 'astp',  label: 'AST%',   title: 'Assist %',                         isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'astPct') },
  { id: 'stlp',  label: 'STL%',   title: 'Steal %',                          isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'stlPct') },
  { id: 'blkp',  label: 'BLK%',   title: 'Block %',                          isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'blkPct') },
  { id: 'tovp',  label: 'TOV%',   title: 'Turnover %',                       isBetterHigher: false, format: fmt1,    getValue: (p, s) => rate(p, s, 'tovPct') },
  { id: 'obpm',  label: 'OBPM',   title: 'Offensive Box Plus-Minus',         isBetterHigher: true,  format: fmtSign, getValue: (p, s) => rate(p, s, 'obpm') },
  { id: 'dbpm',  label: 'DBPM',   title: 'Defensive Box Plus-Minus',         isBetterHigher: true,  format: fmtSign, getValue: (p, s) => rate(p, s, 'dbpm') },
  { id: 'bpm',   label: 'BPM',    title: 'Box Plus-Minus',                   isBetterHigher: true,  format: fmtSign, getValue: (p, s) => rate(p, s, 'bpm') },
  { id: 'ws',    label: 'WS',     title: 'Win Shares',                       isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'ws') },
  { id: 'ws48',  label: 'WS/48',  title: 'Win Shares per 48 min',            isBetterHigher: true,  format: v => v.toFixed(3), getValue: (p, s) => {
    const stat = p.stats?.find(x => x.season === s && !x.playoffs);
    if (!stat || !stat.min) return 0;
    return (stat.ws ?? 0) / (stat.min / 48);
  }},
  { id: 'vorp',  label: 'VORP',   title: 'Value Over Replacement Player',    isBetterHigher: true,  format: fmt1,    getValue: (p, s) => rate(p, s, 'vorp') },
];

function getK2(player: NBAPlayer) {
  const r = player.ratings?.[player.ratings.length - 1];
  if (!r) return null;
  return calculateK2(r as any, {
    pos: player.pos,
    heightIn: player.hgt,
    weightLbs: player.weight,
    age: player.age,
  });
}

export const PlayerComparisonView: React.FC = () => {
  const { state } = useGame();
  const [player1, setPlayer1] = useState<NBAPlayer | null>(null);
  const [player2, setPlayer2] = useState<NBAPlayer | null>(null);
  const [selectingForSlot, setSelectingForSlot] = useState<1 | 2 | null>(null);
  const [modalLeague, setModalLeague] = useState<ModalLeague>('NBA');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [season, setSeason] = useState<number>(() => state.leagueStats.year);
  const [statMode, setStatMode] = useState<StatMode>('perGame');

  const availableSeasons = useMemo(() => {
    const years = new Set<number>();
    [player1, player2].forEach(p => {
      p?.stats?.filter(s => !s.playoffs && (s.gp ?? 0) > 0).forEach(s => years.add(s.season));
    });
    if (years.size === 0) years.add(state.leagueStats.year);
    return Array.from(years).sort((a, b) => b - a);
  }, [player1, player2, state.leagueStats.year]);

  const seasonIdx = availableSeasons.indexOf(season);

  // Merge nonNBATeams so PSG can resolve abbrevs for external/retired players.
  // Coerce tid→id so PSG's `teams.find(t => t.id === player.tid)` works.
  const mergedTeams = useMemo(() => [
    ...state.teams,
    ...(state.nonNBATeams ?? []).map((t: any) => ({ ...t, id: t.tid })),
  ] as typeof state.teams, [state.teams, state.nonNBATeams]);

  const allSelectorItems = useMemo((): PlayerSelectorItem[] =>
    state.players
      .filter(p => !(p as any).diedYear)
      .map(p => {
        const displayOvr = getDisplayOverall(p, state.leagueStats.year);
        // For players with no resolvable team (FA/retired tid=-1), hint via subtitle
        const noTeam = p.tid === -1 || (p.status === 'Retired' && !state.teams.find(t => t.id === p.tid) && !(state.nonNBATeams ?? []).find((t: any) => t.tid === p.tid));
        return { player: p, score: displayOvr, subtitle: noTeam ? (p.status === 'Retired' ? 'RET' : 'FA') : undefined };
      }),
  [state.players, state.teams, state.nonNBATeams, state.leagueStats.year]);

  const selectorItems = useMemo((): PlayerSelectorItem[] =>
    allSelectorItems.filter(x => getPlayerLeague(x.player) === modalLeague),
  [allSelectorItems, modalLeague]);

  const k2_1 = useMemo(() => player1 ? getK2(player1) : null, [player1]);
  const k2_2 = useMemo(() => player2 ? getK2(player2) : null, [player2]);

  const selectedSet1 = useMemo(() => player1 ? new Set([player1.internalId]) : new Set<string>(), [player1]);
  const selectedSet2 = useMemo(() => player2 ? new Set([player2.internalId]) : new Set<string>(), [player2]);
  const activeSelectedSet = selectingForSlot === 1 ? selectedSet1 : selectedSet2;

  const activeMetrics = statMode === 'advanced' ? ADV_METRICS : PG_METRICS;

  const toggleCat = (k: string) =>
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  const openSlot = (slot: 1 | 2) => {
    setModalLeague('NBA');
    setSelectingForSlot(slot);
  };

  const handleSlotToggle = (playerId: string) => {
    const found = state.players.find(p => p.internalId === playerId) ?? null;
    if (selectingForSlot === 1) setPlayer1(prev => prev?.internalId === playerId ? null : found);
    else if (selectingForSlot === 2) setPlayer2(prev => prev?.internalId === playerId ? null : found);
    setSelectingForSlot(null);
  };

  const clearSlot = (slot: 1 | 2) => {
    if (slot === 1) setPlayer1(null);
    else setPlayer2(null);
    setSelectingForSlot(null);
  };

  return (
    <div className="h-full flex flex-col bg-[#0f172a] text-slate-200 overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800 shrink-0">
        <ArrowLeftRight className="text-amber-400 w-5 h-5 shrink-0" />
        <h1 className="text-xl font-black text-white uppercase tracking-tight">Player Comparison</h1>
      </div>

      {/* Season Selector */}
      <div className="flex items-center justify-center gap-3 py-2.5 border-b border-slate-800 bg-slate-900/40 shrink-0">
        <button
          onClick={() => { const next = availableSeasons[seasonIdx + 1]; if (next !== undefined) setSeason(next); }}
          disabled={seasonIdx >= availableSeasons.length - 1}
          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-bold text-slate-300 w-24 text-center">
          {season}–{String(season + 1).slice(2)} Season
        </span>
        <button
          onClick={() => { const prev = availableSeasons[seasonIdx - 1]; if (prev !== undefined) setSeason(prev); }}
          disabled={seasonIdx <= 0}
          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-12 custom-scrollbar">
        <div className="max-w-3xl mx-auto">

          {/* Player Cards */}
          <div className="grid grid-cols-2 gap-8 py-8">
            {([1, 2] as const).map(slot => {
              const player = slot === 1 ? player1 : player2;
              const team = player ? state.teams.find(t => t.id === player.tid) : null;
              const teamColor = team?.colors?.[0] || '#334155';

              return (
                <div key={slot} className="flex flex-col items-center gap-3">
                  <button
                    onClick={() => openSlot(slot)}
                    className={cn(
                      "w-40 h-40 rounded-2xl overflow-hidden border-2 transition-all group relative",
                      player && slot === 1 && "border-amber-500/60 shadow-xl shadow-amber-500/10",
                      player && slot === 2 && "border-sky-500/60 shadow-xl shadow-sky-500/10",
                      !player && "border-dashed border-slate-700 hover:border-indigo-500/50 bg-slate-800/50"
                    )}
                    style={player ? { backgroundColor: teamColor } : {}}
                  >
                    {player ? (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/60 z-10 pointer-events-none" />
                        {team?.logoUrl && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                            <img src={team.logoUrl} alt="" className="w-32 h-32 object-contain grayscale brightness-200" referrerPolicy="no-referrer" />
                          </div>
                        )}
                        <img
                          src={player.imgURL || `https://picsum.photos/seed/${player.internalId}/200/200`}
                          alt={player.name}
                          className="w-full h-full object-cover relative z-0 brightness-110 contrast-110"
                          referrerPolicy="no-referrer"
                        />
                        {team?.logoUrl && (
                          <div className="absolute top-2 left-2 w-7 h-7 z-20 bg-white/10 backdrop-blur-md rounded-lg p-1 border border-white/20">
                            <img src={team.logoUrl} alt={team.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors flex items-center justify-center z-30">
                          <UserPlus className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={22} />
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-500 group-hover:text-indigo-400 transition-colors">
                        <UserPlus size={30} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Select</span>
                      </div>
                    )}
                  </button>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{player ? player.name : `Player ${slot}`}</div>
                    {player && (
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {player.pos} · {team?.abbrev ?? (player.status === 'Retired' ? 'RET' : 'FA')}
                        {' · '}
                        <span className="text-indigo-400 font-black">{getDisplayOverall(player, state.leagueStats.year)}</span>
                        <span className="text-slate-600"> / {getDisplayPotential(player, state.leagueStats.year, state.leagueStats.year)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* K2 Attributes */}
          <div className="mb-6">
            <div className="flex items-center justify-center mb-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">2K Attributes</span>
            </div>
            <div className="bg-[#1e293b]/60 rounded-2xl border border-slate-800 overflow-hidden">
              {K2_DISPLAY_CATS.map((cat, ci) => {
                const c1 = k2_1 ? (k2_1 as any)[cat.k] as { ovr: number; sub: number[] } : null;
                const c2 = k2_2 ? (k2_2 as any)[cat.k] as { ovr: number; sub: number[] } : null;
                const isExpanded = expandedCats.has(cat.k);
                const p1Better = c1 && c2 && c1.ovr > c2.ovr;
                const p2Better = c1 && c2 && c2.ovr > c1.ovr;

                return (
                  <div key={cat.k} className={cn("border-b border-slate-800/50", ci === K2_DISPLAY_CATS.length - 1 && "border-b-0")}>
                    <button
                      onClick={() => toggleCat(cat.k)}
                      className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-3 hover:bg-slate-800/30 transition-colors group"
                    >
                      <div className="flex items-center justify-end">
                        <span className={cn("text-xl font-black tabular-nums", p1Better ? "text-amber-400" : "text-slate-300")}>
                          {c1 ? c1.ovr : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 justify-center min-w-[9rem]">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-indigo-400 transition-colors">
                          {cat.n}
                        </span>
                        {isExpanded
                          ? <ChevronUp size={10} className="text-slate-600 shrink-0" />
                          : <ChevronDown size={10} className="text-slate-600 shrink-0" />}
                      </div>
                      <div className="flex items-center justify-start">
                        <span className={cn("text-xl font-black tabular-nums", p2Better ? "text-sky-400" : "text-slate-300")}>
                          {c2 ? c2.ovr : '—'}
                        </span>
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-3 pt-1 space-y-2 bg-slate-900/30">
                            {(cat.sub as readonly string[]).map((subName, si) => {
                              const sv1 = c1?.sub[si];
                              const sv2 = c2?.sub[si];
                              const s1Better = sv1 !== undefined && sv2 !== undefined && sv1 > sv2;
                              const s2Better = sv1 !== undefined && sv2 !== undefined && sv2 > sv1;
                              return (
                                <div key={subName} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                                  <div className="flex justify-end">
                                    <span className={cn("text-sm font-bold tabular-nums", s1Better ? "text-amber-400" : "text-slate-500")}>
                                      {sv1 ?? '—'}
                                    </span>
                                  </div>
                                  <div className="min-w-[9rem] text-center">
                                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">{subName}</span>
                                  </div>
                                  <div className="flex justify-start">
                                    <span className={cn("text-sm font-bold tabular-nums", s2Better ? "text-sky-400" : "text-slate-500")}>
                                      {sv2 ?? '—'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats section */}
          <div className="mb-4">
            {/* Stat mode toggle */}
            <div className="flex items-center justify-center gap-1 mb-3 bg-slate-900/60 rounded-xl p-1 w-fit mx-auto border border-slate-800">
              {(['perGame', 'advanced'] as StatMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setStatMode(mode)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors",
                    statMode === mode
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  {mode === 'perGame' ? 'Per Game' : 'Advanced'}
                </button>
              ))}
            </div>

            <div className="bg-[#1e293b]/60 rounded-2xl border border-slate-800 overflow-hidden">
              {activeMetrics.map((metric, mi) => {
                const val1 = player1 ? metric.getValue(player1, season) : null;
                const val2 = player2 ? metric.getValue(player2, season) : null;
                const diff = val1 !== null && val2 !== null ? val1 - val2 : null;
                const isP1Better = diff !== null && (metric.isBetterHigher ? diff > 0 : diff < 0);
                const isP2Better = diff !== null && (metric.isBetterHigher ? diff < 0 : diff > 0);

                return (
                  <div
                    key={metric.id}
                    className={cn(
                      "grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-2.5 border-b border-slate-800/40",
                      mi === activeMetrics.length - 1 && "border-b-0"
                    )}
                  >
                    <div className="flex items-center justify-end gap-2">
                      {isP1Better && diff !== null && (
                        <span className="bg-amber-400/15 text-amber-400 px-1.5 py-0.5 rounded text-[9px] font-bold border border-amber-400/20">
                          +{Math.abs(diff).toFixed(1)}
                        </span>
                      )}
                      <span className={cn("text-base font-bold tabular-nums", val1 !== null ? "text-white" : "text-slate-700")}>
                        {val1 !== null ? metric.format(val1) : '—'}
                      </span>
                    </div>
                    <div className="min-w-[4.5rem] text-center" title={metric.title}>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{metric.label}</span>
                    </div>
                    <div className="flex items-center justify-start gap-2">
                      <span className={cn("text-base font-bold tabular-nums", val2 !== null ? "text-white" : "text-slate-700")}>
                        {val2 !== null ? metric.format(val2) : '—'}
                      </span>
                      {isP2Better && diff !== null && (
                        <span className="bg-sky-400/15 text-sky-400 px-1.5 py-0.5 rounded text-[9px] font-bold border border-sky-400/20">
                          +{Math.abs(diff).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Player Selector Modal */}
      <AnimatePresence>
        {selectingForSlot !== null && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectingForSlot(null)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[82vh]"
            >
              {/* Modal header */}
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
                <h2 className="text-base font-black text-white uppercase tracking-tight">
                  Select Player {selectingForSlot}
                </h2>
                <div className="flex items-center gap-2">
                  {(selectingForSlot === 1 ? player1 : player2) && (
                    <button
                      onClick={() => clearSlot(selectingForSlot!)}
                      className="text-xs font-bold text-rose-400 hover:text-rose-300 border border-rose-500/30 hover:border-rose-400/50 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <button onClick={() => setSelectingForSlot(null)} className="text-slate-500 hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* League filter chips */}
              <div className="px-4 py-2.5 border-b border-slate-800/60 flex gap-1.5 flex-wrap shrink-0 bg-slate-900/60">
                {MODAL_LEAGUES.map(lg => (
                  <button
                    key={lg}
                    onClick={() => setModalLeague(lg)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors border",
                      modalLeague === lg
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-slate-800 border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-500"
                    )}
                  >
                    {lg === 'NBL Australia' ? 'NBL' : lg === 'China CBA' ? 'CBA' : lg === 'Draft Prospects' ? 'Prospects' : lg}
                  </button>
                ))}
              </div>

              {/* Scrollable grid */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <PlayerSelectorGrid
                  items={selectorItems}
                  teams={mergedTeams}
                  selectedIds={activeSelectedSet}
                  onToggle={handleSlotToggle}
                  maxSelections={1}
                  accentColor={selectingForSlot === 1 ? 'amber' : 'sky'}
                  searchPlaceholder="Search players..."
                  defaultVisible={30}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
