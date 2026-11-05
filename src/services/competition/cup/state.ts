import type {
  CupCompetitionFormat,
  CupCompetitionState,
  CupCompetitionStateMap,
  CupGroupAssignment,
  CupScope,
} from './types';

export function createCupCompetitionState(
  format: CupCompetitionFormat,
  season: number,
  groups: CupGroupAssignment[] = [],
): CupCompetitionState {
  return {
    schemaVersion: 1,
    leagueId: format.leagueId,
    competitionId: format.competitionId,
    season,
    status: 'scheduled',
    format,
    groups,
    standings: [],
    qualifiers: [],
    bracket: [],
    awards: [],
    prizePool: { ...format.prizePool },
    history: [],
  };
}

export function cupCompetitionKey(scope: CupScope): string {
  return `${encodeURIComponent(scope.leagueId)}::${encodeURIComponent(scope.competitionId)}`;
}

export function getCupCompetitionState(
  states: CupCompetitionStateMap | undefined,
  scope: CupScope,
): CupCompetitionState | undefined {
  return states?.[cupCompetitionKey(scope)];
}

export function setCupCompetitionState(
  states: CupCompetitionStateMap | undefined,
  state: CupCompetitionState,
): CupCompetitionStateMap {
  return { ...(states ?? {}), [cupCompetitionKey(state)]: state };
}

export function updateCupCompetitionState(
  states: CupCompetitionStateMap | undefined,
  scope: CupScope,
  update: (state: CupCompetitionState) => CupCompetitionState,
): CupCompetitionStateMap {
  const current = getCupCompetitionState(states, scope);
  return current ? setCupCompetitionState(states, update(current)) : { ...(states ?? {}) };
}

export function removeCupCompetitionState(
  states: CupCompetitionStateMap | undefined,
  scope: CupScope,
): CupCompetitionStateMap {
  const next = { ...(states ?? {}) };
  delete next[cupCompetitionKey(scope)];
  return next;
}

export function listLeagueCupStates(
  states: CupCompetitionStateMap | undefined,
  leagueId: string,
): CupCompetitionState[] {
  return Object.values(states ?? {}).filter(state => state.leagueId === leagueId);
}
