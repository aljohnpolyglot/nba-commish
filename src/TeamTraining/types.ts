export type Allocations = {
  offense: number;
  defense: number;
  conditioning: number;
  recovery: number;
  systemFocus?: string[];
};

export type TrainingParadigm = 'Balanced' | 'Offensive' | 'Defensive' | 'Biometrics' | 'Recovery';

export interface DailyPlan {
  day: number;
  intensity: number;
  allocations: Allocations;
  paradigm: TrainingParadigm;
}

export type StaffRole =
  | 'Head Coach'
  | 'Assistant Coach'
  | 'Head of Sports Science'
  | 'Head Physio'
  | 'Chief Scout'
  | 'Head of Analytics';

export type StaffAttributes = {
  offense: number;
  defense: number;
  tactics: number;
  development: number;
  conditioning: number;
  adaptability: number;
  determination: number;
  levelOfDiscipline: number;
  manManagement: number;
  motivating: number;
  physiotherapy: number;
  sportsScience: number;
  judgingPlayerAbility: number;
  judgingPlayerPotential: number;
  negotiating: number;
};

export type StaffMember = {
  id: string;
  name: string;
  role: StaffRole;
  attributes: StaffAttributes;
  salary: number;
  contractLength: number;
};

export type Staffing = {
  headCoach?: StaffMember;
  assistantCoaches?: StaffMember[];
  headOfSportsScience?: StaffMember;
  headPhysio?: StaffMember;
  chiefScout?: StaffMember;
  headOfAnalytics?: StaffMember;
};

export type DevArchetype = string;
export type IndividualIntensity = 'Rest' | 'Half' | 'Normal' | 'Double';

export type PlayerStats = {
  hgt: number;
  stre: number;
  spd: number;
  jmp: number;
  endu: number;
  ins: number;
  dnk: number;
  ft: number;
  fg: number;
  tp: number;
  oiq: number;
  drb: number;
  pss: number;
  drivingDunk: number;
  standingDunk: number;
  diq: number;
  reb: number;
};

export type Player = {
  id: string;
  name: string;
  imgURL?: string;
  age: number;
  ovr: number;
  pot: number;
  workEthic: 'Low' | 'Medium' | 'High' | 'Elite';
  devFocus: DevArchetype;
  mentorId?: string;
  injury?: { daysRemaining: number };
  individualIntensity: IndividualIntensity;
  fatigue: number;
  morale: number;
  stats: PlayerStats;
  pos: string;
  ywt: number;
  exp: number;
  weightLbs: number;
  heightIn: number;
  /**
   * Uncapped mentor EXP — `(rsGames + poGames × 5) × personalityMultiplier`
   * per docs/mentorship.md. Computed by the adapter.
   */
  mentorExp?: number;
  /** RS games played — used by mentor selector breakdown line. */
  rsGames?: number;
  /** Playoff games played — used by mentor selector breakdown line. */
  poGames?: number;
  /** Mood traits at adapter time — let MentorshipModal show trait chips. */
  moodTraits?: string[];
  /** OVR delta vs last season (2K scale) — null if no prior season. */
  ovrDelta?: number | null;
  /** POT delta vs last season (2K scale). */
  potDelta?: number | null;
  /** Composite mood score (-10..+10) computed via utils/mood/moodScore. */
  moodScore?: number;
};

export type Team = {
  tid: number;
  region: string;
  name: string;
  abbrev: string;
  logoUrl?: string;
  defensiveAura?: number;
};

export type K2Result = {
  OS: number[];
  AT: number[];
  IS: number[];
  PL: number[];
  DF: number[];
  RB: number[];
};

export type PlayerK2 = Player & {
  k2: K2Result;
  rating2K: number;
  bbgmOvr: number;
  currentRating: PlayerStats;
  ratings?: any[];
};

export type DayType =
  | 'Game'
  | 'Shootaround'
  | 'Recovery'
  | 'Recovery Practice'
  | 'Light Practice'
  | 'Balanced Practice'
  | 'Structured Practice'
  | 'Full Training'
  | 'Off Day';

export type ScheduleDay = {
  /** Day-of-month number (1-31). Used as cell label. */
  day: number;
  hasGame: boolean;
  isB2B: boolean;
  activity: DayType;
  description: string;
  /** Game-day metadata. Populated by buildCalendar from state.schedule on `Game` activity days. */
  opponent?: {
    tid: number;
    abbrev: string;
    logoUrl?: string;
    isHome: boolean;
  };
  /** ISO date for this calendar day (YYYY-MM-DD). Lets the calendar header show real dates. */
  isoDate?: string;
  /** 0=Sun..6=Sat, the actual weekday the date falls on. ScheduleView uses this to anchor cells. */
  weekday?: number;
};
