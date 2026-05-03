import type { Tab, LeagueStats, GamePhase, CommissionerTab, NBAConf, NBADiv } from './types';

export const TABS: Tab[] = ['Inbox', 'Schedule', 'Social Feed', 'NBA Central', 'League Settings', 'Commissioner', 'Broadcasting'];

export const AGE_BRACKETS = {
  YOUNG_PLAYER: 22, // Age 22 and under is considered a "young player"
  VETERAN_PLAYER: 32, // Age 32 and over is considered an "old player" or "veteran"
};

export const COMMISSIONER_TABS: CommissionerTab[] = ['Approvals', 'Viewership', 'Finances'];

export const ROSTER_URL = 'https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/2025-26.NBA.Roster.json';
export const EXTRA_RETIRED_PLAYERS_URL = 'https://api.npoint.io/d94bdfeeecf4246b481d';
export const CONTRACTS_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbacontractsdata';

/** Season year offset: the sim calendar year is (leagueStats.year - SEASON_YEAR_OFFSET). */
export const SEASON_YEAR_OFFSET = 1;

export const DEFAULT_CONFS: NBAConf[] = [
  { cid: 0, name: 'Eastern Conference' },
  { cid: 1, name: 'Western Conference' },
];

export const DEFAULT_DIVS: NBADiv[] = [
  { cid: 0, did: 0, name: 'Atlantic' },
  { cid: 0, did: 1, name: 'Central' },
  { cid: 0, did: 2, name: 'Southeast' },
  { cid: 1, did: 3, name: 'Northwest' },
  { cid: 1, did: 4, name: 'Pacific' },
  { cid: 1, did: 5, name: 'Southwest' },
];

export const DEFAULT_TIEBREAKERS = [
  'head-to-head',
  'division-record',
  'conference-record',
  'point-differential',
];

