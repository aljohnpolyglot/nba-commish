export interface Game {
  gid: number;
  homeTid: number;
  awayTid: number;
  homeScore: number;
  awayScore: number;
  played: boolean;
  date: string;
  isPreseason?: boolean;
  city?: string;
  country?: string;
  isAllStar?: boolean;
  isRisingStars?: boolean;
  isCelebrityGame?: boolean;
  isExhibition?: boolean;
  isDunkContest?: boolean;
  isThreePointContest?: boolean;
  isPlayoff?: boolean;
  isPlayIn?: boolean;
  playoffSeriesId?: string;
  playoffGameNumber?: number;
  broadcaster?: string;      // broadcaster ID (e.g. 'espn', 'amazon')
  broadcasterName?: string;  // display name (e.g. 'ESPN/ABC')
  tipoffTime?: string;       // e.g. '7:30 PM ET'
  isNBACup?: boolean;
  nbaCupRound?: 'group' | 'QF' | 'SF' | 'Final';
  nbaCupGroupId?: 'East-A' | 'East-B' | 'East-C' | 'West-A' | 'West-B' | 'West-C';
  excludeFromRecord?: boolean; // SF/Final — box scores kept but team W/L skipped
  // Pre-baked Dec 9-11 placeholder reserving the 82nd slot for the Cup KO window.
  // After group stage resolves, a TBD slot is materialized in-place into either
  // a real QF (advancers) or a regular-season game (non-advancers).
  isCupTBD?: boolean;
  cupTBDForTid?: number;
}

export interface NBACupGroup {
  id: 'East-A' | 'East-B' | 'East-C' | 'West-A' | 'West-B' | 'West-C';
  conference: 'East' | 'West';
  teamIds: number[];
  standings: Array<{
    tid: number;
    w: number; l: number;
    pf: number; pa: number; pd: number;
    gp: number;
  }>;
}

export interface NBACupKnockoutGame {
  round: 'QF' | 'SF' | 'Final';
  seed1: number;
  seed2: number;
  tid1: number;
  tid2: number;
  gameId?: number;
  winnerTid?: number;
  countsTowardRecord: boolean;
}

export interface NBACupState {
  year: number;
  status: 'group' | 'knockout' | 'complete';
  groups: NBACupGroup[];
  wildcards: { East: number | null; West: number | null };
  knockout: NBACupKnockoutGame[];
  championTid?: number;
  runnerUpTid?: number;
  mvpPlayerId?: string;
  allTournamentTeam?: Array<{ playerId: string; tid: number; pos: string; isMvp: boolean }>;
  prizePool?: {
    perPlayerByFinish: { winner: number; runnerUp: number; semi: number; quarter: number };
  };
}

export interface PlayoffSeries {
  id: string;
  round: 1 | 2 | 3 | 4;
  conference: 'East' | 'West' | 'Finals';
  higherSeedTid: number;
  lowerSeedTid: number;
  higherSeedWins: number;
  lowerSeedWins: number;
  gamesNeeded: number;
  winnerId?: number;
  gameIds: number[];
  status: 'pending' | 'active' | 'complete';
  higherSeed: number;
  lowerSeed: number;
}

export interface PlayInGame {
  id: string;
  conference: 'East' | 'West';
  gameType: '7v8' | '9v10' | 'loserGame';
  team1Tid: number;
  team2Tid: number;
  winnerId?: number;
  gameId?: number;
  played: boolean;
}

export interface PlayoffBracket {
  season: number;
  eastTop6: number[];
  westTop6: number[];
  playInGames: PlayInGame[];
  playInComplete: boolean;
  series: PlayoffSeries[];
  currentRound: 1 | 2 | 3 | 4;
  champion?: number;
  gamesInjected: boolean;
  round1Injected: boolean;
  bracketComplete: boolean;
}

export interface PlayerGameStats {
  playerId: string;
  name: string;
  min: number;
  pts: number;
  reb: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  fourPm?: number;
  fourPa?: number;
  ftm: number;
  fta: number;
  gs: number;
  gameScore: number;
  pm: number;
  tsPct?: number;
  efgPct?: number;
  per?: number;
  ortg?: number;
  drtg?: number;
  usgPct?: number;
  bpm?: number;
  ws?: number;
  vorp?: number;
  fgAtRim?: number;
  fgaAtRim?: number;
  fgLowPost?: number;
  fgaLowPost?: number;
  fgMidRange?: number;
  fgaMidRange?: number;
  ba?: number;
  dunks?: number;
  techs?: number;
}

export interface FightResult {
  player1Id: string;
  player1Name: string;
  player1TeamId: number;
  player2Id: string;
  player2Name: string;
  player2TeamId: number;
  severity: 'scuffle' | 'ejection' | 'brawl';
  description: string;
}

export interface GameResult {
  gameId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  homeStats: PlayerGameStats[];
  awayStats: PlayerGameStats[];
  winnerId: number;
  lead: number;
  isOT: boolean;
  otCount: number;
  playerDNPs?: Record<string, string>; // playerId → "DNP — Injury (Type)" | "DNP — Coach's Decision"
  playerInGameInjuries?: Record<string, { type: string; quarter: number }>; // playerId → injury + quarter exited for players who left mid-game
  playersPlayingHurt?: Record<string, string>; // playerId → injuryType for players who suited up already injured (played through pain)
  quarterScores?: {
    home: number[];
    away: number[];
  };
  gameWinner?: {
    playerId: string;
    playerName: string;
    teamId: number;
    shotType: 'clutch_ft' | 'clutch_2' | 'clutch_3' | 'walkoff';
    isWalkoff: boolean;
    clockRemaining: string;
  };
  date: string;
  isAllStar?: boolean;
  isRisingStars?: boolean;
  isCelebrityGame?: boolean;
  mvpName?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamAbbrev?: string;
  awayTeamAbbrev?: string;
  // W-L records at the time the game was played (pre-game snapshot)
  homeWins?: number;
  homeLosses?: number;
  awayWins?: number;
  awayLosses?: number;
  injuries?: {
    playerId: string;
    playerName: string;
    teamId: number;
    injuryType: string;
    gamesRemaining: number;
  }[];
  fight?: FightResult;
  highlights?: import('./services/simulation/types').GameHighlight[];
  season?: number;
}

export interface TransactionDto {
  teams: {
    [tid: number]: {
      playersSent: NBAPlayer[];
      picksSent: DraftPick[];
      cashSentUSD?: number;
    };
  };
}

export interface Morale {
  fans: number;
  players: number;
  owners: number;
  legacy: number;
}

export interface Rule {
  id: string;
  title: string;
  description: string;
}

export interface MediaRights {
  activeBroadcasters: string[];
  lpPrice: number;
  lpPriceMonthly?: number;
  totalRev: number;    // Billions, e.g. 14.3
  mediaRev: number;    // Billions
  lpRev: number;       // Billions
  salaryCap: number;   // Millions, e.g. 154.6
  phaseAssignments?: Record<string, string[]>;
  scheduleAssignments?: Record<string, string[]>;
  isLocked: boolean;
}

