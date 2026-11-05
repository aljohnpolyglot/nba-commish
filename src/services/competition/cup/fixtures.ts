import type { CupCompetitionFormat } from './types';

const DEFAULT_AWARDS: CupCompetitionFormat['awards'] = [
  { id: 'cup-mvp', label: 'Cup MVP', kind: 'tournamentMvp', selectionCount: 1 },
  { id: 'all-tournament', label: 'All-Tournament Team', kind: 'allLeague', selectionCount: 5 },
];

export function buildNbaStyleCupFormat(leagueId = 'nba', competitionId = 'nba-cup'): CupCompetitionFormat {
  return {
    schemaVersion: 1,
    leagueId,
    competitionId,
    displayName: 'In-Season Cup',
    shortName: 'Cup',
    enabled: true,
    teamCount: 30,
    groups: [
      { id: 'East-A', label: 'East Group A', size: 5, poolId: 'East' },
      { id: 'East-B', label: 'East Group B', size: 5, poolId: 'East' },
      { id: 'East-C', label: 'East Group C', size: 5, poolId: 'East' },
      { id: 'West-A', label: 'West Group A', size: 5, poolId: 'West' },
      { id: 'West-B', label: 'West Group B', size: 5, poolId: 'West' },
      { id: 'West-C', label: 'West Group C', size: 5, poolId: 'West' },
    ],
    groupStage: {
      gamesPerTeam: 4,
      dates: [{ month: 11, day: 1, yearOffset: -1 }, { month: 11, day: 8, yearOffset: -1 }, { month: 11, day: 15, yearOffset: -1 }, { month: 11, day: 22, yearOffset: -1 }],
      tiebreakers: ['head-to-head', 'point-differential', 'points-for'],
    },
    qualification: {
      directPerGroup: 1,
      wildcards: [{ count: 1, poolId: 'East' }, { count: 1, poolId: 'West' }],
      wildcardTiebreakers: ['head-to-head', 'point-differential', 'points-for'],
      seeding: 'group-rank-protected',
    },
    knockoutRounds: [
      { id: 'qf', label: 'Quarterfinals', participants: 8, bestOf: 1, date: { month: 12, day: 9, yearOffset: -1 } },
      { id: 'sf', label: 'Semifinals', participants: 4, bestOf: 1, date: { month: 12, day: 14, yearOffset: -1 } },
      { id: 'final', label: 'Final', participants: 2, bestOf: 1, date: { month: 12, day: 17, yearOffset: -1 } },
    ],
    awards: DEFAULT_AWARDS,
    prizePool: { currency: 'USD', winner: 500_000, runnerUp: 200_000, semiFinalist: 100_000, quarterFinalist: 50_000 },
    history: {},
  };
}

export function buildWnbaStyleCupFormat(teamCount = 13, leagueId = 'wnba', competitionId = 'wnba-commissioners-cup'): CupCompetitionFormat {
  const eastSize = Math.floor(teamCount / 2);
  const westSize = teamCount - eastSize;
  return {
    schemaVersion: 1,
    leagueId,
    competitionId,
    displayName: "Commissioner's Cup",
    shortName: 'Commissioner Cup',
    enabled: true,
    teamCount,
    groups: [
      { id: 'East', label: 'Eastern Conference', size: eastSize, poolId: 'East', gamesPerTeam: Math.max(1, eastSize - 1) },
      { id: 'West', label: 'Western Conference', size: westSize, poolId: 'West', gamesPerTeam: Math.max(1, westSize - 1) },
    ],
    groupStage: {
      gamesPerTeam: Math.max(1, Math.min(eastSize, westSize) - 1),
      dates: [{ month: 6, day: 1, yearOffset: 0 }, { month: 6, day: 4, yearOffset: 0 }, { month: 6, day: 8, yearOffset: 0 }, { month: 6, day: 12, yearOffset: 0 }, { month: 6, day: 16, yearOffset: 0 }, { month: 6, day: 20, yearOffset: 0 }, { month: 6, day: 24, yearOffset: 0 }],
      tiebreakers: ['head-to-head', 'point-differential', 'points-for'],
    },
    qualification: {
      directPerGroup: 1,
      wildcards: [],
      wildcardTiebreakers: ['point-differential', 'points-for'],
      seeding: 'overall',
    },
    knockoutRounds: [
      { id: 'final', label: 'Commissioner Cup Final', participants: 2, bestOf: 1, date: { month: 6, day: 30, yearOffset: 0 } },
    ],
    awards: [{ id: 'cup-mvp', label: 'Cup MVP', kind: 'tournamentMvp', selectionCount: 1 }],
    prizePool: { currency: 'USD', winner: 500_000, runnerUp: 165_000 },
    history: {},
  };
}
