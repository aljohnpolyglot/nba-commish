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
  playerInGameInjuries?: Record<string, string>; // playerId → injuryName for players who left mid-game
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
}

export interface TransactionDto {
  teams: {
    [tid: number]: {
      playersSent: NBAPlayer[];
      picksSent: DraftPick[];
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
  minAgeRequirement: number;
  rules: Rule[];
  morale: Morale;
  year: number;
  draftType: string;
  allStarEnding?: string;
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

  // Economy - Teams
  twoWayContractsEnabled?: boolean;
  minPlayersPerTeam?: number;
  maxPlayersPerTeam?: number;
  maxStandardPlayersPerTeam?: number;
  maxTwoWayPlayersPerTeam?: number;

  // Economy - Contracts
  minContractType?: 'static' | 'dynamic';
  minContractStaticAmount?: number;
  maxContractType?: 'static' | 'service_tiered';
  maxContractStaticPercentage?: number;
  supermaxEnabled?: boolean;
  supermaxPercentage?: number;
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

  // Economy - Draft Picks
  tradableDraftPickSeasons?: number; // how many future seasons of picks can be traded, e.g. 4

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
  risingStarsFormat?: string;
  risingStarsMirrorLeagueRules?: boolean;

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
  seasons?: Array<{
    season: number;
    won: number;
    lost: number;
    playoffRoundsWon: number;
  }>;
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
  contract?: { amount: number; exp: number; rookie?: boolean };
  awards?: Array<{ season: number; type: string }>;
  injury: {
    type: string;
    gamesRemaining: number;
  };
  suspension?: {
    reason: string;
    gamesRemaining: number;
  };
  status?: 'Active' | 'Prospect' | 'Free Agent' | 'Retired' | 'WNBA' | 'Draft Prospect' | 'Euroleague' | 'PBA' | 'B-League' | 'G-League' | 'Endesa';
  twoWayCandidate?: boolean;
  diedYear?: number;
  hof?: boolean;
  jerseyNumber?: string;
  badges?: string[];
  nbaId?: string | null;
  moodTraits?: import('./utils/mood').MoodTrait[];
  /** Weekly OVR snapshots — recorded every Sunday by ProgressionEngine. date=YYYY-MM-DD, ovr=raw BBGM float. Keep last 56 (~1yr). */
  ovrTimeline?: { date: string; ovr: number }[];
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
  league: 'Euroleague' | 'PBA' | 'WNBA' | 'B-League' | 'G-League' | 'Endesa';
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
  allStarGameId?: number;
  risingStarsGameId?: number;
  celebrityGameId?: number;
  celebrityGameComplete?: boolean;
  celebrityGameResult?: GameResult;
  weekendComplete: boolean;
  gamesInjected?: boolean;
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
  tickerSimResults?: any[];
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
  pendingClubDebuff?: { playerId: string; playerName: string; severity: 'heavy' | 'moderate' | 'mild'; clubName: string }[];
  headToHead?: HeadToHead;
  lazySimProgress?: LazySimProgress;
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
  seasonHistory?: SeasonHistoryEntry[]; // one entry per completed season, appended at bracketComplete

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
  type: string;   // 'MVP' | 'DPOY' | 'ROY' | 'SMOY' | 'MIP' | 'Finals MVP' | 'Champion' | 'Runner Up' | 'COY' | 'All-NBA First Team'
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

export type ActionType = 'REPLY_EMAIL' | 'BRIBE' | 'HYPNOTIZE' | 'PUBLIC_STATEMENT' | 'ADVANCE_DAY' | 'DIRECT_MESSAGE' | 'SEND_MESSAGE' | 'SEND_CHAT_MESSAGE' | 'UPDATE_RULES' | 'SUSPEND_PLAYER' | 'CLEAR_OUTCOME' | 'SAVE_SOCIAL_THREAD' | 'FINE_PERSON' | 'BRIBE_PERSON' | 'GLOBAL_GAMES' | 'LEAK_SCANDAL' | 'HYPNOTIC_BROADCAST' | 'RIG_LOTTERY' | 'CELEBRITY_ROSTER' | 'OWNER_DINNER' | 'PUBLIC_ANNOUNCEMENT' | 'SUSPEND_PERSON' | 'DRUG_TEST_PERSON' | 'INVITE_DINNER' | 'EXPANSION_DRAFT' | 'ANNOUNCE_CHANGE' | 'START_GAME' | 'LOAD_GAME' | 'UPDATE_SAVE_ID' | 'SIGN_FREE_AGENT' | 'EXECUTIVE_TRADE' | 'TRAVEL' | 'GIVE_MONEY' | 'VISIT_NON_NBA_TEAM' | 'INVITE_PERFORMANCE' | 'FORCE_TRADE' | 'ADJUST_FINANCIALS' | 'FOLLOW_USER' | 'UNFOLLOW_USER' | 'ADD_PENDING_HYPNOSIS' | 'MARK_PAYSLIPS_READ' | 'TRANSFER_FUNDS' | 'SET_CHRISTMAS_GAMES' | 'SABOTAGE_PLAYER' | 'GO_TO_CLUB' | 'ENDORSE_HOF' | 'SIMULATE_TO_DATE' | 'ADD_PRESEASON_INTERNATIONAL' | 'ALL_STAR_ADVANCE_VOTES' | 'ALL_STAR_ANNOUNCE_STARTERS' | 'ALL_STAR_ANNOUNCE_RESERVES' | 'ALL_STAR_SIMULATE_WEEKEND' | 'GENERATE_PLAYOFF_BRACKET' | 'SIM_PLAYOFF_ROUND' | 'SAVE_CONTEST_RESULT' | 'RECORD_WATCHED_GAME' | 'WAIVE_PLAYER' | 'FIRE_PERSONNEL' | 'STORE_PURCHASE' | 'RIG_ALL_STAR_VOTING' | 'SET_ALL_STAR_REPLACEMENT' | 'SET_DUNK_CONTESTANTS' | 'SET_THREE_POINT_CONTESTANTS' | 'ADD_ALL_STAR_REPLACEMENT' | 'REAL_ESTATE_INVENTORY_UPDATE' | 'COMMISH_STORE_INVENTORY_UPDATE' | 'CACHE_PROFILE' | 'UPDATE_USER_PROFILE' | 'ADD_USER_POST' | 'ADD_REPLIES' | 'SET_FEED'| 'UPDATE_STATE';

export interface UserAction {
  type: ActionType;
  payload?: any;
}

export type Conference = 'East' | 'West';
export type GamePhase = 'Preseason' | 'Opening Week' | 'Regular Season (Early)' | 'Regular Season (Mid)' | 'All-Star Break' | 'Trade Deadline' | 'Regular Season (Late)' | 'Play-In Tournament' | 'Playoffs (Round 1)' | 'Playoffs (Round 2)' | 'Conference Finals' | 'NBA Finals' | 'Offseason' | 'Draft' | 'Draft Lottery' | 'Free Agency' | 'Schedule Planning' | 'Schedule Release' | 'Training Camp';
export type Tab = 'Inbox' | 'Messages' | 'Social Feed' | 'NBA Central' | 'Schedule' | 'Commissioner' | 'League News' | 'Player Stats' | 'Award Races' | 'Actions' | 'League Settings' | 'Personal' | 'Player Search' | 'Free Agents' | 'Team Stats' | 'All-Star' | 'Playoffs' | 'League Office' | 'League Leaders' | 'Injuries' | 'Broadcasting' | 'Approvals' | 'Viewership' | 'Finances' | 'League Finances' | 'Team Finances' | 'Draft Scouting' | 'Draft Lottery' | 'Standings' | 'Statistical Feats' | 'Transactions' | 'Trade Machine' | 'Trade Proposals' | 'Commish Store' | 'Events' | 'Seasonal' | 'Real Stern' | 'Sports Book' | 'Player Ratings' | 'League History' | 'Player Bios' | 'Team History' | 'Season Preview';

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
  proposedDate: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  isAIvsAI: boolean;
  tradeText?: string;
}
export type CommissionerTab = 'Approvals' | 'Viewership' | 'Finances';
// ─── Imagn Photo Types ────────────────────────────────────────────────────────
export type { ImagnPhoto } from './services/ImagnPhotoService';
