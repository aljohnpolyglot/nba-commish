import type { DraftPick, GameState, NBATeam } from '../../types';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import { normalizeLotteryRows } from './lotteryOrder';
import { getDraftSeasonYearForState } from '../offseason/offseasonState';
import { buildDraftLotteryPool } from './draftLotteryPool';

export type DraftOrderTeam = NBATeam & {
  _originalTid: number;
  _originalAbbrev: string;
  _originalName: string;
  _originalWins: number;
  _originalLosses: number;
  _traded: boolean;
  _round?: number;
  _roundSize?: number;
  _r2?: boolean;
  _forfeited?: boolean;
};

/** Preserve slot numbers and saved selections; only the entitlement is removed. */
export function applyDraftPickForfeitures<T extends { id: number; _originalTid?: number; _round?: number; _r2?: boolean; _forfeited?: boolean }>(
  order: T[], picks: DraftPick[], season: number,
): T[] {
  const forfeited = new Set(picks.filter(pick => pick.season === season && pick.forfeiture)
    .map(pick => `${pick.originalTid}:${pick.round}`));
  if (forfeited.size === 0) return order;
  return order.map(team => forfeited.has(`${team._originalTid ?? team.id}:${team._round ?? (team._r2 ? 2 : 1)}`)
    ? { ...team, _forfeited: true }
    : team);
}

function resolveSourceRoundOneOrder(state: GameState): NBATeam[] {
  const lotteryResults: any[] = state.draftLotteryResult ?? [];
  const draftSeason = getDraftSeasonYearForState(state);

  const pool = buildDraftLotteryPool(state, draftSeason);
  const allSorted = pool.fullOrder;

  if (!isDraftLotteryEnabled(state.leagueStats?.draftType) || lotteryResults.length === 0) return allSorted;
  const lotteryPoolSize = pool.teams.length;
  const lotteryPool = pool.teams.map(row => ({ ...row.sourceTeam, originalSeed: row.originalSeed }));
  const playoffPool = allSorted.slice(lotteryPoolSize);

  const lotteryPicks = normalizeLotteryRows(lotteryPool, lotteryResults).map(row => row.team as NBATeam);

  const playoffTeams = playoffPool
    .reverse();

  return [...lotteryPicks, ...playoffTeams];
}

export function buildDraftOrderFromState(state: GameState): DraftOrderTeam[] {
  const draftSeason = getDraftSeasonYearForState(state);
  const currentSeasonPicks = ((state.draftPicks ?? []) as DraftPick[]).filter(dp => dp.season === draftSeason);
  const ledger = Number(state.seasonLifecycle?.draft.year) === draftSeason
    ? state.seasonLifecycle?.draft.orderLedger ?? []
    : [];
  if (ledger.length > 0) {
    const roundSize = ledger.filter(slot => slot.round === 1).length;
    return [...ledger]
      .sort((left, right) => left.overallPick - right.overallPick)
      .flatMap(slot => {
        const pickAsset = currentSeasonPicks.find(pick => (
          pick.round === slot.round && pick.originalTid === slot.originalTeamId
        ));
        const ownerId = slot.disposition === 'open' && pickAsset ? pickAsset.tid : slot.currentOwnerTeamId;
        const owner = state.teams.find(team => team.id === ownerId);
        const original = state.teams.find(team => team.id === slot.originalTeamId);
        if (!owner || !original) return [];
        return [{
          ...owner,
          _originalTid: original.id,
          _originalAbbrev: original.abbrev,
          _originalName: original.name,
          _originalWins: original.wins,
          _originalLosses: original.losses,
          _traded: owner.id !== original.id,
          _round: slot.round,
          _roundSize: roundSize,
          _r2: slot.round === 2,
          _forfeited: slot.disposition === 'forfeited' || !!pickAsset?.forfeiture,
        }];
      });
  }
  const r1TradedMap = new Map<number, number>();
  const r2TradedMap = new Map<number, number>();

  for (const dp of currentSeasonPicks) {
    if (dp.tid === dp.originalTid) continue;
    if (dp.round === 1) r1TradedMap.set(dp.originalTid, dp.tid);
    if (dp.round === 2) r2TradedMap.set(dp.originalTid, dp.tid);
  }

  const resolveOwner = (round: number, originalTeam: NBATeam): DraftOrderTeam => {
    const currentOwnerTid = (round === 1 ? r1TradedMap : r2TradedMap).get(originalTeam.id);
    const baseMeta = {
      _originalTid: originalTeam.id,
      _originalAbbrev: originalTeam.abbrev,
      _originalName: originalTeam.name,
      _originalWins: originalTeam.wins,
      _originalLosses: originalTeam.losses,
      _forfeited: currentSeasonPicks.some(pick => pick.round === round && pick.originalTid === originalTeam.id && pick.forfeiture),
    };

    if (currentOwnerTid == null || currentOwnerTid === originalTeam.id) {
      return { ...originalTeam, ...baseMeta, _traded: false };
    }

    const newOwner = state.teams.find(t => t.id === currentOwnerTid);
    if (!newOwner) return { ...originalTeam, ...baseMeta, _traded: false };
    return { ...newOwner, ...baseMeta, _traded: true };
  };

  const roundOne = resolveSourceRoundOneOrder(state);
  const roundSize = roundOne.length;
  return [
    ...roundOne.map(team => ({ ...resolveOwner(1, team), _round: 1, _roundSize: roundSize })),
    ...roundOne.map(team => ({ ...resolveOwner(2, team), _round: 2, _roundSize: roundSize, _r2: true })),
  ];
}