export interface LeagueStats {
  revenue: number;
  mediaRights?: MediaRights;
  viewership: number;
  viewershipHistory?: { date: string, viewers: number }[];
  revenueHistory?: { date: string; revenue: number }[];
  baseViewershipModifier?: number;
  salaryCap: number;
  luxuryPayroll: number;
  luxuryTax: number;
  minContract: number;
  maxContract: number;
  numGamesPlayoffSeries: number[];
  playIn: boolean;
  inSeasonTournament: boolean;
  cupPrizePoolEnabled?: boolean;
  cupPrizePoolAutoInflate?: boolean;
  cupPrizeWinner?: number;
  cupPrizeRunnerUp?: number;
  cupPrizeSemi?: number;
  cupPrizeQuarter?: number;
  minAgeRequirement: number;
  rules: Rule[];
  morale: Morale;
  year: number;
  draftType: string;
  allStarEnding?: string;
  allStarBreakStart?: string; // YYYY-MM-DD — first day of regular-season blackout
  allStarBreakEnd?: string;   // YYYY-MM-DD — last day of blackout (inclusive)
  minGamesRequirement?: number;
  awards?: Rule[];
  trophies?: Rule[];
  celebrityGame?: boolean;
  globalGames?: boolean;
  hasScheduledGlobalGames?: boolean;
  hasSetCelebrityRoster?: boolean;
  celebrityRosterAutoSelected?: boolean;
  celebrityRoster?: string[];
  hasExpanded?: boolean;
  hasFinalsHalftime?: boolean;
  hasAllStarHalftime?: boolean;
  hasRingCeremony?: boolean;
  hasInvitedPerformance?: boolean;
  draftEligibilityRule?: string;
  fourPointLine?: boolean;
  foulOutLimit?: number;
  teamFoulPenalty?: number;
  quarterLength?: number;
  numQuarters?: number;
  overtimeDuration?: number;
  overtimeTargetPoints?: number;
  shootoutRounds?: number;
  overtimeType?: string;
  maxTimeouts?: number;
  coachChallenges?: boolean;
  maxCoachChallenges?: number;
  challengeReimbursed?: boolean;
  // Timing Violations
  shotClockEnabled?: boolean;
  shotClockValue?: number;
  backcourtTimerEnabled?: boolean;
  backcourtTimerValue?: number;
  offensiveThreeSecondEnabled?: boolean;
  offensiveThreeSecondValue?: number;
  defensiveThreeSecondEnabled?: boolean;
  defensiveThreeSecondValue?: number;
  inboundTimerEnabled?: boolean;
  inboundTimerValue?: number;
  backToBasketTimerEnabled?: boolean;
  backToBasketTimerValue?: number;
  // Court Violations
  backcourtViolationEnabled?: boolean;
  travelingEnabled?: boolean;
  doubleDribbleEnabled?: boolean;
  goaltendingEnabled?: boolean;
  basketInterferenceEnabled?: boolean;
  kickedBallEnabled?: boolean;
  // Fouls & Limits
  flagrantFoulPenaltyEnabled?: boolean;
  clearPathFoulEnabled?: boolean;
  illegalScreenEnabled?: boolean;
  overTheBackFoulEnabled?: boolean;
  looseBallFoulEnabled?: boolean;
  chargingEnabled?: boolean;
  // Overtime
  overtimeEnabled?: boolean;
  maxOvertimesEnabled?: boolean;
  maxOvertimes?: number;
  overtimeTieBreaker?: string;
  // Personnel
  maxPlayersOnCourt?: number;
  substitutionLimitEnabled?: boolean;
  maxSubstitutions?: number;
  noDribbleRule?: boolean;
  multiballEnabled?: boolean;
  multiballCount?: number;
  // Scoring
  threePointLineEnabled?: boolean;
  threePointLineDistance?: number;
  fourPointLineDistance?: number;
  dunkValue?: number;
  midrangeValue?: number;
  heaveRuleEnabled?: boolean;
  halfCourtShotValue?: number;

  // Economy - Finances
  salaryCapEnabled?: boolean;
  salaryCapType?: 'soft' | 'hard';
  minimumPayrollEnabled?: boolean;
  minimumPayrollPercentage?: number;
  luxuryTaxEnabled?: boolean;
  luxuryTaxThresholdPercentage?: number;
  apronsEnabled?: boolean;
  numberOfAprons?: number;
  firstApronPercentage?: number;
  secondApronPercentage?: number;
  tradeMatchingRatioUnder?: number;
  tradeMatchingRatioOver1st?: number;
  tradeMatchingRatioOver2nd?: number;
  restrictCashSendOver2ndApron?: boolean;
  restrictAggregationOver2ndApron?: boolean;
  restrictSignAndTradeAcquisitionOver1stApron?: boolean;
  freezePickAt2ndApron?: boolean;
  restrictTPEProvenanceOver2ndApron?: boolean;
  /** When true, re-signed/extended players follow real-NBA trade moratorium (Dec 15 / Jan 15 / 3-month / 6-month). Distinct from sign-and-trade gating. */
  postSigningMoratoriumEnabled?: boolean;

  // Economy - Teams
  twoWayContractsEnabled?: boolean;
  nonGuaranteedContractsEnabled?: boolean;
  r2ContractsNonGuaranteed?: boolean;
  minPlayersPerTeam?: number;
  maxPlayersPerTeam?: number;
  maxStandardPlayersPerTeam?: number;
  maxTwoWayPlayersPerTeam?: number;
  maxTrainingCampRoster?: number;

  // Economy - Contracts
  minContractType?: 'static' | 'dynamic';
  minContractStaticAmount?: number;
  maxContractType?: 'static' | 'service_tiered';
  maxContractStaticPercentage?: number;
  supermaxEnabled?: boolean;
  supermaxPercentage?: number;
  supermaxMinYears?: number;
  rookieExtEnabled?: boolean;
  rookieExtPct?: number;
  rookieExtRosePct?: number;
  birdRightsEnabled?: boolean;
  minContractLength?: number;
  maxContractLengthStandard?: number;
  maxContractLengthBird?: number;
  playerOptionsEnabled?: boolean;
  tenDayContractsEnabled?: boolean;

  // Economy - Rookie Contracts
  rookieScaleType?: 'static' | 'dynamic';
  rookieStaticAmount?: number;
  rookieMaxContractPercentage?: number;
  rookieScaleAppliesTo?: 'first_round' | 'both_rounds';
  rookieContractLength?: number;
  rookieTeamOptionsEnabled?: boolean;
  rookieTeamOptionYears?: number;
  rookieRestrictedFreeAgentEligibility?: boolean;
  rookieContractCapException?: boolean;

  // Economy - Cap Inflation (applied at season rollover)
  inflationEnabled?: boolean;
  inflationMin?: number;       // % floor, e.g. 0
  inflationMax?: number;       // % ceiling, e.g. 8
  inflationAverage?: number;   // mean %, e.g. 3.5
  inflationStdDev?: number;    // std dev %, e.g. 1.5

  // Economy - Exceptions (MLE / Biannual)
  mleEnabled?: boolean;              // master toggle (default true)
  roomMleAmount?: number;            // USD fallback, default 8_781_000
  nonTaxpayerMleAmount?: number;     // USD fallback, default 14_104_000
  taxpayerMleAmount?: number;        // USD fallback, default 5_685_000
  biannualEnabled?: boolean;
  biannualAmount?: number;           // USD fallback, default 4_767_000
  // Percentages of salary cap — when set, override the dollar fallback so exceptions scale with the cap.
  roomMlePercentage?: number;        // %, default 5.68 (NBA 2024-25: $8.78M / $154.65M)
  nonTaxpayerMlePercentage?: number; // %, default 9.12
  taxpayerMlePercentage?: number;    // %, default 3.68
  biannualPercentage?: number;       // %, default 3.08
  /** Per-team MLE usage tracker; resets each season via rollover. key = teamId */
  mleUsage?: Record<number, { type: 'room' | 'non_taxpayer' | 'taxpayer'; usedUSD: number }>;

