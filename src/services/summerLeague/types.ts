import type { GameResult, NBAPlayer } from '../../types';
import type { FibaSelectedPlayer, InternationalTournamentGame } from '../fiba/types';

export type SummerLeagueTournamentStatus =
  | 'roster-selection'
  | 'preliminary'
  | 'final'
  | 'complete'
  | 'reviewed';

export interface SummerLeagueTeam {
  id: string;
  sourceTid: number;
  name: string;
  abbrev: string;
  logoUrl?: string;
  seed: number;
  strength: number;
  players: FibaSelectedPlayer[];
  reserves: FibaSelectedPlayer[];
  availablePlayerIds: string[];
}

export interface SummerLeagueAwards {
  championshipMvpPlayerId?: string;
  mvpPlayerId?: string;
  firstTeamPlayerIds: string[];
  secondTeamPlayerIds: string[];
}

export interface SummerLeagueResult {
  championTeamId: string;
  runnerUpTeamId: string;
  finalScore?: string;
  awards: SummerLeagueAwards;
}

export interface SummerLeagueTournamentState {
  version: 1;
  id: string;
  competitionId: 'nba-summer-league';
  year: number;
  branchYear: number;
  title: string;
  location: string;
  status: SummerLeagueTournamentStatus;
  teams: SummerLeagueTeam[];
  games: InternationalTournamentGame[];
  boxScores: GameResult[];
  result?: SummerLeagueResult;
  userTeamId?: number;
  userRosterFinalized: boolean;
  reviewed: boolean;
  readOnly?: boolean;
  reviewEntryVersion?: number;
  rosterReviewDraft?: {
    selectedPlayerIds: string[];
    searchQuery: string;
    editingPlayerId: string | 'add' | null;
  };
}

export interface SummerLeagueStanding {
  rank: number;
  teamId: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
}

export interface SummerLeagueHistoryEntry {
  year: number;
  champion: string | null;
  runnerUp: string | null;
  championshipMvp: string | null;
  mvp: string | null;
  firstTeam: string[];
  secondTeam: string[];
  source: 'historical' | 'save';
  tournament?: SummerLeagueTournamentState;
  sourceGames?: SummerLeagueSourceGame[];
  sourceTeams?: SummerLeagueSourceTeam[];
  sourceStandings?: SummerLeagueStanding[];
  sourceStats?: SummerLeagueSourceStat[];
  sourcePlayers?: NBAPlayer[];
  sourceBracket?: SummerLeagueSourceBracket;
}

export interface SummerLeagueSourceGame {
  id: string;
  date: string;
  time?: string;
  stage: string;
  stageLabel?: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  venue?: string;
  boxScoreUrl?: string;
}

export interface SummerLeagueSourcePlayer {
  id: string;
  name: string;
  teamId: string;
  position?: string;
  jerseyNumber?: string | null;
  portraitUrl?: string | null;
  birthYear?: number | null;
  bioPlayer?: NBAPlayer;
}

export interface SummerLeagueSourceTeam {
  id: string;
  name: string;
  abbrev?: string;
  rank?: number | null;
  wins: number;
  losses: number;
  played: number;
  winPct?: number | null;
  roster: SummerLeagueSourcePlayer[];
}

export interface SummerLeagueSourceStat {
  id: string | number;
  playerId?: string;
  imageUrl?: string;
  name: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  teamFlagId: string;
  teamFlagUrl?: string;
  pos: string;
  age: number | null;
  G: number;
  GS: number;
  MP: number;
  MP_pg: number;
  FG: number;
  FG_pg: number;
  FGA: number;
  FGA_pg: number;
  FG_pct: number;
  '3P': number;
  '3P_pg': number;
  '3PA': number;
  '3PA_pg': number;
  '3P_pct': number;
  '2P': number;
  '2P_pg': number;
  '2PA': number;
  '2PA_pg': number;
  '2P_pct': number;
  eFG_pct: number;
  FT: number;
  FT_pg: number;
  FTA: number;
  FTA_pg: number;
  FT_pct: number;
  ORB: number;
  ORB_pg: number;
  DRB: number;
  DRB_pg: number;
  TRB: number;
  TRB_pg: number;
  AST: number;
  AST_pg: number;
  TOV: number;
  TOV_pg: number;
  STL: number;
  STL_pg: number;
  BLK: number;
  BLK_pg: number;
  PF: number;
  PF_pg: number;
  PTS: number;
  PTS_pg: number;
}

export interface SummerLeagueSourceBracketGame {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface SummerLeagueSourceBracket {
  semifinals: SummerLeagueSourceBracketGame[];
  finals: SummerLeagueSourceBracketGame[];
}
