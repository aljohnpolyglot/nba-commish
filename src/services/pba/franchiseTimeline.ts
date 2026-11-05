import { PBA_HISTORICAL_SOURCE } from './historyConfig';

export interface HistoricalPbaExpansionEvent {
  sourceSeason: number;
  draftYear: number;
  protectedPlayers?: number;
  rawTeamTids: readonly number[];
}

export const HISTORICAL_PBA_EXPANSION_EVENTS: readonly HistoricalPbaExpansionEvent[] = [
  { sourceSeason: 1990, draftYear: 1990, protectedPlayers: 9, rawTeamTids: [10, 21] },
  { sourceSeason: 2000, draftYear: 2000, rawTeamTids: [18] },
  { sourceSeason: 2015, draftYear: 2014, protectedPlayers: 12, rawTeamTids: [1, 11] },
];

const PBA_FRANCHISE_ROOT_BY_RAW_TID = new Map<number, number>([
  [2, 15],
  [4, 22],
  [5, 23],
  [6, 21],
  [7, 18],
  [16, 21],
  [17, 23],
  [19, 21],
  [20, 22],
]);

export function getCanonicalPbaRawTid(rawTid: number): number {
  return PBA_FRANCHISE_ROOT_BY_RAW_TID.get(rawTid) ?? rawTid;
}

export function getCanonicalHistoricalPbaTid(rawTid: number): number {
  return getCanonicalPbaRawTid(rawTid) + PBA_HISTORICAL_SOURCE.teamTidOffset;
}

export function getHistoricalPbaExpansionEvent(
  sourceSeason: number,
): HistoricalPbaExpansionEvent | undefined {
  return HISTORICAL_PBA_EXPANSION_EVENTS.find(event => event.sourceSeason === sourceSeason);
}

export function isHistoricalPbaExpansionTeam(rawTid: number, sourceSeason: number): boolean {
  const event = getHistoricalPbaExpansionEvent(sourceSeason);
  return !!event?.rawTeamTids.includes(rawTid);
}
