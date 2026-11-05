import coverage from '../../data/fibaRosterCoverage.json';
import type { InternationalTournamentKind } from './types';

type CoverageRow = { all: number; euro: number };

export function hasPlayableInternationalRosterCoverage(
  kind: InternationalTournamentKind,
  rosterYear: number,
): boolean {
  if (rosterYear > coverage.ratingSeasonEnd) return true;
  const row = (coverage.countryCountsBySeason as Record<string, CoverageRow>)[String(rosterYear)];
  if (!row) return false;
  const availableCountries = kind === 'eurobasket' ? row.euro : row.all;
  return availableCountries >= coverage.minimumCountriesPerTournament;
}