  // Economy - Dead Money / Waivers
  /** Master toggle — when off, waiving costs nothing (legacy/casual mode). */
  deadMoneyEnabled?: boolean;
  /** NG contracts auto-guarantee on this date — waiving before is free. NBA: Jan 10. */
  ngGuaranteeDeadlineMonth?: number; // 1-12, default 1
  ngGuaranteeDeadlineDay?: number;   // 1-31, default 10
  /** Allow stretch provision (2N+1 spread) at waive time. */
  stretchProvisionEnabled?: boolean;
  /** Spread denominator multiplier — NBA = 2 (so 2N+1 years). */
  stretchProvisionMultiplier?: number;
  /** Hard cap on stretched dead money carried at once, as % of salary cap. NBA: 15%. */
  stretchedDeadMoneyCapPct?: number;

  // Economy - Draft Picks
  tradableDraftPickSeasons?: number; // how many future seasons of picks can be traded, e.g. 4
  /** Stepien Rule — block trades that would leave a team with no 1st-round pick
   * in any two consecutive future drafts. NBA default: true. */
  stepienRuleEnabled?: boolean;

  // Economy - Exceptions (TPE / DPE)
  /** Master toggle for Trade Player Exceptions (TPEs). When off, unbalanced
   * over-cap trades fail the 125% rule like before. NBA default: true. */
  tradeExceptionsEnabled?: boolean;
  /** Disabled Player Exception — placeholder for future implementation. NBA default: true (off here until wired). */
  disabledPlayerExceptionEnabled?: boolean;

  // Economy - Transaction Calendar (dates resolved via dateUtils.resolveSeasonDate)
  /** Trade deadline month (1-12). NBA default: 2 (February) */
  tradeDeadlineMonth?: number;
  /** Trade deadline ordinal — which occurrence of the day within the month (1-5). NBA: first Thursday of Feb */
  tradeDeadlineOrdinal?: number;
  /** Trade deadline day-of-week: 'Sun'|'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'. NBA: 'Thu' */
  tradeDeadlineDayOfWeek?: 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';
  /** Free agency start month (1-12). NBA default: 7 (July) */
  faStartMonth?: number;
  /** Free agency start day of month (1-31). NBA default: 1 */
  faStartDay?: number;
  /** Moratorium length in days from FA start (signings locked). NBA default: 6 */
  faMoratoriumDays?: number;
  /** Allow year-round regular-season FA signings (buyouts, 10-days, open-roster). NBA default: true */
  regularSeasonFAEnabled?: boolean;
  /** Permit multi-year deals after trade deadline. NBA default: true (only playoff-eligibility rules gate) */
  postDeadlineMultiYearContracts?: boolean;

  /**
   * All-Star Weekend host assignments. Seeded with real NBA hosts; commissioner
   * can append up to 5 years into the future via AllStarTab.
   * year = season end year (i.e. 2026 = 2025-26 All-Star Game).
   */
  allStarHosts?: Array<{
    year: number;
    city: string;
    arena?: string;
    teamIds: number[]; // one or more host-team ids (NBL-style co-hosts allowed)
  }>;

  // Honors
  allNbaTeams?: number;
  allNbaPlayersPerTeam?: number;
  allDefenseTeams?: number;
  allDefensePlayersPerTeam?: number;
  allRookieTeams?: number;
  allRookiePlayersPerTeam?: number;
  positionlessAwards?: boolean;

  // Schedule
  gamesPerSeason?: number;
  divisionGames?: number;
  conferenceGames?: number;
  numGamesDiv?: number | null;  // games vs division opponents (null = no division-specific count)
  numGamesConf?: number | null; // games vs conference opponents
  customScheduleEnabled?: boolean;
  confs?: NBAConf[];
  divs?: NBADiv[];
  tiebreakers?: string[];
  otl?: boolean; // whether OTL is tracked separately in standings

  // All-Star Game
  allStarGameEnabled?: boolean;
  allStarFormat?: string;
  allStarTeams?: number;
  allStarDunkContest?: boolean;
  allStarDunkContestPlayers?: number;
  allStarThreePointContest?: boolean;
  allStarThreePointContestPlayers?: number;
  allStarShootingStars?: boolean;
  allStarShootingStarsMode?: 'individual' | 'team';
  allStarShootingStarsTeams?: number;
  allStarShootingStarsPlayersPerTeam?: number;
  allStarShootingStarsTotalPlayers?: number;
  allStarSkillsChallenge?: boolean;
  allStarSkillsChallengeMode?: 'individual' | 'team';
  allStarSkillsChallengeTeams?: number;
  allStarSkillsChallengePlayersPerTeam?: number;
  allStarSkillsChallengeTotalPlayers?: number;
  allStarHorse?: boolean;
  allStarHorseParticipants?: number;
  allStarOneOnOneEnabled?: boolean;
  allStarOneOnOneParticipants?: number;
  // The Throne — premium 1v1 tournament. Replaces simulateOneOnOneTournament when enabled.
  allStarThroneEnabled?: boolean;
  allStarThroneFieldSize?: 8 | 16;
  allStarThroneFormat?: 'mini8' | 'full16';
  allStarThroneFirstPossession?: 'shootout' | 'higher_seed_choice';
  allStarThroneScoring?: '2s_and_3s' | '1s_and_2s';
  allStarThroneShotClock?: number;
  allStarThroneTargetScore?: number;
  allStarThroneHardCap?: number;
  allStarThronePrizePool?: number;
  /** Mandatory title defense — defending king auto-seeded #1 next season. */
  allStarThroneMandatoryDefense?: boolean;
  allStarMirrorLeagueRules?: boolean;
  allStarGameFormat?: 'timed' | 'target_score';
  allStarQuarterLength?: number;
  allStarNumQuarters?: number;
  allStarOvertimeDuration?: number;
  allStarOvertimeTargetPoints?: number;
  allStarShootoutRounds?: number;
  allStarOvertimeType?: string;
  allStarMaxOvertimesEnabled?: boolean;
  allStarMaxOvertimes?: number;
  allStarOvertimeTieBreaker?: string;

  // Rising Stars
  risingStarsEnabled?: boolean;
  // 'rookies_vs_sophomores' | 'usa_vs_world' | '4team_tournament' | 'random_2team' | 'random_4team'
  risingStarsFormat?: string;
  risingStarsMirrorLeagueRules?: boolean;
  risingStarsQuarterLength?: number;
  risingStarsEliminationEndings?: boolean;

  // Celebrity Game
  celebrityGameEnabled?: boolean;
  celebrityGameMirrorLeagueRules?: boolean;

  // Game Format
  gameFormat?: 'timed' | 'target_score';
  gameTargetScore?: number;

  // Coaching
  clutchTimeoutLimit?: number;
  handcheckingEnabled?: boolean;
  illegalZoneDefenseEnabled?: boolean;
  // New Rules
  outOfBoundsEnabled?: boolean;
  freeThrowDistance?: number;
  rimHeight?: number;
  ballWeight?: number;
  startOfPossessionMethod?: 'jump_ball' | 'coin_toss' | 'rock_paper_scissors';
  possessionPattern?: 'nba' | 'alternating';
  courtLength?: number;
  baselineLength?: number;
  keyWidth?: number;
  cornerThrowInEnabled?: boolean;
  // Ejections & Discipline
  techEjectionLimit?: number;
  flagrant1EjectionLimit?: number;
  flagrant2EjectionLimit?: number;
  fightingInstantEjection?: boolean;
  useYellowRedCards?: boolean;
  // Shot Clock
  shotClockResetOffensiveRebound?: number;
}

export interface GameStats {
  publicApproval: number;
  ownerApproval: number;
  playerApproval: number;
  leagueFunds: number;
  personalWealth: number;
  legacy: number;
}

export type SocialSource = 'TwitterX' | 'Feddit';

export interface Sender {
  name: string;
  title: string;
  organization: string;
}

export interface Email {
  id: string;
  sender: string;
  senderRole: string;
  organization?: string;
  subject: string;
  body: string;
  read: boolean;
  replied: boolean;
  playerPortraitUrl?: string;
  teamLogoUrl?: string;
  date: string;
  thread?: { sender: string, text: string }[];
}

