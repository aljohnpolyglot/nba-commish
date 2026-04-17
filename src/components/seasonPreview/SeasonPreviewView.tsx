import React, { useMemo, useState } from 'react';
import { Trophy, Star, ChevronLeft, ChevronRight, Shield, Zap, Award, BarChart2 } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { calculateTeamStrength } from '../../utils/playerRatings';
import { motion, AnimatePresence } from 'motion/react';
import type { SeasonHistoryEntry, Tab } from '../../types';

interface SeasonPreviewViewProps {
  onViewChange: (view: Tab) => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function getTier(strength: number, rank: number): { label: string; color: string; bg: string; bar: string } {
  // Use rank-based tiers (more reliable than absolute OVR thresholds which inflate)
  if (rank <= 4)  return { label: 'Title',     color: 'text-amber-400',   bg: 'bg-amber-400/15',   bar: 'bg-amber-400' };
  if (rank <= 10) return { label: 'Contender', color: 'text-emerald-400', bg: 'bg-emerald-500/15', bar: 'bg-emerald-500' };
  if (rank <= 20) return { label: 'Bubble',    color: 'text-blue-400',    bg: 'bg-blue-500/15',    bar: 'bg-blue-500' };
  return                  { label: 'Lottery',   color: 'text-slate-500',   bg: 'bg-white/5',        bar: 'bg-slate-600' };
}

/** Convert implied probability → American moneyline odds string (+240, -140, etc.) */
function toAmericanOdds(prob: number): string {
  if (prob <= 0) return '+99999';
  if (prob >= 1) return '-99999';
  if (prob >= 0.5) {
    return `-${Math.round((prob / (1 - prob)) * 100)}`;
  }
  const raw = Math.round(((1 - prob) / prob) * 100);
  // Round to nearest 50 for realism above +500
  const rounded = raw >= 500 ? Math.round(raw / 50) * 50 : raw;
  return `+${rounded}`;
}

/** Build championship odds for all teams. Returns map teamId → odds string. */
function buildChampOdds(rankings: { team: { id: number }; combinedScore: number }[]): Map<number, string> {
  // Weight by (score-50)^2.5 — spreads odds so contenders land in +1000–+2000 range
  const weights = rankings.map(r => Math.pow(Math.max(1, r.combinedScore - 50), 2.5));
  const total = weights.reduce((a, b) => a + b, 0);
  const map = new Map<number, string>();
  rankings.forEach((r, i) => {
    const prob = total > 0 ? weights[i] / total : 1 / rankings.length;
    map.set(r.team.id, toAmericanOdds(prob));
  });
  return map;
}

/** Projected O/U wins based on strength */
function projectedOU(strength: number): number {
  return Math.round(15 + ((strength - 50) / 49) * 57);
}

// ── sub-components ────────────────────────────────────────────────────────────

const AwardBadge: React.FC<{ label: string; name: string | undefined; icon: React.ReactNode; color: string }> = ({ label, name, icon, color }) => {
  if (!name) return null;
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${color}`}>
        {icon}
        {label}
      </div>
      <div className="text-sm font-bold text-white truncate">{name}</div>
    </div>
  );
};

// ── main component ────────────────────────────────────────────────────────────

export const SeasonPreviewView: React.FC<SeasonPreviewViewProps> = ({ onViewChange: _onViewChange }) => {
  const { state } = useGame();
  const { leagueStats, teams, players, seasonHistory, history, retirementAnnouncements } = state;
  const currentYear = leagueStats.year;

  // Build year list: all history years + current year, sorted desc
  const availableYears = useMemo(() => {
    const yrs = new Set<number>([currentYear]);
    (seasonHistory ?? []).forEach(e => yrs.add(e.year));
    return Array.from(yrs).sort((a, b) => b - a);
  }, [seasonHistory, currentYear]);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const yearIdx = availableYears.indexOf(selectedYear);
  const canGoPrev = yearIdx < availableYears.length - 1; // older
  const canGoNext = yearIdx > 0;                          // newer

  // ── Power Rankings — 50% K2 OVR + 50% K2 POT ─────────────────────────────
  const powerRankings = useMemo(() => {
    return (teams ?? [])
      .filter(t => t.id >= 0 && t.id < 100)
      .map(t => {
        // calculateTeamStrength returns K2-scale OVR for the team
        const strength = calculateTeamStrength(t.id, players ?? []);

        // Compute avg K2 POT across the active roster
        const roster = (players ?? []).filter(p => p.tid === t.id);
        const avgPot = roster.length > 0
          ? roster.reduce((sum, p) => {
              const lr = (p as any).ratings?.[(p as any).ratings?.length - 1];
              const bbgmPot = lr?.pot ?? (p.overallRating ?? 60);
              const hgt = lr?.hgt ?? 50;
              return sum + Math.min(99, Math.round(0.88 * bbgmPot + 31));
            }, 0) / roster.length
          : strength;

        // Combined score: 50% current OVR + 50% potential
        const combinedScore = Math.round(strength * 0.5 + avgPot * 0.5);
        const gp = t.wins + t.losses;
        const winPct = gp > 0 ? t.wins / gp : 0;
        return { team: t, strength, combinedScore, gp, winPct };
      })
      // Sort by championship probability (combined score) globally,
      // then within conference by wins if season started
      .sort((a, b) => b.combinedScore - a.combinedScore);
  }, [teams, players]);

  // ── Season history entry for selected year ─────────────────────────────────
  const historyEntry: SeasonHistoryEntry | undefined = useMemo(
    () => (seasonHistory ?? []).find(e => e.year === selectedYear),
    [seasonHistory, selectedYear]
  );

  // ── Offseason moves for selected past year (Jun–Sep of that year) ──────────
  const offseasonMoves = useMemo(() => {
    if (selectedYear === currentYear) return [];
    const from = `${selectedYear - 1}-06-01`;
    const to   = `${selectedYear - 1}-10-01`;
    return (history ?? [])
      .filter((h: any) => h.date && h.date >= from && h.date < to &&
        (h.type === 'Signing' || h.type === 'Trade' || h.type === 'Waive'))
      .slice(0, 10);
  }, [history, selectedYear, currentYear]);

  // ── Retirements (only available for current-year rollover data) ────────────
  const retirees = selectedYear === currentYear ? (retirementAnnouncements ?? []) : [];
  const legendRetirees = retirees.filter(r => r.isLegend);
  const otherRetirees  = retirees.filter(r => !r.isLegend && r.allStarAppearances > 0);

  const isCurrentSeason = selectedYear === currentYear;
  const isPastSeason    = !isCurrentSeason && !!historyEntry;

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="p-4 sm:p-6 bg-slate-900/50 border-b border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
              <Trophy className="text-amber-500 shrink-0" size={28} />
              Season Chronicle
            </h2>
            <p className="text-slate-400 text-sm mt-1">Power rankings, standings, and season history</p>
          </div>

          {/* Year chevron — always visible */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 self-start sm:self-auto shrink-0">
            <button
              onClick={() => canGoPrev && setSelectedYear(availableYears[yearIdx + 1])}
              disabled={!canGoPrev}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-25 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-3 text-center min-w-[68px]">
              <div className="text-lg font-black text-white leading-none">{selectedYear}</div>
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none mt-0.5">
                {isCurrentSeason ? 'Current' : 'Season'}
              </div>
            </div>
            <button
              onClick={() => canGoNext && setSelectedYear(availableYears[yearIdx - 1])}
              disabled={!canGoNext}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-25 transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedYear}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6 pb-12"
          >

            {/* ── Past Season: Champion Card ─────────────────────────────── */}
            {isPastSeason && historyEntry && (
              <div className="bg-gradient-to-br from-amber-950/60 via-slate-900 to-slate-950 border border-amber-500/25 rounded-2xl p-6">
                <div className="text-[9px] font-black text-amber-500/70 uppercase tracking-[4px] mb-3">
                  {selectedYear} NBA Champion
                </div>
                <div className="flex items-start justify-between flex-wrap gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                        <Trophy className="text-amber-400" size={18} />
                      </div>
                      <div className="text-3xl font-black text-white">{historyEntry.champion}</div>
                    </div>
                    {historyEntry.runnerUp && (
                      <div className="text-xs text-slate-500 mt-1 pl-13">
                        Runner-up: <span className="text-slate-400 font-bold">{historyEntry.runnerUp}</span>
                      </div>
                    )}
                  </div>

                  {/* Awards row */}
                  <div className="flex flex-wrap gap-6">
                    <AwardBadge
                      label="MVP"
                      name={historyEntry.mvp}
                      icon={<Star size={9} fill="currentColor" />}
                      color="text-yellow-400"
                    />
                    <AwardBadge
                      label="Finals MVP"
                      name={historyEntry.finalsMvp}
                      icon={<Trophy size={9} />}
                      color="text-amber-400"
                    />
                    <AwardBadge
                      label="ROY"
                      name={historyEntry.roty}
                      icon={<Zap size={9} />}
                      color="text-emerald-400"
                    />
                    <AwardBadge
                      label="DPOY"
                      name={historyEntry.dpoy}
                      icon={<Shield size={9} />}
                      color="text-blue-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── No history for past year ───────────────────────────────── */}
            {!isCurrentSeason && !historyEntry && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                <Award size={40} className="mb-4" />
                <p className="text-base font-bold">No data for {selectedYear}</p>
                <p className="text-sm mt-1">Season history is recorded at the end of the playoffs.</p>
              </div>
            )}

            {/* ── Power Rankings (current year) ─────────────────────────── */}
            {isCurrentSeason && (
              <section>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">
                  Power Rankings
                </div>

                {/* Column headers */}
                <div className="flex items-center gap-3 px-4 py-1 mb-1 text-[9px] font-black uppercase tracking-widest text-slate-600">
                  <span className="w-5 shrink-0" />
                  <span className="w-7 shrink-0" />
                  <span className="flex-1">Team</span>
                  <span className="w-14 shrink-0 text-right">O/U</span>
                  <span className="hidden md:block w-20 shrink-0 text-right">Title Odds</span>
                  <span className="hidden md:block w-16 shrink-0 text-right pr-1">Tier</span>
                </div>

                {(() => {
                  const champOdds = buildChampOdds(powerRankings);
                  return (
                    <div className="space-y-1.5">
                      {powerRankings.map((item, rank) => {
                        const { team, combinedScore } = item;
                        const tier = getTier(combinedScore, rank + 1);
                        const logo = (team as any).logoUrl || (team as any).imgURL;
                        const ou = projectedOU(combinedScore);
                        const odds = champOdds.get(team.id) ?? '+99999';
                        const oddsColor = odds.startsWith('-') ? 'text-amber-400' : tier.label === 'Title' ? 'text-amber-300' : tier.label === 'Playoff' ? 'text-emerald-400' : 'text-slate-500';

                        return (
                          <motion.div
                            key={team.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: rank * 0.025 }}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors"
                          >
                            {/* Rank */}
                            <span className="text-[11px] font-black text-slate-600 w-5 text-right shrink-0">
                              {rank + 1}
                            </span>

                            {/* Logo */}
                            {logo ? (
                              <img
                                src={logo}
                                className="w-7 h-7 object-contain shrink-0"
                                alt=""
                                onError={e => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-slate-800 shrink-0" />
                            )}

                            {/* Name */}
                            <span className="text-sm font-bold text-white flex-1 truncate min-w-0">
                              {team.name}
                            </span>

                            {/* Projected O/U */}
                            <div className="text-right shrink-0 w-14">
                              <span className="text-xs text-slate-500 font-bold tabular-nums">{ou}.5</span>
                            </div>

                            {/* Championship odds */}
                            <span className={`hidden md:block text-xs font-black tabular-nums w-20 text-right shrink-0 ${oddsColor}`}>
                              {odds}
                            </span>

                            {/* Tier badge */}
                            <span className={`hidden md:inline text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 w-16 text-center ${tier.bg} ${tier.color}`}>
                              {tier.label}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>
            )}

            {/* ── Offseason Moves (past season) ─────────────────────────── */}
            {isPastSeason && offseasonMoves.length > 0 && (
              <section>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                  {selectedYear - 1} Offseason Moves
                </div>
                <div className="space-y-1.5">
                  {offseasonMoves.map((move: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                      <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                        move.type === 'Trade'   ? 'bg-blue-500/15 text-blue-400'     :
                        move.type === 'Signing' ? 'bg-emerald-500/15 text-emerald-400' :
                        'bg-amber-500/15 text-amber-400'
                      }`}>
                        {move.type}
                      </span>
                      <span className="text-xs text-slate-300 truncate">{move.text}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Retirements (current season only, from rollover data) ──── */}
            {isCurrentSeason && legendRetirees.length > 0 && (
              <section>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                  Legend Retirements
                </div>
                <div className="space-y-3">
                  {legendRetirees.map(r => (
                    <div key={r.playerId} className="bg-gradient-to-r from-amber-950/40 to-slate-900 border border-amber-500/20 rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest bg-amber-400/10 px-2 py-0.5 rounded-full">
                              Legend
                            </span>
                            {r.allStarAppearances > 0 && (
                              <span className="text-[9px] font-bold text-amber-300/70 flex items-center gap-1">
                                <Star size={9} fill="currentColor" /> {r.allStarAppearances}× All-Star
                              </span>
                            )}
                            {r.championships > 0 && (
                              <span className="text-[9px] font-bold text-amber-300/70 flex items-center gap-1">
                                <Trophy size={9} /> {r.championships}× Champ
                              </span>
                            )}
                          </div>
                          <div className="text-xl font-black text-white">{r.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">Retired at age {r.age}</div>
                        </div>
                        {r.careerGP > 0 && (
                          <div className="text-right shrink-0 text-[10px] font-bold text-slate-400 space-y-0.5">
                            <div>{(r.careerPts / r.careerGP).toFixed(1)} PPG</div>
                            <div>{(r.careerReb / r.careerGP).toFixed(1)} RPG · {(r.careerAst / r.careerGP).toFixed(1)} APG</div>
                            <div className="text-slate-600">{r.careerGP} career games</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {isCurrentSeason && otherRetirees.length > 0 && (
              <section>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                  Retirements
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {otherRetirees.map(r => (
                    <div key={r.playerId} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                      <div className="text-sm font-bold text-white">{r.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Age {r.age} · {r.allStarAppearances}× AS
                        {r.championships > 0 ? ` · ${r.championships}× Champ` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Past season: quick summary of all history years ───────── */}
            {isPastSeason && (
              <section>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                  All-Time Champions
                </div>
                <div className="space-y-1.5">
                  {[...(seasonHistory ?? [])].sort((a, b) => b.year - a.year).map(entry => (
                    <div
                      key={entry.year}
                      onClick={() => setSelectedYear(entry.year)}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                        entry.year === selectedYear
                          ? 'bg-amber-500/10 border-amber-500/30'
                          : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className={`text-xs font-black w-10 shrink-0 ${entry.year === selectedYear ? 'text-amber-400' : 'text-slate-500'}`}>
                        {entry.year}
                      </span>
                      <Trophy size={12} className={entry.year === selectedYear ? 'text-amber-400' : 'text-slate-700'} />
                      <span className={`text-sm font-bold flex-1 truncate ${entry.year === selectedYear ? 'text-white' : 'text-slate-300'}`}>
                        {entry.champion}
                      </span>
                      {entry.mvp && (
                        <span className="text-[10px] text-slate-600 truncate hidden sm:block">MVP: {entry.mvp}</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
