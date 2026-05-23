import type { NBAGMStat, NBAPlayer, NBATeam } from '../../types';

export interface AwardCandidate {
  player: NBAPlayer;
  team: NBATeam;
  score: number;
  odds: string;
  stats: NBAGMStat;
}

export interface CoachCandidate {
  coachName: string;
  team: NBATeam;
  score: number;
  odds: string;
  wins: number;
  losses: number;
  improvement: number;
}

export interface AllNBASpot {
  player: NBAPlayer;
  team: NBATeam;
  pos: string;
  score: number;
  stats: NBAGMStat;
}

export interface AllNBATeams {
  allNBA: [AllNBASpot[], AllNBASpot[], AllNBASpot[]];
  allDefense: [AllNBASpot[], AllNBASpot[]];
  allRookie: [AllNBASpot[], AllNBASpot[]];
}

export interface AwardRaces {
  mvp: AwardCandidate[];
  dpoy: AwardCandidate[];
  roty: AwardCandidate[];
  smoy: AwardCandidate[];
  mip: AwardCandidate[];
  coy: CoachCandidate[];
  allNBATeams: AllNBATeams;
}

export const getTrb = (stat: any) => stat.trb || stat.reb || (stat.orb || 0) + (stat.drb || 0);

export function getBestStat(stats: NBAGMStat[] | undefined, season: number) {
  if (!stats) return undefined;
  const trySeasons = [season, season - 1];
  for (const candidateSeason of trySeasons) {
    const seasonStats = stats.filter((stat) => stat.season === candidateSeason && !stat.playoffs);
    if (seasonStats.length > 0) {
      return seasonStats.reduce((prev, current) => (prev.gp >= current.gp ? prev : current));
    }
  }
  return undefined;
}

export function assignCoachOdds(candidates: CoachCandidate[]): CoachCandidate[] {
  if (candidates.length === 0) return [];
  const maxScore = candidates[0].score;
  if (maxScore <= 0 || isNaN(maxScore)) return candidates;
  return candidates.map((candidate, index) => {
    const odds = index === 0
      ? `-${Math.round(110 + (candidate.score / maxScore) * 40)}`
      : `+${Math.round(100 + ((maxScore / (candidate.score || 1)) - 1) * 2000)}`;
    return { ...candidate, odds };
  });
}

export function assignOdds(candidates: AwardCandidate[]): AwardCandidate[] {
  if (candidates.length === 0) return [];
  const maxScore = candidates[0].score;
  if (maxScore <= 0 || isNaN(maxScore)) return candidates;
  return candidates.map((candidate, index) => {
    const odds = index === 0
      ? `-${Math.round(110 + (candidate.score / maxScore) * 40)}`
      : `+${Math.round(100 + ((maxScore / (candidate.score || 1)) - 1) * 2000)}`;
    return { ...candidate, odds };
  });
}