export interface HistoryEntry {
  text: string;
  date: string;
  type?: string;
  /** True when the entry was created by a commissioner action (not AI sim logic). */
  commissioner?: boolean;
  /**
   * Internal IDs of every player this entry refers to. Used by
   * PlayerBioTransactionsTab to attribute events to the right player when
   * multiple players share a name (generated draft prospects vs. BBGM
   * imports). If absent, the tab falls back to substring-on-name matching,
   * which is how the Kenny Woodard / Essengue mis-attribution happens.
   */
  playerIds?: string[];
}

export interface NewsItem {
  id: string;
  headline: string;
  content: string;
  date: string;
  /** NewsCategory string stored at generation time — used by NewsFeed for tab routing. */
  category?: string;
  image?: string;
  /** Portrait URL used as last-resort fallback after Imagn enrichment is attempted */
  playerPortraitUrl?: string;
  isNew?: boolean;
  read?: boolean;
  /** 'daily' = single-game/breaking news. 'weekly' = multi-day batch recap or period summary. */
  newsType?: 'daily' | 'weekly';
  /** Game context — stored so ArticleViewer can enrich the LLM prompt with real box score data. */
  gameId?: number;
  homeTeamId?: number;
  awayTeamId?: number;
  /** When true, article is scoped to a specific team page and hidden from the main news feed. */
  teamOnly?: boolean;
}

export interface NBAConf {
  cid: number;
  name: string;
}

export interface NBADiv {
  cid: number;
  did: number;
  name: string;
}

export interface HeadToHeadRecord {
  won: number;
  lost: number;
  tied: number;
}

export interface HeadToHead {
  season: number;
  regularSeason: Record<number, Record<number, HeadToHeadRecord>>;
}

/** Manual team-status override set by the user in GM mode.
 *  When present and `gameMode === 'gm'` and `team.id === userTeamId`,
 *  readers (trade gates, narratives, AI handlers) use this instead of the
 *  auto-computed outlook. */
export type TeamStatus =
  | 'contending'
  | 'win_now'
  | 'play_in_push'
  | 'retooling'
  | 'cap_clearing'
  | 'rebuilding'
  | 'development';

export interface RetiredJerseyRecord {
  number: string;
  text: string;
  pid?: string | number;
  playerId?: string;
  seasonRetired: number;
  teamId: number;
  reason: 'franchise_icon' | 'championship_core' | 'hof_legend' | 'loyal_star' | 'honorary';
  tier: 'automatic' | 'fast_track' | 'standard' | 'late_honor';
}

/** Trade Player Exception (TPE) — generated when a team sends out more salary
 * than it receives. Acts as a one-year "coupon" that lets an over-cap team
 * absorb a single player's contract without matching salary. */
export interface TradeException {
  id: string;
  amountUSD: number;            // size of the exception in dollars
  createdDate: string;          // ISO date — basis for expiry
  expiresDate: string;          // ISO date — createdDate + 365d
  sourcePlayerName?: string;    // outgoing player that generated this TPE
  sourceLeagueYear: number;     // league year this TPE was created (for 2nd-apron gate)
  vintage: number;              // league year this TPE was created
  source: 'plain' | 'aggregation' | 'sign-and-trade';
}

export interface NBATeam {
  id: number;
  name: string;
  abbrev: string;
  region?: string;
  conference: string;
  cid?: number;              // numeric conference ID (0=East, 1=West)
  did?: number;              // numeric division ID (0-5, matching divs array)
  wins: number;
  losses: number;
  otl?: number;              // overtime losses (tracked separately)
  tied?: number;             // tied games (rare)
  strength: number;
  clinchedPlayoffs?: 'w' | 'x' | 'y' | 'z' | 'o'; // w=play-in, x=playoffs, y=bye, z=#1, o=eliminated
  pop?: number;
  logoUrl?: string;
  colors?: string[];
  streak?: { type: 'W' | 'L'; count: number };
  manualTeamStatus?: TeamStatus;
  seasons?: Array<{
    season: number;
    won: number;
    lost: number;
    playoffRoundsWon: number;
  }>;
  retiredJerseyNumbers?: RetiredJerseyRecord[];
  tradeExceptions?: TradeException[];
  /** Dead money owed for waived guaranteed contracts. Survives until originalExpYear. */
  deadMoney?: DeadMoneyEntry[];
  /** Cash sent in trades this season (USD). NBA cap: $7.5M. Resets at rollover. */
  cashUsedInTrades?: number;
  /** Per-day training plan keyed by ISO date `YYYY-MM-DD`. Auto-generated by
   *  the training scheduler at season-schedule time and overrideable per-day
   *  from the Training Center. */
  trainingCalendar?: Record<string, {
    intensity: number;
    paradigm: 'Balanced' | 'Offensive' | 'Defensive' | 'Biometrics' | 'Recovery';
    allocations: { offense: number; defense: number; conditioning: number; recovery: number; systemFocus?: string[] };
    /** True when this entry was auto-filled by the scheduler (not user-edited). */
    auto?: boolean;
  }>;
  /** System Familiarity 0-100. Drives the star-system bonus in CoachingView. Reset to 0 on coach change. */
  systemFamiliarity?: { offense: number; defense: number };
  /** Team-defense sharpness from Defensive training days. 50 is neutral; high values suppress opponent efficiency and create more turnovers. */
  defensiveAura?: number;
}

/** A waived guaranteed contract — team still owes the money against the cap. */
export interface DeadMoneyEntry {
  playerId: string;             // for grey-row payroll display + dedup
  playerName: string;
  remainingByYear: { season: string; amountUSD: number }[]; // future cap hits
  stretched: boolean;
  waivedDate: string;           // ISO yyyy-mm-dd
  originalExpYear: number;      // for prune cutoff
}

export interface NBAGMStat {
  season: number;
  tid: number;
  gp: number;
  gs: number;
  min: number;
  fg: number;
  fga: number;
  fgp: number;
  tp: number;
  tpa: number;
  tpp: number;
  fp?: number;
  fpa?: number;
  fpp?: number;
  ft: number;
  fta: number;
  ftp: number;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  per: number;
  pm?: number;
  tsPct?: number;
  efgPct?: number;
  usgPct?: number;
  ortg?: number;
  drtg?: number;
  bpm?: number;
  obpm?: number;
  dbpm?: number;
  ws?: number;
  ows?: number;
  dws?: number;
  ws48?: number;
  vorp?: number;
  ewa?: number;
  astPct?: number;
  orbPct?: number;
  drbPct?: number;
  rebPct?: number;
  stlPct?: number;
  blkPct?: number;
  tovPct?: number;
  playoffs?: boolean;
  jerseyNumber?: string | number;
  ptsMax?: number;
  rebMax?: number;
  astMax?: number;
  blkMax?: number;
  stlMax?: number;
  fgMax?: number;
  fgaMax?: number;
  tpMax?: number;
  tpaMax?: number;
  ftMax?: number;
  ftaMax?: number;
  minMax?: number[];
}

