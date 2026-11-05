import type { RefereeData } from '../../data/photos/referees';
import type { GameState } from '../../types';

export type RigGameOfferOutcome = 'declined' | 'failed' | 'success';

export interface RigGameSettlement {
  attemptKey: string;
  gameId: number;
  season: number;
  gameDate: string;
  refereeId: string;
  refereeName: string;
  favoredTid: number;
  quotedAmountMillion: number;
  chargedAmountMillion: number;
  outcome: RigGameOfferOutcome;
  message: string;
}

export interface RigGameOffer {
  eligible: boolean;
  canAfford: boolean;
  error?: string;
  settlement?: RigGameSettlement;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const numberFrom = (record: Record<string, unknown> | undefined, key: string, fallback: number): number => {
  const value = Number(record?.[key]);
  return Number.isFinite(value) ? value : fallback;
};

const stableRoll = (seed: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
};

export const getRigGameAttemptKey = (state: GameState, gameId: number): string =>
  `${state.saveId ?? 'unsaved'}:${state.leagueStats.year}:${gameId}`;

export function resolveRigGameOffer(
  state: GameState,
  gameId: number,
  referee: RefereeData | undefined,
  favoredTid: number,
): RigGameOffer {
  if (state.gameMode !== 'commissioner' || state.leagueType !== 'fictional') {
    return { eligible: false, canAfford: false, error: 'This option is available only in fictional Commissioner careers.' };
  }

  const game = state.schedule.find(candidate => candidate.gid === gameId);
  if (!game || game.played) {
    return { eligible: false, canAfford: false, error: 'This game is no longer available.' };
  }
  if (favoredTid !== game.homeTid && favoredTid !== game.awayTid) {
    return { eligible: false, canAfford: false, error: 'Select a team from this matchup.' };
  }
  if (!referee?.isFictional || !referee.riggingProfile) {
    return { eligible: false, canAfford: false, error: 'Select an eligible fictional official.' };
  }

  const attemptKey = getRigGameAttemptKey(state, gameId);
  const existing = state.rigGameSettlements?.[attemptKey];
  if (existing) {
    return { eligible: true, canAfford: true, settlement: existing };
  }

  const profile = referee.riggingProfile;
  const ratings = referee.ratings as Record<string, unknown> | undefined;
  const multiplier = numberFrom(
    profile,
    'minimumOfferMultiplier',
    numberFrom(profile, 'bribeThresholdMultiplier', 2),
  );
  const quotedAmountMillion = Number((0.04 * clamp(multiplier, 1, 4)).toFixed(4));
  const canAfford = state.stats.personalWealth >= quotedAmountMillion;
  if (!canAfford) {
    return {
      eligible: true,
      canAfford: false,
      error: 'You do not have enough personal cash for this offer.',
    };
  }

  const greed = numberFrom(profile, 'greed', 50);
  const resistance = numberFrom(profile, 'corruptionResistance', 70);
  const integrity = numberFrom(ratings, 'integrity', 70);
  const discretion = numberFrom(ratings, 'discretion', 50);
  const leakRisk = numberFrom(profile, 'leakRisk', 50);
  const reportLikelihood = numberFrom(profile, 'reportLikelihood', 50);
  const acceptsDirectApproach = profile.acceptsDirectApproach === true;
  const requiresIntermediary = profile.requiresIntermediary === true;
  const approachAdjustment = acceptsDirectApproach ? 8 : requiresIntermediary ? 0 : -15;
  const acceptanceChance = clamp(
    Math.round(55 + greed * 0.35 - resistance * 0.45 - integrity * 0.25 + approachAdjustment),
    5,
    80,
  );
  const seed = `${attemptKey}:${referee.id}:${favoredTid}`;
  const accepted = stableRoll(`${seed}:accept`) < acceptanceChance;
  const executionChance = clamp(
    Math.round(72 + discretion * 0.15 - leakRisk * 0.2 - reportLikelihood * 0.1),
    45,
    92,
  );
  const outcome: RigGameOfferOutcome = !accepted
    ? 'declined'
    : stableRoll(`${seed}:execute`) < executionChance
      ? 'success'
      : 'failed';
  const chargedAmountMillion = outcome === 'declined' ? 0 : quotedAmountMillion;
  const message = outcome === 'success'
    ? `${referee.name} accepted the offer. The selected result will be enforced.`
    : outcome === 'failed'
      ? `${referee.name} accepted the payment, but the game was not altered.`
      : `${referee.name} refused the approach. No money changed hands.`;

  return {
    eligible: true,
    canAfford,
    settlement: {
      attemptKey,
      gameId,
      season: state.leagueStats.year,
      gameDate: state.date,
      refereeId: referee.id,
      refereeName: referee.name,
      favoredTid,
      quotedAmountMillion,
      chargedAmountMillion,
      outcome,
      message,
    },
  };
}
