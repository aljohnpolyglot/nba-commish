import type { GameState, NBACupState, NonNBATeam } from '../../../types';
import { normalizeDate } from '../../../utils/helpers';
import { addGameDays, formatGameDateShort, getRolloverDate, toISODateString } from '../../../utils/dateUtils';
import { usesLegacyNbaCupState } from '../../../utils/ruleFlags';
import { generateSchedule } from '../../gameScheduler';
import { generateForCompetition, selectCompetitionTeamTids } from '../../competition/competitionScheduler';
import { dateForCompetitionSeason } from '../../competition/competitionSeasonState';
import { drawCupGroups } from '../../nbaCup/drawGroups';
import { injectCupGroupGames } from '../../nbaCup/scheduleInjector';
import { buildGlobalGameRecommendations } from '../../globalGamesRecommendations';
import { getTeamCountry } from '../../../utils/teamCountry';
import { getTeamFullName } from '../../../utils/teamNames';
import { buildInternationalShowcaseOpponents } from '../../externalLeague/internationalShowcase';
import { getLeagueCalendarDates } from '../../leagueCalendar';
import { tagScheduledCupGroupGames } from '../../competition/cup';
import { getSimulationSeed } from '../../saveIdentity';

export const autoGenerateSchedule = (state: GameState): Partial<GameState> => {
  const pbaIsolated = state.leagueStats?.uiMode === 'pba_isolated';
  const euroIsolated = state.leagueStats?.uiMode === 'euro_isolated';
  const year = state.leagueStats.year;
  const calendar = getLeagueCalendarDates(year, state.leagueStats);
  const seasonStart = calendar.preseasonStart?.toISOString().slice(0, 10)
    ?? calendar.regularSeasonStart.toISOString().slice(0, 10);
  const seasonEnd = pbaIsolated
    ? `${year}-06-30`
    : state.leagueStats.leagueCalendar
      ? calendar.rollover.toISOString().slice(0, 10)
      : toISODateString(getRolloverDate(year, state.leagueStats as any, state.schedule as any));
  const hasRegularSeason = state.schedule.some(
    g => (euroIsolated
          ? g.competitionId === state.euroPrimaryCompetitionId && (g.competitionPhase === 'group' || g.competitionPhase?.startsWith('r'))
          : !(g as any).competitionId)
         && !(g as any).isPreseason
         && !(g as any).isPlayoff
         && !(g as any).isPlayIn
         && !(g as any).isNBACup
         && !(g as any).isCupTBD
         && normalizeDate(g.date) >= seasonStart && normalizeDate(g.date) <= seasonEnd
  );
  if (hasRegularSeason) {
    if (usesLegacyNbaCupState(state.leagueStats) && state.nbaCup?.groups?.length) {
      const hasCupGames = state.schedule.some(g => (g as any).isNBACup);
      if (!hasCupGames) {
        console.log('[autoGenerateSchedule] Self-heal: schedule exists but no Cup games tagged → injecting now');
        const scheduledDates: Record<string, Set<number>> = {};
        for (const g of state.schedule as any[]) {
          const ds = String(g.date).split('T')[0];
          if (!scheduledDates[ds]) scheduledDates[ds] = new Set<number>();
          scheduledDates[ds].add(g.homeTid);
          scheduledDates[ds].add(g.awayTid);
        }
        const maxGid = Math.max(0, ...state.schedule.map(g => g.gid));
        const result = injectCupGroupGames([], maxGid + 1, state.nbaCup.groups, getSimulationSeed(state), year - 1, scheduledDates, {
          excludeFromRecord: true,
          cupStart: calendar.cupStart,
          cupFinal: calendar.cupFinal,
        });
        if (result.games.length > 0) {
          const merged = [...state.schedule, ...result.games].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
          return { schedule: merged };
        }
      }
    }
    const taggedSchedule = tagScheduledCupGroupGames(state.schedule, state.cupCompetitions, state.leagueStats.year);
    if (taggedSchedule !== state.schedule) return { schedule: taggedSchedule };
    return {};
  }

  const intlPreseasonGames = state.schedule.filter(
    g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100)
         && g.date >= seasonStart
  );
  let nbaCupPatch: NBACupState | undefined;
  const cupEnabled = usesLegacyNbaCupState(state.leagueStats);
  let cupGroups = cupEnabled ? (state.nbaCup?.groups ?? []) : [];
  if (cupEnabled && cupGroups.length === 0) {
    const prevStandings = state.teams.map(t => ({ tid: t.id, wins: t.wins, losses: t.losses }));
    cupGroups = drawCupGroups(state.teams, prevStandings, getSimulationSeed(state), state.leagueStats.year);
    nbaCupPatch = {
      year: state.leagueStats.year,
      status: 'group',
      groups: cupGroups,
      wildcards: { East: null, West: null },
      knockout: [],
    };
  }

  const generatedSchedule = generateSchedule(
    state.teams,
    state.christmasGames,
    state.globalGames,
    state.leagueStats.numGamesDiv ?? null,
    state.leagueStats.numGamesConf ?? null,
    state.leagueStats.mediaRights,
    state.leagueStats.year,
    cupGroups.length > 0 ? cupGroups : undefined,
    getSimulationSeed(state),
    state.leagueStats.gamesPerSeason ?? null,
    pbaIsolated ? undefined : state.leagueStats.leagueCalendar,
    pbaIsolated ? 'nba' : state.leagueStats.uiMode,
    pbaIsolated ? true : state.leagueStats.allStarGameEnabled !== false,
  );
  let schedule = generatedSchedule;
  if (pbaIsolated) {
    const maxExistingGid = Math.max(0, ...state.schedule.map(g => g.gid));
    const backgroundNbaGames = generatedSchedule.map((game, index) => ({
      ...game,
      gid: maxExistingGid + 1 + index,
    }));
    schedule = [...state.schedule, ...backgroundNbaGames].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.gid - b.gid,
    );
  } else if (state.activeCompetitions?.length) {
    const compGames = state.activeCompetitions.flatMap((spec, index) => {
      const teams = selectCompetitionTeamTids(spec, state).map(tid => ({ tid }));
      const start = new Date(dateForCompetitionSeason(spec, state.leagueStats.year, spec.seasonStart.month, spec.seasonStart.day));
      return generateForCompetition(spec, teams, start, 700_000 + index * 50_000);
    });
    schedule = [...schedule, ...compGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  if (!pbaIsolated && intlPreseasonGames.length > 0) {
    const maxGid = Math.max(0, ...schedule.map(g => g.gid));
    const renumbered = intlPreseasonGames.map((g, i) => ({ ...g, gid: maxGid + 1 + i }));
    schedule = [...schedule, ...renumbered].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }
  schedule = tagScheduledCupGroupGames(schedule, state.cupCompetitions, state.leagueStats.year);
  return nbaCupPatch ? { schedule, nbaCup: nbaCupPatch } : { schedule };
};

export interface InternationalPreseasonRecommendation {
  teamId: number;
  opponentId: number;
  opponentName?: string;
  showcasePlayerIds?: string[];
  date: string;
  city: string;
  country: string;
}

export const buildInternationalPreseasonRecommendations = (args: {
  teams: GameState['teams'];
  nonNBATeams: NonNBATeam[];
  players: GameState['players'];
  seasonYear: number;
  leagueStats?: GameState['leagueStats'];
  limit?: number;
}): InternationalPreseasonRecommendation[] => {
  const limit = Math.max(1, Math.min(5, args.limit ?? 5));
  const bestClubByLeague = new Map<string, ReturnType<typeof buildInternationalShowcaseOpponents>[number]>();
  for (const opponent of buildInternationalShowcaseOpponents(args.nonNBATeams, args.players, {
    excludedLeagues: ['WNBA'],
  })) {
    const league = String(opponent.team.league ?? '').trim();
    const existing = bestClubByLeague.get(league);
    if (!existing || opponent.strength > existing.strength) bestClubByLeague.set(league, opponent);
  }
  const opponents = [...bestClubByLeague.values()]
    .sort((left, right) => right.strength - left.strength || left.displayName.localeCompare(right.displayName))
    .slice(0, limit);
  const nbaTeams = [...args.teams]
    .sort((left, right) => Number(right.strength ?? 0) - Number(left.strength ?? 0) || getTeamFullName(left).localeCompare(getTeamFullName(right)))
    .slice(0, opponents.length);
  const calendar = getLeagueCalendarDates(args.seasonYear, args.leagueStats);
  const preseasonStart = calendar.preseasonStart ?? calendar.trainingCampStart ?? addGameDays(calendar.regularSeasonStart, -14);
  const preseasonEnd = calendar.preseasonEnd ?? addGameDays(calendar.regularSeasonStart, -1);
  return opponents.flatMap(({ team, displayName, showcasePlayerIds }, index) => {
    const nbaTeam = nbaTeams[index];
    if (!nbaTeam) return [];
    const proposedDate = addGameDays(preseasonStart, index * 2);
    return [{
      teamId: nbaTeam.id,
      opponentId: team.tid,
      opponentName: displayName,
      showcasePlayerIds,
      date: toISODateString(proposedDate <= preseasonEnd ? proposedDate : preseasonEnd),
      city: team.region || 'International City',
      country: getTeamCountry(team, { nonNBATeams: args.nonNBATeams }) || 'International',
    }];
  });
};

const buildInternationalPreseasonGmNotice = (
  state: GameState,
  games: readonly InternationalPreseasonRecommendation[],
) => {
  if (state.gameMode !== 'gm' || state.userTeamId == null) return undefined;
  const game = games.find(candidate => candidate.teamId === state.userTeamId);
  if (!game) return undefined;
  const team = state.teams.find(candidate => candidate.id === state.userTeamId);
  if (!team) return undefined;
  const id = `gm-international-preseason-${state.leagueStats.year}-${game.teamId}-${game.opponentId}-${game.date}`;
  if (state.inbox.some(email => email.id === id)) return undefined;
  const opponent = state.nonNBATeams.find(candidate => candidate.tid === game.opponentId);
  const opponentName = game.opponentName || (opponent ? getTeamFullName(opponent) : 'an international club');
  const venue = [game.city, game.country].filter(Boolean).join(', ');
  return {
    id,
    sender: 'League Office',
    senderRole: 'Basketball Operations',
    organization: state.leagueStats.leagueName || 'League Office',
    subject: 'International Preseason Schedule',
    body: `We're pleased to confirm that ${getTeamFullName(team)} will face ${opponentName} on ${formatGameDateShort(game.date)}${venue ? ` in ${venue}` : ''}. Travel and event information will be sent once finalized. Please contact Basketball Operations with any scheduling questions.`,
    read: false,
    replied: false,
    teamLogoUrl: team.logoUrl,
    date: formatGameDateShort(state.date),
  };
};

export const autoScheduleIntlPreseason = (state: GameState): Partial<GameState> => {
  if (
    state.leagueType === 'fictional'
    || state.leagueStats.uiMode === 'euro_isolated'
    || state.leagueStats.uiMode === 'pba_isolated'
  ) return {};
  const calendar = getLeagueCalendarDates(state.leagueStats.year, state.leagueStats);
  const seasonStart = toISODateString(calendar.preseasonStart ?? calendar.trainingCampStart ?? addGameDays(calendar.regularSeasonStart, -14));
  const existingIntl = state.schedule.filter(
    g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100)
       && g.date >= seasonStart
  );
  if (existingIntl.length > 0) {
    const existingRecommendations = existingIntl.flatMap(game => {
      const teamId = game.homeTid < 100 ? game.homeTid : game.awayTid;
      const opponentId = game.homeTid >= 100 ? game.homeTid : game.awayTid;
      const opponent = state.nonNBATeams.find(team => team.tid === opponentId);
      if (teamId < 0 || opponentId < 100) return [];
      return [{
        teamId,
        opponentId,
        opponentName: game.internationalShowcaseName || (opponent ? getTeamFullName(opponent) : undefined),
        showcasePlayerIds: game.internationalShowcasePlayerIds,
        date: toISODateString(new Date(game.date)),
        city: game.city || opponent?.region || 'International City',
        country: game.country || getTeamCountry(opponent, { nonNBATeams: state.nonNBATeams }) || 'International',
      }];
    });
    const notice = buildInternationalPreseasonGmNotice(state, existingRecommendations);
    return notice ? { inbox: [notice, ...state.inbox] } : {};
  }

  const nonNBATeams: NonNBATeam[] = state.nonNBATeams ?? [];
  if (nonNBATeams.length === 0) return {};

  let gid = Math.max(0, ...state.schedule.map(g => g.gid)) + 1;
  const makeGame = (recommendation: InternationalPreseasonRecommendation) => ({
    gid: gid++,
    homeTid: recommendation.teamId,
    awayTid: recommendation.opponentId,
    homeScore: 0,
    awayScore: 0,
    played: false,
    date: new Date(`${recommendation.date}T00:00:00Z`).toISOString(),
    isPreseason: true,
    internationalShowcaseName: recommendation.opponentName,
    internationalShowcasePlayerIds: recommendation.showcasePlayerIds,
    city: recommendation.city,
    country: recommendation.country,
  });
  const recommendations = buildInternationalPreseasonRecommendations({
    teams: state.teams,
    nonNBATeams,
    players: state.players,
    seasonYear: state.leagueStats.year,
    leagueStats: state.leagueStats,
  });
  const newGames = recommendations.map(makeGame);

  if (newGames.length === 0) return {};

  const schedule = [...state.schedule, ...newGames].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const notice = buildInternationalPreseasonGmNotice(state, recommendations);
  return notice ? { schedule, inbox: [notice, ...state.inbox] } : { schedule };
};

