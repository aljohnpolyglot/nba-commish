import type { CompetitionSpec } from '../../../services/competition/types';
import { buildEuropeanLeagueCalendarProfile } from '../../../services/euro/competitionCatalog';

export const SPAIN_COMPETITIONS: CompetitionSpec[] = [
  {
    id: 'endesa',
    displayName: 'Liga Endesa',
    shortName: 'ACB',
    ...buildEuropeanLeagueCalendarProfile('domestic'),
    teamSelector: 'allEndesa',
    teamCount: 18,
    gamesPerTeam: 34,
    prizePool: { currency: 'EUR', winner: 500_000, runnerUp: 200_000, semi: 100_000, qf: 50_000 },
    accentColor: '#D62828',
    icon: 'shield',
  },
  {
    id: 'euroleague',
    displayName: 'Turkish Airlines EuroLeague',
    shortName: 'EL',
    ...buildEuropeanLeagueCalendarProfile('euroleague'),
    teamSelector: 'allEuroleague',
    teamCount: 20,
    gamesPerTeam: 38,
    prizePool: { currency: 'EUR', groupParticipation: 200_000, winner: 1_000_000, runnerUp: 500_000, semi: 250_000, qf: 100_000 },
    accentColor: '#F77F00',
    icon: 'trophy',
  },
  {
    id: 'copa-del-rey',
    displayName: 'Copa del Rey',
    shortName: 'Copa',
    format: 'knockout',
    seasonStart: { month: 2, day: 13 },
    seasonEnd: { month: 2, day: 16 },
    teamSelector: 'league:Endesa',
    teamCount: 8,
    daysOfWeek: ['Thu', 'Fri', 'Sat', 'Sun'],
    playoffFormat: {
      finalFormat: 'single-game',
      rounds: [
        { phase: 'quarterfinals', singleElimination: true, start: { month: 2, day: 13 }, end: { month: 2, day: 14 } },
        { phase: 'semifinals', singleElimination: true, start: { month: 2, day: 15 }, end: { month: 2, day: 15 } },
        { phase: 'final', singleElimination: true, start: { month: 2, day: 16 }, end: { month: 2, day: 16 } },
      ],
    },
    prizePool: { currency: 'EUR', winner: 200_000, runnerUp: 100_000 },
    accentColor: '#C1121F',
    icon: 'cup',
    domesticParentId: 'endesa',
    qualificationRule: 'domestic-standings',
  },
  {
    id: 'supercopa',
    displayName: 'Supercopa Endesa',
    shortName: 'Supercopa',
    format: 'tournament',
    seasonStart: { month: 9, day: 22 },
    seasonEnd: { month: 9, day: 24 },
    teamSelector: 'league:Endesa',
    teamCount: 4,
    daysOfWeek: ['Fri', 'Sat', 'Sun'],
    playoffFormat: {
      finalFormat: 'single-game',
      rounds: [
        { phase: 'semifinals', singleElimination: true, start: { month: 9, day: 22 }, end: { month: 9, day: 23 } },
        { phase: 'final', singleElimination: true, start: { month: 9, day: 24 }, end: { month: 9, day: 24 } },
      ],
    },
    prizePool: { currency: 'EUR', winner: 100_000, runnerUp: 50_000 },
    accentColor: '#E09F3E',
    icon: 'star',
    domesticParentId: 'endesa',
    qualificationRule: 'domestic-titleholders',
  },
];

export const SPAIN_DOMESTIC_COMPETITIONS = SPAIN_COMPETITIONS.filter(
  competition => competition.id !== 'euroleague',
);
