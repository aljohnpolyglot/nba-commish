import type { GameState } from '../../types';
import { getLeagueEventSponsorName } from '../franchises/franchiseEventNaming';
import { buildPerformanceAnnouncementEvent } from '../news/nativeLeagueAnnouncements';
import {
  getPerformanceEventDate,
  isAllStarHalftimePerformance,
  isAllStarSaturdayPerformance,
  isFinalsPerformance,
} from './performanceEvents';

export interface PerformanceBooking {
  type: 'performance';
  event: string;
  artists: string[];
  artistDetails?: Array<{ name: string; imageUrl?: string }>;
  seasonYear?: number;
  isHighProfile?: boolean;
}

export function buildPerformanceBookingPatch(
  state: GameState,
  bookings: PerformanceBooking[],
): {
  patch: Partial<GameState>;
  scheduledBookings: Array<PerformanceBooking & { eventDate: string }>;
} {
  const scheduledBookings = bookings.map(details => ({
    details,
    eventDate: getPerformanceEventDate(details.event, state.leagueStats.year, state.leagueStats, state.schedule),
  }));
  const performanceAnnouncements = scheduledBookings.flatMap(({ details, eventDate }) => {
    const sponsor = details.event.includes('All-Star')
      ? getLeagueEventSponsorName(state, 'all_star_game')
      : undefined;
    const announcement = buildPerformanceAnnouncementEvent(state, details, eventDate, sponsor);
    return announcement ? [announcement] : [];
  });
  const performanceAnnouncementIds = new Set(performanceAnnouncements.map(event => event.payload.id));
  const selectedEvents = new Set(bookings.map(details => details.event));
  return {
    patch: {
      leagueStats: {
        ...state.leagueStats,
        hasInvitedPerformance: true,
        performanceInvitationYear: state.leagueStats.year,
        hasFinalsHalftime: state.leagueStats.hasFinalsHalftime
          || bookings.some(details => isFinalsPerformance(details.event)),
        hasAllStarHalftime: state.leagueStats.hasAllStarHalftime
          || bookings.some(details => isAllStarHalftimePerformance(details.event)),
        hasAllStarSaturdayPerformance: state.leagueStats.hasAllStarSaturdayPerformance
          || bookings.some(details => isAllStarSaturdayPerformance(details.event)),
      },
      scheduledEvents: [
        ...(state.scheduledEvents ?? []).filter(event =>
          (
            event.type !== 'PERFORMANCE_DAY'
            || !selectedEvents.has(String(event.payload?.event ?? ''))
            || (
              Number(event.payload?.seasonYear ?? (
                event.payload?.event === 'Championship Ring Ceremony'
                  ? Number(String(event.date).slice(0, 4)) + 1
                  : Number(String(event.date).slice(0, 4))
              )) !== state.leagueStats.year
            )
          )
          && (
            event.type !== 'NATIVE_LEAGUE_ANNOUNCEMENT'
            || !performanceAnnouncementIds.has(String(event.payload?.id ?? ''))
          ),
        ),
        ...scheduledBookings.map(({ details, eventDate }) => ({
          date: eventDate,
          type: 'PERFORMANCE_DAY' as const,
          payload: details,
        })),
        ...performanceAnnouncements,
      ],
    },
    scheduledBookings: scheduledBookings.map(({ details, eventDate }) => ({ ...details, eventDate })),
  };
}