export interface NBAPlayer {
  internalId: string;
  tid: number;
  name: string;
  overallRating: number;
  ratings: any[];
  stats?: NBAGMStat[];
  imgURL?: string;
  pos?: string;
  age?: number;
  hgt?: number;
  weight?: number;
  born?: { year: number; loc: string };
  draft?: { year: number; tid: number; round?: number; pick?: number; originalTid?: number };
  contract?: { amount: number; exp: number; rookie?: boolean; hasPlayerOption?: boolean };
  awards?: Array<{ season: number; type: string }>;
  injury: {
    type: string;
    gamesRemaining: number;
    startDate?: string;  // ISO date when the injury occurred
    origin?: string;     // e.g. "vs HOU" / "@OKC". Absent = non-game (practice/off-court).
  };
  suspension?: {
    reason: string;
    gamesRemaining: number;
  };
  status?: 'Active' | 'Prospect' | 'Free Agent' | 'Retired' | 'WNBA' | 'Draft Prospect' | 'Euroleague' | 'PBA' | 'B-League' | 'G-League' | 'Endesa' | 'China CBA' | 'NBL Australia';
  twoWayCandidate?: boolean;
  /** True when AI has assigned this player to the G-League affiliate (0 GP, 15+ team games played). Cleared on next signing/trade/return. */
  gLeagueAssigned?: boolean;
  /** True when player is on a two-way contract (doesn't count against 15-man standard roster; earns ~$625K; ineligible for playoffs unless converted). */
  twoWay?: boolean;
  /** True when player is on a non-guaranteed training camp deal. Cut before Oct 22 = free; surviving past Jan 10 auto-guarantees the contract. */
  nonGuaranteed?: boolean;
  /** True when player qualifies for a designated veteran (super-max) extension with their current team. Recomputed every rollover. */
  superMaxEligible?: boolean;
  diedYear?: number;
  hof?: boolean;
  /** Year the player retired (set at rollover by retirementChecker). */
  retiredYear?: number;
  /** Year the player was inducted into the Hall of Fame (set by hofChecker at rollover). */
  hofInductionYear?: number;
  jerseyNumber?: string;
  badges?: string[];
  nbaId?: string | null;
  moodTraits?: import('./utils/mood').MoodTrait[];
  /** Weekly OVR snapshots — recorded every Sunday by ProgressionEngine. date=YYYY-MM-DD, ovr=raw BBGM float. Keep last 56 (~1yr). */
  ovrTimeline?: { date: string; ovr: number }[];
  /** Basketball-Reference slug (e.g. "curryst01") */
  srID?: string;
  /** College/university attended */
  college?: string;
  /** BBGM transaction log: draft, trade, waive events */
  transactions?: Array<{ season: number; tid: number; type?: string; phase?: number; pickNum?: number }>;
  /** Durability rating (0-100). 100 = iron man, 0 = chronically injured. Derived from playerInjuryData.ts career count. Default 70 when no data. */
  durability?: number;
  /** Set at season rollover when the player is projected to retire at the end of this season. Guarantees retirement at next rollover. */
  farewellTour?: boolean;
  /** False when the player was signed after the March 1 playoff eligibility deadline. Cleared at rollover. Cosmetic — AI stops signing before this date automatically. */
  playoffEligible?: boolean;
  /** Family ties (from BBGM roster). Used for trading-block protection + mood bonus when a relative is on the same team. */
  relatives?: Array<{ type: 'brother' | 'father' | 'son' | string; pid: number; name: string }>;
  /** ISO YYYY-MM-DD on/after which this player can be traded. Stamped at signing/extension per real-NBA CBA rules (Dec 15 / Jan 15 / 3-month / 6-month). Undefined = no moratorium. */
  tradeEligibleDate?: string;
  /** Training Center development archetype (e.g. 'Limitless Sniper'). Default 'Balanced'. */
  devFocus?: string;
  /** Internal player id of mentor — Training Center mentorship system. */
  mentorId?: string | null;
  /** Past + current mentor assignments. Each entry's `endDate` is unset while active.
   *  Maintained by SET_PLAYER_MENTOR — pushed on assign, closed on unassign/replace. */
  mentorHistory?: Array<{ mentorId: string; startDate: string; endDate?: string }>;
  /** Anchor weight (lbs) at first strength-driven progression tick.
   *  Caps total weight gain at +15 lbs from this value (Strength→Weight loop, docs/training.md).
   *  Stored on the player so it persists per-save and never leaks across saves. */
  origWeight?: number;
  /** Per-player training-center workload setting. Persists per save. */
  trainingIntensity?: 'Rest' | 'Half' | 'Normal' | 'Double';
  /** Accumulated training fatigue 0-100. Increments with high-intensity days, decays with rest.
   *  Drives injury risk and on-court performance dampening. */
  trainingFatigue?: number;
  /** ISO date when this player most recently signed/re-signed/extended. Used by autoTrim recency guard + legacy 30-day fallback for old saves. */
  signedDate?: string;
}

export interface K2Result {
  OS: number[];
  AT: number[];
  IS: number[];
  PL: number[];
  DF: number[];
  RB: number[];
}

export interface PlayerK2 extends NBAPlayer {
  k2: K2Result;
  rating2K: number;
  bbgmOvr: number;
  currentRating: any;
}

export interface UserProfile {
  name: string;
  handle: string;
  bio?: string;
  location?: string;
  website?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  followingCount?: number;
  followersCount?: number;
}
export interface SocialPost {
  id: string;
  author: string;
  handle: string;
  content: string;
  date: string;
  likes: number;
  retweets: number;
  source: SocialSource;
  playerPortraitUrl?: string;
  teamLogoUrl?: string;
  avatarUrl?: string;
  isNew?: boolean;
  replies?: SocialPost[];
  isReply?: boolean;
  isLiked?: boolean;
  isRetweeted?: boolean;
  category?: string;
  data?: any; // Context for thread generation (game stats, player info, etc.)
  mediaUrl?: string;
  mediaBackgroundColor?: string;
  replyToId?: string;
  replyCount?: number;
  isAI?: boolean;
  verified?: boolean;
}

export interface TwitterHandler {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string;
  descriptions: string[]; // These are distractor/sample descriptions
  category: 'BreakingNews' | 'MainstreamMedia' | 'CultureAndLifestyle' | 'DebatePersonalities' | 'BroadcastingAndJournalism' | 'RegionalBeatReporting' | 'SocialAggregators' | 'ComedyAndSatire' | 'DataAndAnalytics' | 'VeteranPerspectives' | 'TacticalAnalysis' | 'SalaryCapAndBusiness' | 'HooperCulture';
  probability: number;
}

export interface SocialTemplate {
  category: 'GameResult' | 'PlayerFeat' | 'Culture' | 'WinStreak' | 'Shitpost' | 'Injury' | 'GameResult_BoxScore' | 'GameResult_Insider' | 'Trade' | 'Visit';
  templates: string[];
  handleId?: string; // Optional: if set, this template is specific to this handle
  condition?: (data: any) => boolean; // Optional: custom condition for this template
}

export interface DraftPick {
  dpid: number;
  tid: number;
  originalTid: number;
  round: number;
  season: number;
}

export interface StaffMember {
  name: string;
  team?: string;
  /** New gist format: contains team name (e.g. "Atlanta Hawks") */
  position?: string;
  jobTitle?: string;
  playerPortraitUrl?: string;
  teamLogoUrl?: string;
}

export interface StaffData {
  owners: StaffMember[];
  gms: StaffMember[];
  coaches: StaffMember[];
  leagueOffice: StaffMember[];
}

export interface HistoricalStatPoint {
  date: string;
  publicApproval: number;
  ownerApproval: number;
  playerApproval: number;
  legacy: number;
  revenue: number;
  viewership: number;
}

export interface Contact {
  id: string;
  name: string;
  title: string;
  organization: string;
  type: 'gm' | 'owner' | 'coach' | 'player' | 'league_office' | 'media' | 'corporate' | 'legend' | 'team';
  playerPortraitUrl?: string;
  teamLogoUrl?: string;
  ovr?: number;
  league?: string;
}

export interface ContactDecisionParams {
  contactId: string;
  message: string;
}

export interface ConsequenceDto {
  narrative: string;
  statChanges: {
    morale: Partial<Morale>;
    revenue: number;
    viewership: number;
    legacy: number;
  };
  forcedTrade?: {
    playerName: string;
    destinationTeam: string;
  };
  actualChanges?: {
    publicApproval: number;
    ownerApproval: number;
    playerApproval: number;
    legacy: number;
    viewership: number;
    revenue: number;
  };
}