export const INITIAL_LEAGUE_STATS: LeagueStats = {
  revenue: 6900, // $6.9B base (sponsorship/merch/tickets — media rights negotiated separately)
  viewership: 1.8, // 1.8M average
  salaryCap: 154647000, 
  luxuryPayroll: 171000000, // Luxury tax threshold, in thousands
  luxuryTax: 1.5, // 150% tax rate
  minContract: 950000,
  maxContract: 4500000,     
  numGamesPlayoffSeries: [7, 7, 7, 7],
  playIn: true,
  inSeasonTournament: true,
  minAgeRequirement: 19,
  rules: 
 [
  { "id": "rule-1", "title": "Standard 3-Point Line", "description": "The traditional 3-point line distance used in the modern NBA: 23'9\" at the arc and 22' in the corners." },
  { "id": "rule-2", "title": "24-Second Shot Clock", "description": "Teams have 24 seconds to attempt a field goal; resets to 14 seconds after offensive rebounds." },
  { "id": "rule-3", "title": "Defensive 3-Second Rule", "description": "A defensive player cannot stay in the paint for more than 3 seconds without actively guarding an opponent." },
  { "id": "rule-4", "title": "The Heave Rule", "description": "Missed shots from 36+ feet in the final 3 seconds of quarters 1-3 do not count against a player's FG%." },
  { "id": "rule-5", "title": "Transition Take Foul", "description": "Deliberate fouls to stop fast breaks result in one free throw and retained possession for the offense." },
  { "id": "rule-6", "title": "Flopping Penalty", "description": "Players penalized for flopping receive a non-unsportsmanlike technical foul and the opponent gets one free throw." },
  { "id": "rule-7", "title": "Coach's Challenge", "description": "Teams retain their challenge if the first one is successful, with a maximum of two challenges per game." },
  { "id": "rule-8", "title": "Clear Path Foul", "description": "Fouls against players with a clear path to the basket result in two free throws and retained possession." },
  { "id": "rule-9", "title": "Secondary Motion Contact", "description": "Incidental 'high-five' contact is legal, but secondary swipes at a shooter's arm are called as fouls." },
  { "id": "rule-10", "title": "6-Foul Disqualification", "description": "A player is disqualified from the game upon reaching their 6th personal foul." }
],
  morale: {
    fans: 75,
    players: 80,
    owners: 85,
    legacy: 50,
  },
  year: 2026,
  draftType: 'nba2019',
  draftEligibilityRule: 'one_and_done',
  allStarGameEnabled: true,
  allStarFormat: 'usa_vs_world',
  allStarTeams: 3,
  // Default OFF — 2026 NBA tournament format uses 4×3=12 min total games, not 4×12 league-mirror.
  allStarMirrorLeagueRules: false,
  allStarGameFormat: 'timed',
  allStarQuarterLength: 3,
  allStarNumQuarters: 4,
  allStarDunkContest: true,
  allStarDunkContestPlayers: 4,
  allStarThreePointContest: true,
  allStarThreePointContestPlayers: 8,
  allStarShootingStars: true,
  allStarShootingStarsMode: 'team',
  allStarShootingStarsTeams: 3,
  allStarShootingStarsPlayersPerTeam: 3,
  allStarShootingStarsTotalPlayers: 12,
  allStarSkillsChallenge: false,
  allStarSkillsChallengeMode: 'team',
  allStarSkillsChallengeTeams: 4,
  allStarSkillsChallengePlayersPerTeam: 2,
  allStarSkillsChallengeTotalPlayers: 8,
  allStarHorse: false,
  allStarHorseParticipants: 8,
  allStarOneOnOneEnabled: false,
  allStarOneOnOneParticipants: 8,
  // The Throne — opt-in premium 1v1 tournament; replaces simulateOneOnOneTournament when enabled.
  allStarThroneEnabled: false,
  allStarThroneFieldSize: 16,
  allStarThroneFormat: 'full16',
  allStarThroneFirstPossession: 'shootout',
  allStarThroneScoring: '2s_and_3s',
  allStarThroneShotClock: 7,
  allStarThroneTargetScore: 12,
  allStarThroneHardCap: 16,
  allStarThronePrizePool: 5_000_000,
  allStarThroneMandatoryDefense: true,
  risingStarsEnabled: true,
  risingStarsFormat: '4team_tournament',
  risingStarsMirrorLeagueRules: false,
  risingStarsQuarterLength: 3,
  celebrityGameEnabled: true,
  celebrityGameMirrorLeagueRules: true,
  allStarEnding: 'Normal',
  minGamesRequirement: 65,
  // Economy - Finances
  salaryCapEnabled: true,
  salaryCapType: 'soft',
  minimumPayrollEnabled: true,
  minimumPayrollPercentage: 90,
  luxuryTaxEnabled: true,
  luxuryTaxThresholdPercentage: 121.5,
  apronsEnabled: true,
  numberOfAprons: 2,
  firstApronPercentage: 126.7,
  secondApronPercentage: 134.4,
  tradeMatchingRatioUnder: 1.25,
  tradeMatchingRatioOver1st: 1.10,
  tradeMatchingRatioOver2nd: 1.00,
  restrictCashSendOver2ndApron: true,
  restrictAggregationOver2ndApron: true,
  restrictSignAndTradeAcquisitionOver1stApron: true,
  freezePickAt2ndApron: true,
  restrictTPEProvenanceOver2ndApron: true,
  postSigningMoratoriumEnabled: true,

  // Economy - Teams
  twoWayContractsEnabled: true,
  nonGuaranteedContractsEnabled: true,
  minPlayersPerTeam: 14,
  maxPlayersPerTeam: 17,
  maxStandardPlayersPerTeam: 15,
  maxTwoWayPlayersPerTeam: 3,
  maxTrainingCampRoster: 21,

  // Economy - Contracts
  minContractType: 'dynamic',
  minContractStaticAmount: 1.272870,
  maxContractType: 'service_tiered',
  maxContractStaticPercentage: 30,
  supermaxEnabled: true,
  supermaxPercentage: 35,
  birdRightsEnabled: true,
  minContractLength: 1,
  maxContractLengthStandard: 4,
  maxContractLengthBird: 5,
  playerOptionsEnabled: true,
  tenDayContractsEnabled: true,

  // Economy - Rookie Contracts
  rookieScaleType: 'dynamic',
  rookieStaticAmount: 5.0,
  rookieMaxContractPercentage: 9,
  rookieScaleAppliesTo: 'first_round',
  rookieContractLength: 2,
  rookieTeamOptionsEnabled: true,
  rookieTeamOptionYears: 2,
  rookieRestrictedFreeAgentEligibility: true,
  rookieContractCapException: true,

  // Economy - Cap Inflation
  // CBA-realistic defaults: historical avg 3.45–7%, hard-capped at 10% post-2016,
  // can stagnate near 0% in downturns. Std dev 2% gives occasional ceiling/floor hits.
  inflationEnabled: true,
  inflationMin: 0,
  inflationMax: 10,
  inflationAverage: 5.5,
  inflationStdDev: 2.0,

  // Economy - Draft Picks
  tradableDraftPickSeasons: 7,

  // Economy - Exceptions (TPE / DPE)
  tradeExceptionsEnabled: true,
  disabledPlayerExceptionEnabled: false,

  // Transaction calendar defaults (resolver-based — NBA accurate)
  tradeDeadlineMonth: 2,
  tradeDeadlineOrdinal: 1,
  tradeDeadlineDayOfWeek: 'Thu' as const,
  faStartMonth: 7,
  faStartDay: 1,
  faMoratoriumDays: 6,
  regularSeasonFAEnabled: true,
  postDeadlineMultiYearContracts: true,

  // All-Star hosts — real NBA upcoming assignments. Games start summer 2025 so the
  // 2026 ASG is still unplayed in-game even though it aired IRL; we seed both the
  // 2026 and 2027 hosts and the history view renders them as UPCOMING until sim plays
  // past All-Star Sunday of that year.
  allStarHosts: [
    { year: 2026, city: 'Inglewood, CA', arena: 'Intuit Dome',             teamIds: [] as number[] },
    { year: 2027, city: 'Phoenix, AZ',   arena: 'Mortgage Matchup Center', teamIds: [] as number[] },
  ],

  // Honors
  allNbaTeams: 3,
  allNbaPlayersPerTeam: 5,
  allDefenseTeams: 2,
  allDefensePlayersPerTeam: 5,
  allRookieTeams: 2,
  allRookiePlayersPerTeam: 5,
  positionlessAwards: false,

  awards: [
    // MAJOR POSTSEASON AWARDS
    { 
        id: 'award-post-1', 
        title: 'NBA Finals MVP', 
        description: 'The Bill Russell Trophy - Awarded to the most impactful player in the championship series.' 
    },
    { 
        id: 'award-post-2', 
        title: 'Western Conference Finals MVP', 
        description: 'The Earvin "Magic" Johnson Trophy - Awarded to the top performer in the West finals.' 
    },
    { 
        id: 'award-post-3', 
        title: 'Eastern Conference Finals MVP', 
        description: 'The Larry Bird Trophy - Awarded to the top performer in the East finals.' 
    },
    { 
        id: 'award-post-4', 
        title: 'NBA Cup MVP', 
        description: 'Awarded to the standout player of the In-Season Tournament (NBA Cup).' 
    },

    // REGULAR SEASON PERFORMANCE
    { 
        id: 'award-1', 
        title: 'Most Valuable Player (MVP)', 
        description: 'The Michael Jordan Trophy - Awarded to the league’s best regular season performer.' 
    },
    { 
        id: 'award-2', 
        title: 'Defensive Player of the Year', 
        description: 'The Hakeem Olajuwon Trophy - Awarded to the most impactful defensive presence.' 
    },
    { 
        id: 'award-3', 
        title: 'Rookie of the Year', 
        description: 'The Wilt Chamberlain Trophy - Awarded to the top performing first-year player.' 
    },
    { 
        id: 'award-4', 
        title: 'Sixth Man of the Year', 
        description: 'The John Havlicek Trophy - Awarded to the best player coming off the bench.' 
    },
    { 
        id: 'award-5', 
        title: 'Most Improved Player', 
        description: 'The George Mikan Trophy - Awarded to the player with the biggest year-over-year leap.' 
    },
    { 
        id: 'award-6', 
        title: 'Clutch Player of the Year', 
        description: 'The Jerry West Trophy - Awarded to the player who performs best in late-game situations.' 
    },

    // ALL-STAR & COACHING
    { 
        id: 'award-7', 
        title: 'All-Star Game MVP', 
        description: 'The Kobe Bryant Trophy - Awarded to the standout performer of the All-Star Game.' 
    },
    { 
        id: 'award-8', 
        title: 'Coach of the Year', 
        description: 'The Red Auerbach Trophy - Awarded to the league’s most successful head coach.' 
    },

    // CHARACTER & SOCIAL IMPACT
    { 
        id: 'award-9', 
        title: 'Social Justice Champion', 
        description: 'The Kareem Abdul-Jabbar Trophy - Recognizes players making strides in the fight for social justice.' 
    },
    { 
        id: 'award-10', 
        title: 'Sportsmanship Award', 
        description: 'The Joe Dumars Trophy - Awarded to the player who best represents ethical behavior on court.' 
    },
    { 
        id: 'award-11', 
        title: 'Teammate of the Year', 
        description: 'The Twyman-Stokes Trophy - Awarded to the "ideal teammate" based on selfless play and dedication.' 
    }
  ],
  celebrityGame: true,
  globalGames: false,
  handcheckingEnabled: false,
  illegalZoneDefenseEnabled: false,
  // New Rules
  outOfBoundsEnabled: true,
  freeThrowDistance: 15,
  rimHeight: 10,
  ballWeight: 1.4,
  startOfPossessionMethod: 'jump_ball',
  possessionPattern: 'nba',
  basketInterferenceEnabled: true,
  courtLength: 94,
  baselineLength: 50,
  keyWidth: 16,
  cornerThrowInEnabled: false,
  // Ejections & Discipline
  techEjectionLimit: 2,
  flagrant1EjectionLimit: 2,
  flagrant2EjectionLimit: 1,
  fightingInstantEjection: true,
  useYellowRedCards: false,
  // Shot Clock
  shotClockResetOffensiveRebound: 14,
  // Game Rules
  fourPointLine: false,
  threePointLineEnabled: true,
  foulOutLimit: 6,
  teamFoulPenalty: 5,
  quarterLength: 12,
  numQuarters: 4,
  overtimeDuration: 5,
  overtimeTargetPoints: 0,
  shootoutRounds: 0,
  overtimeType: 'standard',
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
  overtimeTieBreaker: 'sudden_death',
  maxPlayersOnCourt: 5,
  substitutionLimitEnabled: false,
  maxSubstitutions: 0,
  noDribbleRule: false,
  multiballEnabled: false,
  multiballCount: 1,
  threePointLineDistance: 23.75,
  fourPointLineDistance: 27,
  dunkValue: 2,
  midrangeValue: 2,
  heaveRuleEnabled: false,
  halfCourtShotValue: 3,
  gameFormat: 'timed',
  gameTargetScore: 0,
  clutchTimeoutLimit: 2,
  gamesPerSeason: 82,
  divisionGames: 16,
  conferenceGames: 36,
  numGamesDiv: null,
  numGamesConf: null,
  customScheduleEnabled: false,
  confs: DEFAULT_CONFS,
  divs: DEFAULT_DIVS,
  tiebreakers: DEFAULT_TIEBREAKERS,
  otl: false,
  trophies: [
    { id: 'trophy-1', title: 'The Larry O\'Brien Trophy', description: 'Awarded to the NBA Finals champion.' },
  ],
};

