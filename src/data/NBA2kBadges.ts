/**
 * NBA 2K Badge data fetcher — single source of truth for badge probabilities.
 * Fetched once from gist and cached for the session.
 * Consumed by: badgeService.ts (live game commentary), AllStarDunkContestSim.ts
 */

const GIST_URL = 'https://gist.githubusercontent.com/aljohnpolyglot/e7b25218056b74888b06b0f73e7104a9/raw';

let badgesData: any = null;
const playerMatchCache: Record<string, any> = {};

export async function loadBadges() {
  if (badgesData) return;
  console.log('[NBA2kBadges] Fetching badges from gist...');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(GIST_URL, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.error('[NBA2kBadges] HTTP error! status:', res.status);
      badgesData = {};
      return;
    }
    badgesData = await res.json();
    console.log('[NBA2kBadges] ✅ Badges loaded successfully!');
  } catch (e) {
    clearTimeout(timeoutId);
    console.error('[NBA2kBadges] ❌ Failed to load badges:', e);
    badgesData = {};
  }
}

function getPlayerBadges(rosterName: string) {
  if (!badgesData) return null;
  if (playerMatchCache[rosterName] !== undefined) return playerMatchCache[rosterName];

  const parts = rosterName.split(' ');
  const last = parts[parts.length - 1].toLowerCase();
  const firstInitial = parts[0][0].toLowerCase();

  let matched = null;
  for (const key in badgesData) {
    const pName = badgesData[key].name;
    if (rosterName === 'AJ Johnson' && pName === 'AJ Johnson') { matched = badgesData[key]; break; }
    if (rosterName === 'D. Schröder' && pName === 'Dennis Schroder') { matched = badgesData[key]; break; }

    const pParts = pName.split(' ');
    const pLast = pParts[pParts.length - 1].toLowerCase();
    const pFirstInitial = pParts[0][0].toLowerCase();

    if (pLast === last && pFirstInitial === firstInitial) {
      matched = badgesData[key];
      break;
    }
  }

  const result = matched ? matched.badges : null;
  playerMatchCache[rosterName] = result;
  return result;
}

export function getBadgeProb(playerName: string, badgeName: string, baseProb: number): number {
  const badges = getPlayerBadges(playerName);
  if (!badges) return 0;
  const level = badges[badgeName];
  if (level === 'HOF')    return baseProb * 1.5;
  if (level === 'Gold')   return baseProb * 1.2;
  if (level === 'Silver') return baseProb * 1.0;
  if (level === 'Bronze') return baseProb * 0.6;
  return 0;
}
