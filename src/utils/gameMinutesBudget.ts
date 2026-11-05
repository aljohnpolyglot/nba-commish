import { getPlayersOnCourt } from '../services/simulation/courtSize';

interface MinimalState {
  leagueStats?: {
    quarterLength?: number | null;
    numQuarters?: number | null;
    maxPlayersOnCourt?: number;
    minPlayersPerTeam?: number;
  };
}

function ql(state: MinimalState): number {
  const v = state.leagueStats?.quarterLength;
  return Number.isFinite(v) && (v as number) > 0 ? (v as number) : 12;
}

function nq(state: MinimalState): number {
  const v = state.leagueStats?.numQuarters;
  return Number.isFinite(v) && (v as number) > 0 ? (v as number) : 4;
}

/** Total team-wide regulation minutes for the configured court size. */
export function getGameMinutesBudget(state: MinimalState): number {
  return ql(state) * nq(state) * getPlayersOnCourt(state.leagueStats);
}

/** Max minutes one player can log in regulation. NBA: 48. FIBA: 40. */
export function getMaxMinutesPerPlayer(state: MinimalState): number {
  return ql(state) * nq(state);
}

export function getQuarterLengthMin(state: MinimalState): number {
  return ql(state);
}

export function getNumQuarters(state: MinimalState): number {
  return nq(state);
}