export const SEASON_DATES = [
  { phase: 'Offseason' as GamePhase, displayName: 'Offseason', start: [7, 1], end: [8, 5] },
  { phase: 'Schedule Planning' as GamePhase, displayName: 'Schedule Planning', start: [8, 6], end: [8, 13] },
  { phase: 'Schedule Release' as GamePhase, displayName: 'Schedule Release', start: [8, 14], end: [8, 14] },
  { phase: 'Training Camp' as GamePhase, displayName: 'Training Camp', start: [8, 15], end: [9, 30] },
  { phase: 'Preseason' as GamePhase, displayName: 'Preseason', start: [10, 1], end: [10, 23] },
  { phase: 'Regular Season (Part 1)' as GamePhase, displayName: 'Regular Season', start: [10, 24], end: [2, 14] },
  { phase: 'Trade Deadline' as GamePhase, displayName: 'Trade Deadline', start: [2, 15], end: [2, 15] },
  { phase: 'Regular Season (Part 2)' as GamePhase, displayName: 'Regular Season', start: [2, 16], end: [4, 15] },
  { phase: 'Playoffs' as GamePhase, displayName: 'Playoffs', start: [4, 16], end: [6, 20] },
  { phase: 'Draft Lottery' as GamePhase, displayName: 'Draft Lottery', start: [6, 21], end: [6, 21] },
  { phase: 'Draft' as GamePhase, displayName: 'Draft', start: [6, 25], end: [6, 25] },
  { phase: 'Free Agency' as GamePhase, displayName: 'Free Agency', start: [7, 1], end: [7, 31] },
];

// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL LEAGUE CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Euroleague team TID → country */
export const EUROLEAGUE_TEAM_COUNTRIES: Record<number, string> = {
  1000: 'Greece',      // AEK Athens
  1001: 'Germany',     // Alba Berlin
  1002: 'Turkey',      // Anadolu Efes Istanbul
  1003: 'France',      // AS Monaco
  1004: 'Spain',       // Baskonia Vitoria-Gasteiz
  1005: 'Serbia',      // Crvena Zvezda Belgrade
  1006: 'Russia',      // CSKA Moscow
  1007: 'Spain',       // Dreamland Gran Canaria
  1008: 'UAE',         // Dubai
  1009: 'Italy',       // EA7 Emporio Armani Milan
  1010: 'Spain',       // FC Barcelona
  1011: 'Germany',     // FC Bayern Munich
  1012: 'Turkey',      // Fenerbahce Istanbul
  1013: 'Israel',      // Hapoel Tel Aviv
  1014: 'France',      // LDLC ASVEL
  1015: 'Israel',      // Maccabi Playtika Tel Aviv
  1016: 'Greece',      // Olympiacos Piraeus
  1017: 'Greece',      // Panathinaikos Athens
  1018: 'France',      // Paris
  1019: 'Serbia',      // Partizan Belgrade
  1020: 'Spain',       // Real Madrid
  1021: 'Lithuania',   // Rytas Vilnius
  1022: 'Spain',       // Valencia Basket
  1023: 'Italy',       // Virtus Segafredo Bologna
  1024: 'Lithuania',   // Zalgiris Kaunas
  1025: 'Russia',      // Zenit St. Petersburg
};

