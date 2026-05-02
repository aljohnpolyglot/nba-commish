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
  | 'FOUL_TRIP';

export interface FTShot {
  isMake: boolean;
  shooter: PlayerPool;
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

  blocker?: PlayerPool;

  rebounder?: PlayerPool;
  isOffReb?: boolean;

  handler?: PlayerPool;
  stealer?: PlayerPool;

  fouler?: PlayerPool;
  victim?: PlayerPool;
  fts?: FTShot[];

  isFoulOut?: boolean;
  foulerFoulCount?: number;
  teamFouls?: number;
  inPenalty?: boolean;
  isFirstPenaltyFoul?: boolean;
  isIntentional?: boolean;
  isTechnical?: boolean;
  foulType?: string;

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
  ftPct?: number;
  fouledOut?: boolean;
}
