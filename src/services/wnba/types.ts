import type { CupSeasonHistory } from '../competition/cup';

export interface WnbaTeamIdentitySnapshot {
  tid: number;
  franchiseId: string;
  season: number;
  region: string;
  name: string;
  abbrev: string;
  cid: number;
  did: number;
  active: boolean;
  imgURL?: string;
  colors?: string[];
}

export interface WnbaFranchiseLineage {
  franchiseId: string;
  tids: number[];
}

export interface WnbaLeagueRuleSnapshot {
  season: number;
  gamesPerSeason: number;
  numPlayoffTeams: number;
  numPlayoffByes: number;
  playoffEntryRounds?: number[];
  numGamesPlayoffSeries: number[];
  inSeasonTournament: boolean;
  cupCompetitionId?: string;
  tradeDeadlineMonth?: number;
  tradeDeadlineOrdinal?: number;
  tradeDeadlineDayOfWeek?: 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';
  announcedAt?: string;
}

export interface WnbaLeagueEvent {
  id: string;
  season: number;
  type: 'expansion' | 'relocation' | 'rename' | 'contraction' | 'rule-change';
  franchiseId?: string;
  fromTid?: number;
  toTid?: number;
  title: string;
  summary: string;
}

export interface HistoricalWnbaState {
  schemaVersion: 1;
  sourceSeason: number;
  identityTimeline: WnbaTeamIdentitySnapshot[];
  franchiseLineages: WnbaFranchiseLineage[];
  ruleTimeline: WnbaLeagueRuleSnapshot[];
  events: WnbaLeagueEvent[];
  commissionersCupHistory: CupSeasonHistory[];
}
