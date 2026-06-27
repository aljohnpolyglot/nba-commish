import type { NBAPlayer } from '../../types';
import { AllStarDunkContestSim } from '../allStar/AllStarDunkContestSim';
import { convertTo2KRating } from '../../utils/helpers';

type SkillKey = 'spd' | 'drb' | 'pss' | 'tp' | 'oiq';

export type ExternalAllStarContestProfile = {
  guardSkillsBoost?: number;
  centerDunkPenalty?: number;
  threePointRatingWeight?: number;
  threePointPctWeight?: number;
  threePointVolumeWeight?: number;
  overallWeight?: number;
  skillWeights?: Partial<Record<SkillKey, number>>;
  playerEligible?: (player: NBAPlayer) => boolean;
};

const DEFAULT_SKILL_WEIGHTS: Record<SkillKey, number> = {
  spd: 0.28,
  drb: 0.26,
  pss: 0.24,
  tp: 0.16,
  oiq: 0.06,
};

const DEFAULT_PROFILE: Required<Omit<ExternalAllStarContestProfile, 'playerEligible' | 'skillWeights'>> = {
  guardSkillsBoost: 3,
  centerDunkPenalty: 4,
  threePointRatingWeight: 0.62,
  threePointPctWeight: 34,
  threePointVolumeWeight: 2.4,
  overallWeight: 0.08,
};

const isGuard = (pos?: string) => pos === 'G' || pos === 'PG' || pos === 'SG';

const playerOvr = (player: NBAPlayer): number =>
  convertTo2KRating(
    player.overallRating ?? player.ratings?.[player.ratings.length - 1]?.ovr ?? 50,
    player.ratings?.[player.ratings.length - 1]?.hgt ?? 50,
    player.ratings?.[player.ratings.length - 1]?.tp,
  );

const latestRating = (player: NBAPlayer, key: string, fallback = 50): number => {
  const ratings = player.ratings?.[player.ratings.length - 1] as any;
  const value = Number(ratings?.[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
};

const aggregateSeasonStats = (player: NBAPlayer, season: number) => {
  const rows = (player.stats ?? []).filter((row: any) => !row.playoffs && (row.gp ?? 0) > 0);
  const currentRows = rows.filter((row: any) => row.season === season);
  const latestSeason = rows.length > 0 ? Math.max(...rows.map((row: any) => Number(row.season ?? 0))) : 0;
  const sourceRows = currentRows.length > 0
    ? currentRows
    : rows.filter((row: any) => row.season === latestSeason);
  return sourceRows.reduce((acc: any, row: any) => ({
    gp: acc.gp + (row.gp ?? 0),
    tp: acc.tp + (row.tp ?? 0),
    tpa: acc.tpa + (row.tpa ?? 0),
  }), { gp: 0, tp: 0, tpa: 0 });
};

const eligiblePlayers = (players: NBAPlayer[], profile?: ExternalAllStarContestProfile) =>
  profile?.playerEligible ? players.filter(profile.playerEligible) : players;

export const selectExternalDunkContestants = (
  players: NBAPlayer[],
  num: number,
  profile: ExternalAllStarContestProfile = {},
): NBAPlayer[] => {
  const centerPenalty = profile.centerDunkPenalty ?? DEFAULT_PROFILE.centerDunkPenalty;
  const pool = eligiblePlayers(players, profile);
  return [...pool]
    .sort((a, b) => {
      const scoreA = AllStarDunkContestSim.calcComposite(a as any) - (a.pos === 'C' ? centerPenalty : 0);
      const scoreB = AllStarDunkContestSim.calcComposite(b as any) - (b.pos === 'C' ? centerPenalty : 0);
      return scoreB - scoreA || playerOvr(b) - playerOvr(a);
    })
    .slice(0, Math.min(num, pool.length));
};

export const selectExternalThreePointContestants = (
  players: NBAPlayer[],
  season: number,
  num: number,
  profile: ExternalAllStarContestProfile = {},
): NBAPlayer[] => {
  const pool = eligiblePlayers(players, profile);
  const ratingWeight = profile.threePointRatingWeight ?? DEFAULT_PROFILE.threePointRatingWeight;
  const pctWeight = profile.threePointPctWeight ?? DEFAULT_PROFILE.threePointPctWeight;
  const volumeWeight = profile.threePointVolumeWeight ?? DEFAULT_PROFILE.threePointVolumeWeight;
  const overallWeight = profile.overallWeight ?? DEFAULT_PROFILE.overallWeight;
  return [...pool]
    .sort((a, b) => {
      const statA = aggregateSeasonStats(a, season);
      const statB = aggregateSeasonStats(b, season);
      const pctA = statA.tpa > 0 ? statA.tp / statA.tpa : 0.34;
      const pctB = statB.tpa > 0 ? statB.tp / statB.tpa : 0.34;
      const volumeA = statA.gp > 0 ? statA.tpa / statA.gp : 0;
      const volumeB = statB.gp > 0 ? statB.tpa / statB.gp : 0;
      const scoreA = latestRating(a, 'tp') * ratingWeight + pctA * pctWeight + volumeA * volumeWeight + playerOvr(a) * overallWeight;
      const scoreB = latestRating(b, 'tp') * ratingWeight + pctB * pctWeight + volumeB * volumeWeight + playerOvr(b) * overallWeight;
      return scoreB - scoreA;
    })
    .slice(0, Math.min(num, pool.length));
};

export const selectExternalSkillsContestants = (
  players: NBAPlayer[],
  num: number,
  profile: ExternalAllStarContestProfile = {},
): NBAPlayer[] => {
  const pool = eligiblePlayers(players, profile);
  const weights: Record<SkillKey, number> = { ...DEFAULT_SKILL_WEIGHTS, ...(profile.skillWeights ?? {}) };
  const guardBoost = profile.guardSkillsBoost ?? DEFAULT_PROFILE.guardSkillsBoost;
  return [...pool]
    .sort((a, b) => {
      const score = (player: NBAPlayer) =>
        latestRating(player, 'spd') * weights.spd +
        latestRating(player, 'drb') * weights.drb +
        latestRating(player, 'pss') * weights.pss +
        latestRating(player, 'tp') * weights.tp +
        latestRating(player, 'oiq') * weights.oiq +
        (isGuard(player.pos) ? guardBoost : 0);
      return score(b) - score(a) || playerOvr(b) - playerOvr(a);
    })
    .slice(0, Math.min(num, pool.length));
};
