import type { GovernorsBoardMeeting, LeagueStats } from '../../types';

export type GovernorsBoardPlaceholderStatus = 'dormant' | 'available' | 'reviewed';
export type GovernorsBoardPlaceholderLeagueStats = Pick<LeagueStats, 'governorsBoardMeetingEnabled' | 'year'>;

export interface GovernorsBoardMeetingPlaceholderModel {
  season: number;
  status: GovernorsBoardPlaceholderStatus;
  generatedAt?: string;
  ruleChangeCount: number;
  teamChangeCount: number;
  venueChangeCount: number;
  majorUpdateCount: number;
  hasRuleChanges: boolean;
  hasTeamChanges: boolean;
  hasVenueChanges: boolean;
  hasMajorUpdates: boolean;
}

export const MOCK_GOVERNORS_BOARD_MEETING: GovernorsBoardMeeting = {
  season: 1996,
  generatedAt: '1995-07-01',
  ruleChanges: [
    {
      key: 'salaryCap',
      label: 'Salary cap amount',
      previous: 15964000,
      next: 23000000,
    },
    {
      key: 'threePointLineDistance',
      label: '3-point line distance',
      previous: 23.75,
      next: 22,
    },
    {
      key: 'rookieScaleType',
      label: 'Rookie scale',
      previous: 'none',
      next: 'dynamic',
    },
  ],
  teamChanges: [
    {
      teamId: 29,
      previousName: 'Vancouver Grizzlies',
      nextName: 'Vancouver Grizzlies',
      previousAbbrev: 'VAN',
      nextAbbrev: 'VAN',
      previousLogoUrl: '/img/logos/nba/VAN_1995.png',
      nextLogoUrl: '/img/logos/nba/VAN_1996.png',
    },
    {
      teamId: 28,
      previousName: 'Toronto Raptors',
      nextName: 'Toronto Raptors',
      previousAbbrev: 'TOR',
      nextAbbrev: 'TOR',
      previousLogoUrl: '/img/logos/nba/TOR_1995.png',
      nextLogoUrl: '/img/logos/nba/TOR_1996.png',
    },
  ],
  majorUpdates: [
    {
      key: 'threePointLine',
      title: '3-Point Line',
      summary: '3-point line active at 22 ft.',
      previous: 23.75,
      next: 22,
    },
  ],
};

export const MOCK_GOVERNORS_BOARD_LEAGUE_STATS: GovernorsBoardPlaceholderLeagueStats = {
  governorsBoardMeetingEnabled: true,
  year: MOCK_GOVERNORS_BOARD_MEETING.season,
};

export function governorsBoardMeetingStatus(
  meeting: GovernorsBoardMeeting | null | undefined,
  leagueStats?: Pick<LeagueStats, 'governorsBoardMeetingEnabled' | 'year'> | null,
): GovernorsBoardPlaceholderStatus {
  if (!meeting || leagueStats?.governorsBoardMeetingEnabled !== true) return 'dormant';
  return meeting.reviewed ? 'reviewed' : 'available';
}

export function buildGovernorsBoardMeetingPlaceholder(
  meeting: GovernorsBoardMeeting | null | undefined,
  leagueStats?: GovernorsBoardPlaceholderLeagueStats | null,
): GovernorsBoardMeetingPlaceholderModel {
  const ruleChangeCount = meeting?.ruleChanges?.length ?? 0;
  const teamChangeCount = meeting?.teamChanges?.length ?? 0;
  const venueChangeCount = meeting?.venueChanges?.length ?? 0;
  const majorUpdateCount = meeting?.majorUpdates?.length ?? 0;
  return {
    season: meeting?.season ?? leagueStats?.year ?? new Date().getFullYear(),
    status: governorsBoardMeetingStatus(meeting, leagueStats),
    generatedAt: meeting?.generatedAt,
    ruleChangeCount,
    teamChangeCount,
    venueChangeCount,
    majorUpdateCount,
    hasRuleChanges: ruleChangeCount > 0,
    hasTeamChanges: teamChangeCount > 0,
    hasVenueChanges: venueChangeCount > 0,
    hasMajorUpdates: majorUpdateCount > 0,
  };
}

export const MOCK_GOVERNORS_BOARD_PLACEHOLDER = buildGovernorsBoardMeetingPlaceholder(
  MOCK_GOVERNORS_BOARD_MEETING,
  MOCK_GOVERNORS_BOARD_LEAGUE_STATS,
);
