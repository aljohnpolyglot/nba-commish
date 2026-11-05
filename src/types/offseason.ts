import type { Conference } from './common';
import type { GameResult } from './game';
import type { NBAPlayer } from './player';
import type { GovernorsBoardLogoChange } from './commissionerTasks';

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
  risingStarsTeam?: 'Captain 1' | 'Captain 2' | 'USA' | 'World';
  imgURL?: string;
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

export interface CelebrityTeamExtraField {
  label: string;
  value: string;
}

export interface CelebrityTeamDetails {
  name: string;
  roster: string[];
  headCoach?: string;
  assistantCoaches?: string[];
  generalManager?: string;
  captains?: string[];
  extra?: CelebrityTeamExtraField[];
}

export interface CelebrityGameDetails {
  location?: string;
  halftimePerformance?: string;
}

export interface CelebrityRosterProfile {
  name: string;
  type: string;
  imgUrl?: string;
  wikipediaUrl?: string;
  sourceDecade?: string;
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
  diq: number;
  oiq: number;
  drb: number;
  pss: number;
  reb: number;
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
  shootingStarsAnnounced?: boolean;
  skillsChallengeAnnounced?: boolean;
  horseAnnounced?: boolean;
  hasRiggedVoting?: boolean;
  roster: AllStarPlayer[];
  risingStarsRoster?: AllStarPlayer[];
  celebrityRoster?: string[];
  celebrityRosterProfiles?: CelebrityRosterProfile[];
  celebrityTeamDetails?: CelebrityTeamDetails[];
  celebrityGameDetails?: CelebrityGameDetails;
  dunkContestContestants?: NBAPlayer[];
  threePointContestants?: NBAPlayer[];
  shootingStarsContestants?: NBAPlayer[];
  skillsChallengeContestants?: NBAPlayer[];
  horseContestants?: NBAPlayer[];
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
  danceContest?: import('../services/pba/danceContest').DanceContestResult;
  shootingStars?: {
    teams: Array<{ teamId: string; label: string; playerIds: string[]; playerNames: string[]; timeSec: number }>;
    winnerTeamId?: string;
    winnerLabel?: string;
    log?: string[];
    runs?: Array<{
      teamId: string;
      label: string;
      round: 1 | 2;
      timeSec: number;
      stations: Array<{
        shotIndex: number;
        shotType: string;
        shotLabel: string;
        shooterId: string;
        shooterName: string;
        moveTimeSec: number;
        timeSec: number;
        attempts: Array<{ attempt: number; shooterId: string; shooterName: string; made: boolean; durationSec: number }>;
      }>;
    }>;
    complete: boolean;
  };
  skillsChallenge?: {
    contestants: Array<{ playerId: string; playerName: string; round1Time: number; finalTime: number | null; isWinner: boolean }>;
    winnerId?: string;
    winnerName?: string;
    log?: string[];
    runs?: Array<{
      playerId: string;
      playerName: string;
      round: 1 | 2;
      timeSec: number;
      stations: Array<{
        stationIndex: number;
        stationType: string;
        stationLabel: string;
        moveTimeSec: number;
        actionTimeSec: number;
        timeSec: number;
        attempts: Array<{ attempt: number; made: boolean; durationSec: number }>;
      }>;
    }>;
    complete: boolean;
  };
  horseTournament?: {
    contestants?: Array<{ playerId: string; playerName: string; letters: number; made: number; missed: number; isWinner: boolean; eliminated: boolean }>;
    attempts?: Array<{ playerId: string; playerName: string; shotId: string; shotLabel: string; isSetting: boolean; made: boolean; lettersAfter: number; eliminated: boolean }>;
    log?: string[];
    bracket?: Array<{ round: number; matches: Array<{ p1Id: string; p1Name: string; p2Id: string; p2Name: string; winnerId: string }> }>;
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
  beltHolderInternalId?: string | null;
  throneVacated?: boolean;
  throneSignupSchedule?: Array<{ playerId: string; date: string }>;
  throneSignupComplete?: boolean;
  throneVoteTally?: Record<string, { fan: number; player: number; media: number; coach: number; composite: number; rank: number }>;
  throneVotingProgress?: number;
  throne?: {
    complete: boolean;
    fieldPlayerIds: string[];
    titleDefenderId?: string | null;
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
      wins: number;
      losses: number;
      pf: number;
      pa: number;
    }>;
    games: Array<{
      gid: number;
      homeTid: number;
      awayTid: number;
      round: 'sf' | 'final';
      targetScore: number;
      played: boolean;
      homeScore: number;
      awayScore: number;
      winnerId?: number;
      tiebreaker?: GameResult['tiebreaker'];
      mvpId?: string;
      mvpName?: string;
      mvpTeam?: string;
      mvpPts?: number;
    }>;
    championshipGid?: number;
    complete: boolean;
  };
  risingStarsMvp?: { playerId?: string; name: string; team: string; pts: number };
  celebrityGameId?: number;
  celebrityGameComplete?: boolean;
  celebrityGameResult?: GameResult;
  weekendComplete: boolean;
  gamesInjected?: boolean;
  bracket?: {
    format: string;
    teamCount: number;
    teams: Array<{ tid: number; name: string; abbrev: string; logoUrl?: string; wins: number; losses: number; pf: number; pa: number }>;
    games: Array<{
      gid: number;
      homeTid: number;
      awayTid: number;
      round: 'rr' | 'sf' | 'final';
      played: boolean;
      homeScore: number;
      awayScore: number;
      winnerId?: number;
      tiebreaker?: GameResult['tiebreaker'];
      mvpId?: string;
      mvpName?: string;
      mvpTeam?: string;
      mvpPts?: number;
    }>;
    championshipGid?: number;
    complete: boolean;
  };
  gameMvp?: { playerId?: string; name: string; team: string };
}

