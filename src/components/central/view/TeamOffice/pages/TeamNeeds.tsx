import React, { useMemo } from 'react';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { NBAPlayer } from '../../../../../types';

interface TeamNeedsProps {
  teamId: number;
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
    size: (r.hgt || 50) * 4
  };
};

export function TeamNeeds({ teamId }: TeamNeedsProps) {
  const { state } = useGame();
  const allActive = (state.players || []).filter(p => p.tid >= 0 && p.status === 'Active');
  const teamPlayers = allActive.filter(p => p.tid === teamId);

  // League-wide averages by category
  const leagueCategoryAverages = useMemo(() => {
    const teamIds = [...new Set(allActive.map(p => p.tid))];
    if (teamIds.length === 0) return null;

    const sums: Record<string, number> = {
      shooting3pt: 0, intDefense: 0, perDefense: 0, rebound: 0,
      playmaking: 0, insideScoring: 0, ballHandler: 0, shotCreation: 0,
      midRange: 0, basketballIq: 0, size: 0
    };

    teamIds.forEach(tid => {
      const roster = allActive.filter(p => p.tid === tid);
      if (roster.length === 0) return;
      const teamSums = { ...sums };
      for (const k in teamSums) teamSums[k] = 0;

      roster.forEach(p => {
        const scores = getPlayerCategoryScores(p);
        if (scores) {
          Object.keys(scores).forEach(k => {
            teamSums[k] += scores[k as keyof typeof scores];
          });
        }
      });

      Object.keys(sums).forEach(k => {
        sums[k] += teamSums[k] / roster.length;
      });
    });

    Object.keys(sums).forEach(k => {
      sums[k] /= teamIds.length;
    });
    return sums;
  }, [allActive]);

  // Slot affinity — matches the lineup-sort logic in StarterService.sortByPositionSlot.
  // A player's "fit" at each slot blends their pos tag with their height rating, so
  // external-league rosters (pos tagged 'G'/'F'/'C' or missing entirely) still slot
  // cleanly. Prior bug: strict `p.pos === 'PG'` meant any team with only 'G'-tagged
  // guards showed "Urgent Need" at PG despite having real point guards.
  const slotAffinity = (p: NBAPlayer, slot: 'PG' | 'SG' | 'SF' | 'PF' | 'C'): number => {
    const pos = (p.pos ?? '').toUpperCase();
    const r = p.ratings?.[p.ratings.length - 1];
    const hgt = (r as any)?.hgt ?? 50;
    // Position-tag affinity table. Each slot awards a tag-match bonus; specific
    // tags always beat generic ones (PG tag > G tag > SG tag for PG slot).
    const TAG_MAP: Record<string, Record<string, number>> = {
      PG: { PG: 100, G: 70, SG: 50, GF: 15, SF: 5,  F: 0,   PF: 0,  FC: 0,  C: 0 },
      SG: { SG: 100, G: 70, GF: 60, PG: 50, SF: 35, F: 15,  PF: 0,  FC: 0,  C: 0 },
      SF: { SF: 100, F: 70, GF: 60, PF: 40, SG: 30, FC: 20, G: 5,   PG: 0,  C: 10 },
      PF: { PF: 100, F: 70, FC: 65, C: 45,  SF: 30, GF: 5,  SG: 0,  G: 0,   PG: 0 },
      C:  { C: 100,  FC: 75, PF: 45, F: 15, SF: 0,  GF: 0,  SG: 0,  G: 0, PG: 0 },
    };
    const tagScore = TAG_MAP[slot][pos] ?? 0;
    // Height-rating target per slot (matches StarterService's big/guard splits).
    const HGT_TARGET: Record<string, number> = { PG: 40, SG: 48, SF: 56, PF: 65, C: 75 };
    const hgtDist = Math.abs(hgt - HGT_TARGET[slot]);
    const hgtScore = Math.max(0, 40 - hgtDist); // closer to target = higher
    return tagScore + hgtScore;
  };

  // Top-2 by slot affinity, averaged OVR. Affinity threshold filters out "anyone
  // could theoretically slot here" noise — a player needs a real fit to count as
  // positional depth. Fallback to the best available if no one clears the bar.
  const getPosTopAvg = (roster: NBAPlayer[], slot: 'PG' | 'SG' | 'SF' | 'PF' | 'C'): number => {
    const ranked = roster
      .map(p => ({ p, fit: slotAffinity(p, slot) }))
      .sort((a, b) => b.fit - a.fit);
    const viable = ranked.filter(e => e.fit >= 40).slice(0, 2);
    const pool = viable.length > 0 ? viable : ranked.slice(0, 1);
    if (pool.length === 0) return 40;
    const sum = pool.reduce((a, e) => a + (e.p.overallRating ?? 50), 0);
    return sum / pool.length;
  };

  // League-wide positional averages
  const leaguePosAverages = useMemo(() => {
    const teamIds = [...new Set(allActive.map(p => p.tid))];
    if (teamIds.length === 0) return null;

    let totalPG = 0, totalSG = 0, totalSF = 0, totalPF = 0, totalC = 0;

    teamIds.forEach(tid => {
      const roster = allActive.filter(p => p.tid === tid);
      totalPG += getPosTopAvg(roster, 'PG');
      totalSG += getPosTopAvg(roster, 'SG');
      totalSF += getPosTopAvg(roster, 'SF');
      totalPF += getPosTopAvg(roster, 'PF');
      totalC += getPosTopAvg(roster, 'C');
    });

    const n = teamIds.length;
    return { PG: totalPG / n, SG: totalSG / n, SF: totalSF / n, PF: totalPF / n, C: totalC / n };
  }, [allActive]);

  if (!leagueCategoryAverages || !leaguePosAverages || teamPlayers.length === 0) {
    return <div className="text-[#8b949e] font-bold uppercase tracking-widest animate-pulse">Loading Needs...</div>;
  }

  // Positional strength
  const getPosStrength = (pos: string) => {
    const posPlayers = teamPlayers.filter(p => p.pos === pos).sort((a, b) => b.overallRating - a.overallRating).slice(0, 2);
    if (posPlayers.length === 0) return 40;
    if (posPlayers.length === 1) return posPlayers[0].overallRating;
    return Math.round((posPlayers[0].overallRating + posPlayers[1].overallRating) / 2);
  };

  const posNeeds = [
    { pos: 'PG', val: getPosStrength('PG'), leagueAvg: leaguePosAverages.PG },
    { pos: 'SG', val: getPosStrength('SG'), leagueAvg: leaguePosAverages.SG },
    { pos: 'SF', val: getPosStrength('SF'), leagueAvg: leaguePosAverages.SF },
    { pos: 'PF', val: getPosStrength('PF'), leagueAvg: leaguePosAverages.PF },
    { pos: 'C', val: getPosStrength('C'), leagueAvg: leaguePosAverages.C },
  ];

  // Category needs
  const teamSums: Record<string, number> = {
    shooting3pt: 0, intDefense: 0, perDefense: 0, rebound: 0,
    playmaking: 0, insideScoring: 0, ballHandler: 0, shotCreation: 0,
    midRange: 0, basketballIq: 0, size: 0
  };

  teamPlayers.forEach(p => {
    const scores = getPlayerCategoryScores(p);
    if (scores) {
      Object.keys(scores).forEach(k => {
        teamSums[k] += scores[k as keyof typeof scores];
      });
    }
  });

  const catLabels: Record<string, string> = {
    shooting3pt: 'Three Point Shooting', intDefense: 'Interior Defense', perDefense: 'Perimeter Defense',
    rebound: 'Rebounding', playmaking: 'Playmaking', insideScoring: 'Inside Scoring',
    ballHandler: 'Ball Handling', shotCreation: 'Shot Creation', midRange: 'Mid-Range',
    basketballIq: 'Basketball IQ', size: 'Size'
  };

  const catNeeds = Object.keys(teamSums).map(k => {
    const avg = teamSums[k] / Math.max(1, teamPlayers.length);
    const leagueAvg = leagueCategoryAverages[k];
    const diff = avg - leagueAvg;
    const normalized = Math.min(99, Math.max(40, 75 + (diff * 2.5)));

    return {
      name: catLabels[k],
      val: Math.round(normalized),
      gap: leagueAvg - avg
    };
  }).sort((a, b) => a.val - b.val);

  const getGrade = (val: number) => {
    if (val >= 90) return { grade: 'A+', color: 'text-emerald-500' };
    if (val >= 85) return { grade: 'A', color: 'text-emerald-500' };
    if (val >= 80) return { grade: 'B+', color: 'text-[#FDB927]' };
    if (val >= 75) return { grade: 'B', color: 'text-[#FDB927]' };
    if (val >= 70) return { grade: 'C+', color: 'text-[#e6edf3]' };
    if (val >= 65) return { grade: 'C', color: 'text-[#e6edf3]' };
    if (val >= 60) return { grade: 'D+', color: 'text-red-400' };
    if (val >= 55) return { grade: 'D', color: 'text-red-400' };
    return { grade: 'F', color: 'text-red-400' };
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
            {posNeeds.map((item) => {
              const diff = item.val - item.leagueAvg;
              let status = 'Stable';
              let statusColor = 'text-[#e6edf3]';
              let barColor = 'bg-[#8b949e]';

              if (diff >= 8) { status = 'Elite'; statusColor = 'text-emerald-500'; barColor = 'bg-emerald-500'; }
              else if (diff >= 3) { status = 'Strong'; statusColor = 'text-emerald-500'; barColor = 'bg-emerald-500'; }
              else if (diff >= -2) { status = 'Stable'; statusColor = 'text-[#FDB927]'; barColor = 'bg-[#FDB927]'; }
              else if (diff >= -7) { status = 'Depth Needed'; statusColor = 'text-red-400'; barColor = 'bg-red-400'; }
              else { status = 'Urgent Need'; statusColor = 'text-red-400'; barColor = 'bg-red-400'; }

              return (
                <div key={item.pos} className="flex items-center justify-between">
                  <div className="w-10 font-extrabold text-[#e6edf3]">{item.pos}</div>
                  <div className="flex-1 h-2 bg-[#2c2c2e] mx-5 rounded overflow-hidden">
                    <div className={cn("h-full transition-all duration-1000", barColor)} style={{ width: `${Math.min(100, item.val)}%` }} />
                  </div>
                  <div className={cn("text-[11px] font-bold uppercase w-24 text-right", statusColor)}>
                    {status}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Category Needs */}
      <div className="lg:col-span-3 flex flex-col gap-6">
        <div className="bg-[#161b22]/60 backdrop-blur-md border border-[#30363d] rounded p-6 shadow-lg h-full">
          <div className="flex justify-between items-center mb-6 border-b border-[#30363d] pb-3">
            <h2 className="text-xs uppercase text-[#FDB927] tracking-[1.5px] font-bold">Team Needs</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {catNeeds.map((cat) => {
              const { grade, color } = getGrade(cat.val);
              const isGap = cat.gap > 0;
              return (
                <div key={cat.name} className={cn("p-4 bg-white/5 rounded border transition-colors", isGap ? "border-red-400/50" : "border-transparent hover:border-[#30363d]")}>
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-[10px] text-[#8b949e] uppercase tracking-wider">{cat.name}</div>
                    {isGap && <div className="text-[9px] font-bold bg-red-400/20 text-red-400 px-1.5 py-0.5 rounded uppercase">Gap</div>}
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
