import { resolveSeasonDate } from '../../utils/dateUtils';
import { ALL_STAR_ASSETS } from './AllStarSelectionService';

export function getAllStarSunday(year: number): Date {
  return resolveSeasonDate(year, 2, 3, 'Sun', 0);
}

export const toNoonUTC = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T12:00:00.000Z`;
};

export function getAllStarWeekendDates(year: number): {
  votingStart: Date;
  votingEnd: Date;
  startersAnnounced: Date;
  reservesAnnounced: Date;
  risingStarsAnnounced: Date;
  celebrityAnnounced: Date;
  dunkContestAnnounced: Date;
  threePointAnnounced: Date;
  throneSignupOpens: Date;
  throneSignupCloses: Date;
  throneVotingOpens: Date;
  throneFieldReveal: Date;
  breakStart: Date;
  risingStars: Date;
  celebrityGame: Date;
  saturday: Date;
  allStarGame: Date;
  breakEnd: Date;
  regularResumes: Date;
} {
  const allStarSunday = getAllStarSunday(year);
  const shift = (base: Date, days: number) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + days);
    return d;
  };
  const friday = shift(allStarSunday, -2);
  const saturday = shift(allStarSunday, -1);
  const breakStart = shift(allStarSunday, -3);
  const breakEnd = shift(allStarSunday, 1);
  const regularResumes = shift(allStarSunday, 2);
  const startersAnnounced = shift(allStarSunday, -25);
  const reservesAnnounced = shift(allStarSunday, -18);
  const celebrityAnnounced = shift(allStarSunday, -18);
  const risingStarsAnnounced = shift(allStarSunday, -11);
  const dunkContestAnnounced = shift(allStarSunday, -10);
  const threePointAnnounced = shift(allStarSunday, -9);
  const votingStart = resolveSeasonDate(year, 12, 3, 'Mon', -1);
  const votingEnd = shift(startersAnnounced, -7);
  const throneSignupOpens = new Date(Date.UTC(year - 1, 11, 1));
  const throneSignupCloses = new Date(Date.UTC(year, 0, 15));
  const throneVotingOpens = new Date(Date.UTC(year, 0, 16));
  const throneFieldReveal = new Date(Date.UTC(year, 0, 30));

  return {
    votingStart,
    votingEnd,
    startersAnnounced,
    reservesAnnounced,
    risingStarsAnnounced,
    celebrityAnnounced,
    dunkContestAnnounced,
    threePointAnnounced,
    throneSignupOpens,
    throneSignupCloses,
    throneVotingOpens,
    throneFieldReveal,
    breakStart,
    risingStars: friday,
    celebrityGame: friday,
    saturday,
    allStarGame: allStarSunday,
    breakEnd,
    regularResumes,
  };
}

export const ALL_STAR_DATES = getAllStarWeekendDates(2026);

export function getBreakWindowStrings(year: number): { breakStart: string; breakEnd: string; regularResumes: string } {
  const dates = getAllStarWeekendDates(year);
  const ymd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return {
    breakStart: ymd(dates.breakStart),
    breakEnd: ymd(dates.breakEnd),
    regularResumes: ymd(dates.regularResumes),
  };
}

export interface BracketTeam {
  tid: number;
  bucketKey: string;
  name: string;
  abbrev: string;
  logoUrl: string;
}

export interface BracketLayout {
  teams: BracketTeam[];
  initialGames: { gid: number; homeTid: number; awayTid: number; round: 'rr' | 'sf' | 'final' }[];
  format: string;
  teamCount: number;
}

export const ALL_STAR_WEEKEND_LOGOS = {
  east: ALL_STAR_ASSETS.eastLogo,
  west: ALL_STAR_ASSETS.westLogo,
  usa: ALL_STAR_ASSETS.usaLogo,
  world: ALL_STAR_ASSETS.worldLogo,
};

const captainLastName = (roster: any[], bucketKey: string): string | null => {
  const captain = roster?.find((r) => r.conference === bucketKey && r.isCaptain);
  if (!captain?.playerName) return null;
  const parts = String(captain.playerName).split(' ');
  return parts[parts.length - 1];
};

export function buildBracketLayout(leagueStats: any, roster: any[] = []): BracketLayout {
  const format = leagueStats?.allStarFormat ?? 'east_vs_west';
  const teamCount = leagueStats?.allStarTeams ?? 2;

  if (format === 'east_vs_west' || format === 'blacks_vs_whites' || teamCount === 2) {
    const isCaptains = format === 'captains_draft';
    const isUsa = format === 'usa_vs_world';
    const homeName = isCaptains
      ? `Team ${captainLastName(roster, 'East') ?? 'A'}`
      : isUsa ? 'Team USA' : 'Eastern All-Stars';
    const awayName = isCaptains
      ? `Team ${captainLastName(roster, 'West') ?? 'B'}`
      : isUsa ? 'Team World' : 'Western All-Stars';
    const homeAbbrev = isCaptains ? 'CAP1' : isUsa ? 'USA' : 'EAST';
    const awayAbbrev = isCaptains ? 'CAP2' : isUsa ? 'WORLD' : 'WEST';
    return {
      format,
      teamCount: 2,
      teams: [
        { tid: -1, bucketKey: 'East', name: homeName, abbrev: homeAbbrev, logoUrl: isUsa ? ALL_STAR_WEEKEND_LOGOS.usa : ALL_STAR_WEEKEND_LOGOS.east },
        { tid: -2, bucketKey: 'West', name: awayName, abbrev: awayAbbrev, logoUrl: isUsa ? ALL_STAR_WEEKEND_LOGOS.world : ALL_STAR_WEEKEND_LOGOS.west },
      ],
      initialGames: [{ gid: 90001, homeTid: -1, awayTid: -2, round: 'final' }],
    };
  }

  if (format === 'usa_vs_world' && teamCount === 3) {
    return {
      format,
      teamCount: 3,
      teams: [
        { tid: -1, bucketKey: 'USA1', name: 'USA Stars', abbrev: 'STAR', logoUrl: ALL_STAR_WEEKEND_LOGOS.usa },
        { tid: -2, bucketKey: 'USA2', name: 'USA Stripes', abbrev: 'STRP', logoUrl: ALL_STAR_WEEKEND_LOGOS.usa },
        { tid: -10, bucketKey: 'WORLD', name: 'Team World', abbrev: 'WLD', logoUrl: ALL_STAR_WEEKEND_LOGOS.world },
      ],
      initialGames: [{ gid: 90094, homeTid: -1, awayTid: -10, round: 'rr' }],
    };
  }

  if (teamCount === 4) {
    return {
      format,
      teamCount: 4,
      teams: [
        { tid: -1, bucketKey: 'USA1', name: 'USA Stars', abbrev: 'STAR', logoUrl: ALL_STAR_WEEKEND_LOGOS.usa },
        { tid: -2, bucketKey: 'USA2', name: 'USA Stripes', abbrev: 'STRP', logoUrl: ALL_STAR_WEEKEND_LOGOS.usa },
        { tid: -10, bucketKey: 'WORLD1', name: 'World A', abbrev: 'WLDA', logoUrl: ALL_STAR_WEEKEND_LOGOS.world },
        { tid: -11, bucketKey: 'WORLD2', name: 'World B', abbrev: 'WLDB', logoUrl: ALL_STAR_WEEKEND_LOGOS.world },
      ],
      initialGames: [
        { gid: 90091, homeTid: -1, awayTid: -11, round: 'sf' },
        { gid: 90092, homeTid: -2, awayTid: -10, round: 'sf' },
      ],
    };
  }

  return {
    format: 'east_vs_west',
    teamCount: 2,
    teams: [
      { tid: -1, bucketKey: 'East', name: 'Eastern All-Stars', abbrev: 'EAST', logoUrl: ALL_STAR_WEEKEND_LOGOS.east },
      { tid: -2, bucketKey: 'West', name: 'Western All-Stars', abbrev: 'WEST', logoUrl: ALL_STAR_WEEKEND_LOGOS.west },
    ],
    initialGames: [{ gid: 90001, homeTid: -1, awayTid: -2, round: 'final' }],
  };
}