export type TransferBidType = 'transfer' | 'buyout' | 'loan' | 'release-clause';
export type TransferBidStatus = 'active' | 'highest' | 'outbid' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
export type TransferListingStatus = 'active' | 'sold' | 'cancelled' | 'expired';

export interface TransferListing {
  id: string;
  playerId: string;
  sellerTid: number;
  askingEUR: number;
  privateInquiry?: boolean;
  bidsCount: number;
  highestBidEUR?: number;
  topBidderTid?: number;
  totalDays: number;
  daysLeft: number;
  createdDate: string;
  status: TransferListingStatus;
}

export interface TransferBid {
  id: string;
  listingId?: string;
  playerId: string;
  bidderTid: number;
  sellerTid: number;
  bidType: TransferBidType;
  amountEUR: number;
  signingBonusEUR?: number;
  sponsorSigningPerk?: import('./tycoon').SponsorSigningPerkGrant;
  userInitiated?: boolean;
  pctVsAsking?: number;
  expiresDate: string;
  receivedDate: string;
  status: TransferBidStatus;
}

export type LoanReason = 'development' | 'playing-time' | 'injury-cover' | 'salary-relief';
export type LoanOfferStatus = 'active' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';

export interface LoanOffer {
  id: string;
  playerId: string;
  parentTid: number;
  borrowerTid: number;
  feeEUR: number;
  wageSharePercent: number;
  reason: LoanReason;
  submittedDate: string;
  decisionDate: string;
  duration?: 'three-months' | 'six-months' | 'season';
  endDate: string;
  status: LoanOfferStatus;
  userInitiated?: boolean;
  requiresParentDecision?: boolean;
  parentAccepted?: boolean;
  responseReason?: string;
}

export interface LoanAgreement {
  id: string;
  offerId: string;
  playerId: string;
  parentTid: number;
  borrowerTid: number;
  feeEUR: number;
  wageSharePercent: number;
  reason: LoanReason;
  startDate: string;
  duration?: 'three-months' | 'six-months' | 'season';
  endDate: string;
  status: 'active' | 'returned';
  returnedDate?: string;
}

export interface ExpansionTeamSpec {
  region: string;
  name: string;
  abbrev: string;
  pop: number;
  stadiumCapacity?: number;
  colors: [string, string, string];
  imgURL?: string;
  imgURLSmall?: string;
  jersey?: string;
  conference: Conference;
  cid: 0 | 1;
  did: number;
  lat?: number;
  lng?: number;
  reclaimsHistoryFromTid?: number;
}

export type OffseasonChecklistRow =
  | 'governorsBoardMeeting'
  | 'draftLottery'
  | 'draftOrderReview'
  | 'seasonSummary'
  | 'performanceReview'
  | 'strategyReview'
  | 'retiredPlayersReview'
  | 'memorialDecisions'
  | 'expansionDraft'
  | 'options'
  | 'qualifyingOffers'
  | 'myFAs'
  | 'endesaNbaDraft'
  | 'draft'
  | 'rookieContracts'
  | 'freeAgency'
  | 'transferMarket'
  | 'sponsorRenewals'
  | 'facilityUpgrades'
  | 'budgetLock'
  | 'endesaBroadcastMeeting'
  | 'euroScheduleDraw'
  | 'preseasonFriendlies'
  | 'hofCeremony'
  | 'summerLeague'
  | 'internationalTournament'
  | 'trainingCamp'
  | 'coachingSignings'
  | 'staffRetirements'
  | 'staffSignings'
  | 'youthPromotion'
  | 'pbaDraft'
  | 'pbaLocalFreeAgency'
  | 'pbaImportSearch'
  | 'pbaImportDecision'
  | 'pbaMuseSelection'
  | 'pbaOpeningCeremony'
  | 'pbaAllStarWeekend'
  | 'pbaConferenceAwards';