/** Endesa (Liga ACB) — all teams are Spanish */
export const ENDESA_TEAM_COUNTRY = 'Spain';

/**
 * External league salary scale — percentage of NBA max contract.
 * Dynamic: reads from leagueStats.salaryCap at runtime, so inflation applies automatically.
 *
 * Usage: `maxSalary = nbaSalaryCap * maxContractPct * leagueScale.maxPct`
 *        `minSalary = nbaSalaryCap * leagueScale.minPct`
 *
 * Example (NBA cap $154M, max contract 30% = $46.2M):
 *   Euroleague max = $46.2M × 0.108 ≈ $5.0M
 *   PBA max        = $46.2M × 0.0043 ≈ $200K
 */
export const EXTERNAL_SALARY_SCALE: Record<string, { maxPct: number; minPct: number }> = {
  Euroleague:       { maxPct: 0.032,  minPct: 0.003 },   // ~$5M max, ~$460K min at $154M cap
  Endesa:           { maxPct: 0.019,  minPct: 0.0019 },  // ~$3M max, ~$290K min
  'B-League':       { maxPct: 0.0065, minPct: 0.00065 }, // ~$1M max, ~$100K min
  PBA:              { maxPct: 0.0013, minPct: 0.00013 }, // ~$200K max, ~$20K min
  'G-League':       { maxPct: 0.003,  minPct: 0.0003 },  // ~$460K max, ~$46K min
  'China CBA':      { maxPct: 0.019,  minPct: 0.0013 },  // ~$3M max, ~$200K min
  'NBL Australia':  { maxPct: 0.0065, minPct: 0.00065 }, // ~$1M max, ~$100K min
  // WNBA cap is structurally tied to the NBA cap as ~1.6% (real-world WNBA supermax
  // ~$250K vs NBA cap ~$154M). Players make $80K-$250K, top stars touch supermax.
  WNBA:             { maxPct: 0.0016, minPct: 0.0005 },  // ~$250K max, ~$77K min at $154M cap
};

