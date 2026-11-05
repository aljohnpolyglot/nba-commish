import type { GameState } from '../types';

type MutableClub = GameState['teams'][number] | GameState['nonNBATeams'][number];

export function applyTycoonMutationToState(
  state: GameState,
  teamId: number,
  mutator: (team: MutableClub) => void,
): GameState {
  const nbaIndex = state.teams.findIndex(team => team.id === teamId);
  if (nbaIndex >= 0) {
    const team = structuredClone(state.teams[nbaIndex]);
    mutator(team);
    const teams = [...state.teams];
    teams[nbaIndex] = team;
    return { ...state, teams };
  }

  const nonNBAIndex = state.nonNBATeams.findIndex(team => team.tid === teamId);
  if (nonNBAIndex < 0) return state;
  const team = structuredClone(state.nonNBATeams[nonNBAIndex]);
  mutator(team);
  const nonNBATeams = [...state.nonNBATeams];
  nonNBATeams[nonNBAIndex] = team;
  return { ...state, nonNBATeams };
}
