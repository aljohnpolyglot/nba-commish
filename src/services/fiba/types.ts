export interface FibaSourceRating {
  season?: number;
  hgt?: number;
  stre?: number;
  spd?: number;
  jmp?: number;
  endu?: number;
  ins?: number;
  dnk?: number;
  fg?: number;
  tp?: number;
  ft?: number;
  pss?: number;
  reb?: number;
  drb?: number;
  oiq?: number;
  diq?: number;
  fuzz?: number;
  [key: string]: unknown;
}

export interface FibaSourceStat {
  season?: number;
  tid?: number;
  playoffs?: boolean;
  jerseyNumber?: string | number;
  [key: string]: unknown;
}

export interface FibaSourceAward {
  season: number;
  type: string;
}

export interface FibaSourceTeam {
  tid: number;
  region: string;
  name: string;
  abbrev: string;
  countryId?: string | number;
  iso2?: string;
  imgURL?: string;
  disabled?: boolean;
  [key: string]: unknown;
}

export interface FibaSourcePlayer {
  name: string;
  tid: number;
  pos?: string;
  hgt?: number;
  weight?: number;
  born?: { year?: number; loc?: string; [key: string]: unknown };
  college?: string;
  imgURL?: string;
  jerseyNumber?: string | number;
  ratings: FibaSourceRating[];
  stats: FibaSourceStat[];
  awards: FibaSourceAward[];
  [key: string]: unknown;
}

export interface FibaHistoricalRoster {
  version: number;
  startingSeason: number;
  name: string;
  confs: unknown[];
  divs: unknown[];
  teams: FibaSourceTeam[];
  players: FibaSourcePlayer[];
  gameAttributes: unknown[];
}

export interface FibaRosterDiagnostics {
  sourceTeamRows: number;
  validTeams: number;
  invalidTeams: number;
  sourcePlayerRows: number;
  validPlayers: number;
  invalidPlayers: number;
  ratingRows: number;
  invalidRatingRows: number;
  statRows: number;
  invalidStatRows: number;
  awardRows: number;
  invalidAwardRows: number;
  playersWithoutRatings: number;
  playersWithoutStats: number;
  playersWithoutJersey: number;
  playersWithUnknownTeam: number;
  ratingSeasonStart?: number;
  ratingSeasonEnd?: number;
  countries: number;
}

export interface FibaAwardMergeDiagnostics {
  sourceAwardRows: number;
  matchedPlayers: number;
  matchedSourceRows: number;
  awardsAdded: number;
  duplicateAwards: number;
  postCutoffAwards: number;
  rejectedMajorTitles: number;
}

export interface MergedFibaPlayerAwards {
  players: import('../../types').NBAPlayer[];
  diagnostics: FibaAwardMergeDiagnostics;
}

export interface LoadedFibaRoster {
  roster: FibaHistoricalRoster;
  diagnostics: FibaRosterDiagnostics;
}

export interface FibaPoolCandidate {
  id: string;
  name: string;
  imageUrl?: string;
  country: string;
  source: 'save' | 'archive';
  position: string;
  strength: number;
  selectionScore: number;
  jerseyNumber?: string;
  birthYear?: number;
  savePlayerId?: string;
  archivePlayerName?: string;
  rating?: FibaSourceRating;
  naturalized?: boolean;
}

export interface FibaCountryPool {
  country: string;
  teamTid: number;
  abbrev: string;
  imageUrl?: string;
  candidates: FibaPoolCandidate[];
}

export interface FibaPoolDiagnostics {
  year: number;
  saveCandidates: number;
  archiveCandidates: number;
  duplicateReplacements: number;
  excludedWithoutCountry: number;
  excludedWithoutYearRating: number;
  excludedByTeamLifecycle: number;
}

export interface BuiltFibaPools {
  pools: FibaCountryPool[];
  diagnostics: FibaPoolDiagnostics;
}

export type FibaRosterRole = 'guard' | 'forward' | 'big';

export interface FibaSelectedPlayer extends FibaPoolCandidate {
  rosterRole: FibaRosterRole;
  jerseyNumber: string;
}

export interface FibaSelectedRoster {
  country: string;
  teamTid: number;
  abbrev: string;
  imageUrl?: string;
  players: FibaSelectedPlayer[];
  reserves: FibaSelectedPlayer[];
  cuts: FibaPoolCandidate[];
  isPlayable: boolean;
}

export interface PreparedFibaNationalTeams {
  year: number;
  rosters: FibaSelectedRoster[];
  unplayableCountries: FibaSelectedRoster[];
  savePlayersWithHistoricalAwards: import('../../types').NBAPlayer[];
  sourceDiagnostics: FibaRosterDiagnostics;
  poolDiagnostics: FibaPoolDiagnostics;
  awardDiagnostics: FibaAwardMergeDiagnostics;
}

export type InternationalTournamentKind = 'world-cup' | 'olympics-men' | 'eurobasket';
export type InternationalTournamentStatus =
  | 'scheduled'
  | 'rosters-ready'
  | 'group-stage'
  | 'knockout'
  | 'complete'
  | 'reviewed';

export interface InternationalTournamentTeam {
  id: string;
  country: string;
  abbrev: string;
  imageUrl?: string;
  sourceTid: number;
  seed: number;
  strength: number;
  players: FibaSelectedPlayer[];
  reserves: FibaSelectedPlayer[];
}

export interface InternationalTournamentGame {
  id: string;
  date: string;
  phase: 'group' | 'classification' | 'round-of-16' | 'quarterfinal' | 'semifinal' | 'third-place' | 'final';
  group?: string;
  groupStage?: 'first-round' | 'second-round' | 'classification';
  homeTeamId: string;
  awayTeamId: string;
  gameId?: number;
  played: boolean;
  homeScore?: number;
  awayScore?: number;
  winnerTeamId?: string;
}

export interface InternationalTournamentGroup {
  id: string;
  stage?: 'first-round' | 'second-round' | 'classification';
  teamIds: string[];
}

export interface InternationalGroupStanding {
  teamId: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  tablePoints: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
}

export interface InternationalTournamentResult {
  championTeamId: string;
  runnerUpTeamId: string;
  thirdPlaceTeamId?: string;
  fourthPlaceTeamId?: string;
  finalScore?: string;
  thirdPlaceScore?: string;
}

export interface InternationalTournamentState {
  version: 1;
  id: string;
  competitionId: string;
  kind: InternationalTournamentKind;
  year: number;
  playedYear?: number;
  branchYear: number;
  status: InternationalTournamentStatus;
  hostCountries: string[];
  fieldMode: 'eligible-countries' | 'capped';
  teams: InternationalTournamentTeam[];
  groups: InternationalTournamentGroup[];
  games: InternationalTournamentGame[];
  boxScores: Array<import('../../types').GameResult>;
  result?: InternationalTournamentResult;
  reviewed: boolean;
  readOnly?: boolean;
  reviewEntryVersion?: number;
}

export interface SimulatedInternationalGame {
  tournamentGame: InternationalTournamentGame;
  boxScore: import('../../types').GameResult;
}
