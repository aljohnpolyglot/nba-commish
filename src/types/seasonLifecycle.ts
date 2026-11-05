import type { OffseasonChecklistRow } from './offseason';

export type LeagueLifecycleMode = 'nba' | 'wnba' | 'pba' | 'euro' | 'fictional';
export type LifecycleStepStatus = 'not-applicable' | 'blocked' | 'pending' | 'in-progress' | 'complete';
export type SeasonLifecyclePhase =
  | 'REGULAR_SEASON_ACTIVE'
  | 'REGULAR_SEASON_COMPLETE'
  | 'PLAYOFFS_MATERIALIZED'
  | 'PLAYOFFS_ACTIVE'
  | 'CHAMPION_FINALIZED'
  | 'OFFSEASON_OPEN'
  | 'OFFSEASON_TASKS_ACTIVE'
  | 'NEXT_SEASON_PREPARED'
  | 'PRESEASON_ACTIVE';

export interface DraftOrderLedgerSlot {
  slotId: string;
  draftYear: number;
  round: number;
  pickInRound: number;
  overallPick: number;
  oddsTeamId: number;
  originalTeamId: number;
  currentOwnerTeamId: number;
  pickAssetId?: number;
  protection?: string;
  conveyanceState?: string;
  selectedPlayerId?: string;
  disposition: 'open' | 'selected' | 'passed' | 'forfeited';
}

export interface DraftCycleAuthority {
  lottery: 'manual' | 'automatic' | 'delegated';
  draftOrderReview: 'manual' | 'delegated';
  draft: 'manual' | 'delegated';
  rookieContracts: 'manual' | 'delegated';
}

export interface DraftCycleLedger {
  year: number | null;
  eventDates: {
    regularSeasonEndDate?: string;
    postseasonStartDate?: string;
    seasonEndDate?: string;
    lotteryDate?: string;
    draftOrderReviewDate?: string;
    draftDate?: string;
  };
  lotteryEnabled: boolean;
  lotteryRequiredForCycle: boolean;
  lottery: LifecycleStepStatus;
  lotteryEvidence?: {
    resolvedSeason: number;
    resolvedAtDate?: string;
    eventRunId: string;
    provenance: 'manual' | 'automatic' | 'delegated' | 'legacy-result';
    orderFingerprint: string;
  };
  orderReview: LifecycleStepStatus;
  orderLedger: DraftOrderLedgerSlot[];
  orderReviewedSeason?: number;
  authority: DraftCycleAuthority;
  draft: LifecycleStepStatus;
  draftCompleteSeason?: number;
  expectedSlots: number;
  selectedPlayerIdsBySlot: Record<number, string>;
  passedSlots: number[];
  historyPersisted: boolean;
  rookieContracts: LifecycleStepStatus;
  rookieContractsResolvedSeason?: number;
}

export interface SeasonTransitionLedger {
  fromSeason: number;
  toSeason: number;
  owner: OffseasonChecklistRow | 'calendar' | 'conference' | 'league-assembly';
  status: 'pending' | 'ready' | 'complete';
  completedAtDate?: string;
}

export interface LeagueSeasonLifecycle {
  version: 3;
  mode: LeagueLifecycleMode;
  activeSeason: number;
  completedSeason: number | null;
  displayedSeason: number;
  currentPhase: SeasonLifecyclePhase;
  regularSeason: {
    season: number;
    status: 'active' | 'complete';
    completedGameIds: number[];
    standingsFingerprint?: string;
  };
  playoffs: {
    season: number;
    materialized: boolean;
    bracketFingerprint?: string;
    regularSeasonCompletionFingerprint?: string;
    championTeamId?: number;
    runnerUpTeamId?: number;
    finalizedAtDate?: string;
  };
  awards: {
    season: number;
    status: LifecycleStepStatus;
    finalizedAwardKeys: string[];
  };
  taskCycle: {
    id: string;
    season: number;
    status: LifecycleStepStatus;
  };
  offseasonCycle: number | null;
  offseasonOpen: boolean;
  nextSeason: number;
  draft: DraftCycleLedger;
  retirements: LifecycleStepStatus;
  transition: SeasonTransitionLedger;
  rolloverOwner: SeasonTransitionLedger['owner'];
  nextValidTransition: SeasonLifecyclePhase | null;
  migration?: {
    version: 3;
    provenance: 'native' | 'v1-upgrade' | 'v2-upgrade';
  };
}
