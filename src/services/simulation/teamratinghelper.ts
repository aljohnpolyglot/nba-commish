import { NBAPlayer as Player } from '../../types';

export interface TeamRatings {
  offRating: number;  // 85–120 range (NBA off rtg scale)
  defRating: number;  // 85–120 range (lower = better defense)
  pace:      number;  // 95–108 possessions per game
}

// Weights which player attributes contribute to team offense/defense/pace
export function calcTeamRatings(teamId: number, players: Player[], season: number = 2025): TeamRatings {
  const roster = players.filter(p => p.tid === teamId && p.status === 'Active');
  if (roster.length === 0) return { offRating: 110, defRating: 110, pace: 100 };

  // Use top 8 by overallRating (rotation players matter most)
  const rotation = [...roster]
    .sort((a, b) => b.overallRating - a.overallRating)
    .slice(0, 8);

  const avg = (key: string) => {
    const vals = rotation.map(p => {
      const r = p.ratings.find(r => r.season === season) ?? p.ratings[p.ratings.length - 1];
      return ((r as any)?.[key] ?? 50) as number;
    });
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  // Offensive rating: driven by scoring ability, playmaking, efficiency
  const offScore =
    avg('oiq') * 0.28 +
    avg('fg')  * 0.18 +
    avg('tp')  * 0.14 +
    avg('ins') * 0.14 +
    avg('pss') * 0.14 +
    avg('dnk') * 0.12;
  // Scale 0-100 attribute avg → 100-120 offensive rating range
  const offRating = 100 + (offScore / 100) * 20;

  // Defensive rating: driven by IQ, height, speed, rebounding
  const defScore =
    avg('diq') * 0.35 +
    avg('hgt') * 0.25 +
    avg('spd') * 0.20 +
    avg('reb') * 0.20;
  // Scale → 100-120 (lower = better, so invert: good defense = low defRating)
  // 100 = elite defense, 120 = terrible defense
  const defRating = 120 - (defScore / 100) * 20;

  // Pace: athletic, guard-heavy, high-oiq teams play faster
  const paceScore =
    avg('spd') * 0.40 +
    avg('oiq') * 0.35 +
    avg('drb') * 0.25;
  const pace = 95 + (paceScore / 100) * 13;

  return { offRating, defRating, pace };
}

// Expected points for Team A against Team B's defense
// Formula mirrors real NBA: pts = (offRating + oppDefRating) / 2, pace-adjusted
export function expectedTeamScore(offRating: number, oppDefRating: number, pace: number): number {
  // Differential: elite offense vs elite defense cancel out at ~110 base
  const basePts = 110 + (offRating - 110) * 0.6 - (oppDefRating - 110) * 0.4;
  return basePts * (pace / 100);
}