import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { normalizeDate } from '../../utils/helpers';

interface GameResult {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  homeStats?: any[];
  awayStats?: any[];
  date?: string;
  [key: string]: any;
}

interface Team {
  id: number;
  name: string;
  abbrev: string;
  logoUrl?: string;
  wins: number;
  losses: number;
  [key: string]: any;
}

interface Player {
  internalId: string;
  name: string;
  tid: number;
  imgURL?: string;
  [key: string]: any;
}

interface Props {
  allSimResults: GameResult[];
  teams: Team[];
  prevTeams?: Team[];
  players: Player[];
  actionType?: string;
  actionPayload?: any;
}

function getTeam(teams: Team[], id: number) {
  return teams.find(t => t.id === id);
}

function getBestPerformer(stats: any[], players: Player[], teams: Team[]) {
  if (!stats || stats.length === 0) return null;
  const sorted = [...stats].sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0));
  const top = sorted[0];
  if (!top) return null;
  const player = players.find(p => p.internalId === top.playerId || p.name === top.name);
  const team = player ? teams.find(t => t.id === player.tid) : undefined;
  const parts: string[] = [];
  if (top.pts != null) parts.push(`${top.pts} PTS`);
  if (top.ast != null && top.ast >= 5) parts.push(`${top.ast} AST`);
  if (top.reb != null && top.reb >= 5) parts.push(`${top.reb} REB`);
  if (top.blk != null && top.blk >= 2) parts.push(`${top.blk} BLK`);
  return {
    name: top.name || top.playerName || 'Unknown',
    statLine: parts.join(' · '),
    imgURL: player?.imgURL,
    teamLogo: team?.logoUrl,
  };
}

function groupByDate(results: GameResult[]) {
  const groups: { date: string; results: GameResult[] }[] = [];
  const seen = new Map<string, GameResult[]>();
  for (const r of results) {
    const d = r.date ? normalizeDate(r.date) : 'unknown';
    if (!seen.has(d)) { seen.set(d, []); groups.push({ date: d, results: seen.get(d)! }); }
    seen.get(d)!.push(r);
  }
  return groups;
}

function formatDate(dateStr: string) {
  if (!dateStr || dateStr === 'unknown') return '';
  try {
    const d = new Date(`${dateStr}T00:00:00Z`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase();
  } catch { return dateStr; }
}

const itemVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
};

