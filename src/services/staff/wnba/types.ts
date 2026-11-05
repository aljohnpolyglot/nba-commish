import type { StaffMember } from '../../../types/staff';

export type WnbaCoachRole = 'headCoach' | 'assistantCoach' | 'otherStaff';

export interface WnbaCoachSeasonStats {
  games: number | null;
  wins: number | null;
  losses: number | null;
  winPct: number | null;
}

export interface WnbaCoachSeasonRow {
  year: number;
  yearLabel: string;
  team: string;
  teamUrl?: string;
  role: WnbaCoachRole;
  roleLabel: string;
  regularSeason: WnbaCoachSeasonStats;
  playoffs: WnbaCoachSeasonStats;
  notes?: string;
}

export interface WnbaCoachAward {
  year: number;
  name: string;
  type: string;
  sourceText: string;
  awardUrl?: string;
  seasonUrl?: string;
}

export interface WnbaCoachAchievement {
  year: number;
  type: string;
  team: string;
  note: string;
}

export interface WnbaCoachProfile {
  id: string;
  name: string;
  basketballReferenceUrl?: string;
  wikipediaUrl?: string;
  portraitUrl?: string;
  bornYear?: number;
  birthDate?: string;
  birthPlace?: string;
  nationality?: string;
  college?: string;
  diedYear?: number;
  diedDate?: string;
  firstListedSeason: number;
  lastVisibleSeason: number;
  headCoachSeasons: number;
  assistantCoachSeasons: number;
  regularSeasonGames: number;
  regularSeasonWins: number;
  regularSeasonLosses: number;
  playoffGames: number;
  playoffWins: number;
  playoffLosses: number;
  championships: number;
  finalsAppearances: number;
  awards: WnbaCoachAward[];
  achievements: WnbaCoachAchievement[];
  careerRows: WnbaCoachSeasonRow[];
  rating: number;
  reputation: number;
  sourceCoachRating: number;
  sourceCoachPercentile: number;
}

export type WnbaCoachSelectionBasis = 'only-assignment' | 'completed-season-games' | 'prior-season-continuity' | 'source-order';

export interface WnbaHeadCoachAssignment {
  coachId: string;
  coachName: string;
  teamAbbrev: string;
  season: number;
  row: WnbaCoachSeasonRow;
  profile: WnbaCoachProfile;
  primary: boolean;
  selectionBasis: WnbaCoachSelectionBasis;
}

export interface WnbaHeadCoachQuery {
  season: number;
  completedThroughYear: number;
  teamAbbrev?: string;
}

export interface WnbaHeadCoachStaffBuildOptions extends WnbaHeadCoachQuery {
  teamNamesByAbbrev?: Readonly<Record<string, string>>;
}

export interface WnbaHeadCoachStaffMember extends StaffMember {
  id: string;
  leagueId: 'WNBA';
  source: 'wnba-coaches-bref-wikipedia';
  sourceExperience: Record<string, unknown> & {
    assignmentSeason: number;
    completedThroughYear: number;
    teamAbbrev: string;
    selectionBasis: WnbaCoachSelectionBasis;
  };
}
