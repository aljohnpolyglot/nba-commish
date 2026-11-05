import type {
  BackgroundLeagueSeason,
  BackgroundPlayerSeason,
  BackgroundPlayerSeasonRow,
  BackgroundPlayerSeasonTuple,
} from '../../types';

export function unpackBackgroundPlayerRow(row: BackgroundPlayerSeasonRow): BackgroundPlayerSeason {
  if (!Array.isArray(row)) return row;
  return {
    playerId: row[0],
    tid: row[1],
    rating: row[2],
    gp: row[3],
    min: row[4],
    pts: row[5],
    reb: row[6],
    ast: row[7],
    stl: row[8],
    blk: row[9],
    tov: row[10],
    fgPct: row[11],
    tpPct: row[12],
    ftPct: row[13],
    per: row[14],
  };
}

export function unpackBackgroundPlayerRows(rows: BackgroundPlayerSeasonRow[]): BackgroundPlayerSeason[] {
  return rows.map(unpackBackgroundPlayerRow);
}

export function getBackgroundSeasonPlayers(season: BackgroundLeagueSeason): BackgroundPlayerSeason[] {
  return unpackBackgroundPlayerRows(season.players);
}

export function packBackgroundPlayerRows(rows: BackgroundPlayerSeason[]): BackgroundPlayerSeasonTuple[] {
  return rows.map(row => [
    row.playerId,
    row.tid,
    row.rating,
    row.gp,
    row.min,
    row.pts,
    row.reb,
    row.ast,
    row.stl,
    row.blk,
    row.tov,
    row.fgPct,
    row.tpPct,
    row.ftPct,
    row.per,
  ]);
}
