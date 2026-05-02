import React, { useMemo } from 'react';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { NBAPlayer } from '../../../../../types';

interface TeamNeedsProps {
  teamId: number;
}

function seasonYearFromDate(d: string): number {
  const yr = new Date(d).getFullYear();
  return new Date(d).getMonth() < 9 ? yr : yr + 1;
}

const getPlayerCategoryScores = (p: NBAPlayer) => {
  const r = p.ratings?.[p.ratings.length - 1];
  if (!r) return null;
  return {
    shooting3pt: (r.tp || 50) * 1 + (r.oiq || 50) * 0.3,
    intDefense: (r.hgt || 50) * 2 + (r.stre || 50) * 1.5 + (r.diq || 50) * 1 + (r.jmp || 50) * 1,
    perDefense: (r.diq || 50) * 1.5 + (r.spd || 50) * 1,
    rebound: (r.hgt || 50) * 2 + (r.reb || 50) * 1 + (r.jmp || 50) * 0.5,
    playmaking: (r.pss || 50) * 3 + (r.oiq || 50) * 1 + (r.drb || 50) * 0.5,
    insideScoring: (r.ins || 50) * 1 + (r.dnk || 50) * 0.5 + (r.oiq || 50) * 1,
    ballHandler: (r.pss || 50) * 0.2 + (r.drb || 50) * 2 + (r.oiq || 50) * 0.5 + (r.spd || 50) * 0.5,
    shotCreation: (r.spd || 50) * 0.5 + (r.drb || 50) * 1 + (r.oiq || 50) * 0.5 + (r.tp || 50) * 0.3 + (r.fg || 50) * 0.5 + (r.dnk || 50) * 0.5 + (r.ins || 50) * 0.3,
    midRange: (r.fg || 50) * 2 + (r.oiq || 50) * 0.5,
    basketballIq: (r.oiq || 50) * 1.5 + (r.diq || 50) * 1.5,
    size: (r.hgt || 50) * 4,
  };
};

