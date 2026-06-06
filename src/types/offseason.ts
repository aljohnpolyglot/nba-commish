import type { Conference } from './common';
import type { GameResult } from './game';
import type { NBAPlayer } from './player';

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
  shootingStarsAnnounced?: boolean;
  skillsChallengeAnnounced?: boolean;
  horseAnnounced?: boolean;
  hasRiggedVoting?: boolean;
  roster: AllStarPlayer[];
  risingStarsRoster?: AllStarPlayer[];
  celebrityRoster?: string[];
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

export type TransferBidType = 'transfer' | 'buyout' | 'loan' | 'release-clause';
export type TransferBidStatus = 'active' | 'highest' | 'outbid' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
export type TransferListingStatus = 'active' | 'sold' | 'cancelled' | 'expired';

export interface TransferListing {
  id: string;
  playerId: string;
  sellerTid: number;
  askingEUR: number;
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
  userInitiated?: boolean;
  pctVsAsking?: number;
  expiresDate: string;
  receivedDate: string;
  status: TransferBidStatus;
}

export interface ExpansionTeamSpec {
  region: string;
  name: string;
  abbrev: string;
  pop: number;
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
  | 'draftLottery'
  | 'seasonSummary'
  | 'retiredPlayersReview'
  | 'expansionDraft'
  | 'options'
  | 'qualifyingOffers'
  | 'myFAs'
  | 'draft'
  | 'rookieContracts'
  | 'freeAgency'
  | 'transferMarket'
  | 'sponsorRenewals'
  | 'facilityUpgrades'
  | 'budgetLock'
  | 'preseasonFriendlies'
  | 'hofCeremony'
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

export interface OffseasonPendingDecision {
  type: 'player-option' | 'team-option' | 'qualifying-offer' | 'rookie-contract';
  playerId: string;
  playerName: string;
  teamId: number;
  recommendedAction: 'accept' | 'decline';
  reason: string;
  extra?: Record<string, any>;
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
  type: string;
  name: string;
  pid?: string;
  tid?: number;
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

