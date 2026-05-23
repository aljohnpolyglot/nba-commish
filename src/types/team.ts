import type { TycoonState } from './tycoon';

export interface NBAConf {
  cid: number;
  name: string;
}

export interface NBADiv {
  cid: number;
  did: number;
  name: string;
}

export interface HeadToHeadRecord {
  won: number;
  lost: number;
  tied: number;
}

export interface HeadToHead {
  season: number;
  regularSeason: Record<number, Record<number, HeadToHeadRecord>>;
}

export type TeamStatus =
  | 'contending'
  | 'win_now'
  | 'play_in_push'
  | 'retooling'
  | 'cap_clearing'
  | 'rebuilding'
  | 'development';

export interface RetiredJerseyRecord {
  number: string;
  text: string;
  pid?: string | number;
  playerId?: string;
  seasonRetired: number;
  teamId: number;
  reason: 'franchise_icon' | 'championship_core' | 'hof_legend' | 'loyal_star' | 'honorary';
  tier: 'automatic' | 'fast_track' | 'standard' | 'late_honor';
}

export interface TradeException {
  id: string;
  amountUSD: number;
  createdDate: string;
  expiresDate: string;
  sourcePlayerName?: string;
  sourceLeagueYear: number;
  vintage: number;
  source: 'plain' | 'aggregation' | 'sign-and-trade';
}

export type OwnerWealthTier = 'LocalWealthy' | 'NationalMagnate' | 'Billionaire';
export type OwnerPatience = 'TriggerHappy' | 'Steady' | 'LongTerm';
export type OwnerVision = 'WinNow' | 'Develop' | 'Frugal';

export interface OwnerProfile {
  name: string;
  nationality: string;
  face: any;
  staffImageId?: number;
  wealthTier: OwnerWealthTier;
  patience: OwnerPatience;
  vision: OwnerVision;
  cashInjectionUsedThisSeason: boolean;
  seasonsSinceLastInjection: number;
  consecutiveBadSeasons: number;
}

export type SetupTierLabel = 'Powerhouse' | 'Established' | 'MidTier' | 'Underdog';

export interface NBATeam {
  id: number;
  name: string;
  abbrev: string;
  region?: string;
  conference: string;
  cid?: number;
  did?: number;
  wins: number;
  losses: number;
  otl?: number;
  tied?: number;
  strength: number;
  clinchedPlayoffs?: 'w' | 'x' | 'y' | 'z' | 'o';
  pop?: number;
  logoUrl?: string;
  colors?: string[];
  streak?: { type: 'W' | 'L'; count: number };
  manualTeamStatus?: TeamStatus;
  seasons?: Array<{
    season: number;
    won: number;
    lost: number;
    playoffRoundsWon: number;
  }>;
  retiredJerseyNumbers?: RetiredJerseyRecord[];
  tradeExceptions?: TradeException[];
  deadMoney?: DeadMoneyEntry[];
  cashUsedInTrades?: number;
  trainingCalendar?: Record<string, {
    intensity: number;
    paradigm: 'Balanced' | 'Offensive' | 'Defensive' | 'Biometrics' | 'Recovery';
    allocations: { offense: number; defense: number; conditioning: number; recovery: number; systemFocus?: string[] };
    auto?: boolean;
  }>;
  normalDayDefault?: {
    intensity: number;
    paradigm: 'Balanced' | 'Offensive' | 'Defensive' | 'Biometrics' | 'Recovery';
    allocations: { offense: number; defense: number; conditioning: number; recovery: number; systemFocus?: string[] };
  };
  systemFamiliarity?: {
    offense: number;
    defense: number;
    byOffense?: Record<string, number>;
    byDefense?: Record<string, number>;
  };
  defensiveAura?: number;
  tycoon?: TycoonState;
  recentEndesaPositions?: number[];
  recentEuroleagueStages?: Array<'final-four' | 'qf' | 'group' | 'none'>;
  lastEndesaFinish?: number;
  lastEuroleagueStage?: 'final-four' | 'qf' | 'group' | 'none';
  lastEuroAwayGames?: number;
  justWonEndesa?: boolean;
  justReachedEuroFinalFour?: boolean;
  ownerProfile?: OwnerProfile;
  startingTier?: SetupTierLabel;
  startingBudget?: number;
}

export interface DeadMoneyEntry {
  playerId: string;
  playerName: string;
  remainingByYear: { season: string; amountUSD: number }[];
  stretched: boolean;
  waivedDate: string;
  originalExpYear: number;
}

export interface NonNBATeam {
  tid: number;
  cid?: number;
  did?: number;
  region?: string;
  name: string;
  abbrev?: string;
  pop?: number;
  stadiumCapacity?: number;
  imgURL?: string;
  colors?: string[];
  league: 'Euroleague' | 'PBA' | 'WNBA' | 'B-League' | 'G-League' | 'Endesa' | 'China CBA' | 'NBL Australia' | string;
  nbaAffiliate?: string;
}