/** Currency display for external leagues — USD stored internally, converted at display */
export const EXTERNAL_CURRENCY: Record<string, { symbol: string; code: string; rate: number }> = {
  Euroleague:      { symbol: '€',  code: 'EUR', rate: 0.92 },
  Endesa:          { symbol: '€',  code: 'EUR', rate: 0.92 },
  'B-League':      { symbol: '¥',  code: 'JPY', rate: 149.5 },
  PBA:             { symbol: '₱',  code: 'PHP', rate: 56.2 },
  'G-League':      { symbol: '$',  code: 'USD', rate: 1 },
  'China CBA':     { symbol: '¥',  code: 'CNY', rate: 7.24 },
  'NBL Australia': { symbol: 'A$', code: 'AUD', rate: 1.53 },
  WNBA:            { symbol: '$',  code: 'USD', rate: 1 },
};

/** Format salary in local currency for an external league */
export function formatExternalSalary(usd: number, league: string): string {
  const cur = EXTERNAL_CURRENCY[league];
  if (!cur || cur.rate === 1) return `$${(usd / 1_000_000).toFixed(1)}M`;
  const local = usd * cur.rate;
  if (local >= 1_000_000_000) return `${cur.symbol}${(local / 1_000_000_000).toFixed(1)}B`;
  if (local >= 1_000_000) return `${cur.symbol}${(local / 1_000_000).toFixed(1)}M`;
  if (local >= 1_000) return `${cur.symbol}${(local / 1_000).toFixed(0)}K`;
  return `${cur.symbol}${Math.round(local)}`;
}

/** Re-signing probability: chance player stays in same league at contract expiry */
export const EXTERNAL_RESIGN_PROBABILITY = 0.90; // 90% re-sign same league, 10% explore

/** Home country bias: chance player signs with a team in their home country (if available) */
export const HOME_COUNTRY_BIAS = 0.60; // 60% home country team, 40% any team in league

/** Nationality → preferred league (90% chance they go here if routed to external) */
export const NATIONALITY_LEAGUE_BIAS: Record<string, string> = {
  Japan:       'B-League',
  Philippines: 'PBA',
  Australia:   'NBL Australia',
  China:       'China CBA',
  Spain:       'Endesa',
  Greece:      'Euroleague',
  Turkey:      'Euroleague',
  Serbia:      'Euroleague',
  France:      'Euroleague',
  Germany:     'Euroleague',
  Italy:       'Euroleague',
  Lithuania:   'Euroleague',
  Israel:      'Euroleague',
  Russia:      'Euroleague',
};

