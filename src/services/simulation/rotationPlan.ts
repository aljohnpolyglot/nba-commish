import { NBAPlayer as Player, NBATeam as Team } from '../../types';
import { getGameplan } from '../../store/gameplanStore';
import { getIdealRotation, reconcileIdealMinutes } from '../../store/idealRotationStore';
import { MinutesPlayedService } from './MinutesPlayedService';
import { SimulatorKnobs, isEuroClubCompetitionGame } from './SimulatorKnobs';

interface RotationPlanResult {
  rotation: Player[];
  minuteTargets: number[];
  starMpgTarget: number;
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

function applyOrder(rotation: Player[], starterIds?: string[], benchOrder?: string[]): Player[] {
  if (rotation.length === 0) return rotation;

  const byId = new Map(rotation.map(player => [player.internalId, player]));
  const starterSet = new Set<string>();
  const starterTarget = Math.min(5, rotation.length);

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

export function resolveRotationPlan(
  team: Team,
  allPlayers: Player[],
  season: number,
  knobs: SimulatorKnobs,
  lead: number,
  overridePlayers?: Player[],
): RotationPlanResult {
  const rotResult = MinutesPlayedService.getRotation(
    team,
    allPlayers,
    lead,
    season,
    overridePlayers,
    knobs.conferenceRank,
    knobs.gbFromLeader,
    knobs.gamesRemaining,
    knobs.rotationDepthOverride,
    knobs.playThroughInjuries ?? 0,
  );

  let rotation = rotResult.players;
  if (rotation.length === 0) {
    return { rotation: [], minuteTargets: [], starMpgTarget: rotResult.starMpgTarget };
  }

  const savedPlan = overridePlayers ? null : getGameplan(team.id);
  const idealPlan = overridePlayers ? null : getIdealRotation(team.id);
  const useIdeal = !!idealPlan?.locked;

  rotation = applyOrder(
    rotation,
    savedPlan?.starterIds?.length ? savedPlan.starterIds : useIdeal ? idealPlan?.starterIds : undefined,
    savedPlan?.benchOrder?.length ? savedPlan.benchOrder : useIdeal ? idealPlan?.benchOrder : undefined,
  );

  const numQuarters = knobs.numQuarters ?? 4;
  const overtimeDuration = knobs.overtimeDuration ?? 5;
  const targetTotal = (knobs.quarterLength * numQuarters) * 5;
  const minuteProfile = isEuroClubCompetitionGame(team, knobs) ? 'euro_club' : 'default';
  const { minutes: baseMinutes } = MinutesPlayedService.allocateMinutes(
    rotation,
    season,
    lead,
    0,
    knobs.starMpgOverride ?? rotResult.starMpgTarget,
    !!knobs.isPlayoffs,
    knobs.quarterLength,
    overtimeDuration,
    numQuarters,
    minuteProfile,
  );

  if (savedPlan?.minuteOverrides && Object.keys(savedPlan.minuteOverrides).length > 0) {
    const overridden = rotation.map((player, index) => {
      const value = savedPlan.minuteOverrides[player.internalId];
      return typeof value === 'number' ? value : baseMinutes[index];
    });
    return {
      rotation,
      minuteTargets: normalizeMinutes(overridden, targetTotal),
      starMpgTarget: rotResult.starMpgTarget,
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
    };
  }

  return {
    rotation,
    minuteTargets: baseMinutes,
    starMpgTarget: rotResult.starMpgTarget,
  };
}
