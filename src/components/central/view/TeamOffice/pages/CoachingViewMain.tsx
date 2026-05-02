/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { calculateK2, getSystemProficiency } from './lib/k2Engine';
import { calculateCoachSliders } from './lib/coachSliders';
import type { Player, Team, PlayerK2 } from './types';
import CoachingView from './components/CoachingView';
import { getStaffData, fetchCoachData, getAllCoaches, CoachData } from './lib/staffService';
import { getDisplayOverall } from '../../../../../utils/playerRatings';

export default function App() {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [allCoaches, setAllCoaches] = useState<CoachData[]>([]);
  const [staffData, setStaffData] = useState<any>(null);

  useEffect(() => {
    fetchCoachData().then(() => {
      setAllCoaches(getAllCoaches());
    });
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/2025-26.NBA.Roster.json');
      const data = await res.json();

      const teamMap: { [key: number]: string } = {};
      const teamObjMap = new Map<string, Team>();
      data.teams.forEach((t: Team) => {
        teamMap[t.tid] = `${t.region} ${t.name}`;
        teamObjMap.set(`${t.region} ${t.name}`.toLowerCase(), t);
        teamObjMap.set(t.name.toLowerCase(), t);
      });

      const teamRosters: { [key: number]: PlayerK2[] } = {};
      data.players.forEach((p: Player) => {
        if (p.tid < 0) return;
        const r = p.ratings[p.ratings.length - 1];
        const rawK2 = calculateK2(r, { pos: p.pos, heightIn: p.hgt, weightLbs: p.weight, age: 2026 - p.born.year });
        const k2 = {
          OS: rawK2.OS.sub,
          AT: rawK2.AT.sub,
          IS: rawK2.IS.sub,
          PL: rawK2.PL.sub,
          DF: rawK2.DF.sub,
          RB: rawK2.RB.sub,
        };

        // Canonical display OVR — same source of truth as PlayerRatingsView,
        // NBA Central, and Team Office starter cards. Legacy field names
        // `bbgmOvr`/`rating2K` kept so downstream sorts/tooltips still work,
        // but both now point to the unified display value.
        const displayOvr = getDisplayOverall(p);

        if (!teamRosters[p.tid]) teamRosters[p.tid] = [];
        teamRosters[p.tid].push({ ...p, k2, rating2K: displayOvr, bbgmOvr: displayOvr, currentRating: r });
      });

      // Fetch staff data
      const staff = await getStaffData(data.players, teamObjMap);
      setStaffData(staff);

      const processedTeams = Object.keys(teamRosters).map(tid => {
        const ros = teamRosters[Number(tid)].sort((a, b) => b.rating2K - a.rating2K);
        const top12 = ros.slice(0, 12);
        
        // Calculate Star Gap based on BBGM Overall
        const sortedByBbgm = [...ros].sort((a, b) => b.bbgmOvr - a.bbgmOvr);
        const top1Ovr = sortedByBbgm[0]?.bbgmOvr || 50;
        const top2Ovr = sortedByBbgm[1]?.bbgmOvr || 50;
        const starGap = top1Ovr - top2Ovr;

        const avgK2 = { OS: [0,0,0,0,0,0], AT: [0,0,0,0,0,0,0], IS: [0,0,0,0,0,0,0,0], PL: [0,0,0,0,0], DF: [0,0,0,0,0,0,0], RB: [0,0] };
        
        ros.slice(0, 8).forEach(p => {
          Object.keys(avgK2).forEach(cat => {
            (p.k2 as any)[cat].forEach((val: number, i: number) => (avgK2 as any)[cat][i] += val / 8);
          });
        });

        const coachSliders = calculateCoachSliders(ros, Object.values(teamRosters));
        const fiveOutBonus = (coachSliders.prefInOut >= 90) ? 25 : 0;

        const highIQCount = sortedByBbgm.slice(0, 10).filter(p => p.currentRating.oiq > 70).length;
        
        const top7 = sortedByBbgm.slice(0, 7).map(p => p.currentRating);
        const isVersatile = top7.every(p => 
          p.oiq > 60 && 
          p.diq > 40 && 
          p.drb > 40 && 
          p.spd > 40
        ) && top7.filter(p => p.spd > 55 && p.tp > 45).length >= 4;

        const profs = getSystemProficiency(
          avgK2, 
          starGap, 
          sortedByBbgm[0]?.currentRating, 
          fiveOutBonus, 
          sortedByBbgm[1]?.currentRating, 
          highIQCount, 
          coachSliders.tempo, 
          isVersatile,
          coachSliders.prefOffDef
        );
        const sortedProfs = Object.entries(profs).sort((a, b) => b[1] - a[1]);

        const getFullName = (p: PlayerK2) => {
          if (p.name) return p.name;
          if (p.firstName && p.lastName) return `${p.firstName} ${p.lastName}`;
          return "Unknown Player";
        };

        return {
          tid,
          teamName: teamMap[Number(tid)],
          imgURL: teamObjMap.get(teamMap[Number(tid)].toLowerCase())?.imgURL,
          bestSystem: sortedProfs[0][0],
          avgK2,
          sortedProfs,
          top12,
          roster: ros,
          coachSliders,
          leadPlayer: { name: getFullName(sortedByBbgm[0]), pos: sortedByBbgm[0].pos }
        };
      });

      setTeams(processedTeams);
      if (processedTeams.length > 0) {
        setSelectedTeamId(Number(processedTeams[0].tid));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectedTeam = teams.find(t => t.tid === selectedTeamId);

  const handleSaveSystem = (teamId: string, systemName: string) => {
    setTeams(prevTeams => prevTeams.map(t => {
      if (Number(t.tid) === Number(teamId)) {
        return { ...t, bestSystem: systemName };
      }
      return t;
    }));
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-[#e6edf3] p-5">
      <div className="max-w-7xl mx-auto">
        {/* IMPORTANT: Remove this dropdown of team and team logo in the future.
            It will be connected directly to the whole team office UI in the header. */}
        <header className="flex items-center justify-between border-b border-[#30363d] pb-5 mb-5">
          <div className="flex items-center gap-2 md:gap-4">
            {selectedTeam && selectedTeam.imgURL && (
              <img src={selectedTeam.imgURL} alt={selectedTeam.teamName} className="w-10 h-10 md:w-12 md:h-12 object-contain" />
            )}
            {teams.length > 0 ? (
              <select 
                className="bg-[#1a1a1a] border border-gray-700 text-white font-bold text-lg md:text-xl py-1.5 md:py-2 px-3 md:px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#58a6ff] max-w-[200px] sm:max-w-[300px] md:max-w-none"
                value={selectedTeamId || ''}
                onChange={(e) => setSelectedTeamId(Number(e.target.value))}
              >
                {teams.sort((a, b) => a.teamName.localeCompare(b.teamName)).map(t => (
                  <option key={t.tid} value={t.tid}>{t.teamName}</option>
                ))}
              </select>
            ) : (
              <div className="text-xl font-bold text-gray-500">Loading Teams...</div>
            )}
          </div>
        </header>

        {loading && !selectedTeam && (
          <div className="text-center py-10 text-gray-400">Processing data...</div>
        )}

        {selectedTeam && (
          <CoachingView 
            team={selectedTeam} 
            allCoaches={allCoaches} 
            staffData={staffData} 
            onSaveSystem={handleSaveSystem}
          />
        )}
      </div>
    </div>
  );
}
