import { resolveSeasonDate } from '../../utils/dateUtils';
import { ALL_STAR_ASSETS } from './allStarSelectionHelpers';
import type { LeagueCalendar, NBAPlayer } from '../../types';
import { getCaptainTeamNameFromFullName, resolveLegendCaptains } from './captainPool';
import { getPlayerImage } from '../../utils/playerImage';
import { getLeagueCalendar, leagueCalendarDate } from '../leagueCalendar';
import { getPbaAllStarWeekendStartIso } from '../pba/calendar';
import { resolveNbaConferenceLogo } from '../../data/nbaConferenceLogos';

type NbaAnnouncementDateKey =
  | 'votingStart'
  | 'votingEnd'
  | 'startersAnnounced'
  | 'reservesAnnounced'
  | 'risingStarsAnnounced'
  | 'celebrityAnnounced'
  | 'dunkContestAnnounced'
  | 'threePointAnnounced'
  | 'shootingStarsAnnounced'
  | 'skillsChallengeAnnounced'
  | 'horseAnnounced';

const NBA_ANNOUNCEMENT_DATE_OVERRIDES: Record<number, Partial<Record<NbaAnnouncementDateKey, string>>> = {
  2022: {
    votingStart: '2021-12-25',
    votingEnd: '2022-01-22',
    startersAnnounced: '2022-01-27',
    risingStarsAnnounced: '2022-02-01',
    reservesAnnounced: '2022-02-03',
    dunkContestAnnounced: '2022-02-08',
    threePointAnnounced: '2022-02-08',
    shootingStarsAnnounced: '2022-02-08',
    skillsChallengeAnnounced: '2022-02-08',
    horseAnnounced: '2022-02-08',
    celebrityAnnounced: '2022-02-09',
  },
};

const getNbaAnnouncementDate = (year: number, key: NbaAnnouncementDateKey, fallback: Date): Date => {
  const savedDate = NBA_ANNOUNCEMENT_DATE_OVERRIDES[year]?.[key];
  return savedDate ? new Date(`${savedDate}T00:00:00.000Z`) : fallback;
};

export function getAllStarSunday(year: number): Date {
  return resolveSeasonDate(year, 2, 3, 'Sun', 0);
}

