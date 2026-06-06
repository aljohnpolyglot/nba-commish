import { NBAPlayer } from '../../../types';

export type StatType = 'perGame' | 'per36' | 'totals' | 'advanced' | 'shotLocations';
export type Phase = 'regular' | 'playoffs' | 'combined' | 'cup';
export type SeasonMode = number | 'career' | 'all';

export type SortField =
  | 'name' | 'pos' | 'age' | 'team' | 'gp' | 'gs' | 'min'
  | 'fg' | 'fga' | 'fgPct' | 'tp' | 'tpa' | 'tpPct' | 'fp' | 'fpa' | 'fpPct'
  | 'twop' | 'twopa' | 'twopPct' | 'efgPct'
  | 'ft' | 'fta' | 'ftPct'
  | 'orb' | 'drb' | 'trb' | 'ast' | 'tov' | 'stl' | 'blk' | 'pf' | 'pts' | 'pm'
  | 'per' | 'ewa' | 'tsPct' | 'efgPctA' | 'usgPct' | 'ortg' | 'drtg'
  | 'bpm' | 'obpm' | 'dbpm' | 'ws' | 'ows' | 'dws' | 'ws48' | 'vorp'
  | 'orbPct' | 'drbPct' | 'trbPct' | 'astPct' | 'stlPct' | 'blkPct' | 'tovPct'
  | 'threePAr' | 'ftRate'
  | 'rimFgm' | 'rimFga' | 'rimFgPct' | 'lpFgm' | 'lpFga' | 'lpFgPct'
  | 'mrFgm' | 'mrFga' | 'mrFgPct' | 'slTpm' | 'slTpa' | 'slTpPct'
  | 'ba' | 'dd' | 'td' | 'qd' | 'fiveX5' | 'dunks' | 'techs' | 'pip';

export interface ComputedRow {
  player: NBAPlayer;
  season: number | 'career';
  seasonLabel?: string;
  teamAbbrev: string;
  age: number;
  gp: number;
  gs: number;
  min: number;
  fg: number;
  fga: number;
  fgPct: number;
  tp: number;
  tpa: number;
  tpPct: number;
  fp: number;
  fpa: number;
  fpPct: number;
  twop: number;
  twopa: number;
  twopPct: number;
  efgPct: number;
  ft: number;
  fta: number;
  ftPct: number;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  tov: number;
  stl: number;
  blk: number;
  pf: number;
  pts: number;
  pm: number;
  per: number;
  ewa: number;
  tsPct: number;
  efgPctA: number;
  usgPct: number;
  ortg: number;
  drtg: number;
  bpm: number;
  obpm: number;
  dbpm: number;
  ws: number;
  ows: number;
  dws: number;
  ws48: number;
  vorp: number;
  orbPct: number;
  drbPct: number;
  trbPct: number;
  astPct: number;
  stlPct: number;
  blkPct: number;
  tovPct: number;
  threePAr: number;
  ftRate: number;
  rimFgm?: number;
  rimFga?: number;
  rimFgPct?: number;
  lpFgm?: number;
  lpFga?: number;
  lpFgPct?: number;
  mrFgm?: number;
  mrFga?: number;
  mrFgPct?: number;
  slTpm?: number;
  slTpa?: number;
  slTpPct?: number;
  ba?: number;
  dd?: number;
  td?: number;
  qd?: number;
  fiveX5?: number;
  dunks?: number;
  techs?: number;
  pip?: number;
  fromBref?: boolean;
}

export interface PlayerStatsColumn {
  key: SortField;
  label: string;
  title?: string;
  dim?: boolean;
}

export interface ShotLocAgg {
  rimFgm: number;
  rimFga: number;
  lpFgm: number;
  lpFga: number;
  mrFgm: number;
  mrFga: number;
  tpFgm: number;
  tpFga: number;
  ba: number;
  dd: number;
  td: number;
  qd: number;
  fiveX5: number;
  dunks: number;
  techs: number;
  pip: number;
}
