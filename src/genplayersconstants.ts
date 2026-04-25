import { defaultCountries, defaultColleges } from './sportData';

export const NAMES_URL = 'https://raw.githubusercontent.com/zengm-games/zengm/refs/heads/master/data/names.json';
export const ROSTER_URL = 'https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/2025-26.NBA.Roster.json';

export const EUROLEAGUE_TEAMS: Record<string, { name: string; country: string }> = {
  "1000": { name: "AEK Athens", country: "Greece" },
  "1001": { name: "Alba Berlin", country: "Germany" },
  "1002": { name: "Anadolu Efes", country: "Turkey" },
  "1003": { name: "AS Monaco", country: "France" },
  "1004": { name: "Baskonia", country: "Spain" },
  "1005": { name: "Crvena Zvezda", country: "Serbia" },
  "1006": { name: "Moscow CSKA", country: "Russia" },
  "1007": { name: "Dreamland Gran Canaria", country: "Spain" },
  "1008": { name: "Dubai", country: "UAE" },
  "1009": { name: "EA7 Emporio Armani Milan", country: "Italy" },
  "1010": { name: "FC Barcelona", country: "Spain" },
  "1011": { name: "FC Bayern Munich", country: "Germany" },
  "1012": { name: "Fenerbahce", country: "Turkey" },
  "1013": { name: "Hapoel Tel Aviv", country: "Israel" },
  "1014": { name: "LDLC ASVEL", country: "France" },
  "1015": { name: "Maccabi Tel Aviv", country: "Israel" },
  "1016": { name: "Olympiacos", country: "Greece" },
  "1017": { name: "Panathinaikos", country: "Greece" },
  "1018": { name: "Paris", country: "France" },
  "1019": { name: "Partizan", country: "Serbia" },
  "1020": { name: "Real Madrid", country: "Spain" },
  "1041": { name: "Vilnius Rytas", country: "Lithuania" },
  "1022": { name: "Podgorica Buducnost", country: "Montenegro" },
  "1043": { name: "Ljubljana Olimpija", country: "Slovenia" },
  "1031": { name: "Limoges CSP", country: "France" },
  "1038": { name: "Nanterre 92", country: "France" },
  "1070": { name: "Athens AEK", country: "Greece" },
  "1061": { name: "Thessaloniki Aris", country: "Greece" },
  "1081": { name: "Thessaloniki PAOK", country: "Greece" }
};

export const ENDESA_TEAMS: Record<string, string> = {
  "5012": "Real Madrid", "5006": "FC Barcelona", "5017": "Unicaja Malaga", "5018": "Valencia Basket",
  "5001": "Baskonia Vitoria-Gasteiz", "5005": "Dreamland Gran Canaria", "5008": "Joventut Badalona",
  "5009": "La Laguna Tenerife", "5016": "UCAM Murcia", "5015": "Surne Bilbao", "5000": "BAXI Manresa",
  "5003": "Casademont Zaragoza", "5010": "MoraBanc Andorra", "5013": "Rio Breogan", "5007": "Hiopos Lleida",
  "5004": "Coviran Granada", "5002": "Basquet Girona", "5011": "Movistar Estudiantes", "5014": "San Pablo Burgos"
};

export const NBL_TEAMS: Record<string, string> = {
  "8000": "Adelaide 36ers",
  "8001": "Brisbane Bullets",
  "8007": "South East Melbourne Phoenix",
  "8003": "Illawarra Hawks",
  "8009": "Tasmania JackJumpers",
  "8008": "Sydney Kings",
  "8002": "Cairns Taipans",
  "8004": "Melbourne United",
  "8006": "Perth Wildcats",
  "8005": "New Zealand Breakers"
};

