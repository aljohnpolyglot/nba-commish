export type CommissionerTaskPhase = 'offseason' | 'midyear';

export type CommissionerTaskId =
  | 'season_review'
  | 'retired_players'
  | 'staff_retirements'
  | 'referee_retirements'
  | 'draft_lottery'
  | 'nba_draft'
  | 'media_rights_renewal'
  | 'franchise_event_sponsorships'
  | 'governors_proposal'
  | 'league_settings_review'
  | 'governors_final'
  | 'commissioner_free_agency'
  | 'league_pass_price'
  | 'expansion_bidding'
  | 'expansion_draft'
  | 'nba_cup_host'
  | 'all_star_host'
  | 'global_games'
  | 'international_tournament'
  | 'international_preseason'
  | 'christmas_games'
  | 'invite_performance'
  | 'hof_endorsement'
  | 'hof_ceremony'
  | 'all_star_replacements'
  | 'celebrity_roster'
  | 'dunk_participants'
  | 'three_point_participants'
  | 'shooting_stars_participants'
  | 'skills_participants'
  | 'horse_participants';

export type CommissionerTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'resolved'
  | 'auto_resolved'
  | 'not_applicable';

export interface CommissionerTaskRecord {
  key: string;
  taskId: CommissionerTaskId;
  season: number;
  phase: CommissionerTaskPhase;
  status: CommissionerTaskStatus;
  openDate: string;
  dueDate: string;
  resolvedAt?: string;
  resolution?: Record<string, unknown>;
  league: string;
  cycleId: string;
  applicable: boolean;
  availableDate: string;
  prerequisites: string[];
  authority: 'manual' | 'delegated' | 'automatic';
  destination: string;
  completionEvidence?: Record<string, unknown>;
}

export interface CommissionerTaskLedger {
  version: 2;
  records: Record<string, CommissionerTaskRecord>;
}

export interface CommissionerTaskDefinition {
  id: CommissionerTaskId;
  phase: CommissionerTaskPhase;
  order: number;
  title: string;
  description: string;
  autoLabel: string;
  allowAssistant?: boolean;
  workspace?: string;
}

export interface CommissionerTaskView extends CommissionerTaskRecord {
  definition: CommissionerTaskDefinition;
  available: boolean;
  overdue: boolean;
}

export interface CommissionerBoardProposal {
  key: string;
  label: string;
  previous: string | number | boolean | null;
  next: string | number | boolean | null;
  accepted: boolean;
}

export interface GovernorsBoardLogoChange {
  teamId: number;
  teamName: string;
  teamAbbrev?: string;
  previousLogoUrl: string;
  nextLogoUrl: string;
}

export interface CommissionerBoardPaper {
  cycleYear: number;
  generatedAt: string;
  proposals: CommissionerBoardProposal[];
  venueChanges?: GovernorsBoardVenueChange[];
  logoChanges?: GovernorsBoardLogoChange[];
  reviewBaseline?: LeagueStats;
  reviewedAt?: string;
  signedAt?: string;
  signedBy?: string;
}

export interface BroadcastOffer {
  id: string;
  name: string;
  partners: string[];
  partnerIds: string[];
  years: number;
  annualValueUSD: number;
  reach: number;
  production: number;
  security: number;
  growth: number;
  approval: number;
  partnerType: 'national' | 'streaming' | 'special' | 'mixed';
  specialty: string;
  historical?: boolean;
  phaseAssignments?: Record<string, string[]>;
  scheduleAssignments?: Record<string, string[]>;
}
import type { LeagueStats } from './league';
import type { GovernorsBoardVenueChange } from './offseason';
