export interface Club {
  rank: number;
  name: string;
  city: string;
  state: string;
  nba_city: boolean;
  nba_team?: string | null;
}

export const CLUB_DATA: Club[] = [
  {
    "rank": 1,
    "name": "E11EVEN",
    "city": "Miami",
    "state": "FL",
    "nba_city": true,
    "nba_team": "Miami Heat"
  },
  {
    "rank": 2,
    "name": "Echostage",
    "city": "Washington",
    "state": "D.C.",
    "nba_city": true,
    "nba_team": "Washington Wizards"
  },
  {
    "rank": 3,
    "name": "Omnia",
    "city": "Las Vegas",
    "state": "NV",
    "nba_city": false,
    "nba_team": null
  },
  {
    "rank": 4,
    "name": "Club Space",
    "city": "Miami",
    "state": "FL",
    "nba_city": true,
    "nba_team": "Miami Heat"
  },
  {
    "rank": 5,
    "name": "Zouk Nightclub",
    "city": "Las Vegas",
    "state": "NV",
    "nba_city": false,
    "nba_team": null
  },
  {
    "rank": 6,
    "name": "Hakkasan",
    "city": "Las Vegas",
    "state": "NV",
    "nba_city": false,
    "nba_team": null
  },
  {
    "rank": 7,
    "name": "Marquee",
    "city": "Las Vegas",
    "state": "NV",
    "nba_city": false,
    "nba_team": null
  },
  {
    "rank": 8,
    "name": "The Brooklyn Mirage / Avant Gardner",
    "city": "Brooklyn",
    "state": "NY",
    "nba_city": true,
    "nba_team": "Brooklyn Nets"
  },
  {
    "rank": 9,
    "name": "XS Nightclub",
    "city": "Las Vegas",
    "state": "NV",
    "nba_city": false,
    "nba_team": null
  },
  {
    "rank": 10,
    "name": "Drai's Nightclub",
    "city": "Las Vegas",
    "state": "NV",
    "nba_city": false,
    "nba_team": null
  },
  {
    "rank": 11,
    "name": "Encore Beach Club",
    "city": "Las Vegas",
    "state": "NV",
    "nba_city": false,
    "nba_team": null
  },
  {
    "rank": 12,
    "name": "Academy LA",
    "city": "Los Angeles",
    "state": "CA",
    "nba_city": true,
    "nba_team": "LA Lakers / LA Clippers"
  },
  {
    "rank": 13,
    "name": "Exchange LA",
    "city": "Los Angeles",
    "state": "CA",
    "nba_city": true,
    "nba_team": "LA Lakers / LA Clippers"
  },
  {
    "rank": 14,
    "name": "The Grand",
    "city": "Boston",
    "state": "MA",
    "nba_city": true,
    "nba_team": "Boston Celtics"
  },
  {
    "rank": 15,
    "name": "Avalon Hollywood",
    "city": "Los Angeles",
    "state": "CA",
    "nba_city": true,
    "nba_team": "LA Lakers / LA Clippers"
  },
  {
    "rank": 16,
    "name": "LIV",
    "city": "Miami Beach",
    "state": "FL",
    "nba_city": true,
    "nba_team": "Miami Heat"
  },
  {
    "rank": 17,
    "name": "HQ2 Nightclub",
    "city": "Atlantic City",
    "state": "NJ",
    "nba_city": false,
    "nba_team": null
  },
  {
    "rank": 18,
    "name": "Soundcheck",
    "city": "Washington",
    "state": "D.C.",
    "nba_city": true,
    "nba_team": "Washington Wizards"
  },
  {
    "rank": 19,
    "name": "District Atlanta",
    "city": "Atlanta",
    "state": "GA",
    "nba_city": true,
    "nba_team": "Atlanta Hawks"
  },
  {
    "rank": 20,
    "name": "REBEL",
    "city": "Toronto",
    "state": "ON",
    "nba_city": true,
    "nba_team": "Toronto Raptors"
  },
  {
    "rank": 21,
    "name": "TAO Nightclub",
    "city": "Las Vegas",
    "state": "NV",
    "nba_city": false,
    "nba_team": null
  },
  {
    "rank": 22,
    "name": "Marquee New York",
    "city": "New York",
    "state": "NY",
    "nba_city": true,
    "nba_team": "New York Knicks"
  },
  {
    "rank": 23,
    "name": "Nebula",
    "city": "New York",
    "state": "NY",
    "nba_city": true,
    "nba_team": "New York Knicks"
  },
  {
    "rank": 24,
    "name": "Radius",
    "city": "Chicago",
    "state": "IL",
    "nba_city": true,
    "nba_team": "Chicago Bulls"
  },
  {
    "rank": 25,
    "name": "Smartbar",
    "city": "Chicago",
    "state": "IL",
    "nba_city": true,
    "nba_team": "Chicago Bulls"
  },
  {
    "rank": 26,
    "name": "Temple",
    "city": "San Francisco",
    "state": "CA",
    "nba_city": true,
    "nba_team": "Golden State Warriors"
  },
  {
    "rank": 27,
    "name": "Halcyon",
    "city": "San Francisco",
    "state": "CA",
    "nba_city": true,
    "nba_team": "Golden State Warriors"
  },
  {
    "rank": 28,
    "name": "Public Works",
    "city": "San Francisco",
    "state": "CA",
    "nba_city": true,
    "nba_team": "Golden State Warriors"
  },
  {
    "rank": 29,
    "name": "Stereo Live",
    "city": "Houston",
    "state": "TX",
    "nba_city": true,
    "nba_team": "Houston Rockets"
  },
  {
    "rank": 30,
    "name": "It'll Do Club",
    "city": "Dallas",
    "state": "TX",
    "nba_city": true,
    "nba_team": "Dallas Mavericks"
  },
  {
    "rank": 31,
    "name": "Coda",
    "city": "Philadelphia",
    "state": "PA",
    "nba_city": true,
    "nba_team": "Philadelphia 76ers"
  },
  {
    "rank": 32,
    "name": "NOTO",
    "city": "Philadelphia",
    "state": "PA",
    "nba_city": true,
    "nba_team": "Philadelphia 76ers"
  },
  {
    "rank": 33,
    "name": "The Annex",
    "city": "Detroit",
    "state": "MI",
    "nba_city": true,
    "nba_team": "Detroit Pistons"
  },
  {
    "rank": 34,
    "name": "FWD Day + Nightclub",
    "city": "Cleveland",
    "state": "OH",
    "nba_city": true,
    "nba_team": "Cleveland Cavaliers"
  },
  {
    "rank": 35,
    "name": "RSVP South End",
    "city": "Charlotte",
    "state": "NC",
    "nba_city": true,
    "nba_team": "Charlotte Hornets"
  },
  {
    "rank": 36,
    "name": "Story Nightclub",
    "city": "Miami Beach",
    "state": "FL",
    "nba_city": true,
    "nba_team": "Miami Heat"
  },
  {
    "rank": 37,
    "name": "Vanguard",
    "city": "Orlando",
    "state": "FL",
    "nba_city": true,
    "nba_team": "Orlando Magic"
  },
  {
    "rank": 38,
    "name": "INVY Nightclub",
    "city": "Indianapolis",
    "state": "IN",
    "nba_city": true,
    "nba_team": "Indiana Pacers"
  },
  {
    "rank": 39,
    "name": "The Metropolitan",
    "city": "New Orleans",
    "state": "LA",
    "nba_city": true,
    "nba_team": "New Orleans Pelicans"
  },
  {
    "rank": 40,
    "name": "Big Night Live",
    "city": "Boston",
    "state": "MA",
    "nba_city": true,
    "nba_team": "Boston Celtics"
  },
  {
    "rank": 41,
    "name": "Sky",
    "city": "Salt Lake City",
    "state": "UT",
    "nba_city": true,
    "nba_team": "Utah Jazz"
  },
  {
    "rank": 42,
    "name": "Club One15",
    "city": "Oklahoma City",
    "state": "OK",
    "nba_city": true,
    "nba_team": "Oklahoma City Thunder"
  },
  {
    "rank": 43,
    "name": "District Nightclub",
    "city": "Portland",
    "state": "OR",
    "nba_city": true,
    "nba_team": "Portland Trail Blazers"
  },
  {
    "rank": 44,
    "name": "Armory",
    "city": "Minneapolis",
    "state": "MN",
    "nba_city": true,
    "nba_team": "Minnesota Timberwolves"
  },
  {
    "rank": 45,
    "name": "The Rave",
    "city": "Milwaukee",
    "state": "WI",
    "nba_city": true,
    "nba_team": "Milwaukee Bucks"
  },
  {
    "rank": 46,
    "name": "Celebrity",
    "city": "Phoenix",
    "state": "AZ",
    "nba_city": true,
    "nba_team": "Phoenix Suns"
  },
  {
    "rank": 47,
    "name": "Raas",
    "city": "Memphis",
    "state": "TN",
    "nba_city": true,
    "nba_team": "Memphis Grizzlies"
  },
  {
    "rank": 48,
    "name": "The Church Nightclub",
    "city": "Denver",
    "state": "CO",
    "nba_city": true,
    "nba_team": "Denver Nuggets"
  },
  {
    "rank": 49,
    "name": "Tiger Nightclub",
    "city": "Sacramento",
    "state": "CA",
    "nba_city": true,
    "nba_team": "Sacramento Kings"
  },
  {
    "rank": 50,
    "name": "1902 Nightclub",
    "city": "San Antonio",
    "state": "TX",
    "nba_city": true,
    "nba_team": "San Antonio Spurs"
  }
];

export const CLUB_MUSIC_URL = "https://cdn.pixabay.com/audio/2025/09/20/audio_40fac6e6d3.mp3";
