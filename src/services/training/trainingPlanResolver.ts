import type { NBATeam } from '../../types';
import type { Allocations, TrainingParadigm } from '../../TeamTraining/types';

export interface ResolvedTrainingPlan {
  intensity: number;
  paradigm: TrainingParadigm;
  allocations: Allocations;
  auto?: boolean;
}

function isAutoRegularPracticePlan(plan: ResolvedTrainingPlan | undefined): boolean {
  return !!plan && plan.auto !== false && plan.paradigm === 'Balanced' && plan.intensity === 50;
}

export function resolveEffectiveTrainingPlan(
  team: Pick<NBATeam, 'trainingCalendar' | 'normalDayDefault'>,
  iso: string,
): ResolvedTrainingPlan | null {
  const rawPlan = (team.trainingCalendar ?? {})[iso] as ResolvedTrainingPlan | undefined;
  if (!rawPlan) return null;

  if (!isAutoRegularPracticePlan(rawPlan) || !team.normalDayDefault) {
    return rawPlan;
  }

  return {
    intensity: team.normalDayDefault.intensity,
    paradigm: team.normalDayDefault.paradigm as TrainingParadigm,
    allocations: team.normalDayDefault.allocations as Allocations,
    auto: true,
  };
}

export function resolveEffectiveTrainingCalendar(
  team: Pick<NBATeam, 'trainingCalendar' | 'normalDayDefault'>,
): Record<string, ResolvedTrainingPlan> {
  const out: Record<string, ResolvedTrainingPlan> = {};
  for (const iso of Object.keys(team.trainingCalendar ?? {})) {
    const resolved = resolveEffectiveTrainingPlan(team, iso);
    if (resolved) out[iso] = resolved;
  }
  return out;
}
