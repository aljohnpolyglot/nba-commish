export type SetupStep = 'mode' | 'name' | 'season' | 'franchise' | 'nbaStart' | 'euroReview' | 'fictionalStartup' | 'rosterSetup' | 'timeline' | 'review';

const ROSTER_STEPS = new Set<SetupStep>(['season', 'franchise', 'nbaStart', 'euroReview']);

export function shouldPrepareSetupRoster(step: SetupStep): boolean {
  return ROSTER_STEPS.has(step);
}

export function shouldExposeSetupRoster(enabled: boolean, loadedRequestKey: string, currentRequestKey: string): boolean {
  return enabled && loadedRequestKey === currentRequestKey;
}
