import type { DraftPick, GameState, NBATeam } from '../../types';

export type DraftOrderTeam = NBATeam & {
  _originalTid: number;
  _originalAbbrev: string;
  _originalName: string;
  _traded: boolean;
  _r2?: boolean;
};

function resolveSourceRoundOneOrder(state: GameState): NBATeam[] {
  const lotteryResults: any[] = state.draftLotteryResult ?? [];
  const getResultPick = (r: any) => Number(r?.pick ?? r?.pickNumber ?? 0);
  const getResultTid = (r: any) => Number(r?.team?.tid ?? r?.tid ?? r?.team?.id);
  const lotteryTids = new Set(lotteryResults.map(getResultTid).filter(Number.isFinite));

  const allSorted = [...state.teams]
    .filter(t => t.id >= 0 && t.id < 100)
    .sort((a, b) => {
      const wa = a.wins / Math.max(1, a.wins + a.losses);
      const wb = b.wins / Math.max(1, b.wins + b.losses);
      return wa - wb;
    });

  if (lotteryResults.length < 14) return allSorted;

  const lotteryPicks = [...lotteryResults]
    .sort((a: any, b: any) => getResultPick(a) - getResultPick(b))
    .map((r: any) => state.teams.find(t => t.id === getResultTid(r)))
    .filter(Boolean) as NBATeam[];

  const playoffTeams = allSorted
    .filter(t => !lotteryTids.has(t.id))
    .reverse();

  return [...lotteryPicks, ...playoffTeams];
}

export function buildDraftOrderFromState(state: GameState): DraftOrderTeam[] {
  const draftSeason: number = state.leagueStats?.year ?? 2026;
  const currentSeasonPicks = ((state.draftPicks ?? []) as DraftPick[]).filter(dp => dp.season === draftSeason);
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
    };

    if (currentOwnerTid == null || currentOwnerTid === originalTeam.id) {
      return { ...originalTeam, ...baseMeta, _traded: false };
    }

    const newOwner = state.teams.find(t => t.id === currentOwnerTid);
    if (!newOwner) return { ...originalTeam, ...baseMeta, _traded: false };
    return { ...newOwner, ...baseMeta, _traded: true };
  };

  const roundOne = resolveSourceRoundOneOrder(state);
  return [
    ...roundOne.map(team => resolveOwner(1, team)),
    ...roundOne.map(team => ({ ...resolveOwner(2, team), _r2: true })),
  ];
}
