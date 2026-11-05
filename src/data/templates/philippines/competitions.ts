import type { CompetitionSpec } from '../../../services/competition/types';
import { getPbaConferenceCalendar } from '../../../services/pba/calendar';

const philippineCalendar = getPbaConferenceCalendar('pba-philippine-cup');
const commissionersCalendar = getPbaConferenceCalendar('pba-commissioners-cup');
const governorsCalendar = getPbaConferenceCalendar('pba-governors-cup');

export const PBA_COMPETITIONS: CompetitionSpec[] = [
  {
    id: 'pba-philippine-cup',
    displayName: philippineCalendar.displayName,
    shortName: 'Phil. Cup',
    format: 'regular-league',
    seasonStart: philippineCalendar.seasonStart,
    seasonEnd: philippineCalendar.seasonEnd,
    teamSelector: 'allPBA',
    teamCount: 12,
    gamesPerTeam: 11,
    daysOfWeek: ['Wed', 'Fri', 'Sat', 'Sun'],
    playoffFormat: {
      qfFormat: 'twice-to-beat',
      sfBest: 7,
      finalBest: 7,
      finalFormat: 'best-of',
      rounds: [
        { phase: 'qf', start: philippineCalendar.playoffs.qf.start, end: philippineCalendar.playoffs.qf.end },
        { phase: 'sf', bestOf: 7, start: philippineCalendar.playoffs.sf.start, end: philippineCalendar.playoffs.sf.end },
        { phase: 'final', bestOf: 7, start: philippineCalendar.playoffs.final.start, end: philippineCalendar.playoffs.final.end },
      ],
    },
    prizePool: { currency: 'PHP', winner: 3_000_000, runnerUp: 1_500_000 },
    accentColor: '#1B4D3E',
    icon: 'shield',
    importRule: 'none',
  },
  {
    id: 'pba-commissioners-cup',
    displayName: commissionersCalendar.displayName,
    shortName: "Comm. Cup",
    format: 'regular-league',
    seasonStart: commissionersCalendar.seasonStart,
    seasonEnd: commissionersCalendar.seasonEnd,
    teamSelector: 'allPBA',
    teamCount: 12,
    gamesPerTeam: 11,
    daysOfWeek: ['Wed', 'Fri', 'Sat', 'Sun'],
    playoffFormat: {
      qfFormat: 'twice-to-beat',
      sfBest: 7,
      finalBest: 7,
      finalFormat: 'best-of',
      rounds: [
        { phase: 'qf', start: commissionersCalendar.playoffs.qf.start, end: commissionersCalendar.playoffs.qf.end },
        { phase: 'sf', bestOf: 7, start: commissionersCalendar.playoffs.sf.start, end: commissionersCalendar.playoffs.sf.end },
        { phase: 'final', bestOf: 7, start: commissionersCalendar.playoffs.final.start, end: commissionersCalendar.playoffs.final.end },
      ],
    },
    prizePool: { currency: 'PHP', winner: 3_000_000, runnerUp: 1_500_000 },
    accentColor: '#C41E3A',
    icon: 'trophy',
    importRule: 'one_no_height_limit',
  },
  {
    id: 'pba-governors-cup',
    displayName: governorsCalendar.displayName,
    shortName: "Gov. Cup",
    format: 'regular-league',
    seasonStart: governorsCalendar.seasonStart,
    seasonEnd: governorsCalendar.seasonEnd,
    teamSelector: 'allPBA',
    teamCount: 12,
    gamesPerTeam: 10,
    daysOfWeek: ['Wed', 'Fri', 'Sat', 'Sun'],
    playoffFormat: {
      qfFormat: 'twice-to-beat',
      sfBest: 7,
      finalBest: 7,
      finalFormat: 'best-of',
      rounds: [
        { phase: 'qf', start: governorsCalendar.playoffs.qf.start, end: governorsCalendar.playoffs.qf.end },
        { phase: 'sf', bestOf: 7, start: governorsCalendar.playoffs.sf.start, end: governorsCalendar.playoffs.sf.end },
        { phase: 'final', bestOf: 7, start: governorsCalendar.playoffs.final.start, end: governorsCalendar.playoffs.final.end },
      ],
    },
    prizePool: { currency: 'PHP', winner: 3_000_000, runnerUp: 1_500_000 },
    accentColor: '#FFD700',
    icon: 'cup',
    importRule: 'one_max_6ft6',
  },
];
