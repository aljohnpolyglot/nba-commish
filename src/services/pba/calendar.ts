import calendarData from '../../data/pbaCalendarWindows.json';

export type PbaNationalTeamWindow = {
  key: string;
  eventType: string;
  label: string;
  startDate: string;
  endDate: string;
  tournamentYear?: number;
};

export const getPbaConferenceCalendar = (competitionId: string) => {
  const row = calendarData.conferenceCalendar.find(entry => entry.id === competitionId);
  if (!row) throw new Error(`Missing PBA calendar entry for ${competitionId}`);
  return row;
};

export function getPbaConferenceCalendarForSeason(competitionId: string, season: number) {
  void season;
  return getPbaConferenceCalendar(competitionId);
}

export const getPbaConferenceCalendars = () => calendarData.conferenceCalendar;

export const getPbaConferenceCalendarsForSeason = (season: number) => calendarData.conferenceCalendar
  .map(entry => getPbaConferenceCalendarForSeason(entry.id, season));

export function resolvePbaSeasonDate(
  season: number,
  date: { month: number; day: number },
): string {
  const year = date.month >= 10 ? season - 1 : season;
  return `${year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export function getPbaAllStarWeekendStartIso(season: number): string {
  const commissioners = getPbaConferenceCalendarForSeason('pba-commissioners-cup', season);
  const philippine = getPbaConferenceCalendarForSeason('pba-philippine-cup', season);
  const opening = new Date(`${resolvePbaSeasonDate(season, commissioners.seasonStart)}T00:00:00.000Z`);
  const preferred = new Date(opening);
  preferred.setUTCDate(preferred.getUTCDate() - 5);
  const afterPhilippineFinal = new Date(`${resolvePbaSeasonDate(season, philippine.playoffs.final.end)}T00:00:00.000Z`);
  afterPhilippineFinal.setUTCDate(afterPhilippineFinal.getUTCDate() + 1);
  const start = preferred > afterPhilippineFinal ? preferred : afterPhilippineFinal;
  const latestStart = new Date(opening);
  latestStart.setUTCDate(latestStart.getUTCDate() - 3);
  if (start > latestStart) {
    throw new Error(`PBA ${season} calendar has no three-day All-Star window between the Philippine and Commissioner's Cups`);
  }
  return start.toISOString().slice(0, 10);
}

export function getPbaNationalTeamWindowsForSeason(season: number): PbaNationalTeamWindow[] {
  const seasonStart = `${season - 1}-10-01`;
  const seasonEnd = `${season}-09-30`;
  return calendarData.nationalTeamWindows.filter(window => (
    window.endDate >= seasonStart && window.startDate <= seasonEnd
  ));
}

export function getPbaMajorTournamentDates(eventType: 'world-cup' | 'olympics-men', year: number) {
  return calendarData.majorTournamentDates.find(entry => entry.eventType === eventType && entry.tournamentYear === year);
}

export const PBA_CALENDAR_DATA_VERSION = calendarData.version;
