import { canonicalFibaCountry } from './countryIdentity';
import type {
  InternationalTournamentKind,
  InternationalTournamentState,
  InternationalTournamentTeam,
  PreparedFibaNationalTeams,
} from './types';
import { internationalTournamentCompetitionId } from './competitionIdentity';

interface CreateInternationalTournamentBase {
  kind: InternationalTournamentKind;
  year: number;
  playedYear?: number;
  branchYear: number;
  hostCountries: string[];
  preparedTeams: PreparedFibaNationalTeams;
}

export type CreateInternationalTournamentOptions = CreateInternationalTournamentBase & (
  | { fieldMode: 'eligible-countries'; fieldLimit?: never }
  | { fieldMode: 'capped'; fieldLimit: number }
);

function teamStrength(players: InternationalTournamentTeam['players']): number {
  if (players.length === 0) return 0;
  return players.reduce((total, player) => total + player.strength, 0) / players.length;
}

function teamId(country: string, year: number): string {
  const slug = country
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `national:${slug}:${year}`;
}

export function createInternationalTournamentState(
  options: CreateInternationalTournamentOptions,
): InternationalTournamentState {
  const ranked = options.preparedTeams.rosters
    .map(roster => ({
      roster,
      strength: teamStrength(roster.players),
      isHost: options.hostCountries.some(host =>
        canonicalFibaCountry(host) === canonicalFibaCountry(roster.country),
      ),
    }))
    .sort((a, b) => Number(b.isHost) - Number(a.isHost) || b.strength - a.strength || a.roster.country.localeCompare(b.roster.country));

  const fieldLimit = options.fieldMode === 'capped'
    ? Math.max(0, Math.floor(options.fieldLimit))
    : ranked.length;
  const selected = ranked
    .slice(0, fieldLimit)
    .sort((a, b) => b.strength - a.strength || a.roster.country.localeCompare(b.roster.country));
  const teams: InternationalTournamentTeam[] = selected.map((entry, index) => ({
    id: teamId(entry.roster.country, options.year),
    country: entry.roster.country,
    abbrev: entry.roster.abbrev,
    imageUrl: entry.roster.imageUrl,
    sourceTid: entry.roster.teamTid,
    seed: index + 1,
    strength: entry.strength,
    players: entry.roster.players,
    reserves: entry.roster.reserves,
  }));
  const competitionId = internationalTournamentCompetitionId(options.kind, options.year);

  return {
    version: 1,
    id: competitionId,
    competitionId,
    kind: options.kind,
    year: options.year,
    playedYear: options.playedYear,
    branchYear: options.branchYear,
    status: teams.length > 0 ? 'rosters-ready' : 'scheduled',
    hostCountries: options.hostCountries.map(canonicalFibaCountry).filter(Boolean),
    fieldMode: options.fieldMode,
    teams,
    groups: [],
    games: [],
    boxScores: [],
    reviewed: false,
  };
}
