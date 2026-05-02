/**
 * CoachingPage — wrapper that processes game state data for the standalone CoachingView.
 * Replaces CoachingViewMain.tsx's standalone data fetching with useGame().
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '../../../../../store/GameContext';
import { calculateK2 } from './lib/k2Engine';
import { computeTeamProficiency } from '../../../../../utils/coachSliders';
import { fetchCoachData, getAllCoaches, fetchCoachExtendedData } from './lib/staffService';
import type { CoachData } from './lib/staffService';
import type { NBAPlayer, K2Result, PlayerK2 } from '../../../../../types';
import CoachingView from './CoachingView/CoachingView';
import { getDisplayOverall } from '../../../../../utils/playerRatings';
import { saveCoachSystem, getCoachSystem } from '../../../../../store/coachSystemStore';
import { computeSystemFit } from '../../../../../utils/coachSliders';

interface CoachingPageProps {
  teamId: number;
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

          // Canonical display OVR — unified with NBA Central / PlayerRatingsView.
          // Legacy fields `bbgmOvr`/`rating2K` both point to the same value.
          const displayOvr = getDisplayOverall(p);

          return {
            ...p,
            k2: { OS: k2.OS.sub, AT: k2.AT.sub, IS: k2.IS.sub, PL: k2.PL.sub, DF: k2.DF.sub, RB: k2.RB.sub } as K2Result,
            rating2K: displayOvr,
            bbgmOvr: displayOvr,
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

      // Shared util — same answer as Training Center / SystemProficiencyView.
      // Pass through System Familiarity so the star renderer reflects the team's
      // earned familiarity (Training Center daily paradigms feed it).
      const { sortedProfs, bestSystem, coachSliders, avgK2 } = computeTeamProficiency(roster, allRosters, t.systemFamiliarity);

      const getFullName = (p: PlayerK2) => p.name || 'Unknown Player';

      return {
        tid: String(t.id),
        teamName: `${t.region} ${t.name}`,
        imgURL: t.logoUrl,
        bestSystem,
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

  // Re-sync proficiency scores whenever the roster changes (trades, cuts, FA signings).
  // Only re-saves teams that the user already has a stored system for, so the
  // penalty/bonus reflects the current roster without the user needing to reopen CoachingView.
  useEffect(() => {
    for (const t of processedTeams) {
      const stored = getCoachSystem(Number(t.tid));
      if (!stored) continue;
      const { selectedProfScore, bestProfScore } = computeSystemFit(stored.selectedSystem, t.sortedProfs);
      if (selectedProfScore !== stored.selectedProfScore || bestProfScore !== stored.bestProfScore) {
        saveCoachSystem(Number(t.tid), stored.selectedSystem, selectedProfScore, bestProfScore);
      }
    }
  }, [processedTeams]);

  const selectedTeam = processedTeams.find(t => t.tid === String(teamId));

  if (!team) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }

  if (!selectedTeam) return null;

  const handleSaveSystem = (teamIdStr: string, systemName: string) => {
    const t = processedTeams.find(pt => pt.tid === teamIdStr);
    if (!t) return;
    const { selectedProfScore, bestProfScore } = computeSystemFit(systemName, t.sortedProfs);
    saveCoachSystem(Number(teamIdStr), systemName, selectedProfScore, bestProfScore);
  };

  return (
    <CoachingView
      team={selectedTeam}
      allCoaches={allCoaches}
      staffData={staffData}
      onSaveSystem={handleSaveSystem}
    />
  );
}