export type OffseasonRowStatus = 'pending' | 'in-progress' | 'done' | 'skipped';

export type OffseasonChecklist = Record<OffseasonChecklistRow, OffseasonRowStatus>;

export interface GovernorsBoardRuleChange {
  key: string;
  label: string;
  previous: string | number | boolean | null;
  next: string | number | boolean | null;
}

export interface GovernorsBoardTeamChange {
  teamId: number;
  previousRegion?: string;
  nextRegion?: string;
  previousName?: string;
  nextName?: string;
  previousAbbrev?: string;
  nextAbbrev?: string;
  previousLogoUrl?: string;
  nextLogoUrl?: string;
  previousColors?: string[];
  nextColors?: string[];
}

export interface GovernorsBoardVenueChange {
  teamId: number;
  kind: 'stadium' | 'naming';
  previous: {
    name: string;
    location: string;
    capacity?: number | null;
    opened?: number | null;
  };
  next: {
    name: string;
    location: string;
    capacity?: number | null;
    opened?: number | null;
  };
}

export interface GovernorsBoardMajorUpdate {
  key: string;
  title: string;
  summary: string;
  previous?: string | number | boolean | null;
  next?: string | number | boolean | null;
}

export interface GovernorsBoardAwardChange {
  awardId: string;
  name: string;
  previousName?: string;
  effectiveSeason: number;
  introducedSeason?: number;
  previousActive: boolean;
  active: boolean;
  source: 'era' | 'commissioner';
}

export interface EuroLeagueAssemblyClub {
  teamId: number;
  name: string;
  abbrev?: string;
  logoUrl?: string;
}

export interface EuroLeagueAssemblyCompetition {
  competitionId: string;
  competitionName: string;
  participants: EuroLeagueAssemblyClub[];
  entering: EuroLeagueAssemblyClub[];
  leaving: EuroLeagueAssemblyClub[];
}

export type ContinentalCompetitionId = 'euroleague' | 'eurocup';
export type ContinentalAgreementType = 'oneYearWildcard' | 'multiYearWildcard' | 'fixedTermLicense' | 'longTermLicense';
export type ContinentalAgreementStatus = 'active' | 'expiring' | 'expired' | 'suspended' | 'terminated';

export interface ContinentalAgreement {
  competitionId: ContinentalCompetitionId;
  clubId: number;
  agreementType: ContinentalAgreementType;
  startSeason: number;
  endSeason?: number;
  status: ContinentalAgreementStatus;
  source: 'historical-license' | 'historical-wildcard' | 'save-review';
  origin?: 'eurocupChampion' | 'incumbentRenewal' | 'selection';
}

export interface EuroLicensingReviewClub extends EuroLeagueAssemblyClub {
  agreementType: ContinentalAgreementType;
  agreementStatus: ContinentalAgreementStatus;
  agreementLabel: string;
  yearsRemaining?: number;
  expirationSeason?: number;
}

export interface EuroLicensingReviewCandidate extends EuroLeagueAssemblyClub {
  performance: number;
  continentalStanding: number;
  clubStanding: number;
  continuity: number;
  totalScore: number;
  selected: boolean;
  incumbent: boolean;
}

export interface EuroDomesticTransitionReview {
  competitionId: string;
  competitionName: string;
  previousParticipants: EuroLeagueAssemblyClub[];
  relegated: EuroLeagueAssemblyClub[];
  promoted: EuroLeagueAssemblyClub[];
  nextParticipants: EuroLeagueAssemblyClub[];
}

export interface EuroLicensingReview {
  season: number;
  status: 'pending' | 'accepted' | 'declined' | 'observed';
  previousEuroleagueTids: number[];
  previousEurocupTids: number[];
  proposedEuroleagueTids: number[];
  proposedEurocupTids: number[];
  clubs: EuroLicensingReviewClub[];
  candidates: EuroLicensingReviewCandidate[];
  userInvitationTeamId?: number;
  alternateTeamId?: number;
  domesticTransition?: EuroDomesticTransitionReview;
}

export interface GovernorsBoardMeeting {
  kind?: 'governors-board' | 'euro-league-assembly';
  season: number;
  generatedAt: string;
  ruleChanges: GovernorsBoardRuleChange[];
  teamChanges: GovernorsBoardTeamChange[];
  venueChanges?: GovernorsBoardVenueChange[];
  logoChanges?: GovernorsBoardLogoChange[];
  majorUpdates?: GovernorsBoardMajorUpdate[];
  awardChanges?: GovernorsBoardAwardChange[];
  competitionChanges?: EuroLeagueAssemblyCompetition[];
  licensingReview?: EuroLicensingReview;
  cupPrizePoolProposal?: import('../services/governorsBoard/cupPrizePool').CupPrizePoolProposal;
  reviewed?: boolean;
}

