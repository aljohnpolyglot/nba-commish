import { NBAPlayer as Player, NBATeam as Team } from '../../types';
import { reconcileIdealMinutes } from '../../store/idealRotationStore';
import { MinutesPlayedService } from './MinutesPlayedService';
import { SimulatorKnobs, isEuroClubCompetitionGame } from './SimulatorKnobs';
import {
  getSimulationGameplan as getGameplan,
  getSimulationIdealRotation as getIdealRotation,
  getSimulationLockedStrategy as getLockedStrategy,
} from './simulationRealmContext';

interface RotationPlanResult {
  rotation: Player[];
  minuteTargets: number[];
  starMpgTarget: number;
  source: 'auto' | 'gameplan' | 'ideal';
}

function clampMinute(value: number): number {
  return Math.max(0, Math.min(48, value));
}

function normalizeMinutes(minutes: number[], targetTotal: number): number[] {
  const clamped = minutes.map(clampMinute);
  const total = clamped.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return clamped;
  return clamped.map(value => value * (targetTotal / total));
}

function getPlayableRoster(team: Team, allPlayers: Player[], playThroughInjuries: number): Player[] {
  return allPlayers.filter(player =>
    player.tid === team.id &&
    ((player.injury?.gamesRemaining ?? 0) <= 0 || playThroughInjuries > 0)
  );
}

function countExplicitMinutePlayers(
  team: Team,
  allPlayers: Player[],
  minutes: Record<string, number> | null,
  playThroughInjuries: number,
): number {
  if (!minutes) return 0;
  const playableIds = new Set(getPlayableRoster(team, allPlayers, playThroughInjuries).map(player => player.internalId));
  return Object.entries(minutes).filter(([id, value]) => value > 0 && playableIds.has(id)).length;
}

function addExplicitMinutePlayers(
  rotation: Player[],
  team: Team,
  allPlayers: Player[],
  minutes: Record<string, number> | null,
  playThroughInjuries: number,
  playersOnCourt: number,
): Player[] {
  if (!minutes) return rotation;
  const playable = getPlayableRoster(team, allPlayers, playThroughInjuries);
  const byId = new Map(playable.map(player => [player.internalId, player]));
  const existing = new Set(rotation.map(player => player.internalId));
  const next = [...rotation];
  const plannedIds = Object.entries(minutes)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const maxRotation = Math.max(13, playersOnCourt + 5);
  for (const id of plannedIds) {
    if (next.length >= maxRotation) break;
    if (existing.has(id)) continue;
    const player = byId.get(id);
    if (!player) continue;
    next.push(player);
    existing.add(id);
  }

  const plannedSet = new Set(plannedIds);
  while (next.length > maxRotation) {
    const trimIndex = [...next].reverse().findIndex(player => !plannedSet.has(player.internalId));
    if (trimIndex < 0) {
      next.pop();
      continue;
    }
    next.splice(next.length - 1 - trimIndex, 1);
  }

  return next;
}

function applyOrder(
  rotation: Player[],
  starterIds: string[] | undefined,
  benchOrder: string[] | undefined,
  playersOnCourt: number,
): Player[] {
  if (rotation.length === 0) return rotation;

  const byId = new Map(rotation.map(player => [player.internalId, player]));
  const starterSet = new Set<string>();
  const starterTarget = Math.min(playersOnCourt, rotation.length);

  for (const id of starterIds ?? []) {
    const player = byId.get(id);
    if (!player || starterSet.has(id)) continue;
    starterSet.add(id);
    if (starterSet.size >= starterTarget) break;
  }

  const starters = rotation.filter(player => starterSet.has(player.internalId)).slice(0, starterTarget);
  for (const player of rotation) {
    if (starters.length >= starterTarget) break;
    if (starterSet.has(player.internalId)) continue;
    starters.push(player);
    starterSet.add(player.internalId);
  }

  const bench = rotation.filter(player => !starterSet.has(player.internalId));
  if (!benchOrder?.length) return [...starters, ...bench];

  const benchMap = new Map(bench.map(player => [player.internalId, player]));
  const orderedBench: Player[] = [];

  for (const id of benchOrder) {
    const player = benchMap.get(id);
    if (!player) continue;
    orderedBench.push(player);
    benchMap.delete(id);
  }

  for (const player of bench) {
    if (!benchMap.has(player.internalId)) continue;
    orderedBench.push(player);
    benchMap.delete(player.internalId);
  }

  return [...starters, ...orderedBench];
}

function isClearlyBrokenSavedPlan(
  rotation: Player[],
  minuteTargets: number[],
  playersOnCourt: number,
): boolean {
  if (rotation.length < playersOnCourt || minuteTargets.length < playersOnCourt) return false;
  const starterMinutes = minuteTargets.slice(0, playersOnCourt);
  const benchMinutes = minuteTargets.slice(playersOnCourt);
  const veryLowStarters = starterMinutes.filter(value => value < 6).length;
  const lowStarters = starterMinutes.filter(value => value < 12).length;
  const playableBench = benchMinutes.filter(value => value >= 18).length;
  const veryLowLimit = Math.max(1, Math.ceil(playersOnCourt * 0.4));
  const lowLimit = Math.max(1, Math.ceil(playersOnCourt * 0.6));
  const benchLimit = Math.max(1, Math.ceil(playersOnCourt * 0.4));
  return veryLowStarters >= veryLowLimit || (lowStarters >= lowLimit && playableBench >= benchLimit);
}

