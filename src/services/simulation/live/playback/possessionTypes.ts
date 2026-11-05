export type TeamId = 'HOME' | 'AWAY';
export type Period = string;

export type PossessionOutcome =
  | 'MADE_2'
  | 'MADE_3'
  | 'MADE_4'
  | 'MISS_2_DRB'
  | 'MISS_2_ORB'
  | 'MISS_3_DRB'
  | 'MISS_3_ORB'
  | 'MISS_4_DRB'
  | 'MISS_4_ORB'
  | 'TOV'
  | 'PENALTY_GOAL'
  | 'FOUL_TRIP';

export interface FTShot {
  isMake: boolean;
  shooter: PlayerPool;
}

export interface PossessionChallenge {
  team: TeamId;
  trigger:
    | 'Challenge of Called Foul'
    | 'Challenge OOB'
    | 'Challenge Goaltending/Basket Interference';
  initialCall: string;
  finalRuling: 'Stands' | 'Overturned';
  rulingDescription: string;
  successful: boolean;
  reimbursed: boolean;
  remaining: number;
}

export interface PossessionTimeout {
  team: TeamId;
  remaining: number;
  clutchRemaining: number;
  isClutch: boolean;
}

export interface Possession {
  id: number;
  team: TeamId;
  outcome: PossessionOutcome;
  quarter: number;
  pts: number;
  isJumpball?: boolean;

  scorer?: PlayerPool;
  assister?: PlayerPool;
  passPlayer?: PlayerPool; // flavor only, no stats
  is3?: boolean;
  is4?: boolean;
  isDunk?: boolean;

  blocker?: PlayerPool;

  rebounder?: PlayerPool;
  isOffReb?: boolean;

  handler?: PlayerPool;
  stealer?: PlayerPool;

  fouler?: PlayerPool;
  victim?: PlayerPool;
  fts?: FTShot[];
  shotValue?: 1 | 2 | 3 | 4;
  freeThrowsAwarded?: number;
  shotLocation?: 'paint' | 'midrange' | 'three' | 'four';
  ballState?: 'live' | 'out_of_bounds' | 'dead_ball' | 'free_throws';
  nextPossession?: TeamId;

  isFoulOut?: boolean;
  foulerFoulCount?: number;
  teamFouls?: number;
  inPenalty?: boolean;
  isFirstPenaltyFoul?: boolean;
  isIntentional?: boolean;
  isTechnical?: boolean;
  foulType?: string;
  turnoverCall?:
    | 'shot_clock'
    | 'inbound'
    | 'traveling'
    | 'double_dribble'
    | 'backcourt'
    | 'offensive_three_seconds'
    | 'back_to_basket'
    | 'out_of_bounds'
    | 'kicked_ball';
  callTimerSeconds?: number;
  restartLocation?: 'corner';
  basketInterference?: boolean;
  shotClockResetSeconds?: number;
  isHeave?: boolean;
  heaveProtected?: boolean;
  heaveDistanceFeet?: number;
  challenge?: PossessionChallenge;
  timeout?: PossessionTimeout;

  clock?: string;
  gs?: number;
  period?: Period;
}

export interface PlayerPool {
  n: string;
  fn: string;
  id: string;
  imgURL?: string;
  tm: TeamId;
  min: string | number;
  pos: 'G' | 'F' | 'C';
  fg2: number;
  fg3: number;
  fg4?: number;
  m2: number;
  m3: number;
  m4?: number;
  ftm: number;
  ftmiss: number;
  ast: number;
  orb: number;
  drb: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  dunks?: number;
  ftPct?: number;
  fgAtRim?: number;
  fgaAtRim?: number;
  fgLowPost?: number;
  fgaLowPost?: number;
  fgMidRange?: number;
  fgaMidRange?: number;
  fouledOut?: boolean;
}
