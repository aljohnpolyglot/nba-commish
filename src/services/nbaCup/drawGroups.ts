import { NBATeam, NBACupGroup } from '../../types';
import { seededRandom, seededShuffle } from './seededRandom';

export interface PrevStanding {
  tid: number;
  wins: number;
  losses: number;
}

/**
 * Draws Cup groups for a season.
 * Algorithm (mirrors real NBA):
 *   1. Split 30 teams into East (15) and West (15).
 *   2. Rank by prior-season wins (desc). Year-0 fallback: use avg BBGM OVR.
 *   3. Form 5 tiers of 3 teams each within each conference.
 *   4. Snake-assign with seeded RNG: each of 3 groups gets exactly 1 team per tier.
 */
export function drawCupGroups(
  teams: NBATeam[],
  prevStandings: PrevStanding[],
  saveId: string,
  cupYear: number,
): NBACupGroup[] {
  const seed = `cup_draw_${saveId}_${cupYear}`;

  const east = teams.filter(t => t.conference === 'East');
  const west = teams.filter(t => t.conference === 'West');

  return [
    ...assignConference(east, prevStandings, 'East', seed),
    ...assignConference(west, prevStandings, 'West', seed),
  ];
}

type Conf = 'East' | 'West';
type GroupSuffix = 'A' | 'B' | 'C';

function assignConference(
  confTeams: NBATeam[],
  prevStandings: PrevStanding[],
  conf: Conf,
  baseSeed: string,
): NBACupGroup[] {
  // Sort by prior wins desc; year-0 fallback sorts by overallRating desc
  const ranked = [...confTeams].sort((a, b) => {
    const wa = prevStandings.find(s => s.tid === a.id)?.wins ?? a.strength ?? 50;
    const wb = prevStandings.find(s => s.tid === b.id)?.wins ?? b.strength ?? 50;
    return wb - wa;
  });

  // 5 tiers × 3 teams each
  const tiers: NBATeam[][] = [];
  for (let t = 0; t < 5; t++) {
    tiers.push(ranked.slice(t * 3, t * 3 + 3));
  }

  // 3 groups, each starting empty
  const groupTeamIds: number[][] = [[], [], []];

  for (let t = 0; t < 5; t++) {
    const shuffled = seededShuffle(tiers[t], `${baseSeed}_${conf}_tier${t}`);
    for (let g = 0; g < 3; g++) {
      groupTeamIds[g].push(shuffled[g].id);
    }
  }

  const suffixes: GroupSuffix[] = ['A', 'B', 'C'];
  return groupTeamIds.map((teamIds, idx) => ({
    id: `${conf}-${suffixes[idx]}` as NBACupGroup['id'],
    conference: conf,
    teamIds,
    standings: teamIds.map(tid => ({ tid, w: 0, l: 0, pf: 0, pa: 0, pd: 0, gp: 0 })),
  }));
}
