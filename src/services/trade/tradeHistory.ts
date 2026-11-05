import type { HistoryEntry, TransactionDto, TradeTransactionDetails } from '../../types';
import { normalizeDate } from '../../utils/helpers';

export function buildTradeHistoryMetadata(
  transaction: TransactionDto,
  date: string,
  transactionId?: string,
): Pick<HistoryEntry, 'transactionId' | 'teamIds' | 'playerIds' | 'trade'> {
  const teamIds = Object.keys(transaction.teams).map(Number);
  if (teamIds.length !== 2) throw new Error('Trade history requires exactly two transaction teams.');
  const movements = teamIds.flatMap(fromTeamId => {
    const toTeamId = teamIds.find(teamId => teamId !== fromTeamId);
    if (toTeamId === undefined) return [];
    const assets = transaction.teams[fromTeamId];
    return [{
      fromTeamId,
      toTeamId,
      playerIds: assets.playersSent.map(player => player.internalId),
      draftPicks: assets.picksSent.map(({ dpid, season, round, originalTid }) => ({ dpid, season, round, originalTid })),
      ...(assets.cashSentUSD ? { cashUSD: assets.cashSentUSD } : {}),
    }];
  });
  const trade: TradeTransactionDetails = { transactionDate: normalizeDate(date), movements };
  const resolvedTransactionId = transactionId ?? `trade:${trade.transactionDate}:${movements.map(movement => [
    movement.fromTeamId,
    movement.toTeamId,
    ...movement.playerIds,
    ...movement.draftPicks.map(pick => pick.dpid),
    movement.cashUSD ?? 0,
  ].join('-')).join(':')}`;
  return {
    transactionId: resolvedTransactionId,
    teamIds,
    playerIds: [...new Set(movements.flatMap(movement => movement.playerIds))],
    trade,
  };
}
