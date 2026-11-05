export type MediaFactType =
  | 'game_result'
  | 'player_performance'
  | 'injury'
  | 'transaction'
  | 'series_completed'
  | 'champion'
  | 'award'
  | 'standings_milestone'
  | 'draft_selection'
  | 'signing'
  | 'retirement'
  | 'hall_of_fame'
  | 'international_result'
  | 'commissioner_announcement';

export interface MediaFact {
  id: string;
  type: MediaFactType;
  occurredAt: string;
  availableAt: string;
  leagueScope: string;
  competitionId?: string;
  season: number;
  importance: 'routine' | 'notable' | 'major' | 'critical';
  entityRefs: {
    personIds?: string[];
    teamIds?: number[];
    gameId?: number;
    seriesId?: string;
    transactionId?: string;
    awardId?: string;
  };
  sourceRef: { kind: string; id: string };
  /** Small source fields needed for deterministic presentation; never prose or media URLs. */
  attributes?: Record<string, string | number | boolean | string[]>;
  templateVersion: number;
}

export interface MediaQuery {
  saveId: string;
  stateRevision: number;
  asOfDate: string;
  leagueScope: string;
  feed: 'news' | 'social';
  cursor?: string;
  limit: number;
  teamId?: number;
  competitionId?: string;
  category?: string;
  authorHandle?: string;
}

export interface MediaPage<T> {
  items: T[];
  nextCursor: string | null;
  generatedFromRevision: number;
}
