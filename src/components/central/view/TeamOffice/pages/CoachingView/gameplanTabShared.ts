import { addDays, format } from 'date-fns';
import { reconcileIdealMinutes } from '../../../../../../store/idealRotationStore';
import { StarterService } from '../../../../../../services/simulation/StarterService';
import { injurySeverityLevel } from '../../../../../../services/simulation/playThroughInjuriesFactor';
import type { NBAPlayer } from '../../../../../../types';
import { getDisplayOverall } from '../../../../../../utils/playerRatings';
import { isOnRoster } from '../../../../../../utils/teamLookup';

export const STARTER_POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

export function getK2(player: NBAPlayer): number {
  return getDisplayOverall(player);
}

export function isInjured(player: NBAPlayer, ptiLevel = 0): boolean {
  const gamesRemaining = player.injury?.gamesRemaining ?? 0;
  return gamesRemaining > 0 && injurySeverityLevel(gamesRemaining) > ptiLevel;
}

export function injuryReturnLabel(gamesRemaining: number, today: string | Date): string {
  if (gamesRemaining <= 0) return '—';
  const daysOut = Math.ceil(gamesRemaining * 2.5);
  try {
    return format(addDays(new Date(today), daysOut), 'd MMM');
  } catch {
    return `${gamesRemaining} game${gamesRemaining === 1 ? '' : 's'}`;
  }
}

export function getHealthyRoster(players: NBAPlayer[], teamId: number) {
  const healthyRoster = players.filter(
    p => p.tid === teamId && isOnRoster(p) && (!p.injury || (p.injury.gamesRemaining ?? 0) <= 0),
  );
  return {
    healthyRoster,
    healthyIds: new Set(healthyRoster.map(p => p.internalId)),
  };
}

export function normalizeMinuteOverrides(
  seed: Record<string, number>,
  maxPlayerMinutes: number,
  targetMinutes: number,
) {
  const seedTotal = Object.values(seed).reduce((a, b) => a + b, 0);
  if (seedTotal <= 0 || seedTotal === targetMinutes) return seed;
  const scale = targetMinutes / seedTotal;
  const normalized: Record<string, number> = Object.fromEntries(
    Object.entries(seed).map(([key, value]) => [
      key,
      Math.max(0, Math.min(maxPlayerMinutes, Math.round(value * scale))),
    ]),
  );
  let diff = targetMinutes - Object.values(normalized).reduce((a, b) => a + b, 0);
  const order = Object.entries(normalized).sort((a, b) => b[1] - a[1]).map(([key]) => key);
  for (let i = 0; diff !== 0 && i < order.length * 2; i++) {
    const key = order[i % order.length];
    const step = diff > 0 ? 1 : -1;
    const next = normalized[key] + step;
    if (next >= 0 && next <= maxPlayerMinutes) {
      normalized[key] = next;
      diff -= step;
    }
  }
  return normalized;
}

interface BuildStarterOrderArgs {
  savedStarterIds?: string[];
  idealStarterIds?: string[];
  team: any;
  players: NBAPlayer[];
  teamId: number;
  currentYear: number;
  onTeamIds: Set<string>;
  healthyRoster: NBAPlayer[];
  healthyIds: Set<string>;
  forceSort: boolean;
}

export function buildStarterOrder({
  savedStarterIds,
  idealStarterIds,
  team,
  players,
  currentYear,
  onTeamIds,
  healthyRoster,
  healthyIds,
  forceSort,
}: BuildStarterOrderArgs) {
  const savedStarters = (savedStarterIds ?? []).filter(id => onTeamIds.has(id) && healthyIds.has(id));
  const projected = team
    ? StarterService.getProjectedStarters(team, players, currentYear, healthyRoster)
        .slice(0, 5)
        .map(p => p.internalId)
    : [];
  let nextStarters: string[];
  let hadToFill = false;
  if (savedStarters.length > 0) {
    nextStarters = [...savedStarters];
    hadToFill = savedStarters.length < 5;
  } else if ((idealStarterIds?.length ?? 0) > 0) {
    nextStarters = (idealStarterIds ?? []).filter(id => healthyIds.has(id));
    hadToFill = nextStarters.length < 5;
  } else {
    nextStarters = [];
    hadToFill = true;
  }
  for (const playerId of projected) {
    if (nextStarters.length >= 5) break;
    if (!nextStarters.includes(playerId)) nextStarters.push(playerId);
  }
  let finalStarters = nextStarters.slice(0, 5);
  if (forceSort || hadToFill) {
    finalStarters = StarterService.sortByPositionSlot(
      finalStarters
        .map(id => players.find(p => p.internalId === id))
        .filter((p): p is NBAPlayer => !!p),
      currentYear,
    ).map(p => p.internalId);
  }
  return finalStarters;
}

export function buildBenchOrder(
  savedBenchOrder: string[] | undefined,
  finalStarters: string[],
  rotation: NBAPlayer[],
  onTeamIds: Set<string>,
) {
  const starterSet = new Set(finalStarters);
  const savedBench = (savedBenchOrder ?? []).filter(id => onTeamIds.has(id) && !starterSet.has(id));
  const benchFromRotation = rotation
    .map(p => p.internalId)
    .filter(id => !starterSet.has(id) && !savedBench.includes(id));
  return [...savedBench, ...benchFromRotation];
}

interface BuildMinuteOverridesArgs {
  rotation: NBAPlayer[];
  baseMinutes: number[];
  maxPlayerMinutes: number;
  targetMinutes: number;
  savedMinuteOverrides?: Record<string, number>;
  idealMinutes?: Record<string, number> | null;
}

export function buildMinuteOverrides({
  rotation,
  baseMinutes,
  maxPlayerMinutes,
  targetMinutes,
  savedMinuteOverrides,
  idealMinutes,
}: BuildMinuteOverridesArgs) {
  const seed: Record<string, number> = {};
  rotation.forEach((player, index) => {
    const prior = savedMinuteOverrides?.[player.internalId];
    const fromIdeal = idealMinutes?.[player.internalId];
    const raw = prior ?? (fromIdeal || undefined) ?? Math.round(baseMinutes[index] ?? 0);
    seed[player.internalId] = Math.max(0, Math.min(maxPlayerMinutes, raw));
  });
  return normalizeMinuteOverrides(seed, maxPlayerMinutes, targetMinutes);
}

export function buildIdealMinuteOverrides(
  ideal: { locked?: boolean; minutes: Record<string, number>; starterIds: string[] } | null,
  rotation: NBAPlayer[],
) {
  if (!ideal?.locked) return null;
  return reconcileIdealMinutes(ideal.minutes, rotation.map(player => player.internalId));
}
