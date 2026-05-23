import { StarterService } from '../../../../../../services/simulation/StarterService';
import { MinutesPlayedService } from '../../../../../../services/simulation/MinutesPlayedService';
import { getDisplayOverall } from '../../../../../../utils/playerRatings';
import type { NBAPlayer } from '../../../../../../types';

export const OUTLOOK_OPTIONS = [
  { key: 'auto', label: 'AUTO', depth: null, bias: null },
  { key: 'win_now', label: 'WIN-NOW', depth: 40, bias: 1.0 },
  { key: 'heavy_buyer', label: 'CONTENDING', depth: 50, bias: 0.9 },
  { key: 'playin', label: 'PLAY-IN PUSH', depth: 55, bias: 0.75 },
  { key: 'neutral', label: 'RETOOLING', depth: 60, bias: 0.55 },
  { key: 'cap_clear', label: 'CAP CLEARING', depth: 70, bias: 0.4 },
  { key: 'rebuilding', label: 'REBUILDING', depth: 82, bias: 0.25 },
  { key: 'development', label: 'DEVELOPMENT', depth: 95, bias: 0.1 },
] as const;

export const STARTER_POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

export type OutlookKey = (typeof OUTLOOK_OPTIONS)[number]['key'];

export interface RotationPreview {
  starterIds: string[];
  minutes: Record<string, number>;
}

export interface StandingsContext {
  conferenceRank: number;
  gbFromLeader: number;
  gamesRemaining: number;
}

export function computeStrengthOptimalBaseline(
  team: any,
  roster: NBAPlayer[],
  season: number,
  benchDepth: number,
  strengthBias: number,
  targetMinutes: number,
  maxPlayerMinutes: number,
): RotationPreview {
  if (!roster.length || !team) return { starterIds: [], minutes: {} };

  const leaguePERSamples = roster.flatMap(player =>
    (player.stats ?? []).filter((stat: any) => stat.season === season && !stat.playoffs && (stat.gp ?? 0) > 0),
  );
  const leaguePERAvg =
    leaguePERSamples.length > 0
      ? leaguePERSamples.reduce((sum: number, stat: any) => sum + ((stat.per as number) ?? 0), 0) / leaguePERSamples.length
      : 15;

  const effectiveOvr = (player: NBAPlayer) => {
    const base = getDisplayOverall(player);
    let adjustment = 0;

    if (strengthBias >= 0.5) {
      const stats = (player.stats ?? []).filter((stat: any) => stat.season === season && !stat.playoffs && (stat.gp ?? 0) > 0);
      if (stats.length > 0) {
        const gp = stats.reduce((sum: number, stat: any) => sum + ((stat.gp as number) ?? 0), 0);
        const minSum = stats.reduce((sum: number, stat: any) => sum + ((stat.min as number) ?? 0), 0);
        if (gp > 3 && minSum / gp > 5) {
          const per =
            minSum > 0
              ? stats.reduce((sum: number, stat: any) => sum + ((stat.per as number) ?? 0) * ((stat.min as number) ?? 0), 0) / minSum
              : leaguePERAvg;
          adjustment += Math.max(-12, Math.min(12, (per - leaguePERAvg) / 1.2)) * ((strengthBias - 0.5) / 0.5);
        }
      }
    }

    if (strengthBias < 0.5) {
      const age = (player as any).age ?? 26;
      const developFactor = (0.5 - strengthBias) / 0.5;
      const ageBonus =
        age <= 22 ? 4 :
        age === 23 ? 2 :
        age <= 25 ? 1 :
        age <= 27 ? 0 :
        age <= 29 ? -1 :
        age <= 31 ? -2 : -4;
      adjustment += ageBonus * developFactor;
    }

    return base + adjustment;
  };

  const byRating = [...roster].sort((a, b) => effectiveOvr(b) - effectiveOvr(a));
  const qualityCutoff = Math.max(68, effectiveOvr(byRating[0]) - Math.round(20 + (1 - strengthBias) * 12));
  const naturalDepth = Math.max(5, byRating.filter(player => effectiveOvr(player) >= qualityCutoff).length);
  const floorDepth = Math.max(5, Math.min(13, Math.round(5 + (benchDepth / 100) * 8)));
  const depth = Math.max(5, Math.min(13, Math.max(naturalDepth, floorDepth)));
  const pool = byRating.slice(0, Math.min(depth, byRating.length));
  if (pool.length === 0) return { starterIds: [], minutes: {} };

  const starterIds = StarterService.sortByPositionSlot(pool.slice(0, Math.min(5, pool.length)), season).map(player => player.internalId);
  const ratingWeights = pool.map(player => Math.pow(effectiveOvr(player), 2));
  const ratingTotal = ratingWeights.reduce((a, b) => a + b, 0) || 1;
  const flatShare = 1 / pool.length;
  const weights = pool.map((_, i) => strengthBias * (ratingWeights[i] / ratingTotal) + (1 - strengthBias) * flatShare);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const rawMinutes = pool.map((_, i) => (weights[i] / totalWeight) * targetMinutes);
  const clamped = rawMinutes.map(min => Math.min(maxPlayerMinutes, min));

  let overflow = rawMinutes.reduce((a, b) => a + b, 0) - clamped.reduce((a, b) => a + b, 0);
  for (let pass = 0; pass < 3 && overflow > 0.5; pass++) {
    const eligible = pool.map((_, i) => i).filter(i => clamped[i] < maxPlayerMinutes);
    const eligWeight = eligible.reduce((sum, i) => sum + weights[i], 0) || 1;
    for (const i of eligible) {
      clamped[i] += Math.min((weights[i] / eligWeight) * overflow, maxPlayerMinutes - clamped[i]);
    }
    overflow = rawMinutes.reduce((a, b) => a + b, 0) - clamped.reduce((a, b) => a + b, 0);
  }

  const rounded = clamped.map(min => Math.round(min));
  let sum = rounded.reduce((a, b) => a + b, 0);
  const order = pool.map((_, i) => i).sort((a, b) => rounded[b] - rounded[a]);
  let cursor = 0;
  let guard = order.length * 2;
  while (sum !== targetMinutes && guard-- > 0) {
    const i = order[cursor % order.length];
    const step = sum < targetMinutes ? 1 : -1;
    const next = rounded[i] + step;
    if (next >= 0 && next <= maxPlayerMinutes) {
      rounded[i] = next;
      sum += step;
    }
    cursor++;
  }

  const minutes: Record<string, number> = {};
  pool.forEach((player, i) => {
    minutes[player.internalId] = rounded[i];
  });
  return { starterIds, minutes };
}

