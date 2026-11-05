import type { Tab } from '../../types';

export function resolvePostFreeAgencyNavigation(
  hasCombinedSummary: boolean,
  nextView: Tab,
): { deferredView: Tab | null; immediateView: Tab | null } {
  return hasCombinedSummary
    ? { deferredView: nextView, immediateView: null }
    : { deferredView: null, immediateView: nextView };
}