export function resolveRotationPlan(
  team: Team,
  allPlayers: Player[],
  season: number,
  knobs: SimulatorKnobs,
  lead: number,
  overridePlayers?: Player[],
): RotationPlanResult {
  const playersOnCourt = Math.max(1, Math.round(knobs.playersOnCourt ?? 5));
  const savedPlan = overridePlayers ? null : getGameplan(team.id);
  const idealPlan = overridePlayers ? null : getIdealRotation(team.id);
  const useIdeal = !!idealPlan?.locked;
  const explicitMinutes =
    savedPlan?.minuteOverrides && Object.keys(savedPlan.minuteOverrides).length > 0
      ? savedPlan.minuteOverrides
      : useIdeal
        ? idealPlan?.minutes ?? null
        : null;
  const explicitDepth = countExplicitMinutePlayers(
    team,
    allPlayers,
    explicitMinutes,
    knobs.playThroughInjuries ?? 0,
  );
  const substitutionRotationCap = knobs.gameRules?.substitutionLimitEnabled
    ? playersOnCourt + Math.max(0, Math.round(knobs.gameRules.maxSubstitutions ?? 0))
    : Number.POSITIVE_INFINITY;
  const maximumPlannedRotation = Math.min(Math.max(13, playersOnCourt + 5), substitutionRotationCap);
  let rotationDepthOverride = explicitDepth > 0
    ? Math.max(knobs.rotationDepthOverride ?? 0, Math.min(maximumPlannedRotation, explicitDepth))
    : knobs.rotationDepthOverride;
  if (knobs.gameRules?.substitutionLimitEnabled) {
    rotationDepthOverride = Math.min(
      substitutionRotationCap,
      rotationDepthOverride ?? substitutionRotationCap,
    );
  }

  const rotResult = MinutesPlayedService.getRotation(
    team,
    allPlayers,
    lead,
    season,
    overridePlayers,
    knobs.conferenceRank,
    knobs.gbFromLeader,
    knobs.gamesRemaining,
    rotationDepthOverride,
    knobs.playThroughInjuries ?? 0,
    playersOnCourt,
  );

  let rotation = rotResult.players;
  if (rotation.length === 0) {
    return { rotation: [], minuteTargets: [], starMpgTarget: rotResult.starMpgTarget, source: 'auto' };
  }

  const autoRotation = rotation;
  rotation = addExplicitMinutePlayers(
    rotation,
    team,
    allPlayers,
    explicitMinutes,
    knobs.playThroughInjuries ?? 0,
    playersOnCourt,
  );

  rotation = applyOrder(
    rotation,
    savedPlan?.starterIds?.length ? savedPlan.starterIds : useIdeal ? idealPlan?.starterIds : undefined,
    savedPlan?.benchOrder?.length ? savedPlan.benchOrder : useIdeal ? idealPlan?.benchOrder : undefined,
    playersOnCourt,
  );
  if (knobs.gameRules?.substitutionLimitEnabled) {
    rotation = rotation.slice(0, substitutionRotationCap);
  }

  const numQuarters = knobs.numQuarters ?? 4;
  const overtimeDuration = knobs.overtimeDuration ?? 5;
  const targetTotal = (knobs.quarterLength * numQuarters) * playersOnCourt;
  const minuteProfile = isEuroClubCompetitionGame(team, knobs) ? 'euro_club' : 'default';
  const eraRotation = getLockedStrategy(team.id) ? undefined : knobs.eraCoachingBias;
  const starMpgTarget = eraRotation?.starMpgTarget ?? knobs.starMpgOverride ?? rotResult.starMpgTarget;
  const { minutes: baseMinutes } = MinutesPlayedService.allocateMinutes(
    rotation,
    season,
    lead,
    0,
    starMpgTarget,
    !!knobs.isPlayoffs,
    knobs.quarterLength,
    overtimeDuration,
    numQuarters,
    minuteProfile,
    playersOnCourt,
    eraRotation?.maxPlayerMinutes,
  );

  if (savedPlan?.minuteOverrides && Object.keys(savedPlan.minuteOverrides).length > 0) {
    const overridden = rotation.map((player, index) => {
      const value = savedPlan.minuteOverrides[player.internalId];
      return typeof value === 'number' ? value : baseMinutes[index];
    });
    const normalized = normalizeMinutes(overridden, targetTotal);
    if (isClearlyBrokenSavedPlan(rotation, normalized, playersOnCourt)) {
      const { minutes: autoMinutes } = MinutesPlayedService.allocateMinutes(
        autoRotation,
        season,
        lead,
        0,
        starMpgTarget,
        !!knobs.isPlayoffs,
        knobs.quarterLength,
        overtimeDuration,
        numQuarters,
        minuteProfile,
        playersOnCourt,
        eraRotation?.maxPlayerMinutes,
      );
      return {
        rotation: autoRotation,
        minuteTargets: autoMinutes,
        starMpgTarget: rotResult.starMpgTarget,
        source: 'auto',
      };
    }
    return {
      rotation,
      minuteTargets: normalized,
      starMpgTarget: rotResult.starMpgTarget,
      source: 'gameplan',
    };
  }

  if (useIdeal && idealPlan) {
    const idealMinutes = reconcileIdealMinutes(
      idealPlan.minutes,
      rotation.map(player => player.internalId),
    );
    const seeded = rotation.map((player, index) => {
      const value = idealMinutes[player.internalId];
      return typeof value === 'number' && value > 0 ? value : baseMinutes[index];
    });
    return {
      rotation,
      minuteTargets: normalizeMinutes(seeded, targetTotal),
      starMpgTarget: rotResult.starMpgTarget,
      source: 'ideal',
    };
  }

  return {
    rotation,
    minuteTargets: baseMinutes,
    starMpgTarget: rotResult.starMpgTarget,
    source: 'auto',
  };
}
