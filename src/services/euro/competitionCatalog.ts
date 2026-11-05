import type { EuroBasketballSourceDescriptor } from '../../data/euroBasketballSources';
import type { CompetitionSpec } from '../competition/types';

type DomesticTournamentPreset = {
  id: string;
  displayName: string;
  shortName: string;
  format: 'group-knockout' | 'knockout' | 'tournament';
  teamCount: number;
  gamesPerTeam?: number;
  groupCount?: number;
  roundSpacingDays?: number;
  daysOfWeek?: CompetitionSpec['daysOfWeek'];
  seasonStart: { month: number; day: number };
  seasonEnd: { month: number; day: number };
  regularSeasonEnd?: { month: number; day: number };
  qualificationRule: 'domestic-standings' | 'domestic-titleholders';
};

const DOMESTIC_TOURNAMENTS_BY_COUNTRY: Record<string, DomesticTournamentPreset[]> = {
  FR: [
    { id: 'france-leaders-cup', displayName: 'Leaders Cup', shortName: 'Leaders Cup', format: 'knockout', teamCount: 8, seasonStart: { month: 2, day: 13 }, seasonEnd: { month: 2, day: 16 }, qualificationRule: 'domestic-standings' },
    { id: 'supercoupe-lnb', displayName: 'Supercoupe LNB', shortName: 'Supercoupe', format: 'tournament', teamCount: 4, seasonStart: { month: 9, day: 20 }, seasonEnd: { month: 9, day: 21 }, qualificationRule: 'domestic-titleholders' },
  ],
  IT: [
    { id: 'coppa-italia', displayName: 'Coppa Italia', shortName: 'Coppa', format: 'knockout', teamCount: 8, seasonStart: { month: 2, day: 12 }, seasonEnd: { month: 2, day: 16 }, qualificationRule: 'domestic-standings' },
    { id: 'supercoppa-italiana', displayName: 'Supercoppa Italiana', shortName: 'Supercoppa', format: 'tournament', teamCount: 4, seasonStart: { month: 9, day: 21 }, seasonEnd: { month: 9, day: 23 }, qualificationRule: 'domestic-titleholders' },
  ],
  GR: [
    { id: 'greek-super-cup', displayName: 'Greek Super Cup', shortName: 'Super Cup', format: 'tournament', teamCount: 4, seasonStart: { month: 9, day: 20 }, seasonEnd: { month: 9, day: 22 }, qualificationRule: 'domestic-titleholders' },
  ],
  TR: [
    { id: 'turkish-cup', displayName: 'Turkish Basketball Cup', shortName: 'Turkish Cup', format: 'knockout', teamCount: 8, seasonStart: { month: 2, day: 11 }, seasonEnd: { month: 2, day: 15 }, qualificationRule: 'domestic-standings' },
    { id: 'presidential-cup', displayName: 'Turkish Presidential Cup', shortName: 'President Cup', format: 'tournament', teamCount: 4, seasonStart: { month: 9, day: 22 }, seasonEnd: { month: 9, day: 24 }, qualificationRule: 'domestic-titleholders' },
  ],
  LT: [
    { id: 'king-mindaugas-cup', displayName: 'King Mindaugas Cup', shortName: 'KMT', format: 'knockout', teamCount: 8, seasonStart: { month: 2, day: 13 }, seasonEnd: { month: 2, day: 16 }, qualificationRule: 'domestic-standings' },
  ],
  IL: [
    { id: 'israel-state-cup', displayName: 'Israel State Cup', shortName: 'State Cup', format: 'knockout', teamCount: 8, seasonStart: { month: 3, day: 10 }, seasonEnd: { month: 3, day: 14 }, qualificationRule: 'domestic-standings' },
    { id: 'israel-league-cup', displayName: 'Israel League Cup', shortName: 'League Cup', format: 'tournament', teamCount: 4, seasonStart: { month: 9, day: 20 }, seasonEnd: { month: 9, day: 22 }, qualificationRule: 'domestic-titleholders' },
  ],
};

const TOURNAMENTS_BY_PARENT_COMPETITION: Record<string, DomesticTournamentPreset[]> = {
  'vtb-united-league': [
    { id: 'vtb-supercup', displayName: 'VTB United League SuperCup', shortName: 'VTB SuperCup', format: 'tournament', teamCount: 4, seasonStart: { month: 9, day: 24 }, seasonEnd: { month: 9, day: 25 }, qualificationRule: 'domestic-titleholders' },
  ],
  'adriatic-league': [
    { id: 'aba-supercup', displayName: 'ABA League Supercup', shortName: 'ABA Supercup', format: 'tournament', teamCount: 4, seasonStart: { month: 9, day: 20 }, seasonEnd: { month: 9, day: 22 }, qualificationRule: 'domestic-titleholders' },
  ],
};