export function computeBaselineFromService(
  team: any,
  allPlayers: NBAPlayer[],
  roster: NBAPlayer[],
  season: number,
  standings: StandingsContext,
  benchDepth: number,
  quarterLength: number,
  numQuarters: number,
  minuteProfile: 'default' | 'euro_club',
): RotationPreview {
  if (!roster.length || !team) return { starterIds: [], minutes: {} };

  const maxPlayerMinutes = quarterLength * numQuarters;
  const targetMinutes = maxPlayerMinutes * 5;
  const healthy = roster.map(player => ({ ...(player as any), injury: undefined })) as NBAPlayer[];
  const depthOverride = Math.round(5 + (benchDepth / 100) * 8);
  const rotation = MinutesPlayedService.getRotation(
    team,
    allPlayers,
    0,
    season,
    healthy,
    standings.conferenceRank,
    standings.gbFromLeader,
    standings.gamesRemaining,
    depthOverride,
  );
  const { minutes } = MinutesPlayedService.allocateMinutes(
    rotation.players,
    season,
    0,
    0,
    rotation.starMpgTarget,
    false,
    quarterLength,
    undefined,
    numQuarters,
    minuteProfile,
  );

  const out: Record<string, number> = {};
  rotation.players.forEach((player, i) => {
    out[player.internalId] = Math.max(0, Math.round(minutes[i] ?? 0));
  });

  let sum = Object.values(out).reduce((a, b) => a + b, 0);
  const ids = Object.keys(out);
  if (sum !== targetMinutes && ids.length > 0) {
    const order = [...ids].sort((a, b) => out[b] - out[a]);
    let cursor = 0;
    let guard = order.length * Math.max(1, maxPlayerMinutes);
    while (sum !== targetMinutes && guard-- > 0) {
      const id = order[cursor % order.length];
      const step = sum < targetMinutes ? 1 : -1;
      const next = out[id] + step;
      if (next >= 0 && next <= maxPlayerMinutes) {
        out[id] = next;
        sum += step;
      }
      cursor++;
    }
  }

  return {
    starterIds: rotation.players.slice(0, 5).map(player => player.internalId),
    minutes: out,
  };
}
