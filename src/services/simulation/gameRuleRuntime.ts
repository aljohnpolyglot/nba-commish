import type { NBAPlayer as Player } from '../../types';
import type { SimulatorKnobs } from './SimulatorKnobs';
import type {
  GameRuleConfig,
  GameTiebreaker,
  PlayerGameStats,
} from './types';

export const DEFAULT_GAME_RULES: GameRuleConfig = {
  dribbleRule: 'continuous',
  threePointLineEnabled: true,
  startOfPossessionMethod: 'jump_ball',
  possessionPattern: 'nba',
  coachChallenges: true,
  maxCoachChallenges: 2,
  challengeReimbursed: true,
  maxTimeouts: 7,
  clutchTimeoutLimit: 2,
  heaveRuleEnabled: false,
  shotClockEnabled: true,
  shotClockSeconds: 24,
  offensiveReboundResetSeconds: 14,
  backcourtTimerEnabled: true,
  backcourtTimerSeconds: 8,
  offensiveThreeSecondEnabled: true,
  offensiveThreeSecondSeconds: 3,
  defensiveThreeSecondEnabled: true,
  defensiveThreeSecondSeconds: 3,
  backToBasketTimerEnabled: false,
  backToBasketTimerSeconds: 5,
  inboundTimerEnabled: true,
  inboundTimerSeconds: 5,
  travelingEnabled: true,
  doubleDribbleEnabled: true,
  backcourtViolationEnabled: true,
  basketInterferenceEnabled: true,
  kickedBallEnabled: true,
  outOfBoundsEnabled: true,
  cornerThrowInEnabled: false,
  foulOutLimit: 6,
  teamFoulPenalty: 5,
  substitutionLimitEnabled: false,
  maxSubstitutions: 0,
  fieldGoalValue: 2,
  dunkValue: 2,
  freeThrowsEnabled: true,
  madeBasketRestart: 'inbound',
  teamFoulPenaltyMode: 'free_throws',
  teamFoulPenaltyPoints: 1,
  temporaryDisqualificationFoulLimit: 0,
  temporaryDisqualificationUntilNextScore: false,
  temporaryDisqualificationAllowsSubstitute: true,
  shootoutRounds: 3,
  overtimeTieBreaker: 'sudden_death',
  techEjectionLimit: 2,
  flagrant1EjectionLimit: 2,
  flagrant2EjectionLimit: 1,
  fightingInstantEjection: true,
  useYellowRedCards: false,
};

export function resolveGameRules(
  homeKnobs: SimulatorKnobs,
  awayKnobs: SimulatorKnobs,
): GameRuleConfig {
  return {
    ...DEFAULT_GAME_RULES,
    ...(awayKnobs.gameRules ?? {}),
    ...(homeKnobs.gameRules ?? {}),
  };
}

function latestThreeRating(player: Player | undefined): number {
  const ratings = player?.ratings ?? [];
  const latest = ratings[ratings.length - 1] as Record<string, unknown> | undefined;
  const raw = Number(latest?.tp ?? latest?.threePoint ?? latest?.three ?? 50);
  return Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 50));
}

function pickShootoutPlayer(
  stats: PlayerGameStats[],
  playersById: Map<string, Player>,
): { stat: PlayerGameStats; makeProbability: number } {
  const ranked = [...stats]
    .filter(stat => (stat.min ?? 0) > 0)
    .sort((a, b) => {
      const playerA = playersById.get(a.playerId);
      const playerB = playersById.get(b.playerId);
      const scoreA = latestThreeRating(playerA) + Math.min(20, (a.fga ?? 0) * 0.6);
      const scoreB = latestThreeRating(playerB) + Math.min(20, (b.fga ?? 0) * 0.6);
      return scoreB - scoreA;
    });
  const stat = ranked[0] ?? stats[0];
  if (!stat) {
    throw new Error('Shootout requires at least one eligible player per team');
  }
  const probability = 0.2 + latestThreeRating(playersById.get(stat.playerId)) * 0.006;
  return { stat, makeProbability: Math.max(0.2, Math.min(0.8, probability)) };
}

function takeShot(probability: number): number {
  return Math.random() < probability ? 1 : 0;
}

export function resolveShootout(
  homeStats: PlayerGameStats[],
  awayStats: PlayerGameStats[],
  players: Player[],
  configuredRounds: number,
): { winner: 'home' | 'away'; tiebreaker: GameTiebreaker } {
  const playersById = new Map(players.map(player => [player.internalId, player]));
  const home = pickShootoutPlayer(homeStats, playersById);
  const away = pickShootoutPlayer(awayStats, playersById);
  const rounds = Math.max(1, Math.round(configuredRounds || 3));
  let homeScore = 0;
  let awayScore = 0;

  for (let round = 0; round < rounds; round++) {
    homeScore += takeShot(home.makeProbability);
    awayScore += takeShot(away.makeProbability);
  }
  while (homeScore === awayScore) {
    homeScore += takeShot(home.makeProbability);
    awayScore += takeShot(away.makeProbability);
  }

  return {
    winner: homeScore > awayScore ? 'home' : 'away',
    tiebreaker: {
      type: 'shootout',
      rounds,
      homeScore,
      awayScore,
      homeShooterId: home.stat.playerId,
      awayShooterId: away.stat.playerId,
    },
  };
}
