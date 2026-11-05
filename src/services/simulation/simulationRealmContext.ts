import {
  getCoachSystem as getStoredCoachSystem,
  getSystemFitPenalty as getStoredSystemFitPenalty,
  getSystemKnobMods as getStoredSystemKnobMods,
  getSystemProficiencyBoost as getStoredSystemProficiencyBoost,
  type CoachSystemOverride,
} from '../../store/coachSystemStore';
import {
  getLockedStrategy as getStoredLockedStrategy,
  type LockedStrategy,
} from '../../store/coachStrategyLockStore';
import {
  getDefenseGameplan as getStoredDefenseGameplan,
  type DefenseGameplan,
} from '../../store/defenseGameplanStore';
import { getGameplan as getStoredGameplan, type Gameplan } from '../../store/gameplanStore';
import { getIdealRotation as getStoredIdealRotation, type IdealRotation } from '../../store/idealRotationStore';
import {
  getScoringOptions as getStoredScoringOptions,
  type ScoringOptionsOverride,
} from '../../store/scoringOptionsStore';

export interface TeamSimulationRealmContext {
  scoringOptions: ScoringOptionsOverride | null;
  coachSystem: CoachSystemOverride | null;
  systemFitPenalty: ReturnType<typeof getStoredSystemFitPenalty>;
  systemKnobMods: ReturnType<typeof getStoredSystemKnobMods>;
  systemProficiencyBoost: number;
  lockedStrategy: LockedStrategy | null;
  defenseGameplan: DefenseGameplan;
  gameplan: Gameplan | null;
  idealRotation: IdealRotation | null;
}

export interface SimulationRealmContext {
  teams: Record<string, TeamSimulationRealmContext>;
}

let activeContext: SimulationRealmContext | null = null;

const getTeamContext = (teamId: number): TeamSimulationRealmContext | undefined => (
  activeContext?.teams[String(teamId)]
);

export const captureSimulationRealmContext = (teamIds: readonly number[]): SimulationRealmContext => ({
  teams: Object.fromEntries([...new Set(teamIds)].map(teamId => [String(teamId), {
    scoringOptions: getStoredScoringOptions(teamId),
    coachSystem: getStoredCoachSystem(teamId),
    systemFitPenalty: getStoredSystemFitPenalty(teamId),
    systemKnobMods: getStoredSystemKnobMods(teamId),
    systemProficiencyBoost: getStoredSystemProficiencyBoost(teamId),
    lockedStrategy: getStoredLockedStrategy(teamId),
    defenseGameplan: getStoredDefenseGameplan(teamId),
    gameplan: getStoredGameplan(teamId),
    idealRotation: getStoredIdealRotation(teamId),
  }])),
});

export const withSimulationRealmContext = <T>(context: SimulationRealmContext, run: () => T): T => {
  const previous = activeContext;
  activeContext = context;
  try {
    return run();
  } finally {
    activeContext = previous;
  }
};

export const getSimulationScoringOptions = (teamId: number): ScoringOptionsOverride | null => {
  const context = getTeamContext(teamId);
  return context ? context.scoringOptions : getStoredScoringOptions(teamId);
};

export const getSimulationCoachSystem = (teamId: number): CoachSystemOverride | null => {
  const context = getTeamContext(teamId);
  return context ? context.coachSystem : getStoredCoachSystem(teamId);
};

export const getSimulationLockedStrategy = (teamId: number): LockedStrategy | null => {
  const context = getTeamContext(teamId);
  return context ? context.lockedStrategy : getStoredLockedStrategy(teamId);
};

export const getSimulationDefenseGameplan = (teamId: number): DefenseGameplan => {
  const context = getTeamContext(teamId);
  return context ? context.defenseGameplan : getStoredDefenseGameplan(teamId);
};

export const getSimulationGameplan = (teamId: number): Gameplan | null => {
  const context = getTeamContext(teamId);
  return context ? context.gameplan : getStoredGameplan(teamId);
};

export const getSimulationIdealRotation = (teamId: number): IdealRotation | null => {
  const context = getTeamContext(teamId);
  return context ? context.idealRotation : getStoredIdealRotation(teamId);
};

export const getSimulationSystemFitPenalty = (teamId: number): {
  strengthPenalty: number;
  efficiencyMult: number;
} => {
  const context = getTeamContext(teamId);
  return context ? context.systemFitPenalty : getStoredSystemFitPenalty(teamId);
};

export const getSimulationSystemProficiencyBoost = (teamId: number): number => {
  const context = getTeamContext(teamId);
  return context ? context.systemProficiencyBoost : getStoredSystemProficiencyBoost(teamId);
};

export const getSimulationSystemKnobMods = (teamId: number) => {
  const context = getTeamContext(teamId);
  return context ? context.systemKnobMods : getStoredSystemKnobMods(teamId);
};
