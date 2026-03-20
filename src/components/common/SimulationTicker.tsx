import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface GameResult {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  homeStats?: any[];
  awayStats?: any[];
  [key: string]: any;
}

interface Team {
  id: number;
  name: string;
  abbrev: string;
  logoUrl?: string;
  [key: string]: any;
}

interface Player {
  internalId: string;
  name: string;
  tid: number;
  [key: string]: any;
}

interface Props {
  allSimResults: GameResult[];
  teams: Team[];
  players: Player[];
  actionType?: string;
  actionPayload?: any;
}

const GAME_DELAY = 600;
const PERFORMER_DELAY = 400;

function getTeam(teams: Team[], id: number) {
  return teams.find(t => t.id === id);
}

function buildStatLine(stats: any): string {
  const parts: string[] = [];
  if (stats.pts != null) parts.push(`${stats.pts} PTS`);
  if (stats.ast != null && stats.ast >= 5) parts.push(`${stats.ast} AST`);
  if (stats.reb != null && stats.reb >= 5) parts.push(`${stats.reb} REB`);
  if (stats.blk != null && stats.blk >= 2) parts.push(`${stats.blk} BLK`);
  if (stats.stl != null && stats.stl >= 2) parts.push(`${stats.stl} STL`);
  return parts.join(' • ');
}

interface TopPerformer {
  name: string;
  teamAbbrev: string;
  statLine: string;
  gameScore: number;
}

function getTopPerformers(allSimResults: GameResult[], players: Player[], teams: Team[]): TopPerformer[] {
  const seen = new Set<string>();
  const performers: TopPerformer[] = [];

  for (const result of allSimResults) {
    const allStats = [...(result.homeStats || []), ...(result.awayStats || [])];
    for (const s of allStats) {
      const gs = s.gameScore ?? (s.pts + (s.reb ?? 0) * 0.5 + (s.ast ?? 0) * 0.7);
      if (gs < 20) continue;
      const name = s.name || s.playerName;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const player = players.find(p => p.name === name || p.internalId === s.playerId);
      const team = player ? getTeam(teams, player.tid) : undefined;
      performers.push({
        name,
        teamAbbrev: team?.abbrev || s.teamAbbrev || '',
        statLine: buildStatLine({ pts: s.pts, ast: s.ast, reb: s.reb, blk: s.blk, stl: s.stl }),
        gameScore: gs,
      });
    }
  }

  return performers.sort((a, b) => b.gameScore - a.gameScore).slice(0, 6);
}

export const SimulationTicker: React.FC<Props> = ({ allSimResults, teams, players, actionType, actionPayload }) => {
  const hasGames = allSimResults && allSimResults.length > 0;
  const topPerformers = hasGames ? getTopPerformers(allSimResults, players, teams) : [];

  const [shownGames, setShownGames] = useState<number>(0);
  const [shownPerformers, setShownPerformers] = useState<number>(0);
  const [showingPerformers, setShowingPerformers] = useState(false);
  const [showFinal, setShowFinal] = useState(false);

  useEffect(() => {
    if (!hasGames) {
      const t = setTimeout(() => setShowFinal(true), 1200);
      return () => clearTimeout(t);
    }

    let cancelled = false;
    const totalGames = allSimResults.length;

    const showNextGame = (idx: number) => {
      if (cancelled) return;
      if (idx > totalGames) {
        // Start performers phase
        setShowingPerformers(true);
        showNextPerformer(0);
        return;
      }
      setShownGames(idx);
      setTimeout(() => showNextGame(idx + 1), GAME_DELAY);
    };

    const showNextPerformer = (idx: number) => {
      if (cancelled) return;
      if (idx > topPerformers.length) {
        setShowFinal(true);
        return;
      }
      setShownPerformers(idx);
      setTimeout(() => showNextPerformer(idx + 1), PERFORMER_DELAY);
    };

    setTimeout(() => showNextGame(1), GAME_DELAY);
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto px-2">

      {/* ── No games: action day ── */}
      {!hasGames && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-3 text-center"
        >
          <div className="text-4xl">⚡</div>
          <p className="text-white font-bold text-lg tracking-tight">Processing Commissioner Action</p>
          {actionPayload?.targetName && (
            <p className="text-indigo-400 text-sm font-medium">Target: {actionPayload.targetName}</p>
          )}
          {actionType && (
            <p className="text-slate-500 text-xs uppercase tracking-widest">{actionType.replace(/_/g, ' ')}</p>
          )}
          <div className="flex gap-1.5 mt-1">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-indigo-500 rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Games list ── */}
      {hasGames && (
        <div className="w-full flex flex-col gap-2">
          <p className="text-slate-500 text-xs uppercase tracking-widest text-center mb-1">
            Game Results
          </p>
          <AnimatePresence initial={false}>
            {allSimResults.slice(0, shownGames).map((result, idx) => {
              const home = getTeam(teams, result.homeTeamId);
              const away = getTeam(teams, result.awayTeamId);
              const homeWon = result.homeScore > result.awayScore;
              return (
                <motion.div
                  key={idx}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  className="flex items-center justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 gap-3"
                >
                  {/* Away */}
                  <div className={`flex flex-col items-start min-w-0 flex-1 ${homeWon ? 'opacity-50' : ''}`}>
                    <span className="text-white font-bold text-sm truncate">{away?.abbrev || 'AWY'}</span>
                    <span className="text-slate-400 text-xs truncate hidden sm:block">{away?.name}</span>
                  </div>
                  {/* Scores */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xl font-black tabular-nums ${!homeWon ? 'text-indigo-400 drop-shadow-[0_0_6px_rgba(99,102,241,0.7)]' : 'text-slate-300'}`}>
                      {result.awayScore}
                    </span>
                    <span className="text-slate-600 text-sm font-medium">–</span>
                    <span className={`text-xl font-black tabular-nums ${homeWon ? 'text-indigo-400 drop-shadow-[0_0_6px_rgba(99,102,241,0.7)]' : 'text-slate-300'}`}>
                      {result.homeScore}
                    </span>
                  </div>
                  {/* Home */}
                  <div className={`flex flex-col items-end min-w-0 flex-1 ${!homeWon ? 'opacity-50' : ''}`}>
                    <span className="text-white font-bold text-sm truncate">{home?.abbrev || 'HME'}</span>
                    <span className="text-slate-400 text-xs truncate hidden sm:block">{home?.name}</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ── Top performers ── */}
      {showingPerformers && topPerformers.length > 0 && (
        <div className="w-full flex flex-col gap-2 mt-1">
          <p className="text-slate-500 text-xs uppercase tracking-widest text-center mb-1">
            Top Performers
          </p>
          <AnimatePresence initial={false}>
            {topPerformers.slice(0, shownPerformers).map((p, idx) => (
              <motion.div
                key={idx}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                className="flex items-center justify-between bg-slate-800/40 border border-slate-700/40 rounded-xl px-4 py-2 gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-indigo-400 font-black text-sm shrink-0">{idx + 1}.</span>
                  <div className="min-w-0">
                    <span className="text-white font-semibold text-sm truncate block">{p.name}</span>
                    <span className="text-slate-500 text-xs">{p.teamAbbrev}</span>
                  </div>
                </div>
                <span className="text-indigo-300 text-xs font-mono font-medium shrink-0">{p.statLine}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Final "generating" state ── */}
      <AnimatePresence>
        {showFinal && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-2 mt-2"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="text-2xl select-none"
            >
              🏀
            </motion.div>
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.8, repeat: Infinity }}
              className="text-slate-400 text-sm font-medium"
            >
              Generating league reactions...
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
