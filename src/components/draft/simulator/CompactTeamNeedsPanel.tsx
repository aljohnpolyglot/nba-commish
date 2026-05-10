// Sidebar-Variante des TeamNeeds-Panels für die Draft-Simulator-Aside.
// Die Vollseiten-TeamNeeds-Komponente wrappt in 320px-Sidebar furchtbar; diese
// hier rendert single-column: Positions-Rows + Top-3 Category-Gaps. Scoring-
// Mathematik ist identisch zur Vollseiten-Version.

import React, { useMemo } from 'react';

const getCategoryScores = (p: any) => {
  const r = p.ratings?.[p.ratings.length - 1];
  if (!r) return null;
  return {
    shooting3pt:   (r.tp || 50) * 1 + (r.oiq || 50) * 0.3,
    intDefense:    (r.hgt || 50) * 2 + (r.stre || 50) * 1.5 + (r.diq || 50) * 1 + (r.jmp || 50) * 1,
    perDefense:    (r.diq || 50) * 1.5 + (r.spd || 50) * 1,
    rebound:       (r.hgt || 50) * 2 + (r.reb || 50) * 1 + (r.jmp || 50) * 0.5,
    playmaking:    (r.pss || 50) * 3 + (r.oiq || 50) * 1 + (r.drb || 50) * 0.5,
    insideScoring: (r.ins || 50) * 1 + (r.dnk || 50) * 0.5 + (r.oiq || 50) * 1,
    shotCreation:  (r.spd || 50) * 0.5 + (r.drb || 50) * 1 + (r.oiq || 50) * 0.5 + (r.tp || 50) * 0.3 + (r.fg || 50) * 0.5 + (r.dnk || 50) * 0.5 + (r.ins || 50) * 0.3,
    basketballIq:  (r.oiq || 50) * 1.5 + (r.diq || 50) * 1.5,
  };
};

const CAT_LABELS: Record<string, string> = {
  shooting3pt: '3PT Shooting',
  intDefense: 'Interior Def',
  perDefense: 'Perimeter Def',
  rebound: 'Rebounding',
  playmaking: 'Playmaking',
  insideScoring: 'Inside Scoring',
  shotCreation: 'Shot Creation',
  basketballIq: 'Basketball IQ',
};

interface CompactNeedsProps {
  teamId: number;
  players: any[];
}

export const CompactTeamNeedsPanel: React.FC<CompactNeedsProps> = ({ teamId, players }) => {
  const { posNeeds, topGaps } = useMemo(() => {
    const allActive = players.filter(p => p.tid >= 0 && p.status === 'Active');
    const teamPlayers = allActive.filter(p => p.tid === teamId);
    if (teamPlayers.length === 0) return { posNeeds: [], topGaps: [] };

    const topTwoAvg = (roster: any[], pos: string) => {
      const ps = roster.filter(p => p.pos === pos)
        .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))
        .slice(0, 2);
      if (ps.length === 0) return 40;
      if (ps.length === 1) return ps[0].overallRating ?? 40;
      return ((ps[0].overallRating ?? 40) + (ps[1].overallRating ?? 40)) / 2;
    };

    const tids = [...new Set(allActive.map(p => p.tid))];
    const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
    const leaguePos: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    tids.forEach(tid => {
      const roster = allActive.filter(p => p.tid === tid);
      POS.forEach(pos => { leaguePos[pos] += topTwoAvg(roster, pos); });
    });
    POS.forEach(pos => { leaguePos[pos] /= Math.max(1, tids.length); });

    const posNeeds = POS.map(pos => {
      const val = topTwoAvg(teamPlayers, pos);
      const diff = val - leaguePos[pos];
      let status: string, color: string;
      if (diff >= 8)       { status = 'Elite';       color = 'text-emerald-400'; }
      else if (diff >= 3)  { status = 'Strong';      color = 'text-emerald-300'; }
      else if (diff >= -2) { status = 'Stable';      color = 'text-amber-300';   }
      else if (diff >= -7) { status = 'Needs Depth'; color = 'text-red-400';     }
      else                 { status = 'Urgent Need'; color = 'text-red-500';     }
      return { pos, status, color };
    });

    // League + team category averages → biggest gaps (team below league)
    const catKeys = Object.keys(CAT_LABELS);
    const teamCat: Record<string, number> = {};
    catKeys.forEach(k => { teamCat[k] = 0; });
    teamPlayers.forEach(p => {
      const sc = getCategoryScores(p);
      if (sc) catKeys.forEach(k => { teamCat[k] += (sc as any)[k]; });
    });
    catKeys.forEach(k => { teamCat[k] /= Math.max(1, teamPlayers.length); });

    const leagueCat: Record<string, number> = {};
    catKeys.forEach(k => { leagueCat[k] = 0; });
    tids.forEach(tid => {
      const roster = allActive.filter(p => p.tid === tid);
      const sums: Record<string, number> = {};
      catKeys.forEach(k => { sums[k] = 0; });
      roster.forEach(p => {
        const sc = getCategoryScores(p);
        if (sc) catKeys.forEach(k => { sums[k] += (sc as any)[k]; });
      });
      catKeys.forEach(k => { leagueCat[k] += sums[k] / Math.max(1, roster.length); });
    });
    catKeys.forEach(k => { leagueCat[k] /= Math.max(1, tids.length); });

    const topGaps = catKeys
      .map(k => ({ key: k, label: CAT_LABELS[k], gap: leagueCat[k] - teamCat[k] }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 3);

    return { posNeeds, topGaps };
  }, [players, teamId]);

  if (posNeeds.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {posNeeds.map(p => (
          <div key={p.pos} className="flex items-center justify-between text-[10px]">
            <span className="font-black text-white/80 w-6">{p.pos}</span>
            <span className={`font-black uppercase tracking-widest ${p.color}`}>{p.status}</span>
          </div>
        ))}
      </div>
      {topGaps.length > 0 && (
        <div className="pt-2 border-t border-[#333] space-y-1">
          <div className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Biggest Gaps</div>
          {topGaps.map(g => (
            <div key={g.key} className="flex items-center justify-between text-[10px]">
              <span className="font-bold text-white/70">{g.label}</span>
              <span className={`font-black ${g.gap > 2 ? 'text-red-400' : 'text-amber-300'}`}>
                {g.gap > 0 ? '−' : '+'}{Math.abs(g.gap).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
