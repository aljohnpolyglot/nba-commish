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
  winner?: number;
  runnerUp?: number;
  semiFinalist?: number;
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
}

export interface CompetitionSpec {
  id: string;
  displayName: string;
  shortName: string;
  format: CompetitionFormat;
  seasonStart: CompetitionDate;
  seasonEnd: CompetitionDate;
  teamSelector: string;
  gamesPerTeam?: number;
  daysOfWeek?: CompetitionDayOfWeek[];
  blackoutPeriods?: CompetitionBlackoutPeriod[];
  playoffFormat?: CompetitionPlayoffFormat;
  prizePool?: CompetitionPrizePool;
  accentColor: string;
  icon?: string;
}
