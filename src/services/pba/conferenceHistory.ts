import conferenceHistory from '../../data/pbaConferenceHistory.json';
import { PBA_HISTORY } from './historyConfig';

export type HistoricalPbaConferenceSeason = {
  seasonLabel: string;
  calendarYear: number;
  conferences: string[];
};

const seasons = (conferenceHistory.seasons as HistoricalPbaConferenceSeason[])
  .filter(season => season.calendarYear >= PBA_HISTORY.archiveStartYear);

export function getHistoricalPbaConferenceSeason(calendarYear: number): HistoricalPbaConferenceSeason | undefined {
  return seasons.find(season => season.calendarYear === calendarYear);
}

export function getHistoricalPbaConferenceLabels(calendarYear: number): string[] {
  return getHistoricalPbaConferenceSeason(calendarYear)?.conferences.map(label => label.replace(/\[a]/g, '')) ?? [];
}

export function getPbaHistoryDisplayConferenceLabels(calendarYear: number, currentSeason: number): string[] {
  if (calendarYear >= currentSeason) return ['Philippine Cup', "Commissioner's Cup", "Governors' Cup"];
  return getHistoricalPbaConferenceLabels(calendarYear)
    .map(label => label.replace(/^\s*(?:19|20)\d{2}(?:-\d{2})?\s+PBA\s+/i, '').trim())
    .filter(Boolean);
}

export function getCompletedPbaConferenceChronology(completedThrough: number): HistoricalPbaConferenceSeason[] {
  return seasons.filter(season => season.calendarYear <= completedThrough);
}

export const PBA_CONFERENCE_HISTORY_VERSION = conferenceHistory.version;
