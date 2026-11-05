export type CompetitionFormat = 'regular-league' | 'group-knockout' | 'knockout' | 'tournament';

export type CompetitionDayOfWeek =
  | 'Mon'
  | 'Tue'
  | 'Wed'
  | 'Thu'
  | 'Fri'
  | 'Sat'
  | 'Sun';

export interface CompetitionDate {
  month: number;
  day: number;
  yearOffset?: number;
}

export interface CompetitionBlackoutPeriod {
  start: CompetitionDate;
  end: CompetitionDate;
  label?: string;
}

export interface CompetitionPrizePool {
  currency?: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CNY' | 'AUD' | 'PHP';
  participation?: number;
  groupParticipation?: number;
  winner?: number;
  runnerUp?: number;
  semi?: number;
  semiFinalist?: number;
  qf?: number;
  quarterFinalist?: number;
}

export interface CompetitionPlayoffRoundSpec {
  phase: string;
  bestOf?: number;
  singleElimination?: boolean;
  start: CompetitionDate;
  end: CompetitionDate;
}

export interface CompetitionPlayoffFormat {
  rounds: CompetitionPlayoffRoundSpec[];
  finalFormat?: 'best-of' | 'final-four' | 'single-game';
  /** Top seeds need only 1 win in QF; lower seed needs 2 (PBA format). */
  qfFormat?: 'twice-to-beat' | 'best-of';
  /** Best-of-N overrides per round, used by competitionResolver when a
   *  competition declares a non-uniform series length (e.g. Endesa QF best-of-3,
   *  SF best-of-5, Final best-of-7). */
  qfBest?: number;
  sfBest?: number;
  finalBest?: number;
}

export type CompetitionTiebreaker =
  | 'head-to-head'
  | 'mini-table'
  | 'point-differential'
  | 'points-for';

export type CompetitionQualificationKind =
  | 'playoff'
  | 'play-in'
  | 'domestic-cup'
  | 'euroleague'
  | 'eurocup'
  | 'relegation';

export interface CompetitionQualificationZone {
  kind: CompetitionQualificationKind;
  label: string;
  from: number;
  to: number;
  color: string;
}

export interface CompetitionStandingsRuleEra {
  firstSeason: number;
  lastSeason?: number;
  tiebreakers: CompetitionTiebreaker[];
  qualificationZones?: CompetitionQualificationZone[];
}

export type CompetitionAwardKind =
  | 'mvp'
  | 'finalsMvp'
  | 'playoffsMvp'
  | 'playInMvp'
  | 'top16Mvp'
  | 'finalFourMvp'
  | 'tournamentMvp'
  | 'topScorer'
  | 'assistLeader'
  | 'defender'
  | 'sixthMan'
  | 'mostImproved'
  | 'youngPlayer'
  | 'coach'
  | 'allLeague'
  | 'offensivePlayer'
  | 'efficiencyPlayer'
  | 'spectacularPlayer'
  | 'popularPlayer'
  | 'championshipCoach'
  | 'executive'
  | 'other';

export interface CompetitionAwardProgramEntry {
  kind: CompetitionAwardKind;
  type: string;
  firstSeason: number;
  lastSeason?: number;
  role: 'player' | 'coach' | 'executive';
  selectionIndex?: number;
  source: 'competition-history';
}

export interface CompetitionSpec {
  id: string;
  displayName: string;
  shortName: string;
  format: CompetitionFormat;
  seasonStart: CompetitionDate;
  seasonEnd: CompetitionDate;
  regularSeasonEnd?: CompetitionDate;
  teamSelector: string;
  /** Optional explicit cap on participating teams — used by
   *  competitionScheduler when the team pool needs to be trimmed/sized. */
  teamCount?: number;
  gamesPerTeam?: number;
  groupCount?: number;
  roundSpacingDays?: number;
  daysOfWeek?: CompetitionDayOfWeek[];
  blackoutPeriods?: CompetitionBlackoutPeriod[];
  playoffFormat?: CompetitionPlayoffFormat;
  prizePool?: CompetitionPrizePool;
  accentColor: string;
  icon?: string;
  /** PBA: 'none' (All-Filipino), 'one_no_height_limit', 'one_max_6ft6'. */
  importRule?: 'none' | 'one_no_height_limit' | 'one_max_6ft6';
  backgroundOnly?: boolean;
  sourceCoverageStart?: number;
  sourceCoverageThrough?: number;
  awardProgram?: CompetitionAwardProgramEntry[];
  standingsRuleEras?: CompetitionStandingsRuleEra[];
  domesticParentId?: string;
  qualificationRule?: 'domestic-standings' | 'domestic-titleholders';
}
