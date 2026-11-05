import type { GameRuleConfig } from '../../types';
import type {
  Possession,
  PossessionChallenge,
  TeamId,
} from './possessionTypes';

type ReviewType = 'foul' | 'out_of_bounds' | 'interference';

interface ReviewSample {
  successful: number;
  total: number;
}

const CHALLENGE_RESULTS: Record<number | 'ot' | 'overall', Record<ReviewType, ReviewSample>> = {
  1: {
    foul: { successful: 89, total: 130 },
    out_of_bounds: { successful: 61, total: 78 },
    interference: { successful: 4, total: 9 },
  },
  2: {
    foul: { successful: 175, total: 288 },
    out_of_bounds: { successful: 99, total: 121 },
    interference: { successful: 6, total: 12 },
  },
  3: {
    foul: { successful: 192, total: 313 },
    out_of_bounds: { successful: 132, total: 181 },
    interference: { successful: 10, total: 16 },
  },
  4: {
    foul: { successful: 211, total: 429 },
    out_of_bounds: { successful: 150, total: 199 },
    interference: { successful: 6, total: 8 },
  },
  ot: {
    foul: { successful: 6, total: 12 },
    out_of_bounds: { successful: 5, total: 7 },
    interference: { successful: 0, total: 0 },
  },
  overall: {
    foul: { successful: 673, total: 1172 },
    out_of_bounds: { successful: 447, total: 586 },
    interference: { successful: 26, total: 45 },
  },
};

function otherTeam(team: TeamId): TeamId {
  return team === 'HOME' ? 'AWAY' : 'HOME';
}

function teamRuling(team: TeamId): string {
  return `${team === 'HOME' ? 'Home' : 'Away'} Team Ball`;
}

function getReviewType(possession: Possession): ReviewType | undefined {
  if (possession.outcome === 'FOUL_TRIP' && possession.fouler) return 'foul';
  if (possession.turnoverCall === 'out_of_bounds' && possession.handler) return 'out_of_bounds';
  if (possession.basketInterference && possession.scorer) return 'interference';
  return undefined;
}

function getChallengeTeam(
  possession: Possession,
  type: ReviewType,
  initialFoulCall?: string,
): TeamId | undefined {
  if (type === 'foul') {
    return initialFoulCall === 'Offensive Foul'
      ? possession.victim?.tm
      : possession.fouler?.tm;
  }
  if (type === 'out_of_bounds') return possession.handler?.tm;
  return possession.scorer?.tm;
}

function triggerChance(type: ReviewType, quarter: number, regulationPeriods: number): number {
  const base = type === 'foul' ? 0.032 : type === 'out_of_bounds' ? 0.38 : 0.04;
  const periodMultiplier = quarter > regulationPeriods
    ? 1.5
    : quarter === regulationPeriods
      ? 1.3
      : quarter === 1
        ? 0.7
        : 1;
  return Math.min(0.8, base * periodMultiplier);
}

function foulInitialCall(): string {
  const roll = Math.random();
  if (roll < 0.68) return 'Defensive Foul';
  if (roll < 0.88) return 'Offensive Foul';
  return 'Loose Ball Foul';
}

function overturnRate(type: ReviewType, quarter: number, regulationPeriods: number): number {
  const period = quarter > regulationPeriods ? CHALLENGE_RESULTS.ot : CHALLENGE_RESULTS[quarter];
  const sample = period?.[type];
  const fallback = CHALLENGE_RESULTS.overall[type];
  return sample && sample.total > 0
    ? sample.successful / sample.total
    : fallback.successful / fallback.total;
}

function buildChallenge(
  possession: Possession,
  type: ReviewType,
  team: TeamId,
  successful: boolean,
  reimbursed: boolean,
  remaining: number,
  initialFoulCall?: string,
): PossessionChallenge {
  if (type === 'out_of_bounds') {
    const initialCall = teamRuling(otherTeam(team));
    return {
      team,
      trigger: 'Challenge OOB',
      initialCall,
      finalRuling: successful ? 'Overturned' : 'Stands',
      rulingDescription: successful ? teamRuling(team) : initialCall,
      successful,
      reimbursed,
      remaining,
    };
  }

  if (type === 'interference') {
    const initialCall = 'Goaltending/Basket Interference';
    return {
      team,
      trigger: 'Challenge Goaltending/Basket Interference',
      initialCall,
      finalRuling: successful ? 'Overturned' : 'Stands',
      rulingDescription: successful
        ? `No Goaltending/Basket Interference - ${teamRuling(team)}`
        : initialCall,
      successful,
      reimbursed,
      remaining,
    };
  }

  const initialCall = initialFoulCall ?? 'Defensive Foul';
  const overturnedDescription = initialCall === 'Offensive Foul'
    ? 'Defensive Foul'
    : initialCall === 'Loose Ball Foul'
      ? `Inadvertent Whistle - ${teamRuling(team)}`
      : Math.random() < 0.18
        ? 'Inadvertent Whistle - No Possession (Jump Ball)'
        : `Inadvertent Whistle - ${teamRuling(team)}`;
  return {
    team,
    trigger: 'Challenge of Called Foul',
    initialCall,
    finalRuling: successful ? 'Overturned' : 'Stands',
    rulingDescription: successful ? overturnedDescription : initialCall,
    successful,
    reimbursed,
    remaining,
  };
}

export function stampCoachChallenges(
  possessions: Possession[],
  rules: GameRuleConfig,
  regulationPeriods: number,
): void {
  const maximum = Math.max(0, Math.round(rules.maxCoachChallenges));
  if (!rules.coachChallenges || maximum === 0) return;

  const remaining: Record<TeamId, number> = { HOME: maximum, AWAY: maximum };
  for (const possession of possessions) {
    const type = getReviewType(possession);
    if (!type) continue;
    const initialFoulCall = type === 'foul' ? foulInitialCall() : undefined;
    const team = getChallengeTeam(possession, type, initialFoulCall);
    if (!team || remaining[team] <= 0) continue;
    if (Math.random() >= triggerChance(type, possession.quarter, regulationPeriods)) continue;

    const successful = Math.random() < overturnRate(type, possession.quarter, regulationPeriods);
    const reimbursed = successful && rules.challengeReimbursed;
    if (!reimbursed) remaining[team]--;
    possession.challenge = buildChallenge(
      possession,
      type,
      team,
      successful,
      reimbursed,
      remaining[team],
      initialFoulCall,
    );
  }
}
