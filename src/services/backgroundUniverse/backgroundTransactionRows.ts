import type {
  BackgroundTransaction,
  BackgroundTransactionRow,
  BackgroundTransactionTuple,
} from '../../types';

const TYPES: BackgroundTransaction['type'][] = ['draft', 'signing', 'retirement'];

export function unpackBackgroundTransaction(row: BackgroundTransactionRow): BackgroundTransaction {
  if (!Array.isArray(row)) return row;
  return {
    type: TYPES[row[0]],
    playerId: row[1],
    tid: row[2] ?? undefined,
    fromTid: row[3] ?? undefined,
    toTid: row[4] ?? undefined,
    pick: row[5] ?? undefined,
  };
}

export function unpackBackgroundTransactions(rows: BackgroundTransactionRow[] | undefined): BackgroundTransaction[] {
  return (rows ?? []).map(unpackBackgroundTransaction);
}

export function packBackgroundTransactions(rows: BackgroundTransaction[]): BackgroundTransactionTuple[] {
  return rows.map(row => [
    TYPES.indexOf(row.type) as 0 | 1 | 2,
    row.playerId,
    row.tid ?? null,
    row.fromTid ?? null,
    row.toTid ?? null,
    row.pick ?? null,
  ]);
}