// ── T1 — GENERATOR CAPS ──────────────────────────────────────────────────────

/** BBGM OVR ceiling per draft path (non-College paths cap generated prospects). */
export const PATH_OVR_CAP: Record<string, number> = {
  Europe:      68, // Euroleague
  Endesa:      65,
  NBL:         62, // NBL Australia
  'B-League':  58,
  'G-League':  55,
  // College / default = no cap (NBA-bound prospects uncapped at generation)
};

/** Bio height ceiling in inches per league (applied after nationality multiplier). */
export const LEAGUE_HEIGHT_CEILING: Record<string, number> = {
  PBA:             85, // 7'1"  (Sotto / Slaughter tier max)
  'B-League':      84, // 7'0"
  Endesa:          86, // 7'2"
  'China CBA':     87, // 7'3"
  'NBL Australia': 86, // 7'2"
  Euroleague:      87, // 7'3"  (Edey is the outlier max)
  'G-League':      86, // 7'2"
  NBA:             88, // 7'4"  (Wemby is the outlier)
  WNBA:            80, // 6'8"  (Brittney Griner / Han Xu tier max)
};

/** Draft path → league name (for height ceiling lookup in genDraftPlayers.ts). */
export const PATH_TO_LEAGUE: Record<string, string> = {
  Europe:      'Euroleague',
  Endesa:      'Endesa',
  NBL:         'NBL Australia',
  'B-League':  'B-League',
  'G-League':  'G-League',
  College:     'NBA',
};

/** Nationality → height scale factor, applied after base height, before league cap. */
export const COUNTRY_HEIGHT_MULT: Record<string, number> = {
  Philippines:   0.95,
  Japan:         0.95,
  'South Korea': 0.96,
  China:         0.98,
  Taiwan:        0.95,
  'Hong Kong':   0.95,
  Vietnam:       0.93,
  Thailand:      0.93,
  Indonesia:     0.93,
};

/** BBGM raw OVR cap for youth (age < 19) external-league players. K2 ~64. */
export const YOUTH_EXTERNAL_OVR_CAP = 37;

/** BBGM raw OVR cap for undrafted players (no round assigned). K2 ~80. */
export const UNDRAFTED_OVR_CAP = 56;

// ── T2 — NATIONALITY / CLUB AFFINITY ─────────────────────────────────────────

export type LeagueWeightEntry = { league: string; weight: number };

/**
 * Weighted multi-league routing for nationalities that spread across several leagues.
 * When present, resolveNationalityLeague() uses this instead of NATIONALITY_LEAGUE_BIAS.
 */
export const NATIONALITY_LEAGUE_WEIGHTS: Record<string, LeagueWeightEntry[]> = {
  // USA → G-League is the primary path; only ~15% reach Euroleague (Mike James tier)
  USA: [
    { league: 'G-League',   weight: 0.60 },
    { league: 'Euroleague', weight: 0.15 },
    { league: 'Endesa',     weight: 0.08 },
    { league: 'B-League',   weight: 0.07 },
    { league: 'China CBA',  weight: 0.06 },
    { league: 'PBA',        weight: 0.04 },
  ],
  Canada: [
    { league: 'G-League',   weight: 0.65 },
    { league: 'Euroleague', weight: 0.20 },
    { league: 'NBL Australia', weight: 0.10 },
    { league: 'China CBA',  weight: 0.05 },
  ],
};

