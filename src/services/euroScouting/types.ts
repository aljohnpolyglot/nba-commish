import type { NBAPlayer } from '../../types';

export interface EuroCountryProfile {
  id: string;
  iso2: string;
  name: string;
  region: string;
  talentRating: number;
  heightRating: number;
  athleticismRating: number;
  basketballPopularity: number;
  population: number;
}

export type EuroScoutedProspect = NBAPlayer & {
  scoutingAssignmentId: string;
  scoutingCountryId: string;
  scoutingCountryName: string;
  discoveredDay: number;
  euroGeneratedYouth?: true;
  academyOverall?: number;
  academyPotential?: number;
  academyRatingVersion?: 1 | 2;
};

export type EuroAcademyPlayer = NBAPlayer & {
  euroAcademyPlayer: true;
  euroGeneratedYouth?: true;
  academyOverall?: number;
  academyPotential?: number;
  academyRatingVersion?: 1 | 2;
  academyTeamId: number;
  academyJoinedDate: string;
  academyJoinedDay: number;
  academyLastProgressDay: number;
  developmentArchetype?: string;
};

export interface EuroScoutingAssignment {
  id: string;
  scoutId: string;
  scoutName: string;
  scoutPortraitUrl?: string;
  scoutRating: number;
  countryId: string;
  countryName: string;
  startedDay: number;
  startedDate: string;
  durationDays: number;
  costEUR: number;
  status: 'active' | 'ready' | 'finalized';
  prospects: EuroScoutedProspect[];
  assignedProspectIds: string[];
  completedDay?: number;
  notificationSent?: boolean;
  reviewed?: boolean;
}

export interface EuroScoutingCountryHistory {
  timesScouted: number;
  lastScoutedDate?: string;
}

export interface EuroScoutingState {
  version: 1;
  legacyAcademyMigrated?: boolean;
  assignments: EuroScoutingAssignment[];
  academyPlayers: EuroAcademyPlayer[];
  countryHistory: Record<string, EuroScoutingCountryHistory>;
  preparedNbaDraftSeasons?: number[];
  nbaDraftOutcomes?: EuroNbaDraftOutcome[];
  nbaDraftDepartures?: NBAPlayer[];
  preparedNbaDraftDecisionSeasons?: number[];
  nbaDraftDecisions?: EuroNbaDraftDecision[];
}

export interface EuroNbaDraftOutcome {
  id: string;
  season: number;
  playerId: string;
  playerName: string;
  sourceTeamTid: number;
  sourceRosterBucket: 'academy' | 'senior';
  prospectScore: number;
  status: 'selected' | 'undrafted';
  draftRound?: number;
  draftPick?: number;
  destinationAbbrev?: string;
  reviewed: boolean;
  selectionSource: 'source' | 'projection';
}

export interface EuroNbaDraftDecision {
  id: string;
  draftYear: number;
  playerId: string;
  playerName: string;
  sourceTeamTid: number;
  sourceRosterBucket: 'academy' | 'senior';
  outlook: 'first-round' | 'second-round' | 'borderline';
  reviewed: boolean;
}

export const createEmptyEuroScoutingState = (): EuroScoutingState => ({
  version: 1,
  legacyAcademyMigrated: false,
  assignments: [],
  academyPlayers: [],
  countryHistory: {},
});
