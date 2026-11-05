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

export const wasAllStarBeforeSeason = (player: NBAPlayer, season: number): boolean =>
  player.awards?.some(award => award.type === 'All-Star' && Number(award.season) < season) ?? false;

export function getLeagueDefensiveRating(players: NBAPlayer[], season: number): number | undefined {
  const rows = players.flatMap(player => player.stats?.filter(stat => (
    stat.season === season && !stat.playoffs && Number(stat.drtg) > 0 && Number(stat.min) > 0
  )) ?? []);
  const minutes = rows.reduce((sum, stat) => sum + Number(stat.min ?? 0), 0);
  return minutes > 0
    ? rows.reduce((sum, stat) => sum + Number(stat.drtg) * Number(stat.min ?? 0), 0) / minutes
    : undefined;
}

export function getDpoyScore(
  stat: NBAGMStat,
  diq: number,
  winPct: number,
  leagueDrtg?: number,
): number {
  const gp = Math.max(1, Number(stat.gp ?? 0));
  const rpg = getTrb(stat) / gp;
  const stocks = (Number(stat.stl ?? 0) + Number(stat.blk ?? 0)) / gp;
  const dbpm = Number(stat.dbpm);
  const dwsPerGame = Number(stat.dws) / gp;
  const drtg = Number(stat.drtg);
  const advancedImpact = Number.isFinite(dbpm) && dbpm !== 0 ? Math.max(-3, Math.min(8, dbpm)) * 2.2 : 0;
  const defensiveWins = Number.isFinite(dwsPerGame) ? Math.max(-0.05, Math.min(0.3, dwsPerGame)) * 8 : 0;
  const ratingImpact = leagueDrtg && Number.isFinite(drtg) && drtg > 0
    ? Math.max(-8, Math.min(8, leagueDrtg - drtg)) * 0.3
    : 0;
  const boxImpact = stocks * 1.2 + rpg * 0.12;
  const iqContext = Math.max(-15, Math.min(35, diq - 50)) * 0.025;
  return advancedImpact + defensiveWins + ratingImpact + boxImpact + winPct * 2 + iqContext;
}

export function getMipScore(current: NBAGMStat, previous: NBAGMStat): number | null {
  if ((previous.gp ?? 0) < 20) return null;
  const currentPpg = current.pts / Math.max(1, current.gp);
  const previousPpg = previous.pts / Math.max(1, previous.gp);
  const ppgJump = currentPpg - previousPpg;
  if (ppgJump < 2) return null;
  return ppgJump * 4 + (currentPpg - 14) * 0.3;
}

export function getExactStat(stats: NBAGMStat[] | undefined, season: number) {
  const seasonStats = stats?.filter(stat => stat.season === season && !stat.playoffs) ?? [];
  return seasonStats.reduce<NBAGMStat | undefined>(
    (best, current) => !best || current.gp > best.gp ? current : best,
    undefined,
  );
}

export function getBestStat(stats: NBAGMStat[] | undefined, season: number) {
  if (!stats) return undefined;
  const trySeasons = [season, season - 1];
  for (const candidateSeason of trySeasons) {
    const stat = getExactStat(stats, candidateSeason);
    if (stat) return stat;
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
