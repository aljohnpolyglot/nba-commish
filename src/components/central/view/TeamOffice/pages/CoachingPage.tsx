/**
 * CoachingPage — wrapper that processes game state data for the standalone CoachingView.
 * Replaces CoachingViewMain.tsx's standalone data fetching with useGame().
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '../../../../../store/GameContext';
import { calculateK2 } from './lib/k2Engine';
import { convertTo2KRating } from '../../../../../utils/helpers';
import { calculateCoachSliders } from './lib/coachSliders';
import { getSystemProficiency } from '../../../../../utils/coachSliders';
import { fetchCoachData, getAllCoaches, fetchCoachExtendedData } from './lib/staffService';
import type { CoachData } from './lib/staffService';
import type { NBAPlayer, K2Result, PlayerK2 } from '../../../../../types';
import CoachingView from './CoachingView/CoachingView';

interface CoachingPageProps {
  teamId: number;
}

function calculateOverallFromRating(rating: any): number {
  if (!rating) return 50;
  const { hgt, stre, spd, jmp, endu, ins, dnk, ft, fg, tp, oiq, diq, drb, pss, reb } = rating;
  const scoringStats = [ins, dnk, ft, fg, tp].sort((a: number, b: number) => b - a);
  const topScoring = (scoringStats[0] + scoringStats[1] + scoringStats[2]) / 3;
  const avgScoring = (ins + dnk + ft + fg + tp) / 5;
  const scoring = topScoring * 0.7 + avgScoring * 0.3;
  const physicals = (hgt * 1.5 + stre + spd * 1.2 + jmp + endu * 1.3) / 6;
  const playmaking = (drb * 0.9 + pss * 0.9 + oiq * 1.2) / 3;
  const defense = (diq * 1.2 + reb * 0.9 + hgt * 0.9) / 3;
  let rawOvr = scoring * 0.35 + playmaking * 0.25 + defense * 0.2 + physicals * 0.2;
  if (rawOvr > 80) rawOvr = 80 + (rawOvr - 80) * 1.4;
  else if (rawOvr < 60) rawOvr = rawOvr * 0.95;
  return Math.max(40, Math.min(99, Math.round(rawOvr)));
}

export function CoachingPage({ teamId }: CoachingPageProps) {
  const { state } = useGame();
  const [allCoaches, setAllCoaches] = useState<CoachData[]>([]);
  const [coachDataLoaded, setCoachDataLoaded] = useState(false);

  const team = state.teams.find(t => t.id === teamId);
  const currentYear = state.leagueStats?.year || 2026;

  // Fetch coach data on mount
  useEffect(() => {
    Promise.all([fetchCoachData(), fetchCoachExtendedData()]).then(() => {
      setAllCoaches(getAllCoaches());
      setCoachDataLoaded(true);
    });
  }, []);

  // Process all teams into the format CoachingView expects
  const { processedTeams, staffData } = useMemo(() => {
    if (!state.players?.length || !state.teams?.length) return { processedTeams: [], staffData: null };

    const allRosters: PlayerK2[][] = [];

    const teams = state.teams.map(t => {
      const roster = state.players
        .filter(p => p.tid === t.id && p.status === 'Active')
        .map(p => {
          const r = p.ratings?.[p.ratings.length - 1];
          if (!r) return null;

          const k2 = calculateK2(r, {
            pos: p.pos || 'F',
            heightIn: p.hgt || 78,
            weightLbs: p.weight || 220,
            age: p.born?.year ? currentYear - p.born.year : (p.age || 26),
          });

          const bbgmOvr = calculateOverallFromRating(r);
          const eliteSkill = Math.max(r.tp || 0, r.ins || 0, r.spd || 0, r.jmp || 0, r.stre || 0, r.dnk || 0, r.drb || 0, r.pss || 0);
          const rating2K = convertTo2KRating(bbgmOvr, r.hgt, eliteSkill);

          return {
            ...p,
            k2: { OS: k2.OS.sub, AT: k2.AT.sub, IS: k2.IS.sub, PL: k2.PL.sub, DF: k2.DF.sub, RB: k2.RB.sub } as K2Result,
            rating2K,
            bbgmOvr,
            currentRating: r,
          } as PlayerK2;
        })
        .filter(Boolean) as PlayerK2[];

      allRosters.push(roster);
      return { team: t, roster };
    });

    const processed = teams.map(({ team: t, roster }) => {
      const sorted = [...roster].sort((a, b) => b.rating2K - a.rating2K);
      const sortedByBbgm = [...roster].sort((a, b) => b.bbgmOvr - a.bbgmOvr);
      const top12 = sorted.slice(0, 12);

      const top1Ovr = sortedByBbgm[0]?.bbgmOvr || 50;
      const top2Ovr = sortedByBbgm[1]?.bbgmOvr || 50;
      const starGap = top1Ovr - top2Ovr;

      // Average K2 of top 8
      const avgK2: K2Result = { OS: [0,0,0,0,0,0], AT: [0,0,0,0,0,0,0], IS: [0,0,0,0,0,0,0,0], PL: [0,0,0,0,0], DF: [0,0,0,0,0,0,0], RB: [0,0] };
      roster.slice(0, 8).forEach(p => {
        Object.keys(avgK2).forEach(cat => {
          (p.k2 as any)[cat].forEach((val: number, i: number) => (avgK2 as any)[cat][i] += val / Math.min(8, roster.length));
        });
      });

      const coachSliders = calculateCoachSliders(roster, allRosters);
      const fiveOutBonus = (coachSliders.prefInOut >= 90) ? 25 : 0;
      const highIQCount = sortedByBbgm.slice(0, 10).filter(p => p.currentRating.oiq > 70).length;

      const top7 = sortedByBbgm.slice(0, 7).map(p => p.currentRating);
      const isVersatile = top7.length >= 7 && top7.every((p: any) =>
        p.oiq > 60 && p.diq > 40 && p.drb > 40 && p.spd > 40
      ) && top7.filter((p: any) => p.spd > 55 && p.tp > 45).length >= 4;

      const profs = getSystemProficiency(
        avgK2, starGap,
        sortedByBbgm[0]?.currentRating,
        fiveOutBonus,
        sortedByBbgm[1]?.currentRating,
        highIQCount,
        coachSliders.tempo,
        isVersatile,
        coachSliders.prefOffDef
      );
      const sortedProfs = Object.entries(profs).sort((a, b) => b[1] - a[1]);

      const getFullName = (p: PlayerK2) => p.name || 'Unknown Player';

      return {
        tid: String(t.id),
        teamName: `${t.region} ${t.name}`,
        imgURL: t.logoUrl,
        bestSystem: sortedProfs[0][0],
        avgK2,
        sortedProfs,
        top12,
        roster,
        coachSliders,
        leadPlayer: { name: getFullName(sortedByBbgm[0]), pos: sortedByBbgm[0]?.pos || 'F' },
      };
    });

    return { processedTeams: processed, staffData: state.staff };
  }, [state.players, state.teams, currentYear, state.staff]);

  const selectedTeam = processedTeams.find(t => t.tid === String(teamId));

  if (!team) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }

  if (!selectedTeam) return null;

  return (
    <CoachingView
      team={selectedTeam}
      allCoaches={allCoaches}
      staffData={staffData}
      onSaveSystem={() => {}}
    />
  );
}