export const buildChristmasGameRecommendations = (
  teams: GameState['teams'],
): Array<{ homeTid: number; awayTid: number }> => {
  const east = [...teams]
    .filter(t => t.conference === 'East')
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
    .slice(0, 5);
  const west = [...teams]
    .filter(t => t.conference === 'West')
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
    .slice(0, 5);
  if (east.length > 0 && west.length > 0) return east.slice(0, 5).map((eTeam, i) => ({
    homeTid: i % 2 === 0 ? eTeam.id : west[i]?.id ?? eTeam.id,
    awayTid: i % 2 === 0 ? west[i]?.id ?? eTeam.id : eTeam.id,
  }));
  const ranked = [...teams].sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0)).slice(0, 10);
  return Array.from({ length: Math.floor(ranked.length / 2) }, (_, index) => ({
    awayTid: ranked[index * 2].id,
    homeTid: ranked[index * 2 + 1].id,
  }));
};

const buildChristmasGmNotice = (
  state: GameState,
  games: readonly { homeTid: number; awayTid: number }[],
) => {
  if (state.gameMode !== 'gm' || state.userTeamId == null) return undefined;
  const game = games.find(candidate => candidate.homeTid === state.userTeamId || candidate.awayTid === state.userTeamId);
  if (!game) return undefined;
  const team = state.teams.find(candidate => candidate.id === state.userTeamId);
  const opponent = state.teams.find(candidate => candidate.id === (
    game.homeTid === state.userTeamId ? game.awayTid : game.homeTid
  ));
  if (!team || !opponent) return undefined;
  const id = `gm-christmas-assignment-${state.leagueStats.year}-${game.homeTid}-${game.awayTid}`;
  if (state.inbox.some(email => email.id === id)) return undefined;
  return {
    id,
    sender: 'League Office',
    senderRole: 'Basketball Operations',
    organization: state.leagueStats.leagueName || 'League Office',
    subject: 'Christmas Day Schedule',
    body: `We're pleased to confirm that ${getTeamFullName(team)} has been selected to face ${getTeamFullName(opponent)} on Christmas Day. The game is scheduled for December 25. Broadcast and travel details will follow.`,
    read: false,
    replied: false,
    teamLogoUrl: team.logoUrl,
    date: formatGameDateShort(state.date),
  };
};

