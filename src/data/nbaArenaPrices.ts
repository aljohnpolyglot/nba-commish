export type NbaArenaPriceSeed = {
  team: string;
  tickets: number;
  hotdog: number;
  beer: number;
};

export const NBA_ARENA_PRICE_SEEDS: NbaArenaPriceSeed[] = [
  { team: 'San Antonio Spurs', tickets: 131, hotdog: 6.30, beer: 11.70 },
  { team: 'Cleveland Cavaliers', tickets: 200, hotdog: 6.65, beer: 12.35 },
  { team: 'Indiana Pacers', tickets: 160, hotdog: 6.65, beer: 12.35 },
  { team: 'Milwaukee Bucks', tickets: 215, hotdog: 7, beer: 13 },
  { team: 'Memphis Grizzlies', tickets: 146, hotdog: 7, beer: 13 },
  { team: 'Charlotte Hornets', tickets: 137, hotdog: 7, beer: 13 },
  { team: 'Utah Jazz', tickets: 164, hotdog: 7, beer: 13 },
  { team: 'New Orleans Pelicans', tickets: 144, hotdog: 7, beer: 13 },
  { team: 'Detroit Pistons', tickets: 160, hotdog: 7, beer: 13 },
  { team: 'Oklahoma City Thunder', tickets: 210, hotdog: 7, beer: 13 },
  { team: 'Philadelphia 76ers', tickets: 300, hotdog: 7.35, beer: 13.65 },
  { team: 'Orlando Magic', tickets: 145, hotdog: 8.99, beer: 11.99 },
  { team: 'Phoenix Suns', tickets: 223, hotdog: 7.35, beer: 13.65 },
  { team: 'Chicago Bulls', tickets: 282, hotdog: 7.50, beer: 15.75 },
  { team: 'Sacramento Kings', tickets: 181, hotdog: 7.70, beer: 14.30 },
  { team: 'Houston Rockets', tickets: 196, hotdog: 7.70, beer: 14.30 },
  { team: 'Minnesota Timberwolves', tickets: 188, hotdog: 7.70, beer: 14.30 },
  { team: 'Portland Trail Blazers', tickets: 193, hotdog: 7.70, beer: 14.30 },
  { team: 'Atlanta Hawks', tickets: 200, hotdog: 8.05, beer: 14.95 },
  { team: 'Dallas Mavericks', tickets: 256, hotdog: 8.05, beer: 14.95 },
  { team: 'Denver Nuggets', tickets: 242, hotdog: 6.50, beer: 17.32 },
  { team: 'Washington Wizards', tickets: 214, hotdog: 8.40, beer: 15.60 },
  { team: 'Miami Heat', tickets: 350, hotdog: 8.75, beer: 16.25 },
  { team: 'Brooklyn Nets', tickets: 230, hotdog: 7.42, beer: 15.47 },
  { team: 'Toronto Raptors', tickets: 371, hotdog: 8.75, beer: 16.25 },
  { team: 'Boston Celtics', tickets: 437, hotdog: 6.65, beer: 20.32 },
  { team: 'Los Angeles Clippers', tickets: 279, hotdog: 8, beer: 13.50 },
  { team: 'Los Angeles Lakers', tickets: 445, hotdog: 11.50, beer: 14.39 },
  { team: 'New York Knicks', tickets: 649, hotdog: 9.20, beer: 16.11 },
  { team: 'Golden State Warriors', tickets: 485, hotdog: 10.50, beer: 17 },
];

export const NBA_ARENA_AVERAGE_TICKET_PRICE = NBA_ARENA_PRICE_SEEDS.reduce(
  (sum, row) => sum + row.tickets,
  0,
) / NBA_ARENA_PRICE_SEEDS.length;
