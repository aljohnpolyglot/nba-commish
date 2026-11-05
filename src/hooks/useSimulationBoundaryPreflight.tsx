import { useCallback, useState } from 'react';
import type { GameState } from '../types';
import { SimulationBoundaryPreflightModal } from '../components/modals/SimulationBoundaryPreflightModal';
import {
  compileConfirmedBoundaryPlan,
  discoverSimulationBoundaries,
  shouldOpenSimulationBoundaryPreflight,
  type SimulationBoundaryPreflight,
  type SimulationBoundarySelections,
} from '../services/simulation/boundaryPreflight';
import type { TargetPlan } from '../services/simulation/targetPlanner';

type StartSimulation = (plan: TargetPlan) => void | Promise<void>;

interface PendingSimulationBoundaryPreflight {
  plan: TargetPlan;
  preflight: SimulationBoundaryPreflight;
  start: StartSimulation;
}

export function useSimulationBoundaryPreflight(state: GameState) {
  const [pending, setPending] = useState<PendingSimulationBoundaryPreflight | null>(null);

  const attempt = useCallback((plan: TargetPlan, start: StartSimulation): void => {
    const preflight = discoverSimulationBoundaries(state, plan);
    if (!shouldOpenSimulationBoundaryPreflight(preflight)) {
      void start(plan);
      return;
    }
    setPending({ plan, preflight, start });
  }, [state]);

  const cancel = useCallback(() => {
    setPending(null);
  }, []);

  const confirm = useCallback((selections: SimulationBoundarySelections) => {
    if (!pending) return;
    const confirmedPlan = compileConfirmedBoundaryPlan(
      pending.plan,
      pending.preflight,
      selections,
    );
    const start = pending.start;
    setPending(null);
    void start(confirmedPlan);
  }, [pending]);

  const modal = (
    <SimulationBoundaryPreflightModal
      preflight={pending?.preflight ?? null}
      onConfirm={confirm}
      onCancel={cancel}
    />
  );

  return { attempt, cancel, modal, isOpen: pending != null };
}