export const EURO_TOURNAMENTS_REQUIRING_LOWER_DIVISIONS = new Set([
  'coupe-de-france',
  'bbl-pokal',
  'greek-cup',
]);

export const EURO_OPTIONAL_FUTURE_TOURNAMENTS = new Set([
  'winline-basket-cup',
]);

export function isInactiveEuroTournament(id: string): boolean {
  return EURO_TOURNAMENTS_REQUIRING_LOWER_DIVISIONS.has(id)
    || EURO_OPTIONAL_FUTURE_TOURNAMENTS.has(id);
}

type EuropeanLeagueCalendarKind = 'domestic' | 'euroleague' | 'eurocup';

function standingsRuleEras(
  kind: EuropeanLeagueCalendarKind,
  firstSeason: number,
  teamCount: number,
): NonNullable<CompetitionSpec['standingsRuleEras']> {
  const tiebreakers: NonNullable<CompetitionSpec['standingsRuleEras']>[number]['tiebreakers'] = [
    'head-to-head',
    'mini-table',
    'point-differential',
    'points-for',
  ];
  if (kind === 'euroleague') {
    return [
      {
        firstSeason,
        lastSeason: 2023,
        tiebreakers,
        qualificationZones: [
          { kind: 'playoff', label: 'Playoffs', from: 1, to: Math.min(8, teamCount), color: '#22c55e' },
        ],
      },
      {
        firstSeason: Math.max(2024, firstSeason),
        tiebreakers,
        qualificationZones: [
          { kind: 'playoff', label: 'Playoffs', from: 1, to: Math.min(6, teamCount), color: '#22c55e' },
          { kind: 'play-in', label: 'Play-In', from: 7, to: Math.min(10, teamCount), color: '#f59e0b' },
        ],
      },
    ];
  }
  if (kind === 'eurocup') {
    return [{
      firstSeason,
      tiebreakers,
      qualificationZones: [
        { kind: 'playoff', label: 'Knockout Stage', from: 1, to: Math.min(8, teamCount), color: '#22c55e' },
      ],
    }];
  }
  const playoffTo = Math.min(8, teamCount);
  return [{
    firstSeason,
    tiebreakers,
    qualificationZones: [
      { kind: 'playoff', label: 'Playoffs · Cup places', from: 1, to: playoffTo, color: '#22c55e' },
      ...(teamCount > playoffTo + 1
        ? [{ kind: 'relegation' as const, label: 'Relegation', from: teamCount - 1, to: teamCount, color: '#f43f5e' }]
        : []),
    ],
  }];
}

export function buildEuropeanLeagueCalendarProfile(
  kind: EuropeanLeagueCalendarKind,
): Pick<CompetitionSpec, 'format' | 'seasonStart' | 'seasonEnd' | 'regularSeasonEnd' | 'daysOfWeek' | 'blackoutPeriods' | 'playoffFormat'> {
  if (kind === 'euroleague') {
    return {
      format: 'group-knockout',
      seasonStart: { month: 10, day: 1 },
      seasonEnd: { month: 4, day: 17 },
      regularSeasonEnd: { month: 4, day: 17 },
      daysOfWeek: ['Tue', 'Thu'],
      playoffFormat: {
        qfBest: 5,
        finalFormat: 'final-four',
        rounds: [
          { phase: 'quarterfinals', bestOf: 5, start: { month: 4, day: 28 }, end: { month: 5, day: 13 } },
          { phase: 'final-four', singleElimination: true, start: { month: 5, day: 22 }, end: { month: 5, day: 24 } },
        ],
      },
    };
  }
  if (kind === 'eurocup') {
    return {
      format: 'group-knockout',
      seasonStart: { month: 10, day: 1 },
      seasonEnd: { month: 2, day: 8 },
      regularSeasonEnd: { month: 2, day: 8 },
      daysOfWeek: ['Tue', 'Wed'],
      playoffFormat: {
        qfBest: 3,
        sfBest: 3,
        finalBest: 3,
        finalFormat: 'best-of',
        rounds: [
          { phase: 'quarterfinals', bestOf: 3, start: { month: 3, day: 4 }, end: { month: 3, day: 12 } },
          { phase: 'semifinals', bestOf: 3, start: { month: 4, day: 1 }, end: { month: 4, day: 9 } },
          { phase: 'final', bestOf: 3, start: { month: 4, day: 29 }, end: { month: 5, day: 6 } },
        ],
      },
    };
  }
  return {
    format: 'regular-league',
    seasonStart: { month: 10, day: 1 },
    seasonEnd: { month: 5, day: 17 },
    regularSeasonEnd: { month: 5, day: 17 },
    daysOfWeek: ['Fri', 'Sat', 'Sun'],
    blackoutPeriods: [
      { start: { month: 2, day: 9 }, end: { month: 2, day: 18 }, label: 'Domestic cup break' },
    ],
    playoffFormat: {
      qfBest: 3,
      sfBest: 5,
      finalBest: 5,
      finalFormat: 'best-of',
      rounds: [
        { phase: 'quarterfinals', bestOf: 3, start: { month: 5, day: 20 }, end: { month: 5, day: 29 } },
        { phase: 'semifinals', bestOf: 5, start: { month: 6, day: 1 }, end: { month: 6, day: 11 } },
        { phase: 'final', bestOf: 5, start: { month: 6, day: 14 }, end: { month: 6, day: 26 } },
      ],
    },
  };
}

