export type LotteryOrderTeamLike = {
  id?: number | string;
  tid?: number | string;
  originalSeed?: number;
};

export type LotteryResultLike<TTeam = any> = {
  pick?: number;
  pickNumber?: number;
  team?: TTeam;
  tid?: number | string;
  change?: number;
};

export type NormalizedLotteryRow<TTeam> = {
  currentPick: number;
  team: TTeam;
  isFromResult: boolean;
  change: number;
};

export const getLotteryResultPick = (result: LotteryResultLike): number =>
  Number(result?.pick ?? result?.pickNumber ?? 0);

export const getLotteryResultTid = (result: LotteryResultLike): number =>
  Number((result?.team as any)?.tid ?? (result?.team as any)?.id ?? result?.tid);

const teamTid = (team: LotteryOrderTeamLike): number =>
  Number(team.tid ?? team.id);

export function normalizeLotteryRows<TTeam extends LotteryOrderTeamLike>(
  teams: TTeam[],
  results: LotteryResultLike[] | undefined | null,
): NormalizedLotteryRow<TTeam>[] {
  if (!results?.length) {
    return teams.map((team, index) => ({
      currentPick: index + 1,
      team,
      isFromResult: false,
      change: 0,
    }));
  }

  const byTid = new Map<number, TTeam>();
  teams.forEach(team => {
    const tid = teamTid(team);
    if (Number.isFinite(tid)) byTid.set(tid, team);
  });

  const rowsByPick = new Map<number, NormalizedLotteryRow<TTeam>>();
  const usedTids = new Set<number>();

  for (const result of [...results].sort((a, b) => getLotteryResultPick(a) - getLotteryResultPick(b))) {
    const pick = getLotteryResultPick(result);
    const tid = getLotteryResultTid(result);
    const team = byTid.get(tid);
    if (!team || !Number.isFinite(pick) || pick < 1 || pick > teams.length || rowsByPick.has(pick)) continue;
    const originalSeed = Number(team.originalSeed ?? teams.indexOf(team) + 1);
    rowsByPick.set(pick, {
      currentPick: pick,
      team,
      isFromResult: true,
      change: Number.isFinite(Number(result.change)) ? Number(result.change) : originalSeed - pick,
    });
    usedTids.add(tid);
  }

  const remaining = teams.filter(team => !usedTids.has(teamTid(team)));
  let remainingIndex = 0;
  const normalized: NormalizedLotteryRow<TTeam>[] = [];

  for (let pick = 1; pick <= teams.length; pick++) {
    const row = rowsByPick.get(pick);
    if (row) {
      normalized.push(row);
      continue;
    }
    const team = remaining[remainingIndex++];
    if (!team) continue;
    const originalSeed = Number(team.originalSeed ?? teams.indexOf(team) + 1);
    normalized.push({
      currentPick: pick,
      team,
      isFromResult: false,
      change: originalSeed - pick,
    });
  }

  return normalized;
}
