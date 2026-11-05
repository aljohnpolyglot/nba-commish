export interface SummerLeagueHistorySeed {
  year: number;
  champion: string | null;
  runnerUp: string | null;
  championshipMvp: string | null;
  mvp: string | null;
}

export const SUMMER_LEAGUE_HISTORY_SEEDS: readonly SummerLeagueHistorySeed[] = [
  { year: 2025, champion: 'Charlotte Hornets', runnerUp: 'Sacramento Kings', championshipMvp: 'Kon Knueppel', mvp: 'Kyle Filipowski' },
  { year: 2024, champion: 'Miami Heat', runnerUp: 'Memphis Grizzlies', championshipMvp: 'Josh Christopher', mvp: 'Jalen Wilson' },
  { year: 2023, champion: 'Cleveland Cavaliers', runnerUp: 'Houston Rockets', championshipMvp: 'Isaiah Mobley', mvp: 'Cam Whitmore' },
  { year: 2022, champion: 'Portland Trail Blazers', runnerUp: 'New York Knicks', championshipMvp: 'Trendon Watford', mvp: 'Keegan Murray' },
  { year: 2021, champion: 'Sacramento Kings', runnerUp: 'Boston Celtics', championshipMvp: 'Louis King', mvp: 'Davion Mitchell & Cam Thomas' },
  { year: 2020, champion: null, runnerUp: null, championshipMvp: null, mvp: null },
  { year: 2019, champion: 'Memphis Grizzlies', runnerUp: 'Minnesota Timberwolves', championshipMvp: 'Brandon Clarke', mvp: 'Brandon Clarke' },
  { year: 2018, champion: 'Portland Trail Blazers', runnerUp: 'Los Angeles Lakers', championshipMvp: 'K. J. McDaniels', mvp: 'Josh Hart' },
  { year: 2017, champion: 'Los Angeles Lakers', runnerUp: 'Portland Trail Blazers', championshipMvp: 'Kyle Kuzma', mvp: 'Lonzo Ball' },
  { year: 2016, champion: 'Chicago Bulls', runnerUp: 'Minnesota Timberwolves', championshipMvp: 'Jerian Grant', mvp: 'Tyus Jones' },
  { year: 2015, champion: 'San Antonio Spurs', runnerUp: 'Phoenix Suns', championshipMvp: 'Jonathon Simmons', mvp: 'Kyle Anderson' },
  { year: 2014, champion: 'Sacramento Kings', runnerUp: 'Houston Rockets', championshipMvp: 'Ray McCallum Jr.', mvp: 'Glen Rice Jr.' },
  { year: 2013, champion: 'Golden State Warriors', runnerUp: 'Phoenix Suns', championshipMvp: 'Ian Clark', mvp: 'Jeremy Lamb' },
  { year: 2012, champion: 'Golden State Warriors', runnerUp: 'Charlotte Hornets', championshipMvp: 'Damian Lillard & Josh Selby', mvp: 'Damian Lillard & Josh Selby' },
  { year: 2011, champion: null, runnerUp: null, championshipMvp: null, mvp: null },
  { year: 2010, champion: 'San Antonio Spurs', runnerUp: 'Toronto Raptors', championshipMvp: 'John Wall', mvp: 'John Wall' },
  { year: 2009, champion: 'Houston Rockets', runnerUp: 'Memphis Grizzlies', championshipMvp: 'Blake Griffin', mvp: 'Blake Griffin' },
  { year: 2008, champion: 'Denver Nuggets', runnerUp: 'Golden State Warriors', championshipMvp: 'Jerryd Bayless', mvp: 'Jerryd Bayless' },
  { year: 2007, champion: 'New York Knicks', runnerUp: 'Detroit Pistons', championshipMvp: 'Nate Robinson', mvp: 'Nate Robinson' },
  { year: 2006, champion: 'Houston Rockets', runnerUp: 'Denver Nuggets', championshipMvp: 'Randy Foye', mvp: 'Randy Foye' },
];
