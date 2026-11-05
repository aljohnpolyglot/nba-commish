export type LotteryPickOverrideMap = Record<number, number>;

type LotteryTeamLike = {
  tid: number;
  originalSeed: number;
};

type LotteryResultLike<TTeam extends LotteryTeamLike> = {
  pick: number;
  team: TTeam;
  change: number;
};

export function getPossibleLotteryPicks(
  chances: number[],
  teamIndex: number,
  numToPick: number,
): number[] {
  const n = chances.length;
  if (teamIndex < 0 || teamIndex >= n) return [];
  const seed = teamIndex + 1;
  const positiveBefore = chances.slice(0, teamIndex).filter(weight => weight > 0).length;
  const positiveAfter = chances.slice(teamIndex + 1).filter(weight => weight > 0).length;
  const possible: number[] = [];

  if ((chances[teamIndex] ?? 0) > 0) {
    for (let pick = 1; pick <= Math.min(numToPick, n); pick++) {
      if (positiveBefore + positiveAfter >= pick - 1) possible.push(pick);
    }
  }

  for (let pick = numToPick + 1; pick <= n; pick++) {
    const drawnBefore = numToPick + seed - pick;
    const drawnAfter = numToPick - drawnBefore;
    if (
      drawnBefore >= 0
      && drawnAfter >= 0
      && drawnBefore <= positiveBefore
      && drawnAfter <= positiveAfter
    ) {
      possible.push(pick);
    }
  }
  return possible;
}

export function applyLotteryPickOverrides<TTeam extends LotteryTeamLike>(
  results: LotteryResultLike<TTeam>[],
  overrides: LotteryPickOverrideMap,
): LotteryResultLike<TTeam>[] {
  const next = results.map(result => ({ ...result }));
  const claimedPicks = new Set<number>();
  const ordered = Object.entries(overrides)
    .map(([tid, pick]) => ({ tid: Number(tid), pick: Number(pick) }))
    .filter(entry => Number.isFinite(entry.tid) && Number.isFinite(entry.pick))
    .sort((left, right) => left.pick - right.pick);

  for (const override of ordered) {
    if (claimedPicks.has(override.pick)) continue;
    const teamIndex = next.findIndex(result => result.team.tid === override.tid);
    const targetIndex = next.findIndex(result => result.pick === override.pick);
    if (teamIndex < 0 || targetIndex < 0) continue;
    const currentPick = next[teamIndex].pick;
    next[teamIndex].pick = override.pick;
    next[targetIndex].pick = currentPick;
    claimedPicks.add(override.pick);
  }

  return next
    .sort((left, right) => left.pick - right.pick)
    .map(result => ({
      ...result,
      change: result.team.originalSeed - result.pick,
    }));
}

export const lotteryOverrideStorageKey = (season: number, tid: number) => `${season}:${tid}`;

export function getSeasonLotteryOverrides(
  stored: Record<string, number> | undefined,
  season: number,
): LotteryPickOverrideMap {
  const prefix = `${season}:`;
  return Object.fromEntries(
    Object.entries(stored ?? {})
      .filter(([key, pick]) => key.startsWith(prefix) && Number.isFinite(Number(pick)))
      .map(([key, pick]) => [Number(key.slice(prefix.length)), Number(pick)]),
  );
}