export function buildEuroSourceCompetition(
  source: EuroBasketballSourceDescriptor,
  teamCount: number,
  backgroundOnly: boolean,
): CompetitionSpec {
  const count = Math.max(2, teamCount);
  const kind = source.competitionId === 'euroleague'
    ? 'euroleague'
    : source.competitionId === 'eurocup'
      ? 'eurocup'
      : 'domestic';
  const calendar = buildEuropeanLeagueCalendarProfile(kind);
  return {
    id: source.competitionId,
    displayName: source.displayName,
    shortName: source.shortName,
    ...calendar,
    teamSelector: `league:${source.leagueStatus}`,
    teamCount: count,
    gamesPerTeam: kind === 'euroleague'
      ? Math.min(38, (count - 1) * 2)
      : kind === 'eurocup'
        ? Math.min(18, count - 1)
        : (count - 1) * 2,
    accentColor: source.accentColor,
    icon: source.kind === 'cross-border' ? 'trophy' : 'shield',
    backgroundOnly,
    sourceCoverageStart: source.coverageStart,
    sourceCoverageThrough: source.coverageThrough,
    standingsRuleEras: standingsRuleEras(kind, source.coverageStart, count),
  };
}

export function buildEuroDomesticTournaments(
  source: EuroBasketballSourceDescriptor,
  backgroundOnly: boolean,
): CompetitionSpec[] {
  const presets = [
    ...(source.countryCode ? DOMESTIC_TOURNAMENTS_BY_COUNTRY[source.countryCode] ?? [] : []),
    ...(TOURNAMENTS_BY_PARENT_COMPETITION[source.competitionId] ?? []),
  ];
  return presets.map(preset => ({
    id: preset.id,
    displayName: preset.displayName,
    shortName: preset.shortName,
    format: preset.format,
    seasonStart: preset.seasonStart,
    seasonEnd: preset.seasonEnd,
    regularSeasonEnd: preset.regularSeasonEnd,
    teamSelector: `league:${source.leagueStatus}`,
    teamCount: preset.teamCount,
    gamesPerTeam: preset.gamesPerTeam,
    groupCount: preset.groupCount,
    roundSpacingDays: preset.roundSpacingDays,
    daysOfWeek: preset.daysOfWeek ?? ['Thu', 'Fri', 'Sat', 'Sun'],
    playoffFormat: {
      finalFormat: preset.format === 'group-knockout' ? 'final-four' : 'single-game',
      rounds: preset.format === 'group-knockout'
        ? [
            { phase: 'final-four', singleElimination: true, start: { month: preset.seasonEnd.month, day: Math.max(1, preset.seasonEnd.day - 2) }, end: preset.seasonEnd },
          ]
        : preset.teamCount === 8
        ? [
            { phase: 'quarterfinals', singleElimination: true, start: preset.seasonStart, end: preset.seasonStart },
            { phase: 'semifinals', singleElimination: true, start: { month: preset.seasonEnd.month, day: Math.max(1, preset.seasonEnd.day - 1) }, end: { month: preset.seasonEnd.month, day: Math.max(1, preset.seasonEnd.day - 1) } },
            { phase: 'final', singleElimination: true, start: preset.seasonEnd, end: preset.seasonEnd },
          ]
        : [
            { phase: 'semifinals', singleElimination: true, start: preset.seasonStart, end: { month: preset.seasonStart.month, day: preset.seasonStart.day + 1 } },
            { phase: 'final', singleElimination: true, start: preset.seasonEnd, end: preset.seasonEnd },
          ],
    },
    prizePool: preset.teamCount === 8
      ? { currency: 'EUR', winner: 200_000, runnerUp: 100_000, semiFinalist: 35_000 }
      : { currency: 'EUR', winner: 100_000, runnerUp: 50_000 },
    accentColor: source.accentColor,
    icon: preset.qualificationRule === 'domestic-titleholders' ? 'star' : 'cup',
    backgroundOnly,
    sourceCoverageStart: source.coverageStart,
    sourceCoverageThrough: source.coverageThrough,
    domesticParentId: source.competitionId,
    qualificationRule: preset.qualificationRule,
  }));
}
