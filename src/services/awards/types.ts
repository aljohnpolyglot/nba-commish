/**
 * Award system types — data-driven, league-agnostic.
 *
 * Every award is a record in AwardRegistry. The same calculator can power
 * multiple awards (e.g. NBA MVP + EL MVP + ACB MVP all use mvpCalc, with
 * different player pools). Branding is per-mode via `brandedAs`.
 */
import type { NBAPlayer, NBATeam, NBAGMStat, StaffData, GameState } from '../../types';

export type AwardScope = 'player' | 'coach';

export type AwardCategory =
  | 'season'       // MVP, DPOY
  | 'defense'      // All-Defensive Teams
  | 'rookie'       // ROY, All-Rookie
  | 'rising'       // Rising Star (under-23), Best Young Player (under-22)
  | 'stat-leader'  // Top Scorer, Rebound Leader, PIR, etc.
  | 'coach'        // COY, Best Coach
  | 'all-team'     // All-League 1st/2nd/3rd
  | 'postseason';  // Finals MVP, Final Four MVP (assigned externally)

export type CalculatorId =
  | 'mvp' | 'dpoy' | 'rookie' | 'young' | 'stat-leader'
  | 'pir' | 'coy' | 'all-team' | 'six-man' | 'mip'
  | 'postseason'; // marker — actually written by playoff resolver

export type PoolId = 'nba' | 'endesa' | 'euroleague' | 'all-active';

export type EligibilityKey =
  | 'min-games' | 'rookie-year' | 'under-22' | 'under-23'
  | 'bench-role' | 'pos-G' | 'pos-F' | 'pos-C';

export type UIMode = 'nba' | 'euro_isolated' | 'pba_isolated' | 'fictional';

export interface TrophyDef {
  /** Lucide icon name (e.g. 'star', 'trophy', 'flame'). */
  icon: string;
  /** Tailwind color hue: 'yellow' | 'blue' | 'emerald' | etc. */
  color: string;
  /** Short blurb shown on trophy detail. */
  blurb?: string;
}

/**
 * A calculator takes a snapshot of the league and returns scored candidates.
 * Pure — no state mutation. Used both for "races" (live projections) and
 * "announce" (winner selection from final stats).
 */
export interface CalculatorContext {
  players: NBAPlayer[];
  teams: NBATeam[];
  nonNBATeams: any[];
  season: number;
  staff?: StaffData | null;
  poolTids: Set<number>;
  minGames: number;
  /** Optional arg payload (e.g. { metric: 'pts' } for stat-leader). */
  args?: any;
}

export interface AwardCandidate {
  player?: NBAPlayer;
  coachName?: string;
  team: NBATeam;
  score: number;
  odds: string;
  stats?: NBAGMStat;
  // For all-team selections
  teamIndex?: number; // 0 = 1st, 1 = 2nd, 2 = 3rd
  pos?: string;
}

export type Calculator = (ctx: CalculatorContext) => AwardCandidate[];

export interface AwardDefinition {
  /** Stable id — used as state.historicalAwards.type's slug + settings key. */
  id: string;
  category: AwardCategory;
  scope: AwardScope;

  // Display
  name: string;
  shortName: string;
  description: string;
  trophy: TrophyDef;

  // Calculation
  calculatorId: CalculatorId;
  /** Args passed to the calculator (e.g. { metric: 'pts' }). */
  calculatorArgs?: any;
  eligibility: EligibilityKey[];
  poolId: PoolId;

  // Defaults (overridable via leagueStats.awardSettings)
  defaultActiveIn: UIMode[];
  defaultAnnounceMD: { month: number; day: number };
  minGamesDefault: number;
  fatigueFactor?: number;

  /**
   * Per-mode branding override. When the active uiMode key exists here, the
   * award is displayed with the branded name + trophy instead of the
   * generic `name` field. Same calculator runs underneath.
   */
  brandedAs?: Partial<Record<UIMode, { name: string; shortName?: string; trophy?: TrophyDef }>>;

  /**
   * Identifier persisted into `state.historicalAwards.type` for this award.
   * Defaults to the human `name`, but can be overridden when migrating from
   * legacy types (e.g. legacy 'MVP' stored as 'Most Valuable Player' in
   * player.awards). Keep stable across saves.
   */
  storedType?: string;
}

export interface AwardSettings {
  /** Per-award enable flag — overrides defaultActiveIn. */
  enabled: Record<string, boolean>;
  /** Per-award custom display name. */
  customNames?: Record<string, string>;
  /** Per-award announce date override. */
  announceDates?: Record<string, { month: number; day: number }>;
  /** Per-award min-games override. */
  minGames?: Record<string, number>;
}

/**
 * Resolved award for runtime — name/announceDate/minGames already merged
 * with commissioner overrides. AwardEngine works off these, not raw
 * AwardDefinitions.
 */
export interface ResolvedAward extends AwardDefinition {
  effectiveName: string;
  effectiveShortName: string;
  effectiveTrophy: TrophyDef;
  effectiveAnnounceDate: { month: number; day: number };
  effectiveMinGames: number;
  enabled: boolean;
}

export type GameStateView = Pick<
  GameState,
  'players' | 'teams' | 'nonNBATeams' | 'staff' | 'leagueStats' | 'historicalAwards'
>;