export const autoPickChristmasGames = (state: GameState): Partial<GameState> => {
  if (state.leagueStats.uiMode === 'wnba_isolated') return {};
  const christmasGames = state.christmasGames?.length
    ? state.christmasGames
    : buildChristmasGameRecommendations(state.teams);
  const notice = buildChristmasGmNotice(state, christmasGames);
  if (state.christmasGames?.length) return notice ? { inbox: [notice, ...state.inbox] } : {};
  return notice
    ? { christmasGames, inbox: [notice, ...state.inbox] }
    : { christmasGames };
};

export const autoPickGlobalGames = (state: GameState): Partial<GameState> => {
  if (state.leagueStats.globalGames !== true) return {};
  const existingGames = state.globalGames?.length ? state.globalGames : undefined;
  const calendar = existingGames ? undefined : getLeagueCalendarDates(state.leagueStats.year, state.leagueStats);
  const globalGames = existingGames ?? buildGlobalGameRecommendations({
    teams: state.teams,
    players: state.players,
    seasonYear: state.leagueStats.year,
    regularSeasonStart: toISODateString(calendar!.regularSeasonStart),
    regularSeasonEnd: toISODateString(calendar!.regularSeasonEnd),
    limit: 3,
  }).map(({ homeTid, awayTid, date, city, country }) => ({
      homeTid,
      awayTid,
      date,
      city,
      country,
  }));
  const game = state.gameMode === 'gm' && state.userTeamId != null
    ? globalGames.find(candidate => candidate.homeTid === state.userTeamId || candidate.awayTid === state.userTeamId)
    : undefined;
  const team = game ? state.teams.find(candidate => candidate.id === state.userTeamId) : undefined;
  const opponent = game ? state.teams.find(candidate => candidate.id === (
    game.homeTid === state.userTeamId ? game.awayTid : game.homeTid
  )) : undefined;
  const id = game ? `gm-global-games-${state.leagueStats.year}-${game.homeTid}-${game.awayTid}-${game.date}` : '';
  const notice = game && team && opponent && !state.inbox.some(email => email.id === id) ? {
    id,
    sender: 'League Office',
    senderRole: 'Basketball Operations',
    organization: state.leagueStats.leagueName || 'League Office',
    subject: 'Global Games Schedule',
    body: `We're pleased to confirm that ${getTeamFullName(team)} will face ${getTeamFullName(opponent)} on ${formatGameDateShort(game.date)} in ${game.city}, ${game.country} as part of this season's Global Games. Travel, venue and media details will follow.`,
    read: false,
    replied: false,
    teamLogoUrl: team.logoUrl,
    date: formatGameDateShort(state.date),
  } : undefined;
  if (existingGames) return notice ? { inbox: [notice, ...state.inbox] } : {};
  return notice ? { globalGames, inbox: [notice, ...state.inbox] } : { globalGames };
};
