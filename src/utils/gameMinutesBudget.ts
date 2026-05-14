interface MinimalState {
  leagueStats?: {
    quarterLength?: number | null;
    numQuarters?: number | null;
  };
}

const PLAYERS_ON_COURT = 5;

function ql(state: MinimalState): number {
  const v = state.leagueStats?.quarterLength;
  return Number.isFinite(v) && (v as number) > 0 ? (v as number) : 12;
}

function nq(state: MinimalState): number {
  const v = state.leagueStats?.numQuarters;
  return Number.isFinite(v) && (v as number) > 0 ? (v as number) : 4;
}

/** Total team-wide minute budget for a regulation game (5 players × quarters × length).
 *  NBA: 12×4×5 = 240. FIBA: 10×4×5 = 200. */
export function getGameMinutesBudget(state: MinimalState): number {
  return ql(state) * nq(state) * PLAYERS_ON_COURT;
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
