export type TeamId = 'HOME' | 'AWAY';
export type Period = string;

export interface PlayerPool {
  n: string; fn: string; id: string; imgURL?: string; tm: TeamId;
  min: number; pos: 'G' | 'F' | 'C';
  fg2: number; fg3: number; fg4?: number;
  m2: number;  m3: number; m4?: number;
  ftm: number; ftmiss: number;
  ast: number;
  orb: number; drb: number;
  stl: number; blk: number;
  tov: number; pf: number;
  ftPct?: number;
  fouledOut?: boolean;
}

export interface RawEvent {
  type: 'made' | 'miss' | 'ft' | 'tov' | 'foul';
  pts: number;
  p: PlayerPool;
  is3: boolean;
  is4?: boolean;
  isMake?: boolean;
  astPlayer?: PlayerPool;
  rebounder?: PlayerPool;
  isOffReb?: boolean;
  blocker?: PlayerPool;
  stealer?: PlayerPool;
  gs?: number;
  tripId?: number;
  isFTFoul?: boolean;
  foulType?: string;
  teamFouls?: number;
  inPenalty?: boolean;
  isAndOne?: boolean;
  isFTFoulForTeam?: boolean;
  isTechnicalTrip?: boolean;
  isPenaltyFT?: boolean;
  isLastFTInTrip?: boolean;
  victim?: PlayerPool;
  isFoulOut?: boolean;
  isIntentional?: boolean;
  isPenalty?: boolean;
  isLatePenalty?: boolean;
  displayGs?: number;
}
