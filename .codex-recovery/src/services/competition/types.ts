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
  qfBest?: number;
  sfBest?: number;
  finalFormat?: 'best-of' | 'final-four' | 'single-game';
  finalBest?: number;
}

export interface CompetitionSpec {
  id: string;
  displayName: string;
  shortName: string;
  format: CompetitionFormat;
  seasonStart: CompetitionDate;
  seasonEnd: CompetitionDate;
  teamSelector: string;
  teamCount?: number;
  groups?: number[][];
  gamesPerTeam?: number;
  daysOfWeek?: CompetitionDayOfWeek[];
  blackoutPeriods?: CompetitionBlackoutPeriod[];
  playoffFormat?: CompetitionPlayoffFormat;
  prizePool?: CompetitionPrizePool;
  accentColor: string;
  icon?: string;
}