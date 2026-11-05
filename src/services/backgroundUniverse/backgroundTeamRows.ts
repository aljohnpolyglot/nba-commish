import type {
  BackgroundLeagueSeason,
  BackgroundTeamSeason,
  BackgroundTeamSeasonRow,
  BackgroundTeamSeasonTuple,
} from '../../types';

export function unpackBackgroundTeamRow(row: BackgroundTeamSeasonRow): BackgroundTeamSeason {
  if (!Array.isArray(row)) return row;
  return {
    tid: row[0],
    won: row[1],
    lost: row[2],
    seed: row[3],
    strength: row[4],
  };
}

export function unpackBackgroundTeamRows(rows: BackgroundTeamSeasonRow[]): BackgroundTeamSeason[] {
  return rows.map(unpackBackgroundTeamRow);
}

export function getBackgroundSeasonTeams(season: BackgroundLeagueSeason): BackgroundTeamSeason[] {
  return unpackBackgroundTeamRows(season.teams);
}

export function packBackgroundTeamRows(rows: BackgroundTeamSeason[]): BackgroundTeamSeasonTuple[] {
  return rows.map(row => [row.tid, row.won, row.lost, row.seed, row.strength]);
}