/** tid → primary nationality for club-affinity weighting (Fix 10). */
export const CLUB_NATIONALITY_MAP: Record<number, string> = {
  // Euroleague
  1000: 'Greece',     // AEK Athens
  1001: 'Germany',    // Alba Berlin
  1002: 'Turkey',     // Anadolu Efes Istanbul
  1003: 'France',     // AS Monaco
  1004: 'Spain',      // Baskonia Vitoria-Gasteiz
  1005: 'Serbia',     // Crvena Zvezda Belgrade
  1006: 'Russia',     // CSKA Moscow
  1007: 'Spain',      // Dreamland Gran Canaria
  1008: 'UAE',        // Dubai
  1009: 'Italy',      // EA7 Emporio Armani Milan
  1010: 'Spain',      // FC Barcelona
  1011: 'Germany',    // FC Bayern Munich
  1012: 'Turkey',     // Fenerbahce Istanbul
  1013: 'Israel',     // Hapoel Tel Aviv
  1014: 'France',     // LDLC ASVEL
  1015: 'Israel',     // Maccabi Playtika Tel Aviv
  1016: 'Greece',     // Olympiacos Piraeus
  1017: 'Greece',     // Panathinaikos Athens
  1018: 'France',     // Paris
  1019: 'Serbia',     // Partizan Belgrade
  1020: 'Spain',      // Real Madrid
  1022: 'Montenegro', // Podgorica Buducnost
  1031: 'France',     // Limoges CSP
  1038: 'France',     // Nanterre 92
  1041: 'Lithuania',  // Vilnius Rytas
  1043: 'Slovenia',   // Ljubljana Olimpija
  1061: 'Greece',     // Thessaloniki Aris
  1070: 'Greece',     // Athens AEK
  1081: 'Greece',     // Thessaloniki PAOK
  // Endesa (all Spain)
  5000: 'Spain', 5001: 'Spain', 5002: 'Spain', 5003: 'Spain', 5004: 'Spain',
  5005: 'Spain', 5006: 'Spain', 5007: 'Spain', 5008: 'Spain', 5009: 'Spain',
  5010: 'Spain', 5011: 'Spain', 5012: 'Spain', 5013: 'Spain', 5014: 'Spain',
  5015: 'Spain', 5016: 'Spain', 5017: 'Spain', 5018: 'Spain',
  // B-League (all Japan)
  4000: 'Japan', 4001: 'Japan', 4002: 'Japan', 4003: 'Japan', 4004: 'Japan',
  4005: 'Japan', 4006: 'Japan', 4007: 'Japan', 4008: 'Japan', 4009: 'Japan',
  4010: 'Japan', 4011: 'Japan', 4012: 'Japan', 4013: 'Japan', 4014: 'Japan',
  4015: 'Japan', 4016: 'Japan', 4017: 'Japan', 4018: 'Japan', 4019: 'Japan',
  4020: 'Japan', 4021: 'Japan', 4022: 'Japan', 4023: 'Japan', 4024: 'Japan',
  4025: 'Japan', 4026: 'Japan',
  // NBL Australia (8005 = NZ Breakers)
  8000: 'Australia', 8001: 'Australia', 8002: 'Australia', 8003: 'Australia',
  8004: 'Australia', 8005: 'New Zealand', 8006: 'Australia', 8007: 'Australia',
  8008: 'Australia', 8009: 'Australia',
};

// ── T3 — PROGRESSION / TRANSITION ─────────────────────────────────────────────
// OVR ceiling per external league (BBGM raw scale, ~40–99 range).
// Used by ProgressionEngine (Fix 8) to cap adult progression and by
// externalSigningRouter (Fix 18) to reclamp OVR on NBA → external transitions.
// Mirrors externalLeagueSustainer's private LEAGUE_OVR_CAP — intentional copy
// to avoid cross-service circular imports.
export const EXTERNAL_LEAGUE_OVR_CAP: Record<string, number> = {
  Euroleague:      58,
  Endesa:          55,
  'NBL Australia': 52,
  'China CBA':     50,
  'B-League':      48,
  PBA:             46,
  'G-League':      45,
};
