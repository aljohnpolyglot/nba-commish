export interface HistoricalNbaLeagueAverageTarget {
  startYear: number;
  seasonLabel: string;
  fgm: number;
  fga: number;
  threePm?: number;
  threePa?: number;
  ftm: number;
  fta: number;
  orb?: number;
  drb?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  tov?: number;
  pf: number;
  pts: number;
  fgPct: number;
  threePct?: number;
  ftPct: number;
  pace?: number;
  leaders: HistoricalNbaLeaderTargets;
}

export type HistoricalNbaLeaderMetric = 'pts' | 'reb' | 'ast' | 'min' | 'threePm';

export interface HistoricalNbaLeaderTarget {
  playerName: string;
  perGame: number;
}

export type HistoricalNbaLeaderTargets = Partial<Record<HistoricalNbaLeaderMetric, HistoricalNbaLeaderTarget>>;

export const HISTORICAL_NBA_LEAGUE_AVERAGE_TARGETS: HistoricalNbaLeagueAverageTarget[] = [
  { startYear: 1948, seasonLabel: '1948-49', fgm: 29.0, fga: 88.7, ftm: 22.0, fta: 31.3, ast: 18.6, pf: 25.6, pts: 80.0, fgPct: 0.327, ftPct: 0.703, leaders: { pts: { playerName: 'George Mikan', perGame: 28.30 }, ast: { playerName: 'Bob Davies', perGame: 5.35 } } },
  { startYear: 1958, seasonLabel: '1958-59', fgm: 40.4, fga: 102.3, ftm: 27.4, fta: 36.3, reb: 70.0, ast: 19.6, pf: 26.0, pts: 108.4, fgPct: 0.395, ftPct: 0.756, leaders: { pts: { playerName: 'Bob Pettit', perGame: 29.24 }, reb: { playerName: 'Bill Russell', perGame: 23.03 }, ast: { playerName: 'Bob Cousy', perGame: 8.57 }, min: { playerName: 'Bill Russell', perGame: 42.56 } } },
  { startYear: 1961, seasonLabel: '1961-62', fgm: 45.9, fga: 107.7, ftm: 27.0, fta: 37.1, reb: 71.4, ast: 23.9, pf: 25.9, pts: 118.8, fgPct: 0.426, ftPct: 0.727, leaders: { pts: { playerName: 'Wilt Chamberlain', perGame: 50.36 }, reb: { playerName: 'Wilt Chamberlain', perGame: 25.65 }, ast: { playerName: 'Oscar Robertson', perGame: 11.38 }, min: { playerName: 'Wilt Chamberlain', perGame: 48.53 } } },
  { startYear: 1979, seasonLabel: '1979-80', fgm: 43.6, fga: 90.6, threePm: 0.8, threePa: 2.8, ftm: 21.3, fta: 27.8, orb: 15.1, drb: 29.9, reb: 44.9, ast: 25.8, stl: 9.4, blk: 5.3, tov: 18.9, pf: 24.4, pts: 109.3, fgPct: 0.481, threePct: 0.280, ftPct: 0.764, pace: 103.1, leaders: { pts: { playerName: 'George Gervin', perGame: 33.14 }, reb: { playerName: 'Swen Nater', perGame: 15.01 }, ast: { playerName: 'Michael Ray Richardson', perGame: 10.15 }, min: { playerName: 'Norm Nixon', perGame: 39.34 }, threePm: { playerName: 'Brian Taylor', perGame: 1.15 } } },
  { startYear: 1987, seasonLabel: '1987-88', fgm: 42.1, fga: 87.7, threePm: 1.6, threePa: 5.0, ftm: 22.3, fta: 29.1, orb: 14.2, drb: 29.2, reb: 43.4, ast: 25.8, stl: 8.5, blk: 5.4, tov: 16.7, pf: 24.1, pts: 108.2, fgPct: 0.480, threePct: 0.316, ftPct: 0.766, pace: 99.6, leaders: { pts: { playerName: 'Michael Jordan', perGame: 34.98 }, reb: { playerName: 'Michael Cage', perGame: 13.03 }, ast: { playerName: 'John Stockton', perGame: 13.76 }, min: { playerName: 'Michael Jordan', perGame: 40.38 }, threePm: { playerName: 'Danny Ainge', perGame: 1.83 } } },
  { startYear: 1995, seasonLabel: '1995-96', fgm: 37.0, fga: 80.2, threePm: 5.9, threePa: 16.0, ftm: 19.5, fta: 26.4, orb: 12.6, drb: 28.6, reb: 41.3, ast: 22.7, stl: 8.0, blk: 5.1, tov: 15.8, pf: 23.0, pts: 99.5, fgPct: 0.462, threePct: 0.367, ftPct: 0.740, pace: 91.8, leaders: { pts: { playerName: 'Michael Jordan', perGame: 30.38 }, reb: { playerName: 'Dennis Rodman', perGame: 14.88 }, ast: { playerName: 'John Stockton', perGame: 11.17 }, min: { playerName: 'Anthony Mason', perGame: 42.16 }, threePm: { playerName: 'Dennis Scott', perGame: 3.26 } } },
  { startYear: 2003, seasonLabel: '2003-04', fgm: 35.0, fga: 79.8, threePm: 5.2, threePa: 14.9, ftm: 18.2, fta: 24.2, orb: 12.1, drb: 30.1, reb: 42.2, ast: 21.3, stl: 7.9, blk: 5.1, tov: 15.0, pf: 21.4, pts: 93.4, fgPct: 0.439, threePct: 0.347, ftPct: 0.752, pace: 90.1, leaders: { pts: { playerName: 'Tracy McGrady', perGame: 28.03 }, reb: { playerName: 'Kevin Garnett', perGame: 13.89 }, ast: { playerName: 'Stephon Marbury', perGame: 9.32 }, min: { playerName: 'Allen Iverson', perGame: 42.50 }, threePm: { playerName: 'Peja Stojakovic', perGame: 2.96 } } },
  { startYear: 2015, seasonLabel: '2015-16', fgm: 38.2, fga: 84.6, threePm: 8.5, threePa: 24.1, ftm: 17.7, fta: 23.4, orb: 10.4, drb: 33.3, reb: 43.8, ast: 22.3, stl: 7.8, blk: 5.0, tov: 14.4, pf: 20.3, pts: 102.7, fgPct: 0.452, threePct: 0.354, ftPct: 0.757, pace: 95.8, leaders: { pts: { playerName: 'Stephen Curry', perGame: 30.06 }, reb: { playerName: 'Andre Drummond', perGame: 14.79 }, ast: { playerName: 'Rajon Rondo', perGame: 11.65 }, min: { playerName: 'James Harden', perGame: 38.11 }, threePm: { playerName: 'Stephen Curry', perGame: 5.09 } } },
];

export const WILT_1961_62_TARGET = {
  playerName: 'Wilt Chamberlain',
  ptsPerGame: 50.4,
  rebPerGame: 25.7,
  minPerGame: 48.5,
};
