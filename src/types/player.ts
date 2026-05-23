export interface NBAGMStat {
  season: number;
  tid: number;
  gp: number;
  gs: number;
  min: number;
  fg: number;
  fga: number;
  fgp: number;
  tp: number;
  tpa: number;
  tpp: number;
  fp?: number;
  fpa?: number;
  fpp?: number;
  ft: number;
  fta: number;
  ftp: number;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  per: number;
  pm?: number;
  tsPct?: number;
  efgPct?: number;
  usgPct?: number;
  ortg?: number;
  drtg?: number;
  bpm?: number;
  obpm?: number;
  dbpm?: number;
  ws?: number;
  ows?: number;
  dws?: number;
  ws48?: number;
  vorp?: number;
  ewa?: number;
  astPct?: number;
  orbPct?: number;
  drbPct?: number;
  rebPct?: number;
  stlPct?: number;
  blkPct?: number;
  tovPct?: number;
  playoffs?: boolean;
  jerseyNumber?: string | number;
  ptsMax?: number;
  rebMax?: number;
  astMax?: number;
  blkMax?: number;
  stlMax?: number;
  fgMax?: number;
  fgaMax?: number;
  tpMax?: number;
  tpaMax?: number;
  ftMax?: number;
  ftaMax?: number;
  minMax?: number[];
}

export interface NBAPlayer {
  internalId: string;
  tid: number;
  name: string;
  overallRating: number;
  ratings: any[];
  stats?: NBAGMStat[];
  imgURL?: string;
  pos?: string;
  age?: number;
  hgt?: number;
  weight?: number;
  born?: { year: number; loc: string };
  draft?: { year: number; tid: number; round?: number; pick?: number; originalTid?: number };
  contract?: { amount: number; exp: number; rookie?: boolean; hasPlayerOption?: boolean };
  awards?: Array<{ season: number; type: string }>;
  injury: {
    type: string;
    gamesRemaining: number;
    startDate?: string;
    origin?: string;
  };
  suspension?: {
    reason: string;
    gamesRemaining: number;
  };
  status?: 'Active' | 'Prospect' | 'Free Agent' | 'Retired' | 'WNBA' | 'Draft Prospect' | 'Euroleague' | 'PBA' | 'B-League' | 'G-League' | 'Endesa' | 'China CBA' | 'NBL Australia';
  twoWayCandidate?: boolean;
  gLeagueAssigned?: boolean;
  twoWay?: boolean;
  nonGuaranteed?: boolean;
  superMaxEligible?: boolean;
  diedYear?: number;
  hof?: boolean;
  retiredYear?: number;
  hofInductionYear?: number;
  jerseyNumber?: string;
  badges?: string[];
  nbaId?: string | null;
  moodTraits?: import('../utils/mood').MoodTrait[];
  ovrTimeline?: { date: string; ovr: number }[];
  srID?: string;
  college?: string;
  transactions?: Array<{ season: number; tid: number; type?: string; phase?: number; pickNum?: number }>;
  durability?: number;
  farewellTour?: boolean;
  playoffEligible?: boolean;
  isImport?: boolean;
  importConference?: 'commissioners' | 'governors';
  importTeamId?: number;
  importSeason?: number;
  relatives?: Array<{ type: 'brother' | 'father' | 'son' | string; pid: number; name: string }>;
  tradeEligibleDate?: string;
  devFocus?: string;
  mentorId?: string | null;
  mentorHistory?: Array<{ mentorId: string; startDate: string; endDate?: string }>;
  origWeight?: number;
  trainingIntensity?: 'Rest' | 'Half' | 'Normal' | 'Double';
  trainingFatigue?: number;
  signedDate?: string;
  face?: any;
}

export interface K2Result {
  OS: number[];
  AT: number[];
  IS: number[];
  PL: number[];
  DF: number[];
  RB: number[];
}

export interface PlayerK2 extends NBAPlayer {
  k2: K2Result;
  rating2K: number;
  bbgmOvr: number;
  currentRating: any;
}

export interface DraftPick {
  dpid: number;
  tid: number;
  originalTid: number;
  round: number;
  season: number;
}

export interface InjuryDefinition {
  name: string;
  frequency: number;
  games: number;
}

export interface NBAGMPlayer extends NBAPlayer {
  firstName?: string;
  lastName?: string;
  retiredYear?: number;
  draft?: { year: number; tid: number };
  transactions?: Array<{ season: number; tid: number; phase?: number }>;
}

export interface NBAGMRosterData {
  players: NBAGMPlayer[];
  teams: any[];
  draftPicks: DraftPick[];
}
