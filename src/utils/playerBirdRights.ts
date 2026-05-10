import type { NBAPlayer } from '../types';

type Txn = { season?: number; tid?: number; type?: string; phase?: number; pickNum?: number };
type TeamRun = { tid: number; startSeason: number; endSeason: number; length: number };

function isNbaTid(tid: unknown): tid is number {
  return typeof tid === 'number' && tid >= 0 && tid <= 29;
}

function normalizeTxType(type: unknown): string {
  return String(type ?? '').trim().toLowerCase();
}

function isBirdRightsResetTxn(txn: Txn): boolean {
  const type = normalizeTxType(txn.type);
  return type === 'freeagent' || type === 'free agent' || type === 'waive' || type === 'waived' || type === 'released';
}

function getRegularSeasonTidRows(player: NBAPlayer): Array<{ season: number; tid: number }> {
  const bySeason = new Map<number, number>();
  for (const row of (player as any).stats ?? []) {
    if (row?.playoffs) continue;
    if ((row?.gp ?? 0) <= 0) continue;
    if (!isNbaTid(row?.tid)) continue;
    const season = Number(row?.season);
    if (!Number.isFinite(season)) continue;
    if (!bySeason.has(season)) bySeason.set(season, row.tid);
  }
  return Array.from(bySeason.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([season, tid]) => ({ season, tid }));
}

function getTeamRuns(player: NBAPlayer): TeamRun[] {
  const rows = getRegularSeasonTidRows(player);
  const runs: TeamRun[] = [];
  for (const row of rows) {
    const prev = runs[runs.length - 1];
    if (prev && prev.tid === row.tid && prev.endSeason === row.season - 1) {
      prev.endSeason = row.season;
      prev.length += 1;
      continue;
    }
    runs.push({ tid: row.tid, startSeason: row.season, endSeason: row.season, length: 1 });
  }
  return runs;
}

function getLatestBirdRightsReset(player: NBAPlayer): { season: number; tid: number } | null {
  const txns = ((player as any).transactions ?? []) as Txn[];
  let latest: { season: number; tid: number } | null = null;
  for (const txn of txns) {
    const season = Number(txn?.season);
    if (!Number.isFinite(season) || !isBirdRightsResetTxn(txn)) continue;
    const tid = isNbaTid(txn?.tid) ? txn.tid : -1;
    if (!latest || season > latest.season) latest = { season, tid };
  }
  return latest;
}

export function resolveBirdRights(player: NBAPlayer): boolean {
  if ((player as any).hasBirdRights === true) return true;
  const runs = getTeamRuns(player);
  if (runs.length === 0) return false;

  const latestReset = getLatestBirdRightsReset(player);
  if (!latestReset) return runs.some(run => run.length >= 3);

  return runs.some(run =>
    run.length >= 3 &&
    run.endSeason >= latestReset.season &&
    (run.startSeason >= latestReset.season || run.tid === latestReset.tid)
  );
}

export function resolveYearsWithCurrentTeam(player: NBAPlayer): number {
  const currentTid = (player as any).tid;
  if (!isNbaTid(currentTid)) return 0;

  const runs = getTeamRuns(player);
  const currentRun = [...runs].reverse().find(run => run.tid === currentTid);
  const runYears = currentRun?.length ?? 0;
  const directYears = Number((player as any).yearsWithTeam ?? 0);
  const safeDirectYears = Number.isFinite(directYears) ? Math.max(0, directYears) : 0;
  return Math.max(runYears, safeDirectYears);
}

export function appendPlayerTransaction(player: NBAPlayer, txn: Txn): Txn[] {
  const existing = ((player as any).transactions ?? []) as Txn[];
  const normalized: Txn = {
    season: Number(txn.season),
    tid: Number(txn.tid),
    ...(txn.type ? { type: txn.type } : {}),
    ...(typeof txn.phase === 'number' ? { phase: txn.phase } : {}),
    ...(typeof txn.pickNum === 'number' ? { pickNum: txn.pickNum } : {}),
  };
  const duplicate = existing.some(entry =>
    Number(entry?.season) === normalized.season &&
    Number(entry?.tid) === normalized.tid &&
    normalizeTxType(entry?.type) === normalizeTxType(normalized.type) &&
    Number(entry?.phase ?? -1) === Number(normalized.phase ?? -1) &&
    Number(entry?.pickNum ?? -1) === Number(normalized.pickNum ?? -1)
  );
  return duplicate ? existing : [...existing, normalized];
}

export function applyTradeToPlayer(player: NBAPlayer, destTid: number, season: number, phase = 0): NBAPlayer {
  if (!isNbaTid(destTid) || player.tid === destTid) return player;
  return {
    ...player,
    tid: destTid,
    yearsWithTeam: 0,
    hasBirdRights: resolveBirdRights(player),
    transactions: appendPlayerTransaction(player, { season, tid: destTid, type: 'trade', phase }),
  } as NBAPlayer;
}

export function repairBirdRightsForLoadedPlayer(player: NBAPlayer): NBAPlayer {
  const nextHasBirdRights = resolveBirdRights(player);
  const currentTid = (player as any).tid;
  const runs = getTeamRuns(player);
  const currentRun = isNbaTid(currentTid) ? [...runs].reverse().find(run => run.tid === currentTid) : undefined;
  let nextYearsWithTeam = resolveYearsWithCurrentTeam(player);
  let nextTransactions = ((player as any).transactions ?? []) as Txn[];

  if (isNbaTid(currentTid)) {
    const latestTxn = nextTransactions[nextTransactions.length - 1];
    if (!latestTxn || Number(latestTxn.tid) !== currentTid) {
      const tradeSeason = currentRun?.startSeason ?? ((player as any).leagueStats?.year ?? undefined);
      nextYearsWithTeam = currentRun?.length ?? 0;
      if (Number.isFinite(tradeSeason as number)) {
        nextTransactions = appendPlayerTransaction(player, {
          season: Number(tradeSeason),
          tid: currentTid,
          type: 'trade',
          phase: 0,
        });
      }
    }
  }

  return {
    ...player,
    yearsWithTeam: nextYearsWithTeam,
    hasBirdRights: nextHasBirdRights,
    ...(nextTransactions !== (player as any).transactions ? { transactions: nextTransactions } : {}),
  } as NBAPlayer;
}
