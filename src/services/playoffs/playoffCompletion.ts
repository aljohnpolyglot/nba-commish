import type { Game, PlayoffBracket, PlayoffSeries } from '../../types';

export type PlayoffCompletionFailure =
  | 'BRACKET_MISSING'
  | 'CHAMPION_MISSING'
  | 'CHAMPIONSHIP_SERIES_MISSING'
  | 'CHAMPIONSHIP_SERIES_INCOMPLETE'
  | 'CHAMPIONSHIP_PARTICIPANTS_UNRESOLVED'
  | 'CHAMPIONSHIP_WINNER_INVALID'
  | 'CHAMPION_MISMATCH'
  | 'UPSTREAM_NODE_UNRESOLVED'
  | 'PLAYABLE_SERIES_UNRESOLVED'
  | 'PLACEHOLDER_SERIES_PRESENT'
  | 'REQUIRED_PLAYOFF_GAME_REMAINS';

export interface PlayoffCompletionEvidence {
  complete: boolean;
  reason: PlayoffCompletionFailure | null;
  championTeamId: number | null;
  championshipSeriesId: string | null;
  unresolvedNodeIds: string[];
  unresolvedSeriesIds: string[];
  placeholderSeriesIds: string[];
  requiredGameIds: number[];
}

const realParticipant = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;
const realSeed = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0 && Number(value) < 99;

const championshipSeries = (bracket: PlayoffBracket): PlayoffSeries | undefined => {
  const finals = bracket.series.filter(series => series.conference === 'Finals');
  if (finals.length > 0) return finals.sort((left, right) => right.round - left.round)[0];
  const maxRound = Math.max(0, ...bracket.series.map(series => series.round));
  const finalRound = bracket.series.filter(series => series.round === maxRound);
  return finalRound.length === 1 ? finalRound[0] : undefined;
};

/**
 * Proves postseason completion from real participant/result evidence. The
 * persisted convenience boolean is deliberately not an input to this result.
 */
export function getPlayoffCompletionEvidence(
  bracket: PlayoffBracket | null | undefined,
  schedule: readonly Game[] = [],
): PlayoffCompletionEvidence {
  const base = {
    championTeamId: realParticipant(bracket?.champion) ? Number(bracket?.champion) : null,
    championshipSeriesId: null as string | null,
    unresolvedNodeIds: bracket?.nodes?.filter(node => node.status !== 'complete').map(node => node.id).sort() ?? [],
    unresolvedSeriesIds: bracket?.series.filter(series => series.status !== 'complete').map(series => series.id).sort() ?? [],
    placeholderSeriesIds: bracket?.series.filter(series => (
      !realParticipant(series.higherSeedTid)
      || !realParticipant(series.lowerSeedTid)
      || !realSeed(series.higherSeed)
      || !realSeed(series.lowerSeed)
    )).map(series => series.id).sort() ?? [],
    requiredGameIds: [] as number[],
  };
  if (!bracket) return { ...base, complete: false, reason: 'BRACKET_MISSING' };
  if (base.championTeamId == null) return { ...base, complete: false, reason: 'CHAMPION_MISSING' };

  const finals = championshipSeries(bracket);
  if (!finals) return { ...base, complete: false, reason: 'CHAMPIONSHIP_SERIES_MISSING' };
  base.championshipSeriesId = finals.id;
  if (finals.status !== 'complete') return { ...base, complete: false, reason: 'CHAMPIONSHIP_SERIES_INCOMPLETE' };
  if (!realParticipant(finals.higherSeedTid) || !realParticipant(finals.lowerSeedTid)) {
    return { ...base, complete: false, reason: 'CHAMPIONSHIP_PARTICIPANTS_UNRESOLVED' };
  }
  if (finals.winnerId !== finals.higherSeedTid && finals.winnerId !== finals.lowerSeedTid) {
    return { ...base, complete: false, reason: 'CHAMPIONSHIP_WINNER_INVALID' };
  }
  if (Number(finals.winnerId) !== base.championTeamId) {
    return { ...base, complete: false, reason: 'CHAMPION_MISMATCH' };
  }
  if (base.unresolvedNodeIds.length > 0) {
    return { ...base, complete: false, reason: 'UPSTREAM_NODE_UNRESOLVED' };
  }
  if (base.unresolvedSeriesIds.length > 0) {
    const unresolved = new Set(base.unresolvedSeriesIds);
    base.requiredGameIds = schedule
      .filter(game => game.isPlayoff && !game.played && !!game.playoffSeriesId && unresolved.has(game.playoffSeriesId))
      .map(game => game.gid)
      .sort((left, right) => left - right);
    return {
      ...base,
      complete: false,
      reason: base.requiredGameIds.length > 0 ? 'REQUIRED_PLAYOFF_GAME_REMAINS' : 'PLAYABLE_SERIES_UNRESOLVED',
    };
  }
  if (base.placeholderSeriesIds.length > 0) {
    return { ...base, complete: false, reason: 'PLACEHOLDER_SERIES_PRESENT' };
  }
  return { ...base, complete: true, reason: null };
}

export const isPlayoffCompletionProvable = (
  bracket: PlayoffBracket | null | undefined,
  schedule: readonly Game[] = [],
): boolean => getPlayoffCompletionEvidence(bracket, schedule).complete;

/** The visible/action round is the earliest real active series/node. */
export function getCanonicalCurrentPlayoffRound(bracket: PlayoffBracket | null | undefined): number {
  if (!bracket) return 1;
  const activeSeriesRounds = bracket.series
    .filter(series => series.status === 'active')
    .map(series => series.round);
  if (activeSeriesRounds.length > 0) return Math.min(...activeSeriesRounds);
  const activeNodeRounds = (bracket.nodes ?? [])
    .filter(node => node.status === 'active' || node.status === 'ready')
    .map(node => node.roundIndex);
  if (activeNodeRounds.length > 0) return Math.min(...activeNodeRounds);
  const completedRounds = bracket.series
    .filter(series => series.status === 'complete')
    .map(series => series.round);
  return completedRounds.length > 0 ? Math.max(...completedRounds) : 1;
}
