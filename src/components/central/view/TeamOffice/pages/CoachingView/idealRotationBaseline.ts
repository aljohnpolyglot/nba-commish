import { StarterService } from '../../../../../../services/simulation/StarterService';
import { KNOBS_PBA } from '../../../../../../services/simulation/SimulatorKnobs';
import { buildLeagueBaseKnobs } from '../../../../../../services/simulation/GameSimulator/engineLeagueKnobs';
import { resolveRotationPlan } from '../../../../../../services/simulation/rotationPlan';
import { getTeamRotationManagementEffects } from '../../../../../../services/staff/staffGameplayEffects';
import { getDisplayOverall, getDisplayPotential } from '../../../../../../utils/playerRatings';
import type { NBAPlayer } from '../../../../../../types';
import { getPlayersOnCourt } from '../../../../../../services/simulation/courtSize';
import { getCalibratedPer } from '../../../../../../utils/advancedStatCalibration';

export const OUTLOOK_OPTIONS = [
  { key: 'auto', label: 'AUTO', depth: null, bias: null },
  { key: 'win_now', label: 'WIN-NOW', depth: 40, bias: 1.0 },
  { key: 'heavy_buyer', label: 'CONTENDING', depth: 50, bias: 0.9 },
  { key: 'playin', label: 'PLAY-IN PUSH', depth: 55, bias: 0.75 },
  { key: 'neutral', label: 'RETOOLING', depth: 60, bias: 0.55 },
  { key: 'rebuilding', label: 'REBUILDING', depth: 82, bias: 0.25 },
  { key: 'development', label: 'DEVELOPMENT', depth: 95, bias: 0.1 },
] as const;

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
  playersOnCourt: number,
): RotationPreview {
  if (!roster.length || !team) return { starterIds: [], minutes: {} };
  const management = getTeamRotationManagementEffects(team);

  const leaguePERSamples = roster.flatMap(player =>
    (player.stats ?? []).filter((stat: any) => stat.season === season && !stat.playoffs && (stat.gp ?? 0) > 0),
  );
  const leaguePERAvg =
    leaguePERSamples.length > 0
      ? leaguePERSamples.reduce((sum: number, stat: any) => sum + getCalibratedPer(stat), 0) / leaguePERSamples.length
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
              ? stats.reduce((sum: number, stat: any) => sum + getCalibratedPer(stat) * ((stat.min as number) ?? 0), 0) / minSum
              : leaguePERAvg;
          adjustment += Math.max(-12, Math.min(12, (per - leaguePERAvg) / 1.2)) * ((strengthBias - 0.5) / 0.5) * management.perTrust;
        }
      }
    }

    if (strengthBias < 0.5) {
      const bornYear = Number(player.born?.year);
      const age = Number.isFinite(bornYear) ? season - bornYear : Number((player as any).age ?? 26);
      const developFactor = (0.5 - strengthBias) / 0.5;
      const ageBonus =
        age <= 21 ? 8 :
        age === 22 ? 7 :
        age === 23 ? 5 :
        age === 24 ? 3 :
        age === 25 ? 1 :
        age <= 27 ? 0 :
        age === 28 ? -3 :
        age === 29 ? -5 :
        age <= 31 ? -7 :
        age <= 33 ? -10 : -14;
      const potentialGap = Math.max(0, getDisplayPotential(player, season) - base);
      adjustment += (ageBonus + Math.min(10, potentialGap * 0.5)) * developFactor;
    }

    const salaryM = Math.max(0, Number(player.contract?.amount ?? 0) / 1000);
    const salaryScore = Math.min(1, salaryM / 35);
    const veteranScore = Math.max(0, Math.min(1, (((player as any).age ?? 26) - 28) / 8));
    const draftScore = player.draft?.round === 1
      ? Math.max(0, Math.min(1, (31 - (player.draft.pick ?? 30)) / 30))
      : 0;
    const homegrown = player.draft?.tid === team.id || player.draft?.originalTid === team.id ? 0.35 : 0;
    const politics = (salaryScore * 0.45 + veteranScore * 0.25 + draftScore * 0.20 + homegrown) * management.politicsBias;
    adjustment += politics;

    return base + adjustment;
  };

  const byRating = [...roster].sort((a, b) => effectiveOvr(b) - effectiveOvr(a));
  const qualityCutoff = Math.max(68, effectiveOvr(byRating[0]) - Math.round(20 + (1 - strengthBias) * 12));
  const maxDepth = Math.min(roster.length, playersOnCourt + 6);
  const naturalDepth = Math.max(playersOnCourt, byRating.filter(player => effectiveOvr(player) >= qualityCutoff).length);
  const floorDepth = Math.max(
    playersOnCourt,
    Math.min(maxDepth, Math.round(playersOnCourt + (benchDepth / 100) * 8)),
  );
  const depth = Math.max(playersOnCourt, Math.min(maxDepth, Math.max(naturalDepth, floorDepth)));
  const pool = byRating.slice(0, Math.min(depth, byRating.length));
  if (pool.length === 0) return { starterIds: [], minutes: {} };

  const starterIds = StarterService.sortByPositionSlot(
    pool.slice(0, Math.min(playersOnCourt, pool.length)),
    season,
  ).map(player => player.internalId);
  const ratingWeights = pool.map(player => Math.pow(effectiveOvr(player), 2));
  const ratingTotal = ratingWeights.reduce((a, b) => a + b, 0) || 1;
  const flatShare = 1 / pool.length;
  // Development still needs a real hierarchy; a nearly-flat split made the
  // template indistinguishable from garbage time and kept veterans level
  // with the prospects the outlook is meant to feature.
  const allocationBias = 0.5 + strengthBias * 0.5;
  const weights = pool.map((_, i) => allocationBias * (ratingWeights[i] / ratingTotal) + (1 - allocationBias) * flatShare);
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
  _minuteProfile: 'default' | 'euro_club',
  leagueStats?: any,
  knobOverrides?: Record<string, unknown>,
): RotationPreview {
  if (!roster.length || !team) return { starterIds: [], minutes: {} };

  const healthy = roster.map(player => ({ ...(player as any), injury: undefined })) as NBAPlayer[];
  const playersOnCourt = getPlayersOnCourt(leagueStats, roster.length);
  const depthOverride = Math.round(playersOnCourt + (benchDepth / 100) * 8);
  const baseKnobs = buildLeagueBaseKnobs(leagueStats);
  const resolved = resolveRotationPlan(
    team,
    allPlayers,
    season,
    {
      ...baseKnobs,
      ...knobOverrides,
      playersOnCourt,
      conferenceRank: standings.conferenceRank,
      gbFromLeader: standings.gbFromLeader,
      gamesRemaining: standings.gamesRemaining,
      quarterLength,
      numQuarters,
      rotationDepthOverride: depthOverride,
    } as any,
    0,
    healthy,
  );

  const out: Record<string, number> = {};
  resolved.rotation.forEach((player, i) => {
    out[player.internalId] = Math.max(0, Math.round(resolved.minuteTargets[i] ?? 0));
  });

  return {
    starterIds: resolved.rotation.slice(0, playersOnCourt).map(player => player.internalId),
    minutes: out,
  };
}

export const PBA_IDEAL_KNOBS = {
  ...KNOBS_PBA,
  // Ideal should mirror the actual PBA rotation engine, but still respect the
  // bench-depth slider rather than hard-forcing an 11-man preview.
  rotationDepthOverride: undefined,
};
