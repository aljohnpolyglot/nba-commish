import type { SocialSource } from './common';
import type { GameResult } from './game';
import type { Morale } from './league';
import type { NBAPlayer } from './player';
import type { SponsorIndustry, SponsorshipSlot } from './tycoon';

export interface SponsorInboxOffer {
  id: string;
  brand: string;
  slot: SponsorshipSlot;
  industry: SponsorIndustry | 'generic';
  archetype: 'premium' | 'gambling' | 'tech' | 'local' | 'generic';
  interestLevel: 'very-interested' | 'interested' | 'neutral' | 'not-interested';
  offerLabel: string;
  slotLabel: string;
  valuePerYear: number;
  contractYears: number;
  dealType: 'sponsorship' | 'endorsement';
  oneTime?: boolean;
  country: string;
}

export interface Sender {
  name: string;
  title: string;
  organization: string;
}

export type DisciplineSanctionType = 'warning' | 'fine' | 'suspension' | 'fine_and_suspension' | 'drug_test';

export interface DisciplineInboxAction {
  type: 'discipline-case';
  incidentId: string;
  incidentType: 'conduct' | 'brawl' | 'weapon' | 'peds' | 'gambling';
  playerIds: string[];
  playerNames: string[];
  teamIds: number[];
  reason: string;
  recommendedSanction: DisciplineSanctionType;
  recommendedAmountUSD: number;
  recommendedGames: number;
  status: 'open' | 'resolved';
  resolution?: {
    sanction: DisciplineSanctionType;
    amountUSD?: number;
    games?: number;
    resolvedAt: string;
  };
}

export interface AllStarReplacementInboxAction {
  type: 'all-star-replacement';
  playerId: string;
  playerName: string;
  status: 'open' | 'resolved';
}

export interface DeathMemorialInboxAction {
  type: 'death-memorial';
  playerId: string;
  playerName: string;
  age: number;
  cause: string;
  deathType: 'natural' | 'tragic';
  diedDate: string;
  decisionDueDate: string;
  yearsInLeague: number;
  careerWinShares: number;
  primaryTeamId?: number;
  primaryTeamName?: string;
  honoringTeamId?: number;
  scope: 'league' | 'team';
  status: 'open' | 'resolved';
  resolution?: {
    decision: 'ignore' | 'honor';
    resolvedAt: string;
    honorType?: 'formal_tribute' | 'moment_of_silence';
    scheduledGameId?: number;
    outcome: string;
  };
}

export interface MediaProjectCastMember {
  playerId: string;
  playerName: string;
  teamId: number;
  teamName: string;
}

export interface MediaProjectInboxAction {
  type: 'media-project';
  projectId: string;
  projectTitle: string;
  studioId: string;
  studioName: string;
  brandLogoUrl: string;
  formatLabel: string;
  castSize: number;
  season: number;
  status: 'open' | 'resolved';
  resolution?: {
    decision: 'ignore' | 'respond';
    resolvedAt: string;
    selectedPlayers: MediaProjectCastMember[];
    outcome: string;
  };
}

export interface AspireInvestigationInboxAction {
  type: 'aspire-investigation';
  caseId: string;
  teamId: number;
  teamName: string;
  playerId: string;
  playerName: string;
  sponsor: string;
  amountUSD: number;
  risk: number;
  recommendedPickCount: number;
  status: 'open' | 'resolved';
  resolution?: {
    pickCount: number;
    forfeitedPickIds: number[];
    resolvedAt: string;
  };
}

export interface Email {
  id: string;
  sender: string;
  senderId?: string;
  senderRole: string;
  organization?: string;
  subject: string;
  body: string;
  read: boolean;
  replied: boolean;
  playerPortraitUrl?: string;
  teamLogoUrl?: string;
  date: string;
  delivery?: 'inbox' | 'message';
  thread?: { sender: string; text: string }[];
  action?: { type: 'sponsor-offer'; offer: SponsorInboxOffer } | DisciplineInboxAction | AllStarReplacementInboxAction | DeathMemorialInboxAction | MediaProjectInboxAction | AspireInvestigationInboxAction;
}