export interface SuspensionParams {
  player: NBAPlayer;
  reason: string;
  games: number;
  isFraming: boolean;
}

export interface InjuryDefinition {
  name: string;
  frequency: number;
  games: number;
}

export interface NBAGMPlayer extends NBAPlayer {
  firstName?: string;
  lastName?: string;
  retiredYear?: number;
  draft?: { year: number; tid: number };
  transactions?: Array<{ season: number; tid: number; phase?: number }>;
}

export interface NBAGMRosterData {
  players: NBAGMPlayer[];
  teams: any[];
  draftPicks: DraftPick[];
}

export interface NonNBATeam {
  tid: number;
  cid: number;
  did: number;
  region: string;
  name: string;
  abbrev: string;
  pop: number;
  stadiumCapacity: number;
  imgURL?: string;
  colors?: string[];
  league: 'Euroleague' | 'PBA' | 'WNBA' | 'B-League' | 'G-League' | 'Endesa' | 'China CBA' | 'NBL Australia';
  nbaAffiliate?: string; // G-League sister city NBA team name
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  read: boolean;
  seen?: boolean;
  type: 'text' | 'image' | 'system';
  imageUrl?: string;
}

export interface Chat {
  id: string;
  participants: string[];
  participantDetails: {
    id: string;
    name: string;
    role: string;
    avatarUrl?: string;
  }[];
  messages: ChatMessage[];
  lastMessage?: ChatMessage;
  unreadCount: number;
  isTyping?: boolean;
}

export interface Payslip {
  id: string;
  date: string;
  payPeriod: string;
  grossPay: number;
  federalTax: number;
  stateTax: number;
  cityTax: number;
  netPay: number;
  daysPaid: number;
}

export interface AllStarVoteCount {
  playerId: string;
  nbaId?: string | null;
  playerName: string;
  teamAbbrev: string;
  teamNbaId?: string | null;
  conference: string;
  category: 'Guard' | 'Frontcourt';
  votes: number;
}

export interface AllStarPlayer {
  playerId: string;
  nbaId?: string | null;
  playerName: string;
  teamAbbrev: string;
  teamNbaId?: string | null;
  conference: string;
  isStarter: boolean;
  position: string;
  category: 'Guard' | 'Frontcourt';
  ovr?: number;
  isRookie?: boolean;
  isInjuredDNP?: boolean;
  isInjuryReplacement?: boolean;
  injuredPlayerId?: string;
  isCaptain?: boolean;
}

export interface DunkContestEntry {
  playerId: string;
  playerName: string;
  round1Score: number;
  round2Score: number | null;
  isWinner: boolean;
  dunkTypes: string[];
}

export interface ThreePointContestEntry {
  playerId: string;
  playerName: string;
  round1Score: number;
  finalScore: number | null;
  isWinner: boolean;
}

export interface AllStarState {
  season: number;
  votes: AllStarVoteCount[];
  startersAnnounced: boolean;
  reservesAnnounced: boolean;
  risingStarsAnnounced?: boolean;
  risingStarsTeams?: string[];
  celebrityAnnounced?: boolean;
  celebrityTeams?: string[];
  dunkContestAnnounced?: boolean;
  threePointAnnounced?: boolean;
  hasRiggedVoting?: boolean;
  roster: AllStarPlayer[];
  risingStarsRoster?: AllStarPlayer[];
  celebrityRoster?: string[];
  dunkContestContestants?: NBAPlayer[];
  threePointContestants?: NBAPlayer[];
  dunkContest?: {
    contestants: DunkContestEntry[];
    winnerId?: string;
    complete: boolean;
  };
  threePointContest?: {
    contestants: ThreePointContestEntry[];
    winnerId?: string;
    complete: boolean;
  };
  shootingStars?: {
    teams: Array<{ teamId: string; label: string; playerIds: string[]; playerNames: string[]; timeSec: number }>;
    winnerTeamId?: string;
    winnerLabel?: string;
    complete: boolean;
  };
  skillsChallenge?: {
    contestants: Array<{ playerId: string; playerName: string; round1Time: number; finalTime: number | null; isWinner: boolean }>;
    winnerId?: string;
    winnerName?: string;
    complete: boolean;
  };
  horseTournament?: {
    bracket: Array<{ round: number; matches: Array<{ p1Id: string; p1Name: string; p2Id: string; p2Name: string; winnerId: string }> }>;
    winnerId?: string;
    winnerName?: string;
    complete: boolean;
  };
  oneOnOneTournament?: {
    bracket: Array<{ round: number; matches: Array<{ p1Id: string; p1Name: string; p2Id: string; p2Name: string; p1Score: number; p2Score: number; winnerId: string }> }>;
    winnerId?: string;
    winnerName?: string;
    complete: boolean;
  };
  throneAnnounced?: boolean;
  /** Belt holder from the prior season — survives season rollover. Auto-included as #1 seed when set + active + healthy. */
  beltHolderInternalId?: string | null;
  /** Set when the defending king cannot defend (retired, FA, injured) — UI shows "throne vacated" callout. */
  throneVacated?: boolean;
  /** Sign-up era state. Pre-rolled on Dec 1: every "yes" player gets a sign-up date assigned in [Dec 1, Jan 15]. */
  throneSignupSchedule?: Array<{ playerId: string; date: string }>;
  /** Set true on Jan 15 when sign-ups close — UI flips from rolling counter to "sign-ups closed". */
  throneSignupComplete?: boolean;
  /** Voting era state. Daily blend of final composite by progress fraction (0..1) — feeds the live tally UI. */
  throneVoteTally?: Record<string, { fan: number; player: number; media: number; coach: number; composite: number; rank: number }>;
  /** 0..1 progress through the Jan 16–Jan 30 voting window. */
  throneVotingProgress?: number;
  throne?: {
    complete: boolean;
    fieldPlayerIds: string[];
    /** Title-defender ID (the seeded-#1 belt holder) — null when throne was vacated. */
    titleDefenderId?: string | null;
    /** Per-player vote breakdown so the voting UI can render the real composite. */
    voteBreakdown?: Record<string, { fan: number; player: number; media: number; coach: number; composite: number; rank: number }>;
    bracket: Array<{
      round: number;
      player1Id: string;
      player2Id: string;
      winnerId: string | null;
      score1: number;
      score2: number;
      pd: number;
    }>;
    cumulativePDs: Record<string, number>;
    champion: { playerId: string; playerName: string } | null;
  };
  allStarGameId?: number;
  risingStarsGameId?: number;
  risingStarsBracket?: {
    format: string;
    teams: Array<{
      tid: number;
      name: string;
      abbrev: string;
      coachName: string;
      isGLeague: boolean;
      wins: number; losses: number; pf: number; pa: number;
    }>;
    games: Array<{
      gid: number;
      homeTid: number; awayTid: number;
      round: 'sf' | 'final';
      targetScore: number;
      played: boolean; homeScore: number; awayScore: number;
    }>;
    championshipGid?: number;
    complete: boolean;
  };
  risingStarsMvp?: { name: string; team: string; pts: number };
  celebrityGameId?: number;
  celebrityGameComplete?: boolean;
  celebrityGameResult?: GameResult;
  weekendComplete: boolean;
  gamesInjected?: boolean;
  // Bracket state for multi-game All-Star formats (usa_vs_world 3/4-team).
  // Populated by AllStarWeekendOrchestrator.simulateAllStarBracket.
  bracket?: {
    format: string;
    teamCount: number;
    teams: Array<{ tid: number; name: string; abbrev: string; logoUrl?: string; wins: number; losses: number; pf: number; pa: number }>;
    games: Array<{ gid: number; homeTid: number; awayTid: number; round: 'rr' | 'sf' | 'final'; played: boolean; homeScore: number; awayScore: number; mvpName?: string; mvpTeam?: string; mvpPts?: number }>;
    championshipGid?: number;
    complete: boolean;
  };
  gameMvp?: { name: string; team: string };
}

