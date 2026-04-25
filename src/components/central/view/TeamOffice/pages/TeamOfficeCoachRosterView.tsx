import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { convertTo2KRating } from '../../../../../utils/helpers';
import { calculatePlayerOverallForYear, getDisplayPotential } from '../../../../../utils/playerRatings';
import { computeMoodScore } from '../../../../../utils/mood/moodScore';
import { usePlayerQuickActions } from '../../../../../hooks/usePlayerQuickActions';
import type { NBAPlayer } from '../../../../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSalary(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  return `$${(usd / 1_000).toFixed(0)}K`;
}

// Position sort order for "starter order" — lower = higher in table
const POS_RANK: Record<string, number> = {
  PG: 0, G: 0.5, SG: 1, GF: 1.5, SF: 2, F: 2.5, PF: 3, FC: 3.5, C: 4,
};
function posRank(pos: string | undefined): number {
  return POS_RANK[pos ?? ''] ?? 5;
}

function getK2WithDelta(p: NBAPlayer, currentYear: number): { k2: number; delta: number | null } {
  const currR = p.ratings?.[p.ratings.length - 1];
  const k2 = convertTo2KRating(p.overallRating, currR?.hgt ?? 50, currR?.tp ?? 50);
  if (!p.ratings || p.ratings.length < 2) return { k2, delta: null };
  const prevOvr = calculatePlayerOverallForYear(p as any, currentYear - 1);
  const prevR = p.ratings.find(r => r.season === currentYear - 1) ?? p.ratings[p.ratings.length - 2];
  const prevK2 = convertTo2KRating(prevOvr, prevR?.hgt ?? 50, prevR?.tp ?? 50);
  return { k2, delta: k2 - prevK2 };
}

function getLastSeasonStats(p: NBAPlayer) {
  const stats = ((p as any).stats ?? []) as any[];
  const last = stats.filter(s => !s.playoffs && (s.gp ?? 0) > 0).slice(-1)[0];
  if (!last) return null;
  const gp = last.gp;
  return {
    g: gp,
    mp: (last.min ?? 0) / gp,
    pts: (last.pts ?? 0) / gp,
    reb: ((last.orb ?? 0) + (last.drb ?? 0)) / gp || (last.trb ?? 0) / gp,
    ast: (last.ast ?? 0) / gp,
    per: last.per ?? 0,
  };
}

const fmt1 = (v: number) => (Number.isFinite(v) && v > 0 ? v.toFixed(1) : '—');

// ── Types ──────────────────────────────────────────────────────────────────────

type SortCol = 'name' | 'num' | 'pos' | 'age' | 'k2' | 'pot' | 'salary' | 'exp' | 'g' | 'mp' | 'pts' | 'reb' | 'ast' | 'per' | 'mood';

interface RowData {
  player: NBAPlayer;
  jerseyNum: string;
  k2: number;
  k2Delta: number | null;
  pot: number;
  age: number;
  currentSalaryUSD: number;
  yearsLeft: number;
  g: number;
  mp: number;
  pts: number;
  reb: number;
  ast: number;
  per: number;
  moodScore: number;
  isTwoWay: boolean;
  isNonGuaranteed: boolean;
  posRankVal: number;
  isStarter: boolean; // top OVR at their position group
}