export const BLEAGUE_TEAMS: Record<string, string> = {
  "4020": "Sendai 89ers", "4009": "Koshigaya Alphas", "4026": "Yokohama B-Corsairs", "4017": "Saga Ballooners",
  "4008": "Kawasaki Brave Thunders", "4001": "Altiri Chiba", "4005": "Gunma Crane Thunders",
  "4013": "Nagoya Diamond Dolphins", "4006": "Hiroshima Dragonflies", "4015": "Osaka Evessa",
  "4014": "Nagoya Fighting Eagles", "4016": "Ryukyu Golden Kings", "4024": "Toyama Grouses",
  "4010": "Kyoto Hannaryz", "4011": "Levanga Hokkaido", "4003": "Chiba Jets", "4021": "Shiga Lakes",
  "4019": "SeaHorses Mikawa", "4018": "San-en NeoPhoenix", "4000": "Akita Northern Happinets",
  "4004": "Fukuoka Rizing", "4007": "Ibaraki Robots", "4023": "Sun Rockers Shibuya",
  "4022": "Shimane Susanoo Magic", "4002": "Alvark Tokyo", "4025": "Utsunomiya Utsunomiya", "4012": "Nagasaki Velca"
};

export const COLLEGE_FREQUENCIES: Record<string, number> = defaultColleges;
export const COUNTRY_FREQUENCIES: Record<string, number> = defaultCountries;

export const RACE_FREQUENCIES: Record<string, Record<string, number>> = {
  Argentina: { asian: 1, black: 10, brown: 14, white: 75 },
  Brazil: { asian: 1, black: 33, brown: 33, white: 33 },
  "Cape Verde": { asian: 1, black: 28, brown: 70, white: 1 },
  China: { asian: 997, black: 1, brown: 1, white: 1 },
  Germany: { asian: 1, black: 15, brown: 15, white: 69 },
  India: { asian: 1, black: 1, brown: 997, white: 1 },
  Lithuania: { asian: 1, black: 1, brown: 1, white: 997 },
  Mexico: { asian: 1, black: 10, brown: 79, white: 10 },
  Nigeria: { asian: 1, black: 997, brown: 1, white: 1 },
  "South Africa": { asian: 1, black: 80, brown: 10, white: 9 },
  Spain: { asian: 1, black: 10, brown: 10, white: 79 },
  Turkey: { asian: 1, black: 1, brown: 18, white: 80 },
  USA: { asian: 1, black: 50, brown: 35, white: 14 },
};

// Map aliases
const raceAliases: Record<string, string> = {
  Albania: "Lithuania",
  Algeria: "India",
  "American Samoa": "India",
  Angola: "Nigeria",
  Armenia: "Lithuania",
  Australia: "Spain",
  Austria: "Spain",
  Azerbaijan: "Lithuania",
  Bahamas: "Nigeria",
  Belarus: "Lithuania",
  Belgium: "Germany",
  Benin: "Nigeria",
  Bolivia: "Mexico",
  "Bosnia and Herzegovina": "Lithuania",
  Bulgaria: "Lithuania",
  Cameroon: "Nigeria",
  Canada: "USA",
  "Central African Republic": "Nigeria",
  Chad: "Nigeria",
  Chile: "Argentina",
  Colombia: "Mexico",
  Congo: "Nigeria",
  "Costa Rica": "Mexico",
  Croatia: "Lithuania",
  Cuba: "Mexico",
  "Czech Republic": "Germany",
  Denmark: "Germany",
  "Dominican Republic": "Nigeria",
  "East Timor": "India",
  Egypt: "India",
  "El Salvador": "Mexico",
  England: "Germany",
  Ecuador: "Mexico",
  Estonia: "Lithuania",
  Ethiopia: "Nigeria",
  Finland: "Spain",
  France: "USA",
  "French Guiana": "Mexico",
  Gabon: "Nigeria",
  Georgia: "Lithuania",
  Ghana: "Nigeria",
  Greece: "Spain",
  Guadeloupe: "South Africa",
  Guatemala: "Mexico",
  Guinea: "Nigeria",
  "Guinea-Bissau": "Nigeria",
  Haiti: "Nigeria",
  Honduras: "Mexico",
  Hungary: "Lithuania",
  Iceland: "Lithuania",
  Indonesia: "China",
  Iran: "Lithuania",
  Ireland: "Germany",
  Israel: "Lithuania",
  Italy: "Spain",
  "Ivory Coast": "Nigeria",
  Jamaica: "Nigeria",
  Japan: "China",
  Kazakhstan: "China",
  Kenya: "Nigeria",
  Kosovo: "Lithuania",
  Kyrgyzstan: "China",
  Laos: "China",
  Latvia: "Lithuania",
  Liberia: "Nigeria",
  Luxembourg: "Spain",
  Macau: "China",
  Mali: "Nigeria",
  Moldova: "Lithuania",
  Montenegro: "Lithuania",
  Morocco: "India",
  Mozambique: "Nigeria",
  Nepal: "India",
  Netherlands: "Spain",
  "New Zealand": "Lithuania",
  Nicaragua: "Mexico",
  "North Korea": "China",
  "North Macedonia": "Lithuania",
  Norway: "Spain",
  Pakistan: "India",
  Panama: "Mexico",
  "Papua New Guinea": "China",
  Paraguay: "Mexico",
  Peru: "Mexico",
  Philippines: "India",
  Poland: "Lithuania",
  Portugal: "Spain",
  "Puerto Rico": "USA",
  Romania: "Lithuania",
  Russia: "Lithuania",
  Samoa: "India",
  Scotland: "Spain",
  Senegal: "Nigeria",
  Serbia: "Lithuania",
  Slovakia: "Spain",
  Slovenia: "Lithuania",
  "South Korea": "China",
  "South Sudan": "Nigeria",
  Sudan: "Nigeria",
  Sweden: "Spain",
  Switzerland: "Germany",
  Taiwan: "China",
  Thailand: "China",
  "Trinidad and Tobago": "Cape Verde",
  Ukraine: "Lithuania",
  Uruguay: "Argentina",
  Uzbekistan: "Lithuania",
  Venezuela: "Argentina",
  Vietnam: "China",
  "Virgin Islands": "South Africa",
  Wales: "Germany",
};