export const SimulationTicker: React.FC<Props> = ({
  allSimResults, teams, prevTeams, players, actionType, actionPayload
}) => {
  const hasGames = allSimResults && allSimResults.length > 0;
  const groups = hasGames ? groupByDate(allSimResults) : [];

  type Item =
    | { type: 'dateHeader'; label: string }
    | { type: 'game'; result: GameResult }
    | { type: 'standings' }
    | { type: 'final' };

  const items: Item[] = [];
  for (const g of groups) {
    items.push({ type: 'dateHeader', label: formatDate(g.date) });
    for (const r of g.results) items.push({ type: 'game', result: r });
  }
  if (prevTeams && prevTeams.length > 0 && hasGames) items.push({ type: 'standings' });
  items.push({ type: 'final' });

  const [shownCount, setShownCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [shownCount]);

  useEffect(() => {
    if (!hasGames) {
      const t = setTimeout(() => setShownCount(items.length), 800);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    let idx = 0;
    const showNext = () => {
      if (cancelled) return;
      idx++;
      setShownCount(idx);
      if (idx < items.length) {
        const delay = items[idx]?.type === 'dateHeader' ? 200 :
                      items[idx]?.type === 'standings' ? 400 :
                      items[idx]?.type === 'final' ? 600 : 700;
        setTimeout(showNext, delay);
      }
    };
    setTimeout(showNext, 300);
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleItems = items.slice(0, shownCount);

  // Standings movement — skip preseason games
  const regularResults = allSimResults.filter(r => !r.isPreseason);
  const movedTeamIds = hasGames && prevTeams
    ? [...new Set(regularResults.flatMap(r => [r.homeTeamId, r.awayTeamId]))]
    : [];
  const standingsRows = movedTeamIds.map(tid => {
    const prev = prevTeams?.find(t => t.id === tid);
    const curr = teams.find(t => t.id === tid);
    if (!prev || !curr) return null;
    const wDiff = (curr.wins ?? 0) - (prev.wins ?? 0);
    const lDiff = (curr.losses ?? 0) - (prev.losses ?? 0);
    return { team: curr, wDiff, lDiff };
  }).filter(Boolean) as { team: Team; wDiff: number; lDiff: number }[];

  const eastRows = standingsRows.filter(r => r.team.conference === 'East');
  const westRows = standingsRows.filter(r => r.team.conference === 'West');
  const hasEast = eastRows.length > 0;
  const hasWest = westRows.length > 0;
  const showBothConferences = hasEast && hasWest;

  const [activeConference, setActiveConference] = useState<'East' | 'West'>('East');

  useEffect(() => {
    if (!showBothConferences) return;
    const t = setInterval(() => {
      setActiveConference(prev => prev === 'East' ? 'West' : 'East');
    }, 3000);
    return () => clearInterval(t);
  }, [showBothConferences]);

  return (
    <div className="flex flex-col gap-3 w-full pb-4">

      {/* Action day — no games */}
      {!hasGames && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-3 text-center py-8"
        >
          <div className="text-4xl">⚡</div>
          <p className="text-white font-bold text-lg tracking-tight">Processing Commissioner Action</p>
          {actionPayload?.targetName && (
            <p className="text-indigo-400 text-sm font-medium">{actionPayload.targetName}</p>
          )}
          {actionType && (
            <p className="text-slate-500 text-xs uppercase tracking-widest">{actionType.replace(/_/g, ' ')}</p>
          )}
          <div className="flex gap-1.5 mt-2">
            {[0,1,2].map(i => (
              <motion.div key={i} className="w-2 h-2 bg-indigo-500 rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Game items */}
      <AnimatePresence initial={false}>
        {visibleItems.map((item, idx) => {
          if (item.type === 'dateHeader') return (
            <motion.div key={`dh-${idx}`} variants={itemVariants} initial="hidden" animate="visible"
              className="flex items-center gap-3 mt-2">
              <div className="h-px flex-1 bg-slate-700/50" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{item.label}</span>
              <div className="h-px flex-1 bg-slate-700/50" />
            </motion.div>
          );

          if (item.type === 'game') {
            const r = item.result;
            const home = getTeam(teams, r.homeTeamId);
            const away = getTeam(teams, r.awayTeamId);
            const homeWon = r.homeScore > r.awayScore;
            const homeBest = getBestPerformer(r.homeStats || [], players, teams);
            const awayBest = getBestPerformer(r.awayStats || [], players, teams);
            const winnerBest = homeWon ? homeBest : awayBest;
            const loserBest = homeWon ? awayBest : homeBest;

            return (
              <motion.div key={`g-${idx}`} variants={itemVariants} initial="hidden" animate="visible"
                className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
                {/* Score row */}
                <div className="flex items-center justify-between px-3 py-3 gap-1">
                  {/* Away */}
                  <div className={`flex items-center gap-2 flex-1 min-w-0 ${homeWon ? 'opacity-40' : ''}`}>
                    {away?.logoUrl && <img src={away.logoUrl} alt={away.abbrev} className="w-7 h-7 md:w-9 md:h-9 object-contain shrink-0" referrerPolicy="no-referrer" />}
                    <div className="min-w-0">
                      <div className="text-white font-black text-xs md:text-sm">{away?.abbrev}</div>
                      <div className="text-slate-500 text-[10px] truncate hidden sm:block">{away?.name}</div>
                    </div>
                  </div>
                  {/* Scores */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xl md:text-2xl font-black tabular-nums ${!homeWon ? 'text-white drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]' : 'text-slate-500'}`}>
                      {r.awayScore}
                    </span>
                    <span className="text-slate-600 text-sm">—</span>
                    <span className={`text-xl md:text-2xl font-black tabular-nums ${homeWon ? 'text-white drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]' : 'text-slate-500'}`}>
                      {r.homeScore}
                    </span>
                  </div>
                  {/* Home */}
                  <div className={`flex items-center justify-end gap-2 flex-1 min-w-0 ${!homeWon ? 'opacity-40' : ''}`}>
                    <div className="min-w-0 text-right">
                      <div className="text-white font-black text-xs md:text-sm">{home?.abbrev}</div>
                      <div className="text-slate-500 text-[10px] truncate hidden sm:block">{home?.name}</div>
                    </div>
                    {home?.logoUrl && <img src={home.logoUrl} alt={home.abbrev} className="w-7 h-7 md:w-9 md:h-9 object-contain shrink-0" referrerPolicy="no-referrer" />}
                  </div>
                </div>

                {/* Best performers */}
                {(winnerBest || loserBest) && (
                  <div className="border-t border-slate-700/40 px-4 py-2 flex flex-col gap-1.5">
                    {winnerBest && (
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 text-[10px] font-black uppercase tracking-wider w-3">W</span>
                        {winnerBest.imgURL && <img src={winnerBest.imgURL} alt={winnerBest.name} className="w-5 h-5 rounded-full object-cover border border-slate-600" referrerPolicy="no-referrer" />}
                        <span className="text-slate-200 text-xs font-semibold">{winnerBest.name}</span>
                        <span className="text-slate-500 text-[10px] ml-auto">{winnerBest.statLine}</span>
                      </div>
                    )}
                    {loserBest && (
                      <div className="flex items-center gap-2">
                        <span className="text-rose-400 text-[10px] font-black uppercase tracking-wider w-3">L</span>
                        {loserBest.imgURL && <img src={loserBest.imgURL} alt={loserBest.name} className="w-5 h-5 rounded-full object-cover border border-slate-600" referrerPolicy="no-referrer" />}
                        <span className="text-slate-200 text-xs font-semibold">{loserBest.name}</span>
                        <span className="text-slate-500 text-[10px] ml-auto">{loserBest.statLine}</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          }

          if (item.type === 'standings' && standingsRows.length > 0) {
            const displayRows = showBothConferences
              ? (activeConference === 'East' ? eastRows : westRows)
              : standingsRows;
            const conferenceLabel = showBothConferences
              ? activeConference
              : hasEast ? 'East' : hasWest ? 'West' : '';

            return (
              <motion.div key="standings" variants={itemVariants} initial="hidden" animate="visible"
                className="bg-slate-800/40 border border-slate-700/30 rounded-2xl overflow-hidden mt-2">
                <div className="px-4 py-2 border-b border-slate-700/30 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                    Standings Movement
                  </span>
                  {showBothConferences && (
                    <div className="flex gap-2">
                      {(['East', 'West'] as const).map(conf => (
                        <button
                          key={conf}
                          onClick={() => setActiveConference(conf)}
                          className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full transition-all
                            ${activeConference === conf
                              ? 'bg-indigo-500/20 text-indigo-400'
                              : 'text-slate-600 hover:text-slate-400'}`}
                        >
                          {conf}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={conferenceLabel}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="divide-y divide-slate-700/20"
                  >
                    {conferenceLabel && (
                      <div className="px-4 py-1.5">
                        <span className={`text-[9px] font-black uppercase tracking-widest
                          ${conferenceLabel === 'East' ? 'text-sky-500' : 'text-amber-500'}`}>
                          {conferenceLabel}ern Conference
                        </span>
                      </div>
                    )}
                    {displayRows.map(({ team, wDiff, lDiff }) => (
                      <div key={team.id} className="flex items-center gap-3 px-4 py-2">
                        {team.logoUrl && (
                          <img src={team.logoUrl} alt={team.abbrev}
                               className="w-6 h-6 object-contain"
                               referrerPolicy="no-referrer" />
                        )}
                        <span className="text-white text-xs font-bold flex-1">{team.name}</span>
                        <span className="text-slate-400 text-xs font-mono">{team.wins}-{team.losses}</span>
                        <span className={`text-xs font-black ml-2 w-12 text-right
                          ${wDiff > 0 ? 'text-emerald-400' : lDiff > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                          {wDiff > 0 ? `↑ +${wDiff}W` : lDiff > 0 ? `↓ +${lDiff}L` : '—'}
                        </span>
                      </div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            );
          }

          if (item.type === 'final') return (
            <motion.div key="final" variants={itemVariants} initial="hidden" animate="visible"
              className="flex flex-col items-center gap-2 py-4">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="text-2xl">🏀</motion.div>
              <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.8, repeat: Infinity }} className="text-slate-400 text-sm font-medium">
                Generating league reactions...
              </motion.p>
            </motion.div>
          );

          return null;
        })}
      </AnimatePresence>

      <div ref={bottomRef} />
    </div>
  );
};