interface Props {
  teamId: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TeamOfficeCoachRosterView({ teamId }: Props) {
  const { state } = useGame();
  const quick = usePlayerQuickActions();
  const currentYear = state.leagueStats?.year ?? 2026;

  const team = state.teams.find(t => t.id === teamId);
  const teamColor = team?.colors?.[0] ?? '#1a1a2e';

  const teamPlayers = useMemo(
    () => (state.players ?? []).filter(p => p.tid === teamId),
    [state.players, teamId],
  );

  const [starterOrder, setStarterOrder] = useState(true);
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'k2', dir: 'desc' });

  const handleSort = (col: SortCol) => {
    setStarterOrder(false);
    setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }));
  };

  const SortTh = ({ col, label, cls = 'text-right' }: { col: SortCol; label: string; cls?: string }) => (
    <th
      className={cn(cls, 'px-1.5 py-2 cursor-pointer hover:text-slate-300 whitespace-nowrap text-[9px] uppercase tracking-wider font-bold')}
      onClick={() => handleSort(col)}
    >
      {label}{!starterOrder && sort.col === col && <span className="ml-0.5 text-amber-400">{sort.dir === 'desc' ? '▼' : '▲'}</span>}
    </th>
  );

  const allRows = useMemo((): RowData[] => {
    const active = teamPlayers.filter(p => p.status === 'Active' && p.contract);

    // Identify starters: top K2 player per position group
    const byPosGroup = new Map<number, NBAPlayer>();
    active.forEach(p => {
      const rank = posRank(p.pos);
      const groupKey = Math.floor(rank);
      const currR = p.ratings?.[p.ratings.length - 1];
      const k2 = convertTo2KRating(p.overallRating, currR?.hgt ?? 50, currR?.tp ?? 50);
      const best = byPosGroup.get(groupKey);
      if (!best) {
        byPosGroup.set(groupKey, p);
      } else {
        const bestR = best.ratings?.[best.ratings.length - 1];
        const bestK2 = convertTo2KRating(best.overallRating, bestR?.hgt ?? 50, bestR?.tp ?? 50);
        if (k2 > bestK2) byPosGroup.set(groupKey, p);
      }
    });
    const starterIds = new Set([...byPosGroup.values()].slice(0, 5).map(p => p.internalId));

    return active.map(p => {
      const { k2, delta: k2Delta } = getK2WithDelta(p, currentYear);
      const stats = getLastSeasonStats(p);
      const { score: moodScore } = computeMoodScore(
        p, team, state.date, false, false, false, teamPlayers, currentYear,
      );
      const yearsLeft = Math.max(0, (p.contract?.exp ?? currentYear) - currentYear);
      return {
        player: p,
        jerseyNum: (p as any).jerseyNumber ?? '—',
        k2,
        k2Delta,
        pot: getDisplayPotential(p, currentYear),
        age: p.born?.year ? currentYear - p.born.year : (p.age ?? 0),
        currentSalaryUSD: (p.contract?.amount ?? 0) * 1_000,
        yearsLeft,
        g: stats?.g ?? 0,
        mp: stats?.mp ?? 0,
        pts: stats?.pts ?? 0,
        reb: stats?.reb ?? 0,
        ast: stats?.ast ?? 0,
        per: stats?.per ?? 0,
        moodScore,
        isTwoWay: !!(p as any).twoWay,
        isNonGuaranteed: !!(p as any).nonGuaranteed,
        posRankVal: posRank(p.pos),
        isStarter: starterIds.has(p.internalId),
      };
    });
  }, [teamPlayers, team, state.date, state.leagueStats, currentYear, teamId]);

  const rows = useMemo((): RowData[] => {
    if (starterOrder) {
      return [...allRows].sort((a, b) => {
        const posDiff = a.posRankVal - b.posRankVal;
        if (posDiff !== 0) return posDiff;
        return b.k2 - a.k2;
      });
    }
    return [...allRows].sort((a, b) => {
      const { col, dir } = sort;
      let av: any = 0, bv: any = 0;
      if (col === 'name')   { av = a.player.name; bv = b.player.name; }
      else if (col === 'num')    { av = parseInt(a.jerseyNum) || 99; bv = parseInt(b.jerseyNum) || 99; }
      else if (col === 'pos')    { av = a.player.pos ?? ''; bv = b.player.pos ?? ''; }
      else if (col === 'age')    { av = a.age;  bv = b.age; }
      else if (col === 'k2')     { av = a.k2;   bv = b.k2; }
      else if (col === 'pot')    { av = a.pot;  bv = b.pot; }
      else if (col === 'salary') { av = a.currentSalaryUSD; bv = b.currentSalaryUSD; }
      else if (col === 'exp')    { av = a.player.contract?.exp ?? 0; bv = b.player.contract?.exp ?? 0; }
      else if (col === 'g')      { av = a.g;    bv = b.g; }
      else if (col === 'mp')     { av = a.mp;   bv = b.mp; }
      else if (col === 'pts')    { av = a.pts;  bv = b.pts; }
      else if (col === 'reb')    { av = a.reb;  bv = b.reb; }
      else if (col === 'ast')    { av = a.ast;  bv = b.ast; }
      else if (col === 'per')    { av = a.per;  bv = b.per; }
      else if (col === 'mood')   { av = a.moodScore; bv = b.moodScore; }
      if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return dir === 'asc' ? av - bv : bv - av;
    });
  }, [allRows, sort, starterOrder]);

  // Projected starters for sidebar — always top K2 per position group
  const projectedStarters = useMemo(() => {
    const groups = new Map<number, RowData>();
    allRows.forEach(r => {
      const key = Math.floor(r.posRankVal);
      const best = groups.get(key);
      if (!best || r.k2 > best.k2) groups.set(key, r);
    });
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, 5)
      .map(([, r]) => r);
  }, [allRows]);

  const POS_LABELS = ['PG', 'G/SG', 'SF', 'PF', 'C'];

  if (quick.fullPageView) return quick.fullPageView;

  return (
    <>
      <div className="h-full flex gap-4 min-h-0">
        {/* Coaching Sidebar — LEFT */}
        <aside className="w-[200px] shrink-0 flex flex-col gap-3">
          {/* Team header */}
          <div
            className="rounded-lg p-3 border border-[#30363d] overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${teamColor}22, transparent)` }}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              {team?.logoUrl && (
                <img src={team.logoUrl} alt={team.abbrev} className="w-10 h-10 object-contain" />
              )}
              <div>
                <div className="text-xs font-black text-slate-100">
                  {team ? `${team.region} ${team.name}` : '—'}
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5 tabular-nums">
                  {team?.wins ?? 0}–{team?.losses ?? 0}
                </div>
              </div>
            </div>
          </div>

          {/* Projected Starters */}
          <div className="rounded-lg border border-[#30363d] bg-slate-900/50 p-3 flex flex-col gap-2 flex-1">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800 pb-2">
              Projected Starters
            </div>
            {projectedStarters.map((r, i) => (
              <div
                key={r.player.internalId}
                className="flex items-center gap-2 cursor-pointer hover:bg-white/5 rounded px-1 py-0.5 -mx-1 transition-colors"
                onClick={() => quick.openFor(r.player)}
              >
                <span
                  className="text-[8px] font-black uppercase tracking-widest shrink-0 w-5 text-center"
                  style={{ color: teamColor }}
                >
                  {POS_LABELS[i] ?? r.player.pos}
                </span>
                <PlayerPortrait playerName={r.player.name} imgUrl={r.player.imgURL} face={(r.player as any).face} size={20} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold text-slate-200 truncate">{r.player.name.split(' ').pop()}</div>
                </div>
                <span className={cn(
                  'text-[10px] font-black tabular-nums shrink-0',
                  r.k2 >= 90 ? 'text-blue-300' : r.k2 >= 85 ? 'text-emerald-300' : r.k2 >= 78 ? 'text-amber-300' : 'text-slate-400',
                )}>{r.k2}</span>
              </div>
            ))}
            {projectedStarters.length === 0 && (
              <div className="text-[10px] text-slate-600">No roster data</div>
            )}
          </div>
        </aside>

        {/* Main Roster Table */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {/* Controls */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-[10px] text-slate-500 flex items-center gap-2">
              <span>{rows.length} players</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-violet-500/50 border border-violet-500/60 inline-block" />
                Two-Way
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-amber-500/30 border border-amber-500/50 inline-block" />
                Non-Guaranteed
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[#FDB927]/20 border border-[#FDB927]/30 inline-block" />
                Starter
              </span>
            </div>
            {!starterOrder && (
              <button
                onClick={() => setStarterOrder(true)}
                className="ml-auto text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 transition-colors"
              >
                ↺ Reset to Starter Order
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-[#30363d] bg-black/40 scrollbar-hide">
            <table className="w-full text-xs min-w-[820px]">
              <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10">
                <tr className="text-slate-400 border-b border-slate-800">
                  <SortTh col="num"    label="#"    cls="text-center" />
                  <th
                    className="text-left px-2 py-2 cursor-pointer hover:text-slate-300 whitespace-nowrap text-[9px] uppercase tracking-wider font-bold"
                    onClick={() => handleSort('name')}
                  >
                    Name{!starterOrder && sort.col === 'name' && <span className="ml-0.5 text-amber-400">{sort.dir === 'desc' ? '▼' : '▲'}</span>}
                  </th>
                  <SortTh col="pos"    label="Pos"  cls="text-center" />
                  <SortTh col="age"    label="Age"  cls="text-center" />
                  <SortTh col="k2"     label="Ovr" />
                  <SortTh col="pot"    label="Pot" />
                  <SortTh col="salary" label="Contract" />
                  <SortTh col="exp"    label="Exp"  cls="text-center" />
                  <SortTh col="g"      label="G"    cls="text-center" />
                  <SortTh col="mp"     label="MP" />
                  <SortTh col="pts"    label="PTS" />
                  <SortTh col="reb"    label="TRB" />
                  <SortTh col="ast"    label="AST" />
                  <SortTh col="per"    label="PER" />
                  <SortTh col="mood"   label="Mood" cls="text-left" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const p = r.player;
                  const isExpiring = r.yearsLeft === 0;
                  const moodPct = Math.round(((r.moodScore + 10) / 20) * 100);
                  const moodBarColor =
                    r.moodScore >= 5 ? 'bg-emerald-400' :
                    r.moodScore >= 1 ? 'bg-amber-400' :
                    r.moodScore >= -1 ? 'bg-slate-400' : 'bg-rose-400';

                  // Show divider between starters and bench in starter order mode
                  const prevRow = rows[idx - 1];
                  const showBenchDivider = starterOrder && idx === 5 && prevRow?.isStarter;

                  return (
                    <React.Fragment key={p.internalId}>
                      {showBenchDivider && (
                        <tr>
                          <td colSpan={15} className="py-0.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-px bg-slate-700/50" />
                              <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">Bench</span>
                              <div className="flex-1 h-px bg-slate-700/50" />
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr
                        className={cn(
                          'border-t border-slate-800/60 cursor-pointer transition-colors',
                          r.isTwoWay
                            ? 'bg-violet-500/10 hover:bg-violet-500/20 border-l-2 border-l-violet-500'
                            : r.isNonGuaranteed
                            ? 'bg-amber-500/10 hover:bg-amber-500/20 border-l-2 border-l-amber-500'
                            : r.isStarter && starterOrder
                            ? 'bg-[#FDB927]/5 hover:bg-[#FDB927]/10'
                            : 'hover:bg-white/5',
                        )}
                        onClick={() => quick.openFor(p)}
                      >
                        <td className="text-center tabular-nums px-1.5 text-slate-500 font-mono text-[10px]">
                          {r.jerseyNum}
                        </td>

                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <PlayerPortrait playerName={p.name} imgUrl={p.imgURL} face={(p as any).face} size={24} />
                            <span className="font-semibold truncate max-w-[100px] text-slate-100">{p.name}</span>
                            {r.isTwoWay && (
                              <span className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-violet-500/30 text-violet-300 border border-violet-500/50 shrink-0">2W</span>
                            )}
                            {r.isNonGuaranteed && (
                              <span className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-amber-500/30 text-amber-300 border border-amber-500/50 shrink-0">NG</span>
                            )}
                          </div>
                        </td>

                        <td className="text-center text-slate-400 px-1.5">{p.pos}</td>
                        <td className="text-center text-slate-400 tabular-nums px-1.5">{r.age}</td>

                        <td className="text-right tabular-nums px-1.5 whitespace-nowrap">
                          <span className={cn(
                            'font-black',
                            r.k2 >= 90 ? 'text-blue-300' : r.k2 >= 85 ? 'text-emerald-300' : r.k2 >= 78 ? 'text-amber-300' : 'text-slate-400',
                          )}>{r.k2}</span>
                          {r.k2Delta !== null && r.k2Delta !== 0 && (
                            <span className={cn('ml-1 text-[9px] font-bold', r.k2Delta > 0 ? 'text-emerald-400' : 'text-rose-400')}>
                              {r.k2Delta > 0 ? '+' : ''}{r.k2Delta}
                            </span>
                          )}
                        </td>

                        <td className={cn(
                          'text-right tabular-nums px-1.5',
                          r.pot >= 90 ? 'text-blue-300/80 font-semibold' : r.pot >= 85 ? 'text-emerald-300/80 font-semibold' : r.pot >= 78 ? 'text-amber-300/80 font-semibold' : 'text-slate-500',
                        )}>{r.pot}</td>

                        <td className="text-right tabular-nums px-1.5 whitespace-nowrap text-slate-300">
                          {r.currentSalaryUSD > 0 ? fmtSalary(r.currentSalaryUSD) : <span className="text-slate-600">—</span>}
                        </td>

                        <td className="text-center tabular-nums px-1.5">
                          <span className={cn('text-[10px] font-bold', isExpiring ? 'text-rose-300 font-black' : 'text-slate-500')}>
                            {p.contract?.exp ?? '—'}
                          </span>
                        </td>

                        <td className="text-center tabular-nums px-1 text-slate-400">
                          {r.g > 0 ? r.g : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="text-right tabular-nums px-1 text-slate-300">{r.mp > 0 ? fmt1(r.mp) : <span className="text-slate-600">—</span>}</td>
                        <td className="text-right tabular-nums px-1 text-slate-300">{fmt1(r.pts)}</td>
                        <td className="text-right tabular-nums px-1 text-slate-300">{fmt1(r.reb)}</td>
                        <td className="text-right tabular-nums px-1 text-slate-300">{fmt1(r.ast)}</td>
                        <td className="text-right tabular-nums px-1 text-slate-300">{fmt1(r.per)}</td>

                        <td className="px-2 py-1.5" style={{ minWidth: 80 }}>
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
                              <div className={cn('h-full rounded transition-all', moodBarColor)} style={{ width: `${moodPct}%` }} />
                            </div>
                            <span className="text-[9px] text-slate-500 tabular-nums w-6 text-right shrink-0">
                              {r.moodScore >= 0 ? '+' : ''}{r.moodScore.toFixed(1)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {createPortal(quick.portals, document.body)}
    </>
  );
}
