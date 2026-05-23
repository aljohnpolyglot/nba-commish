import { useEffect } from 'react';
import { parseGameDate } from '../../utils/dateUtils';

type ThroneLifecycleDates = {
  saturday: Date;
  throneSignupOpens: Date;
  throneSignupCloses: Date;
  throneVotingOpens: Date;
  throneFieldReveal: Date;
};

export const useAllStarThroneLifecycle = (
  state: any,
  dispatchAction: (action: any) => void,
  dates: ThroneLifecycleDates,
) => {
  useEffect(() => {
    if (state.leagueStats.allStarThroneEnabled !== true) return;
    if (!state.allStar) return;
    const now = parseGameDate(state.date);
    const allStar = state.allStar as any;

    void (async () => {
      const orchestrator = await import('../../services/allStar/throneOrchestrator');
      let patch: any = {};
      const stateWithPatch = () => ({ ...state, allStar: { ...state.allStar, ...patch } as any });

      if (now >= dates.throneSignupOpens && !allStar.throneSignupSchedule) {
        const nextPatch = orchestrator.initThroneSignups(state, dates.throneSignupOpens, dates.throneSignupCloses);
        if (nextPatch?.allStar) patch = { ...patch, ...nextPatch.allStar };
      }
      if (now >= dates.throneVotingOpens && now < dates.throneFieldReveal && !allStar.throneAnnounced) {
        const nextPatch = orchestrator.tickThroneVoting(stateWithPatch(), now, dates.throneVotingOpens, dates.throneFieldReveal);
        if (nextPatch?.allStar) patch = { ...patch, ...nextPatch.allStar };
      }
      if (now >= dates.throneFieldReveal && !allStar.throneAnnounced) {
        const nextPatch = orchestrator.lockThroneField(stateWithPatch());
        if (nextPatch?.allStar) patch = { ...patch, ...nextPatch.allStar };
      }
      if (
        now >= dates.saturday
        && (state.allStar as any).weekendComplete === true
        && !allStar.throne?.complete
      ) {
        const nextPatch = orchestrator.simulateThroneTournament(stateWithPatch());
        if (nextPatch?.allStar) patch = { ...patch, ...nextPatch.allStar };
      }

      const throneKeys = [
        'throne',
        'throneAnnounced',
        'throneVacated',
        'throneVotingProgress',
        'throneVoteTally',
        'throneSignupSchedule',
        'throneSignupComplete',
      ];
      const merged: any = {};
      for (const key of throneKeys) {
        if (key in patch && patch[key] !== undefined
          && JSON.stringify((state.allStar as any)[key]) !== JSON.stringify(patch[key])) {
          merged[key] = patch[key];
        }
      }
      if (Object.keys(merged).length > 0) {
        dispatchAction({ type: 'MERGE_THRONE_LIFECYCLE', payload: { allStarPatch: merged } });
      }
    })();
  }, [
    dates.saturday,
    dates.throneFieldReveal,
    dates.throneSignupCloses,
    dates.throneSignupOpens,
    dates.throneVotingOpens,
    dispatchAction,
    state,
  ]);
};