export function TeamNeeds({ teamId }: TeamNeedsProps) {
  const { state } = useGame();
  const allActive = (state.players || []).filter(p => p.tid >= 0 && p.status === 'Active');
  const teamPlayers = allActive.filter(p => p.tid === teamId);
  const currentYear = state.leagueStats?.year;

  // ── Actual box-score stats (current season) ───────────────────────────────
  // For each team: aggregate per-game shooting, defense, rebounding, playmaking.
  // Used to cross-check ratings — a team shooting 42% from 3 shouldn't grade C+.
  const { teamPerf, leaguePerf } = useMemo(() => {
    type Acc = {
      g: number;
      tpm: number; tpa: number;
      ast: number; tov: number;
      orb: number; drb: number; trb: number;
      blk: number; stl: number;
      rimFgm: number; rimFga: number;
      lpFgm: number; lpFga: number;
      mrFgm: number; mrFga: number;
      oppTpm: number; oppTpa: number;
      oppRimFgm: number; oppRimFga: number;
      oppLpFgm: number; oppLpFga: number;
    };
    const zero = (): Acc => ({
      g: 0, tpm: 0, tpa: 0, ast: 0, tov: 0,
      orb: 0, drb: 0, trb: 0, blk: 0, stl: 0,
      rimFgm: 0, rimFga: 0, lpFgm: 0, lpFga: 0, mrFgm: 0, mrFga: 0,
      oppTpm: 0, oppTpa: 0, oppRimFgm: 0, oppRimFga: 0, oppLpFgm: 0, oppLpFga: 0,
    });

    const byTeam = new Map<number, Acc>();

    (state.boxScores as any[]).forEach(game => {
      if (game.isAllStar || game.isRisingStars || game.isCelebrityGame || game.isPreseason) return;
      if (currentYear && game.date && seasonYearFromDate(game.date) !== currentYear) return;

      const sides: Array<{ stats: any[]; tid: number; oppStats: any[] }> = [
        { stats: game.homeStats || [], tid: game.homeTeamId, oppStats: game.awayStats || [] },
        { stats: game.awayStats || [], tid: game.awayTeamId, oppStats: game.homeStats || [] },
      ];

      for (const { stats, tid, oppStats } of sides) {
        if (!byTeam.has(tid)) byTeam.set(tid, zero());
        const a = byTeam.get(tid)!;
        a.g++;
        for (const ps of stats) {
          a.tpm  += ps.threePm || 0;  a.tpa  += ps.threePa || 0;
          a.ast  += ps.ast  || 0;     a.tov  += ps.tov  || 0;
          a.orb  += ps.orb  || 0;     a.drb  += ps.drb  || 0;
          a.trb  += ps.reb ?? ps.trb ?? ((ps.orb || 0) + (ps.drb || 0));
          a.blk  += ps.blk  || 0;     a.stl  += ps.stl  || 0;
          a.rimFgm += ps.fgAtRim    || 0;  a.rimFga += ps.fgaAtRim    || 0;
          a.lpFgm  += ps.fgLowPost  || 0;  a.lpFga  += ps.fgaLowPost  || 0;
          a.mrFgm  += ps.fgMidRange || 0;  a.mrFga  += ps.fgaMidRange || 0;
        }
        for (const ps of oppStats) {
          a.oppTpm    += ps.threePm  || 0;  a.oppTpa    += ps.threePa  || 0;
          a.oppRimFgm += ps.fgAtRim  || 0;  a.oppRimFga += ps.fgaAtRim || 0;
          a.oppLpFgm  += ps.fgLowPost|| 0;  a.oppLpFga  += ps.fgaLowPost || 0;
        }
      }
    });

    const toPerf = (a: Acc) => {
      const g = a.g || 1;
      return {
        g: a.g,
        tpa:      a.tpa / g,
        tpp:      a.tpa  > 0 ? a.tpm  / a.tpa  : 0,
        ast:      a.ast  / g,
        tov:      a.tov  / g,
        astTov:   a.tov  > 0 ? a.ast  / a.tov  : 0,
        trb:      a.trb  / g,
        blk:      a.blk  / g,
        stl:      a.stl  / g,
        rimFgp:   a.rimFga > 0 ? a.rimFgm / a.rimFga : 0,
        lpFgp:    a.lpFga  > 0 ? a.lpFgm  / a.lpFga  : 0,
        mrFgp:    a.mrFga  > 0 ? a.mrFgm  / a.mrFga  : 0,
        pip:      (a.rimFgm + a.lpFgm) * 2 / g,
        oppTpp:   a.oppTpa    > 0 ? a.oppTpm    / a.oppTpa    : 0,
        oppTpa:   a.oppTpa    / g,
        oppRimFgp:a.oppRimFga > 0 ? a.oppRimFgm / a.oppRimFga : 0,
        oppLpFgp: a.oppLpFga  > 0 ? a.oppLpFgm  / a.oppLpFga  : 0,
      };
    };

    const team = byTeam.get(teamId) ?? zero();
    const league = Array.from(byTeam.values()).filter(t => t.g >= 5);
    const avgOf = (fn: (t: ReturnType<typeof toPerf>) => number) => {
      if (!league.length) return 0;
      return league.reduce((s, t) => s + fn(toPerf(t)), 0) / league.length;
    };

    return {
      teamPerf: toPerf(team),
      leaguePerf: {
        tpa:      avgOf(t => t.tpa),
        tpp:      avgOf(t => t.tpp),
        ast:      avgOf(t => t.ast),
        tov:      avgOf(t => t.tov),
        astTov:   avgOf(t => t.astTov),
        trb:      avgOf(t => t.trb),
        blk:      avgOf(t => t.blk),
        stl:      avgOf(t => t.stl),
        rimFgp:   avgOf(t => t.rimFgp),
        lpFgp:    avgOf(t => t.lpFgp),
        mrFgp:    avgOf(t => t.mrFgp),
        pip:      avgOf(t => t.pip),
        oppTpp:   avgOf(t => t.oppTpp),
        oppTpa:   avgOf(t => t.oppTpa),
        oppRimFgp:avgOf(t => t.oppRimFgp),
        oppLpFgp: avgOf(t => t.oppLpFgp),
      },
    };
  }, [state.boxScores, teamId, currentYear]);

  // Weight scales 0→0.5 as games go from 10→82. Under 10 games: pure ratings.
  const statWeight = teamPerf.g >= 10 ? Math.min(0.5, (teamPerf.g - 10) / 72 * 0.5) : 0;

  // Stat-based adjustment per category (in the same units as ratingDiff).
  // Positive = team is above league avg on this category's real stats.
  // Negative = below avg (e.g., opponents shooting well against you = bad defense).
  const getStatAdj = (category: string): number => {
    if (statWeight === 0) return 0;
    const lp = leaguePerf;
    const tp = teamPerf;
    switch (category) {
      case 'shooting3pt': {
        // 3P% diff amplified to rating scale: +5% → ~+10 units; volume adds context
        const tppAdj = (tp.tpp - lp.tpp) * 200;
        const tpaAdj = (tp.tpa - lp.tpa) * 0.8;
        return (tppAdj + tpaAdj) * statWeight;
      }
      case 'intDefense': {
        // Opponents shooting well at rim / low post = bad interior defense — invert both
        const rimAdj = (lp.oppRimFgp - tp.oppRimFgp) * 120;
        const lpAdj  = (lp.oppLpFgp  - tp.oppLpFgp)  * 80;
        const blkAdj = (tp.blk - lp.blk) * 3;
        return (rimAdj + lpAdj + blkAdj) * statWeight;
      }
      case 'perDefense': {
        // Opponents shooting lots of 3s at high % against you = bad perimeter D — invert
        const oppTppAdj = (lp.oppTpp - tp.oppTpp) * 200;
        const oppTpaAdj = (lp.oppTpa - tp.oppTpa) * 0.5; // high opp volume = bad
        const stlAdj    = (tp.stl - lp.stl) * 4;
        return (oppTppAdj + oppTpaAdj + stlAdj) * statWeight;
      }
      case 'rebound': {
        const trbAdj = (tp.trb - lp.trb) * 1.5;
        return trbAdj * statWeight;
      }
      case 'playmaking': {
        const astAdj    = (tp.ast    - lp.ast)    * 1.5;
        const ratioAdj  = (tp.astTov - lp.astTov) * 4;
        return (astAdj + ratioAdj) * statWeight;
      }
      case 'insideScoring': {
        const rimFgpAdj = (tp.rimFgp - lp.rimFgp) * 100;
        const pipAdj    = (tp.pip    - lp.pip)    * 0.6;
        return (rimFgpAdj + pipAdj) * statWeight;
      }
      case 'midRange': {
        return (tp.mrFgp - lp.mrFgp) * 120 * statWeight;
      }
      case 'ballHandler': {
        const tovAdj   = (lp.tov    - tp.tov)    * 1.5; // fewer TOV = better, inverted
        const ratioAdj = (tp.astTov - lp.astTov) * 3;
        return (tovAdj + ratioAdj) * statWeight;
      }
      case 'basketballIq': {
        const ratioAdj = (tp.astTov - lp.astTov) * 5;
        const tovAdj   = (lp.tov    - tp.tov)    * 1.2;
        return (ratioAdj + tovAdj) * statWeight;
      }
      default:
        return 0;
    }
  };

  // ── League-wide rating averages ───────────────────────────────────────────
  const leagueCategoryAverages = useMemo(() => {
    const teamIds = [...new Set(allActive.map(p => p.tid))];
    if (teamIds.length === 0) return null;
    const sums: Record<string, number> = {
      shooting3pt: 0, intDefense: 0, perDefense: 0, rebound: 0,
      playmaking: 0, insideScoring: 0, ballHandler: 0, shotCreation: 0,
      midRange: 0, basketballIq: 0, size: 0,
    };
    teamIds.forEach(tid => {
      const roster = allActive.filter(p => p.tid === tid);
      if (!roster.length) return;
      const ts: Record<string, number> = {};
      for (const k in sums) ts[k] = 0;
      roster.forEach(p => {
        const s = getPlayerCategoryScores(p);
        if (s) Object.keys(s).forEach(k => { ts[k] += s[k as keyof typeof s]; });
      });
      Object.keys(sums).forEach(k => { sums[k] += ts[k] / roster.length; });
    });
    Object.keys(sums).forEach(k => { sums[k] /= teamIds.length; });
    return sums;
  }, [allActive]);

  // Slot affinity — matches StarterService.sortByPositionSlot
  const slotAffinity = (p: NBAPlayer, slot: 'PG' | 'SG' | 'SF' | 'PF' | 'C'): number => {
    const pos = (p.pos ?? '').toUpperCase();
    const r = p.ratings?.[p.ratings.length - 1];
    const hgt = (r as any)?.hgt ?? 50;
    const TAG_MAP: Record<string, Record<string, number>> = {
      PG: { PG: 100, G: 70, SG: 50, GF: 15, SF: 5,  F: 0,   PF: 0,  FC: 0,  C: 0 },
      SG: { SG: 100, G: 70, GF: 60, PG: 50, SF: 35, F: 15,  PF: 0,  FC: 0,  C: 0 },
      SF: { SF: 100, F: 70, GF: 60, PF: 40, SG: 30, FC: 20, G: 5,   PG: 0,  C: 10 },
      PF: { PF: 100, F: 70, FC: 65, C: 45,  SF: 30, GF: 5,  SG: 0,  G: 0,   PG: 0 },
      C:  { C: 100,  FC: 75, PF: 45, F: 15, SF: 0,  GF: 0,  SG: 0,  G: 0, PG: 0 },
    };
    const tagScore = TAG_MAP[slot][pos] ?? 0;
    const HGT_TARGET: Record<string, number> = { PG: 40, SG: 48, SF: 56, PF: 65, C: 75 };
    const hgtDist = Math.abs(hgt - HGT_TARGET[slot]);
    return tagScore + Math.max(0, 40 - hgtDist);
  };

  const getPosTopAvg = (roster: NBAPlayer[], slot: 'PG' | 'SG' | 'SF' | 'PF' | 'C'): number => {
    const ranked = roster.map(p => ({ p, fit: slotAffinity(p, slot) })).sort((a, b) => b.fit - a.fit);
    const viable = ranked.filter(e => e.fit >= 40).slice(0, 2);
    const pool = viable.length > 0 ? viable : ranked.slice(0, 1);
    if (!pool.length) return 40;
    return pool.reduce((a, e) => a + (e.p.overallRating ?? 50), 0) / pool.length;
  };

  const leaguePosAverages = useMemo(() => {
    const teamIds = [...new Set(allActive.map(p => p.tid))];
    if (!teamIds.length) return null;
    let tPG = 0, tSG = 0, tSF = 0, tPF = 0, tC = 0;
    teamIds.forEach(tid => {
      const r = allActive.filter(p => p.tid === tid);
      tPG += getPosTopAvg(r, 'PG'); tSG += getPosTopAvg(r, 'SG');
      tSF += getPosTopAvg(r, 'SF'); tPF += getPosTopAvg(r, 'PF');
      tC  += getPosTopAvg(r, 'C');
    });
    const n = teamIds.length;
    return { PG: tPG / n, SG: tSG / n, SF: tSF / n, PF: tPF / n, C: tC / n };
  }, [allActive]);

  if (!leagueCategoryAverages || !leaguePosAverages || !teamPlayers.length) {
    return <div className="text-[#8b949e] font-bold uppercase tracking-widest animate-pulse">Loading Needs...</div>;
  }

  // ── Positional strength ───────────────────────────────────────────────────
  const getPosStrength = (pos: string) => {
    const pp = teamPlayers.filter(p => p.pos === pos).sort((a, b) => b.overallRating - a.overallRating).slice(0, 2);
    if (!pp.length) return 40;
    if (pp.length === 1) return pp[0].overallRating;
    return Math.round((pp[0].overallRating + pp[1].overallRating) / 2);
  };

  const posNeeds = [
    { pos: 'PG', val: getPosStrength('PG'), leagueAvg: leaguePosAverages.PG },
    { pos: 'SG', val: getPosStrength('SG'), leagueAvg: leaguePosAverages.SG },
    { pos: 'SF', val: getPosStrength('SF'), leagueAvg: leaguePosAverages.SF },
    { pos: 'PF', val: getPosStrength('PF'), leagueAvg: leaguePosAverages.PF },
    { pos: 'C',  val: getPosStrength('C'),  leagueAvg: leaguePosAverages.C  },
  ];

  // ── Category needs (ratings blended with actual stats) ───────────────────
  const teamSums: Record<string, number> = {
    shooting3pt: 0, intDefense: 0, perDefense: 0, rebound: 0,
    playmaking: 0, insideScoring: 0, ballHandler: 0, shotCreation: 0,
    midRange: 0, basketballIq: 0, size: 0,
  };
  teamPlayers.forEach(p => {
    const s = getPlayerCategoryScores(p);
    if (s) Object.keys(s).forEach(k => { teamSums[k] += s[k as keyof typeof s]; });
  });

  const catLabels: Record<string, string> = {
    shooting3pt: 'Three Point Shooting', intDefense: 'Interior Defense', perDefense: 'Perimeter Defense',
    rebound: 'Rebounding', playmaking: 'Playmaking', insideScoring: 'Inside Scoring',
    ballHandler: 'Ball Handling', shotCreation: 'Shot Creation', midRange: 'Mid-Range',
    basketballIq: 'Basketball IQ', size: 'Size',
  };

  const catNeeds = Object.keys(teamSums).map(k => {
    const avg        = teamSums[k] / Math.max(1, teamPlayers.length);
    const leagueAvg  = leagueCategoryAverages[k];
    const ratingDiff = avg - leagueAvg;
    const statAdj    = getStatAdj(k);
    const effectiveDiff = ratingDiff + statAdj;
    const normalized = Math.min(99, Math.max(40, 75 + (effectiveDiff * 2.5)));
    return {
      name: catLabels[k],
      val: Math.round(normalized),
      gap: leagueAvg - avg,
    };
  }).sort((a, b) => a.val - b.val);

  const getGrade = (val: number) => {
    if (val >= 90) return { grade: 'A+', color: 'text-emerald-500' };
    if (val >= 85) return { grade: 'A',  color: 'text-emerald-500' };
    if (val >= 80) return { grade: 'B+', color: 'text-[#FDB927]'  };
    if (val >= 75) return { grade: 'B',  color: 'text-[#FDB927]'  };
    if (val >= 70) return { grade: 'C+', color: 'text-[#e6edf3]'  };
    if (val >= 65) return { grade: 'C',  color: 'text-[#e6edf3]'  };
    if (val >= 60) return { grade: 'D+', color: 'text-red-400'    };
    if (val >= 55) return { grade: 'D',  color: 'text-red-400'    };
    return              { grade: 'F',  color: 'text-red-400'    };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 h-full">
      {/* Positional Needs */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        <div className="bg-[#161b22]/60 backdrop-blur-md border border-[#30363d] rounded p-6 shadow-lg h-full">
          <div className="flex justify-between items-center mb-6 border-b border-[#30363d] pb-3">
            <h2 className="text-xs uppercase text-[#FDB927] tracking-[1.5px] font-bold">Positional Strength & Needs</h2>
          </div>
          <div className="flex flex-col gap-4">
            {posNeeds.map(item => {
              const diff = item.val - item.leagueAvg;
              let status = 'Stable', statusColor = 'text-[#e6edf3]', barColor = 'bg-[#8b949e]';
              if      (diff >= 8)  { status = 'Elite';        statusColor = 'text-emerald-500'; barColor = 'bg-emerald-500'; }
              else if (diff >= 3)  { status = 'Strong';       statusColor = 'text-emerald-500'; barColor = 'bg-emerald-500'; }
              else if (diff >= -2) { status = 'Stable';       statusColor = 'text-[#FDB927]';   barColor = 'bg-[#FDB927]';   }
              else if (diff >= -7) { status = 'Depth Needed'; statusColor = 'text-red-400';     barColor = 'bg-red-400';     }
              else                 { status = 'Urgent Need';  statusColor = 'text-red-400';     barColor = 'bg-red-400';     }
              return (
                <div key={item.pos} className="flex items-center justify-between">
                  <div className="w-10 font-extrabold text-[#e6edf3]">{item.pos}</div>
                  <div className="flex-1 h-2 bg-[#2c2c2e] mx-5 rounded overflow-hidden">
                    <div className={cn("h-full transition-all duration-1000", barColor)} style={{ width: `${Math.min(100, item.val)}%` }} />
                  </div>
                  <div className={cn("text-[11px] font-bold uppercase w-24 text-right", statusColor)}>{status}</div>
                </div>
              );
            })}
          </div>

          {/* Sample-size caveat */}
          {teamPerf.g > 0 && teamPerf.g < 10 && (
            <div className="mt-4 pt-3 border-t border-[#30363d] text-[9px] text-slate-500 uppercase tracking-widest">
              Grades are ratings-only until 10 games — real stats kick in after that.
            </div>
          )}
          {teamPerf.g === 0 && (
            <div className="mt-4 pt-3 border-t border-[#30363d] text-[9px] text-slate-500 uppercase tracking-widest">
              No games played yet — grades are ratings-only. Real stats will adjust them once the season starts.
            </div>
          )}
        </div>
      </div>

      {/* Category Needs */}
      <div className="lg:col-span-3 flex flex-col gap-6">
        <div className="bg-[#161b22]/60 backdrop-blur-md border border-[#30363d] rounded p-6 shadow-lg h-full">
          <div className="flex justify-between items-center mb-6 border-b border-[#30363d] pb-3">
            <h2 className="text-xs uppercase text-[#FDB927] tracking-[1.5px] font-bold">Team Needs</h2>
            {teamPerf.g >= 5 && (
              <span className="text-[9px] text-slate-500 uppercase tracking-widest">
                {Math.round(statWeight * 100)}% weighted by actual stats ({teamPerf.g}g)
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {catNeeds.map(cat => {
              const { grade, color } = getGrade(cat.val);
              const isGap = cat.gap > 0;
              return (
                <div
                  key={cat.name}
                  className={cn(
                    "p-4 bg-white/5 rounded border transition-colors",
                    isGap ? "border-red-400/50" : "border-transparent hover:border-[#30363d]",
                  )}
                >
                  <div className="flex justify-between items-start mb-1 gap-1">
                    <div className="text-[10px] text-[#8b949e] uppercase tracking-wider leading-tight">{cat.name}</div>
                    {isGap && <div className="text-[9px] font-bold bg-red-400/20 text-red-400 px-1.5 py-0.5 rounded uppercase shrink-0">Gap</div>}
                  </div>
                  <div className="flex items-end justify-between">
                    <div className={cn("text-2xl font-extrabold", color)}>{grade}</div>
                    <div className="text-xs text-[#8b949e] font-medium">{cat.val} OVR</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
