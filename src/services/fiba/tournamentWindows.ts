import tournamentHistory from '../../data/fibaTournamentHistory.json';
import euroBasketHistory from '../../data/euroBasketHistory.json';
import type { InternationalTournamentKind } from './types';
import { getPbaMajorTournamentDates } from '../pba/calendar';
import { hasPlayableInternationalRosterCoverage } from './rosterCoverage';

export interface PlayableInternationalWindow {
  kind: InternationalTournamentKind;
  tournamentYear: number;
  rosterYear: number;
  hosts: string[];
  markerDate: string;
  tournamentStartDate: string;
  tournamentEndDate: string;
  label: string;
  fieldLimit?: number;
}

export interface SourcedInternationalTournamentMetadata {
  tournamentYear: number;
  playedYear: number;
  hosts: string[];
  hostCity?: string;
}

export function getSourcedInternationalTournamentMetadata(
  kind: InternationalTournamentKind,
  tournamentYear: number,
): SourcedInternationalTournamentMetadata | undefined {
  if (kind === 'world-cup') {
    const row = tournamentHistory.worldCup.find(entry => entry.year === tournamentYear);
    return row ? {
      tournamentYear: row.year,
      playedYear: row.year,
      hosts: [...row.hosts],
    } : undefined;
  }
  if (kind === 'olympics-men') {
    const row = tournamentHistory.olympicsMen.find(entry => entry.year === tournamentYear);
    return row ? {
      tournamentYear: row.year,
      playedYear: Number(row.playedYear ?? row.year),
      hosts: [...row.hosts],
      hostCity: row.hostCity,
    } : undefined;
  }
  const row = euroBasketHistory.find(entry => entry.year === tournamentYear);
  return row ? {
    tournamentYear: row.year,
    playedYear: row.year,
    hosts: [...row.hosts],
  } : undefined;
}

export function getPlayableInternationalWindowForSeason(
  playedCalendarYear: number,
  landingCalendarYear = playedCalendarYear,
): PlayableInternationalWindow | undefined {
  const sourcedWorldCup = tournamentHistory.worldCup.find(row => row.year === playedCalendarYear);
  const worldCup = sourcedWorldCup ?? (
    playedCalendarYear > 2023 && (playedCalendarYear - 2023) % 4 === 0
      ? { year: playedCalendarYear, hosts: [] as string[] }
      : undefined
  );
  if (worldCup && hasPlayableInternationalRosterCoverage('world-cup', worldCup.year)) {
    const hosts = worldCup.hosts;
    const dates = getPbaMajorTournamentDates('world-cup', worldCup.year) ?? { start: '08-24', end: '09-15' };
    return {
      kind: 'world-cup',
      tournamentYear: worldCup.year,
      rosterYear: worldCup.year,
      hosts,
      markerDate: `${landingCalendarYear}-08-20`,
      tournamentStartDate: `${landingCalendarYear}-${dates.start}`,
      tournamentEndDate: `${landingCalendarYear}-${dates.end}`,
      label: `FIBA World Cup ${worldCup.year}`,
    };
  }

  const sourcedOlympics = tournamentHistory.olympicsMen.find(row =>
    Number(row.playedYear ?? row.year) === playedCalendarYear,
  );
  const olympics = sourcedOlympics ?? (
    playedCalendarYear > 2024 && playedCalendarYear % 4 === 0
      ? { year: playedCalendarYear, playedYear: playedCalendarYear, hosts: [] as string[] }
      : undefined
  );
  const rosterYear = Number(olympics?.playedYear ?? olympics?.year ?? 0);
  if (olympics && hasPlayableInternationalRosterCoverage('olympics-men', rosterYear)) {
    const hosts = olympics.hosts;
    const dates = getPbaMajorTournamentDates('olympics-men', rosterYear) ?? { marker: '07-17', start: '07-27', end: '08-10' };
    return {
      kind: 'olympics-men',
      tournamentYear: olympics.year,
      rosterYear,
      hosts,
      markerDate: `${landingCalendarYear}-${dates.marker}`,
      tournamentStartDate: `${landingCalendarYear}-${dates.start}`,
      tournamentEndDate: `${landingCalendarYear}-${dates.end}`,
      label: `Men's Olympics ${olympics.year}`,
      fieldLimit: 12,
    };
  }

  const sourcedEuroBasket = euroBasketHistory.find(row =>
    row.year === playedCalendarYear && !('status' in row),
  );
  const euroBasket = sourcedEuroBasket ?? (
    playedCalendarYear > 2029 && (playedCalendarYear - 2029) % 4 === 0
      ? { year: playedCalendarYear, hosts: [] as string[], teams: 24 }
      : undefined
  );
  if (!euroBasket || !hasPlayableInternationalRosterCoverage('eurobasket', euroBasket.year)) return undefined;
  return {
    kind: 'eurobasket',
    tournamentYear: euroBasket.year,
    rosterYear: euroBasket.year,
    hosts: euroBasket.hosts,
    markerDate: `${landingCalendarYear}-08-20`,
    tournamentStartDate: `${landingCalendarYear}-08-27`,
    tournamentEndDate: `${landingCalendarYear}-09-18`,
    label: `FIBA EuroBasket ${euroBasket.year}`,
    fieldLimit: 'teams' in euroBasket ? Number(euroBasket.teams) || 24 : 24,
  };
}
