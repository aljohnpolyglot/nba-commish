/**
 * staticNbaTeams.ts
 *
 * Minimal pre-load team list for the GM-mode franchise picker in CommissionerSetup.
 * The real roster (with wins/losses/colors/etc.) loads via getRosterData during
 * handleStartGame — this file only exists so the picker can render team logos
 * + names before that import completes. The `tid` values match BBGM's
 * alphabetical-by-name convention so abbrev→tid lookups stay consistent.
 */

export interface StaticNbaTeam {
  tid: number;
  abbrev: string;
  region: string;
  name: string;
  fullName: string;
  nbaId: string; // cdn.nba.com logo id
  conference: 'East' | 'West';
}

const cdn = (id: string) => `https://cdn.nba.com/logos/nba/${id}/global/L/logo.svg`;

export const STATIC_NBA_TEAMS: StaticNbaTeam[] = [
  { tid: 0,  abbrev: 'ATL', region: 'Atlanta',       name: 'Hawks',          fullName: 'Atlanta Hawks',          nbaId: '1610612737', conference: 'East' },
  { tid: 1,  abbrev: 'BOS', region: 'Boston',        name: 'Celtics',        fullName: 'Boston Celtics',         nbaId: '1610612738', conference: 'East' },
  { tid: 2,  abbrev: 'BKN', region: 'Brooklyn',      name: 'Nets',           fullName: 'Brooklyn Nets',          nbaId: '1610612751', conference: 'East' },
  { tid: 3,  abbrev: 'CHA', region: 'Charlotte',     name: 'Hornets',        fullName: 'Charlotte Hornets',      nbaId: '1610612766', conference: 'East' },
  { tid: 4,  abbrev: 'CHI', region: 'Chicago',       name: 'Bulls',          fullName: 'Chicago Bulls',          nbaId: '1610612741', conference: 'East' },
  { tid: 5,  abbrev: 'CLE', region: 'Cleveland',     name: 'Cavaliers',      fullName: 'Cleveland Cavaliers',    nbaId: '1610612739', conference: 'East' },
  { tid: 6,  abbrev: 'DAL', region: 'Dallas',        name: 'Mavericks',      fullName: 'Dallas Mavericks',       nbaId: '1610612742', conference: 'West' },
  { tid: 7,  abbrev: 'DEN', region: 'Denver',        name: 'Nuggets',        fullName: 'Denver Nuggets',         nbaId: '1610612743', conference: 'West' },
  { tid: 8,  abbrev: 'DET', region: 'Detroit',       name: 'Pistons',        fullName: 'Detroit Pistons',        nbaId: '1610612765', conference: 'East' },
  { tid: 9,  abbrev: 'GSW', region: 'Golden State',  name: 'Warriors',       fullName: 'Golden State Warriors',  nbaId: '1610612744', conference: 'West' },
  { tid: 10, abbrev: 'HOU', region: 'Houston',       name: 'Rockets',        fullName: 'Houston Rockets',        nbaId: '1610612745', conference: 'West' },
  { tid: 11, abbrev: 'IND', region: 'Indiana',       name: 'Pacers',         fullName: 'Indiana Pacers',         nbaId: '1610612754', conference: 'East' },
  { tid: 12, abbrev: 'LAC', region: 'Los Angeles',   name: 'Clippers',       fullName: 'LA Clippers',            nbaId: '1610612746', conference: 'West' },
  { tid: 13, abbrev: 'LAL', region: 'Los Angeles',   name: 'Lakers',         fullName: 'Los Angeles Lakers',     nbaId: '1610612747', conference: 'West' },
  { tid: 14, abbrev: 'MEM', region: 'Memphis',       name: 'Grizzlies',      fullName: 'Memphis Grizzlies',      nbaId: '1610612763', conference: 'West' },
  { tid: 15, abbrev: 'MIA', region: 'Miami',         name: 'Heat',           fullName: 'Miami Heat',             nbaId: '1610612748', conference: 'East' },
  { tid: 16, abbrev: 'MIL', region: 'Milwaukee',     name: 'Bucks',          fullName: 'Milwaukee Bucks',        nbaId: '1610612749', conference: 'East' },
  { tid: 17, abbrev: 'MIN', region: 'Minnesota',     name: 'Timberwolves',   fullName: 'Minnesota Timberwolves', nbaId: '1610612750', conference: 'West' },
  { tid: 18, abbrev: 'NOP', region: 'New Orleans',   name: 'Pelicans',       fullName: 'New Orleans Pelicans',   nbaId: '1610612740', conference: 'West' },
  { tid: 19, abbrev: 'NYK', region: 'New York',      name: 'Knicks',         fullName: 'New York Knicks',        nbaId: '1610612752', conference: 'East' },
  { tid: 20, abbrev: 'OKC', region: 'Oklahoma City', name: 'Thunder',        fullName: 'Oklahoma City Thunder',  nbaId: '1610612760', conference: 'West' },
  { tid: 21, abbrev: 'ORL', region: 'Orlando',       name: 'Magic',          fullName: 'Orlando Magic',          nbaId: '1610612753', conference: 'East' },
  { tid: 22, abbrev: 'PHI', region: 'Philadelphia',  name: '76ers',          fullName: 'Philadelphia 76ers',     nbaId: '1610612755', conference: 'East' },
  { tid: 23, abbrev: 'PHX', region: 'Phoenix',       name: 'Suns',           fullName: 'Phoenix Suns',           nbaId: '1610612756', conference: 'West' },
  { tid: 24, abbrev: 'POR', region: 'Portland',      name: 'Trail Blazers',  fullName: 'Portland Trail Blazers', nbaId: '1610612757', conference: 'West' },
  { tid: 25, abbrev: 'SAC', region: 'Sacramento',    name: 'Kings',          fullName: 'Sacramento Kings',       nbaId: '1610612758', conference: 'West' },
  { tid: 26, abbrev: 'SAS', region: 'San Antonio',   name: 'Spurs',          fullName: 'San Antonio Spurs',      nbaId: '1610612759', conference: 'West' },
  { tid: 27, abbrev: 'TOR', region: 'Toronto',       name: 'Raptors',        fullName: 'Toronto Raptors',        nbaId: '1610612761', conference: 'East' },
  { tid: 28, abbrev: 'UTA', region: 'Utah',          name: 'Jazz',           fullName: 'Utah Jazz',              nbaId: '1610612762', conference: 'West' },
  { tid: 29, abbrev: 'WAS', region: 'Washington',    name: 'Wizards',        fullName: 'Washington Wizards',     nbaId: '1610612764', conference: 'East' },
];

export const staticNbaTeamLogo = (team: StaticNbaTeam): string => cdn(team.nbaId);