export function getRaceFrequencies(country: string): Record<string, number> {
  if (RACE_FREQUENCIES[country]) return RACE_FREQUENCIES[country];
  if (raceAliases[country] && RACE_FREQUENCIES[raceAliases[country]]) {
    return RACE_FREQUENCIES[raceAliases[country]];
  }
  return RACE_FREQUENCIES["USA"]; // Default fallback
}

//types to move 
// or connect
export type Position = 'PG' | 'SG' | 'SG/SF' | 'SF' | 'SF/PF' | 'PF' | 'PF/C' | 'C';

export type MoodTrait =
  | 'DIVA'         // F — fame/PT focused
  | 'LOYAL'        // L — team loyalty
  | 'MERCENARY'    // $ — money driven
  | 'COMPETITOR'   // W — winning obsessed
  | 'VOLATILE'     // negative mood components 1.5×
  | 'AMBASSADOR'   // commish rel +1; drama halved
  | 'DRAMA_MAGNET' // drama doubled
  | 'FAME';        // market-size bonus doubled

export interface Ratings {
  season: number;
  hgt: number;
  stre: number;
  spd: number;
  jmp: number;
  endu: number;
  ins: number;
  dnk: number;
  ft: number;
  fg: number;
  tp: number;
  oiq: number;
  diq: number;
  drb: number;
  pss: number;
  reb: number;
  ovr: number;
  pot: number;
  /** Hidden development-trajectory multiplier applied to annual base change.
   *  Seeded once at generation. ~0.55–0.80 for bust-risk hyped prospects,
   *  ~1.15–1.40 for hidden gems, ~0.90–1.10 for normal. Missing → treat as 1.0. */
  devSpeed?: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string;
  pos: Position;
  age: number;
  born: {
    year: number;
    loc: string;
  };
  hgt: number; // in inches
  weight: number; // in lbs
  finalHgt: number; // projected height at 18
  finalWeight: number; // projected weight at 18
  college: string;
  nationality: string;
  race: string;
  face: any;
  draft: {
    year: number;
    round: number;
    pick: number;
    tid: number;
  };
  ratings: Ratings[];
  imgURL?: string;
  path: 'College' | 'Europe' | 'NBL' | 'G-League' | 'Endesa' | 'B-League';
  // New fields from Draft Class Generator
  drivingDunk: number;
  standingDunk: number;
  durability: number;
  composure: number;
  clutch: number;
  workEthic: number;
  traits: MoodTrait[];
  archetype: string;
  overallRating: number;
  status: string;
}

export interface NameData {
  countries: {
    [key: string]: {
      first: { [name: string]: number };
      last: { [name: string]: number };
    };
  };
}
