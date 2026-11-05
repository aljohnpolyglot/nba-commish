export interface FantasyDraftHistoryRecord {
  season: number;
  date: string;
  name: string;
  format: string;
  orderType?: string;
  picks: Array<{ pick: number; round: number; teamId: number; playerId: string }>;
}

export type DraftHistoryEvent =
  | { key: string; season: number; label: string; kind: 'draft' }
  | { key: string; season: number; label: string; kind: 'fantasy'; record: FantasyDraftHistoryRecord };

export function buildDraftHistoryEvents(
  draftYears: number[],
  draftLabel: string,
  fantasyRecords: FantasyDraftHistoryRecord[],
  activeFantasyRecord?: FantasyDraftHistoryRecord,
): DraftHistoryEvent[] {
  const rookieEvents: DraftHistoryEvent[] = draftYears.map(year => ({
    key: `draft-${year}`,
    season: year,
    label: `${year} ${draftLabel}`,
    kind: 'draft',
  }));
  const fantasyEvents: DraftHistoryEvent[] = fantasyRecords.map((record, index) => ({
    key: `fantasy-${index}`,
    season: record.season,
    label: record.name,
    kind: 'fantasy',
    record,
  }));

  if (activeFantasyRecord && !fantasyEvents.some(event => event.season === activeFantasyRecord.season)) {
    fantasyEvents.push({
      key: 'fantasy-active',
      season: activeFantasyRecord.season,
      label: activeFantasyRecord.name,
      kind: 'fantasy',
      record: activeFantasyRecord,
    });
  }

  return [...rookieEvents, ...fantasyEvents]
    .sort((left, right) => left.season - right.season || (left.kind === 'draft' ? -1 : 1));
}

export function getDraftHistoryNavigationLabel(event: DraftHistoryEvent | undefined): string {
  if (!event) return '';
  return event.kind === 'fantasy' ? `FANTASY ${event.season}` : String(event.season);
}

export function moveDraftHistoryEvent(
  events: DraftHistoryEvent[],
  currentKey: string,
  direction: -1 | 1,
): DraftHistoryEvent | null {
  const currentIndex = events.findIndex(event => event.key === currentKey);
  if (currentIndex < 0) return null;
  return events[currentIndex + direction] ?? null;
}
