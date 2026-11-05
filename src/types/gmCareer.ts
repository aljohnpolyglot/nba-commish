import type { TeamStrategyKey } from '../utils/teamStrategy';

export type GmLeagueScope = 'nba' | 'fictional' | 'euro' | 'wnba' | 'pba';
export type GmEmploymentStatus = 'active' | 'unemployed' | 'terminated' | 'expired';
export type GmReviewTone = 'excellent' | 'good' | 'acceptable' | 'poor' | 'failed';

export interface GmEmploymentContract {
  teamId: number;
  teamName: string;
  leagueScope: GmLeagueScope;
  annualSalary: number;
  currency: string;
  initialYears: number;
  yearsRemaining: number;
  startedSeason: number;
  tenureSeasons: number;
  graceReviewsRemaining: number;
  status: GmEmploymentStatus;
}

export interface GmReviewDetail {
  label: string;
  value: string;
}

export interface GmReviewCategory {
  key: 'regularSeason' | 'playoffs' | 'finances';
  label: string;
  grade: string;
  assessment: string;
  impact: number;
  tone: GmReviewTone;
  details: GmReviewDetail[];
}

export interface GmSeasonReview {
  id: string;
  season: number;
  teamId: number;
  teamName: string;
  ownerName: string;
  ownerPortraitUrl?: string;
  annualSalary: number;
  currency: string;
  contractYearsRemaining: number;
  previousApproval: number;
  currentApproval: number;
  seasonImpact: number;
  categories: [GmReviewCategory, GmReviewCategory, GmReviewCategory];
  decision: 'approved' | 'dismissed';
  gracePeriodActive: boolean;
  ownerMessage: string;
}

export interface GmMarketVacancy {
  id: string;
  teamId: number;
  leagueScope: GmLeagueScope;
  formerGmId?: string;
  openedSeason: number;
}

export interface GmJobOffer {
  id: string;
  teamId: number;
  teamName: string;
  leagueScope: GmLeagueScope;
  annualSalary: number;
  currency: string;
  years: number;
  marketSize: string;
  marketPopulation?: number;
  franchiseValue: number;
  franchiseValueCurrency?: string;
  lastYearRecord: string;
  strategyKey: TeamStrategyKey;
  strategyLabel: string;
  pitch: string;
  stateName?: string;
  estimatedStateTaxRate?: number;
  logoUrl?: string;
  isFormerTeam?: boolean;
  badge?: 'Re-sign';
}

export interface GmContractDecision {
  teamId: number;
  teamName: string;
  season: number;
  renewalOffered: boolean;
  offer?: GmJobOffer;
}

export interface LeagueGmContract {
  gmId: string;
  teamId: number;
  annualSalary: number;
  yearsRemaining: number;
  status: 'active' | 'available';
}

export interface GmCareerHistoryEntry {
  season: number;
  teamId: number;
  teamName: string;
  event: 'reviewed' | 'retained' | 'dismissed' | 'expired' | 'renewed' | 'hired';
  approval?: number;
  annualSalary?: number;
  years?: number;
}

export interface GmCareerState {
  version: 1;
  approval: number;
  employment: GmEmploymentContract;
  pendingReview?: GmSeasonReview;
  pendingContractDecision?: GmContractDecision;
  jobOffers?: GmJobOffer[];
  vacancies: GmMarketVacancy[];
  leagueGmContracts: LeagueGmContract[];
  history: GmCareerHistoryEntry[];
}
