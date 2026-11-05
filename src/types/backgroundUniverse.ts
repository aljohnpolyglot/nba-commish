export interface BackgroundTeamSeason {
  tid: number;
  won: number;
  lost: number;
  seed: number;
  strength: number;
}

export type BackgroundTeamSeasonTuple = [
  tid: number,
  won: number,
  lost: number,
  seed: number,
  strength: number,
];

export type BackgroundTeamSeasonRow = BackgroundTeamSeason | BackgroundTeamSeasonTuple;

export interface BackgroundPlayerSeason {
  playerId: string;
  tid: number;
  rating: number;
  gp: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgPct: number;
  tpPct: number;
  ftPct: number;
  per: number;
}

export type BackgroundPlayerSeasonTuple = [
  playerId: string,
  tid: number,
  rating: number,
  gp: number,
  min: number,
  pts: number,
  reb: number,
  ast: number,
  stl: number,
  blk: number,
  tov: number,
  fgPct: number,
  tpPct: number,
  ftPct: number,
  per: number,
];

export type BackgroundPlayerSeasonRow = BackgroundPlayerSeason | BackgroundPlayerSeasonTuple;

export type BackgroundContractCurrency = 'USD' | 'EUR' | 'PHP' | 'JPY' | 'CNY' | 'AUD';

export interface BackgroundPlayerIdentity {
  playerId: string;
  personId?: string;
  name: string;
  bornYear?: number;
  nationality?: string;
  pos: string;
  generated: boolean;
}

export type BackgroundPlayerIdentityTuple = [
  playerId: string,
  name: string,
  bornYear: number | null,
  nationality: string | null,
  pos: string,
  personId?: string,
];

export type BackgroundPlayerIdentityRow = BackgroundPlayerIdentity | BackgroundPlayerIdentityTuple;

export interface BackgroundRosterEntry {
  playerId: string;
  tid: number;
  rating: number;
  potential: number;
  rookieSeason: number;
  contractAmount: number;
  contractCurrency: BackgroundContractCurrency;
  contractExpires: number;
}

export interface BackgroundTransaction {
  type: 'draft' | 'signing' | 'retirement';
  playerId: string;
  tid?: number;
  fromTid?: number;
  toTid?: number;
  pick?: number;
}

export type BackgroundTransactionTuple = [
  type: 0 | 1 | 2,
  playerId: string,
  tid: number | null,
  fromTid: number | null,
  toTid: number | null,
  pick: number | null,
];

export type BackgroundTransactionRow = BackgroundTransaction | BackgroundTransactionTuple;

export interface BackgroundAward {
  type: 'MVP' | 'DPOY' | 'ROY' | 'SMOY' | 'MIP';
  playerId: string;
  tid: number;
}

export interface BackgroundRecord {
  type: 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | 'PER';
  playerId: string;
  tid: number;
  value: number;
}

export interface BackgroundLeagueSeason {
  leagueId: string;
  season: number;
  seed: string;
  source: 'historical' | 'simulated';
  championTid?: number;
  runnerUpTid?: number;
  teams: BackgroundTeamSeasonRow[];
  players: BackgroundPlayerSeasonRow[];
  awards: BackgroundAward[];
  records: BackgroundRecord[];
  roster?: BackgroundRosterEntry[];
  transactions?: BackgroundTransactionRow[];
}

export interface BackgroundUniverseStateV1 {
  version: 1;
  generatedThroughSeason: number;
  seasons: BackgroundLeagueSeason[];
}

export interface BackgroundUniverseStateV2 {
  version: 2;
  generatedThroughSeason: number;
  seasons: BackgroundLeagueSeason[];
  identities: BackgroundPlayerIdentityRow[];
  nativeHydrations?: Array<[tid: number, snapshotSeason: number, nativeSeason: number]>;
}

export type BackgroundUniverseState = BackgroundUniverseStateV1 | BackgroundUniverseStateV2;
