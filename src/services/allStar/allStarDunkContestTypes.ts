import { SelectedProp } from './dunkCommentary';
import { Judge } from './judges';
import { NBAPlayer } from '../../types';

export type { NBAPlayer } from '../../types';

export interface DunkPlayer extends NBAPlayer {
  ratings: { dnk: number; jmp: number; spd: number }[];
}

export interface PlayerRound {
  playerId: string;
  playerName: string;
  dunks: DunkAttempt[];
  totalScore: number;
}

export type ApproachType = 'standard' | 'free_throw_line' | 'beyond_ft_line' | 'halfcourt';
export type DeliveryType = 'self' | 'self_lob' | 'self_glass' | 'teammate_pass' | 'teammate_alley' | 'teammate_glass';
export type ObstacleType = 'none' | 'over_chair' | 'over_mascot' | 'over_car' | 'over_person_crouching' | 'over_person_standing';

export interface DunkComposition {
  approach: ApproachType;
  delivery: DeliveryType;
  obstacle: ObstacleType;
  move: string;
  tier: number;
}

export interface DunkAttempt {
  tier: number;
  move: string;
  toss: string;
  composition: DunkComposition;
  attemptNum: number;
  made: boolean;
  score: number;
  judges: number[];
  history: { tier: number; move: string; made: boolean }[];
  prop: SelectedProp | null;
}

export interface Play {
  id: string;
  type: 'section_header' | 'player_intro' | 'dunk_setup' | 'dunk_toss' | 'dunk_in_air' | 'dunk_outcome_made' | 'dunk_outcome_miss' | 'dunk_reveal' | 'score_reveal' | 'perfect' | 'retry' | 'bail' | 'standings' | 'winner' | 'crowd_reaction';
  text: string;
  subtext?: string;
  playerId?: string;
  activePlayer?: string;
  round?: 'round1' | 'finals' | 'tiebreaker';
  scoreUpdate?: { playerId: string; delta: number; newTotal: number };
  pauseMs?: number;
  triggerJudgeModal?: {
    playerId: string;
    playerName: string;
    judgeScores: number[];
    total: number;
    moveName: string;
    tier: number;
    attempts: number;
    made: boolean;
  };
  standings?: Array<{ name: string; score: number; id: string; dunksDone: number }>;
}

export interface DunkContestResult {
  round1: PlayerRound[];
  round2: PlayerRound[];
  winnerId: string;
  winnerName: string;
  mvpDunk?: string;
  log: string[];
  plays: Play[];
  judges?: Judge[];
}
