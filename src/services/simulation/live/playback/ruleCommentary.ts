import type { GameRuleConfig } from '../../types';
import type { Possession } from './possessionTypes';

interface WeightedCall {
  call: NonNullable<Possession['turnoverCall']>;
  weight: number;
}

function chooseCall(calls: WeightedCall[]): WeightedCall['call'] | undefined {
  const total = calls.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return undefined;
  let roll = Math.random() * total;
  for (const entry of calls) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.call;
  }
  return calls[calls.length - 1]?.call;
}

function inverseTimerWeight(seconds: number, standardSeconds: number): number {
  return Math.max(0.35, Math.min(4, standardSeconds / Math.max(1, seconds)));
}

export function stampRuleCommentary(
  possessions: Possession[],
  rules: GameRuleConfig,
): void {
  const turnoverCalls: WeightedCall[] = [
    ...(rules.shotClockEnabled
      ? [{ call: 'shot_clock' as const, weight: inverseTimerWeight(rules.shotClockSeconds, 24) }]
      : []),
    ...(rules.inboundTimerEnabled
      ? [{ call: 'inbound' as const, weight: inverseTimerWeight(rules.inboundTimerSeconds, 5) }]
      : []),
    ...(rules.travelingEnabled ? [{ call: 'traveling' as const, weight: 1.2 }] : []),
    ...(rules.doubleDribbleEnabled ? [{ call: 'double_dribble' as const, weight: 0.8 }] : []),
    ...(rules.backcourtViolationEnabled && rules.backcourtTimerEnabled
      ? [{ call: 'backcourt' as const, weight: inverseTimerWeight(rules.backcourtTimerSeconds, 8) }]
      : []),
    ...(rules.offensiveThreeSecondEnabled
      ? [{ call: 'offensive_three_seconds' as const, weight: inverseTimerWeight(rules.offensiveThreeSecondSeconds, 3) * 0.75 }]
      : []),
    ...(rules.backToBasketTimerEnabled
      ? [{ call: 'back_to_basket' as const, weight: inverseTimerWeight(rules.backToBasketTimerSeconds, 5) * 0.65 }]
      : []),
    ...(rules.outOfBoundsEnabled ? [{ call: 'out_of_bounds' as const, weight: 1.1 }] : []),
    ...(rules.kickedBallEnabled ? [{ call: 'kicked_ball' as const, weight: 0.45 }] : []),
  ];

  for (const possession of possessions) {
    if (possession.outcome === 'TOV' && !possession.stealer) {
      possession.turnoverCall = chooseCall(turnoverCalls);
      if (possession.turnoverCall === 'shot_clock') possession.callTimerSeconds = rules.shotClockSeconds;
      if (possession.turnoverCall === 'inbound') possession.callTimerSeconds = rules.inboundTimerSeconds;
      if (possession.turnoverCall === 'backcourt') possession.callTimerSeconds = rules.backcourtTimerSeconds;
      if (possession.turnoverCall === 'offensive_three_seconds') possession.callTimerSeconds = rules.offensiveThreeSecondSeconds;
      if (possession.turnoverCall === 'back_to_basket') possession.callTimerSeconds = rules.backToBasketTimerSeconds;
      if (
        possession.turnoverCall === 'out_of_bounds'
        && rules.cornerThrowInEnabled
        && Math.random() < 0.55
      ) {
        possession.restartLocation = 'corner';
      }
    }

    if (
      rules.basketInterferenceEnabled
      && possession.outcome.startsWith('MISS_')
      && Math.random() < 0.025
    ) {
      possession.basketInterference = true;
      possession.blocker = undefined;
    }

    if (possession.isOffReb && rules.shotClockEnabled) {
      possession.shotClockResetSeconds = rules.offensiveReboundResetSeconds;
    }
  }
}
