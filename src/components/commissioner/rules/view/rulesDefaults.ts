/**
 * Single source of truth for commissioner-rules default values.
 *
 * Why this file exists: defaults used to be inlined as `?? value` in three places
 * inside useRulesState (initial useState, change-detection, reset useEffect) plus
 * INITIAL_LEAGUE_STATS in constants.ts. They drifted — `allStarQuarterLength` was
 * 3 in the init, 12 in the reset, 12 in the seed — and the reset effect would
 * silently override the correct init value with 12 every time leagueStats changed.
 *
 * Now: every call site reads from this table. Change a default once, it updates
 * everywhere consistently.
 */
import type { LeagueStats } from '../../../../types';

export const RULES_DEFAULTS: Partial<LeagueStats> = {
  // ── Schedule / playoffs ────────────────────────────────────────────────
  inSeasonTournament: true,
  draftEligibilityRule: 'one_and_done' as any,
  minAgeRequirement: 19,
  minGamesRequirement: 65,
  gamesPerSeason: 82,
  divisionGames: 16,
  conferenceGames: 36,

  // ── All-Star Weekend (event toggles + sizes) ───────────────────────────
  allStarGameEnabled: true,
  allStarFormat: 'usa_vs_world' as any,
  allStarTeams: 3,
  // 2026 NBA tournament uses 4×3=12 min total games, NOT 4×12 league-mirror.
  // mirror=false + quarterLength=3 is the canonical tournament shape.
  allStarMirrorLeagueRules: false,
  allStarDunkContest: true,
  allStarDunkContestPlayers: 4,
  allStarThreePointContest: true,
  allStarThreePointContestPlayers: 8,
  allStarShootingStars: false,
  allStarShootingStarsTeams: 3,
  allStarShootingStarsPlayersPerTeam: 3,
  allStarShootingStarsTotalPlayers: 12,
  allStarSkillsChallenge: false,
  allStarSkillsChallengeTeams: 4,
  allStarSkillsChallengePlayersPerTeam: 2,
  allStarSkillsChallengeTotalPlayers: 8,
  allStarHorse: false,
  allStarHorseParticipants: 8,
  allStarOneOnOneEnabled: false,
  allStarOneOnOneParticipants: 8,

  // ── Rising Stars / Celebrity ───────────────────────────────────────────
  risingStarsEnabled: true,
  risingStarsFormat: '4team_tournament' as any,
  risingStarsMirrorLeagueRules: false,
  risingStarsQuarterLength: 3,
  risingStarsEliminationEndings: true,
  celebrityGameEnabled: true,
  celebrityGameMirrorLeagueRules: false,

  // ── All-Star Game custom rules (when mirror=false) ─────────────────────
  allStarGameFormat: 'timed' as any,
  allStarQuarterLength: 3,
  allStarNumQuarters: 4,
  allStarOvertimeDuration: 5,
  allStarOvertimeTargetPoints: 7,
  allStarShootoutRounds: 3,
  allStarOvertimeType: 'standard' as any,
  allStarMaxOvertimesEnabled: false,
  allStarMaxOvertimes: 3,
  allStarOvertimeTieBreaker: 'shootout' as any,

  // ── Game rules (regular season) ────────────────────────────────────────
  gameFormat: 'timed' as any,
  gameTargetScore: 0,
  fourPointLine: false,
  threePointLineEnabled: true,
  multiballCount: 1,
  foulOutLimit: 6,
  teamFoulPenalty: 5,
  quarterLength: 12,
  numQuarters: 4,
  overtimeDuration: 5,
  overtimeTargetPoints: 0,
  shootoutRounds: 0,
  overtimeType: 'standard' as any,
  maxTimeouts: 7,
  coachChallenges: true,
  maxCoachChallenges: 2,
  challengeReimbursed: true,
  shotClockEnabled: true,
  shotClockValue: 24,
  backcourtTimerEnabled: true,
  backcourtTimerValue: 8,
  offensiveThreeSecondEnabled: true,
  offensiveThreeSecondValue: 3,
  defensiveThreeSecondEnabled: true,
  defensiveThreeSecondValue: 3,
  inboundTimerEnabled: true,
  inboundTimerValue: 5,
  backToBasketTimerEnabled: true,
  backToBasketTimerValue: 5,
  backcourtViolationEnabled: true,
  travelingEnabled: true,
  doubleDribbleEnabled: true,
  goaltendingEnabled: true,
  basketInterferenceEnabled: true,
  kickedBallEnabled: true,
  flagrantFoulPenaltyEnabled: true,
  clearPathFoulEnabled: true,
  illegalScreenEnabled: true,
  overTheBackFoulEnabled: true,
  looseBallFoulEnabled: true,
  chargingEnabled: true,
  overtimeEnabled: true,
  maxOvertimesEnabled: false,
  maxOvertimes: 0,
  overtimeTieBreaker: 'sudden_death' as any,
  maxPlayersOnCourt: 5,
  substitutionLimitEnabled: false,
  maxSubstitutions: 0,
  noDribbleRule: false,
  multiballEnabled: false,
  threePointLineDistance: 23.75,
  fourPointLineDistance: 0,
  dunkValue: 2,
  midrangeValue: 2,
  heaveRuleEnabled: false,
  halfCourtShotValue: 3,
  clutchTimeoutLimit: 2,
  handcheckingEnabled: false,
  illegalZoneDefenseEnabled: false,
  outOfBoundsEnabled: true,
  freeThrowDistance: 15,
  rimHeight: 10,
  ballWeight: 1.4,
  startOfPossessionMethod: 'jump_ball' as any,
  possessionPattern: 'nba' as any,
  courtLength: 94,
  baselineLength: 50,
  keyWidth: 16,
  cornerThrowInEnabled: false,
  techEjectionLimit: 2,
  flagrant1EjectionLimit: 2,
  flagrant2EjectionLimit: 1,
  fightingInstantEjection: true,
  useYellowRedCards: false,
  shotClockResetOffensiveRebound: 14,
};

/** Read a single rule's effective value: explicit save value if set, else canonical default. */
export function ruleValue<K extends keyof LeagueStats>(
  ls: LeagueStats | undefined,
  key: K,
): LeagueStats[K] {
  return ((ls?.[key] ?? RULES_DEFAULTS[key]) as LeagueStats[K]);
}
