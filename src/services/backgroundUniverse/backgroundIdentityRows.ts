import type {
  BackgroundPlayerIdentity,
  BackgroundPlayerIdentityRow,
  BackgroundPlayerIdentityTuple,
} from '../../types';

export function unpackBackgroundIdentity(row: BackgroundPlayerIdentityRow): BackgroundPlayerIdentity {
  if (!Array.isArray(row)) return row;
  return {
    playerId: row[0],
    name: row[1],
    bornYear: row[2] ?? undefined,
    nationality: row[3] ?? undefined,
    pos: row[4],
    personId: row[5],
    generated: true,
  };
}

export function unpackBackgroundIdentities(rows: BackgroundPlayerIdentityRow[]): BackgroundPlayerIdentity[] {
  return rows.map(unpackBackgroundIdentity);
}

export function packBackgroundIdentities(rows: BackgroundPlayerIdentity[]): BackgroundPlayerIdentityTuple[] {
  return rows.map(row => [
    row.playerId,
    row.name,
    row.bornYear ?? null,
    row.nationality ?? null,
    row.pos,
    row.personId,
  ]);
}
