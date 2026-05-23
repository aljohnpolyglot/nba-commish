import type { SocialSource } from './common';
import type { GameResult } from './game';
import type { Morale } from './league';
import type { NBAPlayer } from './player';

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
  thread?: { sender: string; text: string }[];
}

export interface HistoryEntry {
  text: string;
  date: string;
  type?: string;
  tid?: number;
  commissioner?: boolean;
  playerIds?: string[];
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
  teamOnly?: boolean;
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
  }[];
  messages: ChatMessage[];
  lastMessage?: ChatMessage;
  unreadCount: number;
  isTyping?: boolean;
}
