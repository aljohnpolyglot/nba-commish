/**
 * DraftLotteryView.tsx
 * 1:1 recreation of draftcombinedui.tsx connected to game state.
 * Lottery: real team records, NBA 2019 odds. Draft: game state prospects.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Info,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { normalizeDate } from '../../utils/helpers';

// ─── Fanspo CSS (injected once) ──────────────────────────────────────────────
const FANSPO_CSS = `
.fanspo-ball-container {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 20px 0;
}
.fanspo-ball {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #ffffff, #e0e0e0);
  box-shadow:
    inset -5px -5px 10px rgba(0,0,0,0.1),
    inset 2px 2px 5px rgba(255,255,255,0.8),
    0 4px 6px rgba(0,0,0,0.3);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f15a22;
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}
.fanspo-ball::after {
  content: '';
  position: absolute;
  top: 2%;
  left: 10%;
  width: 80%;
  height: 40%;
  background: linear-gradient(to bottom, rgba(255,255,255,0.8), rgba(255,255,255,0));
  border-radius: 50% 50% 0 0;
  pointer-events: none;
}
.fanspo-ball.revealed {
  box-shadow:
    inset -5px -5px 10px rgba(0,0,0,0.1),
    inset 2px 2px 5px rgba(255,255,255,0.8),
    0 0 15px rgba(241, 90, 34, 0.6);
}
.fanspo-ball.past { opacity: 0.8; }
.fanspo-ball .ball-number-large {
  font-size: 28px;
  font-weight: 800;
  z-index: 2;
}
.fanspo-ball .ball-number-small {
  position: absolute;
  bottom: 4px;
  right: 8px;
  font-size: 14px;
  font-weight: 800;
  text-shadow: 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff;
  z-index: 2;
}
.fanspo-ball img {
  width: 70%;
  height: 70%;
  object-fit: contain;
  z-index: 1;
}
.tss-1cq2wla-root {
  background-color: #030303;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.mui-we3dsy {
  background-color: #1A1A1A;
  color: #fff;
  box-shadow: none;
  margin-bottom: 8px;
}
.tss-u92z5m-headerTitle {
  font-family: 'Poppins', sans-serif;
  font-weight: bold;
}
.tss-81m6u9-headerDivider {
  margin-top: 16px;
  background-color: #0c2340;
  height: 2px;
  border: none;
}
.tss-p9ljn4-table {
  display: table;
  width: 100%;
  border-collapse: collapse;
}
.tss-p9ljn4-table thead tr th {
  color: #f15a22;
  font-weight: bold;
  text-align: center;
  padding: 6px 16px;
  border-bottom: 1px solid rgba(81,81,81,1);
  font-size: 0.875rem;
  text-transform: uppercase;
}
.tss-p9ljn4-table tbody tr td,
.tss-p9ljn4-table tbody tr th {
  padding: 6px 16px;
  border-bottom: 1px solid rgba(81,81,81,1);
  font-size: 0.875rem;
  color: #fff;
}
.mui-1auy16m {
  width: 100%;
  overflow-x: auto;
  background-color: #1A1A1A;
  border-radius: 6px;
}
.tss-uqamws-teamLogo {
  filter: drop-shadow(1px 1px 0 #CCC);
  width: 36px;
  height: 36px;
}
.tss-dlwf6o-teamName {
  margin-left: 12px;
  text-align: left;
}
`;

if (typeof document !== 'undefined' && !document.getElementById('fanspo-draft-css')) {
  const s = document.createElement('style');
  s.id = 'fanspo-draft-css';
  s.textContent = FANSPO_CSS;
  document.head.appendChild(s);
}

// ─── Lottery presets (mirrors League Settings draftType options) ───────────────
const LOTTERY_PRESETS: Record<string, { chances: number[]; numToPick: number; total: number; label: string }> = {
  nba2019:  { chances: [140,140,140,125,105,90,75,60,45,30,20,15,10,5],                                    numToPick: 4, total: 1000, label: 'NBA 2019-present' },
  nba1994:  { chances: [250,199,156,119,88,63,43,28,17,11,8,7,6,5],                                        numToPick: 3, total: 1000, label: 'NBA 1994-2018' },
  nba1990:  { chances: [11,10,9,8,7,6,5,4,3,2,1],                                                          numToPick: 3, total: 66,   label: 'NBA 1990-1993' },
  nba1987:  { chances: [1,1,1,1,1,1,1],                                                                     numToPick: 3, total: 7,    label: 'NBA 1987-1989' },
  nba1985:  { chances: [1,1,1,1,1,1,1],                                                                     numToPick: 7, total: 7,    label: 'NBA 1985-1986' },
  nba1966:  { chances: [1,1,0,0,0,0,0],                                                                     numToPick: 2, total: 2,    label: 'NBA 1966-1984' },
  nhl2021:  { chances: [185,135,115,95,85,75,65,60,50,35,30,25,20,15,5,5],                                 numToPick: 2, total: 1000, label: 'NHL 2021-present' },
  nhl2017:  { chances: [185,135,115,95,85,75,65,60,50,35,30,25,20,15,10],                                  numToPick: 3, total: 1000, label: 'NHL 2017-2020' },
  mlb2022:  { chances: [1650,1650,1650,1325,1000,750,550,390,270,180,140,110,90,76,62,48,36,23],           numToPick: 6, total: 10000,label: 'MLB 2022-present' },
};
const DEFAULT_PRESET = LOTTERY_PRESETS['nba2019'];

// ─── Lottery runner (mirrors /lib/lottery.ts) ─────────────────────────────────
interface LotteryTeam {
  id: string;
  name: string;
  city: string;
  logoUrl: string;
  record: string;
  winPct: string;
  odds1st: number;
  oddsTop4: number;
  color: string;
  originalSeed: number;
  tid: number;
}
interface LotteryResult { pick: number; team: LotteryTeam; change: number; }

function runLottery(teams: LotteryTeam[], chances: number[], numToPick: number): LotteryResult[] {
  const results: LotteryResult[] = [];
  const drawnIds = new Set<string>();

  const drawTeam = () => {
    const avail = teams.filter(t => !drawnIds.has(t.id));
    const totalW = avail.reduce((s, t) => s + (chances[t.originalSeed - 1] || 0), 0);
    if (!totalW) return avail[0];
    let rnd = Math.random() * totalW;
    for (const t of avail) {
      rnd -= chances[t.originalSeed - 1] || 0;
      if (rnd <= 0) return t;
    }
    return avail[0];
  };

  const actual = Math.min(numToPick, teams.length);
  for (let i = 1; i <= actual; i++) {
    const w = drawTeam();
    drawnIds.add(w.id);
    results.push({ pick: i, team: w, change: w.originalSeed - i });
  }

  teams
    .filter(t => !drawnIds.has(t.id))
    .sort((a, b) => a.originalSeed - b.originalSeed)
    .forEach((t, idx) => {
      const pick = idx + actual + 1;
      results.push({ pick, team: t, change: t.originalSeed - pick });
    });

  return results;
}

// ─── Lottery Ball component ───────────────────────────────────────────────────
interface BallProps {
  number: number;
  state: 'unrevealed' | 'revealed' | 'past';
  team?: LotteryTeam;
}
const LotteryBall = ({ number, state: bs, team }: BallProps) => (
  <div className={`fanspo-ball ${bs === 'unrevealed' ? '' : bs}`}>
    {bs === 'unrevealed' || !team ? (
      <span className="ball-number-large">{number}</span>
    ) : (
      <>
        {team.logoUrl
          ? <img src={team.logoUrl} alt={team.name} referrerPolicy="no-referrer" />
          : <span style={{ fontSize: 14, fontWeight: 900, zIndex: 2 }}>{team.id}</span>}
        <span className="ball-number-small">{number}</span>
      </>
    )}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const DraftLotteryView = () => {
  const { state, dispatchAction } = useGame();
  const season = state.leagueStats?.year ?? new Date(state.date).getFullYear();
  const activePreset = LOTTERY_PRESETS[state.leagueStats?.draftType ?? 'nba2019'] ?? DEFAULT_PRESET;

  // ─── Date gating ──────────────────────────────────────────────────────────
  const today = state.date ? normalizeDate(state.date) : '';
  const lotteryDate = `${season}-05-14`;
  const isLotteryTime = today >= lotteryDate;

  // Draft Board is now a separate nav view — no appMode toggle needed here
  const [speed, setSpeed] = useState('normal');
  const [showHistory, setShowHistory] = useState(false);

  // Lazy initializers: restore from game state if lottery was already run this season
  const savedResults = (state as any).draftLotteryResult as LotteryResult[] | undefined;
  const hasSaved = savedResults && savedResults.length > 0;
  const [results, setResults] = useState<LotteryResult[]>(() => hasSaved ? savedResults! : []);
  const [history, setHistory] = useState<LotteryResult[][]>(() => hasSaved ? [savedResults!] : []);
  const [isSimulating, setIsSimulating] = useState(false);
  // 0 = fully revealed (restored), numTeams+1 = idle (no results yet)
  const [revealIndex, setRevealIndex] = useState<number>(() => hasSaved ? 0 : 15);

  // Build lottery teams from worst 14 in state
  const activeTeams: LotteryTeam[] = useMemo(() => {
    const sorted = [...state.teams]
      .filter(t => t.id > 0)
      .sort((a, b) => {
        const wa = a.wins / Math.max(1, a.wins + a.losses);
        const wb = b.wins / Math.max(1, b.wins + b.losses);
        return wa - wb;
      })
      .slice(0, 14);

    return sorted.map((t, i) => {
      const chance = activePreset.chances[i] ?? 0;
      const odds1st = parseFloat(((chance / activePreset.total) * 100).toFixed(1));
      const oddsTop4 = parseFloat((odds1st * activePreset.numToPick).toFixed(1));
      const gp = t.wins + t.losses;
      const winPct = gp > 0 ? (t.wins / gp).toFixed(3) : '.000';
      return {
        id: String(t.id),
        tid: t.id,
        name: t.name,
        city: t.region ?? t.name,
        logoUrl: t.logoUrl ?? '',
        record: `${t.wins}-${t.losses}`,
        winPct,
        odds1st,
        oddsTop4,
        color: t.colors?.[0] ?? '#333333',
        originalSeed: i + 1,
      };
    });
  }, [state.teams]);

  const numTeams = activeTeams.length;

  // Only reset to idle if there are no results — don't clobber restored saved state
  useEffect(() => { if (results.length === 0) setRevealIndex(numTeams + 1); }, [numTeams]);

  const getBallState = (n: number): 'unrevealed' | 'revealed' | 'past' => {
    if (revealIndex > numTeams) return 'unrevealed';
    if (revealIndex === 0) return 'revealed';
    if (n === revealIndex) return 'revealed';
    if (n > revealIndex) return 'past';
    return 'unrevealed';
  };

  const getBallTeam = (n: number): LotteryTeam | undefined => {
    if (revealIndex > numTeams) return undefined;
    if (n > revealIndex || revealIndex === 0) return results.find(r => r.pick === n)?.team;
    return undefined;
  };

  const startSimulation = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);
    const newResults = runLottery(activeTeams, activePreset.chances, activePreset.numToPick);
    setResults(newResults);

    const speedMs: Record<string, number> = { fastest: 100, normal: 300, slow: 500, slower: 1000, dramatic: 3000 };
    const interval = speedMs[speed] ?? 300;

    let current = numTeams;
    setRevealIndex(current);

    const timer = setInterval(() => {
      current--;
      if (current < 1) {
        clearInterval(timer);
        setIsSimulating(false);
        setHistory(prev => [newResults, ...prev].slice(0, 10));
        setRevealIndex(0);
        // Save to game state
        dispatchAction({ type: 'UPDATE_STATE' as any, payload: { draftLotteryResult: newResults } });
      } else {
        setRevealIndex(current);
      }
    }, interval);
  }, [isSimulating, speed, activeTeams, numTeams, dispatchAction]);

  const reset = () => {
    setResults([]);
    setRevealIndex(numTeams + 1);
    setIsSimulating(false);
  };

  // Table rows
  const currentTable = useMemo(() => {
    if (revealIndex > numTeams) {
      return activeTeams.map((t, i) => ({ currentPick: i + 1, team: t, isRevealed: false, change: 0 }));
    }
    const revealedPicks = revealIndex === 0 ? results : results.filter(r => r.pick > revealIndex);
    const revealedIds = new Set(revealedPicks.map(r => r.team.id));
    const unrevealed = activeTeams.filter(t => !revealedIds.has(t.id));
    return [
      ...unrevealed.map((t, i) => ({ currentPick: i + 1, team: t, isRevealed: false, change: 0 })),
      ...revealedPicks.sort((a, b) => a.pick - b.pick).map(r => ({ currentPick: r.pick, team: r.team, isRevealed: true, change: r.change })),
    ];
  }, [revealIndex, results, activeTeams, numTeams]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="tss-1cq2wla-root">

        {/* TITLE SECTION */}
        <div className="mui-we3dsy">
          <div className="px-4">
            <div className="flex justify-between items-center py-4">
              <div>
                <h4 className="tss-u92z5m-headerTitle text-2xl md:text-3xl">
                  {season} NBA Draft Lottery
                </h4>
              </div>
            </div>
          </div>
        </div>

        <hr className="tss-81m6u9-headerDivider" />

        {/* TOOLBAR (lottery only) */}
        {true && (
          <div className="bg-[#141415] border-b border-[#1A1A1A]">
            <div className="px-4">
              <div className="flex items-center justify-between py-2 flex-wrap gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Speed selector */}
                  <select
                    value={speed}
                    onChange={e => setSpeed(e.target.value)}
                    className="h-9 bg-transparent border border-[#333] text-xs font-bold text-white px-3 rounded-md outline-none cursor-pointer"
                  >
                    <option value="fastest" className="bg-[#1A1A1A]">Fastest</option>
                    <option value="normal" className="bg-[#1A1A1A]">Normal speed</option>
                    <option value="slow" className="bg-[#1A1A1A]">Slow</option>
                    <option value="slower" className="bg-[#1A1A1A]">Slower</option>
                    <option value="dramatic" className="bg-[#1A1A1A]">Dramatic</option>
                  </select>
                  {/* Preset comes from League Settings → Draft Type */}
                  <div className="h-9 bg-transparent border border-[#333] text-xs font-bold text-white/40 px-3 rounded-md flex items-center">
                    {activePreset.label}
                  </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <span className="text-xs font-bold text-white/60 uppercase">
                    Show History {history.length > 0 && `(${history.length})`}
                  </span>
                  <div
                    onClick={() => history.length > 0 && setShowHistory(v => !v)}
                    className={`relative w-8 h-[18px] rounded-full border border-transparent transition-colors cursor-pointer ${
                      showHistory && history.length > 0 ? 'bg-[#f15a22]' : 'bg-zinc-700'
                    } ${history.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div className={`absolute top-0.5 size-3.5 bg-white rounded-full transition-transform ${showHistory && history.length > 0 ? 'translate-x-[calc(100%-2px)]' : 'translate-x-0'}`} />
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* MAIN CONTENT */}
        <main className="flex-1">
          <div className="container mx-auto px-4 py-6">
            {(
              <div className="flex flex-col max-w-4xl mx-auto gap-6">
                <div className="space-y-6">

                  {/* LOTTERY BALLS SECTION */}
                  <section className="bg-[#030303] py-8">
                    <div className="text-center mb-6">
                      <p className="text-[10px] text-white/40 uppercase tracking-widest">
                        {season} NBA Draft Lottery · NBA 2019 Rules · Top 4 picks drawn
                      </p>
                    </div>

                    <div className="fanspo-ball-container max-w-4xl mx-auto">
                      {Array.from({ length: numTeams }, (_, i) => {
                        const n = i + 1;
                        return (
                          <LotteryBall key={n} number={n} state={getBallState(n)} team={getBallTeam(n)} />
                        );
                      })}
                    </div>

                    <div className="flex flex-col items-center gap-3 mt-8">
                      {!isLotteryTime && revealIndex > numTeams && (
                        <p className="text-yellow-400/70 text-xs font-black uppercase tracking-widest">
                          Lottery draws on May 14, {season}
                        </p>
                      )}
                    <div className="flex justify-center gap-4">
                      {revealIndex > numTeams ? (
                        <button
                          onClick={startSimulation}
                          disabled={!isLotteryTime}
                          className={`text-white font-bold uppercase rounded-sm px-10 py-3 text-sm transition-colors ${
                            isLotteryTime
                              ? 'bg-[#f15a22] hover:bg-[#d44a1a]'
                              : 'bg-[#333] cursor-not-allowed opacity-50'
                          }`}
                        >
                          Sim Lottery
                        </button>
                      ) : revealIndex === 0 ? (
                        null
                      ) : (
                        <button disabled className="bg-[#333] text-white/40 font-bold uppercase rounded-sm px-10 py-3 text-sm cursor-not-allowed">
                          Simulating…
                        </button>
                      )}
                    </div>
                    </div>
                  </section>

                  {/* RESULTS TABLE SECTION */}
                  <article className="bg-[#1A1A1A] rounded-sm overflow-hidden">
                    <div className="p-4 flex items-center justify-between border-b border-white/5">
                      <h6 className="text-sm font-bold uppercase tracking-widest">Lottery</h6>
                    </div>

                    <div className="mui-1auy16m">
                      <table className="tss-p9ljn4-table">
                        <thead>
                          <tr>
                            <th className="text-left">PICK &nbsp;&nbsp;&nbsp;&nbsp; TEAM</th>
                            <th>RECORD</th>
                            <th>PCT</th>
                            <th>TOP 4</th>
                            <th>1ST</th>
                            <th className="text-right">ODDS</th>
                          </tr>
                        </thead>
                        <motion.tbody layout>
                          <AnimatePresence>
                            {currentTable.map(row => {
                              const { currentPick, team, isRevealed, change } = row;
                              return (
                                <motion.tr
                                  layout
                                  key={team.id}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.5 }}
                                  className={`transition-colors duration-500 ${currentPick === revealIndex + 1 && revealIndex < numTeams ? 'bg-white/5' : ''}`}
                                >
                                  <th>
                                    <div className="flex items-center gap-4">
                                      <span className="font-bold text-white/40 w-4">{currentPick}</span>
                                      {team.logoUrl ? (
                                        <img
                                          src={team.logoUrl}
                                          alt=""
                                          className="tss-uqamws-teamLogo"
                                          referrerPolicy="no-referrer"
                                        />
                                      ) : (
                                        <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-black text-white/40">
                                          {team.city?.slice(0, 3).toUpperCase()}
                                        </div>
                                      )}
                                      <div className="tss-dlwf6o-teamName">
                                        <p className="font-bold">
                                          {team.city}
                                          {isRevealed && change !== 0 && (
                                            <span className={`ml-3 ${change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                              {change > 0 ? `+${change}` : change}
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  </th>
                                  <td className="text-center font-mono text-white/60">{team.record}</td>
                                  <td className="text-center font-mono text-white/60">{team.winPct}</td>
                                  <td className="text-center font-mono text-white/60">{team.oddsTop4}%</td>
                                  <td className="text-center font-mono text-white/60">{team.odds1st}%</td>
                                  <td className="text-right">
                                    <button className="text-white/20 hover:text-white p-1">
                                      <Info size={16} />
                                    </button>
                                  </td>
                                </motion.tr>
                              );
                            })}
                          </AnimatePresence>
                        </motion.tbody>
                      </table>
                    </div>
                  </article>
                </div>

                {/* HISTORY */}
                <div className="space-y-6">
                  <AnimatePresence>
                    {showHistory && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-[10px] uppercase tracking-[0.2em] text-white/40">Recent Sims</h4>
                          <button onClick={() => setHistory([])} className="text-[10px] h-6 text-white/20 font-bold hover:text-white">CLEAR</button>
                        </div>
                        <div className="space-y-2">
                          {history.map((sim, i) => (
                            <div key={i} className="bg-[#1A1A1A] p-4 border-l-4 border-[#f15a22]">
                              <div className="flex justify-between items-center mb-3">
                                <span className="text-[10px] font-bold text-white/40 uppercase">Sim #{history.length - i}</span>
                                <span className="text-[10px] font-bold text-[#f15a22] uppercase tracking-wider">{sim[0].team.name} WINS</span>
                              </div>
                              <div className="flex gap-2">
                                {sim.slice(0, 4).map((r, j) => (
                                  <div key={j} className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center p-1.5 border border-white/5">
                                    {r.team.logoUrl
                                      ? <img src={r.team.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                      : <span className="text-[8px] font-black text-white/40">{r.team.id}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
