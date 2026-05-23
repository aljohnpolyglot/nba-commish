import { getBadgeProb } from './badgeService';
import { pick, TV } from './genericCommentary';

export function generateFoulOutNarrative(player: any): string {
  return pick([
    `${player.n} has fouled out! Six fouls and his night is done.`,
    `That's six on ${player.n} — he'll have to watch the rest from the bench.`,
    `${player.n} is gone! Fouled out at the worst possible time.`,
    `Foul number six on ${player.n} — the coach can't believe it.`,
    `${player.n} picks up his sixth and that's all she wrote.`,
    `Unbelievable — ${player.n} fouls out with time still on the clock!`,
  ]);
}

export function generatePenaltyNarrative(
  foulingPlayer: any,
  shootingPlayer: any,
  teamFouls: number,
  isFirstPenaltyFoul: boolean
): string {
  if (isFirstPenaltyFoul) {
    return pick([
      `Foul number ${teamFouls} — the team is in the BONUS! ${shootingPlayer.n} heads to the line.`,
      `${teamFouls} team fouls — the bonus is in effect, ${shootingPlayer.n} shoots two.`,
      `They're in the penalty now — every foul means free throws from here on out.`,
    ]);
  }
  return pick([
    `${foulingPlayer.n} with the foul — that's the bonus! Free throws coming.`,
    `Team foul number ${teamFouls} sends ${shootingPlayer.n} to the stripe.`,
    `Foul on ${foulingPlayer.n}, stopping the clock. ${shootingPlayer.n} shoots two.`,
  ]);
}

export function generateIntentionalFoulNarrative(
  foulingPlayer: any,
  victim: any
): string {
  return pick([
    `Intentional or not, ${foulingPlayer.n} sends ${victim.n} to the line with time winding down.`,
    `Foul on ${foulingPlayer.n}, stopping the clock. ${victim.n} shoots two.`,
    `${foulingPlayer.n} has to foul — ${victim.n} goes to the line.`,
    `${foulingPlayer.n} reaches in — no choice but to send ${victim.n} to the stripe.`,
    `Deliberate foul by ${foulingPlayer.n} to stop the clock.`,
  ]);
}

export function generateBonusFTNarrative(
  player: any,
  isMake: boolean,
  isLast: boolean,
  exclude?: string
): string {
  let options: string[] = [];
  if (isMake && isLast) {
    options = [
      `${player.n} free throw GOOD — bonus points.`,
      `${player.n} free throw GOOD — clean stroke under pressure.`,
      `${player.n} free throw GOOD — ice water from the stripe.`,
      `${player.n} free throw GOOD — automatic.`,
    ];
  } else if (isMake && !isLast) {
    options = [
      `${player.n} free throw GOOD — one more.`,
      `${player.n} free throw GOOD.`,
      `${player.n} free throw GOOD — halfway there.`,
    ];
  } else if (!isMake && isLast) {
    options = [
      `${player.n} free throw MISSED — huge miss in the bonus!`,
      `${player.n} free throw MISSED — rims out, the defense will take that.`,
      `${player.n} free throw MISSED — leaves a point on the board.`,
    ];
  } else {
    options = [
      `${player.n} free throw MISSED — has to make the next one.`,
      `${player.n} free throw MISSED.`,
      `${player.n} free throw MISSED — off the front of the rim.`,
    ];
  }
  let chosen = pick(options);
  if (exclude && chosen === exclude && options.length > 1) {
    let alt = pick(options);
    while (alt === exclude) alt = pick(options);
    chosen = alt;
  }
  return chosen;
}

export function generateBlockNarrative(blocker: any, shooter: any) {
  if (Math.random() < getBadgeProb(blocker.n, 'Paint Patroller', 0.3)) {
    return `${blocker.n} swats it into the third row — shot rejection by the Paint Patroller!`;
  }
  if (Math.random() < getBadgeProb(blocker.n, 'Pogo Stick', 0.2)) {
    return `${blocker.n} rises for a second time and blocks ${shooter.n}!`;
  }
  return `${shooter.n} is blocked by ${blocker.n}!`;
}

export function generateReboundNarrative(rebounder: any, isOffReb: boolean, isRecovered: boolean) {
  if (isRecovered) return `${rebounder.n} recovers the loose ball.`;
  if (isOffReb) {
    if (Math.random() < getBadgeProb(rebounder.n, 'Aerial Wizard', 0.2)) {
      return `${rebounder.n} skies for the putback slam! (Off. board)`;
    }
    if (Math.random() < getBadgeProb(rebounder.n, 'Boxout Beast', 0.3)) {
      return `${rebounder.n} muscles for position — offensive board!`;
    }
    if (Math.random() < getBadgeProb(rebounder.n, 'Rebound Chaser', 0.2)) {
      return `${rebounder.n} sprints in for the offensive board.`;
    }
    return `${rebounder.n} offensive board.`;
  }
  if (Math.random() < getBadgeProb(rebounder.n, 'Rebound Chaser', 0.3)) {
    return `${rebounder.n} tracks it down — def. rebound.`;
  }
  if (Math.random() < getBadgeProb(rebounder.n, 'Boxout Beast', 0.2)) {
    return `${rebounder.n} boxes out perfectly — def. rebound.`;
  }
  return `${rebounder.n} def. rebound.`;
}

export function generateTovNarrative(handler: any, stealer: any) {
  if (stealer) {
    if (Math.random() < getBadgeProb(stealer.n, 'Glove', 0.3)) {
      return `${stealer.n} slaps it away — pickpocket by the Glove!`;
    }
    if (Math.random() < getBadgeProb(stealer.n, 'Interceptor', 0.3)) {
      return `${stealer.n} reads the pass perfectly and jumps the lane for the steal!`;
    }
    if (Math.random() < getBadgeProb(stealer.n, 'On-Ball Menace', 0.2)) {
      return `${stealer.n} harasses ${handler.n} into a bad turnover!`;
    }
    return `${handler.n} turns it over — stolen by ${stealer.n}.`;
  }
  if (Math.random() < getBadgeProb(handler.n, 'Unpluckable', 0.15)) {
    return `${handler.n} ${pick(TV)} — not a steal, just a bad decision.`;
  }
  return `${handler.n} ${pick(TV)}.`;
}