export interface OffseasonPendingDecision {
  type: 'player-option' | 'team-option' | 'qualifying-offer' | 'rookie-contract';
  playerId: string;
  playerName: string;
  teamId: number;
  recommendedAction: 'accept' | 'decline';
  reason: string;
  extra?: Record<string, any>;
}

export interface PbaLocalFreeAgencyBid {
  id: string;
  playerId: string;
  teamId: number;
  teamName?: string;
  teamLogoUrl?: string;
  salaryUSD: number;
  years: number;
  submittedDay: number;
  resolvesOnDay: number;
  isUserBid?: boolean;
  status: 'active' | 'accepted' | 'rejected' | 'withdrawn';
}

export interface PbaLocalFreeAgencyMarket {
  playerId: string;
  playerName: string;
  bids: PbaLocalFreeAgencyBid[];
  resolved: boolean;
  winningTeamId?: number;
  centralDecisionDay?: number;
}

export interface PbaLocalFreeAgencyState {
  season: number;
  period?: 'offseason' | 'limited';
  openedDay: number;
  openedDate: string;
  currentDay: number;
  totalDays: number;
  lastProcessedDay: number;
  status: 'open' | 'complete';
  markets: PbaLocalFreeAgencyMarket[];
}

export type FreeAgencyDecisionStatus = 'signed-with-you' | 'signed-elsewhere' | 're-signed';

export interface FreeAgencyDailyDecision {
  playerId: string;
  playerName: string;
  playerImage?: string;
  playerFace?: NBAPlayer['face'];
  position: string;
  overall: number;
  potential: number;
  previousTeamId?: number;
  previousTeamName: string;
  previousTeamLogo?: string;
  newTeamId: number;
  newTeamName: string;
  newTeamLogo?: string;
  status: FreeAgencyDecisionStatus;
  contractTotalUSD: number;
  contractYears: number;
  contractType?: 'guaranteed' | 'non-guaranteed' | 'two-way' | 'developmental';
  option?: 'NONE' | 'PLAYER' | 'TEAM';
  aspireSideDeal?: {
    sponsor: string;
    amountUSD: number;
    risk: number;
    roll: number;
  };
  currency: string;
  isUserTarget: boolean;
}

export interface FreeAgencyDailySummary {
  day: number;
  totalDays: number;
  date: string;
  decisions: FreeAgencyDailyDecision[];
  combined?: boolean;
  commissionerReview?: boolean;
  signingConfirmation?: boolean;
}

export interface TransferMarketDailyDecision {
  id: string;
  playerId: string;
  playerName: string;
  fromTeamId: number;
  fromTeamName: string;
  fromTeamLogo?: string;
  toTeamId: number;
  toTeamName: string;
  toTeamLogo?: string;
  feeEUR: number;
  type: 'transfer' | 'loan' | 'loan-return';
  involvesUserTeam: boolean;
}

export interface TransferMarketDailySummary {
  date: string;
  decisions: TransferMarketDailyDecision[];
}

export interface SeasonHistoryEntry {
  year: number;
  champion: string;
  championTid: number;
  championSource?: 'playoffs' | 'standings';
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

export interface AllStarHistoryPerson {
  playerId?: string;
  name: string;
  team: string;
}

export interface AllStarHistorySnapshot {
  season: number;
  roster?: AllStarPlayer[];
  teams: string[];
  winner: string;
  finalScore: Record<string, number>;
  mvp?: AllStarHistoryPerson;
  risingStarsMvp?: AllStarHistoryPerson;
  dunkWinner?: AllStarHistoryPerson;
  danceWinner?: string;
  threePointWinner?: AllStarHistoryPerson;
  shootingStarsWinner?: AllStarHistoryPerson;
  shootingStarsWinners?: AllStarHistoryPerson[];
  skillsWinner?: AllStarHistoryPerson;
  horseWinner?: AllStarHistoryPerson;
  throneWinner?: AllStarHistoryPerson;
  bracketRecap?: string;
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
  type: string;
  name: string;
  pid?: string;
  tid?: number;
  uiMode?: string;
  competitionId?: string;
  source?: string;
  introducedSeason?: number;
  nationality?: string;
  role?: 'player' | 'coach' | 'executive';
  statLine?: string;
  conference?: string;
  team?: string;
  coachName?: string;
  coachId?: string;
  executiveName?: string;
  executiveId?: string;
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

