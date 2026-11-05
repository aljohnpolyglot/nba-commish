import type {
  CompetitionAwardKind,
  CompetitionDate,
  CompetitionPrizePool,
  CompetitionTiebreaker,
} from '../types';

export type CupScope = {
  leagueId: string;
  competitionId: string;
};

export interface CupGroupSpec {
  id: string;
  label: string;
  size: number;
  poolId?: string;
  gamesPerTeam?: number;
}

export interface CupWildcardRule {
  count: number;
  poolId?: string;
}

export interface CupKnockoutRoundSpec {
  id: string;
  label: string;
  participants: number;
  bestOf: number;
  date: CompetitionDate;
}

export interface CupAwardSpec {
  id: string;
  label: string;
  kind: CompetitionAwardKind;
  selectionCount: number;
}

export interface CupCompetitionFormat extends CupScope {
  schemaVersion: 1;
  displayName: string;
  shortName: string;
  enabled: boolean;
  teamCount: number;
  groups: CupGroupSpec[];
  groupStage: {
    gamesPerTeam: number;
    dates: CompetitionDate[];
    tiebreakers: CompetitionTiebreaker[];
  };
  qualification: {
    directPerGroup: number;
    wildcards: CupWildcardRule[];
    wildcardTiebreakers: CompetitionTiebreaker[];
    seeding: 'overall' | 'group-rank-protected';
  };
  knockoutRounds: CupKnockoutRoundSpec[];
  awards: CupAwardSpec[];
  prizePool: CompetitionPrizePool;
  history: {
    retainSeasons?: number;
  };
}

export interface CupTeamSeed {
  tid: number;
  seed?: number;
  poolId?: string;
  groupHint?: string;
}

export interface CupGroupAssignment {
  groupId: string;
  poolId?: string;
  tids: number[];
}

export interface CupGroupAssignmentResult {
  groups: CupGroupAssignment[];
  unassignedTids: number[];
}

export interface CupResult extends CupScope {
  season: number;
  homeTid: number;
  awayTid: number;
  homeScore: number;
  awayScore: number;
  played: boolean;
  date?: string;
}

export interface CupStanding {
  groupId: string;
  poolId?: string;
  tid: number;
  rank: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
}

export interface CupQualifier {
  tid: number;
  seed: number;
  source: 'direct' | 'wildcard';
  groupId: string;
  groupRank: number;
  poolId?: string;
}

export interface CupBracketMatch {
  roundId: string;
  slot: number;
  homeSeed: number;
  awaySeed: number;
  homeTid: number;
  awayTid: number;
  winnerTid?: number;
}

export interface CupAwardWinner {
  awardId: string;
  playerId: string;
  teamTid?: number;
}

export interface CupSeasonHistory extends CupScope {
  season: number;
  championTid: number | null;
  runnerUpTid: number | null;
  awards: CupAwardWinner[];
  prizePool: CompetitionPrizePool;
}

export interface CupCompetitionState extends CupScope {
  schemaVersion: 1;
  season: number;
  status: 'scheduled' | 'group-stage' | 'knockout' | 'complete';
  format: CupCompetitionFormat;
  groups: CupGroupAssignment[];
  standings: CupStanding[];
  qualifiers: CupQualifier[];
  bracket: CupBracketMatch[];
  awards: CupAwardWinner[];
  prizePool: CompetitionPrizePool;
  history: CupSeasonHistory[];
}

export type CupCompetitionStateMap = Record<string, CupCompetitionState>;

export interface CupFormatValidation {
  valid: boolean;
  errors: string[];
}
