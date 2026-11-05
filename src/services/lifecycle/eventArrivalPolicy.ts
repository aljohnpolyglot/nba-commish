import { addGameDays, toISODateString } from '../../utils/dateUtils';

export interface ManualCalendarEventWindow {
  arrivalDate: string;
  missedEventFallbackDate: string;
}

export function getManualCalendarEventWindow(eventDate: Date): ManualCalendarEventWindow {
  return {
    arrivalDate: toISODateString(eventDate),
    missedEventFallbackDate: toISODateString(addGameDays(eventDate, 1)),
  };
}
