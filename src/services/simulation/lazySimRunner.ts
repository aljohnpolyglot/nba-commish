// Canonical public simulation target entry point. The implementation remains in
// logic while callers migrate; all outcomes are explicit, never a silent no-op.
export { runLazySim, buildAutoResolveEvents } from '../logic/lazySimRunner';
export type { LazySimOptions, LazySimResult, LazySimNonProgressDiagnostic } from '../logic/lazySimRunner';
export type { SimulationExecutionProfile } from './executionProfile';
export const LEGAL_TARGET_OUTCOMES = [
  { status: 'progressed' as const },
  { status: 'arrived' as const },
  { status: 'blocked' as const },
  { status: 'failed' as const },
];

/** Public contract guard used by UI and diagnostics without importing internals. */
export const hasNonProgressDiagnostic = (result: {
  nonProgressDiagnostic?: unknown;
}): boolean => result.nonProgressDiagnostic != null;
