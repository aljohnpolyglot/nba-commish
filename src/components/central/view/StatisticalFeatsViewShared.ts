import type { NBAPlayer } from '../../../types';

export const FEAT_CATEGORIES = [
  '50-PT GAMES',
  '40-PT GAMES',
  '30-PT GAMES',
  'TRIPLE-DOUBLES',
  'DOUBLE-DOUBLES',
  '5×5',
];

export interface FeatEntry {
  id: string;
  gameId: number;
  player: NBAPlayer;
  playerName: string;
  teamId: number;
  teamAbbrev: string;
  oppTeamId: number;
  oppAbbrev: string;
  date: string;
  isWin: boolean;
  result: string;
  featsFound: string[];
  gs: boolean;
  min: number;
  mp: string;
  fgm: number;
  fga: number;
  fgp: string;
  tpm: number;
  tpa: number;
  tpp: string;
  twom: number;
  twoa: number;
  twop: string;
  efgp: string;
  ftm: number;
  fta: number;
  ftp: string;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  gmsc: number;
  plusMinus: number | null;
}