export interface NightlifeContact {
  id: string;
  name: string;
  portraitUrl: string;
  firstMetDate: string;
  lastSeenDate: string;
  metAt: string;
  encounterCount: number;
}

export interface TradeDraftPickSnapshot {
  dpid: number;
  season: number;
  round: number;
  originalTid: number;
}

export interface TradeMovement {
  fromTeamId: number;
  toTeamId: number;
  playerIds: string[];
  draftPicks: TradeDraftPickSnapshot[];
  cashUSD?: number;
}

export interface TradeTransactionDetails {
  transactionDate: string;
  movements: TradeMovement[];
}

export interface ContractTransactionDetails {
  transactionType: 'Signing';
  transactionDate: string;
  transactionDescription: string;
  playerId: string;
  playerSlug: string;
  teamId: number;
  teamSlug: string;
  additionalSort: number;
  groupSort: string;
  originalIndex: number;
  salaryReflected: boolean;
  contractLength: number;
  salaryUSD: number;
  totalValueUSD: number;
  option: 'PLAYER' | 'TEAM' | 'NONE';
  contractType: 'guaranteed' | 'non-guaranteed' | 'two-way' | 'developmental' | 'pba-import';
  isExtension: boolean;
  contract: NonNullable<NBAPlayer['contract']>;
  contractYears: NonNullable<NBAPlayer['contractYears']>;
  salaries: NonNullable<NBAPlayer['salaries']>;
}

export interface HistoryEntry {
  text: string;
  date: string;
  type?: string;
  tid?: number;
  league?: string;
  commissioner?: boolean;
  playerIds?: string[];
  eventType?: 'retirement' | 'hall-of-fame' | 'transaction' | 'award' | string;
  personId?: string;
  sourceIds?: Record<string, string | string[]>;
  teamIds?: number[];
  careerTeamId?: number;
  fromTid?: number;
  toTid?: number;
  season?: number;
  transactionId?: string;
  trade?: TradeTransactionDetails;
  contractTransaction?: ContractTransactionDetails;
}

export interface NewsItem {
  id: string;
  headline?: string;
  content?: string;
  date: string;
  category?: string;
  type?: string;
  tid?: number;
  text?: string;
  image?: string;
  playerPortraitUrl?: string;
  isNew?: boolean;
  read?: boolean;
  newsType?: 'daily' | 'weekly';
  gameId?: number;
  homeTeamId?: number;
  awayTeamId?: number;
  teamIds?: number[];
  competitionId?: string;
  teamOnly?: boolean;
  playerIds?: string[];
  personId?: string;
  sourceIds?: Record<string, string | string[]>;
  league?: string;
  leagueId?: string;
  countries?: string[];
  scope?: 'league' | 'country' | 'europe-wide' | 'international' | 'pba';
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
  data?: any;
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
  descriptions: string[];
  category: 'BreakingNews' | 'MainstreamMedia' | 'CultureAndLifestyle' | 'DebatePersonalities' | 'BroadcastingAndJournalism' | 'RegionalBeatReporting' | 'SocialAggregators' | 'ComedyAndSatire' | 'DataAndAnalytics' | 'VeteranPerspectives' | 'TacticalAnalysis' | 'SalaryCapAndBusiness' | 'HooperCulture';
  probability: number;
}

export interface SocialTemplate {
  category: 'GameResult' | 'PlayerFeat' | 'Culture' | 'WinStreak' | 'Shitpost' | 'Injury' | 'GameResult_BoxScore' | 'GameResult_Insider' | 'Trade' | 'Visit';
  templates: string[];
  handleId?: string;
  condition?: (data: any) => boolean;
}

export interface HistoricalStatPoint {
  date: string;
  publicApproval: number;
  ownerApproval: number;
  playerApproval: number;
  legacy: number;
  revenue: number;
  annualRevenue?: number;
  leagueReserve?: number;
  availableBudget?: number;
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
    teamLogoUrl?: string;
    organization?: string;
  }[];
  messages: ChatMessage[];
  lastMessage?: ChatMessage;
  unreadCount: number;
  isTyping?: boolean;
}