export interface BetLeg {
  gameId?: number;
  playerId?: string;
  description: string;
  odds: number;
  condition: string;
}

export interface Bet {
  id: string;
  date: string;
  type: 'moneyline' | 'over_under' | 'spread' | 'parlay';
  status: 'pending' | 'won' | 'lost';
  wager: number;
  potentialPayout: number;
  legs: BetLeg[];
} 
export interface LazySimProgress {
  currentDate: string;
  targetDate: string;
  daysComplete: number;
  daysTotal: number;
  currentPhase: string;
  percentComplete: number;
}
export interface GameState {
  day: number;
  date: string;
  stats: GameStats;
  leagueStats: LeagueStats;
  historicalStats: HistoricalStatPoint[];
  inbox: Email[];
  chats: Chat[];
  news: NewsItem[];
  socialFeed: SocialPost[];
  history: Array<string | HistoryEntry>;
  isProcessing: boolean;
  isWatchingGame?: boolean;
  isClubbing?: boolean;
  pendingStartPayload?: any;
  lastOutcome: string | null;
  lastConsequence: ConsequenceDto | null;
  lastSimResults?: any[];
  simCurrentDate?: string;
  prevTeams?: NBATeam[];
  lastActionType?: string;
  lastActionPayload?: any;
  teams: NBATeam[];
  nonNBATeams: NonNBATeam[];
  schedule: Game[];
  players: NBAPlayer[];
  draftPicks: DraftPick[];
  staff: StaffData | null;
  isDataLoaded: boolean;
  followedHandles: string[];
  cachedProfiles?: Record<string, any>;
  userProfile?: UserProfile;
  commissionerName: string;
  saveId?: string;
  migratedJerseyNumbers?: boolean;
  pendingHypnosis?: { targetName: string; command: string }[];
  boxScores: GameResult[];
  salary: number;
  payslips: Payslip[];
  lastPayDate: string;
  hasUnreadPayslip: boolean;
  scheduledEvents?: any[];
  christmasGames?: { homeTid: number; awayTid: number }[];
 globalGames?: { 
    homeTid: number; 
    awayTid: number; 
    date: string; 
    city: string; // Add this!
    country: string; 
  }[];
historicalAwards: HistoricalAward[]; 
  endorsedPlayers: string[];
  allStar?: AllStarState;
  playoffs?: PlayoffBracket;
  nbaCup?: NBACupState;
  nbaCupHistory?: Record<number, NBACupState>;
  pendingClubDebuff?: { playerId: string; playerName: string; severity: 'heavy' | 'moderate' | 'mild'; clubName: string }[];
  headToHead?: HeadToHead;
  lazySimProgress?: LazySimProgress;
  /** Transient handoff for the "Trade Player" quick-action: TradeFinderView reads this on mount, applies it, then clears. */
  tradeFinderPreselect?: { tid: number; playerId: string };
  tradeProposals?: TradeProposal[];
  bets: Bet[];
  realEstateInventory?: OwnedRealEstateAsset[];
  commishStoreInventory?: CommishStoreItem[];
  commissionerLog?: CommissionerLogEntry[];
  pendingNarratives?: string[];
  draftLotteryResult?: any[]; // LotteryResult[] from runLottery.ts — populated after running Draft Lottery
  retirementAnnouncements?: import('./services/playerDevelopment/retirementChecker').RetireeRecord[]; // populated at rollover, consumed by Season Preview
  seasonPreviewDismissed?: boolean; // cleared at rollover so it shows again each new year
  draftComplete?: boolean; // set by DraftSimulatorView when all picks committed
  activeDraftPicks?: Record<number, any>; // in-progress manual draft slots keyed by overall pick
  activeDraftOrder?: Array<{ id: number; abbrev: string; name: string; logoUrl?: string; _originalTid: number; _originalAbbrev: string; _originalName: string; _traded: boolean; _r2?: boolean }>;
  seasonHistory?: SeasonHistoryEntry[]; // one entry per completed season, appended at bracketComplete

  // ── Game Mode ─────────────────────────────────────────────────────────────
  gameMode?: 'commissioner' | 'gm';  // default: 'commissioner'
  userTeamId?: number;                // set in GM mode — the team the user manages

  pendingFAToasts?: { playerName: string; accepted: boolean; winnerTeamName?: string; annualM: number; years: number; rejectionReason?: string }[];
  pendingElimToast?: boolean;
  pendingInjuryToasts?: { playerName: string; injuryType: string; gamesRemaining: number; pos?: string; teamName?: string }[];
  pendingFeatToasts?: { playerName: string; teamName: string; oppName: string; homeScore: number; awayScore: number; isHome: boolean; won: boolean; pts: number; reb: number; ast: number; isOwnTeam: boolean }[];
  pendingRecoveryToasts?: { playerName: string; teamName: string; pos: string }[];
  pendingAwardToasts?: { playerName: string; teamName: string; teamAbbrev: string; awardLabel: string }[];
  pendingPlayoffsToasts?: { teamName: string; body: string }[];
  pendingOptionToasts?: { playerName: string; teamName: string; pos: string; decision: 'player-in' | 'player-out' | 'team-exercised' | 'team-declined'; amountM?: number }[];
  // Single-game franchise records set during sim — merged into TeamHistoryView Records tab
  simFranchiseRecords?: Array<{
    tid: number; category: string; isPlayoff: boolean;
    NAME: string; value: number; DATE: string; OPP: string; TM: string;
    SearchCategory: string; [key: string]: any;
  }>;

  // ── FA Bidding (GM Mode) ──────────────────────────────────────────────────
  faBidding?: {
    markets: Array<{
      playerId: string;
      playerName: string;
      bids: Array<{
        id: string;
        playerId: string;
        teamId: number;
        teamName: string;
        teamLogoUrl?: string;
        salaryUSD: number;
        years: number;
        option: 'NONE' | 'PLAYER' | 'TEAM';
        isUserBid: boolean;
        submittedDay: number;
        expiresDay: number;
        status: 'active' | 'accepted' | 'rejected' | 'withdrawn' | 'outbid';
        nonGuaranteed?: boolean;
      }>;
      decidesOnDay: number;
      resolved: boolean;
      pendingMatch?: boolean;
      pendingMatchExpiresDay?: number;
      pendingMatchPriorTid?: number;
      pendingMatchOfferBidId?: string;
      matchedByPriorTeam?: boolean;
    }>;
  };
}
export interface SeasonHistoryEntry {
  year: number;
  champion: string;
  championTid: number;
  runnerUp?: string;
  runnerUpTid?: number;
  mvp?: string;
  mvpPid?: string;
  finalsMvp?: string;
  finalsMvpPid?: string;
  roty?: string;
  rotyPid?: string;
  dpoy?: string;
  dpoyPid?: string;
}

export interface AwardPlayer {
  pid: number | string;
  name: string;
  tid: number;
}

export interface AllLeagueTeam {
  title: string;
  players: AwardPlayer[];
}
export interface HistoricalAward {
  season: number;
    mvp?: AwardPlayer;
  dpoy?: AwardPlayer;
  smoy?: AwardPlayer;
  roy?: AwardPlayer;
  mip?: AwardPlayer;
  finalsMvp?: AwardPlayer;
  sfmvp?: AwardPlayer[];
  allLeague?: AllLeagueTeam[];
  allDefensive?: AllLeagueTeam[];
  allRookie?: AwardPlayer[];
  type: string;   // 'MVP' | 'DPOY' | 'ROY' | 'SMOY' | 'MIP' | 'Finals MVP' | 'Semifinals MVP' | 'Champion' | 'Runner Up' | 'COY' | 'All-NBA First Team'
  name: string;   // player or team name
  pid?: string;   // player internalId (optional — not set for team awards)
  tid?: number;   // team id
}