export const toNoonUTC = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T12:00:00.000Z`;
};

export function getAllStarWeekendDates(year: number, leagueStats?: { uiMode?: string | null; pbaAllStarWeekendStart?: string; leagueCalendar?: LeagueCalendar }): {
  votingStart: Date;
  votingEnd: Date;
  startersAnnounced: Date;
  reservesAnnounced: Date;
  risingStarsAnnounced: Date;
  celebrityAnnounced: Date;
  dunkContestAnnounced: Date;
  threePointAnnounced: Date;
  shootingStarsAnnounced: Date;
  skillsChallengeAnnounced: Date;
  horseAnnounced: Date;
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
  if (leagueStats?.uiMode === 'pba_isolated') {
    const shift = (base: Date, days: number) => {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + days);
      return d;
    };
    const savedFriday = leagueStats.pbaAllStarWeekendStart
      ? new Date(`${leagueStats.pbaAllStarWeekendStart.slice(0, 10)}T00:00:00.000Z`)
      : null;
    const friday = savedFriday && !Number.isNaN(savedFriday.getTime())
      ? savedFriday
      : new Date(`${getPbaAllStarWeekendStartIso(year)}T00:00:00.000Z`);
    const saturday = shift(friday, 1);
    const sunday = shift(friday, 2);
    return {
      votingStart: shift(friday, -14),
      votingEnd: shift(friday, -7),
      startersAnnounced: shift(friday, -6),
      reservesAnnounced: shift(friday, -5),
      risingStarsAnnounced: shift(friday, -5),
      celebrityAnnounced: shift(friday, -5),
      dunkContestAnnounced: shift(friday, -3),
      threePointAnnounced: shift(friday, -3),
      shootingStarsAnnounced: shift(friday, -3),
      skillsChallengeAnnounced: shift(friday, -3),
      horseAnnounced: shift(friday, -3),
      throneSignupOpens: shift(friday, -14),
      throneSignupCloses: shift(friday, -7),
      throneVotingOpens: shift(friday, -6),
      throneFieldReveal: shift(friday, -3),
      breakStart: friday,
      risingStars: friday,
      celebrityGame: friday,
      saturday,
      allStarGame: sunday,
      breakEnd: shift(sunday, 1),
      regularResumes: shift(sunday, 2),
    };
  }
  const shift = (base: Date, days: number) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + days);
    return d;
  };
  const configuredCalendar = leagueStats?.leagueCalendar || leagueStats?.uiMode === 'wnba_isolated'
    ? getLeagueCalendar(leagueStats as any)
    : undefined;
  const allStarGame = configuredCalendar?.allStarGame
    ? leagueCalendarDate(year, configuredCalendar.allStarGame)
    : getAllStarSunday(year);
  const friday = shift(allStarGame, -2);
  const saturday = shift(allStarGame, -1);
  const breakStart = configuredCalendar?.allStarStart
    ? leagueCalendarDate(year, configuredCalendar.allStarStart)
    : shift(allStarGame, -3);
  const breakEnd = configuredCalendar?.allStarEnd
    ? leagueCalendarDate(year, configuredCalendar.allStarEnd)
    : shift(allStarGame, 1);
  const regularResumes = shift(breakEnd, 1);
  const announcementDate = (key: NbaAnnouncementDateKey, fallback: Date) => configuredCalendar
    ? fallback
    : getNbaAnnouncementDate(year, key, fallback);
  const startersAnnounced = announcementDate('startersAnnounced', shift(allStarGame, -25));
  const reservesAnnounced = announcementDate('reservesAnnounced', shift(allStarGame, -18));
  const celebrityAnnounced = announcementDate('celebrityAnnounced', shift(allStarGame, -18));
  const risingStarsAnnounced = announcementDate('risingStarsAnnounced', shift(allStarGame, -11));
  const dunkContestAnnounced = announcementDate('dunkContestAnnounced', shift(allStarGame, -10));
  const threePointAnnounced = announcementDate('threePointAnnounced', shift(allStarGame, -9));
  const shootingStarsAnnounced = announcementDate('shootingStarsAnnounced', shift(allStarGame, -6));
  const skillsChallengeAnnounced = announcementDate('skillsChallengeAnnounced', shift(allStarGame, -5));
  const horseAnnounced = announcementDate('horseAnnounced', shift(allStarGame, -4));
  const votingStart = announcementDate(
    'votingStart',
    configuredCalendar ? shift(allStarGame, -53) : resolveSeasonDate(year, 12, 3, 'Mon', -1),
  );
  const votingEnd = announcementDate('votingEnd', shift(startersAnnounced, -7));
  const throneSignupOpens = configuredCalendar ? shift(allStarGame, -76) : new Date(Date.UTC(year - 1, 11, 1));
  const throneSignupCloses = configuredCalendar ? shift(allStarGame, -32) : new Date(Date.UTC(year, 0, 15));
  const throneVotingOpens = configuredCalendar ? shift(allStarGame, -31) : new Date(Date.UTC(year, 0, 16));
  const throneFieldReveal = configuredCalendar ? shift(allStarGame, -17) : new Date(Date.UTC(year, 0, 30));

  return {
    votingStart,
    votingEnd,
    startersAnnounced,
    reservesAnnounced,
    risingStarsAnnounced,
    celebrityAnnounced,
    dunkContestAnnounced,
    threePointAnnounced,
    shootingStarsAnnounced,
    skillsChallengeAnnounced,
    horseAnnounced,
    throneSignupOpens,
    throneSignupCloses,
    throneVotingOpens,
    throneFieldReveal,
    breakStart,
    risingStars: friday,
    celebrityGame: friday,
    saturday,
    allStarGame,
    breakEnd,
    regularResumes,
  };
}

export const ALL_STAR_DATES = getAllStarWeekendDates(2026);

export function getBreakWindowStrings(year: number, leagueStats?: { uiMode?: string | null; leagueCalendar?: LeagueCalendar }): { breakStart: string; breakEnd: string; regularResumes: string } {
  const dates = getAllStarWeekendDates(year, leagueStats);
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

const captainName = (roster: any[], bucketKey: string): string | null => {
  const captain = roster?.find((r) => r.conference === bucketKey && r.isCaptain);
  return captain?.playerName ? String(captain.playerName) : null;
};

const captainTeamLogo = (roster: any[], bucketKey: string): string | null =>
  roster?.find((entry) => entry.conference === bucketKey && entry.isCaptain)?.teamLogoUrl ?? null;

const captainPortrait = (roster: any[], players: NBAPlayer[], bucketKey: string): string | null => {
  const playerId = roster?.find((entry) => entry.conference === bucketKey && entry.isCaptain)?.playerId;
  const player = players.find(candidate => candidate.internalId === playerId);
  return player ? getPlayerImage(player) ?? null : null;
};

export function buildBracketLayout(leagueStats: any, roster: any[] = [], players: NBAPlayer[] = []): BracketLayout {
  const format = leagueStats?.allStarFormat ?? 'east_vs_west';
  const teamCount = leagueStats?.allStarTeams ?? 2;
  const nbaEastLogo = leagueStats?.uiMode === 'nba'
    ? resolveNbaConferenceLogo('East', Number(leagueStats?.year))
    : undefined;
  const nbaWestLogo = leagueStats?.uiMode === 'nba'
    ? resolveNbaConferenceLogo('West', Number(leagueStats?.year))
    : undefined;

  if (format === 'east_vs_west' || format === 'blacks_vs_whites' || teamCount === 2) {
    const isCaptains = format === 'captains_draft';
    const isUsa = format === 'usa_vs_world';
    const legendCaptains = leagueStats?.allStarCaptainType === 'legend'
      ? resolveLegendCaptains(leagueStats?.allStarLegendCaptainIds, players)
      : [];
    const savedNames = leagueStats?.allStarCaptainType === 'legend' && Array.isArray(leagueStats?.allStarTeamNames)
      ? leagueStats.allStarTeamNames
      : [];
    const playerCaptainNameStyle = leagueStats?.allStarPlayerCaptainNameStyle
      ?? (leagueStats?.uiMode === 'pba_isolated' ? 'first_name' : 'last_name');
    const homeName = isCaptains
      ? savedNames[0] ?? getCaptainTeamNameFromFullName(
          legendCaptains[0]?.name ?? captainName(roster, 'East') ?? undefined,
          legendCaptains[0] ? 'last_name' : playerCaptainNameStyle,
          'Team A',
        )
      : isUsa ? 'Team USA' : 'Eastern All-Stars';
    const awayName = isCaptains
      ? savedNames[1] ?? getCaptainTeamNameFromFullName(
          legendCaptains[1]?.name ?? captainName(roster, 'West') ?? undefined,
          legendCaptains[1] ? 'last_name' : playerCaptainNameStyle,
          'Team B',
        )
      : isUsa ? 'Team World' : 'Western All-Stars';
    const homeAbbrev = isCaptains ? 'CAP1' : isUsa ? 'USA' : 'EAST';
    const awayAbbrev = isCaptains ? 'CAP2' : isUsa ? 'WORLD' : 'WEST';
    const pbaCaptains = leagueStats?.uiMode === 'pba_isolated' && isCaptains;
    return {
      format,
      teamCount: 2,
      teams: [
        { tid: -1, bucketKey: 'East', name: homeName, abbrev: homeAbbrev, logoUrl: legendCaptains[0]?.imgURL ?? (isCaptains ? captainPortrait(roster, players, 'East') ?? (pbaCaptains ? captainTeamLogo(roster, 'East') ?? '' : nbaEastLogo ?? ALL_STAR_WEEKEND_LOGOS.east) : isUsa ? ALL_STAR_WEEKEND_LOGOS.usa : nbaEastLogo ?? ALL_STAR_WEEKEND_LOGOS.east) },
        { tid: -2, bucketKey: 'West', name: awayName, abbrev: awayAbbrev, logoUrl: legendCaptains[1]?.imgURL ?? (isCaptains ? captainPortrait(roster, players, 'West') ?? (pbaCaptains ? captainTeamLogo(roster, 'West') ?? '' : nbaWestLogo ?? ALL_STAR_WEEKEND_LOGOS.west) : isUsa ? ALL_STAR_WEEKEND_LOGOS.world : nbaWestLogo ?? ALL_STAR_WEEKEND_LOGOS.west) },
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
      { tid: -1, bucketKey: 'East', name: 'Eastern All-Stars', abbrev: 'EAST', logoUrl: nbaEastLogo ?? ALL_STAR_WEEKEND_LOGOS.east },
      { tid: -2, bucketKey: 'West', name: 'Western All-Stars', abbrev: 'WEST', logoUrl: nbaWestLogo ?? ALL_STAR_WEEKEND_LOGOS.west },
    ],
    initialGames: [{ gid: 90001, homeTid: -1, awayTid: -2, round: 'final' }],
  };
}
