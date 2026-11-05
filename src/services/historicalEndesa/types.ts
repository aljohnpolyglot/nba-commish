import type { NBAPlayer } from '../../types/player';

export interface EndesaSourceRating {
  season: number;
  hgt?: number;
  stre?: number;
  spd?: number;
  jmp?: number;
  endu?: number;
  ins?: number;
  dnk?: number;
  ft?: number;
  fg?: number;
  tp?: number;
  diq?: number;
  oiq?: number;
  drb?: number;
  pss?: number;
  reb?: number;
  [key: string]: unknown;
}

export interface EndesaSourceStat {
  season: number;
  tid: number;
  playoffs?: boolean;
  jerseyNumber?: string | number;
  gp?: number;
  gs?: number;
  min?: number;
  fg?: number;
  fga?: number;
  tp?: number;
  tpa?: number;
  ft?: number;
  fta?: number;
  orb?: number;
  drb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  tov?: number;
  pf?: number;
  pts?: number;
  per?: number;
  ewa?: number;
  ortg?: number;
  drtg?: number;
  obpm?: number;
  dbpm?: number;
  vorp?: number;
  [key: string]: unknown;
}

export interface EndesaSourcePlayer {
  name: string;
  tid?: number;
  pos?: string;
  hgt?: number;
  weight?: number;
  born?: { year?: number; loc?: string };
  imgURL?: string;
  college?: string;
  ratings?: EndesaSourceRating[];
  stats?: EndesaSourceStat[];
  awards?: Array<{ season?: number; type?: string }>;
  draft?: { year?: number; round?: number; pick?: number; tid?: number; originalTid?: number };
  injury?: { type?: string; gamesRemaining?: number };
  retiredYear?: number | null;
  retireddYer?: number | null;
  retirementYear?: number | null;
}

export interface EndesaSourceTeamSeason {
  season: number;
  won?: number;
  lost?: number;
  playoffRoundsWon?: number;
  pop?: number;
  stadiumCapacity?: number;
  imgURL?: string;
  imgURLSmall?: string;
  note?: string;
}

export interface EndesaSourceTeam {
  tid: number;
  cid?: number;
  did?: number;
  region?: string;
  name: string;
  abbrev?: string;
  pop?: number;
  stadiumCapacity?: number;
  colors?: string[];
  imgURL?: string;
  imgURLSmall?: string;
  seasons?: EndesaSourceTeamSeason[];
  disabled?: boolean;
}

export interface EndesaSourceAwardPlayer {
  name?: string;
  tid?: number;
}

export interface EndesaSourceAwardSeason {
  season: number;
  mvp?: EndesaSourceAwardPlayer;
  finalsMvp?: EndesaSourceAwardPlayer;
  roy?: EndesaSourceAwardPlayer;
  scoringLeader?: EndesaSourceAwardPlayer;
  allLeague?: Array<{
    title?: string;
    players?: EndesaSourceAwardPlayer[];
  }>;
}

export interface EndesaMasterSource {
  startingSeason?: number;
  version?: number;
  players: EndesaSourcePlayer[];
  teams: EndesaSourceTeam[];
  awards?: EndesaSourceAwardSeason[];
  endesaImport?: Record<string, unknown>;
}

export interface HistoricalEndesaPlayerSourceMeta {
  identityKey: string;
  debutSeason: number;
  sourceSeason: number;
  sourceTeamTid: number;
  draftYear?: number;
  draftRound?: number;
  draftPick?: number;
  returnSeasons: number[];
}

export interface HistoricalEndesaDraftOutcome {
  id: string;
  season: number;
  playerId: string;
  identityKey: string;
  playerName: string;
  sourceTeamTid: number;
  prospectScore: number;
  status: 'pending' | 'selected' | 'undrafted';
  draftRound?: number;
  draftPick?: number;
  destinationAbbrev?: string;
  reviewed?: boolean;
}

export interface HistoricalEndesaBroadcastRow {
  teamId: number;
  equalShareEUR: number;
  performanceShareEUR: number;
  commercialShareEUR: number;
  totalEUR: number;
  previousTotalEUR?: number;
}

export interface HistoricalEndesaBroadcastMeeting {
  id: string;
  season: number;
  totalPoolEUR: number;
  equalPoolEUR: number;
  performancePoolEUR: number;
  commercialPoolEUR: number;
  rows: HistoricalEndesaBroadcastRow[];
  booked: boolean;
}

export interface HistoricalEndesaClubMovement {
  season: number;
  promotedTeamId: number;
  relegatedTeamId: number;
}

export interface HistoricalEndesaState {
  version: 1;
  sourceVersion: string;
  startYear: number;
  sourceSeason: number;
  materializedSeasons: number[];
  claimedIdentityKeys: string[];
  reservedIdentityKeys: string[];
  returnedIdentityKeys: string[];
  draftDepartures?: NBAPlayer[];
  preparedDraftSeasons: number[];
  draftOutcomes: HistoricalEndesaDraftOutcome[];
  broadcastMeetings: HistoricalEndesaBroadcastMeeting[];
  clubMovements: HistoricalEndesaClubMovement[];
}