export interface CommissionerLogEntry {
  id: string;
  type: 'HEAL_PLAYER' | 'SABOTAGE_PLAYER';
  date: string;
  subject: string;
  subjectId: string;
  coverStory: string;
  internalNote: string;
}

export interface CommishStoreItem {
  product: {
    title: string;
    price: string;
    image: string;
    isStatic?: boolean;
    link?: string;
    category?: string;
  };
  quantity: number;
  date: string;
}

export interface OwnedRealEstateAsset {
  id: string;
  title: string;
  price: number;
  location: string;
  state?: string;
  city?: string;
  image: string;
  description?: string;
  category: string;
  details?: { beds?: string; baths?: string; office?: string };
  purchasedAt: string;
  instanceId: string;
}

export type ActionType = 'SET_TRAINING_DAILY_PLAN' | 'SET_PLAYER_DEV_FOCUS' | 'SET_PLAYER_MENTOR' | 'RESET_PLAYER_FAMILIARITY' | 'SET_PLAYER_TRAINING_INTENSITY' | 'AUTOFILL_TEAM_TRAINING_CALENDAR' | 'REPLY_EMAIL' | 'BRIBE' | 'HYPNOTIZE' | 'PUBLIC_STATEMENT' | 'ADVANCE_DAY' | 'DIRECT_MESSAGE' | 'SEND_MESSAGE' | 'SEND_CHAT_MESSAGE' | 'UPDATE_RULES' | 'SUSPEND_PLAYER' | 'CLEAR_OUTCOME' | 'SAVE_SOCIAL_THREAD' | 'FINE_PERSON' | 'BRIBE_PERSON' | 'GLOBAL_GAMES' | 'LEAK_SCANDAL' | 'HYPNOTIC_BROADCAST' | 'RIG_LOTTERY' | 'CELEBRITY_ROSTER' | 'OWNER_DINNER' | 'PUBLIC_ANNOUNCEMENT' | 'SUSPEND_PERSON' | 'DRUG_TEST_PERSON' | 'INVITE_DINNER' | 'EXPANSION_DRAFT' | 'ANNOUNCE_CHANGE' | 'START_GAME' | 'LOAD_GAME' | 'UPDATE_SAVE_ID' | 'SIGN_FREE_AGENT' | 'EXECUTIVE_TRADE' | 'TRAVEL' | 'GIVE_MONEY' | 'VISIT_NON_NBA_TEAM' | 'INVITE_PERFORMANCE' | 'FORCE_TRADE' | 'ADJUST_FINANCIALS' | 'FOLLOW_USER' | 'UNFOLLOW_USER' | 'ADD_PENDING_HYPNOSIS' | 'MARK_PAYSLIPS_READ' | 'TRANSFER_FUNDS' | 'SET_CHRISTMAS_GAMES' | 'SABOTAGE_PLAYER' | 'GO_TO_CLUB' | 'ENDORSE_HOF' | 'SIMULATE_TO_DATE' | 'ADD_PRESEASON_INTERNATIONAL' | 'ALL_STAR_ADVANCE_VOTES' | 'ALL_STAR_ANNOUNCE_STARTERS' | 'ALL_STAR_ANNOUNCE_RESERVES' | 'ALL_STAR_SIMULATE_WEEKEND' | 'GENERATE_PLAYOFF_BRACKET' | 'SIM_PLAYOFF_ROUND' | 'SAVE_CONTEST_RESULT' | 'SAVE_THRONE_RESULT' | 'RECORD_WATCHED_GAME' | 'WAIVE_PLAYER' | 'FIRE_PERSONNEL' | 'STORE_PURCHASE' | 'RIG_ALL_STAR_VOTING' | 'SET_ALL_STAR_REPLACEMENT' | 'SET_DUNK_CONTESTANTS' | 'SET_THREE_POINT_CONTESTANTS' | 'ADD_ALL_STAR_REPLACEMENT' | 'REAL_ESTATE_INVENTORY_UPDATE' | 'COMMISH_STORE_INVENTORY_UPDATE' | 'CACHE_PROFILE' | 'UPDATE_USER_PROFILE' | 'ADD_USER_POST' | 'ADD_REPLIES' | 'SET_FEED' | 'UPDATE_STATE' | 'SUBMIT_FA_BID' | 'RETIRE_JERSEY_NUMBER' | 'MATCH_RFA_OFFER' | 'DECLINE_RFA_OFFER' | 'TOGGLE_LIKE' | 'TOGGLE_RETWEET' | 'ADD_POST' | 'ADD_REPLY' | 'EXERCISE_TEAM_OPTION' | 'DECLINE_TEAM_OPTION' | 'CONVERT_CONTRACT_TYPE';

export interface UserAction {
  type: ActionType;
  payload?: any;
}

export type Conference = 'East' | 'West';
export type GamePhase = 'Preseason' | 'Opening Week' | 'Regular Season (Early)' | 'Regular Season (Mid)' | 'All-Star Break' | 'Trade Deadline' | 'Regular Season (Late)' | 'Play-In Tournament' | 'Playoffs (Round 1)' | 'Playoffs (Round 2)' | 'Conference Finals' | 'NBA Finals' | 'Offseason' | 'Draft' | 'Draft Lottery' | 'Free Agency' | 'Schedule Planning' | 'Schedule Release' | 'Training Camp';
export type Tab = 'Inbox' | 'Messages' | 'Social Feed' | 'NBA Central' | 'Schedule' | 'Commissioner' | 'League News' | 'Player Stats' | 'Award Races' | 'Actions' | 'League Settings' | 'Personal' | 'Player Search' | 'Free Agents' | 'Team Stats' | 'All-Star' | 'NBA Cup' | 'Playoffs' | 'League Office' | 'League Leaders' | 'Injuries' | 'Broadcasting' | 'Approvals' | 'Viewership' | 'Finances' | 'League Finances' | 'Team Finances' | 'Draft Scouting' | 'Draft Lottery' | 'Standings' | 'Statistical Feats' | 'Transactions' | 'Trade Machine' | 'Trade Finder' | 'Trade Proposals' | 'Commish Store' | 'Events' | 'Seasonal' | 'Real Stern' | 'Sports Book' | 'Player Ratings' | 'Player Creator' | 'League History' | 'Player Bios' | 'Player Comparison' | 'Team History' | 'Season Preview' | 'Power Rankings' | 'Draft Board' | 'Draft History' | 'Team Office' | 'Training Center' | 'Hall of Fame';

// ─── AI Trade / Free Agency ───────────────────────────────────────────────────
export interface TradeProposal {
  id: string;
  proposingTeamId: number;
  receivingTeamId: number;
  proposingGMName: string;
  playersOffered: string[];   // internalIds
  playersRequested: string[]; // internalIds
  picksOffered: number[];     // dpids
  picksRequested: number[];   // dpids
  /** Cash going from proposingTeam to receivingTeam (USD). */
  cashOfferedUSD?: number;
  /** Cash going from receivingTeam to proposingTeam (USD). */
  cashRequestedUSD?: number;
  proposedDate: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'executed';
  isAIvsAI: boolean;
  tradeText?: string;
  isSignAndTrade?: boolean;
}
export type CommissionerTab = 'Approvals' | 'Viewership' | 'Finances';
// ─── Imagn Photo Types ────────────────────────────────────────────────────────
export type { ImagnPhoto } from './services/ImagnPhotoService';
