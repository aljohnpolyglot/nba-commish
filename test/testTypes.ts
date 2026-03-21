/**
 * testTypes.ts — Sandbox / test environment types
 * Use these for mocking, seeding, and experimenting with new features
 * without touching production types.ts
 */

import type { NBATeam, NBAPlayer, GamePhase, LeagueStats } from '../src/types';

// ─── Sim Config ──────────────────────────────────────────────────────────────

export interface SandboxSimConfig {
  /** Year to start the sandbox sim from */
  startYear: number;
  startPhase: GamePhase;
  /** Number of regular season games per team */
  gamesPerTeam: number;
  /** Speed multiplier — 1 = normal, 2 = 2x fast, etc. */
  simSpeed: number;
  /** Skip animations / delays entirely */
  instantSim: boolean;
  /** Seed for deterministic random outcomes */
  randomSeed?: number;
  /** Override salary cap (useful for testing luxury tax edge cases) */
  salaryCapOverride?: number;
}

export const DEFAULT_SANDBOX_CONFIG: SandboxSimConfig = {
  startYear: 2025,
  startPhase: 'Regular Season',
  gamesPerTeam: 82,
  simSpeed: 1,
  instantSim: false,
};

// ─── Mock Player ─────────────────────────────────────────────────────────────

/** Minimal player stub for unit tests — fill only what the test needs */
export type MockPlayer = Partial<NBAPlayer> & {
  internalId: string;
  name: string;
  overallRating: number;
  tid: number;
};

export function makeMockPlayer(overrides: Partial<MockPlayer> = {}): MockPlayer {
  return {
    internalId: crypto.randomUUID(),
    name: 'Test Player',
    overallRating: 75,
    tid: 0,
    status: 'Active',
    injury: { type: 'Healthy', gamesRemaining: 0 },
    ratings: [],
    stats: [],
    ...overrides,
  };
}

// ─── Mock Team ────────────────────────────────────────────────────────────────

export type MockTeam = Partial<NBATeam> & {
  id: number;
  name: string;
  abbrev: string;
};

export function makeMockTeam(overrides: Partial<MockTeam> = {}): MockTeam {
  return {
    id: 0,
    name: 'Test Team',
    abbrev: 'TST',
    conference: 'East',
    wins: 0,
    losses: 0,
    strength: 75,
    ...overrides,
  };
}

// ─── Scenario Seeds ──────────────────────────────────────────────────────────

/** Pre-built scenarios for sandbox sims */
export type SandboxScenario =
  | 'default'          // Normal 2025-26 season
  | 'superteam'        // One team stacked with 99 OVR players
  | 'parity'           // All teams set to equal strength
  | 'injury_chaos'     // High injury rate, all starters banged up
  | 'expansion'        // Two extra expansion teams added
  | 'retro'            // Historical season sim (pre-2000)
  | 'future'           // Far-future season (2040+)
  | 'custom';          // Fully custom — provide your own players/teams

export interface SandboxScenarioConfig {
  scenario: SandboxScenario;
  label: string;
  description: string;
  simConfig: Partial<SandboxSimConfig>;
  leagueStatsOverrides?: Partial<LeagueStats>;
}

export const SANDBOX_SCENARIOS: SandboxScenarioConfig[] = [
  {
    scenario: 'default',
    label: 'Default 2025-26',
    description: 'Standard NBA sim with real rosters.',
    simConfig: {},
  },
  {
    scenario: 'superteam',
    label: 'Superteam',
    description: 'One team gets all 99 OVR players. Can anyone stop them?',
    simConfig: { randomSeed: 42 },
  },
  {
    scenario: 'parity',
    label: 'Total Parity',
    description: 'Every team normalized to 75 OVR. Coin-flip season.',
    simConfig: { randomSeed: 1 },
  },
  {
    scenario: 'injury_chaos',
    label: 'Injury Chaos',
    description: 'Injury rates tripled. Depth wins championships.',
    simConfig: {},
  },
  {
    scenario: 'expansion',
    label: 'Expansion Era',
    description: '32-team league with two expansion franchises.',
    simConfig: {},
    leagueStatsOverrides: { numGamesPlayoffSeries: [7, 7, 7, 7] },
  },
];

// ─── Feature Flag Types ──────────────────────────────────────────────────────

/**
 * Flags for features under development — toggle these to test new stuff
 * without a full feature branch release.
 */
export interface SandboxFeatureFlags {
  /** Enable experimental 4-point line scoring */
  fourPointLine: boolean;
  /** Enable in-game coach challenge system */
  coachChallenges: boolean;
  /** Show per-possession advanced stats in box score */
  advancedBoxScore: boolean;
  /** New AI trade proposal engine */
  aiTradeEngine: boolean;
  /** Player chemistry system affecting team performance */
  playerChemistry: boolean;
  /** Dynamic home court advantage based on fan morale */
  dynamicHomeCourtAdvantage: boolean;
  /** G League call-up mechanic */
  gLeagueCallups: boolean;
  /** Two-way contract system */
  twoWayContracts: boolean;
  /** Expanded draft (60 picks + international prospects) */
  expandedDraft: boolean;
}

export const DEFAULT_FEATURE_FLAGS: SandboxFeatureFlags = {
  fourPointLine: false,
  coachChallenges: false,
  advancedBoxScore: false,
  aiTradeEngine: false,
  playerChemistry: false,
  dynamicHomeCourtAdvantage: false,
  gLeagueCallups: false,
  twoWayContracts: false,
  expandedDraft: false,
};

// ─── Test Roster Override ────────────────────────────────────────────────────

/**
 * Used to inject a custom roster into a sandbox sim without fetching from BBGM.
 */
export interface TestRosterOverride {
  teams: MockTeam[];
  players: MockPlayer[];
  /** If true, ignore BBGM fetch and use only these teams/players */
  useOnly: boolean;
}

// ─── Sim Result Snapshot ─────────────────────────────────────────────────────

/**
 * Lightweight snapshot of a completed sandbox sim — useful for comparing
 * outcomes across different configs or feature flag states.
 */
export interface SimSnapshot {
  id: string;
  label: string;
  createdAt: string;
  config: SandboxSimConfig;
  featureFlags: Partial<SandboxFeatureFlags>;
  championTid: number;
  finalStandings: { tid: number; wins: number; losses: number }[];
  totalGamesPlayed: number;
  topScorer: { name: string; tid: number; ppg: number };
}
