// Inline-PBP types. ZenGM-inspired: PBP-Events werden inline emittiert,
// die Running-Score wird AUS dem Event-Stream akkumuliert (nicht separat).
// Dadurch ist Drift zwischen Box-Score und PBP strukturell unmöglich.

import { PlayerPool, TeamId, Period } from '../live/playback/possessionTypes';

// Aligned 1:1 with PlayLine.type from old playRenderer so useLiveGame's reducer
// keeps working without translation. 'gameOver' covers both period-end markers
// and the final buzzer.
export type EventType =
  | 'jumpball'
  | 'made'
  | 'miss'
  | 'ft'
  | 'reb'
  | 'tov'
  | 'stl'
  | 'blk'
  | 'foul'
  | 'sub'
  | 'gameOver';

export interface InlineEvent {
  // Event identity & timing
  id: string;
  type: EventType;
  q: number;                // 1..numQuarters+otCount
  period: Period;           // "1st" | "2nd" | ... | "OT1" ...
  clock: string;            // "11:23" countdown
  gs: number;               // game-seconds elapsed since tip
  time: string;             // "1st 11:23" — convenience for UI

  // Team & lineups at moment of event
  tm: TeamId;               // which team owns the action
  possession: TeamId;       // who has the ball (for non-team events, == tm)
  lineupHOME: PlayerPool[];
  lineupAWAY: PlayerPool[];

  // Player & supplementary actors
  player?: PlayerPool;      // primary actor
  astPlayer?: PlayerPool;   // assist credit on made_fg
  rebounder?: PlayerPool;   // attached to miss_fg (legacy — usually a separate 'reb' event follows)
  blocker?: PlayerPool;     // attached to miss_fg when block
  stealer?: PlayerPool;     // attached to tov when stolen

  // Scoring contribution OF THIS EVENT (0 for miss/reb/tov/foul/sub/period_end)
  pts: number;

  // FG-kind flags
  is3?: boolean;            // 3-pt attempt
  is4?: boolean;            // 4-pt attempt (Euroleague/exhibition)
  isMake?: boolean;         // ft: was it made?
  isOffReb?: boolean;       // reb: offensive rebound

  // Foul/FT context
  inPenalty?: boolean;
  isFirstPenaltyFoul?: boolean;
  isFoulOut?: boolean;
  isIntentional?: boolean;

  // Sub context
  comingIn?: PlayerPool[];
  goingOut?: PlayerPool[];

  // Narrative (rendered once at emit-time, not on every render)
  desc: string;

  // Game-winner marker (walkoff)
  isGameWinner?: boolean;
  isOT?: boolean;
  otNum?: number;
}

// PlayLine-shape kept for consumer compatibility with the existing useLiveGame
// reducer logic. cs/ds are derived consumer-side from the event stream — they
// are computed once at the end of synthesis to embed the running score per line.
export interface InlinePlayLine extends InlineEvent {
  cs: number;  // HOME running score AFTER this event
  ds: number;  // AWAY running score AFTER this event
}

// Per-quarter, per-player budgets after distribution from game totals.
export interface PlayerQuarterBudget {
  fg2: number;   // 2pt makes
  fg3: number;   // 3pt makes
  fg4: number;   // 4pt makes (rare)
  m2: number;    // 2pt misses
  m3: number;    // 3pt misses
  m4: number;    // 4pt misses
  ftm: number;   // FT makes
  ftmiss: number;
  ast: number;
  orb: number;
  drb: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  sec: number;   // seconds-on-floor in this quarter (for sub timing)
}

export interface QuarterBudgets {
  q: number;
  homeByPid: Map<string, PlayerQuarterBudget>;
  awayByPid: Map<string, PlayerQuarterBudget>;
  homeTargetPts: number;
  awayTargetPts: number;
}

export interface SynthesizeInput {
  homeStats: import('../types').PlayerGameStats[];
  awayStats: import('../types').PlayerGameStats[];
  players: import('../../../types').NBAPlayer[];
  quarterScores: { home: number[]; away: number[] };
  otCount: number;
  gameWinner?: import('../types').GameResult['gameWinner'];
  homeTeamName?: string;
  awayTeamName?: string;
  timingConfig: import('../../../utils/gameClock').GameTimingConfig;
}
