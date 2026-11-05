import type { NBAPlayer } from '../types';
import { resolveYearsWithCurrentTeamFromStats } from './playerTenure';
import { isExternalLeaguePlayer } from './playerLeagueScope';

type Txn = NonNullable<NBAPlayer['transactions']>[number];
type TxnInput = Partial<Txn>;
type ServiceRow = { season: number; tid: number };

function isNbaTid(tid: unknown): tid is number {
  return typeof tid === 'number' && tid >= 0 && tid < 100;
}

function isRosterTid(tid: unknown): tid is number {
  return typeof tid === 'number' && tid >= 0;
}

function normalizeTxType(type: unknown): string {
  return String(type ?? '').trim().toLowerCase();
}

function isBirdRightsResetTxn(txn: TxnInput): boolean {
  const type = normalizeTxType(txn.type);
  return type === 'waive' || type === 'waived' || type === 'released';
}

function getRegularSeasonTidRows(player: NBAPlayer): ServiceRow[] {
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

function getLatestBirdRightsReset(player: NBAPlayer): { season: number } | null {
  const txns = ((player as any).transactions ?? []) as TxnInput[];
  let latest: { season: number } | null = null;
  for (const txn of txns) {
    const season = Number(txn?.season);
    if (!Number.isFinite(season) || !isBirdRightsResetTxn(txn)) continue;
    if (!latest || season > latest.season) latest = { season };
  }
  return latest;
}

function getLatestNbaSigning(player: NBAPlayer): { season: number; tid: number } | null {
  let latest: { season: number; tid: number } | null = null;
  for (const txn of (((player as any).transactions ?? []) as TxnInput[])) {
    const type = normalizeTxType(txn.type).replace(/\s+/g, '');
    const season = Number(txn.season);
    if (type !== 'freeagent' || !Number.isFinite(season) || !isNbaTid(txn.tid)) continue;
    if (!latest || season >= latest.season) latest = { season, tid: Number(txn.tid) };
  }
  return latest;
}

function getContinuousServiceThrough(rows: ServiceRow[], season: number, notBefore: number): ServiceRow[] {
  const eligible = rows.filter(row => row.season <= season && row.season >= notBefore);
  if (eligible.length === 0) return [];
  const result: ServiceRow[] = [eligible[eligible.length - 1]];
  for (let index = eligible.length - 2; index >= 0; index--) {
    if (eligible[index].season !== result[0].season - 1) break;
    result.unshift(eligible[index]);
  }
  return result;
}

export function resolveBirdRightsHolderTeam(player: NBAPlayer, season?: number): number {
  const rows = getRegularSeasonTidRows(player);
  const resolvedSeason = Number.isFinite(Number(season))
    ? Number(season)
    : rows.at(-1)?.season ?? Number((player as any).birdRightsSeason ?? 0);
  const explicitTeam = Number((player as any).birdRightsTeamId);
  const explicitSeason = Number((player as any).birdRightsSeason);
  if (isNbaTid(explicitTeam) && (!Number.isFinite(explicitSeason) || explicitSeason >= resolvedSeason)) return explicitTeam;

  const signing = getLatestNbaSigning(player);
  if (signing && signing.season > (rows.at(-1)?.season ?? 0)) return signing.tid;
  const lastRow = [...rows].reverse().find(row => row.season <= resolvedSeason);
  if (lastRow) return lastRow.tid;
  return isNbaTid(player.tid) ? player.tid : -1;
}

export function resolveBirdRightsForTeam(player: NBAPlayer, teamId: number, season: number): boolean {
  if (!isNbaTid(teamId) || !Number.isFinite(season)) return false;
  if (resolveBirdRightsHolderTeam(player, season) !== teamId) return false;

  const reset = getLatestBirdRightsReset(player);
  const signing = getLatestNbaSigning(player);
  const serviceStart = Math.max(
    reset ? reset.season + 1 : Number.NEGATIVE_INFINITY,
    signing ? signing.season : Number.NEGATIVE_INFINITY,
  );
  const continuous = getContinuousServiceThrough(getRegularSeasonTidRows(player), season, serviceStart);
  return continuous.length >= 3;
}

export function resolveBirdRights(player: NBAPlayer): boolean {
  const rows = getRegularSeasonTidRows(player);
  const season = rows.at(-1)?.season ?? Number((player as any).birdRightsSeason ?? 0);
  const holder = resolveBirdRightsHolderTeam(player, season);
  return holder >= 0 && resolveBirdRightsForTeam(player, holder, season);
}

export function resolveYearsWithCurrentTeam(player: NBAPlayer): number {
  const currentTid = (player as any).tid;
  if (!isNbaTid(currentTid)) return 0;
  return resolveYearsWithCurrentTeamFromStats(player);
}

export function appendPlayerTransaction(player: NBAPlayer, txn: TxnInput): Txn[] {
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
  if (!isRosterTid(destTid) || player.tid === destTid) return player;
  const traded = {
    ...player,
    tid: destTid,
    yearsWithTeam: 0,
    transactions: appendPlayerTransaction(player, { season, tid: destTid, type: 'trade', phase }),
  } as NBAPlayer;
  const carriesRights = resolveBirdRights(player);
  return isNbaTid(destTid) ? {
    ...traded,
    hasBirdRights: carriesRights,
    ...(carriesRights ? { birdRightsTeamId: destTid, birdRightsSeason: season } : {}),
  } as NBAPlayer : traded;
}

export function repairBirdRightsForLoadedPlayer(player: NBAPlayer): NBAPlayer {
  const currentTid = (player as any).tid;
  const nextHasBirdRights = isExternalLeaguePlayer(player)
    || (Number.isFinite(Number(currentTid)) && Number(currentTid) >= 0 && !isNbaTid(currentTid))
    ? false
    : resolveBirdRights(player);
  const rows = getRegularSeasonTidRows(player);
  const currentRows = isNbaTid(currentTid) ? rows.filter(row => row.tid === currentTid) : [];
  let nextYearsWithTeam = resolveYearsWithCurrentTeam(player);
  let nextTransactions = ((player as any).transactions ?? []) as Txn[];

  if (isNbaTid(currentTid)) {
    const latestTxn = nextTransactions[nextTransactions.length - 1];
    if (!latestTxn || Number(latestTxn.tid) !== currentTid) {
      const tradeSeason = currentRows[0]?.season ?? ((player as any).leagueStats?.year ?? undefined);
      nextYearsWithTeam = currentRows.length;
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
