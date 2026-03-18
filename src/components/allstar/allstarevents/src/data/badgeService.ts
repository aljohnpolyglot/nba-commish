/**
 * Mocking the badge loading service.
 */

export async function loadBadges(): Promise<void> {
  console.log("[DunkSim] Loading badges from gist...");
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log("[DunkSim] Badges loaded successfully.");
      resolve();
    }, 800);
  });
}

/**
 * Mocking getBadgeProb.
 */
export function getBadgeProb(playerName: string, badgeName: string, baseProb: number): number {
  // For the sandbox, we'll just return the base probability
  // In the real game, this would look up the player's badges
  return baseProb;
}
